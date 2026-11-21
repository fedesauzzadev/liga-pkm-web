// Registro de coreografía por tipo de evento (SPEC-D/T-032d/AC-1): una función
// `play` por `GameEvent` de combate (Strategy+Registry, ENGINEERING-STANDARDS §1;
// sin switch gigante). Los eventos que no son de combate no tienen entrada.
import { es } from '../../i18n/es'
import { ANIMATION_CONFIG } from '../../events/anim.config'
import type { GameEvent, PokemonCard } from '@liga/engine'
import type { MoveFxAttack } from '../../fx'
import { fmt } from './fmt'
import { Timing } from './timing'
// Daño/curación viven en damage.ts (rediseno-combate-max/AC-3: amount 0 no
// anima nada; "¡No hizo daño!" solo si el ataque tenía base > 0).
import { playDamageTaken, playHealed } from './damage.ts'
import type {
  BattleChoreoDeps,
  BattleStage,
  CaptureVisual,
  ChoreoActorInput,
  FloaterTone,
  StageActor,
} from './stage'
import { isBattleDiePurpose, conditionsAfterApplied, conditionsAfterCleared, conditionsAfterWokeUp, confusedAttackerOf, dieSideOf, toStageActor } from './stage'

const cfg = ANIMATION_CONFIG.battle

/** Operaciones que el coreógrafo ofrece a los handlers (puertos, sin DOM). */
export interface ChoreoApi {
  readonly deps: BattleChoreoDeps
  readonly timing: Timing
  /** Snapshot de solo lectura del estado de presentación actual. */
  readonly stage: BattleStage
  patch(patch: Partial<BattleStage>): void
  actor(uid: string): StageActor | null
  sideOf(uid: string): 'player' | 'rival' | null
  patchActor(
    uid: string,
    patch: Partial<Pick<StageActor, 'damage' | 'fainted' | 'card' | 'conditions'>>,
  ): void
  pushFloater(uid: string, text: string, tone: FloaterTone): number
  dropFloater(id: number): void
  playFx(
    attack: MoveFxAttack,
    side: 'player' | 'rival',
    target: 'player' | 'rival',
  ): Promise<void>
}

export type BattleEventPlay = (event: GameEvent, api: ChoreoApi) => Promise<void>

const message = (api: ChoreoApi, text: string): void => {
  api.patch({ message: text })
}

/** combate-legible/AC-2: marca el lado cuyo ataque está en curso (desempata el
 * anuncio del gate si ambos lados están confundidos) y cierra la selección del
 * rival (fix-animacion-dados-combate/AC-2: el gate/dodge siguiente ya no es
 * del rival). */
const setActing = (api: ChoreoApi, uid: string): void => {
  const side = api.sideOf(uid)
  if (side !== null) api.patch({ actingSide: side, rivalPick: false })
}

const sendOut = async (
  api: ChoreoApi,
  input: ChoreoActorInput | undefined,
  side: 'player' | 'rival',
  text: string,
): Promise<void> => {
  if (input === undefined) return
  const actor = toStageActor(api.deps, input)
  message(api, text)
  if (actor !== null) api.patch(side === 'player' ? { player: actor, entrance: ['player'] } : { rival: actor, entrance: ['rival'] })
  await api.timing.wait(cfg.entranceMs)
  api.patch({ entrance: [] })
}

/** Encuentro: barrido de pantalla + entrada de sprites + intro (AC-1). */
export const playBattleStarted: BattleEventPlay = async (event, api) => {
  if (event.type !== 'BattleStarted') return
  // dado-de-combate/AC-5: el dado de combate arranca vacío en cada combate.
  api.patch({
    started: true, kind: event.kind, sweep: true, actingSide: 'player', rivalPick: false, message: null,
    dieValue: null, diePurpose: null, dieSide: null, dieChain: 0, lastAttackBaseDamage: null,
  })
  await api.timing.wait(cfg.encounterSweepMs)
  const playerInput = api.deps.actorOf(event.active)
  const rivalInput = api.deps.rivalEntry(event.kind, event.rival)
  const player = playerInput === undefined ? null : toStageActor(api.deps, playerInput)
  const rival = rivalInput === undefined ? null : toStageActor(api.deps, rivalInput)
  api.patch({
    sweep: false,
    entrance: ['player', 'rival'],
    ...(player !== null ? { player } : {}),
    ...(rival !== null ? { rival } : {}),
  })
  await api.timing.wait(cfg.entranceMs)
  api.patch({ entrance: [] })
  const rivalName = rival?.card.name
  message(
    api,
    event.kind === 'gym' || rivalName === undefined
      ? es.battleMsgGymIntro
      : fmt(es.battleMsgWildAppeared, { name: rivalName }),
  )
  await api.timing.wait(cfg.messageMs)
}

