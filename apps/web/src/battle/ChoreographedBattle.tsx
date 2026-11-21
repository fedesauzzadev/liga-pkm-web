// Vista coreografiada de combate (SPEC-D/T-032d): conecta el BattleChoreographer
// (eventos → estado de presentación) con la BattleScene, y cablea el puerto de FX
// a los nodos DOM de la escena (playMoveFx, T-032c1). Vive en el chunk lazy.
// rediseno-combate-max: además pasa a la escena lo que necesitan las pestañas
// (comandos legales, equipo, ítems) y el bloqueo mientras corren animaciones.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseCardId, parsePkmUid } from '@liga/content'
import type { Command, GameEvent } from '@liga/engine'
import type { PlaybackSpeed } from '../events/anim.config'
import { playMoveFx } from '../fx'
import type { FxDomNode } from '../fx/archetypes'
import { es } from '../i18n/es'
import { BattleChoreographer, type BattleFxPort } from './choreo/BattleChoreographer'
import type { BattleChoreoDeps, BattleStage } from './choreo/stage'
import { BattleScene, type BattleDieView, type BattleVisuals } from './BattleScene'
import type { SpritesManifest, TrainersManifest } from './sprites'
import type { BagContext, TeamPkmView } from './controls'

export interface ChoreographedBattleProps {
  readonly deps: BattleChoreoDeps
  readonly script: readonly GameEvent[]
  /** fix-combate-refresco: stage inicial de reanudación (restore con batalla
   * viva y guion vacío): la escena monta instantánea, sin reproducir historia. */
  readonly initialStage?: BattleStage | null
  readonly speed?: PlaybackSpeed
  readonly reducedMotion?: boolean
  readonly firstTurn?: boolean
  /** fix-sprites-lideres-gimnasio/AC-1: mismo shape que BattleScene (sprites +
   * trainers); null deja que la escena use useSprites(). */
  readonly spritesOverride?: { sprites: SpritesManifest; trainers: TrainersManifest } | null
  readonly onDone?: () => void
  /** fin-de-combate: progreso de reproducción (eventos ya reproducidos del
   * guion) tras cada evento; junto con `onDone` alimenta el overlay diferido. */
  readonly onPlayed?: (played: number) => void
  /** ── rediseno-combate-max/AC-6: pestañas y acciones ── */
  readonly legal?: readonly Command[]
  readonly team?: readonly TeamPkmView[]
  readonly activeUid?: string | null
  readonly items?: BagContext['items']
  readonly battleKind?: 'wild' | 'gym' | null
  readonly rivalRemainingHp?: number | null
  readonly capture?: BagContext['capture']
  readonly myTurn?: boolean
  /** Animaciones corriendo: panel bloqueado (señal battleScriptPlaying). */
  readonly blocked?: boolean
  /** Combate de otro jugador: pestañas deshabilitadas con "Turno de {nombre}". */
  readonly turnOfName?: string | null
  /** reemplazo-tras-desmayo/AC-1: reemplazo pendiente ⇒ pestaña Cambiar forzada. */
  readonly forceSwitch?: boolean
  readonly onCommand?: (command: Command) => void
  /** SPEC-R/T-103: clic en la carta del rival abre su ventana (solo lectura). */
  readonly onRivalCardClick?: () => void
}

/** T-075: cola por incrementos — solo los eventos aún no reproducidos. */
export const eventsToPlay = (
  script: readonly GameEvent[],
  played: number,
): readonly GameEvent[] => (played <= 0 ? script : script.slice(played))

/** fin-de-combate: reproduce la cola nueva desde `played` notificando el
 * progreso tras cada evento (`onPlayed`) y aborta si `isAlive()` falla.
 * Devuelve el total reproducido (encadenar corridas sin pisar la cola). */
export const playQueue = async (
  choreo: BattleChoreographer,
  script: readonly GameEvent[],
  played: number,
  isAlive: () => boolean,
  onPlayed?: (played: number) => void,
): Promise<number> => {
  let count = played
  for (const event of eventsToPlay(script, played)) {
    if (!isAlive()) return count
    await choreo.play(event)
    count += 1
    onPlayed?.(count)
  }
  return count
}

