// cards-scan/iconlearn (SPEC-S/T-102c/AC-2) — aprendizaje de íconos por
// AGRUPACIÓN: una muestra de íconos (vector 16×16 + color) se agrupa por
// parecido (centroide móvil, umbral de scan-config) y se renderiza
// `icons.html`, una página AUTOCONTENIDA donde el dueño pone nombre UNA sola
// vez por grupo (`iconClasses`) y el botón Exportar descarga
// `icon-labels.json` (centroides + etiquetas). Puro: sin IO.
import { iconDistance, type IconPatch, type IconRole } from './icons.ts'
import type { IconClassesConfig } from './config.ts'
import type { IconLabels } from './iclassify.ts'

export interface SampledPatch {
  readonly file: string
  readonly patch: IconPatch
  readonly thumb: string // data URI (PNG chico)
}

export interface IconExample {
  readonly file: string
  readonly role: IconRole
  readonly attackIndex: number | null
  readonly thumb: string
}

export interface IconGroup {
  readonly id: string
  readonly count: number
  readonly allGray: boolean
  readonly examples: readonly IconExample[]
  readonly vector: readonly number[]
}

interface Acc {
  sum: number[]
  count: number
  gray: number
  examples: IconExample[]
}

/**
 * Agrupa la muestra por parecido: cada ícono se suma al grupo cuyo centroide
 * esté a distancia < threshold; si no hay ninguno, abre un grupo nuevo. Los
 * círculos grises (= any, siempre) se agrupan APARTE de los íconos de color:
 * en los escaneos reales un aro gris y un disco de color pueden quedar a
 * distancia menor que el umbral y fundirse en un grupo. Determinista; los
 * ids se reasignan por tamaño (g1 = el grupo con más ejemplos).
 */
export function groupIcons(patches: readonly SampledPatch[], threshold: number, maxExamples = 8): IconGroup[] {
  const accs = cluster(patches.filter((sp) => !sp.patch.grayCircle), threshold, maxExamples).concat(
    cluster(patches.filter((sp) => sp.patch.grayCircle), threshold, maxExamples),
  )
  const sorted = [...accs].sort((a, b) => b.count - a.count || (a.examples[0]?.file ?? '').localeCompare(b.examples[0]?.file ?? '') || 0)
  return sorted.map((acc, i) => ({
    id: `g${i + 1}`,
    count: acc.count,
    allGray: acc.gray === acc.count,
    examples: acc.examples,
    vector: acc.sum.map((v) => v / acc.count),
  }))
}

function cluster(patches: readonly SampledPatch[], threshold: number, maxExamples: number): Acc[] {
  const accs: Acc[] = []
  for (const sp of patches) {
    let best: Acc | null = null
    let bestD = threshold
    for (const acc of accs) {
      const centroid = acc.sum.map((v) => v / acc.count)
      const d = iconDistance(sp.patch.vector, centroid)
      if (d < bestD) {
        bestD = d
        best = acc
      }
    }
    if (best === null) {
      accs.push({ sum: [...sp.patch.vector], count: 1, gray: sp.patch.grayCircle ? 1 : 0, examples: [exampleOf(sp)] })
      continue
    }
    sp.patch.vector.forEach((v, i) => {
      const cell = best.sum[i]
      if (cell !== undefined) best.sum[i] = cell + v
    })
    best.count += 1
    if (sp.patch.grayCircle) best.gray += 1
    if (best.examples.length < maxExamples) best.examples.push(exampleOf(sp))
  }
  return accs
}

function exampleOf(sp: SampledPatch): IconExample {
  return { file: sp.file, role: sp.patch.role, attackIndex: sp.patch.attackIndex, thumb: sp.thumb }
}