/** Entrenador aparece: sprite del líder en la zona rival (ER-001).
 * fix-sprites-lideres-gimnasio/AC-5: el nombre sale de content/gyms.json via
 * `leaderNameOf` (los líderes no son cartas: `cardOf` devolvía '' ⇒ " aparece.");
 * sin dep cae al id, nunca vacío. */
export const playTrainerAppeared: BattleEventPlay = async (event, api) => {
  if (event.type !== 'TrainerAppeared') return

  const trainerId = event.trainerId
  const trainerName = api.deps.leaderNameOf?.(trainerId) ?? trainerId

  api.patch({
    trainerAppeared: trainerId,
    message: es.battleMsgTrainerIntro.replace('{name}', trainerName),
  })

  // Wait for the intro animation time (250 ms)
  await api.timing.wait(cfg.trainerIntroMs)

  // Apply flash effect for 150 ms
  api.patch({ flash: 'trainer' })
  await api.timing.wait(cfg.trainerFlashMs)
  api.patch({ flash: null })
}

/** PKM entra: reemplazo del activo propio (AC-1). */
export const playPkmSentOut: BattleEventPlay = async (event, api) => {
  if (event.type !== 'PkmSentOut') return
  const input = api.deps.actorOf(event.pkmUid)
  await sendOut(api, input, 'player', fmt(es.battleMsgSentOut, { name: input ? (api.deps.cardOf(input.cardId)?.name ?? '') : '' }))
}

/** El líder repone a su PKM caído (AC-1). fix-sprites-lideres-gimnasio/AC-3:
 * al mandar al siguiente el líder se retira (trainerAppeared → null), no
 * queda pegado en escena todo el combate. */
export const playRivalSentOut: BattleEventPlay = async (event, api) => {
  if (event.type !== 'RivalSentOut') return
  if (api.stage.trainerAppeared !== null) api.patch({ trainerAppeared: null })
  const input = api.deps.actorOf(event.pkmUid)
  await sendOut(api, input, 'rival', fmt(es.battleMsgRivalSentOut, { name: input ? (api.deps.cardOf(input.cardId)?.name ?? '') : '' }))
}

/** Retiro voluntario: entra el reemplazo (AC-1). */
export const playPkmRetired: BattleEventPlay = async (event, api) => {
  if (event.type !== 'PkmRetired') return
  const leaving = api.deps.actorOf(event.from)
  const leavingName = leaving === undefined ? '' : (api.deps.cardOf(leaving.cardId)?.name ?? '')
  const next = api.deps.actorOf(event.to)
  await sendOut(api, next, 'player', fmt(es.battleMsgSentOut, { name: next === undefined ? '' : (api.deps.cardOf(next.cardId)?.name ?? '') }))
  if (leavingName.length > 0) api.patch({ message: fmt(es.battleMsgRetired, { name: leavingName }) })
}

/** Dado de combate: attackSelect alimenta el dado/fila rival (AC-1).
 * dado-de-combate/AC-3: todo propósito de combate patchea el dado del popup
 * (dieValue/diePurpose); move/oportunidad son del tablero y no tocan esta
 * escena (AC-2: oportunidad se queda en el panel-dice del tablero).
 * fix-animacion-dados-combate/AC-3/AC-4: la pausa es la tirada REAL del dado
 * (timing.dieRoll con el mismo nonce/seed que el slot, sin doble escalado);
 * arreglar-dados-combate/AC-3: esa espera también cubre el retardo disparo→
 * efecto de React y el asentamiento de la cara final.
 * rediseno-combate-max/AC-2: la tirada se muestra en el dado del lado que
 * juega ese turno (dieSide, dieSideOf) con contador de encadenadas (dieChain,
 * Doble bofetón) y nonce determinista para que el dado SIEMPRE ruede.
 * combate-legible/AC-2/AC-3: las tiradas del turno de un confundido se anuncian
 * en el chat ANTES de rodar el dado — attackSelect explica qué decide y el gate
 * explica nombre + caras del auto-ataque; el resto de los propósitos rueda como
 * siempre (el evento que los consume ya trae su mensaje). */
