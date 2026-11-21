// Eventos que el motor emite y la UI reproduce en orden (animación ≠ lógica).
import type { DeckId, DeckKey, Element, Face } from '@liga/content'

/** Propósito de cada tirada (SDD §3): alimenta el log de dados y el replay. */
export type DiePurpose = 'move' | 'attackSelect' | 'gate' | 'effect' | 'wake' | 'dodge' | 'bonus' | 'oportunidad'

export type DieRolled = {
  readonly type: 'DieRolled'
  readonly purpose: DiePurpose
  readonly value: Face
}

export type GameStarted = {
  readonly type: 'GameStarted'
  readonly player: string
  readonly starterDeck: DeckId
  readonly starter: string
  readonly position: string
}

/** Un paso del movimiento (incluidos los de rebote); la UI anima tramo a tramo. */
export type MoveStep = {
  readonly type: 'MoveStep'
  readonly player: string
  readonly from: string
  readonly to: string
}

/** El movimiento terminó sobre `node`: punto de resolución del casillero (T-012). */
export type Landed = {
  readonly type: 'Landed'
  readonly player: string
  readonly node: string
}

/** Carta robada de la cima de un mazo: elemento, PKM salvaje o ítem (T-012). */
export type CardDrawn = {
  readonly type: 'CardDrawn'
  readonly player: string
  readonly deck: DeckKey
  readonly card: string
}

/** Mazo vacío al robar (D-10): se informa a la UI, no es error. */
export type DeckEmpty = {
  readonly type: 'DeckEmpty'
  readonly player: string
  readonly deck: DeckKey
}

/** Una carta de elemento robada entró al inventario (T-061/AC-1). */
export type EnergyGained = {
  readonly type: 'EnergyGained'
  readonly player: string
  readonly element: Element
}

/** El casillero se resolvió sin decisión: qué pasó (T-061/AC-2). */
export type TileInfo = 'none' | 'oak' | 'disabledByRuleset'
export type TileResolved = {
  readonly type: 'TileResolved'
  readonly player: string
  readonly info: TileInfo
}

/** Centro PKM: todo el equipo queda sin daño y sin derrotas (T-012; T-061 agrega count). */
export type PartyHealed = {
  readonly type: 'PartyHealed'
  readonly player: string
  readonly count: number
}

/** La carta vuelve al FONDO del mazo: "dejar ir" (D-09) o ítem usado (AC-5). */
export type CardToBottom = {
  readonly type: 'CardToBottom'
  readonly player: string
  readonly deck: DeckKey
  readonly card: string
}

/** Intercambio equipo ↔ pila en el casillero del Prof. Oak (T-012). */
export type OakSwapped = {
  readonly type: 'OakSwapped'
  readonly player: string
  readonly teamUid: string
  readonly pileUid: string
}

/** Una carta de elemento del inventario pasó a estar equipada en un PKM (T-013). */
export type ElementEquipped = {
  readonly type: 'ElementEquipped'
  readonly player: string
  readonly pkmUid: string
  readonly elementId: string
}

/** Una carta equipada volvió al inventario del jugador (T-013). */
export type ElementUnequipped = {
  readonly type: 'ElementUnequipped'
  readonly player: string
  readonly pkmUid: string
  readonly elementId: string
}

/** Una carta Multicolor quedó asignada a un PKM como `element` (reasignable en Organize, T-013; D-23). */
export type MulticolorAssigned = {
  readonly type: 'MulticolorAssigned'
  readonly player: string
  readonly pkmUid: string
  readonly element: string
}

/** La carta Multicolor asignada al PKM volvió a los libres del jugador (T-104; D-30). */
export type MulticolorUnassigned = {
  readonly type: 'MulticolorUnassigned'
  readonly player: string
  readonly pkmUid: string
}

/** Un PKM del equipo cambió de posición (reordenar en Organize, T-074/SPEC-I). */
export type TeamReordered = {
  readonly type: 'TeamReordered'
  readonly player: string
  readonly uid: string
  readonly to: number
}

// ── Eventos de batalla (SPEC-C/T-020). `pkmUid` del lado jugador = uid del equipo. ──


