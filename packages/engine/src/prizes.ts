// Premios de gimnasio (SPEC-C/T-023 p.50 + SPEC-F/T-049): cartas del mazo del
// líder, PKM explícito sin Pokebola y premio Sorpresa de Giovanni. Extraído de
// battle-core.ts en T-049 para mantener los archivos ≤ 400 líneas.
import type { WritableDraft } from 'immer'
import type { CardId, Content, DeckKey, GymPrize, PkmUid } from '@liga/content'
import { parseCardId, parsePkmUid } from '@liga/content'
import { EngineError } from './errors.ts'
import type { GameEvent } from './events.ts'
import { drawSorpresaCard, elementOfCardId, giveItemCard, nextElementInstanceId } from './tiles.ts'
import type { GameState, PkmInstance, PlayerState } from './state.ts'

/** Premio del líder (p.50): n cartas de un mazo ({from,count}) o un PKM explícito
 * sin Pokebola. T-049: `from:'sorpresa'` (Giovanni) roba del mazo Sorpresa —
 * ítem a la bolsa, PKM directo como premio (p.50). */
export function applyGymPrize(
  draft: WritableDraft<GameState>,
  content: Content,
  player: WritableDraft<PlayerState>,
  prize: GymPrize,
  events: GameEvent[],
): void {
  if ('card' in prize) {
    givePrizePkm(draft, player, parseCardId(prize.card), events)
    return
  }
  if (prize.from === 'sorpresa') {
    for (let i = 0; i < prize.count; i++) {
      const drawn = drawSorpresaCard(draft, content, player)
      if (!drawn.ok) throw drawn.error
      const draw = drawn.value
      events.push(...draw.events)
      if (draw.kind === 'empty') return // D-10
      if (draw.kind === 'pkm') givePrizePkm(draft, player, parseCardId(draw.card), events)
    }
    return
  }
  const deck: DeckKey = prize.from === 'item' ? 'item' : prize.from
  for (let i = 0; i < prize.count; i++) {
    const top = draft.decks[deck][0]
    if (top === undefined) {
      events.push({ type: 'DeckEmpty', player: player.id, deck }) // D-10
      return
    }
    draft.decks[deck] = draft.decks[deck].slice(1)
    events.push({ type: 'CardDrawn', player: player.id, deck, card: top })
    const element = elementOfCardId(top)
    if (element !== null) {
      player.elements.push({ id: nextElementInstanceId(player, element), element })
      continue
    }
    const raw: string = top // CardId → string: ensanchamiento para poder acotar por literal
    if (deck === 'item') {
      if (!giveItemCard(player, raw)) {
        throw new EngineError('INVALID_CONTENT', `ítem "${raw}" del mazo Ítem no entra en la bolsa`)
      }
    } else {
      givePrizePkm(draft, player, top, events) // PKM robado como premio (p.50)
    }
  }
}

/** Id de instancia único para premios (`p1-gift-N`): máximo existente + 1. */
function nextGiftUid(player: PlayerState): PkmUid {
  const prefix = `${player.id}-gift-`
  let max = 0
  for (const pkm of [...player.team, ...player.oakPile]) {
    if (!pkm.uid.startsWith(prefix)) continue
    const n = Number.parseInt(pkm.uid.slice(prefix.length), 10)
    if (Number.isInteger(n) && n > max) max = n
  }
  return parsePkmUid(`${prefix}${max + 1}`)
}

/** Premio PKM (T-023/AC-3): sano, sin gastar Pokebola; equipo lleno ⇒ pila de Oak. */
function givePrizePkm(
  draft: WritableDraft<GameState>,
  player: WritableDraft<PlayerState>,
  cardId: CardId,
  events: GameEvent[],
): void {
  const pkmUid = nextGiftUid(player)
  const destination: 'team' | 'oakPile' =
    draft.ruleset !== null && player.team.length < draft.ruleset.teamLimit ? 'team' : 'oakPile'
  const catchInto = (pile: WritableDraft<PkmInstance[]>): void => {
    pile.push({ uid: pkmUid, cardId, damage: 0, xp: 0, equipped: [], multicolor: [], fainted: false })
  }
  if (destination === 'team') catchInto(player.team)
  else catchInto(player.oakPile)
  events.push({ type: 'PrizePkmWon', player: player.id, card: cardId, pkmUid, destination })
}
