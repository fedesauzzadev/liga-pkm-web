#!/usr/bin/env python3
"""crop_cards — T-042a (SPEC-F): recorte automático de cartas desde las fotos.

Herramienta OFFLINE (excepción Python aprobada en AGENTS.md para tools/).
Detecta cada carta (fondo claro sobre mesa oscura), corrige perspectiva/rotación
y guarda el recorte normalizado a 630x1000 en <out>/crops/<grupo>/<base>_<nn>.jpg
en orden de lectura (filas de arriba abajo, dentro de cada fila izquierda a
derecha). Compara el conteo con content/photo-manifest.csv (mensaje claro +
_debug/<base>.jpg con cajas numeradas si no coincide), deja una hoja de contacto
en <out>/contact/ y avisa si un recorte queda con menos de 500 px de ancho.

Uso:
  python tools/crop_cards.py <archivo|carpeta> [--out content/photos]
      [--manifest content/photo-manifest.csv] [--config tools/crop-config.json]
      [--grid FILASxCOLUMNAS] [--debug]
Requisitos: python -m pip install -r tools/requirements.txt
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import unicodedata
from pathlib import Path
from typing import TypedDict

import cv2
import numpy as np

CARD_W, CARD_H = 630, 1000  # salida normalizada (AC-1)
MIN_WARN_PX = 500  # aviso si el ancho de origen queda debajo (AC-6)
DARK_CELL = 60  # brillo por debajo: celda vacía (hueco de la grilla)
THUMB = (126, 200)  # miniatura de la hoja de contacto (AC-4)
IMAGE_RE = re.compile(r"\.(jpe?g|png|bmp|webp)$", re.IGNORECASE)
GRID_RE = re.compile(r"^(\d+)x(\d+)$")


class Params(TypedDict):
    """Parámetros de detección (defaults + overrides por archivo del config)."""

    grid: str | None  # "FILASxCOLUMNAS": grilla uniforme (AC-5)
    rows: list[int] | None  # cartas por fila, de arriba abajo (filas incompletas)
    frame: list[float] | None  # marco del bloque [x0,y0,x1,y1] en fracciones 0..1
    threshBias: int  # corre el umbral de Otsu para fondos difíciles
    minAreaFrac: float  # área mínima de carta como fracción de la foto
    aspectMin: float  # ancho/alto de carta ≈ 0.63; tolerancia por rotación
    aspectMax: float


DEFAULTS = Params(grid=None, rows=None, frame=None, threshBias=0, minAreaFrac=0.02,
                  aspectMin=0.45, aspectMax=0.85)


class Card(TypedDict):
    box: np.ndarray  # 4 esquinas tl, tr, br, bl
    conf: float


class ManifestEntry(TypedDict):
    archivo: str
    grupo: str
    esperadas: int | None


class PhotoEntry(TypedDict):
    photo: str
    group: str
    expected: int | None
    detected: int
    status: str
    cards: list[dict[str, object]]


def norm_name(name: str) -> str:
    """Clave de manifiesto/config: minúsculas, sin acentos, espacios→guiones."""
    s = unicodedata.normalize("NFD", name.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace(" ", "_")


# I/O unicode-safe (OpenCV en Windows no maneja ñ/acentos en rutas).
def imread_u(path: Path) -> np.ndarray | None:
    data = np.fromfile(str(path), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def imwrite_u(path: Path, img: np.ndarray, quality: int = 92) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError(f"crop_cards: no se pudo escribir {path}")
    buf.tofile(str(path))


def order_points(pts: np.ndarray) -> np.ndarray:
    """Ordena 4 puntos como tl, tr, br, bl (suma y diferencia de coordenadas)."""
    s = pts.sum(axis=1)
    d = pts[:, 1] - pts[:, 0]
    return np.array(
        [pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]],
        dtype=np.float32,
    )


def bright_mask(gray: np.ndarray, bias: int) -> np.ndarray:
    """Máscara binaria de las zonas claras (cartas) con umbral Otsu ± bias."""
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thr, _ = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    _, mask = cv2.threshold(blur, float(thr) + float(bias), 255, cv2.THRESH_BINARY)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))


def detect_cards(img: np.ndarray, params: Params) -> list[Card]:
    """Modo contornos (AC-1): cartas claras sobre fondo oscuro, filtradas por
    área y aspect-ratio de carta; la confianza es la rectangularidad."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = bright_mask(gray, params["threshBias"])
    img_area = float(img.shape[0] * img.shape[1])
    out: list[Card] = []
    for cont in cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
        if cv2.contourArea(cont) / img_area < params["minAreaFrac"]:
            continue
        rect = cv2.minAreaRect(cont)
        (rw, rh) = rect[1]
        if rw <= 0 or rh <= 0:
            continue
        w, h = min(rw, rh), max(rw, rh)
        if not (params["aspectMin"] <= w / h <= params["aspectMax"]):
            continue
        box = order_points(cv2.boxPoints(rect))
        out.append(Card(box=box, conf=round(min(1.0, cv2.contourArea(cont) / (rw * rh)), 3)))
    return out


