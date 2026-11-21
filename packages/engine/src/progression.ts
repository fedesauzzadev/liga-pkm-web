// Progresión (SPEC-C/T-022): captura, liberación y evolución. Funciones de
// dominio que mutan un draft immer; los handlers de engine.ts validan fase y
// despachan. Reglas: RULES §3 (etapa/evolución p.25-26), §4 (captura p.38-42,
// experiencia p.47-49) y D-04..D-09, D-12. Sin azar, sin DOM (ADR-1).
import type { WritableDraft } from 'immer'
import type { CardId, Content, DeckKey, PkmUid, PokemonCard } from '@liga/content'
import { DECK_IDS, parseCardId, parsePkmUid } from '@liga/content'
import { activePlayer, cardOf, illegal, teamPkmOf } from './battle-core.ts'
import type { Result } from './errors.ts'
import { EngineError } from './errors.ts'
import type { GameEvent } from './events.ts'
import type { Decision, GameState, PlayerState, PkmInstance } from './state.ts'
import { pushToBottom } from './tiles.ts'

type Draft = WritableDraft<GameState>
type PlayerDraft = WritableDraft<PlayerState>
type PkmDraft = WritableDraft<PkmInstance>
type CapturePending = Extract<Decision, { readonly type: 'CaptureOrRelease' }>

interface CaptureCtx {
  readonly player: PlayerDraft
  readonly pending: CapturePending
}

/** Saca el pending CaptureOrRelease validado (compartido por Capture y Release). */
function capturePending(draft: Draft): Result<CaptureCtx, EngineError> {
  const pending = draft.pending
  if (pending?.type !== 'CaptureOrRelease' || draft.phase !== 'tileResolution') {
    return illegal('no hay captura pendiente')
  }
  const player = activePlayer(draft)
  if (!player.ok) return player
  return { ok: true, value: { player: player.value, pending } }
}

/** Cierra la resolución del casillero tras capturar/liberar (como ReleaseWild). */
function endTileTurn(draft: Draft): void {
  draft.pending = null
  draft.turn += 1
  draft.phase = 'organize'
}

/** Id de instancia único para capturas (`p1-catch-N`): máximo existente + 1.
 * T-049: también lo usa ThrowBall (captura con Ultra/Master Ball). */
export function nextCaptureUid(player: PlayerState): PkmUid {
  const prefix = `${player.id}-catch-`
  let max = 0
  for (const pkm of [...player.team, ...player.oakPile]) {
    if (!pkm.uid.startsWith(prefix)) continue
    const n = Number.parseInt(pkm.uid.slice(prefix.length), 10)
    if (Number.isInteger(n) && n > max) max = n
  }
  return parsePkmUid(`${prefix}${max + 1}`)
}

/** Mazos que pueden servir PKM salvajes (registrar-captura/AC-1). */
const WILD_DECKS: readonly DeckKey[] = [...DECK_IDS, 'sorpresa']

/**
 * registrar-captura (AC-1/AC-2): capturar REGISTRA la carta — ninguna copia
 * queda en los mazos de robo salvajes, así no vuelve a salir (ni por casillero
 * ni por el botón dev). Solo la captura registra (AC-3): Release y la derrota
 * devuelven la carta al fondo de su mazo.
 */
export function removeWildCopies(draft: Draft, cardId: CardId): void {
  for (const deck of WILD_DECKS) {
    const stack = draft.decks[deck]
    if (stack.includes(cardId)) {
      draft.decks[deck] = stack.filter((card) => card !== cardId)
    }
  }
}

/**
 * `Capture` (AC-3/AC-4): gasta 1 Pokebola (Ultra/Maestra equivalente, D-12) que
 * vuelve al FONDO del mazo Ítem; la carta derrotada se queda (AC-5) como PKM
 * sano en el equipo o, si está completo (`ruleset.teamLimit`), en la pila de Oak.
 */
