// Íconos de elemento, costo y estado (SPEC-D/T-032a/AC-3, AC-6). Solo texto + color:
// sin emojis ni assets, accesibles por title/aria-label.
import type { Element } from '@liga/content'
import { es } from '../i18n/es'
import type { StatusKind, StatusView } from './model'
import styles from './icons.module.css'

export const ELEMENT_COLORS: Record<Element, string> = {
  normal: '#a8a878',
  fire: '#f08030',
  water: '#6890f0',
  grass: '#78c850',
  electric: '#f8d030',
  psychic: '#f85888',
  fighting: '#c03028',
  poison: '#a040a0',
  ground: '#e0c068',
  flying: '#a890f0',
  bug: '#a8b820',
  ghost: '#705898',
  ice: '#98d8d8',
  rock: '#b8a038',
  dragon: '#7038f8',
}

/** Ícono de elemento: círculo de color con código corto (p. ej. AG = Agua). */
export function ElementIcon({ element, small = false }: { readonly element: Element; readonly small?: boolean }) {
  const name = es.elementNames[element]
  return (
    <span
      className={small ? styles.elementSmall : styles.element}
      role="img"
      aria-label={name}
      title={name}
      style={{ backgroundColor: ELEMENT_COLORS[element] }}
    >
      {es.elementCodes[element]}
    </span>
  )
}

/** Ícono de costo de ataque; 'any' = círculo gris "cualquier elemento" (RULES §3). */
export function CostIcon({ slot }: { readonly slot: Element | 'any' }) {
  if (slot === 'any') {
    return (
      <span className={styles.any} role="img" aria-label={es.anyElement} title={es.anyElement} />
    )
  }
  return <ElementIcon element={slot} small />
}

export function CostIcons({ slots }: { readonly slots: readonly (Element | 'any')[] }) {
  return (
    <span className={styles.costRow}>
      {slots.map((slot, index) => (
        <CostIcon key={`${slot}-${index}`} slot={slot} />
      ))}
    </span>
  )
}

const STATUS_LABELS: Record<StatusKind, string> = {
  sleep: es.battleStatusSleep,
  poison: es.battleStatusPoison,
  confused: es.battleStatusConfused,
  noAttack: es.battleStatusNoAttack,
  drain: es.battleStatusDrain,
  shield: es.battleStatusShield,
  boost: es.battleStatusBoost,
}

const STATUS_SHORT: Record<StatusKind, string> = {
  sleep: 'Zz',
  poison: 'Ven',
  confused: 'Conf',
  noAttack: 'No atq',
  drain: 'Dren',
  shield: '',
  boost: '',
}

/** Ícono de condición con tooltip (AC-6). */
export function StatusIcon({ view }: { readonly view: StatusView }) {
  const label = STATUS_LABELS[view.kind]
  return (
    <span className={styles.status} role="img" aria-label={label} title={label}>
      {view.text ?? STATUS_SHORT[view.kind]}
    </span>
  )
}
