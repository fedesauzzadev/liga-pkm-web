// Estado del juego: JSON puro e inmutable (SDD §3). Jugadores y equipo llegan con T-010;
// la máquina de turnos completa (AwaitRoll/Moving/…) con T-011.
import type {
  CardId,
  DeckKey,
  Element,
  Faces,
  GymPrize,
  NodeId,
  PlayerId,
  PkmUid,
  Ruleset,
} from '@liga/content'
import type { DieRolled } from './events.ts'

/** Decisión que el motor espera del jugador (SDD §3: `state.pending`). */
export type Decision =
  | { readonly type: 'ChoosePath'; readonly options: readonly string[] }
  | { readonly type: 'StopOrContinue' }
  /** Encuentro con un PKM robado: pelear (T-020) o dejarlo ir (AC-1). */
  | { readonly type: 'FightOrRelease'; readonly card: string; readonly deck: DeckKey }
  /** Victoria sobre el rival: capturar (T-022) o liberar; la carta debe volver a un mazo. */
  | {
      readonly type: 'CaptureOrRelease'
      readonly card: string
      readonly deck: DeckKey
      readonly participants: readonly string[]
    }
  | { readonly type: 'ChooseAttack'; readonly options: readonly string[] }
  /** Batalla: el activo cayó y hay banquillo sano; el lado que repone actúa (D-02). */
  | { readonly type: 'ChooseReplacement'; readonly options: readonly string[] }
  /** Prof. Oak: intercambio opcional 1 a 1 equipo ↔ pila (T-061/AC-2); se saltea con Advance. */
  | { readonly type: 'OakSwap' }
  /** Gimnasio desafiable: aceptar el duelo (opcional, D-17) o seguir (T-061/AC-2). */
  | { readonly type: 'ChallengeGym'; readonly gym: string }

/** Fases de la máquina de turnos (SDD §5). T-011: ciclo organize → moving → tileResolution. */
export type Phase = 'idle' | 'organize' | 'moving' | 'tileResolution' | 'battle' | 'finished'

/** Carta de elemento suelta o equipada (RULES §3: no se consumen al atacar). */
export interface ElementCard {
  /** Id de instancia único (el id de mazo "element_water" se sufija con #n). */
  readonly id: CardId
  readonly element: Element
}

/** Un PKM en juego (SDD §4). Los estados de combate viven en BattleState (T-020). */
export interface PkmInstance {
  readonly uid: PkmUid
  readonly cardId: CardId
  readonly damage: number
  readonly xp: number
  readonly equipped: readonly ElementCard[]
  /** Cartas Multicolor asignadas a este PKM (RULES §3, D-23): máx 1, vale como 1 elemento del asignado. */
  readonly multicolor: readonly Element[]
  readonly fainted: boolean
}

/** Ítems de la bolsa por id de carta (T-049). Multicolor vive aparte (`multicolor`). */
export type BagItem = 'pokeball' | 'potion' | 'oportunidad' | 'super_potion' | 'ultraball' | 'masterball'

/** Las 6 keys de la bolsa (para invariantes y UI). */
export const BAG_ITEMS: readonly BagItem[] = [
  'pokeball',
  'potion',
  'oportunidad',
  'super_potion',
  'ultraball',
  'masterball',
]

export type ItemBag = { readonly [K in BagItem]: number }

export interface PlayerState {
  readonly id: PlayerId
  /** Nodo actual y de dónde vino (regla de no retroceder, RULES §2). */
  readonly position: NodeId
  readonly cameFrom: NodeId | null
  readonly team: readonly PkmInstance[] // máx 6 (ruleset.teamLimit)
  readonly oakPile: readonly PkmInstance[]
  readonly elements: readonly ElementCard[]
  readonly multicolor: number
  readonly items: ItemBag
  readonly medals: readonly string[]
}

/** Pilas de robo por mazo (cima = índice 0; D-10 mazo vacío = array vacío). */
export type DeckStacks = { readonly [K in DeckKey]: readonly CardId[] }

/**
 * Condiciones temporales de combate por PKM (EFFECTS §3). Viven en BattleState,
 * se limpian al retirar/derrotar salvo `disabledAttackId` y el daño. T-020 las
 * consume (ticks, pipeline); T-021 las aplica desde los efectos de los ataques.
 */
