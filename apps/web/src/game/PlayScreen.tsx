// Juego real (SPEC-D/T-034): cablea el motor con el store. La UI solo envía
// comandos (data-command) y reproduce eventos por el EventPlayer; el estado
// vive en la sesión pura (session.ts). Autosave a cada comando (AC-2).
// T-061: el panel de casillero muestra eventos/pending y manda los comandos.
// T-074: los paneles del HUD (turno, equipo, jugadores, Reserva de Oak y menú)
// llenan el shell; el overlay queda para el panel de casillero y la ficha.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Command, DiePurpose, GameEvent, PkmInstance, PlayerState } from '@liga/engine'
import { legalCommands, createRng } from '@liga/engine'
import { parseCardId, type DeckId, type DeckKey } from '@liga/content'
import { BoardHost, type BoardMode } from '../board/BoardHost'
import { drawFromEvents, movePathFromEvents, type BoardTokenSpec, type DrawSpec, type PendingDecision } from '../board/Board'
import type { DieValue } from '../board/Die3D'
import type { SpritesManifest } from '../battle/sprites'
import { spriteUrl, useBadges, useSprites } from '../battle/sprites'
import { recordCommand } from '../debug/session'
import { MenuSettings } from '../hud/MenuSettings'
import { OakReserve } from '../hud/OakReserve'
import { PlayersPanel } from '../hud/PlayersPanel'
import { TeamStrip } from '../hud/TeamStrip'
import { TurnPanel } from '../hud/TurnPanel'
import { HistoryPanel, type HistoryFilter } from '../hud/HistoryPanel'
import { appendHistory, historyLogI18n, type HistoryEntry } from '../hud/history'
import { appendDiceRolls, DicePanel, type DiceRoll } from '../hud/DicePanel'
import { BackpackHud } from '../hud/BackpackHud'
import { resolveDrop } from '../hud/backpack'
import { carryOf } from '../hud/carry'
import { canAdvance, canReorder, canRoll, leaderUid, oakPairs, playerLabel, playersVm } from '../hud/model'
import { useGameStore } from '../events/store'
import { EvolveOverlay, evolveShowFromEvent, type EvolveShow } from '../events/EvolveOverlay'
import { es } from '../i18n/es'
import { BattlePopup } from '../popup/BattlePopup'
import { CardPopup } from '../popup/CardPopup'
import { EncounterPopup, type EncounterFightOption } from '../popup/EncounterPopup'
import { battlePopupKind, battleResultPending, battleScriptAfterCommand, battleScriptAfterContinue, battleShouldAutoClose, battleViewAfterCommand, battleViewAfterScriptDone } from '../popup/model'
import { CardModal } from '../cardmodal/CardModal'
import { cardModalActions, cardModalSpec, type CardModalTarget } from '../cardmodal/model'
import { shellPanels, uiLayout } from '../shell/layout'
import { GameShell } from '../shell/GameShell'
import { CardSheet } from '../team/CardSheet'
import { TeamPanel } from '../team/TeamPanel'
import { freeMulticolor } from '../team/model'
import { cardOf, contentHash, gameContent, starterTokenCard } from './content'
import { devRng, devToolsEnabled } from './devmode'
import { LoadingScreen } from './LoadingScreen'
import { DEFAULT_SETTINGS, type GameSettings } from './settings'
import { saveFromSession, applyToSession, type GameSession } from './session'
import { TilePanel, tileEventMessage, tileTitle, type TilePanelPlayer, type TilePending } from './TilePanel'
import { writeSave, type StorageLike } from './save'
import styles from './game.module.css'

const isTileEvent = (event: GameEvent): boolean => tileEventMessage(event) !== null

type EvolvedEvent = Extract<GameEvent, { readonly type: 'PkmEvolved' }>

const clampDie = (value: number): DieValue => Math.min(6, Math.max(1, Math.round(value))) as DieValue

/** dado-de-combate/AC-2: enruta tiradas — solo el dado de tablero (move y
 * oportunidad) alimenta panel-dice; los propósitos de combate los reproduce
 * el dado propio del popup de combate (battle-die). */
export const isBoardDiePurpose = (purpose: DiePurpose): boolean =>
  purpose === 'move' || purpose === 'oportunidad'

