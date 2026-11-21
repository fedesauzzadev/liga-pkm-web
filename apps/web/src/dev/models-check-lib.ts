// models-check-lib (T-086/AC-4): métricas y veredicto puros del chequeo de
// brillo de modelos, + escritura del manifiesto (failed ⇒ pieza procedural).
// Sin DOM ni three: testeable en node; la página /dev/models-check los usa con
// los píxeles que lee del canvas WebGL (NO-VISION: medir, no mirar).

/** Imagen RGBA cruda (canvas WebGL / PNG decodificado). */
export interface RgbaImage {
  readonly data: ArrayLike<number>
  readonly width: number
  readonly height: number
}

/** Umbrales de SPEC-M/T-086/AC-4: brillo medio < 0,18 o oscuros > 35 % falla. */
export const MODEL_CHECK_THRESHOLDS = {
  minMeanBrightness: 0.18,
  maxDarkPixelShare: 0.35,
  darkLuma: 0.08,
  /** Píxeles del modelo exigidos sobre el total (anti "modelo invisible"). */
  minModelPixelShare: 0.002,
} as const

export interface ModelPixelMetrics {
  /** Cantidad de píxeles que no son fondo. */
  readonly modelPixels: number
  /** Brillo medio (luma 0..1) de los píxeles del modelo. */
  readonly meanBrightness: number
  /** Fracción (0..1) de píxeles del modelo con luma < umbral. */
  readonly darkShare: number
}

export interface ModelCheckVerdict {
  readonly ok: boolean
  readonly failures: readonly string[]
}

/** Luma BT.709 en 0..1 (NO-VISION §: mismos pesos que las métricas de shots). */
export function luma709(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

const maxChannelDiff = (
  data: ArrayLike<number>,
  at: number,
  bg: readonly [number, number, number],
): number => Math.max(
  Math.abs(data[at]! - bg[0]!),
  Math.abs(data[at + 1]! - bg[1]!),
  Math.abs(data[at + 2]! - bg[2]!),
)

/** Fondo real del canvas: promedio de las cuatro esquinas (3×3). Más confiable
 *  que el gris teórico: el renderer puede ajustarlo por espacio de color. */
export function estimateBackground(image: RgbaImage): [number, number, number] {
  const corners: readonly (readonly [number, number])[] = [[0, 0], [image.width - 3, 0], [0, image.height - 3], [image.width - 3, image.height - 3]]
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const [x0, y0] of corners) {
    for (let y = y0; y < y0 + 3; y += 1) {
      for (let x = x0; x < x0 + 3; x += 1) {
        const at = (y * image.width + x) * 4
        r += image.data[at]!
        g += image.data[at + 1]!
        b += image.data[at + 2]!
        n += 1
      }
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

/** AC-4: brillo medio y % de píxeles oscuros de los píxeles del modelo
 *  (los que se apartan del gris de fondo). `image` es RGBA crudo del canvas. */
export function modelPixelMetrics(
  image: RgbaImage,
  background: readonly [number, number, number] = estimateBackground(image),
): ModelPixelMetrics {
  const total = image.width * image.height
  let count = 0
  let brightnessSum = 0
  let dark = 0
  for (let index = 0; index < total; index += 1) {
    const at = index * 4
    if (maxChannelDiff(image.data, at, background) <= 8) continue
    const luma = luma709(image.data[at]!, image.data[at + 1]!, image.data[at + 2]!)
    count += 1
    brightnessSum += luma
    if (luma < MODEL_CHECK_THRESHOLDS.darkLuma) dark += 1
  }
  return {
    modelPixels: count,
    meanBrightness: count === 0 ? 0 : brightnessSum / count,
    darkShare: count === 0 ? 1 : dark / count,
  }
}

/** Veredicto AC-4: falla si no cargó, no se ve, brillo medio < 0,18 o
 *  los píxeles oscuros (< 0,08) superan el 35 % del modelo. */
export function modelCheckVerdict(
  metrics: ModelPixelMetrics,
  loaded: boolean,
  totalPixels: number,
  thresholds: typeof MODEL_CHECK_THRESHOLDS = MODEL_CHECK_THRESHOLDS,
): ModelCheckVerdict {
  const failures: string[] = []
  if (!loaded) failures.push('no-cargo')
  if (metrics.modelPixels / totalPixels < thresholds.minModelPixelShare) failures.push('sin-pixeles')
  if (loaded && metrics.meanBrightness < thresholds.minMeanBrightness) failures.push('brillo-medio-bajo')
  if (loaded && metrics.darkShare > thresholds.maxDarkPixelShare) failures.push('pixeles-oscuros')
  return { ok: failures.length === 0, failures }
}

export interface ModelCheckRecord {
  readonly key: string
  /** 'new' = modelos nuevos de SPEC-N/T-091. */
  readonly status: 'kenney' | 'hgss' | 'new'
  readonly file: string
  readonly loaded: boolean
  readonly metrics: ModelPixelMetrics
  readonly verdict: ModelCheckVerdict
  readonly failures: readonly string[]
}

/** Marca en el manifiesto los que fallan (status "failed" + failedFrom) y
 *  restaura los que vuelven a pasar. Puro: devuelve un manifiesto nuevo.
 *  T-091/AC-3: también escribe `newModels.<kind>` (failed ⇒ procedural). */
export function applyCheckToManifest<T extends {
  kinds: Record<string, { candidates: { pack: string; file: string; status: string; failedFrom?: string }[] }>
  hgss: Record<string, { files: { entry: string; status: string; failedFrom?: string }[] }>
  newModels?: Record<string, { file: string; status: string; failedFrom?: string }>
}>(manifest: T, results: readonly ModelCheckRecord[]): T {
  const clone = JSON.parse(JSON.stringify(manifest)) as T
  const byKey = new Map(results.map((result) => [result.key, result]))
  const apply = <E extends { status: string; failedFrom?: string }>(entry: E, key: string): void => {
    const result = byKey.get(key)
    if (result === undefined) return
    if (result.verdict.ok) {
      if (entry.status === 'failed') {
        entry.status = entry.failedFrom === 'proposed' ? 'proposed' : 'approved'
        delete entry.failedFrom
      }
      return
    }
    if (entry.status === 'approved' || entry.status === 'proposed') {
      entry.failedFrom = entry.status
      entry.status = 'failed'
    }
  }
  for (const group of Object.values(clone.kinds)) {
    for (const candidate of group.candidates) apply(candidate, `${candidate.pack}::${candidate.file}`)
  }
  for (const group of Object.values(clone.hgss)) {
    for (const file of group.files) apply(file, `hgss::${file.entry}`)
  }
  for (const [kind, entry] of Object.entries(clone.newModels ?? {})) apply(entry, `new::${kind}`)
  return clone
}
