// Popup de combate/intercambio (SPEC-I/T-075 + rediseno-combate-max): la
// escena coreografiada (chunk lazy de combate, ADR-8) vive dentro del
// contenedor único del shell; "Ampliar" cambia la caja (lo aplica el shell
// via layout.json; la caja expandida es la ventana completa y este header de
// 56 px es la barra que se descuenta, nota n.º 8). Sin título "PKM salvaje"
// ni pie con "Pasar": las acciones viven en las pestañas de la escena (AC-6).
// El guion de eventos llega por incrementos: cada comando agrega, no repite.
// T-108: con BattleEnded en el guion se muestra el overlay de resultado y el
// popup solo se cierra con "Continuar"; tras "Continuar" con captura
// pendiente la escena queda congelada y la coreografía de captura cierra
// sola al terminar (onScriptDone).
// captura-en-popup-combate: la decisión Capturar/Dejar ir vive en el PIE de
// este popup (D-31 revertido): aparece con el resultado consumido (escena
// congelada) o sin guion pendiente (partida restaurada).
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Command,
  GameEvent,
  GameState,
} from '@liga/engine'
import type { PlaybackSpeed } from '../events/anim.config'
import type { BattleChoreoDeps } from '../battle/choreo/stage'
import { resumeStage } from '../battle/choreo/resume'
import { cardOf, gameContent } from '../game/content'
import { es } from '../i18n/es'
import { BOARD3D } from '../theme/board3d'
import type { TeamPkmView } from '../battle/controls'
import {
  battleMedal,
  battleResultPending,
  battleResultPlayed,
  battleScriptPlaying,
  battleShouldDispatch,
  battleShouldResume,
  presentationActorOf,
  presentationRivalEntry,
  type BattleDispatchLatch,
} from './model'
import styles from './popup.module.css'

// ADR-8: la escena (con sus FX) se carga recién al abrirse el popup.
const ChoreographedBattle = lazy(async () => {
  const mod = await import('../battle/ChoreographedBattle')
  return { default: mod.ChoreographedBattle }
})

export interface BattlePopupProps {
  readonly state: GameState
  /** legalCommands(state): la legalidad la dictaminó el motor. */
  readonly legal: readonly Command[]
  /** Eventos del combate acumulados (BattleStarted → …). */
  readonly script: readonly GameEvent[]
  /** sync-estado-combate: snapshot del prefijo ya reproducido del guion (el
   * estado del último comando cuyo lote terminó de mostrarse); null ⇒ estado
   * final. Alimenta `actorOf`/`rivalEntry` (actores que entran a escena) y la
   * lista de equipo de la escena: nada de combate se adelanta a su evento. */
  readonly viewState?: GameState | null
  readonly speed: PlaybackSpeed
  readonly reducedMotion: boolean
  /** D-30: solo el jugador activo ve controles. */
  readonly viewingOwn: boolean
  readonly expanded: boolean
  readonly onExpandToggle: () => void
  /** medalla-gimnasio/AC-3: manifest de insignias {medal → ruta} (badges.json). */
  readonly badges?: Readonly<Record<string, string>> | null
  /** fin-de-combate/AC-4: el resultado ya se consumió ("Continuar") con
   * captura pendiente: escena congelada, sin overlay ni pie. */
  readonly resultDismissed?: boolean
  /** SPEC-R/T-103/AC-1: abre la ventana de la carta del rival (solo lectura). */
  readonly onInspectRival?: () => void
  readonly onCommand: (command: Command) => void
  /** T-108/AC-2: cierra el popup tras el resultado (limpia el guion en PlayScreen). */
  readonly onContinue?: () => void
  /** fin-de-combate/AC-5: la cola terminó de reproducirse (auto-cierre). */
  readonly onScriptDone?: () => void
}

/** medalla-gimnasio/AC-1: bloque de medalla del overlay de resultado.
 * Todo deriva del `MedalWon` del guion (battleMedal): texto con el nombre de
 * la medalla, líder desde gyms.json e insignia del manifest (AC-4: sin
 * manifest, disco CSS con el color de decor.medalColors + nombre). */
