// AC: SPEC-C/T-020/AC-4 — pipeline de daño exactamente como EFFECTS §2.5:
// base|ifRoll → +bonus → +selfBoost → +rivalDamageMod → −flatReduction → max(0, ·).
// Tabla de ≥ 15 casos con piso en 0 (OWNER-REVIEW) + integración con dados reales.
import { expect, test } from 'vitest'
import type { PokemonCard } from '../packages/content/src/index.ts'
import { parseCardId, parsePkmUid } from '../packages/content/src/ids.ts'
import { rngOf, run, toBattle } from './t020-helpers.ts'
import {
  computeDamage,
  flatReductionFor,
  type DamageInput,
  type DieRolled,
  type PkmConditions,
} from '../packages/engine/src/index.ts'

const rows: readonly (DamageInput & { readonly expected: number })[] = [
  { base: 10, expected: 10 },
  { base: 0, expected: 0 },
  { base: 10, ifRollDamage: 20, expected: 20 }, // "(10) 4-5-6 (20)" con acierto
  { base: 10, ifRollDamage: 0, expected: 0 },
  { base: 10, bonus: 10, expected: 20 }, // Doble bofetón: +10 por acierto
  { base: 10, selfBoost: 10, expected: 20 }, // Enfoque de energía
  { base: 10, rivalDamageMod: -10, expected: 0 }, // Burbujas, piso en 0
  { base: 20, rivalDamageMod: -10, expected: 10 },
  { base: 20, flatReduction: 10, expected: 10 }, // Dureza/Refugio
  { base: 10, flatReduction: 20, expected: 0 }, // el daño nunca baja de 0
  { base: 20, flatReduction: 20, expected: 0 },
  { base: 10, bonus: 10, selfBoost: 10, expected: 30 },
  { base: 30, bonus: 20, flatReduction: 10, expected: 40 },
  { base: 10, bonus: 10, selfBoost: 10, rivalDamageMod: -10, flatReduction: 10, expected: 10 },
  { base: 20, flatReduction: 30, expected: 0 }, // piso con todo cargado
  { base: 10, rivalDamageMod: 10, expected: 20 }, // modificador positivo
  { base: 10, ifRollDamage: 20, flatReduction: 25, expected: 0 }, // piso tras ifRoll
]

test('AC-4 computeDamage: tabla tabular del pipeline con piso en 0', () => {
  expect(rows.length).toBeGreaterThanOrEqual(15)
  for (const row of rows) {
    expect(computeDamage(row), JSON.stringify(row)).toBe(row.expected)
  }
})

// Reducción plana del defensor: condición MAX 1 + especialidades con filtro versus (EFFECTS §1).
test('AC-4 flatReductionFor suma condición + especialidades; versus special solo ataques elementales', () => {
  const card: PokemonCard = {
    id: 'tanque',
    dex: 97,
    name: 'Tanque',
    stage: 'basic',
    deck: 'montana',
    hp: 60,
    element: 'rock',
    attacks: [
      {
        id: 'placaje',
        name: 'Placaje',
        kind: 'attack',
        rollFaces: [1],
        cost: [],
        element: 'normal',
        damage: { base: 10 },
        effects: [],
        rawText: '',
      },
    ],
    specialties: [
      { op: 'flatReduction', amount: 10 }, // BARRERA: cualquier ataque
      { op: 'flatReduction', amount: 20, versus: 'special' }, // PANTALLA: solo elementales
    ],
    evolvesTo: [],
    source: { verified: false },
  }
  const conditions: PkmConditions = { damageModCombat: 10 } // Refugio MAX 1 ya aplicado
  expect(flatReductionFor(card, conditions, 'normal')).toBe(20) // 10 BARRERA + 10 condición
  expect(flatReductionFor(card, conditions, 'fire')).toBe(40) // + 20 PANTALLA (elemental)
  expect(flatReductionFor(card, undefined, 'fire')).toBe(30)
  expect(flatReductionFor(card, undefined, 'normal')).toBe(10)
})

// Integración: bonusPerRoll tira dados propios (purpose 'bonus') y corta al primer fallo.
test('AC-4 doble bofeton: dados [5,4,2] con faces [4,5,6] ⇒ +20 y exactamente 3 tiradas bonus', () => {
  const game = toBattle({
    rng: rngOf(5, 4, 2, 6), // 3 tiradas bonus + attackSelect del rival (6 ⇒ no ataca)
    active: 'p1-poli',
    player: (p) => ({
      ...p,
      team: [
        {
          uid: parsePkmUid('p1-poli'),
          cardId: parseCardId('poliwag'),
          damage: 0,
          xp: 0,
          equipped: [{ id: parseCardId('element_water#9'), element: 'water' }],
          multicolor: [],
          fainted: false,
        },
      ],
    }),
  })
  const state = { ...game.state, battle: { ...game.state.battle!, firstTurn: [] } }
  const attack = run(state, { type: 'Attack', attackId: 'doble_bofeton' }, game.ctx)
  expect(attack.ok).toBe(true)
  if (!attack.ok) throw new Error(attack.error.message)
  const rolls = attack.value.events.filter(
    (event): event is DieRolled => event.type === 'DieRolled' && event.purpose === 'bonus',
  )
  expect(rolls.map((roll) => roll.value)).toEqual([5, 4, 2])
  expect(attack.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 30, cause: 'attack' })
  expect(attack.value.state.battle?.rival[0]?.damage).toBe(30)
})

// Integración: el dado de efecto elige entre base y ifRoll (purpose 'effect', siempre último).
test('AC-4 rasgunos: efecto 6 ⇒ 20; efecto 3 ⇒ 10 (base)', () => {
  const high = toBattle({ rng: rngOf(6, 6) })
  const hit = run(high.state, { type: 'Attack', attackId: 'rasgunos' }, high.ctx)
  expect(hit.ok).toBe(true)
  if (!hit.ok) throw new Error(hit.error.message)
  expect(hit.value.events).toContainEqual({ type: 'DieRolled', purpose: 'effect', value: 6 })
  expect(hit.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 20, cause: 'attack' })

  const low = toBattle({ rng: rngOf(3, 6) })
  const miss = run(low.state, { type: 'Attack', attackId: 'rasgunos' }, low.ctx)
  expect(miss.ok).toBe(true)
  if (!miss.ok) throw new Error(miss.error.message)
  expect(miss.value.events).toContainEqual({ type: 'DieRolled', purpose: 'effect', value: 3 })
  expect(miss.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' })
})

// Integración: la reducción del defensor atraviesa el pipeline completo y tiene piso 0.
test('AC-4 integración: flatReduction del defensor reduce y nunca baja de 0', () => {
  const game = toBattle({ rng: rngOf(3, 6) }) // rasguños sin acierto ⇒ base 10 · rival 6 ⇒ no ataca
  const seeded = {
    ...game.state,
    battle: {
      ...game.state.battle!,
      conditions: { 'rival-1': { damageModCombat: 10 } }, // Refugio MAX 1
    },
  }
  const reduced = run(seeded, { type: 'Attack', attackId: 'rasgunos' }, game.ctx)
  expect(reduced.ok).toBe(true)
  if (!reduced.ok) throw new Error(reduced.error.message)
  expect(reduced.value.events).toContainEqual({ type: 'DamageTaken', pkmUid: 'rival-1', amount: 0, cause: 'attack' })
  expect(reduced.value.state.battle?.rival[0]?.damage).toBe(0)
})
