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
  runRivalTurn,
  startSideTurn,
  teamPkmOf,
} from './battle.ts'
import { nextCaptureUid, removeWildCopies } from './progression.ts'
import type { Content } from '@liga/content'

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
    trainerId: null,
    firstTurn: [pkm.value.uid],
    participants: [pkm.value.uid],
    won: false,
    noAttackThisTurn: false,
    actedThisTurn: false, // retirada-solo-inicio-turno: el turno arranca limpio (D-32)
    lostCount: 0, // D-22: escape por chances (PKM Sorpresa)
  }
  draft.pending = null
  draft.phase = 'battle'
  const events: GameEvent[] = [
    { type: 'BattleStarted', player: player.value.id, kind: 'wild', rival: pending.card, active: pkm.value.uid },
  ]
  // AGILIDAD (D-02): el turno inicial del rival corre en este mismo comando.
  const rivalTurn = runRivalTurn(draft, ctx, events)
  if (!rivalTurn.ok) return rivalTurn
  return { ok: true, value: events }
}

/**
 * `UsePotion` (AC-1, D-11): en combate cura al activo sin consumir el ataque;
 * FUERA de combate (T-073, D-11) cualquier PKM del equipo en `organize`.
 * T-049: la Poción cura hasta `ruleset.potionHeal` y vuelve al fondo del mazo
 * Ítem; la Super Poción (Sorpresa) cura TODO el daño y vuelve al fondo del
 * mazo Sorpresa (D-20).
 */
export function usePotion(
  draft: Draft,
  command: { readonly pkmUid: string; readonly target: string; readonly item?: 'potion' | 'super_potion' },
): Result<readonly GameEvent[], EngineError> {
  const player = activePlayer(draft)
  if (!player.ok) return player
  const ruleset = draft.ruleset
  if (ruleset === null) return illegal('no hay partida iniciada (falta ruleset)')
  const item = command.item ?? 'potion'
  const owned = item === 'potion' ? player.value.items.potion : player.value.items.super_potion
  if (owned <= 0) {
    return illegal(item === 'potion' ? 'no quedan pociones' : 'no quedan Super Pociones')
  }
  const pkm = teamPkmOf(player.value, command.target)
  if (!pkm.ok) return pkm
  if (draft.battle === null) {
    // D-11 (T-073): fuera de combate, en Organize y sobre cualquier PKM del equipo.
    if (draft.phase !== 'organize') return illegal('fuera de combate las pociones se usan en la fase Organize (D-11)')
  } else {
    const b = draft.battle
    if (b.won) return illegal('la batalla ya terminó')
    if (b.turnSide !== 0) return illegal('las pociones se usan en tu turno')
    const uid = b.active[0]!
    if (command.pkmUid !== uid || command.target !== uid) {
      return illegal('en combate la poción solo se usa sobre el PKM activo (D-11)')
    }
  }
  if (pkm.value.fainted) return illegal('no se puede curar un PKM derrotado')
  if (pkm.value.damage <= 0) return illegal('no tiene daño que curar')
  const healed = item === 'potion' ? Math.min(ruleset.potionHeal, pkm.value.damage) : pkm.value.damage
  pkm.value.damage -= healed
  if (draft.battle !== null) {
    // retirada-solo-inicio-turno (D-32): la poción en combate consume la
    // ventana de retiro de este turno (no el ataque, D-11 sigue intacto).
    draft.battle.actedThisTurn = true
  }
  if (item === 'potion') {
    player.value.items = { ...player.value.items, potion: player.value.items.potion - 1 }
    draft.decks.item = pushToBottom(draft.decks.item, parseCardId('potion'))
  } else {
    player.value.items = { ...player.value.items, super_potion: player.value.items.super_potion - 1 }
    draft.decks.sorpresa = pushToBottom(draft.decks.sorpresa, parseCardId('super_potion'))
  }
  const toBottom: GameEvent = {
    type: 'CardToBottom',
    player: player.value.id,
    deck: item === 'potion' ? 'item' : 'sorpresa',
    card: item,
  }
  return {
    ok: true,
    value: [{ type: 'Healed', pkmUid: command.target, amount: healed, cause: 'potion' }, toBottom],
  }
}

/** `Retire`: cambia al activo, limpia estados (salvo disabledAttackId) y pierde el
 * ataque (AC-6); el turno del rival corre en el mismo comando (turno-automatico-rival). */
