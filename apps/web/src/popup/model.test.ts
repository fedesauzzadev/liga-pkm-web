// AC: SPEC-I/T-075/AC-1, AC-2, AC-3, AC-6 — modelo puro de los popups:
// visibilidad por estado, acciones del pie de combate y factor de escala
// (container queries). Sin DOM ni timers: la vista los consume.
import { expect, test } from 'vitest'
import { parseCardId, parseNodeId, parsePlayerId, parsePkmUid } from '@liga/content'
import { createRng, legalCommands, type BattleState, type Command, type GameEvent, type GameState, type PlayerState, type PkmInstance } from '@liga/engine'
import { gameContent } from '../game/content'
import {
  battleMedal,
  battlePopupKind,
  battleResultPending,
  battleResultPlayed,
  battleScriptAfterCommand,
  battleScriptAfterContinue,
  battleScriptPlaying,
  battleShouldAutoClose,
  battleShouldDispatch,
  battleShouldResume,
  type BattleDispatchLatch,
  fitScale,
} from './model'

const pkm = (uid: string, cardId = 'squirtle'): PkmInstance => ({
  uid: parsePkmUid(uid),
  cardId: parseCardId(cardId),
  damage: 0,
  xp: 0,
  equipped: [],
  multicolor: [],
  fainted: false,
})

const player = (id: string): PlayerState => ({
  id: parsePlayerId(id),
  position: parseNodeId('paleta'),
  cameFrom: null,
  // El activo llega con daño: así el motor ofrece UsePotion en tu turno (D-11).
  team: [{ ...pkm('p1-a'), damage: 10 }, pkm('p1-b', 'weedle')],
  oakPile: [],
  elements: [],
  multicolor: 0,
  items: { pokeball: 1, potion: 1, oportunidad: 0, super_potion: 1, ultraball: 0, masterball: 0 },
  medals: [],
})

const wildBattle = (): BattleState => ({
  kind: 'wild',
  card: parseCardId('weedle'),
  deck: 'bosque',
  rival: [{ uid: parsePkmUid('rival-1'), cardId: parseCardId('weedle'), damage: 0, fainted: false }],
  active: [parsePkmUid('p1-a'), parsePkmUid('rival-1')],
  turnSide: 0,
  conditions: {},
  trainerId: null,
  firstTurn: [],
  participants: [parsePkmUid('p1-a')],
  won: false,
  noAttackThisTurn: false,
  actedThisTurn: false,
  lostCount: 0,
})

const stateOf = (overrides: Partial<GameState> = {}): GameState => ({
  version: 1,
  turn: 1,
  phase: 'battle',
  pending: null,
  battle: null,
  stepsLeft: 0,
  rngState: 0,
  dieLog: [],
  ruleset: gameContent.ruleset,
  players: [player('p1')],
  activePlayerId: parsePlayerId('p1'),
  decks: { bosque: [], montana: [], isla: [], llanura: [], pantano: [], item: [], sorpresa: [] },
  ...overrides,
})

const legal = (state: GameState): readonly Command[] =>
  legalCommands(state, { content: gameContent, rng: createRng(0) })

// AC: SPEC-I/T-075/AC-6 - el popup abre según el estado y falta del DOM si no corresponde.
// El pending OakSwap abre vía auto-apertura (oakOpen en PlayScreen).
test('AC: SPEC-I/T-075/AC-6 - battlePopupKind: batalla, intercambio de Oak o cerrado', () => {
  expect(battlePopupKind(stateOf({ battle: wildBattle() }), false)).toBe('battle')
  expect(
    battlePopupKind(stateOf({ phase: 'tileResolution', pending: { type: 'OakSwap' } }), true),
  ).toBe('oak')
  expect(battlePopupKind(stateOf(), true)).toBe('oak')
  expect(battlePopupKind(stateOf(), false)).toBeNull()
  // La batalla gana: nunca hay dos popups (AC-5).
  expect(battlePopupKind(stateOf({ battle: wildBattle(), pending: { type: 'OakSwap' } }), true)).toBe('battle')
})

// AC: T-108/AC-1,AC-4 - con resultado pendiente (BattleEnded) el popup NO se cierra solo.
test('AC: T-108/AC-1 - battlePopupKind se queda en battle con resultado pendiente', () => {
  expect(battlePopupKind(stateOf(), false, 'won')).toBe('battle')
  expect(battlePopupKind(stateOf(), false, 'lost')).toBe('battle')
  // La batalla/resultado gana sobre Oak (AC-5).
  expect(battlePopupKind(stateOf({ phase: 'tileResolution', pending: { type: 'OakSwap' } }), true, 'won')).toBe('battle')
  expect(battlePopupKind(stateOf(), false, null)).toBeNull()
})

