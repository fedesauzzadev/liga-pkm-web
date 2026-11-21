// Ícono y fila de costos (SPEC-F/T-047/AC-1, AC-2): <img> con la URL hasheada
// del SVG y aria-label en español desde energy.json. El slot 'any' de un costo
// usa normal.svg, el círculo gris "cualquier elemento" (RULES §3, D-24).
import type { CostSlot } from '@liga/content'
import { es } from '../i18n/es'
import type { EnergyIconSize, EnergyIconType } from './icons'
import { energyIconUrl, energyLabel } from './icons'
import styles from './energy.module.css'

export interface EnergyIconProps {
  readonly type: EnergyIconType
  readonly size?: EnergyIconSize
  /** Sobrescribe el aria-label (p. ej. 'any' ⇒ "Cualquier elemento"). */
  readonly label?: string | undefined
}

export function EnergyIcon({ type, size = 24, label }: EnergyIconProps) {
  const text = label ?? energyLabel(type)
  return (
    <img
      className={styles.icon}
      src={energyIconUrl(type)}
      alt=""
      role="img"
      aria-label={text}
      title={text}
      width={size}
      height={size}
      data-energy-icon={type}
      draggable={false}
    />
  )
}

export interface CostRowProps {
  readonly cost: readonly CostSlot[]
  readonly size?: EnergyIconSize
}

/** Un ícono por slot del costo (AC-2); 'any' ⇒ normal.svg. */
export function CostRow({ cost, size = 16 }: CostRowProps) {
  return (
    <span className={styles.costRow} data-cost-row={cost.length}>
      {cost.map((slot, index) => (
        <EnergyIcon
          key={`${slot}-${index}`}
          type={slot === 'any' ? 'normal' : slot}
          size={size}
          label={slot === 'any' ? es.anyElement : undefined}
        />
      ))}
    </span>
  )
}
