// cards-scan/ocr (SPEC-S/T-102b/AC-1) — OCR con tesseract.js (idioma spa,
// datos en caché local, descarga solo la primera vez). Cada región se lee por
// separado: nombre (línea), HP (solo dígitos), texto de cada bloque (bloque)
// y pie (línea, en dos franjas para esquivar el ícono del mazo). El motor es
// inyectable ⇒ los tests usan un motor falso y el golden usa el real si hay
// caché/red (si no, se omite).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createWorker, type PSM, type Worker } from 'tesseract.js'
import type { OcrConfig, ScanConfig } from './config.ts'
import type { Rect, Segmentation } from './segment.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export interface OcrRead {
  readonly text: string
  readonly confidence: number // 0-1
}

/** Palabra con su x (px de la imagen pasada al motor). */
export interface OcrWordRead {
  readonly text: string
  readonly x: number
}

/** Línea con palabras (para filtrar por columna, T-102e). */
export interface OcrLineRead {
  readonly confidence: number
  readonly words: readonly OcrWordRead[]
}

export interface OcrEngine {
  readonly recognize: (image: Buffer, psm: number, whitelist?: string) => Promise<OcrRead>
  /** Opcional (motor real): líneas con bboxes de palabras por línea. */
  readonly recognizeLines?: (image: Buffer, psm: number) => Promise<readonly OcrLineRead[]>
  readonly terminate: () => Promise<void>
}

/** Motor real: worker compartido, llamadas serializadas (setParameters+recognize). */
export async function createTesseractEngine(cfg: OcrConfig): Promise<OcrEngine> {
  const cachePath = join(repoRoot, cfg.cacheDir, 'tess')
  mkdirSync(cachePath, { recursive: true })
  const worker: Worker = await createWorker(cfg.lang, 1, { cachePath })
  let chain: Promise<unknown> = Promise.resolve()
  const run = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task)
    chain = next.catch(() => undefined)
    return next
  }
  return {
    recognize: (image, psm, whitelist) =>
      run(async () => {
        await worker.setParameters({
          tessedit_pageseg_mode: String(psm) as PSM,
          tessedit_char_whitelist: whitelist !== undefined && whitelist.length > 0 ? whitelist : '',
        })
        const { data } = await worker.recognize(image)
        return { text: String(data.text ?? ''), confidence: Math.max(0, Math.min(100, data.confidence)) / 100 }
      }),
    // T-102e: líneas con palabras (bbox x) para descartar la columna de daño
    // del texto de los bloques sin cortar palabras (la franja de texto llega
    // hasta ~74 % del ancho y el "(N)" de daño vive más a la derecha).
    recognizeLines: (image, psm) =>
      run(async () => {
        await worker.setParameters({ tessedit_pageseg_mode: String(psm) as PSM, tessedit_char_whitelist: '' })
        const { data } = await worker.recognize(image, {}, { blocks: true, text: true })
        const lines: OcrLineRead[] = []
        for (const blk of data.blocks ?? []) {
          for (const par of blk.paragraphs ?? []) {
            for (const ln of par.lines ?? []) {
              const words: OcrWordRead[] = []
              for (const w of ln.words ?? []) {
                if (typeof w.text === 'string' && typeof w.bbox?.x0 === 'number') words.push({ text: w.text, x: w.bbox.x0 })
              }
              if (words.length > 0) lines.push({ confidence: Math.max(0, Math.min(100, ln.confidence ?? 0)) / 100, words })
            }
          }
        }
        return lines
      }),
    terminate: async () => {
      await chain.catch(() => undefined)
      await worker.terminate()
    },
  }
}

export interface BlockOcr {
  readonly kind: 'specialty' | 'attack'
  readonly text: OcrRead
  readonly damage: OcrRead | null
  /** Rect del bloque (franja de texto) y de la columna de daño (T-103). */
  readonly rect: Rect
  readonly damageRect: Rect | null
}

export interface CardRegions {
  readonly name: OcrRead
  readonly hp: OcrRead
  readonly blocks: readonly BlockOcr[]
  readonly footerStage: OcrRead
  readonly footerRight: OcrRead
  /** Rects de las regiones leídas (para recortes de errores, T-103/AC-3). */
  readonly nameRect: Rect
  readonly hpRect: Rect
  readonly footerStageRect: Rect
  readonly footerRightRect: Rect
}

interface Region {
  left: number
  top: number
  width: number
  height: number
}

const FOOTER_THRESHOLD = 140 // calibrado con Dratini: la franja del pie es colorida

/** Region (left/top/width/height) → Rect (x/y/w/h) para los recortes. */
const toRect = (r: Region): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height })

/** Franja de texto del bloque al 90 % del ancho, 2× en grises (T-102e: el
 * texto llega hasta ~74 % del ancho de la carta; con 2× tesseract no corta
 * palabras y la columna de daño se descarta después por geometría). */
const TEXT_WIDTH = 0.9
const TEXT_SCALE = 2

async function cropText(png: Buffer, r: Region): Promise<Buffer> {
  return sharp(png)
    .extract(r)
    .resize(Math.round(r.width * TEXT_SCALE), Math.round(r.height * TEXT_SCALE))
    .grayscale()
    .png()
    .toBuffer()
}

