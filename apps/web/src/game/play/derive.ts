// Derivaciones puras de PlayScreen (N-0022): sin React, sin efectos.
import type { DiePurpose, GameEvent, PkmInstance, PlayerState } from '@liga/engine'
import type { DrawSpec, BoardTokenSpec, PendingDecision } from '../../board/Board'
import type { drawFromEvents } from '../../board/Board'
import type { DieValue } from '../../board/Die3D'
import type { SpritesManifest } from '../../battle/sprites'
import { spriteUrl } from '../../battle/sprites'
import type { DeckId } from '@liga/content'
import { es } from '../../i18n/es'
import type { DiceRoll } from '../../hud/DicePanel'
import { leaderUid, playerLabel } from '../../hud/model'
import type { EncounterFightOption } from '../../popup/EncounterPopup'
import { cardOf, gameContent, starterTokenCard } from '../content'
import type { GameSession } from '../session'
import { tileEventMessage, type tileTitle, type TilePanelPlayer, type TilePending } from '../TilePanel'

type State = GameSession['state']

export const isTileEvent = (event: GameEvent): boolean => tileEventMessage(event) !== null

export const clampDie = (value: number): DieValue => Math.min(6, Math.max(1, Math.round(value))) as DieValue

/** dado-de-combate/AC-2: enruta tiradas — solo el dado de tablero (move y
 * oportunidad) alimenta panel-dice; los propósitos de combate los reproduce
 * el dado propio del popup de combate (battle-die). */
export const isBoardDiePurpose = (purpose: DiePurpose): boolean =>
  purpose === 'move' || purpose === 'oportunidad'

/** ficha-inicial-fija: spec de ficha por jugador resuelto desde la carta inicial
 * BASE del mazo (session.starterDeck), no desde el equipo: el inicial puede
 * evolucionar (cardId cambia) o dejar de ser team[0] (reorden/intercambio con
 * Oak) y la ficha lo representa igual. Sin carta en el contenido ⇒ null/null
 * (peón de color). */
export const boardTokenSpecs = (
  players: readonly PlayerState[],
  starterDeck: DeckId,
  sprites: SpritesManifest | null,
): readonly BoardTokenSpec[] => {
  const card = starterTokenCard(starterDeck)
  return players.map((p) => ({
    id: p.id,
    nodeId: p.position,
    spriteUrl: card === null ? null : spriteUrl(sprites, card.dex, 'front'),
    modelSpecies: card === null ? null : card.id,
  }))
}

export const pendingDecisionOf = (state: State): PendingDecision =>
  state.pending?.type === 'ChoosePath'
    ? { type: 'ChoosePath', options: state.pending.options }
    : state.pending?.type === 'StopOrContinue'
      ? { type: 'StopOrContinue' }
      : null

/** T-092: tiradas de tablero de un lote de eventos (la numeración sigue `startNonce`). */
export function boardRollsFromEvents(
  events: readonly GameEvent[],
  state: State,
  startNonce: number,
): { readonly rolls: readonly DiceRoll[]; readonly nonce: number; readonly moveHint: DieValue | null } {
  const rolls: DiceRoll[] = []
  let nonce = startNonce
  let moveHint: DieValue | null = null
  for (const event of events) {
    if (event.type !== 'DieRolled') continue
    // dado-de-combate/AC-2: las tiradas de combate las reproduce el popup.
    if (!isBoardDiePurpose(event.purpose)) continue
    nonce += 1
    const rollerIndex = state.players.findIndex((p: PlayerState) => p.id === state.activePlayerId)
    const value = clampDie(event.value)
    rolls.push({
      value,
      purpose: event.purpose,
      playerLabel:
        rollerIndex < 0 ? (state.activePlayerId ?? es.hudDiceIdle) : playerLabel(rollerIndex),
      nonce,
    })
    if (event.purpose === 'move') moveHint = value
  }
  return { rolls, nonce, moveHint }
}

/** T-064/T-090: próximo DrawSpec a partir del último CardDrawn del lote. */
export function nextDrawSpec(
  prev: DrawSpec | null,
  drawn: ReturnType<typeof drawFromEvents>,
  next: State,
): DrawSpec | null {
  if (drawn === null) return null
  const base = { deck: drawn.deck, card: drawn.card, nonce: (prev?.nonce ?? 0) + 1 }
  if (drawn.deck !== 'item' && drawn.deck !== 'sorpresa') return base
  const nodeId = next.players.find((p: PlayerState) => p.id === drawn.player)?.position
  return nodeId === undefined ? base : { ...base, nodeId }
}

export const deckCountsOf = (state: State): Readonly<Record<string, number>> =>
  Object.fromEntries(Object.entries(state.decks).map(([deck, stack]) => [deck, stack.length]))

export function tilePlayerOf(player: PlayerState | undefined, state: State): TilePanelPlayer | null {
  if (player === undefined) return null
  return {
    healthy: player.team
      .filter((pkm: PkmInstance) => !pkm.fainted)
      .map((pkm: PkmInstance) => ({ uid: pkm.uid, name: cardOf(pkm.cardId)?.name ?? String(pkm.cardId) })),
    swapPairs:
      state.pending?.type === 'OakSwap'
        ? player.team.flatMap((teamPkm: PkmInstance) =>
            player.oakPile.map((pilePkm: PkmInstance) => ({
              teamUid: teamPkm.uid,
              pileUid: pilePkm.uid,
              teamName: cardOf(teamPkm.cardId)?.name ?? String(teamPkm.cardId),
              pileName: cardOf(pilePkm.cardId)?.name ?? String(pilePkm.cardId),
            })),
          )
        : [],
  }
}

export function tilePendingOf(state: State, isEncounter: boolean): TilePending {
  return isEncounter
    ? null
    : state.pending?.type === 'ChallengeGym' || state.pending?.type === 'OakSwap'
      ? { type: state.pending.type }
      : null
}

/** unificar-popup-encuentro/AC-4: PKM sanos (activo primero) con HP actual/máx. */
export function encounterOptionsOf(
  player: PlayerState | undefined,
  state: State,
  isEncounter: boolean,
): readonly EncounterFightOption[] {
  if (!isEncounter || player === undefined) return []
  const leader = leaderUid(player, state.battle)
  const healthy = player.team
    .filter((pkm: PkmInstance) => !pkm.fainted)
    .map((pkm: PkmInstance) => {
      const card = cardOf(pkm.cardId)
      return {
        uid: pkm.uid,
        name: card?.name ?? String(pkm.cardId),
        hpCur: Math.max(0, (card?.hp ?? 0) - pkm.damage),
        hpMax: card?.hp ?? 0,
        active: pkm.uid === leader,
      }
    })
  return [...healthy.filter((option) => option.active), ...healthy.filter((option) => !option.active)]
}

export const gymLeaderOf = (node: Parameters<typeof tileTitle>[0]): string | null =>
  node !== undefined && node.type === 'gym' && node.gym !== undefined
    ? (gameContent.gyms.find((leader) => leader.id === node.gym)?.name ?? null)
    : null

export const oakNamesOf = (viewed: PlayerState | undefined): readonly { readonly uid: string; readonly name: string }[] =>
  (viewed?.oakPile ?? []).map((pkm) => ({ uid: pkm.uid, name: cardOf(pkm.cardId)?.name ?? String(pkm.cardId) }))

export const tileMessagesOf = (events: readonly GameEvent[]): string[] =>
  events.map((event) => tileEventMessage(event)).filter((message): message is string => message !== null)