export function retire(
  draft: Draft,
  ctx: Ctx,
  command: { readonly to: string },
): Result<readonly GameEvent[], EngineError> {
  const b = battleOf(draft)
  if (!b.ok) return b
  if (b.value.won) return illegal('la batalla ya terminó')
  if (b.value.turnSide !== 0) return illegal('solo se retira en tu turno')
  if (b.value.actedThisTurn) {
    return illegal('ya usaste una acción este turno: retirar es solo al inicio (D-32)')
  }
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
  const events: GameEvent[] = [{ type: 'PkmRetired', player: player.value.id, from, to: to.value.uid }]
  const rivalTurn = runRivalTurn(draft, ctx, events)
  if (!rivalTurn.ok) return rivalTurn
  return { ok: true, value: events }
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
    endSideTurn(draft, 0, events)
    draft.battle.turnSide = 1
    // turno-automatico-rival: el rival actúa en este mismo comando (AC-1);
    // con `pending` o fin de batalla el flujo vigente no cambia (AC-5).
    const rivalTurn = runRivalTurn(draft, ctx, events)
    if (!rivalTurn.ok) return rivalTurn
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
    finalizeVictory(draft, ctx.content, events)
    return { ok: true, value: events }
  }
  battle.turnSide = 0
  battle.actedThisTurn = false // retirada-solo-inicio-turno: reponer tras desmayo arranca turno limpio (D-32)
  const started = startSideTurn(draft, ctx, 0, events)
  if (!started.ok) return started
  return { ok: true, value: events }
}

/**
 * `ThrowBall` (T-049, AC-5, D-12/D-19): Ultra/Master Ball en TU turno contra un
 * PKM sin dueño (batalla wild). Ultra exige `hp − daño ≤ maxRemainingHp` (40);
 * Master captura siempre. Captura al instante, SIN XP (D-19); la bola se consume
 * y vuelve al FONDO del mazo Sorpresa; el turno termina.
 */
export function throwBall(
  draft: Draft,
  content: Content,
  command: { readonly ball: 'ultraball' | 'masterball' },
): Result<readonly GameEvent[], EngineError> {
  const b = battleOf(draft)
  if (!b.ok) return b
  const battle = b.value
  if (battle.won) return illegal('la batalla ya terminó')
  if (battle.turnSide !== 0) return illegal('las bolas se tiran en tu turno')
  if (battle.kind !== 'wild') return illegal('las bolas no capturan PKM de gimnasio ni Liga (D-12)')
  const playerResult = activePlayer(draft)
  if (!playerResult.ok) return playerResult
  const player = playerResult.value
  const ruleset = draft.ruleset
  if (ruleset === null) return illegal('no hay partida iniciada (falta ruleset)')
  if (player.items[command.ball] <= 0) {
    return illegal(command.ball === 'masterball' ? 'no queda ninguna Master Ball' : 'no queda ninguna Ultra Ball')
  }
  const rule = ruleset.capture[command.ball]
  if (rule.timing !== 'duringBattle') {
    return illegal(`el ruleset no permite capturar con ${command.ball} durante la batalla`)
  }
  const rival = battle.rival[0]!
  const card = cardOf(content, battle.card)
  if (!card.ok) return card
  const remaining = card.value.hp - rival.damage
  if (rule.maxRemainingHp !== undefined && remaining > rule.maxRemainingHp) {
    return illegal(
      `a ${card.value.name} le quedan ${remaining} de vida y ${command.ball === 'masterball' ? 'Master' : 'Ultra'} Ball captura hasta ${rule.maxRemainingHp} (D-12)`,
    )
  }
  // Captura instantánea: la bola al fondo del mazo Sorpresa, el PKM al equipo/oakPile.
  player.items = { ...player.items, [command.ball]: player.items[command.ball] - 1 }
  draft.decks.sorpresa = pushToBottom(draft.decks.sorpresa, parseCardId(command.ball))
  removeWildCopies(draft, battle.card) // registrar-captura/AC-2: ninguna copia queda en los mazos
  const pkmUid = nextCaptureUid(player)
  const destination: 'team' | 'oakPile' = player.team.length < ruleset.teamLimit ? 'team' : 'oakPile'
  const captured = { uid: pkmUid, cardId: battle.card, damage: 0, xp: 0, equipped: [], multicolor: [], fainted: false }
  if (destination === 'team') player.team.push(captured)
  else player.oakPile.push(captured)
  draft.battle = null
  draft.pending = null
  draft.turn += 1
  draft.phase = 'organize'
  const ballName = command.ball
  return {
    ok: true,
    value: [
      { type: 'BattleEnded', player: player.id, result: 'won' }, // sin XpGained: D-19
      { type: 'PokemonCaptured', player: player.id, card: battle.card, pkmUid, destination },
      { type: 'CardToBottom', player: player.id, deck: 'sorpresa', card: ballName },
      { type: 'TurnAdvanced', turn: draft.turn },
    ],
  }
}

/** `Advance` en batalla: procesa hasta la próxima decisión del jugador — el turno
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
    endSideTurn(draft, 0, events) // pasar sin atacar
    if (draft.battle !== null) draft.battle.turnSide = 1
  }
  const rivalTurn = runRivalTurn(draft, ctx, events)
  if (!rivalTurn.ok) return rivalTurn
  return { ok: true, value: events }
}
