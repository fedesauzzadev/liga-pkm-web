// AC: SPEC-H/T-068 (+ migración T-079/AC-1) — decor.json (piezas de decoración)
// valida con Zod y los chequeos cruzados atrapan kinds/tipos de landmark
// desconocidos. El look del mundo (world/ambient/zones.*.ground) migró a
// style.json: el esquema ya no lo acepta. El archivo real lo valida
// `pnpm content:validate` (collect) y board3d/decor.ts.
import { expect, test } from 'vitest'
import { crossCheckDecor, DecorSchema, type Decor } from './decor'

const validDecor = {
  palette: { baseGrass: '#8DBF6A', rock: '#8C8577' },
  zones: {
    isla: { panel: 'isla', margin: 0.5, scatter: [{ kind: 'pond', count: 1, seed: 31 }] },
  },
  budgets: { maxDrawCalls: 120, maxTriangles: 150000, maxModelsMB: 2 },
  clearance: { fromNodeCenter: 0.45, fromEdge: 0.3 },
} as const

test('AC: SPEC-H/T-068 - decor.json válido parsea con zonas (sin world/ambient/ground)', () => {
  const parsed = DecorSchema.safeParse(validDecor)
  expect(parsed.success).toBe(true)
  if (parsed.success) {
    expect(parsed.data.zones.isla?.panel).toBe('isla')
    expect('ground' in parsed.data.zones.isla!).toBe(false)
  }
})

// AC: SPEC-J/T-079/AC-1 - los bloques migrados a style.json se rechazan acá.
test('AC: SPEC-J/T-079/AC-1 - world/ambient/ground en decor.json se rechazan (migrados a style.json)', () => {
  const withWorld = DecorSchema.safeParse({
    ...validDecor,
    zones: { isla: { panel: 'isla', margin: 0.5, ground: '#7FB6E6' } },
    world: { size: [36, 36], segments: 120, seed: 2026, noiseAmplitude: 0.35, hills: { startRadius: 9, maxHeight: 1.4, seed: 3 }, flatten: { aroundNodes: 0.35, aroundEdges: 0.35, smooth: 0.3 } },
  })
  expect(withWorld.success).toBe(false)

  const withAmbient = DecorSchema.safeParse({
    ...validDecor,
    ambient: { backgroundTop: '#BFE3FF', backgroundBottom: '#EAF6FF', fog: { color: '#DDEFFF', near: 18, far: 42 }, clouds: { count: 5, height: 7, speed: 0.15, seed: 7 } },
  })
  expect(withAmbient.success).toBe(false)
})

test('AC: SPEC-H/T-068/AC-1 - kind desconocido en landmarks o scatter se rechaza claro', () => {
  const badLandmark = DecorSchema.safeParse({
    ...validDecor,
    landmarks: { byNodeId: { paleta: [{ kind: 'nave', offset: [0, 0] }] }, byNodeType: {} },
  })
  expect(badLandmark.success).toBe(false)
  if (!badLandmark.success) {
    expect(badLandmark.error.issues.map((issue) => issue.message).join(' ')).toContain('nave')
  }

  const badScatter = DecorSchema.safeParse({
    ...validDecor,
    zones: { isla: { panel: 'isla', margin: 0.5, scatter: [{ kind: 'ovni', count: 2, seed: 3 }] } },
  })
  expect(badScatter.success).toBe(false)
  if (!badScatter.success) {
    expect(badScatter.error.issues.map((issue) => issue.message).join(' ')).toContain('ovni')
  }
})

// AC: SPEC-H/T-068/AC-2 — byNodeType solo acepta tipos de nodo del tablero.
test('AC: SPEC-H/T-068/AC-2 - crossCheckDecor atrapa byNodeType con tipo inválido', () => {
  const decor = DecorSchema.parse({
    ...validDecor,
    landmarks: { byNodeId: {}, byNodeType: { centro: [{ kind: 'lamp', offset: [0, 0] }] } },
  }) as Decor
  expect(crossCheckDecor(decor)).toEqual([])

  const bad = structuredClone(decor)
  bad.landmarks = { byNodeId: {}, byNodeType: { centroide: [{ kind: 'lamp', offset: [0, 0] }] } }
  expect(crossCheckDecor(bad).join(' ')).toContain('centroide')
})
