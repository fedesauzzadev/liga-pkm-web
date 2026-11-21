// Ítems con flujo propio (SPEC-F/T-049): carta Oportunidad (D-21). La Super
// Poción y las bolas viven en battle-commands.ts (se usan en combate); poción y
// pokebola ya estaban (T-012/T-022). Puro, sin DOM (ADR-1).
import type { WritableDraft } from 'immer'
import { parseCardId, type Face } from '@liga/content'
import { activePlayer, illegal, rollDie } from './battle-core.ts'
import type { Ctx } from './engine.ts'
import type { Result } from './errors.ts'
import { EngineError } from './errors.ts'
import type { GameEvent } from './events.ts'
import { drawSorpresaCard, pushToBottom } from './tiles.ts'
import type { GameState } from './state.ts'

type Draft = WritableDraft<GameState>

/**
 * `UseOportunidad` (AC-3, D-21): solo en `organize` y sin decisión pendiente.
 * Exige una carta en la bolsa y ≥ `ruleset.oportunidad.minMedals` medallas (sin
 * ellas el comando se rechaza con mensaje para que la UI lo explique). La carta
 * se consume y vuelve al FONDO del mazo Ítem; con 4-5-6 (caras del ruleset)
 * roba la cima del mazo Sorpresa: ítem ⇒ inventario, PKM ⇒ encuentro.
 */
export function useOportunidad(
  draft: Draft,
  ctx: Ctx,
): Result<readonly GameEvent[], EngineError> {
  if (draft.phase !== 'organize') return illegal('la carta Oportunidad se usa en la fase Organize (D-21)')
  if (draft.pending !== null) return illegal('hay una decisión pendiente')
  const playerResult = activePlayer(draft)
  if (!playerResult.ok) return playerResult
  const player = playerResult.value
  if (player.items.oportunidad <= 0) return illegal('no queda ninguna carta Oportunidad')
  const ruleset = draft.ruleset
  if (ruleset === null) return illegal('no hay partida iniciada (falta ruleset)')
  const min = ruleset.oportunidad.minMedals
  if (player.medals.length < min) {
    return illegal(
      `Oportunidad requiere ${min} medallas y tenés ${player.medals.length} (RULES D-21)`,
    )
  }
  // La carta se consume (fallar la tirada también la gasta) y va al fondo de SU mazo.
  player.items = { ...player.items, oportunidad: player.items.oportunidad - 1 }
  draft.decks.item = pushToBottom(draft.decks.item, parseCardId('oportunidad'))
  const events: GameEvent[] = [
    { type: 'CardToBottom', player: player.id, deck: 'item', card: 'oportunidad' },
  ]
  const value = rollDie(draft, ctx, 'oportunidad', events)
  if (!ruleset.oportunidad.faces.includes(value as Face)) {
    return { ok: true, value: events } // 1-3: no roba nada (p.93)
  }
  const drawn = drawSorpresaCard(draft, ctx.content, player)
  if (!drawn.ok) return drawn
  const draw = drawn.value
  events.push(...draw.events)
  if (draw.kind === 'pkm') {
    // PKM ⇒ encuentro; la resolución espera en tileResolution (invariante casillero/encuentro).
    draft.pending = { type: 'FightOrRelease', card: draw.card, deck: 'sorpresa' }
    draft.phase = 'tileResolution'
  }
  return { ok: true, value: events }
}