/** ficha-inicial-fija: spec de ficha por jugador resuelto desde la carta inicial
 * BASE del mazo (session.starterDeck), no desde el equipo: el inicial puede
 * evolucionar (cardId cambia) o dejar de ser team[0] (reorden/intercambio con
 * Oak) y la ficha lo representa igual. Sin carta en el contenido ⇒ null/null
 * (peón de color). */
export const boardTokenSpecs = (
  players: readonly PlayerState[],
  starterDeck: DeckId,
  sprites: SpritesManifest | null,
): readonly BoardTokenSpec[] => {
  const card = starterTokenCard(starterDeck)
  return players.map((p) => ({
    id: p.id,
    nodeId: p.position,
    spriteUrl: card === null ? null : spriteUrl(sprites, card.dex, 'front'),
    modelSpecies: card === null ? null : card.id,
  }))
}

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
    // T-092: cada tirada de tablero alimenta el historial del panel (hasta 3);
    // el que se reproduce en el dado es el último de la tanda. "Quién tiró" se
    // infiere del jugador activo al emitirse el evento (el motor no lo trae, Q-057).
    const rolls: DiceRoll[] = []
    for (const event of step.value.events) {
      if (event.type !== 'DieRolled') continue
      // dado-de-combate/AC-2: las tiradas de combate las reproduce el popup.
      if (!isBoardDiePurpose(event.purpose)) continue
      dieNonceRef.current += 1
      const rollerIndex = state.players.findIndex((p: PlayerState) => p.id === state.activePlayerId)
      const value = clampDie(event.value)
      rolls.push({
        value,
        purpose: event.purpose,
        playerLabel:
          rollerIndex < 0 ? (state.activePlayerId ?? es.hudDiceIdle) : playerLabel(rollerIndex),
        nonce: dieNonceRef.current,
      })
      if (event.purpose === 'move') setMoveHint(value)
    }
    if (rolls.length > 0) setDiceRolls((prev) => appendDiceRolls(prev, rolls))
    // T-063: camino del último movimiento, derivado de los MoveStep (AC-2).
    const path = movePathFromEvents(step.value.events, step.value.session.state.activePlayerId)
    if (path !== null) setMove((prev) => ({ path, nonce: (prev?.nonce ?? 0) + 1 }))
    // T-064: el último CardDrawn dispara el robo animado; sin robo se limpia
    // (la carta PKM queda en pantalla mientras dura la decisión).
    // T-090/AC-2: Ítem/Sorpresa (sin pedestal) parten del nodo donde se robó.
    const drawn = drawFromEvents(step.value.events)
    setDraw((prev) => {
      if (drawn === null) return null
      const base = { deck: drawn.deck, card: drawn.card, nonce: (prev?.nonce ?? 0) + 1 }
      if (drawn.deck !== 'item' && drawn.deck !== 'sorpresa') return base
      const nodeId = step.value.session.state.players.find((p: PlayerState) => p.id === drawn.player)?.position
      return nodeId === undefined ? base : { ...base, nodeId }
    })
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

  const pending: PendingDecision =
    state.pending?.type === 'ChoosePath'
      ? { type: 'ChoosePath', options: state.pending.options }
      : state.pending?.type === 'StopOrContinue'
        ? { type: 'StopOrContinue' }
        : null

  // unificar-popup-encuentro/AC-1: el encuentro salvaje tiene SU popup; el
  // panel de casillero no lo duplica (ni mensajes de robo ni botones).
  // captura-en-popup-combate/AC-2: CaptureOrRelease tampoco vive acá (el pie
  // del popup de combate decide).
  const encounter = state.pending?.type === 'FightOrRelease' ? state.pending : null
  const tilePending: TilePending = encounter
    ? null
    : state.pending?.type === 'ChallengeGym' || state.pending?.type === 'OakSwap'
      ? { type: state.pending.type }
      : null

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
  const deckCounts = useMemo<Readonly<Record<string, number>>>(
    () => Object.fromEntries(Object.entries(state.decks).map(([deck, stack]) => [deck, stack.length])),
    [state.decks],
  )
  const gymLeader = node !== undefined && node.type === 'gym' && node.gym !== undefined
    ? (gameContent.gyms.find((leader) => leader.id === node.gym)?.name ?? null)
    : null
  const tilePlayer: TilePanelPlayer | null = player === undefined
    ? null
    : {
        healthy: player.team
          .filter((pkm: PkmInstance) => !pkm.fainted)
          .map((pkm: PkmInstance) => ({ uid: pkm.uid, name: cardOf(pkm.cardId)?.name ?? String(pkm.cardId) })),
        swapPairs:
          state.pending?.type === 'OakSwap'
            ? player.team.flatMap((teamPkm: PkmInstance) =>
                player.oakPile.map((pilePkm: PkmInstance) => ({
                  teamUid: teamPkm.uid,
                  pileUid: pilePkm.uid,
                  teamName: cardOf(teamPkm.cardId)?.name ?? String(teamPkm.cardId),
                  pileName: cardOf(pilePkm.cardId)?.name ?? String(pilePkm.cardId),
                })),
              )
            : [],
        }
  const tileMessages = (encounter !== null ? [] : tileEvents)
    .map((event) => tileEventMessage(event))
    .filter((message): message is string => message !== null)

  // cerrar-popup-mensajes: el panel queda visible con mensajes sin descartar o
  // con decisión pendiente; al cerrar solo se ocultan los mensajes (AC-2).
  const tilePanelOpen = (!tileDismissed && tileMessages.length > 0) || tilePending !== null

  // unificar-popup-encuentro/AC-4: PKM sanos del equipo (activo primero y
  // resaltado) con su HP actual/máx para los botones de pelear.
  const encounterOptions: readonly EncounterFightOption[] = encounter === null || player === undefined
    ? []
    : (() => {
        const leader = leaderUid(player, state.battle)
        const healthy = player.team
          .filter((pkm: PkmInstance) => !pkm.fainted)
          .map((pkm: PkmInstance) => {
            const card = cardOf(pkm.cardId)
            return {
              uid: pkm.uid,
              name: card?.name ?? String(pkm.cardId),
              hpCur: Math.max(0, (card?.hp ?? 0) - pkm.damage),
              hpMax: card?.hp ?? 0,
              active: pkm.uid === leader,
            }
          })
        return [
          ...healthy.filter((option) => option.active),
          ...healthy.filter((option) => !option.active),
        ]
      })()

  const teamSlots = uiLayout.panels.team?.slots ?? 6
  const activeIndex = state.players.findIndex((p) => p.id === state.activePlayerId)
  const oakPileNames = (viewed?.oakPile ?? []).map((pkm) => ({
    uid: pkm.uid,
    name: cardOf(pkm.cardId)?.name ?? String(pkm.cardId),
  }))
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

  // T-074/AC-1: ficha de la carta (CardDetail). Del jugador propio se abre el
  // panel completo (equipar/evolucionar); del resto, solo lectura (D-28).
  const detail = (() => {
    if (!showTeam || viewed === undefined) return null
    if (viewingOwn) {
      return (
        <TeamPanel
          player={viewed}
          cardOf={cardOf}
          teamLimit={state.ruleset?.teamLimit ?? 6}
          canEdit={state.phase === 'organize'}
          onCommand={send}
        />
      )
    }
    const target = viewed.team[0]
    const card = target === undefined ? undefined : cardOf(target.cardId)
    if (target === undefined || card === undefined) return null
    return (
      <CardSheet
        card={card}
        pkm={target}
        editable={false}
        equipOptions={[]}
        multicolorOptions={[]}
        evolveOptions={[]}
        onCommand={() => undefined}
      />
    )
  })()

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
          world={
            player === undefined ? null : (
              <BoardHost
                boardMode={boardMode}
                position={player.position}
                cameFrom={player.cameFrom}
                pending={pending}
                tokens={tokens}
                activeTokenId={state.activePlayerId}
                myTokenId={state.players[0]?.id ?? null}
                movePath={move?.path ?? null}
                moveNonce={move?.nonce ?? 0}
                onMoveDone={() => setMove(null)}
                speed={speed}
                reducedMotion={reducedMotion}
                draw={draw}
                deckCounts={deckCounts}
                onChoosePath={(to) => send({ type: 'ChoosePath', to })}
                onStopHere={() => send({ type: 'StopHere' })}
                onContinueMoving={() => send({ type: 'ContinueMoving' })}
                // T-092: el dado vive en panel-dice; el tablero solo el aviso de movimiento.
                moveHintValue={moveHint}
                turnEndNonce={turnEnd}
                battleActive={state.battle !== null}
                onReady={revealBoard}
              />
            )
          }
      hud={{
        // T-092/AC-2: panel-dice con dado + quién + propósito + valor + historial.
        // dado-clicable/AC-1,AC-3: el dado también tira (mismo send que btn-roll).
        dice: (
          <DicePanel
            rolls={diceRolls}
            speed={speed}
            reducedMotion={reducedMotion}
            canRoll={canRoll(state)}
            onRoll={() => send({ type: 'RollMove' })}
          />
        ),
        turn: (
          <TurnPanel
            turn={state.turn}
            playerLabel={playerLabel(activeIndex)}
            phaseLabel={es.phaseNames[state.phase]}
            canRoll={canRoll(state)}
            canAdvance={canAdvance(state)}
            onRoll={() => send({ type: 'RollMove' })}
            onAdvance={() => send({ type: 'Advance' })}
          />
        ),
        team:
          viewed === undefined ? null : (
            <TeamStrip
              player={viewed}
              cardOf={cardOf}
              sprites={sprites.sprites ?? null}
              battle={state.battle}
              slots={teamSlots}
              reorderable={canReorder(state, viewed.id)}
              chipDraggable={canReorder(state, viewed.id)}
              resolveCarry={(payload, target) => resolveDrop(payload, target, state, cardOf).ok}
              onSelect={(uid) => {
                // T-073/AC-4: con una carta seleccionada, tocar el slot la aplica.
                const { carried, tapTarget } = carryOf()
                if (carried !== null) {
                  tapTarget({ kind: 'pkm', uid })
                  return
                }
                // SPEC-R/T-103: el slot abre la ventana de carta grande.
                setCardModal({ source: 'team', uid })
              }}
              onReorder={(uid, to) => send({ type: 'ReorderTeam', uid, to })}
            />
          ),
        players: (
          <PlayersPanel
            players={playersVm(state)}
            viewedId={viewed?.id ?? ''}
            onView={setViewPlayerId}
          />
        ),
        history: (
          <HistoryPanel
            entries={history}
            myPlayerId={state.players[0]?.id ?? null}
            filter={historyFilter}
            onFilterChange={setHistoryFilter}
            collapsed={historyCollapsed}
            onToggleGroup={(key) =>
              setHistoryCollapsed((prev) =>
                prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
              )
            }
          />
        ),
        // T-073: mochila del jugador propio (la ajena queda oculta, D-28).
        backpack:
          player === undefined ? null : (
            <BackpackHud
              player={player}
              state={state}
              cardOf={cardOf}
              viewingOwn={viewingOwn}
              send={send}
            />
          ),
      }}
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
      cardPopup={
        draw !== null && cardPopupOpen && encounter === null ? (
          <CardPopup
            draw={draw}
            autoDismissMs={shellPanels.cardPopup.autoDismissMs ?? 2500}
            onOpenChange={setCardPopupOpen}
          />
        ) : null
      }
      encounterPopup={
        encounter !== null && player !== undefined && cardOf(encounter.card) !== undefined ? (
          <EncounterPopup
            card={cardOf(encounter.card)!}
            deckName={es.tileDeckNames[encounter.deck as DeckKey]}
            options={encounterOptions}
            artUrl={spriteUrl(sprites?.sprites ?? null, cardOf(encounter.card)!.dex, 'front')}
            onCommand={send}
          />
        ) : null
      }
      modal={
        <>
          {evolveShow !== null ? (
            <EvolveOverlay
              key={evolveShow.nonce}
              fromUrl={evolveShow.fromUrl}
              fromName={evolveShow.fromName}
              toUrl={evolveShow.toUrl}
              toName={evolveShow.toName}
              speed={speed}
              reducedMotion={reducedMotion}
              onDone={() => setEvolveShow(null)}
            />
          ) : null}
          {cardModalSpecValue !== null && cardModalActionsValue !== null ? (
            <CardModal
              spec={cardModalSpecValue}
              actions={cardModalActionsValue}
              artUrl={spriteUrl(sprites.sprites ?? null, cardModalSpecValue.card.dex, 'front')}
              itemCounts={{
                potion: viewed?.items.potion ?? 0,
                super_potion: viewed?.items.super_potion ?? 0,
              }}
              multicolorFree={viewed === undefined ? 0 : freeMulticolor(viewed)}
              onCommand={send}
              onClose={() => setCardModal(null)}
            />
          ) : null}
        </>
      }
      battlePopup={
        battleKind === 'oak' && player !== undefined ? (
          <OakReserve
            pile={oakPileNames}
            team={player.team.map((pkm: PkmInstance) => ({
              uid: pkm.uid,
              name: cardOf(pkm.cardId)?.name ?? String(pkm.cardId),
            }))}
            canSwap={state.pending?.type === 'OakSwap'}
            pairs={oakPairs(player.team, player.oakPile)}
            onInspect={(uid) => setCardModal({ source: 'oak', uid })}
            onCommand={send}
            onClose={() => setOakOpen(false)}
          />
        ) : battleKind === 'battle' ? (
          <BattlePopup
            state={state}
            legal={legal}
            script={battleScript}
            viewState={battleView === null ? null : battleView.state}
            speed={speed}
            reducedMotion={reducedMotion}
            viewingOwn={viewingOwn}
            expanded={battleExpanded}
            onExpandToggle={() => setBattleExpanded((open) => !open)}
            badges={badges}
            onInspectRival={() => setCardModal({ source: 'rival' })}
            onCommand={send}
            resultDismissed={battleResultDismissed}
            onContinue={() => {
              // fin-de-combate/AC-4: con captura pendiente el guion sobrevive:
              // la escena queda congelada y la decisión vive en el pie del
              // popup (captura-en-popup-combate). Sin captura pendiente se
              // limpia como en T-108.
              if (battleScriptAfterContinue(state.pending) === 'keep') {
                setBattleResultDismissed(true)
                return
              }
              setBattleScript([])
              setBattleResultDismissed(false)
              // sync-estado-combate: sin guion no hay prefijo que retener.
              setBattleView(null)
            }}
            onScriptDone={() => {
              // sync-estado-combate/AC-3: el guion terminó de reproducirse ⇒
              // la presentación pasa al estado final del motor (sin drift).
              const view = battleViewAfterScriptDone(battleScript.length > 0, sessionRef.current.state)
              setBattleView(view === null ? null : { ...sessionRef.current, state: view })
              // fin-de-combate/AC-5: la coreografía de captura terminó (cola
              // reproducida) y el motor ya resolvió ⇒ auto-cierre, sin clic extra.
              if (battleShouldAutoClose(state, battleResultDismissed, battleScript.length > 0)) {
                setBattleScript([])
                setBattleResultDismissed(false)
                setBattleView(null)
              }
            }}
          />
        ) : null
      }
      battlePopupExpanded={battleExpanded}
      overlay={hasOverlay ? (
        <div className={styles.legacy}>
          <section className={styles.screen} aria-label={es.playTurn}>
            {saveNote ? <span className={styles.note} data-testid="save-note">{es.shellMenuSave}</span> : null}
            {detail !== null ? (
              <div className={styles.detailBar}>
                <button
                  type="button"
                  className={styles.detailClose}
                  data-testid="btn-team-close"
                  onClick={() => setShowTeam(false)}
                >
                  {es.shellTipClose}
                </button>
                {detail}
              </div>
            ) : null}
            {tilePanelOpen ? (
              <TilePanel
                title={tileTitle(node, gymLeader)}
                messages={tileDismissed ? [] : tileMessages}
                pending={tilePending}
                player={tilePlayer}
                onCommand={send}
                onClose={() => setTileDismissed(true)}
              />
            ) : null}
            {error !== null ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {isPlaying ? <p className={styles.note}>{es.playReproducing}</p> : null}
          </section>
        </div>
      ) : null}
        />
      </div>
      {loadPhase !== 'done' ? <LoadingScreen leaving={loadPhase === 'leaving'} /> : null}
    </>
  )
}
