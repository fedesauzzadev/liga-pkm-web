// Tests T-093 (SPEC-N/T-093): cierre visual del MVP. Parte pura: nuevas
// capturas en el catálogo de `pnpm shots` con guía de 3 preguntas (AC-1/AC-2)
// y el checklist de cierre verificable + congelado del aspecto (AC-3/AC-4).
// Los drivers con navegador (e2e/t093-*) se validan con `pnpm shots` y
// `pnpm mvp:checklist`.
import { expect, test } from 'vitest'
import {
  CLOSE_SCENES,
  SCENE_GUIDE,
  SHOT_SCENES,
  type ShotScene,
} from '../tools/shots-lib.ts'
import {
  MVP_FREEZE_NOTE,
  evaluateChecklist,
  renderChecklist,
  type ChecklistInput,
} from '../tools/mvp-checklist-lib.ts'
import type { PlacementsReportJson } from '../packages/content/src/placements-report.ts'

// ── Fixtures ────────────────────────────────────────────────────────────────

const placementRow = (over: Partial<PlacementsReportJson['buildings'][number]>) => ({
  nodeId: 'fucsia',
  kind: 'gym',
  sideDeg: 36,
  dist: 1.0,
  x: 0,
  z: 0,
  yawDeg: 0,
  scale: 1,
  height: 0.9,
  gaps: { node: 0.3, edge: 0.25, building: 0.4, pedestal: null },
  discarded: false,
  decor: null,
  ...over,
})

const placementsOk: PlacementsReportJson = {
  buildings: [
    placementRow({ nodeId: 'canela', sideDeg: 165 }),
    placementRow({ nodeId: 'liga', kind: 'league', sideDeg: 11, dist: 1.3 }),
    placementRow({ nodeId: 'paleta', kind: 'house', sideDeg: 0 }),
  ],
  warnings: [],
}

const inputOk: ChecklistInput = {
  camera: { mode: 'explore', pitchDeg: 38 },
  labels: [
    { visible: true, reason: 'always', box: { x: 100, y: 20, w: 80, h: 18 } },
    { visible: false, reason: 'collision', box: { x: -50, y: 20, w: 80, h: 18 } },
  ],
  labeledNodeCount: 2,
  viewport: { width: 1280, height: 720 },
  dumpNames: ['node:paleta', 'stack:bosque', 'landmark:liga:league:0', 'token:p1'],
  placements: placementsOk,
  modelsCheck: { ok: true, total: 40, failed: 0 },
  layout: { diceY: 0.505, diceH: 0.14, turnY: 0.655 },
  panelDiceVisible: true,
  theme: { mistOpacity: 0.12, waterOpacity: 0.12 },
}

// AC: SPEC-N/T-093/AC-1 — `pnpm shots` agrega la captura de orientación del
// tablero (cenital, solo revisión) y las cuatro zonas del dueño, al catálogo.
test('AC-1 - catálogo con orientación cenital + 4 zonas del dueño', () => {
  expect(CLOSE_SCENES).toEqual([
    'board-orientation',
    'zone-oeste',
    'zone-sur',
    'zone-este',
    'zone-centro',
  ])
  for (const scene of CLOSE_SCENES) expect(SHOT_SCENES).toContain(scene)
})

// AC: SPEC-N/T-093/AC-2 — cada captura nueva tiene guía "qué mirar" con
// exactamente 3 preguntas (el README de shots/ se genera de acá).
test('AC-2 - guía con 3 preguntas por captura nueva', () => {
  for (const scene of CLOSE_SCENES) {
    const guide = SCENE_GUIDE[scene as Exclude<ShotScene, `models-${string}`>]
    expect(guide, `falta guía de ${scene}`).toBeDefined()
    expect(guide.questions).toHaveLength(3)
    for (const question of guide.questions) expect(question).toMatch(/\?$/)
  }
})

