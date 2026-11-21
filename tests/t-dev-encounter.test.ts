// AC: plan probar-encuentro-abra — comando DebugEncounter: fuerza el flujo real
// de robar a Abra del mazo Pantano (CardDrawn + FightOrRelease) sin azar de
// tablero, y la partida completa robo → pelea → captura queda en el commandLog.
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parseCardId } from '../packages/content/src/ids.ts'
import { loadContent } from '../packages/content/src/node.ts'
import {
  applyCommand,
  legalCommands,
  newGame,
  type Command,
  type Ctx,
  type GameState,
  type Result,
} from '../packages/engine/src/index.ts'
import {
  applyToSession,
  restoreSession,
  saveFromSession,
  startSession,
} from '../apps/web/src/game/session.ts'
import { rngOf } from './t020-helpers.ts'

const content = loadContent(join(process.cwd(), 'content'))

function must<T>(result: Result<T, { readonly message: string }>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Partida real (inicial Montaña ⇒ el mazo Pantano conserva sus 2 Abra). */
const newOrganize = (seed = 1): { state: GameState; ctx: Ctx } => {
  const started = newGame({ seed, starterDeck: 'montana', ruleset: content.ruleset }, content)
  if (!started.ok) throw new Error(started.error.message)
  return { state: started.value.state, ctx: { content, rng: rngOf() } }
}

const encounter: Command = { type: 'DebugEncounter', deck: 'pantano', card: parseCardId('abra') }

// AC: probar-encuentro-abra/AC-1 — legal en organize: saca abra del mazo, emite
// CardDrawn y deja el mismo estado que resolveTile tras robar un PKM.
test('AC-1 DebugEncounter roba abra de pantano y deja FightOrRelease peleable', () => {
  const { state, ctx } = newOrganize()
  expect(state.decks.pantano.filter((card) => card === 'abra')).toHaveLength(2)
  const out = applyCommand(state, encounter, ctx)
  expect(out.ok).toBe(true)
  if (!out.ok) throw new Error(out.error.message)
  expect(out.value.events).toEqual([{ type: 'CardDrawn', player: 'p1', deck: 'pantano', card: 'abra' }])
  const next = out.value.state
  expect(next.phase).toBe('tileResolution')
  expect(next.stepsLeft).toBe(0)
  expect(next.pending).toEqual({ type: 'FightOrRelease', card: 'abra', deck: 'pantano' })
  expect(next.decks.pantano.filter((card) => card === 'abra')).toHaveLength(1)
  // Mismo estado que resolveTile ⇒ FightEncounter queda legal sin tocar nada más.
  expect(legalCommands(next, ctx)).toContainEqual({ type: 'FightEncounter', pkmUid: 'p1-starter' })
  const fight = applyCommand(next, { type: 'FightEncounter', pkmUid: 'p1-starter' }, ctx)
  expect(fight.ok).toBe(true)
})

// AC: probar-encuentro-abra/AC-2 — fuera de organize, con decisión pendiente o
// sin la carta en el mazo ⇒ error y estado sin mutar.
test('AC-2 DebugEncounter rechazado fuera de organize, con pending o sin la carta', () => {
  const { state, ctx } = newOrganize()

  // (a) Con decisión pendiente: el guard PENDING_DECISION existing lo frena.
  const drawn = must(applyCommand(state, encounter, ctx))
  const again = applyCommand(drawn.state, encounter, ctx)
  expect(again.ok).toBe(false)
  if (!again.ok) expect(again.error.code).toBe('PENDING_DECISION')

  // (b) Fuera de organize (batalla abierta) ⇒ ILLEGAL_COMMAND con mensaje claro.
  const fight = must(applyCommand(drawn.state, { type: 'FightEncounter', pkmUid: 'p1-starter' }, ctx))
  const inBattle = applyCommand(fight.state, encounter, ctx)
  expect(inBattle.ok).toBe(false)
  if (!inBattle.ok) {
    expect(inBattle.error.code).toBe('ILLEGAL_COMMAND')
    expect(inBattle.error.message).toContain('organize')
  }

  // (c) Carta que no está en el mazo (p. ej. ya capturada) ⇒ ILLEGAL_COMMAND y
  // el estado original queda intacto (el mismo objeto sigue jugando).
  const missing = applyCommand(state, { type: 'DebugEncounter', deck: 'pantano', card: parseCardId('kadabra') }, ctx)
  expect(missing.ok).toBe(false)
  if (!missing.ok) {
    expect(missing.error.code).toBe('ILLEGAL_COMMAND')
    expect(missing.error.message).toContain('kadabra')
  }
  expect(state.phase).toBe('organize')
  expect(applyCommand(state, encounter, ctx).ok).toBe(true)
})

// AC: probar-encuentro-abra/AC-3 — flujo completo robo → pelea → captura con el
// RNG real de la semilla; DebugEncounter entra al commandLog y el restore lo
// reproduce determinista (save/restore sigue andando).
test('AC-3 DebugEncounter → FightEncounter → Attack → Capture queda en el save', () => {
  let session = must(startSession({ seed: 1, starterDeck: 'montana' }, content))
  let step = must(applyToSession(session, encounter, content))
  session = step.session
  step = must(applyToSession(session, { type: 'FightEncounter', pkmUid: 'p1-starter' }, content))
  session = step.session

  // El rival (Abra, sin AGILIDAD) no arranca: charmander ataca con Rasguños
  // hasta derrotarlo; el dado de cada lado lo dicta la semilla del setup.
  let state = session.state
  let guard = 0
  while (state.battle !== null && guard < 60) {
    guard += 1
    const command: Command = state.battle.turnSide === 0
      ? { type: 'Attack', attackId: 'rasgunos' }
      : { type: 'Advance' }
    step = must(applyToSession(session, command, content))
    session = step.session
    state = session.state
  }
  expect(state.battle).toBeNull()
  expect(state.pending).toEqual({
    type: 'CaptureOrRelease',
    card: 'abra',
    deck: 'pantano',
    participants: ['p1-starter'],
  })

  step = must(applyToSession(session, { type: 'Capture' }, content))
  session = step.session
  const captured = session.state
  expect(step.events).toContainEqual({ type: 'PokemonCaptured', player: 'p1', card: 'abra', pkmUid: 'p1-catch-1', destination: 'team' })
  expect(captured.players[0]!.team.map((pkm) => pkm.cardId)).toContain('abra')
  expect(captured.players[0]!.items.pokeball).toBe(4) // 5 − 1 Pokébola
  expect(captured.phase).toBe('organize')

  // El comando entra al commandLog y replay/save+restore lo reproduce igual.
  expect(session.commandLog[0]).toEqual(encounter)
  const restored = must(restoreSession(saveFromSession(session), content))
  expect(restored.session.state).toEqual(captured)
})