def grid_cards(img: np.ndarray, rows: list[int], params: Params) -> list[Card]:
    """Modo grilla (AC-5): para cartas que se tocan o superponen (Gimnasios,
    Liga, mazos). Rebanada por filas declaradas (ej. [5,5,5,2] = 5+5+5+2 cartas
    de arriba abajo) sobre el marco configurado (default: foto completa). Una
    celda muy oscura se descarta (hueco real de la grilla)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    frame = params["frame"] or [0.0, 0.0, 1.0, 1.0]
    fx0, fy0 = float(frame[0]) * w, float(frame[1]) * h
    fx1, fy1 = float(frame[2]) * w, float(frame[3]) * h
    strip_h = (fy1 - fy0) / len(rows)
    out: list[Card] = []
    for i, count in enumerate(rows):
        ya, yb = fy0 + i * strip_h, fy0 + (i + 1) * strip_h
        cw = (fx1 - fx0) / count
        for j in range(count):
            xa, xb = fx0 + j * cw, fx0 + (j + 1) * cw
            box = np.array([[xa, ya], [xb, ya], [xb, yb], [xa, yb]], dtype=np.float32)
            m, n = int(cw * 0.2), int(strip_h * 0.2)
            roi = gray[int(ya + n): int(yb - n), int(xa + m): int(xb - m)]
            if roi.size == 0 or float(roi.mean()) < DARK_CELL:
                continue
            out.append(Card(box=box, conf=round(min(1.0, float(roi.mean()) / 230.0), 3)))
    return out


def reading_order(cards: list[Card]) -> list[Card]:
    """Orden de lectura: filas de arriba abajo (por centro Y), izquierda a
    derecha dentro de cada fila (AC-1)."""
    if len(cards) <= 1:
        return cards
    infos = [((float(c["box"][:, 0].mean()), float(c["box"][:, 1].mean())), c) for c in cards]
    heights = sorted(float(np.linalg.norm(c["box"][0] - c["box"][3])) for _, c in infos)
    row_tol = heights[len(heights) // 2] * 0.7
    infos.sort(key=lambda t: t[0][1])
    rows: list[list[tuple[tuple[float, float], Card]]] = [[infos[0]]]
    for item in infos[1:]:
        if item[0][1] - rows[-1][-1][0][1] < row_tol:
            rows[-1].append(item)
        else:
            rows.append([item])
    return [c for row in rows for _, c in sorted(row, key=lambda t: t[0][0])]


def warp_card(img: np.ndarray, box: np.ndarray) -> np.ndarray:
    src = np.asarray(box, dtype=np.float32)
    dst = np.array([[0, 0], [CARD_W, 0], [CARD_W, CARD_H], [0, CARD_H]], dtype=np.float32)
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (CARD_W, CARD_H))


def contact_sheet(files: list[tuple[Path, int]], cols: int, out_path: Path) -> None:
    """Hoja de contacto (AC-4): miniaturas numeradas en grilla."""
    tw, th = THUMB
    rows = math.ceil(len(files) / max(1, cols))
    sheet = np.full((rows * th, cols * tw, 3), 245, dtype=np.uint8)
    for i, (path, idx) in enumerate(files):
        thumb = cv2.resize(imread_u(path), THUMB, interpolation=cv2.INTER_AREA)
        r, c = divmod(i, cols)
        cv2.rectangle(thumb, (0, 0), (38, 24), (0, 0, 200), -1)
        cv2.putText(thumb, str(idx), (4, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        sheet[r * th: (r + 1) * th, c * tw: (c + 1) * tw] = thumb
    imwrite_u(out_path, sheet)


def debug_img(img: np.ndarray, cards: list[Card], out_path: Path) -> None:
    """Foto original con las cajas numeradas (AC-3)."""
    vis = img.copy()
    for i, card in enumerate(cards, 1):
        pts = np.asarray(card["box"], dtype=np.int32)
        cv2.polylines(vis, [pts], True, (0, 200, 0), 3)
        cv2.putText(vis, str(i), (int(pts[:, 0].min()), max(18, int(pts[:, 1].min()) - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
    imwrite_u(out_path, vis)


def to_int(v: object) -> int | None:
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def load_manifest(path: Path) -> dict[str, ManifestEntry]:
    entries: dict[str, ManifestEntry] = {}
    if not path.exists():
        return entries
    with path.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            key = norm_name(row.get("archivo") or "")
            if key:
                entries[key] = ManifestEntry(
                    archivo=row.get("archivo") or "",
                    grupo=(row.get("grupo") or "").strip() or "otros",
                    esperadas=to_int(row.get("cartas_esperadas")),
                )
    return entries


def parse_grid(s: object) -> list[int] | None:
    """"FILASxCOLUMNAS" → cartas por fila (grilla uniforme), ej. "4x5" → [5,5,5,5]."""
    if not isinstance(s, str):
        return None
    m = GRID_RE.match(s.strip().lower())
    return [int(m.group(2))] * int(m.group(1)) if m else None


def load_config(path: Path) -> dict[str, dict[str, object]]:
    if not path.exists():
        return {}
    cfg = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(cfg, dict):
        raise SystemExit(f"crop_cards: {path} debe ser un objeto por archivo")
    return {norm_name(k): v for k, v in cfg.items() if isinstance(v, dict)}


def process_photo(
    path: Path,
    params: Params,
    meta: ManifestEntry | None,
    out_root: Path,
    grid: list[int] | None,
    want_debug: bool,
) -> tuple[PhotoEntry, list[str]]:
    img = imread_u(path)
    if img is None:
        raise RuntimeError(f"crop_cards: no se pudo leer {path}")
    cards = grid_cards(img, grid, params) if grid else detect_cards(img, params)
    cards = reading_order(cards)

    group = meta["grupo"] if meta else "otros"
    base = path.stem
    crops_dir = out_root / "crops" / group
    entries: list[dict[str, object]] = []
    files: list[tuple[Path, int]] = []
    warnings: list[str] = []
    for i, card in enumerate(cards, 1):
        box = np.asarray(card["box"], dtype=np.float32)
        rel = f"{base}_{i:02d}.jpg"
        imwrite_u(crops_dir / rel, warp_card(img, box))
        src_w = (np.linalg.norm(box[1] - box[0]) + np.linalg.norm(box[2] - box[3])) / 2
        if src_w < MIN_WARN_PX:
            warnings.append(
                f"AVISO {group}/{rel}: ~{int(src_w)} px de ancho de origen (< {MIN_WARN_PX}); "
                "conviene re-fotografiar con más resolución"
            )
        entries.append(
            {
                "photo": path.name,
                "index": i,
                "polygon": [[round(float(x)), round(float(y))] for x, y in box],
                "confidence": card["conf"],
                "width": CARD_W,
                "height": CARD_H,
            }
        )
        files.append((crops_dir / rel, i))

    detected = len(cards)
    expected = meta["esperadas"] if meta else None
    status = "sin-manifest" if expected is None else ("ok" if detected == expected else "mismatch")
    if want_debug or status == "mismatch":
        debug_img(img, cards, out_root / "_debug" / f"{base}.jpg")
    if files:
        cols = max(grid) if grid else max(1, math.ceil(math.sqrt(len(files))))
        contact_sheet(files, cols, out_root / "contact" / f"{base}.jpg")
    return (
        PhotoEntry(photo=path.name, group=group, expected=expected, detected=detected,
                   status=status, cards=entries),
        warnings,
    )


def write_run_manifest(path: Path, manifest: dict[str, ManifestEntry], photos: dict[str, PhotoEntry]) -> None:
    rows: dict[str, dict[str, object]] = {
        key: {"archivo": m["archivo"], "grupo": m["grupo"], "esperadas": m["esperadas"],
              "detectadas": "", "estado": "pendiente"}
        for key, m in manifest.items()
    }
    for key, e in photos.items():
        rows[key] = {"archivo": e["photo"], "grupo": e["group"], "esperadas": e["expected"],
                     "detectadas": e["detected"], "estado": e["status"]}
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["archivo", "grupo", "esperadas", "detectadas", "estado"])
        w.writeheader()
        for key in sorted(rows):
            w.writerow(rows[key])


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:  # consolas Windows con codepage viejo: forzar UTF-8 tolerante
            stream.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    repo = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(prog="crop_cards", description="Recorte de cartas (T-042a)")
    ap.add_argument("target", help="archivo o carpeta de fotos")
    ap.add_argument("--out", default=str(repo / "content" / "photos"))
    ap.add_argument("--manifest", default=str(repo / "content" / "photo-manifest.csv"))
    ap.add_argument("--config", default=str(repo / "tools" / "crop-config.json"))
    ap.add_argument("--grid", help="fuerza grilla uniforme FILASxCOLUMNAS (cartas que se tocan)")
    ap.add_argument("--debug", action="store_true", help="deja _debug/<archivo>.jpg siempre")
    args = ap.parse_args(argv)

    target = Path(args.target)
    if target.is_dir():
        files = sorted(p for p in target.iterdir() if p.is_file() and IMAGE_RE.search(p.name))
    elif target.is_file():
        files = [target]
    else:
        print(f"crop_cards: no existe {target}", file=sys.stderr)
        return 2
    if not files:
        print(f"crop_cards: no hay fotos (jpg/png/bmp/webp) en {target}", file=sys.stderr)
        return 2

    manual_grid = parse_grid(args.grid) if args.grid else None
    if args.grid and manual_grid is None:
        print(f"crop_cards: --grid debe ser FILASxCOLUMNAS (ej. 4x5), no '{args.grid}'", file=sys.stderr)
        return 2

    out_root = Path(args.out)
    manifest = load_manifest(Path(args.manifest))
    config = load_config(Path(args.config))
    crops_path = out_root / "crops.json"
    photos: dict[str, PhotoEntry] = {}
    if crops_path.exists():
        loaded = json.loads(crops_path.read_text(encoding="utf-8"))
        if isinstance(loaded.get("photos"), dict):
            photos = loaded["photos"]

    exit_code = 0
    for path in files:
        key = norm_name(path.name)
        overrides = {k: v for k, v in config.get(key, {}).items() if k in DEFAULTS}
        params = Params(**{**DEFAULTS, **overrides})
        grid = manual_grid or parse_grid(params["grid"])
        if params["grid"] is not None and parse_grid(params["grid"]) is None:
            print(f"crop_cards: grid '{params['grid']}' de {args.config} debe ser FILASxCOLUMNAS",
                  file=sys.stderr)
            return 2
        rows_cfg = params["rows"]
        if rows_cfg is not None and (not rows_cfg or not all(isinstance(n, int) and n > 0 for n in rows_cfg)):
            print(f"crop_cards: rows de {args.config} debe ser cartas por fila, ej. [5,5,5,2]",
                  file=sys.stderr)
            return 2
        grid = grid or rows_cfg
        try:
            entry, warnings = process_photo(path, params, manifest.get(key), out_root, grid, args.debug)
        except RuntimeError as err:
            print(err, file=sys.stderr)
            exit_code = 1
            continue
        photos[key] = entry
        for wmsg in warnings:
            print(wmsg)
        line = f"{path.name}: {entry['detected']} carta(s) -> crops/{entry['group']}/"
        if entry["status"] == "mismatch":
            exit_code = 1
            line += (f" FALLO: el manifiesto espera {entry['expected']} — revisá "
                     f"_debug/{path.stem}.jpg con las cajas numeradas")
        elif entry["status"] == "sin-manifest":
            line += " (sin entrada en el manifiesto; conteo no verificado)"
        else:
            line += " OK (coincide con el manifiesto)"
        print(line)

    crops_path.write_text(
        json.dumps({"photos": {k: photos[k] for k in sorted(photos)}}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    write_run_manifest(out_root / "_manifest.csv", manifest, photos)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
