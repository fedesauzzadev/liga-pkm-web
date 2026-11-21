// eventToLog (SPEC-I/T-072/AC-2): función pura que traduce un evento del motor
// al texto del historial. El spec la pide "en i18n/es.ts", pero ese archivo ya
// supera el límite de 400 líneas (deuda registrada): los textos viven en es.ts y
// la función acá, recibiendo TODO por parámetro (textos + resolvedores de
// nombres) para que el test de AC-4 sea un snapshot puro.
import type { DeckKey, Element } from '@liga/content'
import { elementOfCardId, type GameEvent, type GameState } from '@liga/engine'
import { es } from './es'

export type LogTexts = typeof es

/** Resolvedores de nombres que la función no puede derivar del estado solo. */
export interface EventLogI18n {
  readonly texts: LogTexts
  /** Nombre visible de una carta (PKM, energía o ítem) por id de carta. */
  readonly cardName: (cardId: string) => string
  /** Etiqueta del nodo del tablero ("Ciudad Plateada"). */
  readonly nodeName: (nodeId: string) => string
  /** Nombre del ataque `attackId` dentro de la carta `cardId`. */
  readonly attackName: (cardId: string, attackId: string) => string
}

const deckName = (i18n: EventLogI18n, deck: DeckKey): string =>
  i18n.texts.tileDeckNames[deck as keyof typeof i18n.texts.tileDeckNames] ?? deck

const itemName = (i18n: EventLogI18n, card: string): string | null =>
  card in i18n.texts.tileItemNames
    ? i18n.texts.tileItemNames[card as keyof typeof i18n.texts.tileItemNames]
    : null

const elementName = (i18n: EventLogI18n, element: Element | string): string =>
  i18n.texts.elementNames[element as keyof typeof i18n.texts.elementNames] ?? element

/** Nombre visible del PKM con uid (equipo, pila de Oak o rival de la batalla). */
function pkmName(state: GameState, i18n: EventLogI18n, uid: string): string {
  for (const player of state.players) {
    const own = [...player.team, ...player.oakPile].find((pkm) => pkm.uid === uid)
    if (own !== undefined) return i18n.cardName(own.cardId)
  }
  const rival = state.battle?.rival.find((pkm) => pkm.uid === uid)
  return rival === undefined ? uid : i18n.cardName(rival.cardId)
}

/** Carta del PKM con uid (para resolver el nombre del ataque usado). */
function cardIdOf(state: GameState, uid: string): string | null {
  for (const player of state.players) {
    const own = [...player.team, ...player.oakPile].find((pkm) => pkm.uid === uid)
    if (own !== undefined) return own.cardId
  }
  const rival = state.battle?.rival.find((pkm) => pkm.uid === uid)
  return rival === undefined ? null : rival.cardId
}

function playerName(state: GameState, i18n: EventLogI18n, playerId: string): string {
  const index = state.players.findIndex((player) => player.id === playerId)
  return index < 0 ? playerId : i18n.texts.hudPlayerName.replace('{n}', String(index + 1))
}

/**
 * Mensaje del historial para un evento (AC-2): un mensaje por evento del mínimo
 * del spec; `null` para el ruido interno (pasos intermedios, dados de efecto,
 * efectos sin soporte).
 */
