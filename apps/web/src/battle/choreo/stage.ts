// Estado de presentación de la coreografía (SPEC-D/T-032d): JSON serializable,
// se reconstruye SOLO desde eventos (animación ≠ lógica). El coreógrafo emite
// copias nuevas; ninguna animación toca el estado del juego.
import type { Face } from '@liga/content'
import type {
  ConditionApplied,
  ConditionCleared,
  DiePurpose,
  PkmConditions,
  PkmInstance,
  PokemonCard,
} from '@liga/engine'

export type FloaterTone = 'damage' | 'heal' | 'xp'

export interface StageFloater {
  readonly id: number
  readonly uid: string
  readonly text: string
  readonly tone: FloaterTone
}

export interface StageActor {
  readonly uid: string
  readonly card: PokemonCard
  readonly damage: number
  readonly fainted: boolean
  /** Instancia original del lado jugador (para la carta TCG); solo lectura. */
  readonly pkm?: PkmInstance
  readonly conditions?: PkmConditions
}

export interface CaptureVisual {
  readonly phase: 'arc' | 'shake' | 'caught'
  readonly shakes: number
}

/** Evolución clásica (cargar-charmeleon-animar-evolucion/AC-4): silueta blanca
 * que pulsa `pulse` (1..N, creciente) antes del destello; `reveal` después. */
export interface EvolveVisual {
  readonly uid: string
  readonly phase: 'pulse' | 'reveal'
  readonly pulse: number
}

/** dado-de-combate: propósitos que reproduce el dado propio del popup (AC-1). */
export const BATTLE_DIE_PURPOSES = [
  'attackSelect',
  'gate',
  'effect',
  'wake',
  'dodge',
  'bonus',
] as const

export type BattleDiePurpose = (typeof BATTLE_DIE_PURPOSES)[number]

export const isBattleDiePurpose = (purpose: DiePurpose): purpose is BattleDiePurpose =>
  (BATTLE_DIE_PURPOSES as readonly DiePurpose[]).includes(purpose)

export interface BattleStage {
  readonly started: boolean
  readonly kind: 'wild' | 'gym' | null
  readonly sweep: boolean
  readonly player: StageActor | null
  readonly rival: StageActor | null
  readonly trainerId: string | null
  /** El entrenador aparece en la zona rival (ER-001, T-112): id del entrenador
   * que se muestra con `SpriteSlot name="trainer"` hasta que se retira. */
  readonly trainerAppeared: string | null
  /** combate-legible/AC-2: lado cuyo ataque está en curso (desempata el anuncio
   * del gate cuando AMBOS lados están confundidos). */
  readonly actingSide: 'player' | 'rival'
  /** fix-animacion-dados-combate/AC-2: el rival ya tiró attackSelect en su
   * turno actual y todavía no resolvió la acción (su gate/dodge es rival). */
  readonly rivalPick: boolean
  readonly message: string | null
  readonly attackSelectValue: Face | null
  /** dado-de-combate/AC-1: última tirada de combate (null ⇒ mesa vacía, AC-5). */
  readonly dieValue: Face | null
  readonly diePurpose: BattleDiePurpose | null
  /** rediseno-combate-max/AC-2: lado que juega esta tirada (dado de ese lado). */
  readonly dieSide: 'player' | 'rival' | null
  /** Contador de tiradas (seed determinista del dado + forzar tirada repetida). */
  readonly dieNonce: number
  /** Tiradas encadenadas (Doble bofetón): 1 = primera, 2+ = encadenada. */
  readonly dieChain: number
  /** rediseno-combate-max/AC-3: daño base del último ataque usado (distingue
   * "base 0" de "reducido a 0" en un DamageTaken{amount:0}). */
  readonly lastAttackBaseDamage: number | null
  readonly entrance: readonly ('player' | 'rival')[]
  readonly raised: 'player' | 'rival' | null
  readonly blink: string | null
  readonly floaters: readonly StageFloater[]
  readonly flash: 'evolve' | 'capture' | 'medal' | 'trainer' | null
  readonly capture: CaptureVisual | null
  readonly evolve: EvolveVisual | null
  readonly ended: 'won' | 'lost' | null
}

export function createStage(): BattleStage {
  return {
    started: false,
    kind: null,
    sweep: false,
    player: null,
    rival: null,
    trainerId: null,
    trainerAppeared: null,
    actingSide: 'player',
    rivalPick: false,
    message: null,
    attackSelectValue: null,
    dieValue: null,
    diePurpose: null,
    dieSide: null,
    dieNonce: 0,
    dieChain: 0,
    lastAttackBaseDamage: null,
    entrance: [],
    raised: null,
    blink: null,
    floaters: [],
    flash: null,
    capture: null,
    evolve: null,
    ended: null,
  }
}

/** Entrada de roster que la app resuelve desde el estado real (equipo / batalla). */
export interface ChoreoActorInput {
  readonly uid: string
  readonly cardId: string
  readonly damage?: number
  readonly fainted?: boolean
  readonly pkm?: PkmInstance
  readonly conditions?: PkmConditions
}

