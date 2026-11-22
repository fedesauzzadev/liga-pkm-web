// Juego real (SPEC-D/T-034): cablea el motor con el store. La UI solo envía
// comandos (data-command) y reproduce eventos por el EventPlayer; el estado
// vive en la sesión pura (session.ts). Autosave a cada comando (AC-2).
// T-061: el panel de casillero muestra eventos/pending y manda los comandos.
// T-074: los paneles del HUD (turno, equipo, jugadores, Reserva de Oak y menú)
// llenan el shell; el overlay queda para el panel de casillero y la ficha.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Command, GameEvent, PlayerState } from '@liga/engine'
import { legalCommands, createRng } from '@liga/engine'
import { parseCardId } from '@liga/content'
import type { BoardMode } from '../board/BoardHost'
import { drawFromEvents, movePathFromEvents, type BoardTokenSpec, type DrawSpec } from '../board/Board'
import type { DieValue } from '../board/Die3D'

import { useBadges, useSprites } from '../battle/sprites'
import { recordCommand } from '../debug/session'
import { MenuSettings } from '../hud/MenuSettings'
import { type HistoryFilter } from '../hud/HistoryPanel'
import { appendHistory, historyLogI18n, type HistoryEntry } from '../hud/history'
import { appendDiceRolls, type DiceRoll } from '../hud/DicePanel'
import { useGameStore } from '../events/store'
import { evolveShowFromEvent, type EvolveShow } from '../events/EvolveOverlay'
import { battlePopupKind, battleResultPending, battleScriptAfterCommand, battleViewAfterCommand } from '../popup/model'

import { cardModalActions, cardModalSpec, type CardModalTarget } from '../cardmodal/model'
import { uiLayout } from '../shell/layout'
import { GameShell } from '../shell/GameShell'
import { cardOf, contentHash, gameContent } from './content'
import { devRng, devToolsEnabled } from './devmode'
import { LoadingScreen } from './LoadingScreen'
import { DEFAULT_SETTINGS, type GameSettings } from './settings'
import { saveFromSession, applyToSession, type GameSession } from './session'

import { writeSave, type StorageLike } from './save'

import { buildHud } from './play/hud'
import { renderBattlePopup } from './play/battle'
import { renderModal } from './play/modal'
import { renderOverlay } from './play/overlay'
import {
  boardRollsFromEvents, deckCountsOf, encounterOptionsOf, isTileEvent, nextDrawSpec,
  pendingDecisionOf, tilePendingOf, tilePlayerOf,
} from './play/derive'
import { gymLeaderOf, oakNamesOf, tileMessagesOf } from './play/derive'
import { renderTeamDetail } from './play/detail'
import { renderWorld } from './play/world'
import { renderCardPopup, renderEncounterPopup } from './play/popups'

import { boardTokenSpecs } from './play/derive'
export { boardTokenSpecs, isBoardDiePurpose } from './play/derive'

type EvolvedEvent = Extract<GameEvent, { readonly type: 'PkmEvolved' }>

export interface PlayScreenProps {
  readonly session: GameSession
  readonly storage: StorageLike
  readonly onExit: () => void
  /** T-062: tablero 2D/3D según Ajustes (default 3D con fallback a 2D). */
  readonly boardMode?: BoardMode
  /** T-074: ajustes actuales (menú) y cómo cambiarlos (persisten en GameApp). */
  readonly settings?: GameSettings
  readonly onSettingsChange?: (next: GameSettings) => void
  /** SPEC-R/T-103: uid inicial de la ventana de carta (tests/red de regresión). */
  readonly initialCardModalUid?: string
}