const CHAINED_PURPOSES: readonly string[] = ['effect', 'bonus']

export const playDieRolled: BattleEventPlay = async (event, api) => {
  if (event.type !== 'DieRolled') return
  // move/oportunidad son del tablero: no tocan el dado de combate (AC-2).
  if (!isBattleDiePurpose(event.purpose)) return
  const side = dieSideOf(api.stage, event.purpose)
  const chained =
    CHAINED_PURPOSES.includes(event.purpose) &&
    CHAINED_PURPOSES.includes(api.stage.diePurpose ?? '') &&
    api.stage.dieSide === side
  const rollPatch = {
    dieValue: event.value,
    diePurpose: event.purpose,
    dieSide: side,
    dieNonce: api.stage.dieNonce + 1,
    dieChain: chained ? api.stage.dieChain + 1 : 1,
  }
  if (event.purpose === 'attackSelect') {
    // Solo el rival elige ataque con dado (turno-automatico-rival/AC-3).
    api.patch({ actingSide: 'rival', attackSelectValue: event.value, rivalPick: true })
    message(api, fmt(es.battleMsgDieAttackSelect, { name: api.stage.rival?.card.name ?? '' }))
    await api.timing.wait(cfg.messageMs)
    api.patch(rollPatch)
    await api.timing.dieRoll(rollPatch.dieNonce)
    return
  }
  if (event.purpose === 'gate') {
    const attacker = confusedAttackerOf(api.stage)
    if (attacker !== null) {
      const faces = attacker.conditions?.rollGate?.failFaces.join('-') ?? ''
      message(api, fmt(es.battleMsgGateAnnounce, { name: attacker.card.name, faces }))
      await api.timing.wait(cfg.messageMs)
    }
  }
  api.patch(rollPatch)
  await api.timing.dieRoll(rollPatch.dieNonce)
}

/** "X usó Y" (typewriter) + carta se levanta + playMoveFx (AC-1).
 * fix-confusion-captura/AC-4: con selfHit el `target` del evento es el propio
 * atacante, y el FX se dibuja sobre ese lado (no sobre el contrario). */
export const playAttackUsed: BattleEventPlay = async (event, api) => {
  if (event.type !== 'AttackUsed') return
  const actor = api.actor(event.attacker)
  setActing(api, event.attacker)
  const side: 'player' | 'rival' = api.sideOf(event.attacker) === 'player' ? 'player' : 'rival'
  const target: 'player' | 'rival' = api.sideOf(event.target) ?? side
  const text = fmt(es.battleMsgAttackUsed, {
    name: actor?.card.name ?? '',
    move: actor?.card.attacks.find((candidate) => candidate.id === event.attackId)?.name ?? event.attackId,
  })
  await api.timing.reveal(text, (partial) => message(api, partial), {
    charMs: cfg.typewriterCharMs,
    maxMs: cfg.typewriterMaxMs,
  })
  const attack = actor?.card.attacks.find((candidate) => candidate.id === event.attackId) ?? null
  // rediseno-combate-max/AC-3: guarda el daño base del ataque usado para que
  // un DamageTaken{amount:0} distinga "base 0" de "reducido a 0".
  api.patch({ lastAttackBaseDamage: attack?.damage.base ?? null })
  // rediseno-combate-max/AC-5: cuando juega el rival, la descripción de su
  // ataque elegido aparece en el cuadro de mensajes del recuadro Game Boy.
  if (side === 'rival' && attack !== null && attack.rawText.length > 0) {
    message(api, attack.rawText)
    await api.timing.wait(cfg.messageMs)
  }
  api.patch({ raised: side })
  await api.timing.wait(cfg.raiseMs)
  const fx: MoveFxAttack = {
    ...(attack?.officialMove !== undefined ? { officialMove: attack.officialMove } : {}),
    ...(attack?.fx !== undefined ? { fx: attack.fx } : {}),
    ...(attack?.element !== undefined ? { element: attack.element } : {}),
  }
  await api.playFx(fx, side, target)
  api.patch({ raised: null })
}

