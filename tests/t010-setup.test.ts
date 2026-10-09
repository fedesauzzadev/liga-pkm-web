// AC: SPEC-B/T-010 — Estado inicial + Setup. Un test por AC del spec.
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadContent } from '../packages/content/src/node.ts'
import {
  EngineError,
  newGame,
  type CommandOk,
  type Result,
} from '../packages/engine/src/index.ts'

const content = loadContent(join(process.cwd(), 'content'))
const setup = (
  seed: number,
  starterDeck: Parameters<typeof newGame>[0]['starterDeck'],
): Result<CommandOk, EngineError> => {
  return newGame({ seed, starterDeck, ruleset: content.ruleset }, content)
}

// AC: SPEC-B/T-010/AC-1 — newGame crea 1 jugador en paleta con el inicial equipado.
test('AC-1 newGame({seed,starterDeck,ruleset}) crea 1 jugador en paleta con inicial+elemento, 2 comodines, 5 pokebolas, 0 medallas', () => {
  const result = setup(42, 'isla')
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('inalcanzable')
  const { state, events } = result.value

  expect(state.players).toHaveLength(1)
  const player = state.players[0]!
  expect(player.position).toBe('paleta')
  expect(player.cameFrom).toBeNull()
  expect(player.wildcards).toBe(2)
  expect(player.items).toEqual({ pokeball: 5, potion: 0 })
  expect(player.medals).toEqual([])
  expect(player.oakPile).toEqual([])
  expect(player.elements).toEqual([])
  expect(state.activePlayerId).toBe(player.id)

  expect(player.team).toHaveLength(1)
  const starter = player.team[0]!
  expect(starter.cardId).toBe('squirtle')
  expect(starter.damage).toBe(0)
  expect(starter.xp).toBe(0)
  expect(starter.fainted).toBe(false)
  expect(starter.equipped).toEqual([
    { id: 'element_water#1', element: 'water' },
  ])

  // montana → charmander + fuego (bulbasaur/machop/abra aún no están en el contenido: AC-2).
  const mountain = setup(42, 'montana')
  expect(mountain.ok).toBe(true)
  if (mountain.ok) {
    const p = mountain.value.state.players[0]!
    expect(p.team[0]!.cardId).toBe('charmander')
    expect(p.team[0]!.equipped[0]!.element).toBe('fire')
  }

  // Evento de arranque para la UI (patrón comando → eventos).
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    type: 'GameStarted',
    starterDeck: 'isla',
    starter: 'squirtle',
    position: 'paleta',
  })
})

// AC: SPEC-B/T-010/AC-2 — inicial inexistente ⇒ error claro (INVALID_SETUP), sin crash.
test('AC-2 si la carta del inicial no existe en el contenido, error claro y no crash', () => {
  const faltantes = [
    { deck: 'bosque', carta: 'bulbasaur' },
    { deck: 'llanura', carta: 'machop' },
    { deck: 'pantano', carta: 'abra' },
  ] as const
  for (const { deck, carta } of faltantes) {
    const result = setup(1, deck)
    expect(result.ok, deck).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(EngineError)
      expect(result.error.code).toBe('INVALID_SETUP')
      expect(result.error.message).toContain(carta)
      expect(result.error.message).toContain(deck)
    }
  }
})

// AC: SPEC-B/T-010/AC-3 — mazos barajados con el RNG; el inicial se saca del mazo.
test('AC-3 misma semilla ⇒ mismo orden de mazos; el inicial sale de su mazo', () => {
  const a = setup(777, 'isla')
  const b = setup(777, 'isla')
  expect(a.ok && b.ok).toBe(true)
  if (!a.ok || !b.ok) throw new Error('inalcanzable')

  expect(a.value.state.decks).toEqual(b.value.state.decks)
  expect(a.value.state).toEqual(b.value.state)

  const otraSemilla = setup(778, 'isla')
  expect(otraSemilla.ok).toBe(true)
  if (otraSemilla.ok) {
    expect(otraSemilla.value.state.decks).not.toEqual(a.value.state.decks)
  }

  // El mazo de isla (element_water×5 + squirtle×1) pierde a squirtle y conserva el resto.
  const isla = a.value.state.decks.isla
  expect(isla).not.toContain('squirtle')
  expect(isla).toHaveLength(5)
  expect([...isla].sort()).toEqual(Array.from({ length: 5 }, () => 'element_water'))

  // El inicial de otro mazo no se toca.
  expect(a.value.state.decks.montana).toContain('charmander')
})

// AC: SPEC-B/T-010/AC-4 — GameState serializable.
test('AC-4 GameState serializable: JSON.parse(JSON.stringify(s)) ≡ s', () => {
  const result = setup(2026, 'montana')
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('inalcanzable')
  const clone = JSON.parse(JSON.stringify(result.value.state)) as unknown
  expect(clone).toEqual(result.value.state)
})
