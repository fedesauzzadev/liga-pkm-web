// Caras de carta chicas (SPEC-G/T-064/AC-2): energía (ficha con <EnergyIcon>)
// e ítem (nombre del mazo Ítem/Sorpresa). Cartas PKM reusan <PkmCard> (ADR-8).
import type { Element } from '@liga/engine'
import { EnergyIcon } from '../energy/EnergyIcon'
import type { EnergyIconSize } from '../energy/icons'
import { es } from '../i18n/es'
import styles from './CardFaces.module.css'

export interface EnergyCardFaceProps {
  readonly element: Element
  readonly size?: EnergyIconSize
}

/** AC-2: ficha de energía — ícono + nombre ("Energía de Agua"). */
export function EnergyCardFace({ element, size = 48 }: EnergyCardFaceProps) {
  const label = es.tileEnergyCard.replace('{element}', es.elementNames[element])
  return (
    <div className={styles.face} data-card-face="energy" aria-label={label}>
      <EnergyIcon type={element} size={size} />
      <p className={styles.name}>{label}</p>
    </div>
  )
}

export interface ItemCardFaceProps {
  readonly id: string
}

/** AC-2: carta de ítem — nombre canónico (o id crudo si no está traducido). */
export function ItemCardFace({ id }: ItemCardFaceProps) {
  const label = es.tileItemNames[id as keyof typeof es.tileItemNames] ?? id
  return (
    <div className={styles.face} data-card-face="item" aria-label={label}>
      <p className={styles.name}>{label}</p>
      <p className={styles.hint}>{es.drawItemHint}</p>
    </div>
  )
}
