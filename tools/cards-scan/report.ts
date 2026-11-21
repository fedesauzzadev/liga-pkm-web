// cards-scan/report (SPEC-S/T-102e/AC-2) — report.html AUTOCONTENIDO (sin
// servidor): hoja de contacto con la miniatura embebida (base64) de cada
// escaneo junto al resumen legible de la carta (nombre, HP, elemento,
// ataques con caras/daño/costo y efectos), marcas rojas donde hay needsReview
// o error, filtros todas/con revisión/con custom/con error, resumen
// estadístico al inicio y los textos custom agrupados y contados (T-102d).
// emitOutputs orquesta staging (T-102e/AC-1) + reporte al final del lote.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { countUnmatched, type UnmatchedGroup } from './effects.ts'
import { writeStagingFiles, type ReportRow, type StagingItem } from './staging.ts'
import type { Attack } from '../../packages/content/src/cards.ts'

export interface ReportStats {
  readonly total: number
  readonly valid: number
  readonly invalid: number
  readonly review: number
  readonly custom: number
  readonly errors: number
  readonly avgMs: number | null
  readonly unmatchedGroups: readonly UnmatchedGroup[]
  readonly repeats: readonly { readonly hash: string; readonly files: readonly string[] }[]
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const pct = (n: number, d: number): string => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`)

function attackLine(a: Attack): string {
  const faces = a.rollFaces.join('-')
  const dmg = `${a.damage.base}${a.damage.ifRoll !== undefined ? ` / ${a.damage.ifRoll.faces.join('-')}→${a.damage.ifRoll.damage}` : ''}`
  const ops = a.effects.map((e) => (e.op === 'custom' ? `custom(${esc(e.rawText ?? '')})` : e.op)).join(', ')
  return `<div class="atk">${esc(faces)} <b>${esc(a.name)}</b> ${esc(String(dmg))} [${esc(a.cost.join(' ') || '—')}]${a.canOpen === true ? ' ⏏' : ''}<span class="ops">${ops}</span><div class="raw">${esc(a.rawText)}</div></div>`
}

/** HTML puro del reporte (las miniaturas ya vienen embebidas en las filas). */
export function buildReportHtml(rows: readonly ReportRow[], stats: ReportStats): string {
  const filas = rows
    .map((r) => {
      const clases = ['row', r.needsReview ? 'r-review' : '', r.customCount > 0 ? 'r-custom' : '', r.status !== 'ok' ? 'r-error' : ''].filter(Boolean).join(' ')
      const marcas = [
        r.needsReview ? '<span class="badge mal">REVISAR</span>' : '',
        r.customCount > 0 ? `<span class="badge cus">custom ×${r.customCount}</span>` : '',
        r.status === 'error' ? '<span class="badge err">ERROR</span>' : '',
        r.status === 'invalid' ? '<span class="badge err">INCOMPLETA</span>' : '',
      ].join(' ')
      const c = r.card
      const cuerpo =
        c !== undefined
          ? `<div class="nom">${esc(c.name)} <small>#${c.dex} · HP ${c.hp} · ${esc(c.element)} · ${esc(c.deck)} · ${esc(c.stage)}</small></div>` +
            c.attacks.map((a) => attackLine(a)).join('') +
            (c.specialties.length > 0 ? `<div class="sp">especialidades: ${c.specialties.map((e) => esc(e.op)).join(', ')}</div>` : '') +
            (c.evolvesTo.length > 0 ? `<div class="evo">E: ${c.evolvesTo.map((e) => `${esc(e.id)} (${e.xp})`).join(', ')}</div>` : '')
          : `<div class="mal">${esc(r.error ?? (r.issues ?? []).join(' · ') ?? '')}</div>`
      const conf = `conf ${(r.confidence * 100).toFixed(0)}%${r.ms !== undefined ? ` · ${(r.ms / 1000).toFixed(1)}s` : ''}`
      const thumb = r.thumb !== undefined ? `<img src="${r.thumb}" alt="">` : '<div class="sinthumb">sin miniatura</div>'
      return `<div class="${clases}">${thumb}<div class="info"><div class="file">${esc(r.file)} ${marcas} <small>${conf}</small></div>${cuerpo}</div></div>`
    })
    .join('\n')
  const repetidas =
    stats.repeats.length > 0
      ? `<section><h2>Cartas repetidas (mismo contentHash — D-25)</h2><ul>${stats.repeats
          .map((g) => `<li><code>${esc(g.hash)}</code>: ${g.files.map(esc).join(' · ')}</li>`)
          .join('')}</ul></section>`
      : ''
  const customs =
    stats.unmatchedGroups.length > 0
      ? `<section id="customs"><h2>Textos sin patrón (${stats.unmatchedGroups.reduce((n, g) => n + g.count, 0)} en total — se agregan a effect-patterns.json, nunca primitivas nuevas)</h2><ul>${stats.unmatchedGroups
          .map((g) => `<li>×${g.count} <code>${esc(g.text)}</code></li>`)
          .join('')}</ul></section>`
      : '<section><h2>Textos sin patrón</h2><p>Ninguno: todos los efectos mapearon a patrones.</p></section>'
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lector de cartas — reporte</title><style>
:root{color-scheme:light}body{font:13px/1.45 system-ui;margin:0;padding:16px;background:#f6f4ee;color:#222}
h1,h2{font-size:15px;margin:0 0 8px}section{background:#fff;border:2px solid #222;border-radius:8px;padding:10px;margin:0 0 12px}
.stat{display:inline-block;background:#e8e4d8;border-radius:6px;padding:2px 8px;margin:2px;font-weight:600}
.filtros button{font:inherit;font-weight:700;border:2px solid #222;background:#fff;border-radius:6px;padding:4px 10px;margin-right:4px;cursor:pointer}
.row{display:flex;gap:10px;background:#fff;border:2px solid #222;border-radius:8px;padding:8px;margin:0 0 8px}
.row img,.sinthumb{width:96px;height:145px;object-fit:cover;border:1px solid #999;border-radius:4px;flex:none}
.sinthumb{display:flex;align-items:center;justify-content:center;color:#999;font-size:11px;background:#eee}
.file{font-weight:700;margin-bottom:4px}.file small{color:#666;font-weight:400}
.badge{border-radius:6px;padding:1px 6px;font-size:11px;margin-left:4px}
.mal{color:#b00020;font-weight:700}.badge.mal{background:#fde7ea;border:1px solid #b00020;color:#b00020}
.badge.cus{background:#fff3cd;border:1px solid #8a6d00;color:#8a6d00}.badge.err{background:#b00020;color:#fff}
.atk{margin:2px 0}.ops{color:#555;margin-left:6px}.raw{color:#777;font-size:11px;margin:1px 0 0}.sp,.evo{color:#444;margin-top:2px}
code{background:#f0efe9;padding:0 4px;border-radius:4px}
body[data-f="revision"] .row:not(.r-review){display:none}body[data-f="custom"] .row:not(.r-custom){display:none}
body[data-f="error"] .row:not(.r-error){display:none}
</style></head><body data-f="todas">
<h1>Lector de cartas escaneadas — reporte (SPEC-S/T-102e)</h1>
<section><div>
<span class="stat">${stats.total} escaneos</span>
<span class="stat">${stats.valid} válidas</span>
<span class="stat">${stats.invalid} incompletas</span>
<span class="stat">${stats.errors} con error</span>
<span class="stat">${stats.review} con revisión (${pct(stats.review, stats.total)})</span>
<span class="stat">${stats.custom} con custom</span>
<span class="stat">${stats.avgMs !== null ? `${(stats.avgMs / 1000).toFixed(1)} s/carta` : '— s/carta'}</span>
</div>
<p class="filtros" style="margin-top:8px">
<button data-f="todas">Todas</button><button data-f="revision">Con revisión</button><button data-f="custom">Con custom</button><button data-f="error">Con error</button>
</p></section>
${customs}${repetidas}
<div id="cartas">${filas}</div>
<script>
document.querySelectorAll('.filtros button').forEach(function(b){b.addEventListener('click',function(){document.body.dataset.f=b.dataset.f})})
</script>
</body></html>`
}

/** Miniatura JPEG embebida del PNG de debug (si existe). */
export async function makeThumb(debugPng: string): Promise<string | undefined> {
  if (!existsSync(debugPng)) return undefined
  const buf = await sharp(readFileSync(debugPng)).resize({ width: 150 }).jpeg({ quality: 60 }).toBuffer()
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

export interface EmitOptions {
  readonly outDir: string
  readonly stagingDir: string
  readonly items: readonly StagingItem[]
}

export interface EmitResult {
  readonly valid: number
  readonly invalid: number
  readonly errors: number
  readonly rows: number
  readonly reportPath: string
}

/** Staging + reporte al final del lote (lo llama scanBatch). */
export async function emitOutputs(o: EmitOptions): Promise<EmitResult> {
  const res = writeStagingFiles(o.stagingDir, o.items)
  const debugDir = join(o.outDir, 'debug')
  const rows = await Promise.all(
    res.rows.map(async (r): Promise<ReportRow> => ({ ...r, thumb: await makeThumb(join(debugDir, `${r.file.replace(/\.(jpe?g|png)$/i, '')}.png`)) })),
  )
  const ms = rows.flatMap((r) => (r.ms !== undefined ? [r.ms] : []))
  const porHash = new Map<string, string[]>()
  for (const r of rows) if (r.contentHash !== undefined) porHash.set(r.contentHash, [...(porHash.get(r.contentHash) ?? []), r.file])
  const stats: ReportStats = {
    total: rows.length,
    valid: res.valid,
    invalid: res.invalid,
    errors: res.errors,
    review: rows.filter((r) => r.needsReview).length,
    custom: rows.filter((r) => r.customCount > 0).length,
    avgMs: ms.length > 0 ? ms.reduce((a, b) => a + b, 0) / ms.length : null,
    unmatchedGroups: countUnmatched(rows.flatMap((r) => [...r.unmatched])),
    repeats: [...porHash.entries()].filter(([, fs]) => fs.length > 1).map(([hash, fs]) => ({ hash, files: fs })),
  }
  const reportPath = join(o.outDir, 'report.html')
  writeFileSync(reportPath, buildReportHtml(rows, stats), 'utf8')
  return { valid: res.valid, invalid: res.invalid, errors: res.errors, rows: rows.length, reportPath }
}