// AC: SPEC-N/T-093/AC-3 — el checklist aprueba el fixture que cumple todo.
test('AC-3 - checklist verde con el estado de cierre correcto', () => {
  const result = evaluateChecklist(inputOk)
  expect(result.items.map((item) => `${item.id}:${String(item.ok)}`).join('\n')).toContain(
    'camera-picada:true',
  )
  for (const item of result.items) {
    if (item.manual) continue
    expect(item.ok, `${item.id} — ${item.detail}`).toBe(true)
  }
  expect(result.ok).toBe(true)
})

// AC: SPEC-N/T-093/AC-3 — cada ítem del checklist detecta su defecto.
test('AC-3 - cada ítem del checklist detecta su fallo', () => {
  const cases: readonly [string, Partial<ChecklistInput>][] = [
    [
      'camera-picada',
      { camera: { mode: 'explore', pitchDeg: 89 } },
    ],
    [
      'etiquetas-completas',
      {
        labeledNodeCount: 3,
        labels: [
          ...inputOk.labels,
          { visible: true, reason: 'always', box: { x: 1260, y: 20, w: 80, h: 18 } },
        ],
      },
    ],
    [
      'sin-manchas',
      { theme: { mistOpacity: 0.8, waterOpacity: 0.12 } },
    ],
    [
      'edificios-costados',
      {
        placements: {
          ...placementsOk,
          buildings: [
            ...placementsOk.buildings.slice(0, 2),
            placementRow({ nodeId: 'verde', gaps: { node: 0.1, edge: 0.25, building: 0.4, pedestal: null } }),
          ],
        },
      },
    ],
    [
      'sin-pedestales-sobrantes',
      { dumpNames: [...inputOk.dumpNames, 'stack:sorpresa'] },
    ],
    [
      'liga-costado',
      {
        placements: {
          ...placementsOk,
          buildings: [
            placementsOk.buildings[0]!,
            placementRow({ nodeId: 'liga', kind: 'league', sideDeg: 190, dist: 1.3 }),
            placementsOk.buildings[2]!,
          ],
        },
      },
    ],
    ['modelos-sin-negros', { modelsCheck: { ok: false, total: 40, failed: 2 } }],
    ['dado-en-panel', { layout: { diceY: 0.7, diceH: 0.14, turnY: 0.655 } }],
    ['dado-en-panel', { panelDiceVisible: false }],
  ]
  for (const [id, patch] of cases) {
    const result = evaluateChecklist({ ...inputOk, ...patch })
    const item = result.items.find((candidate) => candidate.id === id)
    expect(item, id).toBeDefined()
    expect(item?.ok, `${id} debería fallar (${item?.detail})`).toBe(false)
    expect(result.ok).toBe(false)
  }
  // Un edificio descartado también rompe el cierre.
  const discarded = evaluateChecklist({
    ...inputOk,
    placements: {
      ...placementsOk,
      buildings: [
        placementsOk.buildings[0]!,
        placementRow({ nodeId: 'liga', kind: 'league', discarded: true }),
        placementsOk.buildings[2]!,
      ],
    },
  })
  expect(discarded.ok).toBe(false)
})

// AC: SPEC-N/T-093/AC-3 — `pnpm verify` queda como ítem manual explícito (el
// script no puede correrse a sí mismo; su resultado va al reporte de la tarea).
test('AC-3 - pnpm verify es ítem manual explícito del checklist', () => {
  const result = evaluateChecklist(inputOk)
  const verify = result.items.find((item) => item.id === 'pnpm-verify')
  expect(verify?.manual).toBe(true)
  expect(verify?.detail).toMatch(/pnpm verify/)
})

// AC: SPEC-N/T-093/AC-4 — el checklist congelado: el render declara que todo
// cambio visual posterior va como tarea nueva.
test('AC-4 - el render del checklist congela el aspecto del MVP', () => {
  const markdown = renderChecklist(evaluateChecklist(inputOk))
  expect(markdown).toContain(MVP_FREEZE_NOTE)
  expect(MVP_FREEZE_NOTE).toMatch(/tarea nueva/)
  expect(markdown).toMatch(/- \[x\] \*\*camera-picada\*\*/)
})