// AC: T-108/AC-4 - battleResultPending lee el ÚLTIMO BattleEnded del guion
// (tras él pueden venir XpGained/MedalWon/TurnAdvanced).
test('AC: T-108/AC-4 - battleResultPending: victoria, derrota, vacío y eventos posteriores', () => {
  expect(battleResultPending([])).toBeNull()
  expect(
    battleResultPending([
      { type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' },
      { type: 'DamageTaken', pkmUid: 'rival-1', amount: 50, cause: 'attack' },
    ] as const satisfies readonly GameEvent[]),
  ).toBeNull()
  expect(
    battleResultPending([
      { type: 'PokemonFainted', pkmUid: 'rival-1' },
      { type: 'BattleEnded', player: 'p1', result: 'won' },
      { type: 'XpGained', pkmUid: 'p1-a', amount: 1 },
    ] as const satisfies readonly GameEvent[]),
  ).toBe('won')
  expect(
    battleResultPending([
      { type: 'BattleEnded', player: 'p1', result: 'lost' },
      { type: 'CardToBottom', player: 'p1', deck: 'pantano', card: 'poliwag' },
      { type: 'TurnAdvanced', turn: 2 },
    ] as const satisfies readonly GameEvent[]),
  ).toBe('lost')
})

// AC: T-108/AC-4 - tras Continuar se limpia el guion ⇒ sin resultado ⇒ popup cerrado.
test('AC: T-108/AC-4 - flujo Continuar: script limpio ⇒ battleResultPending null y popup cerrado', () => {
  const ended: readonly GameEvent[] = [
    { type: 'BattleEnded', player: 'p1', result: 'won' },
  ]
  expect(battleResultPending(ended)).toBe('won')
  expect(battlePopupKind(stateOf(), false, battleResultPending(ended))).toBe('battle')
  const afterContinue: readonly GameEvent[] = []
  expect(battleResultPending(afterContinue)).toBeNull()
  expect(battlePopupKind(stateOf(), false, battleResultPending(afterContinue))).toBeNull()
})

// AC: captura-en-popup-combate/AC-1 - el pending CaptureOrRelease vuelve a
// abrir el popup (la decisión de captura vive en su pie, D-31 revertido); el
// resultado pendiente de T-108 se conserva (overlay + Continuar antes de cerrar).
test('AC: captura-en-popup-combate/AC-1 - battlePopupKind abre el popup con pending CaptureOrRelease', () => {
  const capture = {
    type: 'CaptureOrRelease',
    card: 'weedle',
    deck: 'bosque',
    participants: [parsePkmUid('p1-a')],
  } as const
  expect(battlePopupKind(stateOf({ phase: 'tileResolution', pending: capture }), false)).toBe('battle')
  expect(battlePopupKind(stateOf(), false)).toBeNull()
  expect(
    battlePopupKind(stateOf({ phase: 'tileResolution', pending: capture }), false, 'won'),
  ).toBe('battle')
})

// unificar-popup-encuentro/AC-1: cardPopupStays se eliminó — el popup de carta
// ya no se queda abierto por FightOrRelease (la decisión vive en
// popup-encounter; cobertura en EncounterPopup.test.tsx).

// rediseno-combate-max/AC-6: el pie de combate se eliminó (battleActions se
// retiró del modelo): las acciones viven en las pestañas de la escena
// (battle/controls.ts, tests en battle/controls.test.ts).

// AC: SPEC-I/T-075/AC-3 - la escena escala según el popup (normal y ampliado), no la ventana.
test('AC: SPEC-I/T-075/AC-3 - fitScale ajusta al contenedor manteniendo proporción', () => {
  expect(fitScale(400, 500, 800, 1000)).toBeCloseTo(0.5, 5)
  expect(fitScale(800, 400, 800, 1000)).toBeCloseTo(0.4, 5) // ampliado: manda la altura
  expect(fitScale(0, 0, 800, 1000)).toBe(1) // sin medidas (SSR): sin escala
})

// ── fin-de-combate: resultado por reproducción y ciclo de vida del guion ──

const endedScript: readonly GameEvent[] = [
  { type: 'AttackUsed', attacker: 'p1-a', attackId: 'cabezazo', target: 'rival-1' },
  { type: 'DamageTaken', pkmUid: 'rival-1', amount: 30, cause: 'attack' },
  { type: 'PokemonFainted', pkmUid: 'rival-1' },
  { type: 'BattleEnded', player: 'p1', result: 'won' },
  { type: 'XpGained', pkmUid: 'p1-a', amount: 1 },
]

// AC: fin-de-combate/AC-1 - con BattleEnded en el guion pero eventos aún sin
// reproducir (la coreografía del golpe final sigue en cola) NO hay resultado.
test('AC: fin-de-combate/AC-1 - battleResultPlayed: sin reproducir todo el guion no hay resultado', () => {
  expect(battleResultPlayed(endedScript, 0)).toBeNull()
  expect(battleResultPlayed(endedScript, 1)).toBeNull()
  // BattleEnded ya entró al guion pero la cola sigue con XpGained:
  expect(battleResultPlayed(endedScript, endedScript.length - 1)).toBeNull()
})

// AC: fin-de-combate/AC-2 - el resultado aparece SOLO con todo el guion
// reproducido (cola vacía, BattleEnded incluido y posteriores ya jugados).
test('AC: fin-de-combate/AC-2 - battleResultPlayed: guion completo reproducido ⇒ resultado', () => {
  expect(battleResultPlayed(endedScript, endedScript.length)).toBe('won')
  const lost: readonly GameEvent[] = [
    { type: 'BattleEnded', player: 'p1', result: 'lost' },
    { type: 'CardToBottom', player: 'p1', deck: 'pantano', card: 'poliwag' },
    { type: 'TurnAdvanced', turn: 2 },
  ]
  expect(battleResultPlayed(lost, lost.length)).toBe('lost')
  expect(battleResultPlayed(lost, 1)).toBeNull()
  expect(battleResultPlayed([], 0)).toBeNull()
})

// AC: fin-de-combate/AC-4 - "Continuar" con captura pendiente NO cierra el
// popup: el guion sobrevive (escena congelada) y la decisión vive en el pie
// del popup (captura-en-popup-combate). Sin captura pendiente se limpia como
// en T-108.
test('AC: fin-de-combate/AC-4 - battleScriptAfterContinue conserva el guion solo con captura pendiente', () => {
  const capture = {
    type: 'CaptureOrRelease',
    card: 'weedle',
    deck: 'bosque',
    participants: [parsePkmUid('p1-a')],
  } as const
  expect(battleScriptAfterContinue(capture)).toBe('keep')
  expect(battleScriptAfterContinue(null)).toBe('clear')
  expect(battleScriptAfterContinue({ type: 'FightOrRelease', card: 'weedle', deck: 'bosque' })).toBe('clear')
})

const captureEvents: readonly GameEvent[] = [
  { type: 'PokemonCaptured', player: 'p1', card: 'weedle', pkmUid: 'p1-catch-1', destination: 'team' },
  { type: 'CardToBottom', player: 'p1', deck: 'item', card: 'pokeball' },
  { type: 'TurnAdvanced', turn: 2 },
]

// AC: fin-de-combate/AC-5 - Capture acumula PokemonCaptured sobre la escena
// viva (la coreografía de captura se reproduce ahí) y el popup se cierra solo
// cuando todo se reprodujo con batalla y decisión ya resueltas, tras haber
// consumido el resultado ("Continuar").
test('AC: fin-de-combate/AC-5 - Capture acumula la coreografía y el cierre es automático al terminar', () => {
  expect(battleScriptAfterCommand(endedScript, { type: 'Capture' }, captureEvents, false)).toEqual([
    ...endedScript,
    ...captureEvents,
  ])
  // En flujo de batalla se sigue acumulando por comando (T-075, sin regresión).
  expect(
    battleScriptAfterCommand(
      [{ type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' }],
      { type: 'Attack', attackId: 'cabezazo' },
      [{ type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' }],
      true,
    ),
  ).toEqual([
    { type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' },
    { type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' },
  ])
  // Auto-cierre (onDone ⇒ cola reproducida): solo con resultado consumido,
  // guion vivo y motor sin batalla ni decisión.
  const pendingCapture = stateOf({
    phase: 'tileResolution',
    pending: { type: 'CaptureOrRelease', card: 'weedle', deck: 'bosque', participants: [parsePkmUid('p1-a')] },
  })
  expect(battleShouldAutoClose(pendingCapture, true, true)).toBe(false) // decisión aún viva
  const resolved = stateOf({ phase: 'organize' })
  expect(battleShouldAutoClose(resolved, true, true)).toBe(true)
  expect(battleShouldAutoClose(resolved, false, true)).toBe(false) // sin "Continuar" previo
  expect(battleShouldAutoClose(resolved, true, false)).toBe(false) // sin escena viva
  expect(battleShouldAutoClose(stateOf({ battle: wildBattle() }), true, true)).toBe(false)
})

// AC: fin-de-combate/AC-6 - "Dejar ir" cierra inmediato, sin animación.
test('AC: fin-de-combate/AC-6 - Release limpia el guion directo', () => {
  const releaseEvents: readonly GameEvent[] = [
    { type: 'CardToBottom', player: 'p1', deck: 'bosque', card: 'weedle' },
    { type: 'TurnAdvanced', turn: 2 },
  ]
  expect(battleScriptAfterCommand(endedScript, { type: 'Release' }, releaseEvents, false)).toEqual([])
})

// AC: fin-de-combate/AC-8 - partida restaurada (guion vacío, sin escena):
// Capture resuelve directo como hoy; no hay escenario sobre el cual animar.
test('AC: fin-de-combate/AC-8 - sin guion vivo, Capture no abre animación', () => {
  expect(battleScriptAfterCommand([], { type: 'Capture' }, captureEvents, false)).toEqual([])
  expect(
    battleScriptAfterCommand([], { type: 'Release' }, captureEvents.slice(1), false),
  ).toEqual([])
})

// ── retirada-solo-inicio-turno: gate de reproducción y anti doble-dispatch ──

// AC: retirada-solo-inicio-turno/AC-3 (rediseno-combate-max) - con la marca
// del turno activa (poción usada en combate, D-32) el motor deja de ofrecer
// Retire ⇒ la pestaña Cambiar no habilita Aceptar (cover en controls.test).
test('AC: retirada-solo-inicio-turno/AC-3 - tras usar poción el motor no ofrece Retire', () => {
  const spent = stateOf({ battle: { ...wildBattle(), actedThisTurn: true } })
  expect(legal(spent).some((command) => command.type === 'Retire')).toBe(false)
  expect(legal(spent).some((command) => command.type === 'UsePotion')).toBe(true)
  const fresh = stateOf({ battle: wildBattle() })
  expect(legal(fresh).some((command) => command.type === 'Retire')).toBe(true)
})

// AC: retirada-solo-inicio-turno/AC-6 - mientras el guion de combate no terminó
// de reproducirse (played < script.length, misma señal que fin-de-combate) las
// acciones de combate no despachan comandos.
test('AC: retirada-solo-inicio-turno/AC-6 - battleScriptPlaying: guion en curso', () => {
  const mid: readonly GameEvent[] = [
    { type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' },
    { type: 'DamageTaken', pkmUid: 'rival-1', amount: 10, cause: 'attack' },
  ]
  expect(battleScriptPlaying(mid, 0)).toBe(true)
  expect(battleScriptPlaying(mid, 1)).toBe(true)
  expect(battleScriptPlaying(mid, mid.length)).toBe(false)
  expect(battleScriptPlaying([], 0)).toBe(false)
})

// AC: retirada-solo-inicio-turno/AC-7 - anti doble-dispatch: el mismo comando
// sobre el MISMO estado (segundo click casi simultáneo) se ignora; con un
// estado nuevo el comando vuelve a valer (dos pociones seguidas, D-11).
test('AC: retirada-solo-inicio-turno/AC-7 - battleShouldDispatch ignora el segundo click', () => {
  const state = stateOf({ battle: wildBattle() })
  const potion: Command = { type: 'UsePotion', pkmUid: parsePkmUid('p1-a'), target: parsePkmUid('p1-a') }
  expect(battleShouldDispatch(null, potion, state)).toBe(true)
  const latch: BattleDispatchLatch = { command: potion, state }
  expect(battleShouldDispatch(latch, potion, state)).toBe(false) // doble click
  const nextState = stateOf({ battle: wildBattle() })
  expect(battleShouldDispatch(latch, potion, nextState)).toBe(true) // estado nuevo
  expect(battleShouldDispatch(latch, { type: 'Advance' }, state)).toBe(true) // otro comando
})

// AC: fix-combate-refresco/AC-1 - reanuda SOLO con guion vacío y batalla viva
// (partida restaurada: el restore no re-emite eventos históricos).
test('AC: fix-combate-refresco/AC-1 - battleShouldResume: guion vacío + batalla viva', () => {
  const started: readonly GameEvent[] = [
    { type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' },
  ]
  expect(battleShouldResume([], wildBattle())).toBe(true)
  expect(battleShouldResume(started, wildBattle())).toBe(false)
  expect(battleShouldResume([], null)).toBe(false)
})

// AC: medalla-gimnasio/AC-1 - la medalla del overlay sale del ÚLTIMO MedalWon
// del guion (no del estado ni de la animación); sin MedalWon no hay bloque.
test('AC: medalla-gimnasio/AC-1 - battleMedal: último MedalWon del guion', () => {
  expect(battleMedal([])).toBeNull()
  expect(
    battleMedal([
      { type: 'BattleStarted', player: 'p1', kind: 'gym', rival: 'celeste', active: 'p1-a' },
      { type: 'BattleEnded', player: 'p1', result: 'won' },
    ]),
  ).toBeNull()
  expect(
    battleMedal([
      { type: 'BattleEnded', player: 'p1', result: 'won' },
      { type: 'MedalWon', player: 'p1', gym: 'celeste', medal: 'Cascada' },
      { type: 'PrizePkmWon', player: 'p1', card: 'squirtle', pkmUid: 'p1-prize-1', destination: 'team' },
    ]),
  ).toEqual({ gym: 'celeste', medal: 'Cascada' })
})

