// Panel lateral de la ventana de carta (SPEC-R/T-103/AC-11..AC-15): Estado,
// energías equipadas/disponibles (grilla de fichas con contador, no lista con
// scroll), Multicolor, Pociones y Evolución. Acciones solo si el motor las
// dictaminó legales (AC-13); modos solo lectura sin acciones (AC-14). El scroll
// es interno del panel y solo si no entra (AC-15).
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Element } from '@liga/content'
import type { Command } from '@liga/engine'
import { statusViews, type StatusKind } from '../battle/model'
import { EnergyToken } from '../energy/EnergyToken'
import { es } from '../i18n/es'
import { cardModalConfig } from './config'
import {
  availableEnergies,
  type CardModalActions,
  type CardModalSpec,
} from './model'
import styles from './CardModal.module.css'

/** Etiquetas de estado (≥13 px; AC-16): sin los íconos de 11 px del combate. */
const STATUS_LABELS: Readonly<Record<StatusKind, string>> = {
  sleep: es.battleStatusSleep,
  poison: es.battleStatusPoison,
  confused: es.battleStatusConfused,
  noAttack: es.battleStatusNoAttack,
  drain: es.battleStatusDrain,
  shield: es.battleStatusShield,
  boost: es.battleStatusBoost,
}

export interface SidePanelProps {
  readonly spec: CardModalSpec
  readonly actions: CardModalActions
  readonly itemCounts: { readonly potion: number; readonly super_potion: number }
  readonly multicolorFree: number
  readonly style?: CSSProperties
  readonly onCommand: (command: Command) => void
}