/** No atacó: mensaje por motivo (AC-1); el gate fallido explica la tirada (AC-3).
 * fix-confusion-captura/AC-5: con attackSelect el mensaje informa el valor del
 * dado (attackSelectValue quedó visible en el stage tras el DieRolled). */
export const playNoAttack: BattleEventPlay = async (event, api) => {
  if (event.type !== 'NoAttack') return
  setActing(api, event.attacker)
  const name = api.actor(event.attacker)?.card.name ?? ''
  const die =
    event.value ??
    (event.reason === 'attackSelect' ? (api.stage.attackSelectValue ?? undefined) : undefined)
  const template =
    event.reason === 'attackSelect' ? es.battleMsgNoAttackDie
    : event.reason === 'asleep' ? es.battleMsgAsleep
    : event.reason === 'skip' ? es.battleMsgSkip
    : event.cause === 'paralized' && event.value !== undefined ? es.battleMsgGateParalized
    : event.cause === 'defended' && event.value !== undefined ? es.battleMsgGateDefended
    : es.battleMsgGate
  message(api, fmt(template, { name, n: die === undefined ? '' : String(die) }))
  await api.timing.wait(cfg.messageMs)
}

/** Esquive: el ataque no hace daño ni efecto (AC-1). fix-animacion-dados/
 * AC-2: cierra la acción del atacante (el gate/dodge siguiente ya no es suyo). */
export const playAttackDodged: BattleEventPlay = async (event, api) => {
  if (event.type !== 'AttackDodged') return
  setActing(api, event.attacker)
  message(api, fmt(es.battleMsgDodged, { name: api.actor(event.defender)?.card.name ?? '' }))
  await api.timing.wait(cfg.messageMs)
}

/** Efecto sin handler: el ataque resuelve sin él (AC-1). */
export const playUnsupportedEffect: BattleEventPlay = async (event, api) => {
  if (event.type !== 'UnsupportedEffect') return
  message(api, es.battleNoEffectText)
  await api.timing.wait(cfg.messageMs)
}

/** Despertó (AC-1). fix-animacion-dados-combate/AC-2: la condición `asleep`
 * sale de las conditions del actor (el motor no emite ConditionCleared). */
export const playWokeUp: BattleEventPlay = async (event, api) => {
  if (event.type !== 'WokeUp') return
  const actor = api.actor(event.pkmUid)
  const conditions = actor?.conditions
  if (conditions?.asleep !== undefined) {
    api.patchActor(event.pkmUid, { conditions: conditionsAfterWokeUp(conditions) })
  }
  message(api, fmt(es.battleMsgWokeUp, { name: actor?.card.name ?? '' }))
  await api.timing.wait(cfg.messageMs)
}

/** Auto-golpe de Confusión: explica la tirada antes del AttackUsed (AC-2). */
export const playSelfHit: BattleEventPlay = async (event, api) => {
  if (event.type !== 'SelfHit') return
  setActing(api, event.attacker)
  message(api, fmt(es.battleMsgSelfHit, { name: api.actor(event.attacker)?.card.name ?? '', n: event.value }))
  await api.timing.wait(cfg.messageMs)
}

/** Condición aplicada: mensaje por condición (AC-6). combate-legible/AC-4: las
 * conditions del actor del stage se actualizan EN VIVO (la placa muestra el
 * ícono sin esperar un sendOut). */
