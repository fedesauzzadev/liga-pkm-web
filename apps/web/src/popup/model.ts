// Popups (SPEC-I/T-075): modelo puro de visibilidad. La legalidad la decide
// el motor (legalCommands); rediseno-combate-max/AC-6 movió el mapeo de
// comandos → botones a las pestañas de la escena (battle/controls.ts, sin
// "Pasar") y este archivo quedó con visibilidad/resultado/guion. T-108:
// resultado del combate pendiente de confirmar (overlay + Continuar).
// fin-de-combate: el overlay espera la reproducción completa del guion y el
// guion sobrevive a "Continuar" mientras pende la captura (BattleEnded queda
// en el guion ⇒ battlePopupKind se mantiene en 'battle': escena congelada).
import type {
  BattleState,
  Command,
  Decision,
  GameEvent,
  GameState,
} from '@liga/engine'
import type { ChoreoActorInput } from '../battle/choreo/stage'

/** AC-5/AC-6: qué muestra el ÚNICO contenedor popup-battle (la batalla gana).
 * `oakOpen` lo abren btn-oak (T-074) o el pending OakSwap (auto-apertura).
 * T-108: con `resultPending` (BattleEnded sin Continuar) también queda 'battle'
 * aunque `state.battle` ya sea null (la escena no se cierra sola).
 * captura-en-popup-combate/AC-1 (D-31 revertido): el pending CaptureOrRelease
 * vuelve a abrir el popup — la decisión de captura vive en su pie. */
export type BattlePopupKind = 'battle' | 'oak' | null

export function battlePopupKind(
  state: GameState,
  oakOpen: boolean,
  resultPending: 'won' | 'lost' | null = null,
): BattlePopupKind {
  if (
    state.battle !== null ||
    resultPending !== null ||
    state.pending?.type === 'CaptureOrRelease'
  ) {
    return 'battle'
  }
  if (oakOpen) return 'oak'
  return null
}

/** T-108/AC-1,AC-4: ¿qué resultado quedó esperando Continuar? El ÚLTIMO
 * BattleEnded del guion (tras él pueden venir XpGained/MedalWon/TurnAdvanced). */
export function battleResultPending(script: readonly GameEvent[]): 'won' | 'lost' | null {
  for (let i = script.length - 1; i >= 0; i -= 1) {
    const event = script[i]
    if (event?.type === 'BattleEnded') return event.result
  }
  return null
}

/** medalla-gimnasio/AC-1: medalla ganada según el guion (último MedalWon):
 * alimenta el bloque de medalla del overlay; nada depende de la animación. */
export interface BattleMedal {
  readonly gym: string
  readonly medal: string
}

export function battleMedal(script: readonly GameEvent[]): BattleMedal | null {
  for (let i = script.length - 1; i >= 0; i -= 1) {
    const event = script[i]
    if (event?.type === 'MedalWon') return { gym: event.gym, medal: event.medal }
  }
  return null
}

/** fin-de-combate/AC-1,AC-2: resultado listo para mostrarse: el guion tiene
 * BattleEnded Y ya se reprodujo TODO (la coreografía del golpe final terminó).
 * Con `skip`/reducedMotion la reproducción es instantánea ⇒ overlay inmediato
 * (mismo comportamiento que antes). */
export function battleResultPlayed(
  script: readonly GameEvent[],
  played: number,
): 'won' | 'lost' | null {
  const result = battleResultPending(script)
  if (result === null || played < script.length) return null
  return result
}

/** fin-de-combate/AC-4: "Continuar" con captura pendiente NO cierra el popup:
 * el guion sobrevive (escena congelada) y la decisión de captura vive en el
 * pie del popup (captura-en-popup-combate). Sin captura pendiente se limpia
 * (T-108). */
export const battleScriptAfterContinue = (pending: Decision | null): 'keep' | 'clear' =>
  pending?.type === 'CaptureOrRelease' ? 'keep' : 'clear'

/** fin-de-combate: próximo guion tras un comando exitoso.
 * - En flujo de batalla acumula por comando (T-075).
 * - `Release` limpia directo: cierre inmediato, sin animación (AC-6).
 * - `Capture` sobre una escena viva acumula `PokemonCaptured` para reproducir
 *   la coreografía de captura y cerrar al terminar (AC-5); con guion vacío
 *   (partida restaurada, AC-8) resuelve directo: no hay escena que animar.
 * - `BattleEnded` en el lote conserva el guion hasta "Continuar" (T-108). */
export function battleScriptAfterCommand(
  prev: readonly GameEvent[],
  command: Command,
  events: readonly GameEvent[],
  inBattleFlow: boolean,
): readonly GameEvent[] {
  if (inBattleFlow) return [...prev, ...events]
  if (command.type === 'Release') return []
  if (command.type === 'Capture' && prev.length > 0) return [...prev, ...events]
  const next = [...prev, ...events]
  if (battleResultPending(next) !== null) return next
  return prev.length === 0 ? prev : []
}

/** fin-de-combate/AC-5: auto-cierre del popup cuando la cola terminó de
 * reproducirse (onScriptDone) con el resultado ya consumido ("Continuar") y la
 * batalla y la decisión resueltas: la captura cierra sola, sin clic extra. */
export const battleShouldAutoClose = (
  state: GameState,
  resultDismissed: boolean,
  scriptAlive: boolean,
): boolean =>
  resultDismissed && scriptAlive && state.battle === null && state.pending === null

/** fix-combate-refresco/AC-1: ¿reanuda la escena desde el estado persistido?
 * Guion vacío con batalla viva (partida restaurada: el restore no re-emite
 * eventos históricos) ⇒ el popup reconstruye el stage desde state.battle. */
