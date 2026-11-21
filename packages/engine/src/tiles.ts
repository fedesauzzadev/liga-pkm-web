// Resolución de casilleros (SPEC-B/T-012): mazos, mercado, Centro PKM y Prof. Oak.
// Reglas: RULES §2 (efectos por casillero), D-09 (fondo del mazo) y D-10 (vacío).
// Funciones de dominio que mutan un draft immer; los handlers de engine.ts validan
// fase/decisión y despachan. Sin azar, sin DOM: el motor es puro (ADR-1).
import type { WritableDraft } from 'immer'
import { ELEMENTS } from '@liga/content'
import type { BoardNode, CardId, Content, DeckId, DeckKey, Element } from '@liga/content'
import { parseCardId } from '@liga/content'
import { boardIndexFor } from './board.ts'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import { gymChallengeable } from './gyms-data.ts'
import type {
  CardDrawn,
  CardToBottom,
  EnergyGained,
  GameEvent,
  OakSwapped,
  PartyHealed,
  TileResolved,
} from './events.ts'
import type { GameState, PlayerState } from './state.ts'

type Draft = WritableDraft<GameState>
type PlayerDraft = WritableDraft<PlayerState>

/** Prefijo canónico de las cartas de elemento en los mazos (content/decks.json). */
export const ELEMENT_CARD_PREFIX = 'element_'

/** Cartas de ítem del mazo Ítem (items.json, T-049). */
export const ITEM_DECK_CARDS: readonly string[] = ['multicolor', 'potion', 'pokeball', 'oportunidad']
/** Cartas de ítem no-PKM del mazo Sorpresa (items.json, T-049). */
export const SORPRESA_ITEM_CARDS: readonly string[] = ['super_potion', 'ultraball', 'masterball']

function illegal(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('ILLEGAL_COMMAND', message) }
}

function invalidContent(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('INVALID_CONTENT', message) }
}

/** `element_water` ⇒ `water`; null si no es una carta de elemento. */
export function elementOfCardId(id: string): Element | null {
  if (!id.startsWith(ELEMENT_CARD_PREFIX)) return null
  const element = id.slice(ELEMENT_CARD_PREFIX.length) as Element
  return ELEMENTS.includes(element) ? element : null
}

/** Id de instancia único (`element_<el>#n`, convención de state.ts): máximo + 1. */
export function nextElementInstanceId(player: PlayerState, element: Element): CardId {
  const prefix = `${ELEMENT_CARD_PREFIX}${element}#`
  let max = 0
  const owned = [...player.elements, ...player.team.flatMap((pkm) => pkm.equipped)]
  for (const card of owned) {
    if (!card.id.startsWith(prefix)) continue
    const n = Number.parseInt(card.id.slice(prefix.length), 10)
    if (Number.isInteger(n) && n > max) max = n
  }
  return parseCardId(`${prefix}${max + 1}`)
}

/** Fondo del mazo (D-09 y AC-5): única vía por la que una carta vuelve a un mazo. */
export function pushToBottom(stack: readonly CardId[], card: CardId): CardId[] {
  return [...stack, card]
}

/** Roba la cima de `deck`: saca la carta de la pila y arma el evento (AC-1/AC-2). */
function drawTop(draft: Draft, deck: DeckKey, player: PlayerDraft): CardDrawn {
  const top = draft.decks[deck][0]!
  draft.decks[deck] = draft.decks[deck].slice(1)
  return { type: 'CardDrawn', player: player.id, deck, card: top }
}

/** Entrega una carta de ítem robada al jugador: a la bolsa (o al contador Multicolor). */
export function giveItemCard(player: PlayerDraft, raw: string): boolean {
  if (raw === 'multicolor') {
    player.multicolor += 1
    return true
  }
  if (raw !== 'potion' && raw !== 'pokeball' && raw !== 'oportunidad' && raw !== 'super_potion' && raw !== 'ultraball' && raw !== 'masterball') {
    return false
  }
  const key = raw
  player.items = { ...player.items, [key]: player.items[key] + 1 }
  return true
}

export type SorpresaDraw =
  | { readonly kind: 'item'; readonly events: readonly GameEvent[] }
  | { readonly kind: 'pkm'; readonly card: string; readonly events: readonly GameEvent[] }
  | { readonly kind: 'empty'; readonly events: readonly GameEvent[] }

/**
 * Roba la cima del mazo Sorpresa (T-049) SIN decidir qué pasa con un PKM: la
 * carta Oportunidad lo convierte en encuentro; el premio de un líder lo entrega
 * directo (p.50, sin Pokebola). Ítem ⇒ ya entra a la bolsa.
 */
