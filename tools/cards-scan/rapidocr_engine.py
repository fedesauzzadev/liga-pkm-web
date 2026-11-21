# Puente rapidocr para cards:eval (SPEC-T/T-103/AC-4). Offline y local:
# las dependencias viven en tools/requirements-ocr.txt (rapidocr-onnxruntime
# trae modelos PaddleOCR recortados vía ONNX). Protocolo: una linea base64
# (PNG/JPEG) por stdin => una linea JSON por stdout. Nunca muere: los errores
# se responden como {"ok": false, "error": ...}.
import base64
import json
import sys

import numpy as np


def decode(raw: bytes):
    import cv2

    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def main() -> None:
    engine = None  # inicializacion perezosa: el primer pedido paga la carga
    print(json.dumps({"ok": True, "ready": True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            img = decode(base64.b64decode(line))
            if img is None:
                raise ValueError("imagen ilegible")
            if engine is None:
                from rapidocr_onnxruntime import RapidOCR

                engine = RapidOCR()
            result, _ = engine(img)
            boxes = []
            for row in result or []:
                box, text, score = row[0], row[1], row[2]
                ys = [p[1] for p in box]
                xs = [p[0] for p in box]
                boxes.append(
                    {
                        "text": text,
                        "conf": float(score),
                        "x": min(xs),
                        "y": min(ys),
                        "h": max(ys) - min(ys),
                    }
                )
            print(json.dumps({"ok": True, "boxes": boxes}, ensure_ascii=False), flush=True)
        except Exception as e:  # noqa: BLE001 - el puente responde y sigue
            print(json.dumps({"ok": False, "error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
