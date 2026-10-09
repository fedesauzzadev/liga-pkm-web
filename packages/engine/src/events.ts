// Eventos que el motor emite y la UI reproduce en orden (animación ≠ lógica).
import type { DeckId, DeckKey, Face } from '@liga/content'

/** Propósito de cada tirada (SDD §3): alimenta el log de dados y el replay. */
export type DiePurpose = 'move' | 'attackSelect' | 'gate' | 'effect' | 'wake' | 'dodge' | 'bonus'

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

/** Centro PKM: todo el equipo queda sin daño y sin derrotas (T-012). */
export type TeamHealed = {
  readonly type: 'TeamHealed'
  readonly player: string
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

/** Un comodín quedó asignado a un PKM como `element` (reasignable en Organize, T-013). */
export type WildcardAssigned = {
  readonly type: 'WildcardAssigned'
  readonly player: string
  readonly pkmUid: string
  readonly element: string
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
export type NoAttack = {
  readonly type: 'NoAttack'
  readonly attacker: string
  readonly reason: NoAttackReason
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
  | TeamHealed
  | CardToBottom
  | OakSwapped
  | ElementEquipped
  | ElementUnequipped
  | WildcardAssigned
  | BattleStarted
  | AttackUsed
  | NoAttack
  | AttackDodged
  | UnsupportedEffect
  | DamageTaken
  | Healed
  | WokeUp
  | PokemonFainted
  | PkmRetired
  | PkmSentOut
  | BattleEnded
  | XpGained
  | PkmEvolved
  | PokemonCaptured
  | GymLocked
  | RivalSentOut
  | MedalWon
  | PrizePkmWon
  | GameWon
