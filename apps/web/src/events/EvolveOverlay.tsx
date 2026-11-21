// Overlay de la animación clásica de evolución FUERA de combate
// (cargar-charmeleon-animar-evolucion/AC-3): 3 pulsos crecientes de silueta
// blanca del sprite actual, destello y revelación de la nueva forma. Es
// puramente cosmética (animación ≠ lógica): el estado del juego ya cambió
// cuando se monta, ningún resultado depende de ella y con reducedMotion o
// velocidad skip se omite (AC-3). Timings: anim.config (AC-6).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PkmEvolved, PokemonCard } from '@liga/engine'
import { spriteUrl, type SpritesManifest } from '../battle/sprites'
import { es } from '../i18n/es'
import { ANIMATION_CONFIG, type PlaybackSpeed } from './anim.config'
import styles from './EvolveOverlay.module.css'

export type EvolvePhase = 'pulse' | 'flash' | 'reveal' | 'done'

export interface EvolveState {
  readonly phase: EvolvePhase
  readonly pulse: number
}

/** Arranque de la secuencia clásica: primer pulso de la silueta actual. */
export const EVOLVE_START: EvolveState = { phase: 'pulse', pulse: 1 }

/** Duración (ms a 1×) de cada paso, siempre desde anim.config (AC-6). */
export const evolveStepMs = (state: EvolveState): number => {
  if (state.phase === 'pulse') return ANIMATION_CONFIG.evolvePulseMs
  if (state.phase === 'flash') return ANIMATION_CONFIG.battle.evolveFlashMs
  if (state.phase === 'reveal') return ANIMATION_CONFIG.evolveRevealMs
  return 0
}

/** Próximo estado: pulsos 1..N crecientes → destello → revelación → done. */
export const nextEvolveState = (state: EvolveState): EvolveState => {
  if (state.phase === 'pulse') {
    return state.pulse < ANIMATION_CONFIG.evolvePulses
      ? { phase: 'pulse', pulse: state.pulse + 1 }
      : { phase: 'flash', pulse: ANIMATION_CONFIG.evolvePulses }
  }
  if (state.phase === 'flash') return { phase: 'reveal', pulse: ANIMATION_CONFIG.evolvePulses }
  if (state.phase === 'reveal') return { phase: 'done', pulse: ANIMATION_CONFIG.evolvePulses }
  return state
}

/** Datos visuales del evento (puro): cartas + manifest → nombres y URLs. */
export interface EvolveShow {
  readonly fromName: string
  readonly fromUrl: string | null
  readonly toName: string
  readonly toUrl: string | null
}

export const evolveShowFromEvent = (
  event: PkmEvolved,
  cardOf: (cardId: string) => PokemonCard | undefined,
  sprites: SpritesManifest | null,
): EvolveShow => {
  const from = cardOf(event.from)
  const to = cardOf(event.to)
  return {
    fromName: from?.name ?? event.from,
    toName: to?.name ?? event.to,
    fromUrl: from === undefined ? null : spriteUrl(sprites, from.dex, 'front'),
    toUrl: to === undefined ? null : spriteUrl(sprites, to.dex, 'front'),
  }
}

export interface EvolveOverlayProps {
  readonly fromUrl: string | null
  readonly fromName: string
  readonly toUrl: string | null
  readonly toName: string
  readonly speed?: PlaybackSpeed
  readonly reducedMotion?: boolean
  readonly onDone?: () => void
}

const speedFactor = (speed: PlaybackSpeed): number => (speed === '2x' ? 0.5 : 1)

/** Overlay conductor: máquina de estados + espera por paso (sin tocar lógica). */
export function EvolveOverlay({
  fromUrl,
  fromName,
  toUrl,
  toName,
  speed = '1x',
  reducedMotion = false,
  onDone,
}: EvolveOverlayProps) {
  const [state, setState] = useState<EvolveState>(EVOLVE_START)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  // AC-3: con reducedMotion o velocidad skip la secuencia se omite.
  const skipped = reducedMotion || speed === 'skip'
  useEffect(() => {
    if (skipped) {
      onDoneRef.current?.()
      return
    }
    if (state.phase === 'done') {
      onDoneRef.current?.()
      return
    }
    const timer = setTimeout(
      () => {
        setState(nextEvolveState(state))
      },
      Math.round(evolveStepMs(state) * speedFactor(speed)),
    )
    return () => clearTimeout(timer)
  }, [state, speed, skipped])
  if (skipped || state.phase === 'done') return null
  return (
    <EvolveOverlayView
      phase={state.phase}
      pulse={state.pulse}
      fromUrl={fromUrl}
      fromName={fromName}
      toUrl={toUrl}
      toName={toName}
    />
  )
}

export interface EvolveOverlayViewProps {
  readonly phase: 'pulse' | 'flash' | 'reveal'
  readonly pulse: number
  readonly fromUrl: string | null
  readonly fromName: string
  readonly toUrl: string | null
  readonly toName: string
}

const cssVars = {
  '--evolve-pulse-ms': `${String(ANIMATION_CONFIG.evolvePulseMs)}ms`,
  '--evolve-flash-ms': `${String(ANIMATION_CONFIG.battle.evolveFlashMs)}ms`,
  '--evolve-reveal-ms': `${String(ANIMATION_CONFIG.evolveRevealMs)}ms`,
} as CSSProperties

/** Vista pura de la secuencia (SSR-friendly): silueta / destello / revelación. */
export function EvolveOverlayView({
  phase,
  pulse,
  fromUrl,
  fromName,
  toUrl,
  toName,
}: EvolveOverlayViewProps) {
  return (
    <div
      className={styles.overlay}
      data-testid="evolve-overlay"
      data-phase={phase}
      data-pulse={pulse}
      role="status"
      aria-label={es.evolveOverlayLabel}
      style={cssVars}
    >
      <div className={styles.stage}>
        {phase === 'reveal' ? (
          <div className={styles.sprite} data-reveal="true">
            <EvolveSprite url={toUrl} name={toName} />
          </div>
        ) : (
          <div className={`${styles.sprite} ${styles.silhouette}`} data-silhouette="true">
            <EvolveSprite url={fromUrl} name={fromName} />
          </div>
        )}
      </div>
      {phase === 'flash' ? <div className={styles.flash} data-flash="true" /> : null}
    </div>
  )
}

function EvolveSprite({ url, name }: { readonly url: string | null; readonly name: string }) {
  return url === null ? (
    <span className={styles.fallback} data-missing="true">
      {name}
    </span>
  ) : (
    <img className={styles.spriteImg} src={url} alt={name} />
  )
}
