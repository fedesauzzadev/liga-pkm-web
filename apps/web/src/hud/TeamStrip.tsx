// panel-team (SPEC-I/T-074/AC-1): 6 mini-cartas del equipo. Sprite, nombre,
// barra de HP, fichas de energía (hasta 6 + "+n") y estados (activo, debilitado
// en gris, dormido, envenenado). Slot vacío punteado. Clic = ficha de la carta
// (CardDetail, T-033); reordenar arrastrando solo en Organize (ReorderTeam).
// T-073: slots son destino de drop de la mochila (data-drop-target) y las
// fichas equipadas se arrastran de vuelta (Unequip, AC-5).
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { BattleState, PlayerState, PokemonCard } from '@liga/engine'
import { es } from '../i18n/es'
import { ElementIcon } from '../battle/icons'
import { spriteUrl, type SpritesManifest } from '../battle/sprites'
import { carryOf, useCarried, type CarriedItem } from './carry'
import type { DragPayload, DropTarget } from './backpack'
import { energyChips, hpOf, leaderUid, slotConditions } from './model'
import styles from './hud.module.css'

export interface TeamStripProps {
  readonly player: PlayerState
  readonly cardOf: (cardId: string) => PokemonCard | undefined
  readonly sprites: SpritesManifest | null
  readonly battle: BattleState | null
  /** Cantidad de slots (layout.json › panels.team.slots). */
  readonly slots: number
  /** Solo en Organize y para el jugador propio (AC-1). */
  readonly reorderable: boolean
  /** T-073: las fichas equipadas se pueden arrastrar a la mochila (AC-5). */
  readonly chipDraggable?: boolean
  /** T-073: legalidad de un drop de la mochila sobre cada slot (AC-1). */
  readonly resolveCarry?: (payload: DragPayload, target: DropTarget) => boolean
  /** T-073: carried fijo desde afuera (SSR proxy); sin él vive en el store. */
  readonly carryOverride?: CarriedItem | null
  /** Clic en un slot: abre la ficha de la carta (CardDetail). */
  readonly onSelect: (uid: string) => void
  readonly onReorder: (uid: string, to: number) => void
}

export function TeamStrip({
  player,
  cardOf,
  sprites,
  battle,
  slots,
  reorderable,
  chipDraggable = false,
  resolveCarry,
  carryOverride,
  onSelect,
  onReorder,
}: TeamStripProps) {
  const activeUid = leaderUid(player, battle)
  const carried = useCarried(carryOverride)
  const emptySlots = Math.max(0, slots - player.team.length)

  const onDragStart = (event: DragEvent<HTMLLIElement>, uid: string): void => {
    // T-073: si hay un carry por pointer events activo (p. ej. la ficha de
    // energía que vuelve a la mochila), no arranca el drag nativo de reorden.
    if (carryOf().carried?.mode === 'drag') {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData('text/plain', uid)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = (event: DragEvent<HTMLLIElement>, to: number): void => {
    event.preventDefault()
    const uid = event.dataTransfer.getData('text/plain')
    if (uid.length > 0) onReorder(uid, to)
  }

  const onChipPointerDown = (event: ReactPointerEvent<HTMLSpanElement>, payload: DragPayload): void => {
    if (event.button !== 0) return
    carryOf().startDrag(payload, event.clientX, event.clientY)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  return (
    <ul className={styles.strip} data-team-strip="true" data-reorderable={reorderable ? 'true' : 'false'}>
      {player.team.map((pkm, index) => {
        const card = cardOf(pkm.cardId)
        const url = card === undefined ? null : spriteUrl(sprites, card.dex, 'front')
        const hp = hpOf(card === undefined ? null : card.hp, pkm)
        const chips = energyChips(pkm.equipped)
        const conditions = slotConditions(battle, pkm.uid)
        const isActive = pkm.uid === activeUid
        const dropState =
          carried !== null && resolveCarry !== undefined
            ? resolveCarry(carried.payload, { kind: 'pkm', uid: pkm.uid })
              ? 'valid'
              : 'invalid'
            : undefined
        return (
          <li
            key={pkm.uid}
            className={`${styles.slot} ${pkm.fainted ? styles.slotFainted : ''} ${isActive ? styles.slotActive : ''}`}
            data-testid="team-slot"
            data-uid={pkm.uid}
            data-index={index}
            data-active={isActive ? 'true' : 'false'}
            data-fainted={pkm.fainted ? 'true' : 'false'}
            data-asleep={conditions.asleep ? 'true' : 'false'}
            data-poisoned={conditions.poisoned ? 'true' : 'false'}
            data-energy-count={pkm.equipped.length}
            data-drop-target="pkm"
            data-drop-state={dropState}
            draggable={reorderable}
            data-draggable={reorderable ? 'true' : 'false'}
            onDragStart={reorderable ? (event) => onDragStart(event, pkm.uid) : undefined}
            onDragOver={reorderable ? (event) => event.preventDefault() : undefined}
            onDrop={reorderable ? (event) => onDrop(event, index) : undefined}
          >
            <button
              type="button"
              className={styles.slotButton}
              data-testid="team-slot-open"
              onClick={() => onSelect(pkm.uid)}
            >
              {url === null ? (
                card === undefined ? (
                  <span className={styles.spriteFallback} aria-hidden="true">?</span>
                ) : (
                  <span className={styles.spriteFallback}>
                    <ElementIcon element={card.element} />
                  </span>
                )
              ) : (
                <img
                  className={styles.sprite}
                  src={url}
                  alt=""
                  data-sprite={card === undefined ? undefined : card.dex}
                />
              )}
              <span className={styles.slotName} data-testid="slot-name">{card?.name ?? es.teamNoCard}</span>
              <span className={styles.hpBar} data-hp-ratio={hp.ratio.toFixed(2)} data-hp={`${hp.current}/${hp.max}`}>
                <span className={styles.hpFill} style={{ width: `${Math.round(hp.ratio * 100)}%` }} />
              </span>
              <span className={styles.chips}>
                {pkm.equipped.slice(0, 6).map((equippedCard) => (
                  <span
                    key={equippedCard.id}
                    className={chipDraggable ? styles.chipDraggable : undefined}
                    data-testid="equip-chip"
                    data-element-id={equippedCard.id}
                    data-draggable={chipDraggable ? 'true' : 'false'}
                    onPointerDown={
                      chipDraggable
                        ? (event) =>
                            onChipPointerDown(event, {
                              kind: 'unequip',
                              pkmUid: pkm.uid,
                              elementId: equippedCard.id,
                              element: equippedCard.element,
                            })
                        : undefined
                    }
                  >
                    <ElementIcon element={equippedCard.element} small />
                  </span>
                ))}
                {chips.extra > 0 ? <span className={styles.chipExtra}>+{chips.extra}</span> : null}
              </span>
              <span className={styles.badges}>
                {isActive ? <span className={styles.badge}>{es.hudActiveBadge}</span> : null}
                {pkm.fainted ? <span className={styles.badge}>{es.teamFainted}</span> : null}
                {conditions.asleep ? <span className={styles.badge}>{es.battleStatusSleep}</span> : null}
                {conditions.poisoned ? <span className={styles.badge}>{es.battleStatusPoison}</span> : null}
              </span>
            </button>
          </li>
        )
      })}
      {Array.from({ length: emptySlots }, (_, index) => (
        <li
          key={`empty-${index}`}
          className={`${styles.slot} ${styles.slotEmpty}`}
          data-testid="team-slot"
          data-empty="true"
          aria-hidden="true"
        >
          {es.teamEmptySlot}
        </li>
      ))}
    </ul>
  )
}
