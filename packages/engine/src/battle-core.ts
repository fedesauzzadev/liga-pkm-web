// Núcleo compartido de batalla (SPEC-C): acceso a cartas/PKM, dado, daño, curación
// y resolución de derrotas. Extraído de battle.ts en T-021 para que battle.ts
// (máquina de turnos) y battle-effects.ts (primitivas) compartan base sin ciclos.
import type { WritableDraft } from 'immer'
import type { CardId, Content, Element, PokemonCard } from '@liga/content'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { DiePurpose, DieRolled, GameEvent, TrainerAppeared } from './events.ts'
import type { Ctx } from './engine.ts'
import { pushToBottom } from './tiles.ts'
import { applyGymPrize } from './prizes.ts'
import type { BattleState, GameState, PkmConditions, PkmInstance, PlayerState, RivalPkm } from './state.ts'

export type Draft = WritableDraft<GameState>
export type Battle = WritableDraft<BattleState>

export function illegal(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('ILLEGAL_COMMAND', message) }
}

function invalidContent(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('INVALID_CONTENT', message) }
}

// ── Contenido indexado (§3 rendimiento): Map por id, memoizado por array. ──

const cardCache = new WeakMap<readonly PokemonCard[], Map<string, PokemonCard>>()

function cardIndexFor(content: Content): Map<string, PokemonCard> {
  const cached = cardCache.get(content.cards)
  if (cached !== undefined) return cached
  const index = new Map(content.cards.map((card) => [card.id, card]))
  cardCache.set(content.cards, index)
  return index
}

export function cardOf(content: Content, cardId: string): Result<PokemonCard, EngineError> {
  const card = cardIndexFor(content).get(cardId)
  return card === undefined
    ? invalidContent(`carta "${cardId}" no existe en el contenido`)
    : { ok: true, value: card }
}

// ── Acceso a PKM en batalla (equipo del jugador o rival de la batalla). ──

export interface PkmRef {
  readonly pkm: WritableDraft<PkmInstance> | WritableDraft<RivalPkm>
  readonly cardId: CardId
}

export function activePlayer(draft: Draft): Result<WritableDraft<PlayerState>, EngineError> {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  return player === undefined ? illegal('sin jugador activo') : { ok: true, value: player }
}

export function battleOf(draft: Draft): Result<Battle, EngineError> {
  if (draft.battle === null) return illegal('no hay batalla activa')
  return { ok: true, value: draft.battle }
}

export function teamPkmOf(
  player: WritableDraft<PlayerState>, uid: string,
): Result<WritableDraft<PkmInstance>, EngineError> {
  const pkm = player.team.find((p) => p.uid === uid)
  return pkm === undefined ? illegal(`"${uid}" no está en el equipo`) : { ok: true, value: pkm }
}

export function findPkm(draft: Draft, uid: string): Result<PkmRef, EngineError> {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  const own = player?.team.find((p) => p.uid === uid)
  if (own !== undefined) return { ok: true, value: { pkm: own, cardId: own.cardId } }
  const rival = draft.battle?.rival.find((r) => r.uid === uid)
  if (rival !== undefined) return { ok: true, value: { pkm: rival, cardId: rival.cardId } }
  return illegal(`"${uid}" no está en la batalla`)
}

/** Único dado del motor: registra DieRolled + snapshot del RNG (replay, SDD §3). */
export function rollDie(draft: Draft, ctx: Ctx, purpose: DiePurpose, events: GameEvent[]): number {
  const value = ctx.rng.d6()
  const die: DieRolled = { type: 'DieRolled', purpose, value }
  draft.dieLog.push(die)
  draft.rngState = ctx.rng.snapshot()
  events.push(die)
  return value
}

// ── Pipeline de daño (EFFECTS §2.5, AC-4 de T-020): pasos puros y testeables. ──

export interface DamageInput {
  readonly base: number
  readonly ifRollDamage?: number
  readonly bonus?: number
  readonly selfBoost?: number
  readonly rivalDamageMod?: number
  readonly flatReduction?: number
}
/** d = base|ifRoll → +bonus → +selfBoost → +rivalDamageMod → −flatReduction → max(0,·). */
export function computeDamage(input: DamageInput): number {
  const base = input.ifRollDamage ?? input.base
  const total =
    base + (input.bonus ?? 0) + (input.selfBoost ?? 0) + (input.rivalDamageMod ?? 0) - (input.flatReduction ?? 0)
  return Math.max(0, total)
}

/** Reducción plana del defensor: condición MAX 1 + especialidades con filtro `versus`. */
export function flatReductionFor(
  card: PokemonCard,
  conditions: PkmConditions | undefined,
  attackElement: Element,
  options: { readonly includeSpecialties?: boolean } = {},
): number {
  let total = conditions?.damageModCombat ?? 0
  if (options.includeSpecialties !== false) {
    for (const specialty of card.specialties) {
      if (specialty.op !== 'flatReduction') continue
      if (specialty.versus === 'special' && attackElement === 'normal') continue
      total += specialty.amount
    }
  }
  return total
}