export function captureWild(draft: Draft, content: Content): Result<readonly GameEvent[], EngineError> {
  const ctxResult = capturePending(draft)
  if (!ctxResult.ok) return ctxResult
  const { player, pending } = ctxResult.value
  if (player.items.pokeball <= 0) return illegal('capturar requiere una Pokebola (RULES §4 p.38)')
  const card = cardOf(content, pending.card)
  if (!card.ok) return card
  const ruleset = draft.ruleset
  if (ruleset === null) return illegal('no hay partida iniciada (falta ruleset)')
  player.items = { ...player.items, pokeball: player.items.pokeball - 1 }
  draft.decks.item = pushToBottom(draft.decks.item, parseCardId('pokeball'))
  removeWildCopies(draft, parseCardId(pending.card))
  const pkmUid = nextCaptureUid(player)
  const destination: 'team' | 'oakPile' = player.team.length < ruleset.teamLimit ? 'team' : 'oakPile'
  const catchInto = (pile: WritableDraft<PkmInstance[]>): void => {
    pile.push({ uid: pkmUid, cardId: parseCardId(pending.card), damage: 0, xp: 0, equipped: [], multicolor: [], fainted: false })
  }
  if (destination === 'team') catchInto(player.team)
  else catchInto(player.oakPile)
  endTileTurn(draft)
  return {
    ok: true,
    value: [
      { type: 'PokemonCaptured', player: player.id, card: pending.card, pkmUid, destination },
      { type: 'CardToBottom', player: player.id, deck: 'item', card: 'pokeball' },
    ],
  }
}

/** `Release` (AC-5, D-09): la carta derrotada vuelve al FONDO de su mazo. */
export function releaseCaptured(draft: Draft): Result<readonly GameEvent[], EngineError> {
  const ctxResult = capturePending(draft)
  if (!ctxResult.ok) return ctxResult
  const { player, pending } = ctxResult.value
  draft.decks[pending.deck] = pushToBottom(draft.decks[pending.deck], parseCardId(pending.card))
  endTileTurn(draft)
  return {
    ok: true,
    value: [{ type: 'CardToBottom', player: player.id, deck: pending.deck, card: pending.card }],
  }
}

/**
 * `Evolve` (AC-2): solo con el XP requerido por la entrada `evolvesTo`; reemplaza
 * la carta, XP=0 (D-04) y conserva el daño acotado al HP nuevo (D-05). Legal en
 * `organize` y en `tileResolution` sin decisión pendiente (D-06).
 */
export function evolvePkm(
  draft: Draft,
  content: Content,
  command: { readonly pkmUid: string; readonly toId: string },
): Result<readonly GameEvent[], EngineError> {
  if (draft.phase !== 'organize' && draft.phase !== 'tileResolution') {
    return illegal('se evoluciona en Organize o al terminar un combate ganado (D-06)')
  }
  if (draft.pending !== null) return illegal('hay una decisión pendiente')
  const playerResult = activePlayer(draft)
  if (!playerResult.ok) return playerResult
  const pkmResult = teamPkmOf(playerResult.value, command.pkmUid)
  if (!pkmResult.ok) return pkmResult
  const pkm: PkmDraft = pkmResult.value
  const from: PokemonCard | undefined = content.cards.find((card) => card.id === pkm.cardId)
  const option = from?.evolvesTo.find((entry) => entry.id === command.toId)
  if (from === undefined || option === undefined) {
    return illegal(`"${pkm.cardId}" no evoluciona a "${command.toId}"`)
  }
  if (pkm.xp < option.xp) {
    return illegal(`evolucionar a "${option.id}" requiere ${option.xp} XP (tiene ${pkm.xp})`)
  }
  const to = cardOf(content, option.id)
  if (!to.ok) return to
  const fromId: CardId = pkm.cardId
  const damage = Math.min(pkm.damage, to.value.hp)
  pkm.cardId = parseCardId(option.id)
  pkm.xp = 0
  pkm.damage = damage
  pkm.fainted = pkm.fainted || damage >= to.value.hp
  return {
    ok: true,
    value: [{ type: 'PkmEvolved', player: playerResult.value.id, pkmUid: pkm.uid, from: fromId, to: option.id }],
  }
}
