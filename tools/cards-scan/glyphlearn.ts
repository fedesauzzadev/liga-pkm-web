// cards-scan/glyphlearn (SPEC-T/T-105/AC-2) — aprendizaje de glifos por
// AGRUPACIÓN: una muestra de glifos (vector 16×16 de tinta + aspecto +
// relleno) se agrupa por parecido (centroide móvil, umbral de scan-config) y
// se renderiza `glyphs.html`, una página AUTOCONTENIDA donde el dueño pone
// nombre UNA sola vez por grupo (`0`-`9`, `-`, `_`, `(`, `)`, `+`) y el botón
// Exportar descarga `glyph-labels.json` (centroides + etiquetas) para
// `content/cards/`. Núcleo puro; CLI gated por invokedDirectly (patrón run.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { loadScanConfig } from './config.ts'
import { listImages } from './run.ts'
import { normalizeScan } from './image.ts'
import { segmentCard } from './segment.ts'
import { parseFilename, profileOf, loadSpecies, resolveGroup } from './filename.ts'
import { extractGlyphs, glyphDistance, type CardGlyphs, type GlyphPatch, type GlyphRole } from './glyphs.ts'
import { GLYPH_CLASSES, loadGlyphLabels, type GlyphLabels } from './gclassify.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const USAGE = 'uso: pnpm cards:glyphs:learn <carpeta> [--sample 1-500] [--out <dir>]'

export interface SampledGlyph {
  readonly file: string
  readonly patch: GlyphPatch
  readonly thumb: string // data URI (PNG chico)
  /** Etiqueta conocida (solo para cartas sintéticas de test; el flujo real la deja vacía). */
  readonly known?: string | undefined
}

export interface GlyphExample {
  readonly file: string
  readonly role: GlyphRole
  readonly attackIndex: number | null
  readonly thumb: string
}

export interface GlyphGroup {
  readonly id: string
  readonly count: number
  readonly examples: readonly GlyphExample[]
  readonly vector: readonly number[]
}

interface Acc {
  sum: number[]
  count: number
  examples: GlyphExample[]
}

/**
 * Agrupa la muestra por parecido: cada glifo se suma al grupo cuyo centroide
 * esté a distancia < threshold; si no hay ninguno, abre un grupo nuevo.
 * Determinista; los ids se reasignan por tamaño (g1 = el grupo con más glifos).
 */
export function groupGlyphs(sample: readonly SampledGlyph[], threshold: number, maxExamples = 8): GlyphGroup[] {
  const accs: Acc[] = []
  for (const sp of sample) {
    let best: Acc | null = null
    let bestD = threshold
    for (const acc of accs) {
      const centroid = acc.sum.map((v) => v / acc.count)
      const d = glyphDistance(sp.patch.vector, centroid)
      if (d < bestD) {
        bestD = d
        best = acc
      }
    }
    if (best === null) {
      accs.push({ sum: [...sp.patch.vector], count: 1, examples: [{ file: sp.file, role: sp.patch.role, attackIndex: sp.patch.attackIndex, thumb: sp.thumb }] })
      continue
    }
    sp.patch.vector.forEach((v, i) => {
      const cell = best.sum[i]
      if (cell !== undefined) best.sum[i] = cell + v
    })
    best.count += 1
    if (best.examples.length < maxExamples) best.examples.push({ file: sp.file, role: sp.patch.role, attackIndex: sp.patch.attackIndex, thumb: sp.thumb })
  }
  const sorted = [...accs].sort((a, b) => b.count - a.count || (a.examples[0]?.file ?? '').localeCompare(b.examples[0]?.file ?? '') || 0)
  return sorted.map((acc, i) => ({ id: `g${i + 1}`, count: acc.count, examples: acc.examples, vector: acc.sum.map((v) => v / acc.count) }))
}