// ── Aplicación de daño/curación (escribe team del jugador o rival de batalla). ──

export function applyDamage(
  draft: Draft,
  content: Content,
  uid: string,
  amount: number,
  cause: 'attack' | 'poison' | 'drain' | 'drainNow' | 'selfDamage',
  events: GameEvent[],
): Result<null, EngineError> {
  const ref = findPkm(draft, uid)
  if (!ref.ok) return ref
  const card = cardOf(content, ref.value.cardId)
  if (!card.ok) return card
  const pkm = ref.value.pkm
  const total = pkm.damage + amount
  // Un ataque siempre reporta (aunque absorban todo); los ticks solo si duelen.
  if (amount > 0 || cause === 'attack') {
    events.push({ type: 'DamageTaken', pkmUid: uid, amount: Math.max(0, amount), cause })
  }
  if (amount > 0) pkm.damage = Math.min(total, card.value.hp)
  if (total >= card.value.hp && !pkm.fainted) {
    pkm.fainted = true
    events.push({ type: 'PokemonFainted', pkmUid: uid })
    cleanConditions(draft, uid, true) // EFFECTS §3: al caer se limpia salvo disabledAttackId
  }
  return { ok: true, value: null }
}

export function healPkm(
  draft: Draft,
  content: Content,
  uid: string,
  amount: number,
  cause: 'potion' | 'drain' | 'drainNow' | 'healSelf',
  events: GameEvent[],
): Result<null, EngineError> {
  if (amount <= 0) return { ok: true, value: null }
  const ref = findPkm(draft, uid)
  if (!ref.ok) return ref
  const card = cardOf(content, ref.value.cardId)
  if (!card.ok) return card
  const healed = Math.min(amount, ref.value.pkm.damage) // solo se curan los contadores que hay
  if (healed > 0) {
    ref.value.pkm.damage -= healed
    events.push({ type: 'Healed', pkmUid: uid, amount: healed, cause })
  }
  return { ok: true, value: null }
}

/** Limpia las condiciones de `uid` (retirar/derrotar); conserva disabledAttackId si pide. */
export function cleanConditions(draft: Draft, uid: string, keepDisabled: boolean): void {
  const b = draft.battle
  if (b === null) return
  const conditions = b.conditions[uid]
  if (conditions === undefined) return
  const disabled = conditions.disabledAttackId
  delete b.conditions[uid]
  if (keepDisabled && disabled !== undefined) b.conditions[uid] = { disabledAttackId: disabled }
}

/** Gimnasio: si el líder derrota 2 de tus PKM, gana el duelo (RULES §4 p.43). */
export const GYM_DEFEATS_TO_LOSE = 2

/** Consecuencias de cualquier caída: victoria, reemplazo o derrota. */
export function afterFaints(
  draft: Draft,
  content: Content,
  events: GameEvent[],
): Result<null, EngineError> {
  if (draft.battle === null) return { ok: true, value: null }
  const battle = draft.battle
  const player = activePlayer(draft)
  if (!player.ok) return player
  const ownRef = findPkm(draft, battle.active[0]!)
  if (!ownRef.ok) return ownRef
  const rivalDown = battle.rival.every((rival) => rival.fainted)
  const ownDown = ownRef.value.pkm.fainted
  const healthyBench = player.value.team
    .filter((pkm) => !pkm.fainted && pkm.uid !== battle.active[0])
    .map((pkm) => pkm.uid)
  if (rivalDown) {
    battle.won = true
    events.push({ type: 'BattleEnded', player: player.value.id, result: 'won' })
    if (ownDown && healthyBench.length > 0) {
      battle.turnSide = 0
      draft.pending = { type: 'ChooseReplacement', options: healthyBench }
      return { ok: true, value: null }
    }
    finalizeVictory(draft, content, events)
    return { ok: true, value: null }
  }
  // Gimnasio 2v2 (T-023): el activo del líder cayó y le queda banco ⇒ repone y
  // cada PKM del líder derrotado da +1 XP a los que participaron (RULES §4 p.47).
  if (battle.kind === 'gym' && battle.rival.find((r) => r.uid === battle.active[1])?.fainted === true) {
    grantXpToParticipants(draft, events)
    const next = battle.rival.find((rival) => !rival.fainted)
    if (next !== undefined) {
      battle.active = [battle.active[0], next.uid] // el lado que repone actúa (D-02)
      events.push({ type: 'RivalSentOut', pkmUid: next.uid })
    }
  }
  if (ownDown) {
    if (battle.kind === 'gym') battle.lostCount += 1
    // T-049 (D-22): PKM Sorpresa "Oportunidad: n" escapa al derrotar n PKM tuyos,
    // aunque quede banca sana; vuelve al fondo del mazo Sorpresa (finalizeLoss).
    if (battle.kind === 'wild') {
      battle.lostCount += 1
      const wildCard = cardOf(content, battle.card)
      if (!wildCard.ok) return wildCard
      if (wildCard.value.chances !== undefined && battle.lostCount >= wildCard.value.chances) {
        finalizeLoss(draft, events)
        return { ok: true, value: null }
      }
    }
    // 2 propios caídos: el líder gana aunque queden sanos en la banca (AC-2).
    if (battle.kind === 'gym' && battle.lostCount >= GYM_DEFEATS_TO_LOSE) {
      finalizeLoss(draft, events)
      return { ok: true, value: null }
    }
    if (healthyBench.length > 0) {
      battle.turnSide = 0 // el lado que repone actúa (D-02)
      draft.pending = { type: 'ChooseReplacement', options: healthyBench }
    } else {
      finalizeLoss(draft, events)
    }
  }
  return { ok: true, value: null }
}

