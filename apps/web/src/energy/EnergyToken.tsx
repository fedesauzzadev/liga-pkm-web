// Ficha de energía equipable/arrastrable (SPEC-F/T-047/AC-3): presentacional,
// la consume el panel de equipo (T-033) en la fase Organize. El drag y la
// acción quedan en manos de quien la usa; la ficha solo expone su estado.
import type { DragEvent } from 'react'
import { es } from '../i18n/es'
import { EnergyIcon } from './EnergyIcon'
import type { EnergyIconSize, EnergyIconType } from './icons'
import { energyLabel } from './icons'
import styles from './energy.module.css'

export interface EnergyTokenProps {
  readonly type: EnergyIconType
  readonly size?: EnergyIconSize
  /** true ⇒ equipada en un PKM (no se arrastra desde ahí, RULES §3). */
  readonly equipped?: boolean
  readonly disabled?: boolean
  /** Clic/tap para elegir la ficha (p. ej. asignar Multicolor en T-033). */
  readonly onPick?: (() => void) | undefined
  readonly onDragStart?: ((event: DragEvent<HTMLElement>) => void) | undefined
}

export function EnergyToken({
  type,
  size = 24,
  equipped = false,
  disabled = false,
  onPick,
  onDragStart,
}: EnergyTokenProps) {
  const label = energyLabel(type)
  const aria = equipped ? `${label} (${es.iconsTokenEquipped})` : label
  const dataAttrs = {
    'data-energy-token': type,
    'data-equipped': equipped ? 'true' : 'false',
    'data-disabled': disabled ? 'true' : undefined,
  } as const

  if (onPick !== undefined) {
    return (
      <button
        type="button"
        className={styles.token}
        {...dataAttrs}
        disabled={disabled}
        aria-label={aria}
        draggable={!equipped}
        onDragStart={onDragStart}
        onClick={onPick}
      >
        <EnergyIcon type={type} size={size} />
      </button>
    )
  }

  return (
    <span
      className={styles.token}
      {...dataAttrs}
      role="img"
      aria-label={aria}
      title={aria}
      draggable={!equipped}
      onDragStart={onDragStart}
    >
      <EnergyIcon type={type} size={size} />
    </span>
  )
}