/** La batalla arrancó: `rival` es la carta del encuentro y `active` el PKM del jugador. */
export type BattleStarted = {
  readonly type: 'BattleStarted'
  readonly player: string
  readonly kind: 'wild' | 'gym'
  readonly rival: string
  readonly active: string
}

/** "X usó Y": el ataque fue seleccionado y se resuelve (AC-3/AC-5). */
export type AttackUsed = {
  readonly type: 'AttackUsed'
  readonly attacker: string
  readonly attackId: string
  readonly target: string
}

/** El lado no atacó: attackSelect, dormido, skip o gate fallido (AC-3). */
export type NoAttackReason = 'attackSelect' | 'asleep' | 'skip' | 'gate'
/** Gate fallido: qué lo bloqueó — estado propio del atacante o gate del defensor (AC-3). */
export type NoAttackCause = 'paralized' | 'defended'
export type NoAttack = {
  readonly type: 'NoAttack'
  readonly attacker: string
  readonly reason: NoAttackReason
  /** Solo con `reason:'gate'`: origen del bloqueo y cara del dado de gate. */
  readonly cause?: NoAttackCause
  readonly value?: Face
}

/** Esquive (p.78-80): el ataque no hace daño ni efecto (T-021). */
export type AttackDodged = {
  readonly type: 'AttackDodged'
  readonly attacker: string
  readonly defender: string
}

/** Efecto custom sin handler registrado (o del set 2): el ataque resuelve sin él (T-021/AC-6). */
export type UnsupportedEffect = {
  readonly type: 'UnsupportedEffect'
  readonly handler: string
  readonly attackId: string
}

/** Daño aplicado (pipeline AC-4) o directo sin modificadores (RULES §4). */
export type DamageTaken = {
  readonly type: 'DamageTaken'
  readonly pkmUid: string
  readonly amount: number
  readonly cause: 'attack' | 'poison' | 'drain' | 'drainNow' | 'selfDamage'
}

/** Curación: poción, drenaje o efecto propio (AC-1). */
export type Healed = {
  readonly type: 'Healed'
  readonly pkmUid: string
  readonly amount: number
  readonly cause: 'potion' | 'drain' | 'drainNow' | 'healSelf'
}

/** Tirada de despertar exitosa (RULES §4 ①). */
export type WokeUp = { readonly type: 'WokeUp'; readonly pkmUid: string }

/** Estado de combate aplicado por un ataque (T-072: log del historial; la
 * visibilidad completa agrega los slots que antes se seteaban en silencio). */
export type ConditionName =
  | 'asleep'
  | 'poison'
  | 'confused' // rollGate selfHit (Confusión/Hipno-rayo)
  | 'noAttackGate' // rollGate noAttack (Impact-trueno/Polvo de esporas)
  | 'skip' // skipNextAttack (Lianas)
  | 'drain' // drainEachTurn (Drenadoras)
  | 'shield' // damageModCombat (flatReduction: Dureza/Refugio/Barrera)
  | 'selfBoost' // selfBoost (Enfoque de energía)
  | 'weakened' // rivalDamageMod/combatDamageMod (Burbujas/Gruñido)
  | 'dodge' // dodge (Minimizar)
export type ConditionApplied = {
  readonly type: 'ConditionApplied'
  readonly pkmUid: string
  readonly condition: ConditionName
  /** Caras que activan el gate ('confused'/'noAttackGate'): para el chat. */
  readonly faces?: Face[]
}

/** Gate fallido con auto-ataque (Confusión): se emite antes del AttackUsed. */
export type SelfHit = {
  readonly type: 'SelfHit'
  readonly attacker: string
  /** Cara del dado de gate que disparó el auto-ataque. */
  readonly value: Face
}

/** Condición de duración nextTurn consumida al fin del turno (rollGate/skip/weakened). */
export type ConditionCleared = {
  readonly type: 'ConditionCleared'
  readonly pkmUid: string
  readonly condition: ConditionName
}

/** `damage ≥ hp` ⇒ derrotado (AC-7). */
export type PokemonFainted = { readonly type: 'PokemonFainted'; readonly pkmUid: string }