/** icon-labels.json: solo los grupos etiquetados ('' y 'otro' se excluyen). */
export function buildLabels(groups: readonly IconGroup[], labelsById: Readonly<Record<string, string>>): IconLabels {
  const icons = groups
    .map((g) => ({ g, label: labelsById[g.id] ?? '' }))
    .filter((x): x is { g: IconGroup; label: string } => x.label !== '' && x.label !== 'otro')
    .map((x) => ({ id: x.g.id, label: x.label, vector: x.g.vector }))
  return { version: 1, icons }
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const ROLE_ES: Record<IconRole, string> = { element: 'elemento (encabezado)', cost: 'costo (ataque)', deck: 'mazo (pie)' }

/** Página autocontenida: un desplegable por grupo + Exportar (icon-labels.json).
 * `initial` pre-carga etiquetas ya exportadas (el dueño solo completa lo nuevo). */
export function renderIconsHtml(groups: readonly IconGroup[], classes: IconClassesConfig, initial: Readonly<Record<string, string>> = {}): string {
  const opciones = [...new Set([...classes.costSlot, ...classes.element, ...classes.deck, 'otro'])]
  const vectores: Record<string, readonly number[]> = {}
  const bloques: string[] = []
  groups.forEach((g) => {
    vectores[g.id] = g.vector
    const previa = initial[g.id]
    const selected = previa !== undefined && previa !== '' ? previa : g.allGray ? 'any' : ''
    const opts = opciones
      .map((o) => `<option value="${esc(o)}"${o === selected ? ' selected' : ''}>${esc(o)}</option>`)
      .join('')
    const ejemplos = g.examples
      .map(
        (e) =>
          `<figure><img src="${esc(e.thumb)}" alt="ícono"/><figcaption>${esc(ROLE_ES[e.role])}${e.attackIndex !== null ? ` #${e.attackIndex + 1}` : ''}<br/>${esc(e.file)}</figcaption></figure>`,
      )
      .join('')
    bloques.push(
      `<section class="grupo"><h2>${esc(g.id)} <small>(${g.count} ícono(s)${g.allGray ? ', círculo gris' : ''}${previa !== undefined && previa !== '' ? `, pre-etiquetado: ${esc(previa)}` : ''})</small></h2>` +
        `<div class="ejemplos">${ejemplos}</div><label>Nombre: <select data-id="${esc(g.id)}"><option value="">— sin etiqueta —</option>${opts}</select></label></section>`,
    )
  })
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><title>Íconos aprendidos — lector de cartas</title>
<style>
 body{font-family:system-ui,sans-serif;margin:16px;background:#f6f4f8;color:#222}
 h1{font-size:1.3rem} .grupo{border:2px solid #444;border-radius:8px;padding:10px;margin:12px 0;background:#fff}
 .ejemplos{display:flex;flex-wrap:wrap;gap:10px} figure{margin:0;text-align:center}
 img{width:72px;height:72px;image-rendering:pixelated;background:#eee;border:1px solid #999}
 figcaption{font-size:.7rem;color:#555} select{font-size:1rem;padding:4px}
 button{font-size:1.1rem;padding:8px 16px;margin-top:8px}
 #res{margin-left:12px;font-weight:bold}
</style></head><body>
<h1>Íconos aprendidos por agrupación</h1>
<p>Poné nombre <strong>una sola vez</strong> a cada grupo (mirá el rol y de qué carta viene cada ejemplo). El círculo gris vacío ya arranca como <code>any</code> y lo que etiquetaste en corridas anteriores viene <strong>pre-cargado</strong> (marcado "pre-etiquetado"): solo completá los grupos sin nombre. "Exportar" descarga <code>icon-labels.json</code>: movelo a <code>content/cards/</code> y volvé a correr <code>pnpm cards:scan</code>. Los grupos "otro" o sin etiqueta no se exportan.</p>
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
  const icons = Object.entries(estado)
    .filter(([id, label]) => label !== '' && label !== 'otro' && VECTORES[id])
    .map(([id, label]) => ({ id, label, vector: VECTORES[id] }));
  const blob = new Blob([JSON.stringify({ version: 1, icons }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'icon-labels.json';
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('res').textContent = ' Exportados ' + icons.length + ' grupo(s) a icon-labels.json';
});
</script>
</body></html>`
}