export function eventToLog(event: GameEvent, state: GameState, i18n: EventLogI18n): string | null {
  const t = i18n.texts
  switch (event.type) {
    case 'DieRolled':
      return event.purpose === 'move' ? t.historyDie.replace('{n}', String(event.value)) : null
    case 'TurnAdvanced':
      return t.historyTurn.replace('{n}', String(event.turn))
    case 'GameStarted':
      return t.historyGameStarted
        .replace('{name}', playerName(state, i18n, event.player))
        .replace('{starter}', i18n.cardName(event.starter))
    case 'MoveStep':
      return null
    case 'Landed':
      return t.historyMoved.replace('{node}', i18n.nodeName(event.node))
    case 'CardDrawn':
      return t.historyCardDrawn
        .replace('{deck}', deckName(i18n, event.deck))
        .replace('{card}', i18n.cardName(event.card))
    case 'DeckEmpty':
      return t.historyDeckEmpty.replace('{deck}', deckName(i18n, event.deck))
    case 'EnergyGained':
      return t.historyEnergy.replace('{element}', elementName(i18n, event.element))
    case 'TileResolved':
      if (event.info === 'none') return t.tileMsgNone
      if (event.info === 'oak') return t.tileMsgOak
      return t.tileMsgDisabled
    case 'PartyHealed':
      return t.historyPartyHealed.replace('{count}', String(event.count))
    case 'CardToBottom': {
      const item = itemName(i18n, event.card)
      const deck = deckName(i18n, event.deck)
      // unificar-popup-encuentro/AC-6: una carta PKM que vuelve al fondo es un
      // PKM soltado (encuentro o captura liberada); ítems/energías mantienen
      // el texto genérico de "volvió al fondo del mazo".
      if (item !== null) {
        return t.historyItemUsed.replace('{item}', item).replace('{deck}', deck)
      }
      if (elementOfCardId(event.card) !== null) {
        return t.historyToBottom.replace('{card}', i18n.cardName(event.card)).replace('{deck}', deck)
      }
      return t.historyReleasedWild.replace('{name}', i18n.cardName(event.card))
    }
    case 'OakSwapped':
      return t.historyOakSwapped
    case 'ElementEquipped':
      return t.historyEquip
        .replace('{element}', elementName(i18n, elementOfCardId(event.elementId) ?? event.elementId))
        .replace('{name}', pkmName(state, i18n, event.pkmUid))
    case 'ElementUnequipped':
      return t.historyUnequip
        .replace('{element}', elementName(i18n, elementOfCardId(event.elementId) ?? event.elementId))
        .replace('{name}', pkmName(state, i18n, event.pkmUid))
    case 'MulticolorAssigned':
      return t.historyMulticolor
        .replace('{element}', elementName(i18n, event.element))
        .replace('{name}', pkmName(state, i18n, event.pkmUid))
    case 'MulticolorUnassigned':
      return t.historyMulticolorUnassigned.replace('{name}', pkmName(state, i18n, event.pkmUid))
    case 'TeamReordered':
      return t.historyTeamReordered
    case 'BattleStarted':
      return (event.kind === 'wild' ? t.historyBattleWild : t.historyBattleGym).replace(
        '{name}',
        i18n.cardName(event.rival),
      )
    case 'AttackUsed': {
      const cardId = cardIdOf(state, event.attacker)
      const attack = cardId === null ? event.attackId : i18n.attackName(cardId, event.attackId)
      return t.historyAttack
        .replace('{name}', pkmName(state, i18n, event.attacker))
        .replace('{attack}', attack)
    }
    case 'NoAttack': {
      const name = pkmName(state, i18n, event.attacker)
      if (event.reason === 'asleep') return t.historyNoAttackAsleep.replace('{name}', name)
      if (event.reason === 'skip') return t.historyNoAttackSkip.replace('{name}', name)
      if (event.reason === 'gate') {
        // AC-3: el gate fallido explica la tirada cuando trae causa y cara.
        if (event.value !== undefined) {
          const template = event.cause === 'defended' ? t.historyNoAttackGateDefended : t.historyNoAttackGateParalized
          return template.replace('{name}', name).replace('{n}', String(event.value))
        }
        return t.historyNoAttackGate.replace('{name}', name)
      }
      return t.historyNoAttackSelect.replace('{name}', name)
    }
    case 'AttackDodged':
      return t.historyDodged.replace('{name}', pkmName(state, i18n, event.defender))
    case 'TrainerAppeared':
      // ER-001: la aparición del líder la cuenta la coreografía, no el historial.
      return null
    case 'UnsupportedEffect':
      return null
    case 'DamageTaken':
      // rediseno-combate-max/AC-3: sin "recibió 0 de daño" en el historial.
      if (event.amount <= 0) return null
      return t.historyDamage
        .replace('{name}', pkmName(state, i18n, event.pkmUid))
        .replace('{amount}', String(event.amount))
    case 'Healed': {
      const name = pkmName(state, i18n, event.pkmUid)
      const amount = String(event.amount)
      return event.cause === 'potion'
        ? t.historyHealedPotion.replace('{name}', name).replace('{amount}', amount)
        : t.historyHealed.replace('{name}', name).replace('{amount}', amount)
    }
    case 'WokeUp':
      return t.historyWokeUp.replace('{name}', pkmName(state, i18n, event.pkmUid))
    case 'ConditionApplied': {
      const name = pkmName(state, i18n, event.pkmUid)
      const faces = event.faces?.join('-') ?? ''
      const template =
        event.condition === 'asleep' ? t.historyAsleep
        : event.condition === 'poison' ? t.historyPoison
        : event.condition === 'confused' ? t.historyConfused
        : event.condition === 'noAttackGate' ? t.historyNoAttackGateApplied
        : event.condition === 'skip' ? t.historySkipCondition
        : event.condition === 'drain' ? t.historyDrainCondition
        : event.condition === 'shield' ? t.historyShieldCondition
        : event.condition === 'selfBoost' ? t.historySelfBoostCondition
        : event.condition === 'weakened' ? t.historyWeakenedCondition
        : t.historyDodgeCondition
      return template.replace('{name}', name).replace('{faces}', faces)
    }
    case 'SelfHit':
      return t.historySelfHit
        .replace('{name}', pkmName(state, i18n, event.attacker))
        .replace('{n}', String(event.value))
    case 'ConditionCleared': {
      const name = pkmName(state, i18n, event.pkmUid)
      const template =
        event.condition === 'confused' ? t.historyClearedConfused
        : event.condition === 'noAttackGate' ? t.historyClearedNoAttackGate
        : event.condition === 'skip' ? t.historyClearedSkip
        : event.condition === 'weakened' ? t.historyClearedWeakened
        : t.historyCleared
      return template.replace('{name}', name)
    }
    case 'PokemonFainted':
      return t.historyFainted.replace('{name}', pkmName(state, i18n, event.pkmUid))
    case 'PkmRetired':
      return t.historyRetired.replace('{name}', pkmName(state, i18n, event.from))
    case 'PkmSentOut':
      return t.historySentOut.replace('{name}', pkmName(state, i18n, event.pkmUid))
    case 'BattleEnded':
      return event.result === 'won' ? t.historyBattleWon : t.historyBattleLost
    case 'XpGained':
      return t.historyXp
        .replace('{name}', pkmName(state, i18n, event.pkmUid))
        .replace('{amount}', String(event.amount))
    case 'PkmEvolved':
      return t.historyEvolved
        .replace('{name}', pkmName(state, i18n, event.pkmUid))
        .replace('{to}', i18n.cardName(event.to))
    case 'PokemonCaptured':
      return t.historyCaptured.replace('{name}', i18n.cardName(event.card))
    case 'GymLocked':
      return t.historyGymLocked.replace('{n}', String(event.requiresMedals))
    case 'GymAlreadyWon':
      return t.historyGymAlreadyWon
    case 'RivalSentOut':
      return t.historyRivalSentOut.replace('{name}', pkmName(state, i18n, event.pkmUid))
    case 'MedalWon':
      return t.historyMedal.replace('{medal}', event.medal)
    case 'PrizePkmWon':
      return t.historyPrize.replace('{name}', i18n.cardName(event.card))
    case 'GameWon':
      return t.historyGameWon
    default:
      return null
  }
}
