// cards-scan/evalengines (SPEC-T/T-103/AC-4) — motores a comparar sobre las
// MISMAS regiones: A) tesseract actual, B) tesseract con el preproceso de
// T-106 (×3 Lanczos + grises + umbral adaptativo local tipo Sauvola, que
// elimina el fondo degradado), C) rapidocr (modelos PaddleOCR vía ONNX, puente
// Python offline en tools/), D) paddleocr (solo si C no alcanza, SPEC-T).
// El preproceso es una función pura buffer→buffer testeable sin OCR.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import type { OcrEngineId } from './config.ts'
import type { OcrEngine, OcrLineRead, OcrRead } from './ocr.ts'

export interface EngineSpec {
  readonly id: OcrEngineId
  readonly label: string
  readonly note?: string | undefined
}

export const ENGINE_SPECS: readonly EngineSpec[] = [
  { id: 'tesseract', label: 'A) tesseract (actual)' },
  { id: 'tesseract-prep', label: 'B) tesseract + preproceso (T-106)' },
  { id: 'rapidocr', label: 'C) rapidocr (ONNX local)' },
  { id: 'paddleocr', label: 'D) paddleocr', note: 'se prueba solo si C no alcanza' },
]

export interface EngineRunResult {
  readonly id: OcrEngineId
  readonly label: string
  readonly available: boolean
  readonly note?: string | undefined
  readonly msPerCard: number | null
  readonly cards: number
  readonly fieldHits: number
  readonly fieldChecks: number
}

// --- preproceso (núcleo del de T-106, medido acá como motor B) -----------
const UP = 3
const SAUVOLA_K = 0.2
const SAUVOLA_R = 128

/** ×3 Lanczos + grises + Sauvola (umbral adaptativo local por ventanas con
 * imágenes integrales) ⇒ PNG binario (tinta 0 / fondo 255). */
export async function preprocessForOcr(image: Buffer): Promise<Buffer> {
  const meta = await sharp(image).metadata()
  const w = Math.round((meta.width ?? 0) * UP)
  const h = Math.round((meta.height ?? 0) * UP)
  const { data, info } = await sharp(image).grayscale().resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true })
  const width = info.width
  const height = info.height
  // Imágenes integrales (suma y suma de cuadrados) con padding de una fila/col.
  const sum = new Float64Array((width + 1) * (height + 1))
  const sq = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    let rowSq = 0
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x] ?? 0
      rowSum += v
      rowSq += v * v
      sum[(y + 1) * (width + 1) + (x + 1)] = sum[y * (width + 1) + (x + 1)]! + rowSum
      sq[(y + 1) * (width + 1) + (x + 1)] = sq[y * (width + 1) + (x + 1)]! + rowSq
    }
  }
  const r = Math.max(15, Math.round(Math.min(width, height) / 8)) | 1
  const out = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height - 1, y + r)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width - 1, x + r)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const w1 = width + 1
      const s = sum[(y1 + 1) * w1 + (x1 + 1)]! - sum[y0 * w1 + (x1 + 1)]! - sum[(y1 + 1) * w1 + x0]! + sum[y0 * w1 + x0]! 
      const s2 = sq[(y1 + 1) * w1 + (x1 + 1)]! - sq[y0 * w1 + (x1 + 1)]! - sq[(y1 + 1) * w1 + x0]! + sq[y0 * w1 + x0]!
      const mean = s / area
      const variance = Math.max(0, s2 / area - mean * mean)
      const t = mean * (1 + SAUVOLA_K * (Math.sqrt(variance) / SAUVOLA_R - 1))
      out[y * width + x] = (data[y * width + x] ?? 0) < t ? 0 : 255
    }
  }
  return sharp(out, { raw: { width, height, channels: 1 } }).png().toBuffer()
}

/** Motor B: mismas regiones, pero cada buffer pasa por el preproceso. */
export function withPreprocess(engine: OcrEngine): OcrEngine {
  return {
    recognize: (image, psm, whitelist) => preprocessForOcr(image).then((p) => engine.recognize(p, psm, whitelist)),
    ...(engine.recognizeLines !== undefined
      ? { recognizeLines: (image: Buffer, psm: number) => preprocessForOcr(image).then((p) => engine.recognizeLines!(p, psm)) }
      : {}),
    terminate: () => engine.terminate(),
  }
}

