// AC: SPEC-I/T-072/AC-2 — eventToLog: un mensaje por evento del motor (los
// nombres reales llegan por el i18n inyectado; el estado resuelve uids).
import { parseCardId, parseNodeId, parsePlayerId, parsePkmUid } from '@liga/content'
import { expect, test } from 'vitest'
import { createInitialState, type BattleState, type GameState, type PlayerState, type PkmInstance } from '@liga/engine'
import { es } from './es'
import { eventToLog, type EventLogI18n } from './event-log'

const names: Readonly<Record<string, string>> = {
  squirtle: 'Squirtle',
  weedle: 'Weedle',
  poliwag: 'Poliwag',
}

const i18n: EventLogI18n = {
  texts: es,
  cardName: (cardId) => names[cardId] ?? cardId,
  nodeName: (nodeId) => ({ paleta: 'Pueblo Paleta', plateada: 'Ciudad Plateada' })[nodeId] ?? nodeId,
  attackName: (_cardId, attackId) => ({ burbujas: 'Burbujas' })[attackId] ?? attackId,
}

const pkm = (uid: string, cardId: string): PkmInstance => ({
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
  team: [pkm('p1-a', 'squirtle')],
  oakPile: [],
  elements: [],
  multicolor: 0,
  items: { pokeball: 0, potion: 0, oportunidad: 0, super_potion: 0, ultraball: 0, masterball: 0 },
  medals: [],
})

const battle = (): BattleState => ({
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
  ...createInitialState(),
  turn: 2,
  phase: 'battle',
  players: [player('p1')],
  activePlayerId: parsePlayerId('p1'),
  battle: battle(),
  ...overrides,
})

// AC: SPEC-I/T-072/AC-2 — mínimo del spec: dado, movimiento, carta, energía,
// curación en Centro, mazo vacío e inicio de turno.
test('AC-2 eventToLog: dado, movimiento, carta robada, energía, curación, mazo vacío, turno', () => {
  const state = stateOf()
  expect(eventToLog({ type: 'DieRolled', purpose: 'move', value: 4 }, state, i18n)).toBe('Sacaste un 4.')
  expect(eventToLog({ type: 'Landed', player: 'p1', node: 'plateada' }, state, i18n)).toBe(
    'Te moviste a Ciudad Plateada.',
  )
  expect(eventToLog({ type: 'CardDrawn', player: 'p1', deck: 'bosque', card: 'weedle' }, state, i18n)).toBe(
    'Sacaste una carta de Bosque: Weedle.',
  )
  expect(eventToLog({ type: 'EnergyGained', player: 'p1', element: 'water' }, state, i18n)).toBe(
    'La energía de Agua quedó en tu inventario.',
  )
  expect(eventToLog({ type: 'PartyHealed', player: 'p1', count: 3 }, state, i18n)).toBe(
    'Curaste a tu equipo en el Centro PKM (3 curados).',
  )
  expect(eventToLog({ type: 'DeckEmpty', player: 'p1', deck: 'isla' }, state, i18n)).toBe(
    'El mazo Isla está vacío: no se puede robar.',
  )
  expect(eventToLog({ type: 'TurnAdvanced', turn: 5 }, state, i18n)).toBe('Empieza el turno 5.')
})