/** Retiro voluntario: pierde el ataque del turno (AC-6). */
export type PkmRetired = {
  readonly type: 'PkmRetired'
  readonly player: string
  readonly from: string
  readonly to: string
}

/** Reemplazo tras una derrota: el lado que repone actúa (D-02). */
export type PkmSentOut = { readonly type: 'PkmSentOut'; readonly player: string; readonly pkmUid: string }

/** Fin de la batalla: victoria (captura T-022) o derrota (el salvaje escapa, AC-7). */
export type BattleEnded = {
  readonly type: 'BattleEnded'
  readonly player: string
  readonly result: 'won' | 'lost'
}

/** +1 XP por combate ganado a cada PKM propio que participó (T-022/AC-1, RULES §4 p.47-49). */
export type XpGained = { readonly type: 'XpGained'; readonly pkmUid: string; readonly amount: number }

/** TrainerAppeared: el líder gimnasio apareció (final de vista, ER-001). */
export type TrainerAppeared = {
  readonly type: 'TrainerAppeared'
  readonly trainerId: string
}

/** Evolución: la carta se reemplaza; XP=0 (D-04) y el daño se conserva (D-05, T-022/AC-2). */
export type PkmEvolved = {
  readonly type: 'PkmEvolved'
  readonly player: string
  readonly pkmUid: string
  readonly from: string
  readonly to: string
}

/** Captura: la carta derrotada pasa al equipo o a la pila de Oak (T-022/AC-3, AC-4). */
export type PokemonCaptured = {
  readonly type: 'PokemonCaptured'
  readonly player: string
  readonly card: string
  readonly pkmUid: string
  readonly destination: 'team' | 'oakPile'
}

// ── Eventos de gimnasio (SPEC-C/T-023). ──

/** El gimnasio exige `requiresMedals` (Giovanni: 7) y el jugador no las tiene (AC-1). */
export type GymLocked = {
  readonly type: 'GymLocked'
  readonly player: string
  readonly gym: string
  readonly requiresMedals: number
}

/** El líder repone a su PKM caído: el lado que repone actúa (D-02, AC-2). */
export type RivalSentOut = {
  readonly type: 'RivalSentOut'
  readonly pkmUid: string
}

/** Medalla ganada al derrotar a los 2 PKM del líder (AC-2). */
export type MedalWon = {
  readonly type: 'MedalWon'
  readonly player: string
  readonly gym: string
  readonly medal: string
}

/** Aterrizó en un gimnasio cuya medalla ya tiene (medalla-gimnasio/AC-2). */
export type GymAlreadyWon = {
  readonly type: 'GymAlreadyWon'
  readonly player: string
  readonly gym: string
}

/** Premio PKM del líder (p.50): se conserva sin gastar Pokebola (AC-3). */
export type PrizePkmWon = {
  readonly type: 'PrizePkmWon'
  readonly player: string
  readonly card: string
  readonly pkmUid: string
  readonly destination: 'team' | 'oakPile'
}

/** Medallas completas: fin de la partida (AC-4). */
export type GameWon = { readonly type: 'GameWon'; readonly player: string }

export type GameEvent =
  | DieRolled
  | { readonly type: 'TurnAdvanced'; readonly turn: number }
  | GameStarted
  | MoveStep
  | Landed
  | CardDrawn
  | DeckEmpty
  | EnergyGained
  | TileResolved
  | PartyHealed
  | CardToBottom
  | OakSwapped
  | ElementEquipped
  | ElementUnequipped
  | MulticolorAssigned
  | MulticolorUnassigned
  | TeamReordered
  | BattleStarted
  | AttackUsed
  | NoAttack
  | AttackDodged
  | UnsupportedEffect
  | DamageTaken
  | Healed
  | WokeUp
  | ConditionApplied
  | ConditionCleared
  | SelfHit
  | PokemonFainted
  | PkmRetired
  | PkmSentOut
  | TrainerAppeared
  | BattleEnded
  | XpGained
  | PkmEvolved
  | PokemonCaptured
  | GymLocked
  | GymAlreadyWon
  | RivalSentOut
  | MedalWon
  | PrizePkmWon
  | GameWon