/** Resolución de datos de juego (solo lectura) para la coreografía. */
export interface BattleChoreoDeps {
  readonly cardOf: (cardId: string) => PokemonCard | undefined
  readonly actorOf: (uid: string) => ChoreoActorInput | undefined
  /** Primer PKM del rival al iniciar (`ref` = carta salvaje o key de gimnasio). */
  readonly rivalEntry: (kind: 'wild' | 'gym', ref: string) => ChoreoActorInput | undefined
  /** fix-sprites-lideres-gimnasio/AC-5: nombre del líder (content/gyms.json)
   * para el mensaje de aparición — los líderes no son cartas, `cardOf` no los
   * resuelve. Sin dep, se muestra el id (nunca queda vacío). */
  readonly leaderNameOf?: (leaderId: string) => string | undefined
}

export function toStageActor(
  deps: BattleChoreoDeps,
  input: ChoreoActorInput,
): StageActor | null {
  const card = deps.cardOf(input.cardId)
  if (card === undefined) return null
  return {
    uid: input.uid,
    card,
    damage: input.damage ?? 0,
    fainted: input.fainted ?? false,
    ...(input.pkm !== undefined ? { pkm: input.pkm } : {}),
    ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
  }
}

export function actorSideOf(stage: BattleStage, uid: string | null): 'player' | 'rival' | null {
  if (uid === null) return null
  if (stage.player?.uid === uid) return 'player'
  if (stage.rival?.uid === uid) return 'rival'
  return null
}

// ── combate-legible: conditions del actor vivas en el stage (AC-4) y atacante
// confundido para anunciar el gate (AC-2). Solo se derivan del evento; los
// slots cuyo dato no viaja en el evento (poison/shield/…) no cambian acá. ──

const omit = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const copy: { [P in keyof T]?: T[P] } = { ...value }
  delete copy[key]
  return copy as Omit<T, K>
}

/** Conditions del actor tras un `ConditionApplied` (AC-4): confused/noAttackGate
 * reconstruyen el rollGate con las caras del evento y skip marca skipNextAttack.
 * La duration es inert para la presentación (se limpia por ConditionCleared). */
export function conditionsAfterApplied(
  conditions: PkmConditions | undefined,
  condition: ConditionApplied['condition'],
  faces?: readonly Face[],
): PkmConditions {
  const base: PkmConditions = conditions ?? {}
  if (condition === 'confused' || condition === 'noAttackGate') {
    return {
      ...base,
      rollGate: {
        failFaces: [...(faces ?? [])],
        outcome: condition === 'confused' ? 'selfHit' : 'noAttack',
        duration: 'nextTurn',
      },
    }
  }
  if (condition === 'skip') return { ...base, skipNextAttack: true }
  // fix-animacion-dados-combate/AC-2: asleep alimenta el routing del wake (el
  // evento no trae wakeFaces: se guardan vacías, es solo presentación).
  if (condition === 'asleep') return { ...base, asleep: { wakeFaces: [...(faces ?? [])] } }
  return base
}

/** Conditions del actor tras un `ConditionCleared` (AC-4): el slot de la
 * condición sale; si no estaba, no cambia nada. */
export function conditionsAfterCleared(
  conditions: PkmConditions | undefined,
  condition: ConditionCleared['condition'],
): PkmConditions {
  const base: PkmConditions = conditions ?? {}
  if (condition === 'confused' || condition === 'noAttackGate') return omit(base, 'rollGate')
  if (condition === 'skip') return omit(base, 'skipNextAttack')
  if (condition === 'weakened') {
    return omit(omit(base, 'rivalDamageMod'), 'combatDamageMod')
  }
  if (condition === 'asleep') return omit(base, 'asleep')
  return base
}

/** Conditions del actor tras un `WokeUp` (fix-animacion-dados-combate/AC-2): la
 * condición `asleep` sale del stage (el motor la borra al despertar sin emitir
 * un `ConditionCleared`). El caller chequea que `asleep` esté presente. */
export function conditionsAfterWokeUp(conditions: PkmConditions): PkmConditions {
  return omit(conditions, 'asleep')
}

/** Atacante confundido en escena (AC-2): actor con rollGate selfHit; si ambos
 * lados están confundidos, manda el lado que está atacando (`actingSide`). */
export function confusedAttackerOf(stage: BattleStage): StageActor | null {
  const isConfused = (actor: StageActor | null): boolean =>
    actor?.conditions?.rollGate?.outcome === 'selfHit'
  const player = isConfused(stage.player) ? stage.player : null
  const rival = isConfused(stage.rival) ? stage.rival : null
  if (player !== null && rival !== null) return stage.actingSide === 'rival' ? rival : player
  return player ?? rival
}

/** Lado que rueda un dado de combate (fix-animacion-dados-combate/AC-2): manda
 * el turno en curso. attackSelect siempre del rival (solo el rival elige con
 * dado); gate/dodge del lado del turno (el rival SIEMPRE tira attackSelect
 * antes y `rivalPick` lo marca); wake del lado dormido (si solo uno lo está; si
 * ambos, el contrario del último que actuó); effect/bonus del atacante. */
export function dieSideOf(stage: BattleStage, purpose: BattleDiePurpose): 'player' | 'rival' {
  if (purpose === 'attackSelect') return 'rival'
  if (purpose === 'wake') {
    const playerAsleep = stage.player?.conditions?.asleep !== undefined
    const rivalAsleep = stage.rival?.conditions?.asleep !== undefined
    if (playerAsleep !== rivalAsleep) return playerAsleep ? 'player' : 'rival'
    return stage.actingSide === 'rival' ? 'player' : 'rival'
  }
  if (purpose === 'gate' || purpose === 'dodge') return stage.rivalPick ? 'rival' : 'player'
  return stage.actingSide
}
