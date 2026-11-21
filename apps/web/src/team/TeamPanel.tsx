// Vista de equipo e inventario (SPEC-D/T-033): ≤ 6 slots + pila de Oak, medallas
// (8 espacios), contador de ítems y Multicolor, y ficha de carta. Presentacional:
// la selección es estado local de UI; toda acción es un comando al motor.
import { useState } from 'react'
import type { PlayerState, PokemonCard, PkmInstance } from '@liga/engine'
import { es } from '../i18n/es'
import { ElementIcon } from '../battle/icons'
import { CardSheet } from './CardSheet'
import {
  evolveChoices,
  freeMulticolor,
  medalSlots,
  teamEntries,
  multicolorChoices,
  type CardOf,
  type TeamCommand,
} from './model'
import styles from './TeamPanel.module.css'

export interface TeamPanelProps {
  readonly player: PlayerState
  readonly cardOf: CardOf
  readonly teamLimit: number
  /** Equipar/desequipar/asignar/evolucionar solo en Organize (AC-2, RULES §3). */
  readonly canEdit: boolean
  /** Selección forzada (tests); por defecto el primer PKM del equipo. */
  readonly selectedUid?: string
  readonly onCommand: (command: TeamCommand) => void
}

export function TeamPanel({
  player,
  cardOf,
  teamLimit,
  canEdit,
  selectedUid,
  onCommand,
}: TeamPanelProps) {
  const entries = teamEntries(player, cardOf)
  const [ownSelected, setOwnSelected] = useState<string | null>(entries[0]?.pkm.uid ?? null)
  const activeUid = selectedUid ?? ownSelected ?? entries[0]?.pkm.uid ?? null
  const activeTeamEntry = entries.find((entry) => entry.pkm.uid === activeUid)
  const activeOakPkm =
    activeTeamEntry === undefined
      ? player.oakPile.find((pkm) => pkm.uid === activeUid)
      : undefined
  const active: { readonly pkm: PkmInstance; readonly card: PokemonCard | undefined } | undefined =
    activeTeamEntry ??
    (activeOakPkm === undefined ? undefined : { pkm: activeOakPkm, card: cardOf(activeOakPkm.cardId) })
  const emptySlots = Math.max(0, teamLimit - entries.length)
  const free = freeMulticolor(player)

  return (
    <section className={styles.panel} data-team-panel="true">
      <header className={styles.status}>
        <section className={styles.statusBlock} aria-label={es.teamMedals}>
          <h3 className={styles.statusTitle}>{es.teamMedals}</h3>
          <ul className={styles.medals}>
            {medalSlots(player.medals, 8).map((medal, index) => (
              <li
                key={index}
                className={styles.medalSlot}
                data-medal-slot="true"
                data-filled={medal !== null ? 'true' : 'false'}
                title={medal ?? undefined}
              >
                {medal ?? ''}
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.statusBlock} aria-label={es.teamItems}>
          <h3 className={styles.statusTitle}>{es.teamPokeball}</h3>
          <p className={styles.itemCount} data-item="pokeball">
            {`${es.teamPokeball}: ${player.items.pokeball}`}
          </p>
          <p className={styles.itemCount} data-item="potion">
            {`${es.teamPotion}: ${player.items.potion}`}
          </p>
          <p className={styles.itemCount} data-multicolor-free={free}>
            {`${es.teamMulticolorFree}: ${free}`}
          </p>
        </section>
      </header>

      <ul className={styles.team}>
        {entries.map(({ pkm, card }) => {
          const hp = card === undefined ? null : `${Math.max(0, card.hp - pkm.damage)}/${card.hp}`
          const isActive = pkm.uid === activeUid
          return (
            <li key={pkm.uid}>
              <button
                type="button"
                className={styles.slot}
                data-uid={pkm.uid}
                data-active={isActive ? 'true' : undefined}
                aria-pressed={isActive}
                onClick={() => setOwnSelected(pkm.uid)}
              >
                <span className={styles.slotName}>{card?.name ?? es.teamNoCard}</span>
                {card === undefined ? null : <ElementIcon element={card.element} small />}
                {hp === null ? null : (
                  <span className={styles.hp} data-hp={hp}>{hp}</span>
                )}
                <span className={styles.xp}>{`${es.teamXp}: ${pkm.xp}`}</span>
                {pkm.fainted ? <span className={styles.fainted}>{es.teamFainted}</span> : null}
              </button>
            </li>
          )
        })}
        {Array.from({ length: emptySlots }, (_, index) => (
          <li key={`empty-${index}`} className={styles.slot} data-empty="true" aria-hidden="true">
            {es.teamEmptySlot}
          </li>
        ))}
      </ul>

      <section className={styles.oak} data-oak-pile="true" aria-label={es.teamOakTitle}>
        <h3 className={styles.statusTitle}>{es.teamOakTitle}</h3>
        {player.oakPile.length === 0 ? (
          <p className={styles.hint}>{es.teamOakEmpty}</p>
        ) : (
          <ul className={styles.chipList}>
            {player.oakPile.map((pkm) => {
              const card = cardOf(pkm.cardId)
              const isActive = pkm.uid === activeUid
              return (
                <li key={pkm.uid}>
                  <button
                    type="button"
                    className={styles.chipButton}
                    data-uid={pkm.uid}
                    data-active={isActive ? 'true' : undefined}
                    aria-pressed={isActive}
                    onClick={() => setOwnSelected(pkm.uid)}
                  >
                    {card?.name ?? es.teamNoCard}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {active !== undefined && active.card !== undefined ? (
        <CardSheet
          card={active.card}
          pkm={active.pkm}
          editable={canEdit && activeTeamEntry !== undefined}
          equipOptions={activeTeamEntry === undefined ? [] : player.elements}
          multicolorOptions={multicolorChoices(player, active.pkm.uid)}
          evolveOptions={evolveChoices(active.pkm, active.card, cardOf)}
          onCommand={onCommand}
        />
      ) : (
        <p className={styles.hint}>{es.teamNoCard}</p>
      )}
    </section>
  )
}