export interface PkmConditions {
  /** modifyRivalDamage (nextTurn): el próximo ataque de este PKM suma esto. */
  readonly rivalDamageMod?: number
  /** modifyRivalDamage combat (Gruñido, max 1): los ataques de este PKM suman esto todo el combate. */
  readonly combatDamageMod?: number
  /** flatReduction MAX 1 (Dureza/Refugio, D-15): los ataques recibidos restan esto. */
  readonly damageModCombat?: number
  /** selfBoost MAX 1 (Enfoque de energía): los ataques propios suman esto. */
  readonly selfBoost?: number
  /** Veneno: amount al inicio del turno de este PKM; no acumulable (RULES §4). */
  readonly poison?: number
  /** Drenadoras: al inicio del turno de este PKM, -amount y el otro lado +amount. */
  readonly drain?: number
  readonly rollGate?: {
    readonly failFaces: Faces
    readonly outcome: 'noAttack' | 'selfHit'
    readonly duration: 'nextTurn' | 'combat'
  }
  readonly asleep?: { readonly wakeFaces: Faces }
  readonly skipNextAttack?: boolean
  /** Esquive (Minimizar): cara en faces ⇒ el próximo ataque recibido no hace daño ni efecto. */
  readonly dodge?: { readonly faces: Faces }
  /** Inhabilitar (p.88): persiste aunque el PKM que la causó caiga. */
  readonly disabledAttackId?: string
  readonly usedMax?: readonly string[]
}

/** PKM rival (salvaje o de gimnasio): su vida vive solo en la batalla (SDD §4). */
export interface RivalPkm {
  readonly uid: PkmUid
  readonly cardId: CardId
  readonly damage: number
  readonly fainted: boolean
}

/**
 * Batalla activa (SPEC-C/T-020). Lados: 0 = jugador (retador), 1 = rival.
 * T-023: unión por `kind` — salvaje (carta robada de un mazo, capturable) o
 * gimnasio (2 PKM del líder, medalla + premio, derrota a los 2 propios caídos).
 */
interface BattleCore {
  readonly rival: readonly RivalPkm[]
  /** uid activo de cada lado; el del jugador apunta a PlayerState.team. */
  readonly active: readonly [PkmUid, PkmUid]
  readonly turnSide: 0 | 1
  readonly trainerId: string | null
  readonly conditions: { readonly [uid: string]: PkmConditions }
  /** PKM propios en su primer turno de la carta (regla de primer ataque, RULES §4). */
  readonly firstTurn: readonly PkmUid[]
  /** PKM propios que estuvieron en juego (XP, T-022). */
  readonly participants: readonly PkmUid[]
  /** true cuando el rival ya no tiene PKM sanos (espera captura, T-022). */
  readonly won: boolean
  /** El activo de este turno no puede atacar (falló la tirada de despertar). */
  readonly noAttackThisTurn: boolean
  /** retirada-solo-inicio-turno (D-32): ya se usó una acción este turno propio
   * (poción en combate); Retire solo es legal al inicio del turno, sin acciones previas. */
  readonly actedThisTurn: boolean
}

/** Encuentro salvaje: `card` está fuera del mazo `deck` mientras dure la batalla. */
export interface WildBattle extends BattleCore {
  readonly kind: 'wild'
  readonly card: CardId
  readonly deck: DeckKey
  /** PKM propios derrotados: con `chances` (D-22) el rival escapa al llegar a n. */
  lostCount: number
}

/** Duelo de gimnasio (T-023): snapshot del líder para que el estado sea autocontenido. */
export interface GymBattle extends BattleCore {
  readonly kind: 'gym'
  /** Key del gimnasio: nodo del tablero e id del líder en content/gyms.json. */
  readonly gym: string
  /** Nombre de la medalla (gyms.json, para el evento y la UI). */
  readonly medal: string
  /** Premio de la carta del líder (p.50). */
  readonly prize: GymPrize
  /** PKM propios derrotados en este duelo: 2 ⇒ gana el líder (RULES §4 p.43). */
  readonly lostCount: number
}

export type BattleState = WildBattle | GymBattle

export interface GameState {
  /** Versión del estado guardado (SDD §3: migraciones por versión). */
  readonly version: number
  readonly turn: number
  readonly phase: Phase
  readonly pending: Decision | null
  /** Batalla activa; null fuera de combate (SPEC-C/T-020). */
  readonly battle: BattleState | null
  /** Pasos restantes del dado durante el movimiento (SPEC-B/T-011/AC-1). */
  readonly stepsLeft: number
  /** Snapshot del RNG tras el último consumo: retoma el stream exacto (save/replay). */
  readonly rngState: number
  /** Log de dados: toda tirada queda registrada (replay + panel de debug). */
  readonly dieLog: readonly DieRolled[]
  /** Ruleset elegido en el setup; null hasta que arranca la partida. */
  readonly ruleset: Ruleset | null
  readonly players: readonly PlayerState[]
  readonly activePlayerId: PlayerId | null
  readonly decks: DeckStacks
}

export function createInitialState(): GameState {
  return {
    version: 1,
    turn: 0,
    phase: 'idle',
    pending: null,
    battle: null,
    stepsLeft: 0,
    rngState: 0,
    dieLog: [],
    ruleset: null,
    players: [],
    activePlayerId: null,
    decks: { bosque: [], montana: [], isla: [], llanura: [], pantano: [], item: [], sorpresa: [] },
  }
}