/** "(N)" de la columna de daño: token de puros dígitos (con paréntesis o
 * puntuación suelta, p. ej. "(10)", "10)." — el OCR parte los paréntesis)
 * arrancando a la derecha del 68 % del ancho de la carta (los del texto de
 * efectos quedan a la izquierda; calibrado con Dratini: daño ≥ 75 %, texto
 * ≤ 63 %). */
function isDamageColumnWord(word: OcrWordRead, cropLeft: number, cardWidth: number): boolean {
  const cardX = cropLeft + word.x / TEXT_SCALE
  return cardX > cardWidth * 0.68 && /^\(?[0-9olISZOBb|!q]{1,3}[).,;]?$/.test(word.text.trim())
}

async function crop(png: Buffer, r: Region, prep: 'none' | 'gray' | 'thresh'): Promise<Buffer> {
  let img = sharp(png).extract(r)
  if (prep === 'gray') img = img.grayscale()
  if (prep === 'thresh') img = img.grayscale().normalise().threshold(FOOTER_THRESHOLD)
  return img.png().toBuffer()
}

/**
 * Lee las regiones de la carta normalizada (calibradas sobre el escaneo real
 * de Dratini): nombre x 5-76 % del ancho dentro del encabezado, HP círculo
 * x 76,6-87,4 % (grises + solo dígitos y paréntesis), texto del bloque x
 * hasta el 72 % + franja de daño x 72-87 %, pie en franja izquierda (etapa)
 * y derecha (evolución / ciudad del gimnasio), umbralizado porque es colorido.
 */
export async function readCardRegions(png: Buffer, seg: Segmentation, engine: OcrEngine, cfg: ScanConfig): Promise<CardRegions> {
  const w = cfg.width
  const h = cfg.height
  const headerBottom = seg.header.y + seg.header.h
  const nameRect: Region = {
    left: Math.round(w * 0.05),
    top: Math.max(0, seg.header.y + 2),
    width: Math.round(w * 0.71),
    height: Math.max(12, headerBottom - 4 - (seg.header.y + 2)),
  }
  const hpRect: Region = {
    left: Math.round(w * 0.7657),
    top: Math.round(h * 0.0245),
    width: Math.round(w * 0.1086),
    height: Math.round(h * 0.0755),
  }
  const name = await engine.recognize(await crop(png, nameRect, 'none'), cfg.ocr.psmLine)
  const hp = await engine.recognize(await crop(png, hpRect, 'gray'), cfg.ocr.psmLine, `${cfg.ocr.digitsWhitelist}()`)

  const blocks: BlockOcr[] = []
  for (const b of seg.blocks) {
    const r = b.rect
    const textRect: Region = {
      left: r.x + 6,
      top: r.y + 3,
      width: Math.max(10, Math.round(r.w * TEXT_WIDTH)),
      height: Math.max(10, r.h - 6),
    }
    let text: OcrRead
    const buf = await cropText(png, textRect)
    if (engine.recognizeLines !== undefined) {
      const lines = await engine.recognizeLines(buf, cfg.ocr.psmBlock)
      const kept = lines
        .map((ln) => ({ conf: ln.confidence, words: ln.words.filter((w) => !isDamageColumnWord(w, textRect.left, cfg.width)) }))
        .filter((ln) => ln.words.length > 0)
      if (kept.length > 0) {
        const conf = kept.reduce((a, ln) => a + ln.conf, 0) / kept.length
        text = { text: kept.map((ln) => ln.words.map((w) => w.text).join(' ')).join('\n') + '\n', confidence: conf }
      } else {
        text = await engine.recognize(buf, cfg.ocr.psmBlock)
      }
    } else {
      text = await engine.recognize(buf, cfg.ocr.psmBlock)
    }
    let damage: OcrRead | null = null
    let damageRect: Rect | null = null
    if (b.kind === 'attack') {
      const dmgRect: Region = {
        left: Math.round(w * 0.72),
        top: r.y + 2,
        width: Math.round(w * 0.15),
        height: Math.max(10, r.h - 4),
      }
      damage = await engine.recognize(await crop(png, dmgRect, 'none'), cfg.ocr.psmLine, `${cfg.ocr.digitsWhitelist}()`)
      damageRect = toRect(dmgRect)
    }
    blocks.push({ kind: b.kind, text, damage, rect: r, damageRect })
  }

  const footerTop = seg.footer.y + 3
  const footerH = Math.max(14, Math.min(50, seg.footer.h - 6))
  const stageRect: Region = { left: Math.round(w * 0.03), top: footerTop, width: Math.round(w * 0.37), height: footerH }
  const rightRect: Region = { left: Math.round(w * 0.52), top: footerTop, width: Math.round(w * 0.45), height: footerH }
  const footerStage = await engine.recognize(await crop(png, stageRect, 'thresh'), cfg.ocr.psmLine)
  const footerRight = await engine.recognize(await crop(png, rightRect, 'thresh'), cfg.ocr.psmLine)
  return {
    name, hp, blocks, footerStage, footerRight,
    nameRect: toRect(nameRect), hpRect: toRect(hpRect), footerStageRect: toRect(stageRect), footerRightRect: toRect(rightRect),
  }
}