// AC: SPEC-I/T-072/AC-2 — combate: encuentro, ataque, daño, estado aplicado,
// debilitado, XP, evolución, captura, medalla y fin de batalla.
test('AC-2 eventToLog: encuentro, ataque, daño, estado, debilitado, XP, evolución, captura, medalla', () => {
  const state = stateOf()
  expect(
    eventToLog({ type: 'BattleStarted', player: 'p1', kind: 'wild', rival: 'weedle', active: 'p1-a' }, state, i18n),
  ).toBe('¡Apareció un Weedle salvaje!')
  expect(
    eventToLog({ type: 'BattleStarted', player: 'p1', kind: 'gym', rival: 'weedle', active: 'p1-a' }, state, i18n),
  ).toBe('¡Desafiaste el gimnasio! Se acerca Weedle.')
  expect(
    eventToLog({ type: 'AttackUsed', attacker: 'p1-a', attackId: 'burbujas', target: 'rival-1' }, state, i18n),
  ).toBe('Squirtle usó Burbujas.')
  expect(eventToLog({ type: 'DamageTaken', pkmUid: 'p1-a', amount: 20, cause: 'attack' }, state, i18n)).toBe(
    'Squirtle recibió 20 de daño.',
  )
  expect(eventToLog({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'asleep' }, state, i18n)).toBe(
    'Weedle quedó dormido.',
  )
  expect(eventToLog({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'poison' }, state, i18n)).toBe(
    'Weedle fue envenenado.',
  )
  expect(
    eventToLog({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'confused', faces: [1, 2, 3] }, state, i18n),
  ).toBe('¡Weedle quedó confundido! Al atacar tirará el dado: con 1-2-3 se auto-ataca.')
  expect(
    eventToLog({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'noAttackGate', faces: [1, 2, 3] }, state, i18n),
  ).toBe('¡Weedle quedó bloqueado! Al atacar tirará el dado: con 1-2-3 no podrá atacar.')
  expect(eventToLog({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'skip' }, state, i18n)).toBe(
    '¡Weedle no podrá atacar en su próximo turno!',
  )
  expect(eventToLog({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'drain' }, state, i18n)).toBe(
    '¡Weedle quedó drenado!',
  )
  expect(eventToLog({ type: 'ConditionApplied', pkmUid: 'p1-a', condition: 'shield' }, state, i18n)).toBe(
    '¡Squirtle subió su defensa!',
  )
  expect(eventToLog({ type: 'ConditionApplied', pkmUid: 'p1-a', condition: 'selfBoost' }, state, i18n)).toBe(
    '¡Squirtle cargó energía: sus ataques suman!',
  )
  expect(eventToLog({ type: 'ConditionApplied', pkmUid: 'rival-1', condition: 'weakened' }, state, i18n)).toBe(
    '¡Los ataques de Weedle quedaron debilitados!',
  )
  expect(eventToLog({ type: 'ConditionApplied', pkmUid: 'p1-a', condition: 'dodge' }, state, i18n)).toBe(
    '¡Squirtle preparó un esquive!',
  )
  expect(eventToLog({ type: 'PokemonFainted', pkmUid: 'rival-1' }, state, i18n)).toBe('¡Weedle se debilitó!')
  expect(eventToLog({ type: 'XpGained', pkmUid: 'p1-a', amount: 1 }, state, i18n)).toBe('Squirtle ganó 1 XP.')
  // El nombre de "from" se resuelve contra el estado post-comando (ya evolucionado).
  expect(
    eventToLog({ type: 'PkmEvolved', player: 'p1', pkmUid: 'p1-a', from: 'squirtle', to: 'poliwag' }, state, i18n),
  ).toBe('¡Squirtle evolucionó en Poliwag!')
  expect(
    eventToLog({ type: 'PokemonCaptured', player: 'p1', card: 'weedle', pkmUid: 'p1-catch-1', destination: 'team' }, state, i18n),
  ).toBe('¡Capturaste a Weedle!')
  expect(eventToLog({ type: 'MedalWon', player: 'p1', gym: 'g1', medal: 'Trueno' }, state, i18n)).toBe(
    '¡Ganaste la Medalla Trueno!',
  )
  expect(eventToLog({ type: 'BattleEnded', player: 'p1', result: 'won' }, state, i18n)).toBe('¡Ganaste el combate!')
  expect(eventToLog({ type: 'BattleEnded', player: 'p1', result: 'lost' }, state, i18n)).toBe('Perdiste el combate…')
})

// AC: SPEC-I/T-072/AC-2 — uso de ítem/bola/poción, liberación (CardToBottom de
// PKM) y eventos que son ruido (null).
test('AC-2 eventToLog: ítem/bola/poción, liberación y ruido (null)', () => {
  const state = stateOf()
  expect(eventToLog({ type: 'Healed', pkmUid: 'p1-a', amount: 20, cause: 'potion' }, state, i18n)).toBe(
    'Usaste una Poción: Squirtle recuperó 20 PS.',
  )
  expect(eventToLog({ type: 'Healed', pkmUid: 'p1-a', amount: 10, cause: 'drain' }, state, i18n)).toBe(
    'Squirtle recuperó 10 PS.',
  )
  expect(eventToLog({ type: 'CardToBottom', player: 'p1', deck: 'item', card: 'pokeball' }, state, i18n)).toBe(
    'Pokebola usada: volvió al fondo del mazo Ítem.',
  )
  // unificar-popup-encuentro/AC-6: un PKM que vuelve al fondo fue soltado.
  expect(eventToLog({ type: 'CardToBottom', player: 'p1', deck: 'bosque', card: 'weedle' }, state, i18n)).toBe(
    'Dejaste ir a Weedle.',
  )
  // Las energías mantienen el texto genérico de volver al fondo.
  expect(eventToLog({ type: 'CardToBottom', player: 'p1', deck: 'bosque', card: 'element_water' }, state, i18n)).toBe(
    `${i18n.cardName('element_water')} volvió al fondo del mazo Bosque.`,
  )
  expect(eventToLog({ type: 'GameStarted', player: 'p1', starterDeck: 'isla', starter: 'squirtle', position: 'paleta' }, state, i18n)).toBe(
    'Jugador 1 empezó la partida con Squirtle.',
  )
  expect(eventToLog({ type: 'MoveStep', player: 'p1', from: 'a', to: 'b' }, state, i18n)).toBeNull()
  expect(eventToLog({ type: 'DieRolled', purpose: 'effect', value: 5 }, state, i18n)).toBeNull()
  expect(eventToLog({ type: 'UnsupportedEffect', handler: 'TODO_x', attackId: 'a1' }, state, i18n)).toBeNull()
})