export interface BattleResultMedal {
  readonly medal: string
  readonly leader: string | null
  readonly badgeUrl: string | null
  readonly color: string
}

/** fin-de-combate/AC-2: cartel de resultado (Ganaste/Perdiste + Continuar).
 * Se pinta recién cuando TODO el guion se reprodujo (battleResultPlayed). */
export function BattleResultOverlay({
  result,
  medal = null,
  onContinue,
}: {
  readonly result: 'won' | 'lost'
  readonly medal?: BattleResultMedal | null
  readonly onContinue?: () => void
}): ReactNode {
  return (
    <div className={styles.battleResultOverlay} data-testid="battle-result-overlay">
      <p className={styles.battleResultText} data-testid="battle-result-text">
        {result === 'won' ? es.battleMsgWon : es.battleMsgLost}
      </p>
      {medal !== null ? (
        <div className={styles.battleMedal} data-testid="gym-medal-block">
          <p className={styles.battleMedalText} data-testid="gym-medal-text">
            {es.battleResultMedal.replace('{medal}', medal.medal)}
          </p>
          {medal.leader !== null ? (
            <p className={styles.battleMedalLeader}>{es.battleResultMedalLeader.replace('{leader}', medal.leader)}</p>
          ) : null}
          {medal.badgeUrl !== null ? (
            <img
              className={styles.battleMedalImg}
              data-testid="gym-medal-img"
              src={medal.badgeUrl}
              alt={es.battleResultMedal.replace('{medal}', medal.medal)}
            />
          ) : (
            <span
              className={styles.battleMedalFallback}
              data-testid="gym-medal-fallback"
              style={{ background: medal.color }}
            >
              {medal.medal}
            </span>
          )}
        </div>
      ) : null}
      <button
        type="button"
        className={styles.action}
        data-testid="btn-battle-continue"
        onClick={onContinue}
      >
        {es.popupBattleContinue}
      </button>
    </div>
  )
}

