// cards-scan/learn (SPEC-S/T-102c/AC-2) — CLI `pnpm cards:icons:learn
// <carpeta> [--sample 30] [--out <dir>]`: recorre los escaneos (sin OCR ⇒
// rápido y offline), extrae los íconos, muestrea con tope (round-robin por
// rol para no quedarse sin elemento/mazo/costos), agrupa por parecido y
// escribe `scan-reports/icons.html` para que el dueño etiquete cada grupo UNA
// vez y exporte `content/cards/icon-labels.json`. Núcleo puro testeable; CLI
// gated por invokedDirectly (patrón run.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { loadScanConfig } from './config.ts'
import { listImages } from './run.ts'
import { normalizeScan } from './image.ts'
import { segmentCard } from './segment.ts'
import { extractIcons, iconDistance, type CardIcons, type IconPatch } from './icons.ts'
import { groupIcons, renderIconsHtml, type SampledPatch } from './iconlearn.ts'
import { loadIconLabels } from './iclassify.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const USAGE = 'uso: pnpm cards:icons:learn <carpeta> [--sample 1-500] [--out <dir>]'

export interface LearnOptions {
  readonly input: string
  readonly outDir?: string | undefined
  readonly sample?: number | undefined
}

export interface LearnSummary {
  readonly ok: boolean
  readonly cards: number
  readonly errors: number
  readonly sampled: number
  readonly groups: number
  readonly htmlPath: string
  readonly lines: readonly string[]
}

export function parseLearnArgs(argv: readonly string[]): { ok: true; opts: LearnOptions } | { ok: false; error: string } {
  let input: string | undefined
  let outDir: string | undefined
  let sample = 30
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--sample' && next !== undefined) {
      const n = Number(next)
      if (!Number.isInteger(n) || n < 1 || n > 500) return { ok: false, error: `--sample inválido: ${next}` }
      sample = n
      i += 1
    } else if (arg === '--out' && next !== undefined) {
      outDir = next
      i += 1
    } else if (arg !== undefined && !arg.startsWith('--')) input = arg
    else return { ok: false, error: `argumento desconocido o incompleto: ${arg ?? ''}\n${USAGE}` }
  }
  if (input === undefined) return { ok: false, error: `falta la carpeta de entrada\n${USAGE}` }
  return { ok: true, opts: { input, outDir, sample } }
}

/** Miniatura del ícono (data URI) para icons.html. */
export async function iconThumb(png: Buffer, patch: IconPatch): Promise<string> {
  const out = await sharp(png)
    .extract({ left: patch.rect.x, top: patch.rect.y, width: patch.rect.w, height: patch.rect.h })
    .resize(72, 72, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  return `data:image/png;base64,${out.toString('base64')}`
}

/** Muestreo intercalado por ROL (elemento → costo → …), una pasada por pozo
 * por ciclo. SIN el pie: el mazo sale del nombre/ruta del escaneo (Q-081),
 * así que el dueño solo etiqueta encabezado y costos. */
function sampleOf(cards: readonly { file: string; icons: CardIcons; png: Buffer }[], limit: number): SampledPatch[] {
  const pools: SampledPatch[][] = [[], []] // elemento / costos
  for (const c of cards) {
    const mk = (p: IconPatch): SampledPatch => ({ file: basename(c.file), patch: p, thumb: '' })
    if (c.icons.element !== null) pools[0]?.push(mk(c.icons.element))
    for (const p of c.icons.costs.flat()) pools[1]?.push(mk(p))
  }
  const out: SampledPatch[] = []
  let added = true
  while (out.length < limit && added) {
    added = false
    for (const pool of pools) {
      if (out.length >= limit) break
      const p = pool.shift()
      if (p !== undefined) {
        out.push(p)
        added = true
      }
    }
  }
  return out
}

/** Núcleo testeable: aprende los íconos de una carpeta y escribe icons.html. */
export async function learnBatch(opts: LearnOptions): Promise<LearnSummary> {
  const cfg = loadScanConfig(repoRoot)
  const outDir = opts.outDir ?? join(repoRoot, cfg.reportDir)
  const htmlPath = join(outDir, 'icons.html')
  const lines: string[] = []
  const files = existsSync(opts.input) ? listImages(opts.input) : []
  if (files.length === 0) {
    return { ok: false, cards: 0, errors: 0, sampled: 0, groups: 0, htmlPath, lines: [`no se encontraron imágenes en ${opts.input}`] }
  }
  const cards: { file: string; icons: CardIcons; png: Buffer }[] = []
  let errors = 0
  for (const file of files) {
    try {
      const norm = await normalizeScan(readFileSync(file), cfg)
      if (!norm.ok) throw new Error(norm.error)
      const seg = await segmentCard(norm.png, cfg)
      if (!seg.ok) throw new Error(seg.error)
      cards.push({ file, icons: await extractIcons(norm.png, seg.segmentation, cfg), png: norm.png })
    } catch (e) {
      errors += 1
      lines.push(`error   ${basename(file)}: ${e instanceof Error ? e.message : 'error inesperado'}`)
    }
  }
  const limit = Math.max(1, opts.sample ?? 30)
  const muestra = sampleOf(cards, limit)
  // Miniaturas reales (necesitan el PNG normalizado de la carta de origen).
  const conThumb: SampledPatch[] = []
  for (const sp of muestra) {
    const card = cards.find((c) => basename(c.file) === sp.file)
    if (card === undefined) continue
    conThumb.push({ ...sp, thumb: await iconThumb(card.png, sp.patch) })
  }
  const groups = groupIcons(conThumb, cfg.icons.groupThreshold)
  // Pre-carga: etiquetas ya exportadas (icon-labels.json) aplicadas a los
  // grupos cuyo centroide queda dentro de la distancia máxima ⇒ el dueño
  // solo completa los grupos nuevos.
  const previas = loadIconLabels(repoRoot)
  const initial: Record<string, string> = {}
  let preetiquetados = 0
  if (previas !== null && previas.icons.length > 0) {
    for (const g of groups) {
      let best: string | null = null
      let bestD = cfg.icons.maxDistance
      for (const l of previas.icons) {
        const d = iconDistance(g.vector, l.vector)
        if (d < bestD) {
          bestD = d
          best = l.label
        }
      }
      if (best !== null) {
        initial[g.id] = best
        preetiquetados += 1
      }
    }
  }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(htmlPath, renderIconsHtml(groups, cfg.iconClasses, initial), 'utf8')
  lines.push(
    `resumen: ${cards.length} carta(s) · ${conThumb.length} ícono(s) muestreado(s) · ${groups.length} grupo(s) · ${errors} error(es)`,
    `pre-etiquetados: ${preetiquetados} de ${groups.length} grupo(s) con lo que ya exportaste`,
    `completá los grupos sin nombre en ${relative(repoRoot, htmlPath) || htmlPath} y re-exportá icon-labels.json a content/cards/`,
  )
  return { ok: groups.length > 0, cards: cards.length, errors, sampled: conThumb.length, groups: groups.length, htmlPath, lines }
}

async function cli(argv: readonly string[]): Promise<number> {
  const parsed = parseLearnArgs(argv)
  if (!parsed.ok) {
    console.error(`cards:icons:learn: ${parsed.error}`)
    return 2
  }
  const res = await learnBatch(parsed.opts)
  for (const line of res.lines) console.log(line)
  return res.ok ? 0 : 1
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  cli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(`cards:icons:learn: ${e instanceof Error ? e.message : 'error inesperado'}`)
      process.exitCode = 1
    },
  )
}