export function SidePanel({
  spec,
  actions,
  itemCounts,
  multicolorFree,
  style,
  onCommand,
}: SidePanelProps): ReactNode {
  const { pkm, readOnly, notice } = spec
  const [multicolorOpen, setMulticolorOpen] = useState(false)
  const statuses = statusViews(spec.conditions)
  const available = availableEnergies(spec.elements)
  const canEquip = actions.equipElementIds.size > 0
  const chipStyle: CSSProperties = {
    minHeight: `${String(cardModalConfig.equipChip.minHeightPx)}px`,
    minWidth: `${String(cardModalConfig.equipChip.minWidthPx)}px`,
  }

  return (
    <aside
      className={styles.side}
      style={style}
      data-testid={cardModalConfig.sidePanel.testid}
      aria-label={es.modalCardTitle}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const payload = event.dataTransfer.getData('text/plain')
        if (!payload.startsWith('unequip:')) return
        event.preventDefault()
        onCommand({
          type: 'Unequip',
          pkmUid: pkm.uid,
          elementId: payload.slice('unequip:'.length),
        })
      }}
    >
      {readOnly ? (
        <p className={styles.readOnly} data-testid="card-read-only">
          {es.modalReadOnly}
          {notice !== null && es.modalReadOnlyWhy[notice] !== undefined
            ? ` — ${es.modalReadOnlyWhy[notice]}`
            : ''}
        </p>
      ) : null}

      <section className={styles.section} aria-label={es.modalStatusTitle}>
        <h4 className={styles.sectionTitle}>{es.modalStatusTitle}</h4>
        <p className={styles.statusBadges} data-testid="card-status">
          {spec.active ? <span className={styles.badge}>{es.hudActiveBadge}</span> : null}
          {pkm.fainted ? <span className={styles.badge}>{es.teamFainted}</span> : null}
          {statuses.map((view, index) => (
            <span key={index} className={styles.badgePlain} title={STATUS_LABELS[view.kind]}>
              {view.text ?? STATUS_LABELS[view.kind]}
            </span>
          ))}
          {!spec.active && !pkm.fainted && statuses.length === 0 ? (
            <span className={styles.badgeMuted}>—</span>
          ) : null}
        </p>
      </section>

      <section className={styles.section} aria-label={es.popupPkmEquipped}>
        <h4 className={styles.sectionTitle}>{es.popupPkmEquipped}</h4>
        {pkm.equipped.length === 0 && pkm.multicolor.length === 0 ? (
          <p className={styles.hint}>—</p>
        ) : (
          <ul className={styles.chipGrid}>
            {pkm.equipped.map((elementCard) => {
              const enabled = !readOnly && actions.unequipElementIds.has(elementCard.id)
              if (readOnly) {
                return (
                  <li key={elementCard.id}>
                    <span
                      className={styles.chip}
                      style={chipStyle}
                      data-testid="card-energy-equipped"
                      data-element-id={elementCard.id}
                      title={es.popupPkmEquipped}
                    >
                      <EnergyToken type={elementCard.element} size={48} equipped />
                    </span>
                  </li>
                )
              }
              return (
                <li key={elementCard.id}>
                  <button
                    type="button"
                    className={styles.chip}
                    style={chipStyle}
                    data-testid="card-energy-equipped"
                    data-element-id={elementCard.id}
                    data-command="Unequip"
                    aria-label={`${es.popupPkmUnequip}: ${es.elementNames[elementCard.element]}`}
                    disabled={!enabled}
                    draggable={enabled}
                    onDragStart={
                      enabled
                        ? (event) =>
                            event.dataTransfer.setData('text/plain', `unequip:${elementCard.id}`)
                        : undefined
                    }
                    onClick={
                      enabled
                        ? () =>
                            onCommand({
                              type: 'Unequip',
                              pkmUid: pkm.uid,
                              elementId: elementCard.id,
                            })
                        : undefined
                    }
                  >
                    <EnergyToken type={elementCard.element} size={48} equipped />
                  </button>
                </li>
              )
            })}
            {pkm.multicolor.map((element, index) => {
              // T-104 (D-30): en Organize se puede quitar; en solo lectura, ficha sin acción.
              const enabled = !readOnly && actions.canUnassignMulticolor
              const chipProps = {
                className: styles.chip,
                style: chipStyle,
                'data-testid': 'card-multicolor-equipped',
                'data-multicolor': element,
              }
              if (readOnly) {
                return (
                  <li key={`multicolor-${index}`}>
                    <span {...chipProps} title={es.teamMulticolorAssigned}>
                      <EnergyToken type={element} size={48} equipped />
                    </span>
                  </li>
                )
              }
              return (
                <li key={`multicolor-${index}`}>
                  <button
                    type="button"
                    {...chipProps}
                    data-command="UnassignMulticolor"
                    aria-label={`${es.teamUnassignMulticolor}: ${es.elementNames[element]}`}
                    title={enabled ? es.teamUnassignMulticolor : es.modalChipBlocked}
                    disabled={!enabled}
                    onClick={
                      enabled
                        ? () => onCommand({ type: 'UnassignMulticolor', pkmUid: pkm.uid })
                        : undefined
                    }
                  >
                    <EnergyToken type={element} size={48} equipped />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {readOnly ? null : (
        <>
          <section className={styles.section} aria-label={es.popupPkmAvailable}>
            <h4 className={styles.sectionTitle}>{es.popupPkmAvailable}</h4>
            {available.length === 0 ? (
              <p className={styles.hint}>—</p>
            ) : (
              <>
                <ul className={styles.chipGrid}>
                  {available.map((group) => {
                    const enabled = actions.equipElementIds.has(group.exampleId)
                    return (
                      <li key={group.element}>
                        <button
                          type="button"
                          className={styles.chip}
                          style={chipStyle}
                          data-testid="card-energy-available"
                          data-element={group.element}
                          data-count={group.count}
                          data-command="Equip"
                          aria-label={`${es.popupPkmEquip}: ${es.elementNames[group.element]} ×${String(group.count)}`}
                          disabled={!enabled}
                          draggable={enabled}
                          onDragStart={
                            enabled
                              ? (event) =>
                                  event.dataTransfer.setData('text/plain', `equip:${group.exampleId}`)
                              : undefined
                          }
                          onClick={
                            enabled
                              ? () =>
                                  onCommand({
                                    type: 'Equip',
                                    pkmUid: pkm.uid,
                                    elementId: group.exampleId,
                                  })
                              : undefined
                          }
                        >
                          <EnergyToken type={group.element} size={48} />
                          <span className={styles.chipCount}>×{String(group.count)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {!canEquip ? <p className={styles.hint}>{es.modalChipBlocked}</p> : null}
              </>
            )}
          </section>

          <section className={styles.section} aria-label={es.teamMulticolorTitle}>
            <h4 className={styles.sectionTitle}>{es.teamMulticolorTitle}</h4>
            <p className={styles.hint} data-testid="multicolor-free">
              {`${es.teamMulticolorFree}: ${String(multicolorFree)}`}
            </p>
            {actions.multicolorOptions.length > 0 ? (
              <>
                <button
                  type="button"
                  className={styles.action}
                  data-testid="btn-multicolor-open"
                  aria-expanded={multicolorOpen}
                  onClick={() => setMulticolorOpen((open) => !open)}
                >
                  {es.modalAssignMulticolor}
                </button>
                {multicolorOpen ? (
                  <ul className={styles.chipGrid} data-testid="card-multicolor-options">
                    {actions.multicolorOptions.map((element: Element) => (
                      <li key={element}>
                        <button
                          type="button"
                          className={styles.chipSmall}
                          data-command="AssignMulticolor"
                          data-element={element}
                          aria-label={`${es.teamAssignMulticolor} ${es.elementNames[element]}`}
                          onClick={() => {
                            setMulticolorOpen(false)
                            onCommand({ type: 'AssignMulticolor', pkmUid: pkm.uid, element })
                          }}
                        >
                          <EnergyToken type={element} size={32} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </section>

          <section className={styles.section} aria-label={es.modalPotionsTitle}>
            <h4 className={styles.sectionTitle}>{es.modalPotionsTitle}</h4>
            <p className={styles.hint}>
              {`${es.teamPotion}: ${String(itemCounts.potion)} · ${es.tileItemNames.super_potion}: ${String(itemCounts.super_potion)}`}
            </p>
            {actions.potions.map((potion) => (
              <button
                key={potion.item}
                type="button"
                className={styles.action}
                data-testid={potion.item === 'potion' ? 'btn-potion' : 'btn-potion-super'}
                data-command="UsePotion"
                onClick={() =>
                  onCommand({
                    type: 'UsePotion',
                    pkmUid: pkm.uid,
                    target: pkm.uid,
                    ...(potion.item === 'potion' ? {} : { item: potion.item }),
                  })
                }
              >
                {potion.item === 'potion' ? es.modalUsePotion : es.modalUseSuperPotion}
              </button>
            ))}
          </section>

          <section className={styles.section} aria-label={es.teamEvolveTitle}>
            <h4 className={styles.sectionTitle}>{es.teamEvolveTitle}</h4>
            {actions.evolutions.length === 0 ? (
              <p className={styles.hint}>{es.modalEvolveNone}</p>
            ) : (
              actions.evolutions.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={styles.action}
                  data-testid="btn-evolve"
                  data-command="Evolve"
                  data-to-id={choice.id}
                  onClick={() => onCommand({ type: 'Evolve', pkmUid: pkm.uid, toId: choice.id })}
                >
                  {`${es.teamEvolve} ${choice.name} (${String(choice.xp)} XP)`}
                </button>
              ))
            )}
          </section>
        </>
      )}
    </aside>
  )
}
