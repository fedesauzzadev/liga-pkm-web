// mvp-checklist-lib (SPEC-N/T-093/AC-3): evaluación PURA del checklist de
// cierre visual del MVP — cada ítem verificable contra datos (dump de escena,
// placements.report.json, models-check.json, layout.json, tema). El driver
// e2e/t093-checklist.mjs junta los datos y escribe shots/mvp-checklist.{json,md}.
// AC-4: el cierre congela el aspecto (constante MVP_FREEZE_NOTE).
import type { PlacementsReportJson } from '../packages/content/src/placements-report.ts'

/** T-088/AC-2: tope de opacidad de las manchas translúcidas (mist/agua). */
export const MVP_MAX_STAIN_OPACITY = 0.12

/** Umbral de picada cenital (SPEC-M/T-085): por encima es cenital, no picada. */
export const MVP_CENITAL_PITCH_DEG = 70

/** Radio del círculo del nodo (T-089/AC-2) y gap mínimo edificio→nodo. */
export const MVP_NODE_GAP = 0.25
export const MVP_EDGE_GAP = 0.2
export const MVP_BUILDING_GAP = 0.2
export const MVP_PEDESTAL_GAP = 0.3

/** Tolerancia FP: el solver garantiza los gaps con ruido de redondeo (1e-6). */
const EPS = 1e-6

/** ¿`value` queda por debajo del mínimo (más allá del ruido de redondeo)? */
const below = (value: number, min: number): boolean => value < min - EPS

export const MVP_FREEZE_NOTE =
  'Aspecto del tablero CONGELADO (SPEC-N/T-093/AC-4): cualquier cambio visual posterior va como tarea nueva del backlog.'

export interface ChecklistLabel {
  readonly visible: boolean
  readonly reason: string
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
}

export interface ChecklistInput {
  readonly camera: { readonly mode: string; readonly pitchDeg: number } | null
  readonly labels: readonly ChecklistLabel[]
  readonly labeledNodeCount: number
  readonly viewport: { readonly width: number; readonly height: number }
  readonly dumpNames: readonly string[]
  readonly placements: PlacementsReportJson
  /** Solo los modelos NUEVOS (new:: de models:check, SPEC-N/T-091/AC-3); los
   * candidatos HGSS sin importar que fallan brillo son deuda conocida (Q-052). */
  readonly modelsCheck: { readonly ok: boolean; readonly total: number; readonly failed: number } | null
  readonly layout: { readonly diceY: number; readonly diceH: number; readonly turnY: number } | null
  readonly panelDiceVisible: boolean
  readonly theme: { readonly mistOpacity: number; readonly waterOpacity: number }
}

export interface ChecklistItem {
  readonly id: string
  readonly label: string
  /** null = manual: se verifica fuera del script (p. ej. `pnpm verify`). */
  readonly ok: boolean | null
  readonly manual: boolean
  readonly detail: string
}

export interface ChecklistResult {
  readonly ok: boolean
  readonly items: readonly ChecklistItem[]
}

const deg = (value: number): number => (value * Math.PI) / 180

/** ¿Mirando al cuadrante este del tablero (±90° de 0° = +x)? */
export const facesEast = (sideDeg: number): boolean => Math.cos(deg(sideDeg)) > 0