// --- rapidocr vía puente Python (stdin/stdout, una línea por pedido) ------
interface RapidBox {
  readonly text: string
  readonly conf: number
  readonly x: number
  readonly y: number
  readonly h: number
}

/** Crea el motor rapidocr (python + tools/cards-scan/rapidocr_engine.py).
 * Devuelve null si python o la librería no están disponibles. */
export function createRapidocrEngine(pythonCmd = 'python', script = ''): Promise<OcrEngine | null> {
  const scriptPath = script === '' ? fileURLToPath(new URL('./rapidocr_engine.py', import.meta.url)) : script
  return new Promise((resolve) => {
    const child = spawn(pythonCmd, ['-X', 'utf8', scriptPath], { stdio: ['pipe', 'pipe', 'ignore'] })
    let buf = ''
    let ready: ((v: OcrEngine | null) => void) | null = resolve
    child.on('error', () => {
      ready?.(null)
      ready = null
    })
    let pending: ((v: OcrRead | null) => void) | null = null
    let pendingLines: ((v: readonly OcrLineRead[]) => void) | null = null
    const onLine = (line: string): void => {
      let msg: unknown
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      const m = msg as { ok?: boolean; ready?: boolean; error?: string; boxes?: unknown }
      if (m.ready === true) {
        ready?.(makeEngine())
        ready = null
        return
      }
      if (m.ok !== true) {
        pending?.(null)
        pending = null
        pendingLines?.([])
        pendingLines = null
        return
      }
      const boxes = (Array.isArray(m.boxes) ? m.boxes : []) as unknown[]
      const parsed: RapidBox[] = []
      for (const b of boxes) {
        const r = b as Partial<RapidBox>
        if (typeof r.text === 'string' && typeof r.conf === 'number' && typeof r.x === 'number' && typeof r.y === 'number') {
          parsed.push({ text: r.text, conf: r.conf, x: r.x, y: r.y, h: typeof r.h === 'number' ? r.h : 10 })
        }
      }
      if (pendingLines !== null) {
        pendingLines(groupLines(parsed))
        pendingLines = null
        return
      }
      const sorted = [...parsed].sort((a, b) => a.y - b.y || a.x - b.x)
      const conf = sorted.length > 0 ? sorted.reduce((acc, b) => acc + b.conf, 0) / sorted.length : 0
      pending?.({ text: sorted.map((b) => b.text).join('\n'), confidence: Math.max(0, Math.min(1, conf)) })
      pending = null
    }
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let idx = buf.indexOf('\n')
      while (idx >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line.length > 0) onLine(line)
        idx = buf.indexOf('\n')
      }
    })
    const makeEngine = (): OcrEngine => ({
      recognize: (image) =>
        new Promise<OcrRead>((res) => {
          pending = (v) => res(v ?? { text: '', confidence: 0 })
          child.stdin.write(`${image.toString('base64')}\n`)
        }),
      recognizeLines: (image) =>
        new Promise<readonly OcrLineRead[]>((res) => {
          pendingLines = (v) => res(v ?? [])
          child.stdin.write(`${image.toString('base64')}\n`)
        }),
      terminate: () => {
        pending = null
        pendingLines = null
        child.kill()
        return Promise.resolve()
      },
    })
  })
}

/** Cajas → líneas (agrupa por solape vertical; palabras ordenadas por x). */
function groupLines(boxes: readonly RapidBox[]): OcrLineRead[] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: { maxY: number; items: RapidBox[] }[] = []
  for (const b of sorted) {
    const cur = lines[lines.length - 1]
    if (cur !== undefined && b.y < cur.maxY - 0.4 * b.h) {
      cur.items.push(b)
      cur.maxY = Math.max(cur.maxY, b.y + b.h)
    } else lines.push({ maxY: b.y + b.h, items: [b] })
  }
  return lines.map((ln) => ({
    confidence: ln.items.reduce((a, b) => a + b.conf, 0) / ln.items.length,
    words: [...ln.items].sort((a, b) => a.x - b.x).map((b) => ({ text: b.text, x: b.x })),
  }))
}
