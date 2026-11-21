// AC: SPEC-T/T-104 — Quitar energías y Multicolor hasta 0 (D-30): comando
// UnassignMulticolor, legalCommands, guardas tipadas, efecto sobre canUse y
// la regresión de energías comunes hasta equipped=[].
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseCardId, parsePkmUid } from '../packages/content/src/ids.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  assertInvariants,
  canUse,
  EngineError,
  legalAttacks,
  legalCommands,
  listInvariants,
  newGame,
  type Command,
  type CommandOk,
  type Ctx,
  type GameState,
  type PkmInstance,
  type Result,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))

function card(id: string) {
  const found = content.cards.find((c) => c.id === id)
  if (found === undefined) throw new Error(`carta "${id}" no está en el contenido`)
  return found
}

/** Partida real en `organize`: Squirtle (isla) + 1 Agua equipada + 2 Multicolor libres. */
const organizing = (): { state: GameState; ctx: Ctx } => {
  const started = newGame({ seed: 7, starterDeck: 'isla', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  const rng = { d6: () => 6, int: () => 0, snapshot: () => 0 }
  return { state: started.value.state, ctx: { content, rng } }
}

const run = (state: GameState, command: Command, ctx: Ctx): Result<CommandOk, EngineError> =>
  applyCommand(state, command, ctx)

const illegalExpect = (result: Result<CommandOk, EngineError>): void => {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe('ILLEGAL_COMMAND')
}

// AC: SPEC-T/T-104/AC-1 — UnassignMulticolor quita la única carta asignada, no
// toca el contador `player.multicolor` y emite MulticolorUnassigned.
test('AC: SPEC-T/T-104/AC-1 - quita la carta asignada y emite MulticolorUnassigned sin tocar el contador', () => {
  const game = organizing()
  const assigned = run(game.state, { type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'water' }, game.ctx)
  expect(assigned.ok).toBe(true)
  if (!assigned.ok) throw new Error(assigned.error.message)

  const unassigned = run(assigned.value.state, { type: 'UnassignMulticolor', pkmUid: 'p1-starter' }, game.ctx)
  expect(unassigned.ok).toBe(true)
  if (!unassigned.ok) throw new Error(unassigned.error.message)
  const player = unassigned.value.state.players[0]!
  expect(player.team[0]!.multicolor).toEqual([])
  expect(player.multicolor).toBe(2) // la carta no se destruye: vuelve a libres (AC-1)
  expect(unassigned.value.events).toContainEqual({
    type: 'MulticolorUnassigned',
    player: 'p1',
    pkmUid: 'p1-starter',
  })
  // Estado JSON serializable y sin azar: las invariantes corrieron dentro de applyCommand.
  expect(JSON.parse(JSON.stringify(unassigned.value.state))).toEqual(unassigned.value.state)
})

// AC: SPEC-T/T-104/AC-2 — legalCommands lo ofrece SOLO en organize, sin pending,
// y únicamente por PKM del equipo con Multicolor asignado.
test('AC: SPEC-T/T-104/AC-2 - legalCommands: solo organize, solo PKM con Multicolor asignado', () => {
  const game = organizing()
  // Sin Multicolor asignado no se ofrece.
  expect(legalCommands(game.state, game.ctx).some((c) => c.type === 'UnassignMulticolor')).toBe(false)

  const assigned = run(game.state, { type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'water' }, game.ctx)
  if (!assigned.ok) throw new Error(assigned.error.message)

  // Con un segundo PKM sin Multicolor: solo se ofrece para el que la tiene.
  const squirtle2: PkmInstance = {
    uid: parsePkmUid('p1-segundo'),
    cardId: parseCardId('poliwag'),
    damage: 0,
    xp: 0,
    equipped: [],
    multicolor: [],
    fainted: false,
  }
  const two = {
    ...assigned.value.state,
    players: [
      { ...assigned.value.state.players[0]!, team: [...assigned.value.state.players[0]!.team, squirtle2] },
    ],
  }
  const offered = legalCommands(two, game.ctx).filter((c) => c.type === 'UnassignMulticolor')
  expect(offered).toEqual([{ type: 'UnassignMulticolor', pkmUid: 'p1-starter' }])

  // Fuera de organize (resolviendo casillero) no se ofrece (mismo gating que Unequip).
  const enResolucion = { ...assigned.value.state, phase: 'tileResolution' as const, stepsLeft: 0 }
  expect(legalCommands(enResolucion, game.ctx).some((c) => c.type === 'UnassignMulticolor')).toBe(false)
})

// AC: SPEC-T/T-104/AC-3 — el handler rechaza con ILLEGAL_COMMAND tipado: fase
// equivocada, PKM inexistente/ajeno al equipo, o sin Multicolor asignado. La
// `version` del guardado NO cambia (los replays existentes siguen válidos).
test('AC: SPEC-T/T-104/AC-3 - guardas tipadas y version sin cambio', () => {
  const game = organizing()

  // Sin Multicolor asignado.
  illegalExpect(run(game.state, { type: 'UnassignMulticolor', pkmUid: 'p1-starter' }, game.ctx))
  // PKM inexistente.
  illegalExpect(run(game.state, { type: 'UnassignMulticolor', pkmUid: 'no-esta' }, game.ctx))

  // Fase equivocada (organize → tileResolution a mano).
  const assigned = run(game.state, { type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'fire' }, game.ctx)
  if (!assigned.ok) throw new Error(assigned.error.message)
  const enResolucion = { ...assigned.value.state, phase: 'tileResolution' as const, stepsLeft: 0 }
  illegalExpect(run(enResolucion, { type: 'UnassignMulticolor', pkmUid: 'p1-starter' }, game.ctx))

  // Éxito: la version del estado no cambia.
  const unassigned = run(assigned.value.state, { type: 'UnassignMulticolor', pkmUid: 'p1-starter' }, game.ctx)
  expect(unassigned.ok).toBe(true)
  if (!unassigned.ok) throw new Error(unassigned.error.message)
  expect(unassigned.value.state.version).toBe(assigned.value.state.version)
})

// AC: SPEC-T/T-104/AC-4 — tras desasignar, canUse/legalAttacks pierden esa
// energía (un ataque que pagaba con el Multicolor pasa a ilegal por costo) y la
// invariante multicolor-coherente sigue en verde con 0 asignadas.
test('AC: SPEC-T/T-104/AC-4 - el ataque que pagaba con el Multicolor pasa a ilegal; invariante verde', () => {
  const squirtleCard = card('squirtle')
  const burbujas = squirtleCard.attacks.find((a) => a.id === 'burbujas')!
  const ids = (ataques: readonly { readonly id: string }[]): string[] => ataques.map((a) => a.id)

  const game = organizing()
  expect(canUse(game.state.players[0]!.team[0]!, burbujas)).toBe(false) // 1 Agua sola no paga [water,water]

  const assigned = run(game.state, { type: 'AssignMulticolor', pkmUid: 'p1-starter', element: 'water' }, game.ctx)
  if (!assigned.ok) throw new Error(assigned.error.message)
  const withMc = assigned.value.state.players[0]!.team[0]!
  expect(canUse(withMc, burbujas)).toBe(true)
  expect(ids(legalAttacks(squirtleCard, withMc, false))).toContain('burbujas')

  const unassigned = run(assigned.value.state, { type: 'UnassignMulticolor', pkmUid: 'p1-starter' }, game.ctx)
  if (!unassigned.ok) throw new Error(unassigned.error.message)
  const withoutMc = unassigned.value.state.players[0]!.team[0]!
  expect(canUse(withoutMc, burbujas)).toBe(false)
  expect(ids(legalAttacks(squirtleCard, withoutMc, false))).not.toContain('burbujas')

  // Invariante registrada y en verde con 0 asignadas.
  expect(listInvariants()).toContain('equipamiento/multicolor-coherente')
  expect(() => assertInvariants(unassigned.value.state)).not.toThrow()
})

// AC: SPEC-T/T-104/AC-5 — la regla canónica D-30 vive en docs/RULES.md §5.
test('AC: SPEC-T/T-104/AC-5 - RULES.md registra D-30 (0 energías es legal)', () => {
  const rules = readFileSync(join(process.cwd(), 'docs/RULES.md'), 'utf8')
  expect(rules).toContain('| D-30 |')
  expect(rules).toMatch(/D-30[^\n]*confirmado[^\n]*\n/)
  expect(rules).toContain('0 energías')
})

// AC: SPEC-T/T-104/AC-8 — regresión: energías comunes hasta 0. Se desequipan
// TODAS (queda equipped=[]) sin errores, los ataques pasan a ✖ y se puede
// volver a equipar.
test('AC: SPEC-T/T-104/AC-8 - desequipar TODAS las energías deja 0 sin errores y ataques ✖', () => {
  const squirtleCard = card('squirtle')
  const game = organizing()
  expect(game.state.players[0]!.team[0]!.equipped).toHaveLength(1) // element_water#1

  let state = game.state
  for (const cardEquipped of [...state.players[0]!.team[0]!.equipped]) {
    const each = run(state, { type: 'Unequip', pkmUid: 'p1-starter', elementId: cardEquipped.id }, game.ctx)
    expect(each.ok, cardEquipped.id).toBe(true)
    if (!each.ok) throw new Error(each.error.message)
    state = each.value.state
  }
  const player = state.players[0]!
  expect(player.team[0]!.equipped).toEqual([])
  expect(player.elements).toEqual([{ id: 'element_water#1', element: 'water' }])
  expect(player.team[0]!.multicolor).toEqual([])

  // Todos los ataques de Squirtle pasan a ✖ (ni el [any] de cabezazo se paga).
  const zeroed = player.team[0]!
  for (const attack of squirtleCard.attacks) {
    expect(canUse(zeroed, attack), attack.id).toBe(false)
  }
  expect(legalAttacks(squirtleCard, zeroed, false)).toEqual([])

  // Y se puede volver a equipar sin errores (el PKM sigue seguible en la UI).
  const reEquipped = run(state, { type: 'Equip', pkmUid: 'p1-starter', elementId: 'element_water#1' }, game.ctx)
  expect(reEquipped.ok).toBe(true)
  if (!reEquipped.ok) throw new Error(reEquipped.error.message)
  expect(reEquipped.value.state.players[0]!.team[0]!.equipped).toHaveLength(1)
})
