// Panel de casillero (T-061/AC-3): título según el nodo, un mensaje por evento
// y botones según la decisión pendiente. Presentacional: la UI solo muestra
// eventos/pending y envía comandos (SPEC-G/T-061).
import type { BoardNode, DeckKey } from '@liga/content'
import { elementOfCardId, type Command, type GameEvent } from '@liga/engine'
import { es } from '../i18n/es'
import { cardOf } from './content'
import styles from './game.module.css'

/** Nombre de una carta robada: elemento/ítem por nombre, PKM por carta. */
export function cardLabel(card: string): string {
  const element = elementOfCardId(card)
  if (element !== null) {
    return es.tileEnergyCard.replace('{element}', es.elementNames[element])
  }
  if (card in es.tileItemNames) {
    return es.tileItemNames[card as keyof typeof es.tileItemNames]
  }
  return cardOf(card)?.name ?? card
}

/** Mensaje de un evento de casillero (null si no aporta nada al panel). */
export function tileEventMessage(event: GameEvent): string | null {
  // Cadena de if (no switch): los eventos de batalla/movimiento no tienen
  // mensaje acá y no vale enumerarlos todos.
  if (event.type === 'CardDrawn') {
    return es.tileMsgCardDrawn
      .replace('{card}', cardLabel(event.card))
      .replace('{deck}', es.tileDeckNames[event.deck as DeckKey])
  }
  if (event.type === 'EnergyGained') {
    return es.tileMsgEnergyGained.replace('{element}', es.elementNames[event.element])
  }
  if (event.type === 'PartyHealed') {
    return es.tileMsgPartyHealed.replace('{count}', String(event.count))
  }
  if (event.type === 'TileResolved') {
    if (event.info === 'none') return es.tileMsgNone
    if (event.info === 'oak') return es.tileMsgOak
    return es.tileMsgDisabled
  }
  if (event.type === 'DeckEmpty') {
    return es.tileMsgDeckEmpty.replace('{deck}', es.tileDeckNames[event.deck as DeckKey])
  }
  if (event.type === 'GymLocked') {
    return es.battleMsgGymLocked.replace('{n}', String(event.requiresMedals))
  }
  if (event.type === 'GymAlreadyWon') return es.tileMsgGymAlreadyWon
  if (event.type === 'CardToBottom') {
    return es.tileMsgCardToBottom
      .replace('{card}', cardLabel(event.card))
      .replace('{deck}', es.tileDeckNames[event.deck as DeckKey])
  }
  if (event.type === 'OakSwapped') return es.tileMsgOakSwapped
  return null
}

/** Título del panel: nombre del mazo para deck, líder para gym, tipo para el resto. */
export function tileTitle(node: BoardNode | undefined, gymLeader: string | null): string {
  if (node === undefined) return es.appTitle
  if (node.type === 'deck' && node.deck !== undefined) {
    return `${es.tileNames.deck} ${es.tileDeckNames[node.deck]}`
  }
  if (node.type === 'gym') {
    return gymLeader === null ? es.tileNames.gym : es.tileTitleGymPending.replace('{leader}', gymLeader)
  }
  if (node.type === 'oak') return es.tileNames.oak
  return es.tileNames[node.type]
}

export interface TilePanelPlayer {
  /** PKM sanos del equipo (uid + nombre de carta). */
  readonly healthy: readonly { readonly uid: string; readonly name: string }[]
  /** Pares equipo × pila para el intercambio de Oak. */
  readonly swapPairs: readonly {
    readonly teamUid: string
    readonly pileUid: string
    readonly teamName: string
    readonly pileName: string
  }[]
}

export type TilePending =
  | { readonly type: 'ChallengeGym' }
  | { readonly type: 'OakSwap' }
  | null

export interface TilePanelProps {
  readonly title: string
  readonly messages: readonly string[]
  readonly pending: TilePending
  readonly player: TilePanelPlayer | null
  readonly onCommand: (command: Command) => void
  /** cerrar-popup-mensajes: descarta los mensajes (el pending no se cierra). */
  readonly onClose: () => void
}

export function TilePanel({ title, messages, pending, player, onCommand, onClose }: TilePanelProps) {
  // captura-en-popup-combate/AC-2 (D-31 revertido): CaptureOrRelease ya no
  // vive acá — la decisión se toma en el pie del popup de combate.
  const panelTitle = title
  // cerrar-popup-mensajes: Cerrar solo con mensajes (nada que descartar sin ellos).
  const showClose = messages.length > 0
  const buttons: {
    readonly key: string
    readonly testid: string
    readonly command: Command
    readonly label: string
  }[] = []
  if (pending?.type === 'ChallengeGym') {
    for (const pkm of player?.healthy ?? []) {
      buttons.push({
        key: `challenge-${pkm.uid}`,
        testid: 'btn-challenge',
        command: { type: 'AcceptGymChallenge', pkmUid: pkm.uid },
        label: es.tileChallengeWith.replace('{name}', pkm.name),
      })
    }
  }
  if (pending?.type === 'ChallengeGym' || pending?.type === 'OakSwap') {
    buttons.push({ key: 'skip', testid: 'btn-skip', command: { type: 'Advance' }, label: es.tileSkip })
  }
  if (pending?.type === 'OakSwap') {
    for (const pair of player?.swapPairs ?? []) {
      buttons.push({
        key: `swap-${pair.teamUid}-${pair.pileUid}`,
        testid: 'btn-oak-swap',
        command: { type: 'SwapWithOak', teamUid: pair.teamUid, pileUid: pair.pileUid },
        label: es.tileSwapPair.replace('{team}', pair.teamName).replace('{pile}', pair.pileName),
      })
    }
  }
  return (
    <div className={styles.panel} data-testid="tile-panel" role="status">
      <h3 className={styles.panelTitle}>{panelTitle}</h3>
      {messages.map((message, index) => (
        <p key={`${index}-${message}`} className={styles.note}>
          {message}
        </p>
      ))}
      {buttons.length === 0 && !showClose ? null : (
        <div className={styles.actions}>
          {buttons.map((button) => (
            <button
              key={button.key}
              type="button"
              data-testid={button.testid}
              data-command={button.command.type}
              onClick={() => onCommand(button.command)}
            >
              {button.label}
            </button>
          ))}
          {showClose ? (
            <button type="button" data-testid="btn-tile-close" onClick={onClose}>
              {es.shellTipClose}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