export function drawSorpresaCard(
  draft: Draft,
  content: Content,
  player: PlayerDraft,
): Result<SorpresaDraw, EngineError> {
  if (draft.decks.sorpresa.length === 0) {
    return { ok: true, value: { kind: 'empty', events: [{ type: 'DeckEmpty', player: player.id, deck: 'sorpresa' }] } } // D-10
  }
  const drawn = drawTop(draft, 'sorpresa', player)
  const raw: string = drawn.card
  if (SORPRESA_ITEM_CARDS.includes(raw)) {
    if (!giveItemCard(player, raw)) {
      return invalidContent(`ítem "${raw}" del mazo Sorpresa no entra en la bolsa`)
    }
    return { ok: true, value: { kind: 'item', events: [drawn] } }
  }
  if (!content.cards.some((card) => card.id === raw)) {
    return invalidContent(`carta "${raw}" del mazo Sorpresa no existe en content/pokemon`)
  }
  return { ok: true, value: { kind: 'pkm', card: raw, events: [drawn] } }
}

/** Mazo de elemento: elemento ⇒ inventario; PKM ⇒ encuentro pendiente (AC-1). */
function drawFromDeck(
  draft: Draft,
  content: Content,
  player: PlayerDraft,
  deck: DeckId,
): Result<readonly GameEvent[], EngineError> {
  if (draft.decks[deck].length === 0) {
    return { ok: true, value: [{ type: 'DeckEmpty', player: player.id, deck }] } // D-10
  }
  const drawn = drawTop(draft, deck, player)
  const element = elementOfCardId(drawn.card)
  if (element !== null) {
    // Id de instancia (el del mazo se repite entre copias); la carta nunca vuelve (AC-5).
    player.elements.push({ id: nextElementInstanceId(player, element), element })
    const gained: EnergyGained = { type: 'EnergyGained', player: player.id, element }
    return { ok: true, value: [drawn, gained] } // T-061/AC-1: la energía avisa que entró
  }
  if (!content.cards.some((card) => card.id === drawn.card)) {
    return invalidContent(`carta "${drawn.card}" del mazo ${deck} no existe en content/pokemon`)
  }
  draft.pending = { type: 'FightOrRelease', card: drawn.card, deck }
  return { ok: true, value: [drawn] }
}

/** Mercado: la cima del mazo Ítem entra a la bolsa o suma Multicolor (AC-2, T-049). */
function drawFromItemDeck(
  draft: Draft,
  player: PlayerDraft,
): Result<readonly GameEvent[], EngineError> {
  if (draft.decks.item.length === 0) {
    return { ok: true, value: [{ type: 'DeckEmpty', player: player.id, deck: 'item' }] }
  }
  const top = draft.decks.item[0]!
  const raw: string = top
  if (!ITEM_DECK_CARDS.includes(raw)) {
    return invalidContent(`ítem "${raw}" del mazo Ítem no entra en la bolsa (solo ${ITEM_DECK_CARDS.join('/')})`)
  }
  if (!giveItemCard(player, raw)) {
    return invalidContent(`ítem "${raw}" del mazo Ítem no entra en la bolsa`)
  }
  draft.decks.item = draft.decks.item.slice(1)
  return { ok: true, value: [{ type: 'CardDrawn', player: player.id, deck: 'item', card: top }] }
}

/** Centro PKM: cura a TODO el equipo (daño 0, derrotas fuera) (AC-2, D-07). */
function healTeam(player: PlayerDraft): Result<readonly GameEvent[], EngineError> {
  const count = player.team.length
  player.team = player.team.map((pkm) => ({ ...pkm, damage: 0, fainted: false }))
  const healed: PartyHealed = { type: 'PartyHealed', player: player.id, count }
  return { ok: true, value: [healed] }
}

/** Casillero resuelto sin decisión (T-061/AC-2): nada, oak sin intercambio o deshabilitado. */
function tileResolved(playerId: string, info: TileResolved['info']): TileResolved {
  return { type: 'TileResolved', player: playerId, info }
}

/**
 * Resuelve el casillero donde aterrizó el jugador (RULES §2). Muta el draft y
 * devuelve los eventos; puede dejar `pending` (`FightOrRelease`, `OakSwap`,
 * `ChallengeGym`): el turno NO termina hasta resolverlo (Advance saltea las
 * decisiones opcionales). `duelo`/`sorpresa`/`liga` deshabilitados por el
 * ruleset avisan `TileResolved{disabledByRuleset}` (AC-2); habilitados aún no
 * existen y fallan explícito. El gimnasio es opcional (D-17, T-061).
 */