export const playConditionApplied: BattleEventPlay = async (event, api) => {
  if (event.type !== 'ConditionApplied') return
  const actor = api.actor(event.pkmUid)
  if (actor !== null) {
    api.patchActor(event.pkmUid, {
      conditions: conditionsAfterApplied(actor.conditions, event.condition, event.faces),
    })
  }
  const name = actor?.card.name ?? ''
  const faces = event.faces?.join('-') ?? ''
  const template =
    event.condition === 'asleep' ? es.battleMsgCondAsleep
    : event.condition === 'poison' ? es.battleMsgCondPoison
    : event.condition === 'confused' ? es.battleMsgCondConfused
    : event.condition === 'noAttackGate' ? es.battleMsgCondNoAttackGate
    : event.condition === 'skip' ? es.battleMsgCondSkip
    : event.condition === 'drain' ? es.battleMsgCondDrain
    : event.condition === 'shield' ? es.battleMsgCondShield
    : event.condition === 'selfBoost' ? es.battleMsgCondSelfBoost
    : event.condition === 'weakened' ? es.battleMsgCondWeakened
    : es.battleMsgCondDodge
  message(api, fmt(template, { name, faces }))
  await api.timing.wait(cfg.messageMs)
}

/** Condición nextTurn consumida al fin del turno (AC-4).
 * combate-legible/AC-4: el slot sale de las conditions del actor del stage. */
export const playConditionCleared: BattleEventPlay = async (event, api) => {
  if (event.type !== 'ConditionCleared') return
  const actor = api.actor(event.pkmUid)
  if (actor !== null && actor.conditions !== undefined) {
    api.patchActor(event.pkmUid, {
      conditions: conditionsAfterCleared(actor.conditions, event.condition),
    })
  }
  const name = actor?.card.name ?? ''
  const template =
    event.condition === 'confused' ? es.battleMsgCondClearedConfused
    : event.condition === 'noAttackGate' ? es.battleMsgCondClearedNoAttackGate
    : event.condition === 'skip' ? es.battleMsgCondClearedSkip
    : event.condition === 'weakened' ? es.battleMsgCondClearedWeakened
    : es.battleMsgCondCleared
  message(api, fmt(template, { name }))
  await api.timing.wait(cfg.messageMs)
}

/** Derrota: el sprite cae y queda deshabilitado (AC-1). */
export const playPokemonFainted: BattleEventPlay = async (event, api) => {
  if (event.type !== 'PokemonFainted') return
  api.patchActor(event.pkmUid, { fainted: true })
  api.patch({ blink: null, raised: null })
  message(api, fmt(es.battleMsgFainted, { name: api.actor(event.pkmUid)?.card.name ?? '' }))
  await api.timing.wait(cfg.faintedMs)
}

/** Fin de la batalla (AC-1). */
export const playBattleEnded: BattleEventPlay = async (event, api) => {
  if (event.type !== 'BattleEnded') return
  api.patch({ ended: event.result, raised: null, attackSelectValue: null })
  message(api, event.result === 'won' ? es.battleMsgWon : es.battleMsgLost)
  await api.timing.wait(cfg.messageMs)
}

/** +XP por combate ganado (AC-1). */
export const playXpGained: BattleEventPlay = async (event, api) => {
  if (event.type !== 'XpGained') return
  const floaterId = api.pushFloater(event.pkmUid, `+${event.amount} XP`, 'xp')
  await api.timing.wait(cfg.xpMs)
  api.dropFloater(floaterId)
}

/** Evolución: secuencia clásica (cargar-charmeleon-animar-evolucion/AC-4) —
 * pulsos de silueta crecientes → destello → cambio de sprite → revelación,
 * conservando daño; ≤ 3,5 s a 1× (SPEC-D/T-032d/AC-2). */
export const playPkmEvolved: BattleEventPlay = async (event, api) => {
  if (event.type !== 'PkmEvolved') return
  const before = api.actor(event.pkmUid)
  for (let pulse = 1; pulse <= ANIMATION_CONFIG.evolvePulses; pulse += 1) {
    api.patch({ evolve: { uid: event.pkmUid, phase: 'pulse', pulse } })
    await api.timing.wait(ANIMATION_CONFIG.evolvePulseMs)
  }
  api.patch({ flash: 'evolve' })
  await api.timing.wait(Math.round(cfg.evolveFlashMs / 2))
  const card: PokemonCard | undefined = api.deps.cardOf(event.to)
  if (card !== undefined) api.patchActor(event.pkmUid, { card })
  await api.timing.wait(Math.round(cfg.evolveFlashMs / 2))
  api.patch({ flash: null, evolve: { uid: event.pkmUid, phase: 'reveal', pulse: 0 } })
  await api.timing.wait(ANIMATION_CONFIG.evolveRevealMs)
  api.patch({ evolve: null })
  message(api, fmt(es.battleMsgEvolved, { name: before?.card.name ?? '', to: card?.name ?? event.to }))
  await api.timing.wait(cfg.messageMs)
}