export function BattlePopup({
  state,
  legal,
  script,
  viewState = null,
  speed,
  reducedMotion,
  viewingOwn,
  expanded,
  onExpandToggle,
  badges = null,
  resultDismissed = false,
  onInspectRival,
  onCommand,
  onContinue,
  onScriptDone,
}: BattlePopupProps): ReactNode {
  // fin-de-combate: progreso de reproducción del guion (AC-1/AC-2). El guion
  // solo crece durante una batalla; al vaciarse el popup se desmonta, pero el
  // reset cubre re-montajes sobre un guion ya limpio.
  const [played, setPlayed] = useState(0)
  useEffect(() => {
    if (script.length === 0) setPlayed(0)
  }, [script])
  // Deps estables (el coreógrafo vive mientras monte): leen el estado via ref.
  // sync-estado-combate: los actores se resuelven desde el snapshot del
  // prefijo reproducido (viewState) con fallback al final — el daño/desmayo de
  // eventos aún no reproducidos no se adelanta a la escena.
  const sourcesRef = useRef<{ view: GameState; final: GameState }>({ view: state, final: state })
  sourcesRef.current = { view: viewState ?? state, final: state }
  const deps = useMemo<BattleChoreoDeps>(
    () => ({
      cardOf,
      actorOf: (uid) => {
        const { view, final } = sourcesRef.current
        return presentationActorOf(view, final, uid)
      },
      rivalEntry: (kind, ref) => {
        const { view, final } = sourcesRef.current
        return presentationRivalEntry(view, final, kind, ref)
      },
      // fix-sprites-lideres-gimnasio/AC-5: nombre del líder desde gyms.json.
      leaderNameOf: (leaderId) =>
        gameContent.gyms.find((gym) => gym.id === leaderId)?.name,
    }),
    [],
  )

  const battle = state.battle
  // fix-combate-refresco: guion vacío + batalla viva (partida restaurada) ⇒
  // snapshot inicial derivado de state.battle (AC-1); solo cuenta al montar.
  const initialStage = useMemo(
    () => (battleShouldResume(script, battle) ? resumeStage(state, deps) : null),
    [script, battle, state, deps],
  )
  const capturePending = state.pending?.type === 'CaptureOrRelease' ? state.pending : null
  const captureMode = capturePending !== null
  // reemplazo-tras-desmayo/AC-1: con el activo caído hay reemplazo obligatorio
  // (ChooseReplacement ⇒ pestaña "Cambiar" forzada en la escena).
  const forceSwitch = state.pending?.type === 'ChooseReplacement'
  // fin-de-combate/AC-3: los controles se ocultan POR GUION (no por
  // reproducción): sin comandos sobre una batalla ya resuelta.
  const actionsHidden = battleResultPending(script) !== null
  // AC-1/AC-2: el resultado se muestra recién con TODO el guion reproducido;
  // AC-4: tras "Continuar" con captura pendiente, la escena queda congelada.
  const result = resultDismissed ? null : battleResultPlayed(script, played)
  // captura-en-popup-combate/AC-1: el pie de captura aparece con el resultado
  // consumido ("Continuar", escena congelada) o sin BattleEnded pendiente en
  // el guion (partida restaurada, AC-7); mientras el overlay espera
  // "Continuar" no (AC-5: sin captura pendiente el popup queda igual que hoy).
  const captureDecision = captureMode && (resultDismissed || !actionsHidden)
  const captureName = capturePending === null
    ? null
    : (cardOf(capturePending.card)?.name ?? capturePending.card)
  // medalla-gimnasio/AC-1: bloque de medalla del overlay, derivado del guion
  // (battleMedal) + contenido (líder, color) + manifest (insignia, AC-4).
  const medalBlock = useMemo<BattleResultMedal | null>(() => {
    if (result !== 'won') return null
    const won = battleMedal(script)
    if (won === null) return null
    const colors = BOARD3D.decor.medalColors
    return {
      medal: won.medal,
      leader: gameContent.gyms.find((gym) => gym.id === won.gym)?.name ?? null,
      badgeUrl: badges?.[won.medal] ?? null,
      color: colors[won.medal as keyof typeof colors] ?? 'var(--color-accent)',
    }
  }, [result, script, badges])
  const myTurn =
    viewingOwn && battle !== null && !battle.won && battle.turnSide === 0 && !captureMode && !actionsHidden
  // retirada-solo-inicio-turno/AC-6: mientras el guion se reproduce los
  // controles de combate no despachan comandos (rediseno: además bloquean las
  // pestañas hasta mi próximo turno).
  const playing = battleScriptPlaying(script, played)
  // rediseno-combate-max/AC-6: espectador ⇒ pestañas deshabilitadas con
  // "Turno de {nombre}".
  const activeIndex = state.players.findIndex((player) => player.id === state.activePlayerId)
  const turnOfName = viewingOwn
    ? null
    : es.hudPlayerName.replace('{n}', String(activeIndex < 0 ? 1 : activeIndex + 1))
  // Latch anti doble-dispatch — el segundo click casi simultáneo (mismo
  // comando sobre el mismo estado) se ignora sin esperar la animación.
  const latchRef = useRef<BattleDispatchLatch | null>(null)
  const dispatch = (command: Command): void => {
    if (playing || !battleShouldDispatch(latchRef.current, command, state)) return
    latchRef.current = { command, state }
    onCommand(command)
  }

  // sync-estado-combate/AC-2: la lista de equipo de la escena (pestaña
  // Cambiar) también muestra el prefijo reproducido mientras corre el guion.
  const viewValue = viewState ?? state
  const viewOwn = viewValue.players.find((player) => player.id === viewValue.activePlayerId)
  const team: readonly TeamPkmView[] = useMemo(
    () =>
      (viewOwn?.team ?? []).map((pkm) => {
        const card = cardOf(pkm.cardId)
        return {
          uid: pkm.uid,
          name: card?.name ?? String(pkm.cardId),
          hpMax: card?.hp ?? 0,
          damage: pkm.damage,
          fainted: pkm.fainted,
        }
      }),
    [viewOwn?.team],
  )
  // Ítems/mochila: datos de control (motor), siempre del estado final.
  const own = state.players.find((player) => player.id === state.activePlayerId)
  const rivalFirst = battle?.rival[0]
  const rivalCard = battle === null ? undefined : cardOf(battle.kind === 'wild' ? battle.card : battle.gym)
  const rivalRemainingHp =
    rivalCard !== undefined && rivalFirst !== undefined
      ? Math.max(0, rivalCard.hp - rivalFirst.damage)
      : null

  return (
    <div className={styles.battlePopup} data-battle-popup="battle">
      {/* rediseno-combate-max/AC-0: header de 56 px, SOLO "Restaurar" (el
          título "PKM salvaje" y el pie "Pasar" se eliminaron). */}
      <header className={styles.battleHeader} data-testid="battle-popup-header">
        <button
          type="button"
          className={styles.expand}
          data-testid="btn-battle-expand"
          aria-expanded={expanded}
          onClick={onExpandToggle}
        >
          {expanded ? es.popupBattleRestore : es.popupBattleExpand}
        </button>
      </header>
      <div className={styles.battleScene}>
        <Suspense fallback={<p data-battle-loading="true">{es.battleLoading}</p>}>
          <ChoreographedBattle
            deps={deps}
            script={script}
            {...(initialStage !== null ? { initialStage } : {})}
            speed={speed}
            reducedMotion={reducedMotion}
            firstTurn={
              battle !== null && battle.active[0] !== undefined
                ? battle.firstTurn.includes(battle.active[0])
                : true
            }
            onPlayed={setPlayed}
            legal={myTurn ? legal : []}
            myTurn={myTurn}
            blocked={playing}
            {...(team.length > 0 ? { team } : {})}
            {...(battle?.active[0] !== undefined ? { activeUid: battle.active[0] } : {})}
            {...(own?.items !== undefined ? { items: own.items } : {})}
            {...(battle !== null ? { battleKind: battle.kind } : {})}
            {...(rivalRemainingHp !== null ? { rivalRemainingHp } : {})}
            {...(state.ruleset?.capture !== undefined ? { capture: state.ruleset.capture } : {})}
            {...(turnOfName !== null ? { turnOfName } : {})}
            forceSwitch={forceSwitch}
            onCommand={dispatch}
            {...(onScriptDone !== undefined ? { onDone: onScriptDone } : {})}
            {...(onInspectRival !== undefined ? { onRivalCardClick: onInspectRival } : {})}
          />
        </Suspense>
        {result !== null ? (
          <BattleResultOverlay
            result={result}
            medal={medalBlock}
            {...(onContinue !== undefined ? { onContinue } : {})}
          />
        ) : null}
      </div>
      {captureDecision && captureName !== null ? (
        <footer className={styles.captureFooter} data-testid="capture-footer">
          <p className={styles.capturePrompt}>
            {es.tileCapturePrompt.replace('{name}', captureName)}
          </p>
          <div className={styles.captureActions}>
            {/* AC-3: Capturar gated por Pokebolas (D-12); Dejar ir siempre. */}
            {(own?.items?.pokeball ?? 0) > 0 ? (
              <button
                type="button"
                className={styles.action}
                data-testid="btn-capture"
                data-command="Capture"
                onClick={() => dispatch({ type: 'Capture' })}
              >
                {es.battleCapture}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.action}
              data-testid="btn-release"
              data-command="Release"
              onClick={() => dispatch({ type: 'Release' })}
            >
              {es.battleRelease}
            </button>
          </div>
        </footer>
      ) : null}
    </div>
  )
}
