// Comando de debug (plan probar-encuentro-abra): dominio de DebugEncounter.
// Fuerza el flujo REAL de robar una carta exacta de un mazo — sin atravesar el
// tablero — dejando el mismo estado que `resolveTile` tras robar un PKM
// (tiles.ts): CardDrawn + `FightOrRelease` en `tileResolution` con stepsLeft 0.
// El handler en engine.ts valida la fase; el guard PENDING_DECISION cubre la
// decisión pendiente. Sin azar, sin DOM (ADR-1).
import type { WritableDraft } from 'immer'
import type { CardId, Content, DeckId } from '@liga/content'
import { EngineError } from './errors.ts'
import type { Result } from './errors.ts'
import type { CardDrawn, GameEvent } from './events.ts'
import type { GameState } from './state.ts'

type Draft = WritableDraft<GameState>

function illegal(message: string): Result<never, EngineError> {
  return { ok: false, error: new EngineError('ILLEGAL_COMMAND', message) }
}

/** Saca `card` de `deck` (esté donde esté) y deja el encuentro pendiente. */
export function debugEncounter(
  draft: Draft,
  content: Content,
  command: { readonly deck: DeckId; readonly card: CardId },
): Result<readonly GameEvent[], EngineError> {
  const player = draft.players.find((p) => p.id === draft.activePlayerId)
  if (player === undefined) return illegal('sin jugador activo')
  if (!content.cards.some((card) => card.id === command.card)) {
    return illegal(`la carta "${command.card}" no existe en content/pokemon`)
  }
  const stack = draft.decks[command.deck]
  const at = stack.indexOf(command.card)
  if (at < 0) {
    return illegal(`la carta "${command.card}" no está en el mazo ${command.deck} (¿ya salió?)`)
  }
  draft.decks[command.deck] = stack.filter((_, index) => index !== at)
  draft.pending = { type: 'FightOrRelease', card: command.card, deck: command.deck }
  draft.phase = 'tileResolution'
  draft.stepsLeft = 0
  const drawn: CardDrawn = {
    type: 'CardDrawn',
    player: player.id,
    deck: command.deck,
    card: command.card,
  }
  return { ok: true, value: [drawn] }
}