export function evaluateChecklist(input: ChecklistInput): ChecklistResult {
  const items: ChecklistItem[] = []

  // 1) Cámara en picada normal (no cenital): modo de juego y pitch por debajo
  // del umbral cenital (la vista cenital solo existe en la captura de revisión).
  const camera = input.camera
  const pitchOk = camera !== null && camera.pitchDeg < MVP_CENITAL_PITCH_DEG && camera.pitchDeg >= 15
  const modeOk = camera !== null && ['explore', 'overview', 'free'].includes(camera.mode)
  items.push({
    id: 'camera-picada',
    label: 'cámara en picada normal (no cenital)',
    ok: pitchOk && modeOk,
    manual: false,
    detail:
      camera === null
        ? 'sin cámara en el dump'
        : `modo ${camera.mode}, pitch ${camera.pitchDeg.toFixed(1)}° (cenital ≥ ${String(MVP_CENITAL_PITCH_DEG)}°)`,
  })

  // 2) Etiquetas completas: hay plan para cada nodo etiquetado y las visibles
  // quedan enteras dentro del viewport (T-088/AC-1).
  const countOk = input.labels.length === input.labeledNodeCount
  const cut = input.labels.find(
    (label) =>
      label.visible &&
      (label.box.x < 0 ||
        label.box.y < 0 ||
        label.box.x + label.box.w > input.viewport.width ||
        label.box.y + label.box.h > input.viewport.height),
  )
  items.push({
    id: 'etiquetas-completas',
    label: 'etiquetas completas y sin cortes',
    ok: countOk && cut === undefined,
    manual: false,
    detail:
      `${String(input.labels.length)}/${String(input.labeledNodeCount)} etiquetas` +
      (cut === undefined ? '' : `; una visible queda cortada (x ${cut.box.x.toFixed(0)}, y ${cut.box.y.toFixed(0)})`),
  })

  // 3) Sin manchas pixeladas: opacidades de mist/agua en el tope de T-088.
  const stainsOk =
    input.theme.mistOpacity <= MVP_MAX_STAIN_OPACITY && input.theme.waterOpacity <= MVP_MAX_STAIN_OPACITY
  items.push({
    id: 'sin-manchas',
    label: 'sin manchas translúcidas pixeladas',
    ok: stainsOk,
    manual: false,
    detail: `mist ${input.theme.mistOpacity.toFixed(2)} / agua ${input.theme.waterOpacity.toFixed(2)} (≤ ${String(MVP_MAX_STAIN_OPACITY)})`,
  })

  // 4) Edificios a los costados, sin tocar nodos/edges/otros (T-089/AC-2).
  const buildings = input.placements.buildings
  const discarded = buildings.filter((building) => building.discarded)
  const badGap = buildings.find(
    (building) =>
      !building.discarded &&
      (below(building.gaps.node, MVP_NODE_GAP) ||
        below(building.gaps.edge, MVP_EDGE_GAP) ||
        (building.gaps.building !== null && below(building.gaps.building, MVP_BUILDING_GAP)) ||
        (building.gaps.pedestal !== null && below(building.gaps.pedestal, MVP_PEDESTAL_GAP))),
  )
  items.push({
    id: 'edificios-costados',
    label: 'edificios a los costados sin tocar nodos ni caminos',
    ok: discarded.length === 0 && badGap === undefined,
    manual: false,
    detail:
      discarded.length > 0
        ? `descartados: ${discarded.map((building) => building.nodeId).join(', ')}`
        : badGap === undefined
          ? `${String(buildings.length)} edificios con gaps ≥ minGaps`
          : `${badGap.nodeId}: node ${badGap.gaps.node.toFixed(2)} / edge ${badGap.gaps.edge.toFixed(2)}`,
  })

  // 5) Sin pedestales de Ítem/Sorpresa (T-090/AC-1).
  const leftover = input.dumpNames.filter((name) => name === 'stack:item' || name === 'stack:sorpresa')
  items.push({
    id: 'sin-pedestales-sobrantes',
    label: 'sin pedestales de Ítem/Sorpresa',
    ok: leftover.length === 0,
    manual: false,
    detail: leftover.length === 0 ? 'sceneDump sin stacks item/sorpresa' : `presentes: ${leftover.join(', ')}`,
  })

  // 6) Liga al costado de su nodo, hacia el este (SPEC-N decisión 3).
  const liga = buildings.find((building) => building.nodeId === 'liga')
  const ligaOk = liga !== undefined && !liga.discarded && liga.dist >= 0.75 && facesEast(liga.sideDeg)
  items.push({
    id: 'liga-costado',
    label: 'Liga al costado este de su nodo',
    ok: ligaOk,
    manual: false,
    detail:
      liga === undefined
        ? 'sin fila de liga en placements.report.json'
        : `${liga.discarded ? 'DESCARTADA' : `sideDeg ${liga.sideDeg.toFixed(0)}°, dist ${liga.dist.toFixed(2)} u`}`,
  })

  // 7) Modelos nuevos sin negros (T-086/T-091: models:check).
  const models = input.modelsCheck
  items.push({
    id: 'modelos-sin-negros',
    label: 'modelos nuevos sin negros (models:check)',
    ok: models !== null && models.ok && models.failed === 0,
    manual: false,
    detail:
      models === null
        ? 'falta shots/models-check.json (corré pnpm models:check)'
        : `${String(models.total)} modelos nuevos, ${String(models.failed)} fallan`,
  })

  // 8) Dado fijo en su panel (T-092): panel-dice visible y encima de panel-turn.
  const layout = input.layout
  const layoutOk =
    input.panelDiceVisible && layout !== null && layout.diceY + layout.diceH <= layout.turnY + 0.005
  items.push({
    id: 'dado-en-panel',
    label: 'dado fijo en su panel del HUD',
    ok: layoutOk,
    manual: false,
    detail:
      layout === null
        ? 'faltan paneles dice/turn en layout.json'
        : `panel-dice ${input.panelDiceVisible ? 'visible' : 'AUSENTE'}, tope ${layout.diceY + layout.diceH} ≤ turn ${layout.turnY}`,
  })

  // 9) `pnpm verify` verde: manual — el checklist no puede correrse dentro de
  // verify (es e2e con browser); su resultado va al reporte de la tarea.
  items.push({
    id: 'pnpm-verify',
    label: '`pnpm verify` verde',
    ok: null,
    manual: true,
    detail: 'verificar corriendo `pnpm verify` (resultado registrado en tasks/reports/T-093.md)',
  })

  return { ok: items.every((item) => item.manual || item.ok === true), items }
}

/** Markdown del checklist para shots/mvp-checklist.md (dueño/jefe). */
export function renderChecklist(result: ChecklistResult): string {
  const lines: string[] = [
    '# Checklist de cierre visual del MVP (T-093)',
    '',
    `Estado: **${result.ok ? 'VERDE' : 'ROJO'}** (${String(result.items.filter((item) => item.ok === true).length)}/${String(result.items.length - result.items.filter((item) => item.manual).length)} ítems automáticos).`,
    '',
    ...result.items.map((item) => {
      const mark = item.manual ? '[-]' : item.ok === true ? '[x]' : '[ ]'
      return `- ${mark} **${item.id}** — ${item.label}: ${item.detail}`
    }),
    '',
    MVP_FREEZE_NOTE,
    '',
  ]
  return `${lines.join('\n')}\n`
}