// AC: SPEC-T/T-104/AC-10 — el evento MulticolorUnassigned suma una entrada al
// historial con texto i18n en español rioplatense.
test('AC: SPEC-T/T-104/AC-10 - MulticolorUnassigned entra al historial con texto i18n', () => {
  const state = stateOf()
  expect(eventToLog({ type: 'MulticolorUnassigned', player: 'p1', pkmUid: 'p1-a' }, state, i18n)).toBe(
    'Squirtle devolvió su Multicolor.',
  )
  expect(eventToLog({ type: 'MulticolorAssigned', player: 'p1', pkmUid: 'p1-a', element: 'water' }, state, i18n)).toBe(
    'Asignaste el Multicolor como Agua en Squirtle.',
  )
})

// AC: visibilidad-estados-combate/AC-6 — SelfHit, ConditionCleared y NoAttack
// por gate con causa: el historial explica la tirada en vez del genérico.
test('AC: visibilidad-estados-combate/AC-6 - SelfHit, ConditionCleared y NoAttack de gate explicado', () => {
  const state = stateOf()
  expect(eventToLog({ type: 'SelfHit', attacker: 'rival-1', value: 2 }, state, i18n)).toBe(
    '¡Weedle está confundido! Salió 2 y se auto-ataca.',
  )
  expect(
    eventToLog({ type: 'NoAttack', attacker: 'rival-1', reason: 'gate', cause: 'paralized', value: 2 }, state, i18n),
  ).toBe('¡Weedle está bloqueado! Salió 2: no puede atacar este turno.')
  expect(
    eventToLog({ type: 'NoAttack', attacker: 'rival-1', reason: 'gate', cause: 'defended', value: 4 }, state, i18n),
  ).toBe('¡El rival frenó a Weedle! Salió 4: no puede atacar este turno.')
  // Sin causa/cara (evento viejo o sin gate): el genérico se mantiene.
  expect(eventToLog({ type: 'NoAttack', attacker: 'rival-1', reason: 'gate' }, state, i18n)).toBe(
    'Weedle no puede atacar.',
  )
  expect(eventToLog({ type: 'ConditionCleared', pkmUid: 'rival-1', condition: 'confused' }, state, i18n)).toBe(
    '¡Weedle ya no está confundido!',
  )
  expect(eventToLog({ type: 'ConditionCleared', pkmUid: 'rival-1', condition: 'skip' }, state, i18n)).toBe(
    'Weedle ya puede volver a atacar.',
  )
  expect(eventToLog({ type: 'ConditionCleared', pkmUid: 'rival-1', condition: 'weakened' }, state, i18n)).toBe(
    'Los ataques de Weedle vuelven a la normalidad.',
  )
  expect(eventToLog({ type: 'ConditionCleared', pkmUid: 'rival-1', condition: 'drain' }, state, i18n)).toBe(
    'El efecto sobre Weedle terminó.',
  )
})

// AC: medalla-gimnasio/AC-2 — el gimnasio ya ganado entra al historial.
test('AC: medalla-gimnasio/AC-2 - GymAlreadyWon entra al historial', () => {
  const state = stateOf()
  expect(eventToLog({ type: 'GymAlreadyWon', player: 'p1', gym: 'brock' }, state, i18n)).toBe(
    'Ya ganaste este gimnasio.',
  )
})