export function resolveTile(
  draft: Draft,
  content: Content,
): Result<readonly GameEvent[], EngineError> {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) return illegal('sin jugador activo')
  if (draft.ruleset === null) return illegal('no hay partida iniciada (falta ruleset)')
  let node: BoardNode
  try {
    node = boardIndexFor(content.board).node(player.position)
  } catch {
    return invalidContent(`posición "${player.position}" no está en el tablero`)
  }
  if (node.type === 'duelo' || node.type === 'sorpresa' || node.type === 'liga') {
    return draft.ruleset.features[node.type]
      ? invalidContent(`casillero "${node.type}" habilitado pero no implementado (T-020+)`)
      : { ok: true, value: [tileResolved(player.id, 'disabledByRuleset')] }
  }
  switch (node.type) {
    case 'deck':
      if (node.deck === undefined) {
        return invalidContent(`nodo de mazo "${node.id}" sin mazo asignado`)
      }
      return drawFromDeck(draft, content, player, node.deck)
    case 'mercado':
      return drawFromItemDeck(draft, player)
    case 'centro':
      return healTeam(player)
    case 'gym': {
      // T-023: el desafío es opcional (D-17); Giovanni exige medallas (AC-1).
      if (node.gym === undefined) {
        return invalidContent(`nodo de gimnasio "${node.id}" sin gym asignado`)
      }
      const requires = content.board.gyms[node.gym]?.requiresMedals
      if (requires !== undefined && player.medals.length < requires) {
        return {
          ok: true,
          value: [{ type: 'GymLocked', player: player.id, gym: node.gym, requiresMedals: requires }],
        }
      }
      // medalla-gimnasio/AC-2: gimnasio ya ganado: aviso explícito en lugar
      // del TileResolved none silencioso (la UI lo cuenta en panel e historial).
      if (player.medals.includes(node.gym)) {
        return { ok: true, value: [{ type: 'GymAlreadyWon', player: player.id, gym: node.gym }] }
      }
      // Desafiable (T-061/AC-2): decisión opcional mientras haya un PKM sano;
      // si no hay nada que decidir, el casillero no frena el turno.
      if (gymChallengeable(content, player.medals, node.gym) && player.team.some((pkm) => !pkm.fainted)) {
        draft.pending = { type: 'ChallengeGym', gym: node.gym }
      }
      return { ok: true, value: [tileResolved(player.id, 'none')] }
    }
    case 'oak':
      // T-061/AC-2: con equipo y pila hay intercambio opcional; si no, solo avisa.
      if (player.team.length > 0 && player.oakPile.length > 0) {
        draft.pending = { type: 'OakSwap' }
        return { ok: true, value: [tileResolved(player.id, 'oak')] }
      }
      return { ok: true, value: [tileResolved(player.id, 'oak')] }
    case 'empty':
    case 'start':
    case 'junction':
      return { ok: true, value: [tileResolved(player.id, 'none')] }
  }
}

/** "Dejar ir" (AC-3, D-09): el PKM robado vuelve al FONDO de su mazo. */
export function releaseWild(draft: Draft): Result<readonly GameEvent[], EngineError> {
  const pending = draft.pending
  if (pending?.type !== 'FightOrRelease') return illegal('no hay encuentro pendiente')
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) return illegal('sin jugador activo')
  draft.decks[pending.deck] = pushToBottom(draft.decks[pending.deck], parseCardId(pending.card))
  draft.pending = null
  draft.turn += 1
  draft.phase = 'organize'
  const toBottom: CardToBottom = { type: 'CardToBottom', player: player.id, deck: pending.deck, card: pending.card }
  return { ok: true, value: [toBottom] }
}

/**
 * Prof. Oak (AC-2): intercambio 1 a 1 equipo ↔ pila. El que pasa a la pila se
 * cura; el que entra conserva su estado (la pila siempre está sana). Al ser 1 a 1
 * el equipo nunca supera `ruleset.teamLimit`. El entrante se re-valida sano
 * (no-cambiar-a-muerto): defensa en profundidad además del invariante
 * `casillero/pila-de-oak-sana`.
 */
export function swapWithOak(
  draft: Draft,
  content: Content,
  teamUid: string,
  pileUid: string,
): Result<readonly GameEvent[], EngineError> {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) return illegal('sin jugador activo')
  let atOak: boolean
  try {
    atOak = boardIndexFor(content.board).node(player.position).type === 'oak'
  } catch {
    return invalidContent(`posición "${player.position}" no está en el tablero`)
  }
  if (!atOak) return illegal('SwapWithOak solo en el casillero del Prof. Oak')
  const teamIndex = player.team.findIndex((pkm) => pkm.uid === teamUid)
  if (teamIndex < 0) return illegal(`"${teamUid}" no está en el equipo`)
  const pileIndex = player.oakPile.findIndex((pkm) => pkm.uid === pileUid)
  if (pileIndex < 0) return illegal(`"${pileUid}" no está en la pila de Oak`)
  const incoming = player.oakPile[pileIndex]!
  if (incoming.fainted || incoming.damage > 0) {
    return illegal(`el PKM de la pila debe estar sano para entrar al equipo (D-07)`)
  }
  const healed = { ...player.team[teamIndex]!, damage: 0, fainted: false }
  player.team[teamIndex] = player.oakPile[pileIndex]!
  player.oakPile[pileIndex] = healed
  const swapped: OakSwapped = { type: 'OakSwapped', player: player.id, teamUid, pileUid }
  return { ok: true, value: [swapped] }
}