export function PlayScreen({
  session,
  storage,
  onExit,
  boardMode = '3d',
  settings = DEFAULT_SETTINGS,
  onSettingsChange,
  initialCardModalUid,
}: PlayScreenProps) {
  const [current, setCurrent] = useState(session)
  // T-092: tiradas del dado de tablero hacia panel-dice (dado-de-combate/AC-2:
  // solo move/oportunidad; el valor lo dicta el motor, Animación ≠ lógica).
  // moveHint alimenta el aviso del 3D.
  const [diceRolls, setDiceRolls] = useState<readonly DiceRoll[]>([])
  const dieNonceRef = useRef(0)
  const [moveHint, setMoveHint] = useState<DieValue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tileEvents, setTileEvents] = useState<readonly GameEvent[]>([])
  // cerrar-popup-mensajes: el jugador descartó los mensajes del panel; se
  // reabre con eventos nuevos (AC-3) y nunca cierra la decisión pendiente (AC-2).
  const [tileDismissed, setTileDismissed] = useState(false)
  const [move, setMove] = useState<{ readonly path: readonly string[]; readonly nonce: number } | null>(null)
  const [draw, setDraw] = useState<DrawSpec | null>(null)
  const [turnEnd, setTurnEnd] = useState(0)
  const [showTeam, setShowTeam] = useState(false)
  // SPEC-R/T-103: ventana de carta grande. Se abre desde un slot del equipo, la
  // Reserva de Oak o la carta del rival (AC-1); el robo animado sigue en la
  // caja popup-card (convive, no compite).
  const [cardModal, setCardModal] = useState<CardModalTarget | null>(
    initialCardModalUid !== undefined ? { source: 'team', uid: initialCardModalUid } : null,
  )
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null)
  const [oakOpen, setOakOpen] = useState(false)
  // T-089/SPEC-N: pestaña del equipo (oculta panel-team); arranca visible.
  const [teamCollapsed, setTeamCollapsed] = useState(false)
  const [saveNote, setSaveNote] = useState(false)
  // T-075: eventos del combate (el popup los reproduce por incrementos) y Ampliar.
  const [battleScript, setBattleScript] = useState<readonly GameEvent[]>([])
  const [battleExpanded, setBattleExpanded] = useState(true)
  // sync-estado-combate/AC-1,AC-2: snapshot de presentación del combate — el
  // estado del último comando cuyo lote de eventos terminó de reproducirse.
  // Mientras el guion corre, el popup arma los actores desde acá (prefijo ya
  // reproducido) en vez del estado final: ningún efecto se adelanta a su
  // evento. El motor queda intacto (animación ≠ lógica).
  const [battleView, setBattleView] = useState<GameSession | null>(null)
  // Última sesión para los callbacks del guion (onScriptDone llega post-commit).
  const sessionRef = useRef(current)
  sessionRef.current = current
  // fin-de-combate/AC-4: el resultado se consumió ("Continuar") con captura
  // pendiente: la escena queda congelada (sin overlay) hasta que la decisión
  // del pie de captura del propio popup cierre el flujo.
  const [battleResultDismissed, setBattleResultDismissed] = useState(false)
  // T-075/AC-1: el box de popup-card vive mientras la carta es visible (D-29).
  const [cardPopupOpen, setCardPopupOpen] = useState(false)
  // T-072: historial de acciones (panel-history) + su filtro y grupos plegados.
  const [history, setHistory] = useState<readonly HistoryEntry[]>([])
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [historyCollapsed, setHistoryCollapsed] = useState<readonly number[]>([])
  // pantalla-carga-tablero: overlay mientras el tablero termina de renderizar
  // (AC-1). 'loading' → 'leaving' (fade ~300ms, AC-3) → 'done'; con
  // reducedMotion el paso a done es directo (sin fade). Animación ≠ lógica.
  const [loadPhase, setLoadPhase] = useState<'loading' | 'leaving' | 'done'>('loading')
  // cargar-charmeleon-animar-evolucion/AC-3: overlay de la evolución fuera de
  // combate (cosmético; el estado ya cambió con el comando). Nonce por evento.
  const [evolveShow, setEvolveShow] = useState<({ readonly nonce: number } & EvolveShow) | null>(null)
  const evolveNonceRef = useRef(0)
  const logI18n = useMemo(() => historyLogI18n(), [])
  const enqueue = useGameStore((store) => store.enqueue)
  const isPlaying = useGameStore((store) => store.isPlaying)
  const speed = useGameStore((store) => store.speed)
  const reducedMotion = useGameStore((store) => store.reducedMotion)
  const sprites = useSprites()
  // medalla-gimnasio/AC-3: manifest de insignias para el overlay de resultado.
  const badges = useBadges()
  const state = current.state
  const player = state.players.find((p: PlayerState) => p.id === state.activePlayerId)
  // T-074/AC-3: panel-players elige a quién ver (equipo y medallas, D-28).
  const viewed = state.players.find((p: PlayerState) => p.id === viewPlayerId) ?? player
  const viewingOwn = viewed !== undefined && viewed.id === state.activePlayerId
  // T-075: legalidad dictaminada por el motor para el pie del popup de combate.
  const legal = useMemo(
    () => legalCommands(state, { content: gameContent, rng: createRng(0) }),
    [state],
  )
  // T-075/AC-6: el intercambio de Oak abre el popup; btn-oak lo abre siempre (T-074).
  // T-108: con resultado pendiente (BattleEnded sin Continuar) el popup de combate
  // se queda abierto aunque state.battle ya sea null.
  const battleResult = battleResultPending(battleScript)
  const battleKind = battlePopupKind(state, oakOpen, battleResult)
  useEffect(() => {
    if (state.pending?.type === 'OakSwap') setOakOpen(true)
  }, [state.pending])

  useEffect(() => {
    if (!saveNote) return
    const timer = setTimeout(() => setSaveNote(false), 1500)
    return () => clearTimeout(timer)
  }, [saveNote])

  // pantalla-carga-tablero: revela el tablero (AC-3) — fade corto salvo
  // reducedMotion; AC-4: todos los caminos (2D, fallback, error 3D) llegan acá.
  const revealBoard = useCallback((): void => {
    setLoadPhase((phase) => (phase === 'loading' ? (reducedMotion ? 'done' : 'leaving') : phase))
  }, [reducedMotion])

  // Sin mundo que esperar (sin jugador activo) no hay señal de BoardHost.
  useEffect(() => {
    if (player === undefined) revealBoard()
  }, [player, revealBoard])

  useEffect(() => {
    if (loadPhase !== 'leaving') return
    const timer = setTimeout(() => setLoadPhase('done'), 300)
    return () => clearTimeout(timer)
  }, [loadPhase])

  const sendOnce = (command: Command): boolean => {
    const step = applyToSession(current, command, gameContent, devRng ?? undefined)
    if (!step.ok) {
      setError(step.error.message)
      return false
    }
    setError(null)
    setCurrent(step.value.session)
    recordCommand(command)
    // T-072: cada evento del comando exitoso suma su entrada al historial.
    setHistory((prev) =>
      appendHistory(prev, step.value.events, state, step.value.session.state, logI18n),
    )
    for (const event of step.value.events) {
      enqueue({ ...event })
    }
    const board = boardRollsFromEvents(step.value.events, state, dieNonceRef.current)
    dieNonceRef.current = board.nonce
    if (board.moveHint !== null) setMoveHint(board.moveHint)
    if (board.rolls.length > 0) setDiceRolls((prev) => appendDiceRolls(prev, [...board.rolls]))
    // T-063: camino del último movimiento, derivado de los MoveStep (AC-2).
    const path = movePathFromEvents(step.value.events, step.value.session.state.activePlayerId)
    if (path !== null) setMove((prev) => ({ path, nonce: (prev?.nonce ?? 0) + 1 }))
    // T-064: el último CardDrawn dispara el robo animado; sin robo se limpia
    // (la carta PKM queda en pantalla mientras dura la decisión).
    // T-090/AC-2: Ítem/Sorpresa (sin pedestal) parten del nodo donde se robó.
    const drawn = drawFromEvents(step.value.events)
    setDraw((prev) => nextDrawSpec(prev, drawn, step.value.session.state))
    // T-075/AC-6 + SPEC-S/T-102: cada robo nuevo abre la caja popup-card (la
    // carta robada le gana al detalle mientras es visible). Sin esto el popup
    // nunca montaba: su efecto de onOpenChange(true) requeriría estar montado.
    if (drawn !== null) setCardPopupOpen(true)
    // cargar-charmeleon-animar-evolucion/AC-3: Evolve fuera de combate dispara
    // la animación clásica (en combate la coreografía del popup ya la tiene);
    // respeta reducedMotion/velocidad dentro del overlay.
    const evolved: EvolvedEvent | undefined = step.value.events.find(
      (event): event is EvolvedEvent => event.type === 'PkmEvolved',
    )
    if (evolved !== undefined && state.battle === null) {
      evolveNonceRef.current += 1
      setEvolveShow({
        nonce: evolveNonceRef.current,
        ...evolveShowFromEvent(evolved, cardOf, sprites.sprites),
      })
    }
    // T-076/AC-4: el turno termina al volver a organize desde una fase de juego
    // (sin evento nuevo: la cámara hace el zoom out con este nonce).
    const nextPhase = step.value.session.state.phase
    if (state.phase !== 'organize' && nextPhase === 'organize') {
      setTurnEnd((nonce) => nonce + 1)
    }
    // T-075: el guion del combate acumula los eventos mientras dura la batalla;
    // al salir se limpia para la próxima.
    // T-108: con BattleEnded en el lote el guion se conserva hasta "Continuar"
    // (el overlay de resultado mantiene la escena abierta).
    // fin-de-combate: `Capture` acumula su coreografía sobre la escena viva
    // (AC-5); `Release` cierra directo (AC-6); sin guion no hay animación
    // (AC-8). captura-en-popup-combate: la decisión vive en el pie del popup.
    const nextState = step.value.session.state
    const inBattleFlow = nextState.battle !== null
    const nextScript = battleScriptAfterCommand(battleScript, command, step.value.events, inBattleFlow)
    setBattleScript(nextScript)
    // sync-estado-combate: el primer lote del guion retiene el estado
    // PRE-comando (prefijo ya reproducido); sin guion vivo no hay snapshot.
    setBattleView((prev) => {
      const view = battleViewAfterCommand(prev?.state ?? null, current.state, nextScript.length > 0)
      return view === null ? null : { ...current, state: view }
    })
    if (nextScript.length === 0) setBattleResultDismissed(false)
    // El panel de casillero vive hasta la próxima tirada: muestra lo que pasó
    // (mensajes) y la decisión que quedó pendiente (T-061/AC-3). El cierre
    // manual (cerrar-popup-mensajes) no persiste: cada comando exitoso reabre
    // los mensajes que traiga (AC-3).
    if (command.type === 'RollMove') setTileEvents([])
    else setTileEvents(step.value.events.filter(isTileEvent))
    setTileDismissed(false)
    writeSave(storage, saveFromSession(step.value.session, contentHash))
    return true
  }

  // retirada-solo-inicio-turno/AC-7: guard reentrante — un segundo comando que
  // llegue mientras `send` corre (doble click de combate) se ignora de inmediato,
  // sin esperar a que termine la animación del anterior.
  const sendingRef = useRef(false)
  const send = (command: Command): boolean => {
    if (isPlaying || sendingRef.current) return false
    sendingRef.current = true
    try {
      return sendOnce(command)
    } finally {
      sendingRef.current = false
    }
  }

  const pending = pendingDecisionOf(state)

  // unificar-popup-encuentro/AC-1: el encuentro salvaje tiene SU popup; el
  // panel de casillero no lo duplica (ni mensajes de robo ni botones).
  // captura-en-popup-combate/AC-2: CaptureOrRelease tampoco vive acá (el pie
  // del popup de combate decide).
  const encounter = state.pending?.type === 'FightOrRelease' ? state.pending : null
  const tilePending = tilePendingOf(state, encounter !== null)

  const node = player === undefined
    ? undefined
    : gameContent.board.nodes.find((candidate) => candidate.id === player.position)

  // T-063/AC-1: ficha por jugador; ficha-inicial-fija: sprite/modelo 3D desde
  // la carta inicial BASE del mazo (nunca desde team[0], que puede haber
  // evolucionado o movido de posición); sin manifest/sprite el tablero 3D
  // muestra el peón de color. fichas-modelo-3d-hgss: modelSpecies (id dex).
  const tokens = useMemo<readonly BoardTokenSpec[]>(
    () => boardTokenSpecs(state.players, current.starterDeck, sprites.sprites),
    [state.players, current.starterDeck, sprites.sprites],
  )
  // T-064/AC-3: cantidad real de cartas por mazo (altura de cada pila 3D).
  const deckCounts = useMemo(() => deckCountsOf(state), [state.decks])
  const gymLeader = gymLeaderOf(node)
  const tilePlayer = tilePlayerOf(player, state)
  const tileMessages = tileMessagesOf(encounter !== null ? [] : tileEvents)

  // cerrar-popup-mensajes: el panel queda visible con mensajes sin descartar o
  // con decisión pendiente; al cerrar solo se ocultan los mensajes (AC-2).
  const tilePanelOpen = (!tileDismissed && tileMessages.length > 0) || tilePending !== null

  const encounterOptions = encounterOptionsOf(player, state, encounter !== null)

  const teamSlots = uiLayout.panels.team?.slots ?? 6
  const activeIndex = state.players.findIndex((p) => p.id === state.activePlayerId)
  const oakPileNames = oakNamesOf(viewed)
  // SPEC-R/T-103: spec de la ventana de carta (null ⇒ cerrada o sin destino).
  const cardModalSpecValue =
    cardModal === null || viewed === undefined ? null : cardModalSpec(state, viewed, cardModal)
  const cardModalActionsValue =
    cardModalSpecValue === null
      ? null
      : cardModalActions(state, legal, cardModalSpecValue.pkm.uid)
  // Si el PKM dejó de existir (p. ej. intercambio de Oak), la ventana se cierra.
  useEffect(() => {
    if (cardModal !== null && cardModalSpecValue === null) setCardModal(null)
  }, [cardModal, cardModalSpecValue])

  const detail = renderTeamDetail(showTeam, viewed, viewingOwn, state, send)

  // T-082/AC-2: el overlay del shell solo existe si hay algo que mostrar (sin
  // panel vacío de inventario); el detalle de equipo se abre tocando un slot.
  const hasOverlay =
    detail !== null ||
    tilePanelOpen ||
    error !== null ||
    isPlaying ||
    saveNote

  return (
    <>
      {/* pantalla-carga-tablero/AC-2: mientras el overlay está activo el shell
          queda inert (bloquea puntero y teclado); se libera al terminar el fade. */}
      <div inert={loadPhase !== 'done'}>
        <GameShell
          world={renderWorld({
            boardMode, player, state, pending, tokens, move, speed, reducedMotion, draw, deckCounts,
            moveHint, turnEnd, send, setMove, revealBoard,
          })}
          hud={buildHud({
            state, player, viewed, viewingOwn, diceRolls, speed, reducedMotion, sprites, teamSlots,
            activeIndex, history, historyFilter, historyCollapsed, send, setCardModal,
            setViewPlayerId, setHistoryFilter, setHistoryCollapsed,
          })}
      oakOpen={oakOpen}
      onOakToggle={() => setOakOpen((open) => !open)}
      teamCollapsed={teamCollapsed}
      onTeamToggle={() => setTeamCollapsed((collapsed) => !collapsed)}
      onDevEncounter={
        devToolsEnabled()
          ? () => send({ type: 'DebugEncounter', deck: 'pantano', card: parseCardId('abra') })
          : undefined
      }
      menu={{
        onSave: () => {
          writeSave(storage, saveFromSession(current, contentHash))
          setSaveNote(true)
        },
        onExit,
        settings:
          onSettingsChange === undefined ? undefined : (
            <MenuSettings settings={settings} onChange={onSettingsChange} />
          ),
      }}
      cardPopup={renderCardPopup(draw, cardPopupOpen, encounter, setCardPopupOpen)}
      encounterPopup={renderEncounterPopup(encounter, player, encounterOptions, sprites, send)}
          modal={renderModal({
            evolveShow, speed, reducedMotion, cardModalSpecValue, cardModalActionsValue, sprites,
            viewed, send, setEvolveShow, setCardModal,
          })}
          battlePopup={renderBattlePopup({
            battleKind, player, oakPileNames, state, legal, battleScript, battleView, speed,
            reducedMotion, viewingOwn, battleExpanded, badges, battleResultDismissed, sessionRef,
            send, setCardModal, setOakOpen, setBattleExpanded, setBattleScript, setBattleView,
            setBattleResultDismissed,
          })}
          battlePopupExpanded={battleExpanded}
          overlay={hasOverlay ? renderOverlay({
            saveNote, detail, tilePanelOpen, node, gymLeader, tileDismissed, tileMessages,
            tilePending, tilePlayer, error, isPlaying, send, setShowTeam, setTileDismissed,
          }) : null}
        />
      </div>
      {loadPhase !== 'done' ? <LoadingScreen leaving={loadPhase === 'leaving'} /> : null}
    </>
  )
}