/** +1 XP a cada PKM propio que participó del combate (T-022/AC-1, RULES §4 p.47-49). */
export function grantXpToParticipants(draft: Draft, events: GameEvent[]): void {
  const battle = draft.battle
  if (battle === null) return
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) return
  for (const pkm of player.team) {
    if (!battle.participants.includes(pkm.uid)) continue
    pkm.xp += 1
    events.push({ type: 'XpGained', pkmUid: pkm.uid, amount: 1 })
  }
}

/**
 * Victoria: +1 XP por combate ganado a los participantes (T-022/AC-1); según el
 * kind: captura pendiente (salvaje) o medalla + premio (gimnasio, T-023).
 */
export function finalizeVictory(draft: Draft, content: Content, events: GameEvent[]): void {
  const battle = draft.battle
  if (battle === null) return
  grantXpToParticipants(draft, events)
  if (battle.kind === 'gym') {
    awardGymVictory(draft, content, events)
    return
  }
  draft.pending = {
    type: 'CaptureOrRelease',
    card: battle.card,
    deck: battle.deck,
    participants: [...battle.participants],
  }
  draft.battle = null
  draft.phase = 'tileResolution'
}

/** Derrota total: el salvaje escapa al FONDO del mazo y el turno avanza (AC-7);
 * los PKM del líder se quedan con él (se puede volver a desafiar). */
export function finalizeLoss(draft: Draft, events: GameEvent[]): void {
  const battle = draft.battle
  if (battle === null) return
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  const playerId = player?.id ?? ''
  events.push({ type: 'BattleEnded', player: playerId, result: 'lost' })
  if (battle.kind === 'wild') {
    events.push({ type: 'CardToBottom', player: playerId, deck: battle.deck, card: battle.card })
    draft.decks[battle.deck] = pushToBottom(draft.decks[battle.deck], battle.card)
  }
  draft.battle = null
  draft.pending = null
  draft.turn += 1
  draft.phase = 'organize'
  events.push({ type: 'TurnAdvanced', turn: draft.turn })
}

/**
 * Victoria de gimnasio (T-023/AC-2..4): medalla + premio de la carta del líder.
 * Sin captura; queda en `tileResolution` para evolucionar (D-06) y cierra con
 * Advance. Medallas completas ⇒ GameWon y fase `finished` (fin).
 */
function awardGymVictory(draft: Draft, content: Content, events: GameEvent[]): void {
  const battle = draft.battle
  if (battle === null || battle.kind !== 'gym') return
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  draft.battle = null
  draft.pending = null
  if (player === undefined) {
    draft.phase = 'tileResolution'
    return
  }
  player.medals = [...player.medals, battle.gym]
  events.push({ type: 'MedalWon', player: player.id, gym: battle.gym, medal: battle.medal })
  applyGymPrize(draft, content, player, battle.prize, events)
  if (draft.ruleset !== null && player.medals.length >= draft.ruleset.medalsToWin) {
    draft.phase = 'finished'
    events.push({ type: 'GameWon', player: player.id })
    return
  }
  draft.phase = 'tileResolution'
}

/** Premio del líder, premios PKM y uids de regalo viven en prizes.ts (T-049). */

/** Escribe/crea las condiciones de `uid` sin pisar los demás slots (EFFECTS §2.6). */
export function setCondition(
  draft: Draft,
  uid: string,
  mutate: (conditions: WritableDraft<PkmConditions>) => void,
): void {
  const battle = draft.battle
  if (battle === null) return
  if (battle.conditions[uid] === undefined) battle.conditions[uid] = {}
  mutate(battle.conditions[uid]!)
}

/** Registra un slot MAX 1 en `usedMax`; false si ya estaba usado (no se apila). */
export function markMax(draft: Draft, uid: string, key: string): boolean {
  const battle = draft.battle
  if (battle === null) return false
  const used = battle.conditions[uid]?.usedMax ?? []
  if (used.includes(key)) return false
  setCondition(draft, uid, (conditions) => {
    conditions.usedMax = [...used, key]
  })
  return true
}

/** TrainerAppeared notifica al UI que el líder gimnasio apareció (final de vista). */
export function emitTrainerAppeared(trainerId: string): TrainerAppeared {
  return { type: 'TrainerAppeared', trainerId }
}