export const battleShouldResume = (
  script: readonly GameEvent[],
  battle: BattleState | null,
): boolean => script.length === 0 && battle !== null

/** retirada-solo-inicio-turno/AC-6: el guion de combate sigue reproduciéndose
 * (misma señal que fin-de-combate): mientras tanto, los botones de acción del
 * pie y el menú de la escena no despachan comandos (quedan deshabilitados). */
export const battleScriptPlaying = (script: readonly GameEvent[], played: number): boolean =>
  played < script.length

// ── sync-estado-combate: presentación derivada del prefijo ya reproducido ──

/** sync-estado-combate/AC-2: actor de presentación. Mientras el guion corre,
 * los actores que ENTRAN a escena (PkmSentOut/PkmRetired/RivalSentOut) se
 * resuelven desde el snapshot del prefijo ya reproducido (`view`), no desde el
 * estado final: el daño/desmayo/condiciones que aún no se reprodujeron no se
 * adelantan. El estado final (`final`) cubre por fallback lo creado en el lote
 * en curso (p. ej. el roster rival del BattleStarted, que nace sin daño en el
 * prefijo). */
const actorIn = (state: GameState, uid: string): ChoreoActorInput | undefined => {
  const own = state.players.find((player) => player.id === state.activePlayerId)
  const pkm = own?.team.find((candidate) => candidate.uid === uid)
  if (pkm !== undefined) {
    return {
      uid,
      cardId: pkm.cardId,
      damage: pkm.damage,
      fainted: pkm.fainted,
      pkm,
      ...(state.battle?.conditions[uid] !== undefined
        ? { conditions: state.battle.conditions[uid] }
        : {}),
    }
  }
  const rival = state.battle?.rival.find((candidate) => candidate.uid === uid)
  return rival === undefined
    ? undefined
    : {
        uid,
        cardId: rival.cardId,
        damage: rival.damage,
        fainted: rival.fainted,
        ...(state.battle?.conditions[uid] !== undefined
          ? { conditions: state.battle.conditions[uid] }
          : {}),
      }
}

/** sync-estado-combate/AC-2: resuelve un actor para la coreografía desde el
 * estado de presentación (prefijo reproducido) con fallback al final. */
export const presentationActorOf = (
  view: GameState,
  final: GameState,
  uid: string,
): ChoreoActorInput | undefined => actorIn(view, uid) ?? actorIn(final, uid)

/** sync-estado-combate/AC-2: primer rival del encuentro para la coreografía:
 * manda la batalla del snapshot (prefijo reproducido); si el snapshot aún no
 * tiene batalla (primer lote: BattleStarted en cola), cae a la final. */
export const presentationRivalEntry = (
  view: GameState,
  final: GameState,
  kind: 'wild' | 'gym',
  ref: string,
): ChoreoActorInput | undefined => {
  const matches = (battle: BattleState | null): battle is BattleState =>
    battle !== null && battle.kind === kind && (battle.kind === 'wild' ? battle.card : battle.gym) === ref
  const battle = matches(view.battle) ? view.battle : matches(final.battle) ? final.battle : null
  if (battle === null) return undefined
  const first = battle.rival.find((candidate) => !candidate.fainted) ?? battle.rival[0]
  return first === undefined ? undefined : { uid: first.uid, cardId: first.cardId, damage: first.damage, fainted: first.fainted }
}

/** sync-estado-combate/AC-1,AC-2: snapshot de presentación tras un comando que
 * acumula guion: el PRIMER lote retiene el estado pre-comando (prefijo ya
 * reproducido); los siguientes lo mantienen (su lote aún no terminó de
 * mostrarse). Sin guion vivo (fin/limpieza) el snapshot se suelta (null ⇒
 * estado final). */
export const battleViewAfterCommand = (
  prev: GameState | null,
  preCommand: GameState,
  scriptAlive: boolean,
): GameState | null => (scriptAlive ? (prev ?? preCommand) : null)

/** sync-estado-combate/AC-3: el guion terminó de reproducirse ⇒ la presentación
 * pasa al estado final del motor; sin guion vivo no hay snapshot que retener. */
export const battleViewAfterScriptDone = (
  scriptAlive: boolean,
  finalState: GameState,
): GameState | null => (scriptAlive ? finalState : null)

/** retirada-solo-inicio-turno/AC-7: latch anti doble-dispatch. Un comando
 * idéntico sobre el MISMO estado (segundo click casi simultáneo, antes de que
 * llegue el estado nuevo) se ignora; con un estado nuevo el comando vuelve a
 * valer (p. ej. dos pociones seguidas, D-11). */
export interface BattleDispatchLatch {
  readonly command: Command
  readonly state: GameState
}

const commandKey = (command: Command): string => JSON.stringify(command)

export function battleShouldDispatch(
  latch: BattleDispatchLatch | null,
  command: Command,
  state: GameState,
): boolean {
  if (latch === null) return true
  return latch.state !== state || commandKey(latch.command) !== commandKey(command)
}

/**
 * AC-3: factor uniforme para que la escena entre en su popup (container query
 * de tamaño) manteniendo la proporción, a tamaño normal y ampliado. Sin
 * medidas (SSR) no escala. rediseno-combate-max: la escala del lienzo de
 * combate la consume BattleStageView (1440×810); FitBox queda para el popup
 * chico de carta.
 */
export function fitScale(boxW: number, boxH: number, naturalW: number, naturalH: number): number {
  if (boxW <= 0 || boxH <= 0 || naturalW <= 0 || naturalH <= 0) return 1
  return Math.min(boxW / naturalW, boxH / naturalH)
}