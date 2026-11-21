export type PlaybackSpeed = '1x' | '2x' | 'skip'

export const ANIMATION_CONFIG = {
  stepDelayMs: 120,
  fastStepDelayMs: 60,
  /** Tween de la barra de HP de combate (SPEC-D/T-032a/AC-6). */
  hpTweenMs: 600,
  /** Evolución clásica (cargar-charmeleon-animar-evolucion/AC-3, AC-4):
   * silueta blanca que pulsa `evolvePulses` veces (amplitud creciente),
   * destello (battle.evolveFlashMs) y revelación de la nueva forma. Presupuesto
    * de la secuencia en combate (pulsos + destello + revelación + mensaje):
    * 3×320 + 420 + 500 + 900 = 2780 ms ≤ 3,5 s a 1× (SPEC-D/T-032d). */
  evolvePulseMs: 320,
  evolvePulses: 3,
  evolveRevealMs: 500,
  /** Coreografía de combate (SPEC-D/T-032d): presupuesto de turno ≤ 3,5 s a 1×. */
  battle: {
    /** Barrido de pantalla del encuentro (AC-1). */
    encounterSweepMs: 550,
    /** Entrada de sprite (PKM entra / encuentro, AC-1). */
    entranceMs: 450,
    /** Pausa fija de referencia (T-032b/AC-1: 700-900 ms). Ya NO se usa para
     * coreografiar: fix-animacion-dados-combate/AC-3,AC-4 esperan la duración
     * REAL de la tirada (battle/dieTiming.ts, misma fórmula y seed que el
     * dado en pantalla, sin doble escalado). */
    dieRollMs: 800,
    /** Typewriter de "X usó Y": por carácter y tope total (AC-1). */
    typewriterCharMs: 24,
    typewriterMaxMs: 600,
    /** Carta se levanta al atacar (AC-1). */
    raiseMs: 280,
    /** FX del ataque vía playMoveFx (AC-1). */
    fxMs: 750,
    /** Daño: parpadeo ×N + número flotante + asentamiento de la barra (AC-1). */
    blinkMs: 140,
    blinkCount: 3,
    damageSettleMs: 650,
    /** Curación / drenaje (AC-1). */
    healMs: 500,
    /** Mensajes simples (estados, intro, fin).
     * combate-legible/AC-1: ≥ 800 ms a 1× para que un mensaje se lea; las
     * esperas por mensaje de la coreografía usan este valor. */
    messageMs: 900,
    /** Derrota: caída del sprite (AC-1). */
    faintedMs: 500,
    /** Evolución: destello + cambio de sprite (AC-1). */
    evolveFlashMs: 420,
    /** Captura: arco, sacudidas y destello (AC-1; captura-en-popup-combate/AC-6
     * los volvió más lentos para leer la coreografía; en sincronía exacta con
     * las keyframes ballArc/ballShake/ballCaught de BattleScene.module.css). */
    captureArcMs: 700,
    captureShakeMs: 400,
    captureFlashMs: 500,
    /** XP flotante (AC-1). */
    xpMs: 350,
    /** Entrenador aparece: sprite del líder (ER-001). */
    trainerIntroMs: 250,
    trainerFlashMs: 150,
    trainerOutroMs: 400,
  } as const,
} as const

export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = ['1x', '2x', 'skip']

export const speedToDelay = (speed: PlaybackSpeed): number => {
  if (speed === 'skip') return 0
  if (speed === '2x') return ANIMATION_CONFIG.fastStepDelayMs
  return ANIMATION_CONFIG.stepDelayMs
}