/** glyph-labels.json: solo los grupos etiquetados ('' y 'otro' se excluyen). */
export function buildGlyphLabels(groups: readonly GlyphGroup[], labelsById: Readonly<Record<string, string>>): GlyphLabels {
  const glyphs = groups
    .map((g) => ({ g, label: labelsById[g.id] ?? '' }))
    .filter((x): x is { g: GlyphGroup; label: string } => x.label !== '' && x.label !== 'otro')
    .map((x) => ({ id: x.g.id, label: x.label, vector: x.g.vector }))
  return { version: 1, glyphs }
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const ROLE_ES: Record<GlyphRole, string> = { hp: 'HP (círculo)', faces: 'caras (prefijo)', damage: 'daño (columna)' }

/** Página autocontenida: un desplegable por grupo + Exportar (glyph-labels.json).
 * `initial` pre-carga etiquetas ya exportadas (el dueño solo completa lo nuevo). */
export function renderGlyphsHtml(groups: readonly GlyphGroup[], initial: Readonly<Record<string, string>> = {}): string {
  const vectores: Record<string, readonly number[]> = {}
  const bloques: string[] = []
  groups.forEach((g) => {
    vectores[g.id] = g.vector
    const previa = initial[g.id]
    const selected = previa !== undefined && previa !== '' ? previa : ''
    const opts = [...GLYPH_CLASSES, 'otro']
      .map((o) => `<option value="${esc(o)}"${o === selected ? ' selected' : ''}>${esc(o)}</option>`)
      .join('')
    const ejemplos = g.examples
      .map(
        (e) =>
          `<figure><img src="${esc(e.thumb)}" alt="glifo"/><figcaption>${esc(ROLE_ES[e.role])}${e.attackIndex !== null ? ` #${e.attackIndex + 1}` : ''}<br/>${esc(e.file)}</figcaption></figure>`,
      )
      .join('')
    bloques.push(
      `<section class="grupo"><h2>${esc(g.id)} <small>(${g.count} glifo(s)${previa !== undefined && previa !== '' ? `, pre-etiquetado: ${esc(previa)}` : ''})</small></h2>` +
        `<div class="ejemplos">${ejemplos}</div><label>Carácter: <select data-id="${esc(g.id)}"><option value="">— sin etiqueta —</option>${opts}</select></label></section>`,
    )
  })
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><title>Glifos aprendidos — lector de cartas</title>
<style>
 body{font-family:system-ui,sans-serif;margin:16px;background:#f6f4f8;color:#222}
 h1{font-size:1.3rem} .grupo{border:2px solid #444;border-radius:8px;padding:10px;margin:12px 0;background:#fff}
 .ejemplos{display:flex;flex-wrap:wrap;gap:10px} figure{margin:0;text-align:center}
 img{width:64px;height:64px;image-rendering:pixelated;background:#eee;border:1px solid #999}
 figcaption{font-size:.7rem;color:#555} select{font-size:1.2rem;padding:4px}
 button{font-size:1.1rem;padding:8px 16px;margin-top:8px}
 #res{margin-left:12px;font-weight:bold}
</style></head><body>
<h1>Glifos aprendidos por agrupación</h1>
<p>Poné nombre <strong>una sola vez</strong> a cada grupo de glifos (mirá el rol y de qué carta viene cada ejemplo: números del HP, prefijo de caras \`4-5_\` y columna de daño \`(10)\`). Lo que etiquetaste en corridas anteriores viene <strong>pre-cargado</strong> (marcado "pre-etiquetado"): solo completá los grupos sin nombre. "Exportar" descarga <code>glyph-labels.json</code>: movelo a <code>content/cards/</code> y volvé a correr <code>pnpm cards:glyphs:check</code>. Los grupos "otro" o sin etiqueta no se exportan.</p>
${bloques.join('\n')}
<button id="exportar">Exportar</button><span id="res"></span>
<script>
const VECTORES = ${JSON.stringify(vectores)};
const estado = {};
document.querySelectorAll('select[data-id]').forEach((s) => {
  estado[s.dataset.id] = s.value;
  s.addEventListener('change', () => { estado[s.dataset.id] = s.value; });
});
document.getElementById('exportar').addEventListener('click', () => {
  const glyphs = Object.entries(estado)
    .filter(([id, label]) => label !== '' && label !== 'otro' && VECTORES[id])
    .map(([id, label]) => ({ id, label, vector: VECTORES[id] }));
  const blob = new Blob([JSON.stringify({ version: 1, glyphs }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'glyph-labels.json';
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('res').textContent = ' Exportados ' + glyphs.length + ' grupo(s) a glyph-labels.json';
});
</script>
</body></html>`
}

// --- CLI `pnpm cards:glyphs:learn` ------------------------------------------

export interface GlyphLearnOptions {
  readonly input: string
  readonly outDir?: string | undefined
  readonly sample?: number | undefined
}

export interface GlyphLearnSummary {
  readonly ok: boolean
  readonly cards: number
  readonly errors: number
  readonly sampled: number
  readonly groups: number
  readonly htmlPath: string
  readonly lines: readonly string[]
}

export function parseGlyphLearnArgs(argv: readonly string[]): { ok: true; opts: GlyphLearnOptions } | { ok: false; error: string } {
  let input: string | undefined
  let outDir: string | undefined
  let sample = 60
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

/** Miniatura del glifo (data URI) para glyphs.html. */
export async function glyphThumb(png: Buffer, patch: GlyphPatch): Promise<string> {
  const out = await sharp(png)
    .extract({ left: patch.rect.x, top: patch.rect.y, width: patch.rect.w, height: patch.rect.h })
    .resize(64, 64, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  return `data:image/png;base64,${out.toString('base64')}`
}

/** Muestreo intercalado por ROL (hp → caras → daño), una pasada por pozo por
 * ciclo, con tope. */
function sampleOf(cards: readonly { file: string; glyphs: CardGlyphs; png: Buffer }[], limit: number): SampledGlyph[] {
  const pools: SampledGlyph[][] = [[], [], []]
  for (const c of cards) {
    const mk = (p: GlyphPatch): SampledGlyph => ({ file: basename(c.file), patch: p, thumb: '' })
    for (const p of c.glyphs.hp) pools[0]?.push(mk(p))
    for (const a of c.glyphs.attacks) {
      for (const p of a.prefix) pools[1]?.push(mk(p))
      for (const p of a.damage) pools[2]?.push(mk(p))
    }
  }
  const out: SampledGlyph[] = []
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

/** Núcleo testeable: aprende los glifos de una carpeta y escribe glyphs.html. */
export async function glyphLearnBatch(opts: GlyphLearnOptions): Promise<GlyphLearnSummary> {
  const cfg = loadScanConfig(repoRoot)
  const outDir = opts.outDir ?? join(repoRoot, cfg.reportDir)
  const htmlPath = join(outDir, 'glyphs.html')
  const lines: string[] = []
  const files = existsSync(opts.input) ? listImages(opts.input) : []
  if (files.length === 0) {
    return { ok: false, cards: 0, errors: 0, sampled: 0, groups: 0, htmlPath, lines: [`no se encontraron imágenes en ${opts.input}`] }
  }
  const species = loadSpecies(repoRoot)
  const cards: { file: string; glyphs: CardGlyphs; png: Buffer }[] = []
  let errors = 0
  for (const file of files) {
    try {
      const norm = await normalizeScan(readFileSync(file), cfg)
      if (!norm.ok) throw new Error(norm.error)
      const fi = parseFilename(basename(file), species)
      const group = fi.group ?? resolveGroup(file, 'auto')
      const seg = await segmentCard(norm.png, cfg, profileOf(group))
      if (!seg.ok) throw new Error(seg.error)
      cards.push({ file, glyphs: await extractGlyphs(norm.png, seg.segmentation, cfg), png: norm.png })
    } catch (e) {
      errors += 1
      lines.push(`error   ${basename(file)}: ${e instanceof Error ? e.message : 'error inesperado'}`)
    }
  }
  const limit = Math.max(1, opts.sample ?? 60)
  const muestra = sampleOf(cards, limit)
  // Miniaturas reales (necesitan el PNG normalizado de la carta de origen).
  const conThumb: SampledGlyph[] = []
  for (const sp of muestra) {
    const card = cards.find((c) => basename(c.file) === sp.file)
    if (card === undefined) continue
    conThumb.push({ ...sp, thumb: await glyphThumb(card.png, sp.patch) })
  }
  const groups = groupGlyphs(conThumb, cfg.glyphs.groupThreshold)
  // Pre-carga: etiquetas ya exportadas (glyph-labels.json) aplicadas a los
  // grupos cuyo centroide queda dentro de la distancia máxima ⇒ el dueño
  // solo completa los grupos nuevos.
  const previas = loadGlyphLabels(repoRoot)
  const initial: Record<string, string> = {}
  let preetiquetados = 0
  if (previas !== null && previas.glyphs.length > 0) {
    for (const g of groups) {
      let best: string | null = null
      let bestD = cfg.glyphs.maxDistance
      for (const l of previas.glyphs) {
        const d = glyphDistance(g.vector, l.vector)
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
  writeFileSync(htmlPath, renderGlyphsHtml(groups, initial), 'utf8')
  lines.push(
    `resumen: ${cards.length} carta(s) · ${conThumb.length} glifo(s) muestreado(s) · ${groups.length} grupo(s) · ${errors} error(es)`,
    `pre-etiquetados: ${preetiquetados} de ${groups.length} grupo(s) con lo que ya exportaste`,
    `completá los grupos sin nombre en ${relative(repoRoot, htmlPath) || htmlPath} y re-exportá glyph-labels.json a content/cards/`,
  )
  return { ok: groups.length > 0, cards: cards.length, errors, sampled: conThumb.length, groups: groups.length, htmlPath, lines }
}

async function cli(argv: readonly string[]): Promise<number> {
  const parsed = parseGlyphLearnArgs(argv)
  if (!parsed.ok) {
    console.error(`cards:glyphs:learn: ${parsed.error}`)
    return 2
  }
  const res = await glyphLearnBatch(parsed.opts)
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
      console.error(`cards:glyphs:learn: ${e instanceof Error ? e.message : 'error inesperado'}`)
      process.exitCode = 1
    },
  )
}