/** Captura: arco, 3 sacudidas y destello; el evento ya decidió el resultado (AC-1). */
export const playPokemonCaptured: BattleEventPlay = async (event, api) => {
  if (event.type !== 'PokemonCaptured') return
  const name = api.deps.cardOf(event.card)?.name ?? event.card
  const arc: CaptureVisual = { phase: 'arc', shakes: 0 }
  api.patch({ capture: arc })
  await api.timing.wait(cfg.captureArcMs)
  for (let shake = 1; shake <= 3; shake += 1) {
    api.patch({ capture: { phase: 'shake', shakes: shake } })
    await api.timing.wait(cfg.captureShakeMs)
  }
  api.patch({ capture: { phase: 'caught', shakes: 3 }, flash: 'capture' })
  await api.timing.wait(cfg.captureFlashMs)
  api.patch({ capture: null, flash: null, rival: null })
  message(api, fmt(es.battleMsgCaptured, { name }))
  await api.timing.wait(cfg.messageMs)
}

/** Gimnasio cerrado por medallas (AC-1). */
export const playGymLocked: BattleEventPlay = async (event, api) => {
  if (event.type !== 'GymLocked') return
  message(api, fmt(es.battleMsgGymLocked, { n: event.requiresMedals }))
  await api.timing.wait(cfg.messageMs)
}

/** Medalla del líder (AC-1). */
export const playMedalWon: BattleEventPlay = async (event, api) => {
  if (event.type !== 'MedalWon') return
  api.patch({ flash: 'medal' })
  message(api, fmt(es.battleMsgMedal, { medal: event.medal }))
  await api.timing.wait(cfg.evolveFlashMs)
  api.patch({ flash: null })
  await api.timing.wait(cfg.messageMs)
}

/** Premio PKM del líder (AC-1). */
export const playPrizePkmWon: BattleEventPlay = async (event, api) => {
  if (event.type !== 'PrizePkmWon') return
  message(api, fmt(es.battleMsgPrize, { name: api.deps.cardOf(event.card)?.name ?? event.card }))
  await api.timing.wait(cfg.messageMs)
}

/** Medallas completas (AC-1). */
export const playGameWon: BattleEventPlay = async (event, api) => {
  if (event.type !== 'GameWon') return
  message(api, es.battleMsgGameWon)
  await api.timing.wait(cfg.messageMs)
}

/** Centro PKM: el equipo propio queda sin daño (AC-1; T-061: PartyHealed{count}). */
export const playPartyHealed: BattleEventPlay = async (event, api) => {
  if (event.type !== 'PartyHealed') return
  const player = api.stage.player
  if (player !== null) api.patchActor(player.uid, { damage: 0, fainted: false })
  message(api, es.battleMsgTeamHealed)
  await api.timing.wait(cfg.messageMs)
}

export const battleEventPlays: Readonly<Record<string, BattleEventPlay>> = {
  BattleStarted: playBattleStarted,
  PkmSentOut: playPkmSentOut,
  RivalSentOut: playRivalSentOut,
  PkmRetired: playPkmRetired,
  DieRolled: playDieRolled,
  AttackUsed: playAttackUsed,
  NoAttack: playNoAttack,
  AttackDodged: playAttackDodged,
  UnsupportedEffect: playUnsupportedEffect,
  DamageTaken: playDamageTaken,
  Healed: playHealed,
  WokeUp: playWokeUp,
  SelfHit: playSelfHit,
  ConditionApplied: playConditionApplied,
  ConditionCleared: playConditionCleared,
  PokemonFainted: playPokemonFainted,
  BattleEnded: playBattleEnded,
  XpGained: playXpGained,
  PkmEvolved: playPkmEvolved,
  PokemonCaptured: playPokemonCaptured,
  GymLocked: playGymLocked,
  MedalWon: playMedalWon,
  PrizePkmWon: playPrizePkmWon,
  GameWon: playGameWon,
  PartyHealed: playPartyHealed,
  TrainerAppeared: playTrainerAppeared,
}
