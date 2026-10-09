// AC: SPEC-A/T-002 — esquemas, loaders y content:validate.
// Un test por AC del spec (AC-5 vive en packages/engine/src/index.test.ts).
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  checkOfficialMoves,
  countCustomEffects,
  crossCheckCards,
  validateContent,
  validatePokemonFile,
  type PokemonFileLoaded,
} from '../packages/content/src/validate.ts'

const atk = {
  id: 'placaje',
  name: 'Placaje',
  kind: 'attack',
  rollFaces: [1, 2],
  cost: [],
  element: 'normal',
  damage: { base: 10 },
  effects: [],
  rawText: '',
} as const

const card = (overrides: Record<string, unknown> = {}) => ({
  id: 'fixture',
  dex: 10,
  name: 'Fixture',
  stage: 'basic',
  deck: 'bosque',
  hp: 40,
  element: 'grass',
  attacks: [{ ...atk }],
  specialties: [],
  evolvesTo: [],
  source: { verified: false },
  ...overrides,
})

const loaded = (file: string, cards: unknown[], pending: string[] = []): PokemonFileLoaded => {
  const parsed = validatePokemonFile(file, { cards, pending })
  expect(parsed.schemaErrors, JSON.stringify(parsed.schemaErrors)).toEqual([])
  return { file, cards: parsed.cards ?? [], pending }
}

// AC: SPEC-A/AC-1 — el contenido real del repo (samples + ruleset + board) valida.
test('AC-1 content/pokemon/_samples.json y ruleset.classic.json validan', () => {
  const report = validateContent(join(process.cwd(), 'content'))
  expect(report.errors, report.errors.join('\n')).toEqual([])
  expect(report.ok).toBe(true)
  expect(report.stats.cards).toBeGreaterThanOrEqual(4)
  expect(report.stats.files).toBeGreaterThanOrEqual(3)
})

// AC: SPEC-A/AC-2 — op desconocido, rollFaces fuera de 1-6 o hp <= 0 fallan con ruta e id de carta.
test('AC-2 datos invalidos producen errores con ruta y id de carta', () => {
  const badOp = validatePokemonFile('content/pokemon/bad.json', {
    cards: [card({ id: 'malo', attacks: [{ ...atk, effects: [{ op: 'megaboom' }] }] })],
  })
  expect(badOp.schemaErrors.join('\n')).toContain('content/pokemon/bad.json#malo')
  expect(badOp.schemaErrors.join('\n')).toContain('megaboom')

  const badFaces = validatePokemonFile('content/pokemon/bad.json', {
    cards: [card({ id: 'caras', attacks: [{ ...atk, rollFaces: [0, 9] }] })],
  })
  expect(badFaces.schemaErrors.join('\n')).toContain('content/pokemon/bad.json#caras')
  expect(badFaces.schemaErrors.join('\n')).toContain('rollFaces')

  const badHp = validatePokemonFile('content/pokemon/bad.json', { cards: [card({ id: 'vida', hp: 0 })] })
  expect(badHp.schemaErrors.join('\n')).toContain('content/pokemon/bad.json#vida')
  expect(badHp.schemaErrors.join('\n')).toContain('hp')
})

// AC: SPEC-A/AC-3 — ids únicos; evolvesTo existe o está en pending; rollFaces sin solape.
test('AC-3 chequeos cruzados de cartas', () => {
  const dup = crossCheckCards([
    loaded('content/pokemon/a.json', [card({ id: 'repetido' })]),
    loaded('content/pokemon/b.json', [card({ id: 'repetido', dex: 11 })]),
  ])
  expect(dup.join('\n')).toContain('repetido')

  const missingEvo = crossCheckCards([
    loaded('content/pokemon/a.json', [card({ evolvesTo: [{ id: 'nobody', xp: 2 }] })]),
  ])
  expect(missingEvo.join('\n')).toContain('nobody')

  const withPending = crossCheckCards([
    loaded('content/pokemon/a.json', [card({ evolvesTo: [{ id: 'futuro', xp: 2 }] })], ['futuro']),
  ])
  expect(withPending).toEqual([])

  const overlap = crossCheckCards([
    loaded('content/pokemon/a.json', [
      card({ attacks: [{ ...atk }, { ...atk, id: 'otro', rollFaces: [2, 3] }] }),
    ]),
  ])
  expect(overlap.join('\n')).toContain('rollFaces')
})

// AC: SPEC-A/AC-4 — {op:'custom'} se permite y el validador reporta su conteo.
test('AC-4 op custom permitido y contado en stats', () => {
  const withCustom = validatePokemonFile('content/pokemon/c.json', {
    cards: [
      card({
        attacks: [{ ...atk, effects: [{ op: 'custom', handler: 'TODO_humo' }] }],
        specialties: [{ op: 'custom', handler: 'TODO_caparazon' }],
      }),
    ],
  })
  expect(withCustom.schemaErrors).toEqual([])
  expect(withCustom.cards).not.toBeNull()
  expect(countCustomEffects(withCustom.cards ?? [])).toBe(2)

  const report = validateContent(join(process.cwd(), 'content'))
  expect(report.stats.customEffects).toBeGreaterThanOrEqual(0)
})

// AC: SPEC-A/AC-6 — officialMove/officialMoveStatus/fx opcionales; moves.json activa chequeos.
test('AC-6 mapeos oficiales y fx', () => {
  const sinNada = validatePokemonFile('content/pokemon/d.json', { cards: [card()] })
  expect(sinNada.schemaErrors).toEqual([])

  const fxInvalido = validatePokemonFile('content/pokemon/d.json', {
    cards: [card({ attacks: [{ ...atk, fx: 'megallama' }] })],
  })
  expect(fxInvalido.schemaErrors.join('\n')).toContain('fx')

  const files: PokemonFileLoaded[] = [
    loaded('content/pokemon/e.json', [
      card({
        id: 'mapeado',
        attacks: [
          { ...atk, id: 'bien', officialMove: 'tackle', officialMoveStatus: 'verified', fx: 'contact' },
          { ...atk, id: 'roto', officialMove: 'no-existe', officialMoveStatus: 'proposed' },
          { ...atk, id: 'solo_fx', fx: 'flame' },
          { ...atk, id: 'nada' },
        ],
      }),
    ]),
  ]
  const moves = ['tackle', 'bubble']
  const { errors, warnings } = checkOfficialMoves(files, moves)
  expect(errors.join('\n')).toContain('no-existe')
  expect(errors.join('\n')).toContain('mapeado')
  expect(warnings.join('\n')).toContain('nada')
  expect(warnings.join('\n')).not.toContain('solo_fx')
  expect(warnings.join('\n')).not.toContain('/bien')
})