const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const listener = (event: MediaQueryListEvent): void => {
      setReduced(event.matches)
    }
    query.addEventListener('change', listener)
    return () => {
      query.removeEventListener('change', listener)
    }
  }, [])
  return reduced
}

/** Estado del stage → props de la escena (mapeo puro, sin lógica de juego).
 * Exportado para los tests del mapeo del dado de combate. */
export const visualsOf = (stage: BattleStage): BattleVisuals => {
  const evolving = stage.evolve
  const evolveSide =
    evolving === null
      ? null
      : stage.player?.uid === evolving.uid
        ? ('player' as const)
        : stage.rival?.uid === evolving.uid
          ? ('rival' as const)
          : null
  const die: BattleDieView | null =
    stage.dieValue === null || stage.diePurpose === null || stage.dieSide === null
      ? null
      : {
          value: stage.dieValue,
          purpose: stage.diePurpose,
          side: stage.dieSide,
          nonce: stage.dieNonce,
          chain: stage.dieChain,
        }
  return {
    sweep: stage.sweep,
    entranceSides: [...stage.entrance],
    blinkSide:
      stage.player?.uid === stage.blink ? 'player' : stage.rival?.uid === stage.blink ? 'rival' : null,
    raisedSide: stage.raised,
    faintedSides: [
      ...(stage.player?.fainted === true ? (['player'] as const) : []),
      ...(stage.rival?.fainted === true ? (['rival'] as const) : []),
    ],
    flash: stage.flash,
    capture: stage.capture,
    evolve:
      evolving !== null && evolveSide !== null
        ? { side: evolveSide, phase: evolving.phase, pulse: evolving.pulse }
        : null,
    floaters: stage.floaters.map((floater) => ({
      id: floater.id,
      side:
        stage.player?.uid === floater.uid ? ('player' as const) : ('rival' as const),
      text: floater.text,
      tone: floater.tone,
    })),
    // rediseno-combate-max/AC-2: la tirada alimenta el dado del lado que juega.
    die,
    // T-112/AC-2: líder gimnasiante aparece con este id hasta que se retira.
    trainerAppeared: stage.trainerAppeared,
  }
}

