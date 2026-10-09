// Entradas de comando de batalla (SPEC-C/T-020). Los handlers de engine.ts
// validan fase/decisión pendiente y despachan acá; la máquina (pipeline, turnos,
// faints) vive en battle.ts. Sin azar propio, sin DOM (ADR-1).
import type { WritableDraft } from 'immer'
import { parseCardId, parsePkmUid } from '@liga/content'
import { legalAttacks } from './equipment.ts'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { GameEvent } from './events.ts'
import type { Ctx } from './engine.ts'
import { pushToBottom } from './tiles.ts'
import type { GameState } from './state.ts'
import {
  activePlayer,
  battleOf,
  cardOf,
  cleanConditions,
  endSideTurn,
  finalizeVictory,
  resolveAttack,
  rivalAction,
  startSideTurn,
  teamPkmOf,
} from './battle.ts'

type Draft = WritableDraft<GameState>

function illegal(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('ILLEGAL_COMMAND', message) }
}

/** `FightEncounter`: resuelve el encuentro y crea la batalla (AC-2: retador primero). */
export function fightEncounter(
  draft: Draft,
  ctx: Ctx,
  command: { readonly pkmUid: string },
): Result<readonly GameEvent[], EngineError> {
  const pending = draft.pending
  if (pending?.type !== 'FightOrRelease' || draft.phase !== 'tileResolution') {
    return illegal('FightEncounter requiere un encuentro pendiente')
  }
  const player = activePlayer(draft)
  if (!player.ok) return player
  const pkm = teamPkmOf(player.value, command.pkmUid)
  if (!pkm.ok) return pkm
  if (pkm.value.fainted) return illegal('solo un PKM sano puede pelear (D-08)')
  const card = cardOf(ctx.content, pending.card)
  if (!card.ok) return card
  // AGILIDAD (D-02): el rival con startsFirst arranca atacando.
  const rivalStarts = card.value.specialties.some((effect) => effect.op === 'startsFirst')
  const rivalUid = parsePkmUid('rival-1')
  const cardId = parseCardId(pending.card)
  draft.battle = {
    kind: 'wild',
    card: cardId,
    deck: pending.deck,
    rival: [{ uid: rivalUid, cardId, damage: 0, fainted: false }],
    active: [pkm.value.uid, rivalUid],
    turnSide: rivalStarts ? 1 : 0,
    conditions: {},
    firstTurn: [pkm.value.uid],
    participants: [pkm.value.uid],
    won: false,
    noAttackThisTurn: false,
  }
  draft.pending = null
  draft.phase = 'battle'
  return {
    ok: true,
    value: [
      { type: 'BattleStarted', player: player.value.id, kind: 'wild', rival: pending.card, active: pkm.value.uid },
    ],
  }
}

/** `UsePotion`: cura al activo hasta `ruleset.potionHeal`; no consume el ataque (AC-1, D-11). */
export function usePotion(
  draft: Draft,
  command: { readonly pkmUid: string; readonly target: string },
): Result<readonly GameEvent[], EngineError> {
  const b = battleOf(draft)
  if (!b.ok) return b
  if (b.value.won) return illegal('la batalla ya terminó')
  if (b.value.turnSide !== 0) return illegal('las pociones se usan en tu turno')
  const player = activePlayer(draft)
  if (!player.ok) return player
  const uid = b.value.active[0]!
  if (command.pkmUid !== uid || command.target !== uid) {
    return illegal('en combate la poción solo se usa sobre el PKM activo (D-11)')
  }
  const pkm = teamPkmOf(player.value, uid)
  if (!pkm.ok) return pkm
  if (pkm.value.fainted) return illegal('el PKM activo está derrotado')
  if (player.value.items.potion <= 0) return illegal('no quedan pociones')
  if (pkm.value.damage <= 0) return illegal('no tiene daño que curar')
  const ruleset = draft.ruleset
  if (ruleset === null) return illegal('no hay partida iniciada (falta ruleset)')
  const healed = Math.min(ruleset.potionHeal, pkm.value.damage)
  pkm.value.damage -= healed
  player.value.items = { ...player.value.items, potion: player.value.items.potion - 1 }
  draft.decks.item = pushToBottom(draft.decks.item, parseCardId('potion'))
  return {
    ok: true,
    value: [
      { type: 'Healed', pkmUid: uid, amount: healed, cause: 'potion' },
      { type: 'CardToBottom', player: player.value.id, deck: 'item', card: 'potion' },
    ],
  }
}

/** `Retire`: cambia al activo, limpia estados (salvo disabledAttackId) y pierde el ataque (AC-6). */
export function retire(draft: Draft, command: { readonly to: string }): Result<readonly GameEvent[], EngineError> {
  const b = battleOf(draft)
  if (!b.ok) return b
  if (b.value.won) return illegal('la batalla ya terminó')
  if (b.value.turnSide !== 0) return illegal('solo se retira en tu turno')
  const player = activePlayer(draft)
  if (!player.ok) return player
  const from = b.value.active[0]!
  const to = teamPkmOf(player.value, command.to)
  if (!to.ok) return to
  if (to.value.uid === from) return illegal('el reemplazo debe ser otro PKM')
  if (to.value.fainted) return illegal('el reemplazo debe estar sano (D-07)')
  cleanConditions(draft, from, true)
  b.value.active = [to.value.uid, b.value.active[1]!]
  b.value.firstTurn = [...b.value.firstTurn.filter((u) => u !== to.value.uid), to.value.uid]
  if (!b.value.participants.includes(to.value.uid)) {
    b.value.participants = [...b.value.participants, to.value.uid]
  }
  b.value.turnSide = 1 // pierde el ataque: el turno pasa al rival
  b.value.noAttackThisTurn = false
  return { ok: true, value: [{ type: 'PkmRetired', player: player.value.id, from, to: to.value.uid }] }
}