export function ChoreographedBattle({
  deps,
  script,
  initialStage = null,
  speed = '1x',
  reducedMotion = false,
  firstTurn = true,
  spritesOverride,
  onDone,
  onPlayed,
  legal = [],
  team = [],
  activeUid = null,
  items,
  battleKind = null,
  rivalRemainingHp = null,
  capture,
  myTurn = false,
  blocked = false,
  turnOfName = null,
  forceSwitch = false,
  onCommand,
  onRivalCardClick,
}: ChoreographedBattleProps) {
  const prefersReduced = usePrefersReducedMotion()
  const reduced = prefersReduced || reducedMotion
  const hostRef = useRef<HTMLDivElement | null>(null)
  const speedRef = useRef(speed)
  const reducedRef = useRef(reduced)
  speedRef.current = speed
  reducedRef.current = reduced

  const fxPort = useCallback<BattleFxPort>((attack, side, target) => {
    const host = hostRef.current
    if (host === null) return Promise.resolve()
    const attacker = host.querySelector(`[data-side="${side}"]`)
    // fix-confusion-captura/AC-4: el defensor es el lado del `target` del evento
    // (selfHit ⇒ el propio atacante), no siempre el contrario.
    const defender = host.querySelector(`[data-side="${target}"]`)
    const layer = host.querySelector('[data-layer="fx"]')
    if (attacker === null || defender === null || layer === null) return Promise.resolve()
    return playMoveFx(attack, {
      attacker: attacker as unknown as FxDomNode,
      defender: defender as unknown as FxDomNode,
      layer: layer as unknown as FxDomNode,
      ...(attack.element !== undefined ? { element: attack.element } : {}),
      side,
      speed: speedRef.current === '2x' ? 2 : speedRef.current === 'skip' ? 0 : 1,
      reducedMotion: reducedRef.current,
    })
  }, [])

  const [stage, setStage] = useState<BattleStage | null>(null)
  const choreo = useMemo(
    () =>
      new BattleChoreographer({
        deps,
        // fix-combate-refresco: solo al montar (la corrida vive en esta
        // instancia y los eventos parchean encima del stage reanudado).
        ...(initialStage !== null ? { initialStage } : {}),
        speed,
        reducedMotion: reduced,
        fxPort,
        onStage: setStage,
      }),
    // Se crea una vez por montaje (la corrida vive en esta instancia);
    // velocidad/reduced se actualizan por setter en el efecto de abajo.
    [deps, fxPort],
  )

  useEffect(() => {
    choreo.setSpeed(speed)
    choreo.setReducedMotion(reduced)
  }, [choreo, speed, reduced])

  // T-075: el guion crece por comando (popup de combate): cada corrida reproduce
  // SOLO la cola nueva; las corridas se encadenan para no pisar la coreografía.
  // fin-de-combate: tras cada evento se expone el progreso (onPlayed) para que
  // el overlay de resultado espere la coreografía del golpe final.
  const playedRef = useRef(0)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const onPlayedRef = useRef(onPlayed)
  onPlayedRef.current = onPlayed
  // combate-colgado: `onDone` llega inline del popup y cambia de identidad en
  // cada render. Si estuviera en las deps, el efecto volvería a correr tras el
  // setState de onDone y llamaría onDone otra vez ⇒ loop infinito de renders.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      playedRef.current = await playQueue(
        choreo,
        script,
        playedRef.current,
        () => alive,
        (played) => {
          playedRef.current = played
          onPlayedRef.current?.(played)
        },
      )
      if (alive) onDoneRef.current?.()
    }
    chainRef.current = chainRef.current.then(run, run)
    return () => {
      alive = false
    }
  }, [choreo, script])

  const current = stage ?? choreo.stage
  const visuals = visualsOf(current)
  const scene =
    current.player !== null && current.rival !== null ? (
      <BattleScene
        player={{
          card: current.player.card,
          pkm: {
            uid: parsePkmUid(current.player.uid),
            cardId: parseCardId(current.player.card.id),
            damage: current.player.damage,
            xp: current.player.pkm?.xp ?? 0,
            equipped: current.player.pkm?.equipped ?? [],
            multicolor: current.player.pkm?.multicolor ?? [],
            fainted: current.player.fainted,
          },
          firstTurn,
          ...(current.player.conditions !== undefined
            ? { conditions: current.player.conditions }
            : {}),
        }}
        rival={{
          card: current.rival.card,
          damage: current.rival.damage,
          ...(current.rival.conditions !== undefined
            ? { conditions: current.rival.conditions }
            : {}),
        }}
        attackSelectValue={current.attackSelectValue}
        visuals={visuals}
        dieSpeed={speed === '2x' ? '2x' : speed === 'skip' ? 'skip' : '1x'}
        reducedMotion={reduced}
        message={current.message}
        legal={legal}
        myTurn={myTurn}
        blocked={blocked}
        {...(onCommand !== undefined ? { onCommand } : {})}
        {...(team.length > 0 ? { team } : {})}
        {...(activeUid !== null ? { activeUid } : {})}
        {...(items !== undefined ? { items } : {})}
        {...(battleKind !== null ? { battleKind } : {})}
        {...(rivalRemainingHp !== null ? { rivalRemainingHp } : {})}
        {...(capture !== undefined ? { capture } : {})}
        {...(turnOfName !== null ? { turnOfName } : {})}
        forceSwitch={forceSwitch}
        {...(onRivalCardClick !== undefined ? { onRivalCardClick } : {})}
        {...(spritesOverride !== undefined ? { spritesOverride } : {})}
      />
    ) : (
      <p data-battle-wait>{es.battleWait}</p>
    )

  return <div ref={hostRef}>{scene}</div>
}