/** `Attack`: valida contra legalAttacks (AC-5) y resuelve; luego pasa el turno. */
export function attackCommand(
  draft: Draft,
  ctx: Ctx,
  command: { readonly attackId: string },
): Result<readonly GameEvent[], EngineError> {
  const b = battleOf(draft)
  if (!b.ok) return b
  if (b.value.won) return illegal('la batalla ya terminó')
  if (b.value.turnSide !== 0) return illegal('no es el turno del jugador')
  const player = activePlayer(draft)
  if (!player.ok) return player
  const uid = b.value.active[0]!
  const pkm = teamPkmOf(player.value, uid)
  if (!pkm.ok) return pkm
  if (pkm.value.fainted) return illegal('tu PKM activo está derrotado')
  if (b.value.noAttackThisTurn) return illegal('sigue dormido: no puede atacar este turno')
  const conditions = b.value.conditions[uid]
  if (conditions?.skipNextAttack === true) return illegal('no puede atacar este turno (efecto del rival)')
  const card = cardOf(ctx.content, pkm.value.cardId)
  if (!card.ok) return card
  const attack = legalAttacks(card.value, pkm.value, b.value.firstTurn.includes(uid)).find(
    (a) => a.id === command.attackId,
  )
  if (attack === undefined) {
    return illegal(`ataque "${command.attackId}" no es legal (costo o regla de primer ataque)`)
  }
  const events: GameEvent[] = []
  const resolved = resolveAttack(draft, ctx, 0, attack, events)
  if (!resolved.ok) return resolved
  if (draft.battle !== null && draft.pending === null && !draft.battle.won) {
    endSideTurn(draft, 0)
    draft.battle.turnSide = 1
  }
  return { ok: true, value: events }
}

/** `SendOut`: resuelve ChooseReplacement; el lado que repone actúa (D-02). */
export function sendOut(
  draft: Draft,
  ctx: Ctx,
  command: { readonly pkmUid: string },
): Result<readonly GameEvent[], EngineError> {
  const pending = draft.pending
  const b = battleOf(draft)
  if (!b.ok) return b
  if (pending?.type !== 'ChooseReplacement') return illegal('no hay reemplazo pendiente')
  if (!pending.options.includes(command.pkmUid)) {
    return illegal(`"${command.pkmUid}" no está entre las opciones`)
  }
  const player = activePlayer(draft)
  if (!player.ok) return player
  const pkm = teamPkmOf(player.value, command.pkmUid)
  if (!pkm.ok) return pkm
  if (pkm.value.fainted) return illegal('el reemplazo debe estar sano (D-07)')
  const battle = b.value
  battle.active = [pkm.value.uid, battle.active[1]!]
  battle.firstTurn = [...battle.firstTurn.filter((u) => u !== pkm.value.uid), pkm.value.uid]
  if (!battle.participants.includes(pkm.value.uid)) {
    battle.participants = [...battle.participants, pkm.value.uid]
  }
  draft.pending = null
  const events: GameEvent[] = [{ type: 'PkmSentOut', player: player.value.id, pkmUid: pkm.value.uid }]
  if (battle.won) {
    finalizeVictory(draft, events)
    return { ok: true, value: events }
  }
  battle.turnSide = 0
  const started = startSideTurn(draft, ctx, 0, events)
  if (!started.ok) return started
  return { ok: true, value: events }
}

/**
 * `Advance` en batalla: procesa hasta la próxima decisión del jugador — el turno
 * completo del rival (inicio → acción → fin) y el inicio del turno propio. Si ya
 * era el turno del jugador, se interpreta como pasar sin atacar.
 */
export function advanceBattle(draft: Draft, ctx: Ctx): Result<readonly GameEvent[], EngineError> {
  if (draft.pending !== null) return illegal('Advance no aplica con una decisión pendiente')
  const b = battleOf(draft)
  if (!b.ok) return b
  if (b.value.won) return illegal('la batalla ya terminó')
  const events: GameEvent[] = []
  if (b.value.turnSide === 0) {
    endSideTurn(draft, 0) // pasar sin atacar
    if (draft.battle !== null) draft.battle.turnSide = 1
  }
  if (draft.battle !== null && draft.battle.turnSide === 1) {
    const started = startSideTurn(draft, ctx, 1, events)
    if (!started.ok) return started
    if (draft.battle !== null && !draft.battle.won && draft.pending === null) {
      const acted = rivalAction(draft, ctx, events)
      if (!acted.ok) return acted
    }
    if (draft.battle !== null && !draft.battle.won && draft.pending === null) {
      endSideTurn(draft, 1)
    }
  }
  if (draft.battle !== null && !draft.battle.won && draft.pending === null) {
    draft.battle.turnSide = 0
    const started = startSideTurn(draft, ctx, 0, events)
    if (!started.ok) return started
  }
  return { ok: true, value: events }
}
