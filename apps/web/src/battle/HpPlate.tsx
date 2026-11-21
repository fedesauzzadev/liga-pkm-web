// Placa de nombre + HP + íconos de estado (SPEC-D/T-032a/AC-6). La barra anima con
// `transform: scaleX` (sin layout shift) y tween de 600 ms (anim.config).
import { ANIMATION_CONFIG } from '../events/anim.config'
import { StatusIcon } from './icons'
import type { StatusView } from './model'
import styles from './HpPlate.module.css'

export interface HpPlateProps {
  readonly name: string
  readonly hpMax: number
  readonly damage: number
  readonly side: 'player' | 'rival'
  readonly statuses?: readonly StatusView[]
}

export function HpPlate({ name, hpMax, damage, side, statuses = [] }: HpPlateProps) {
  const current = Math.max(0, hpMax - damage)
  const ratio = hpMax > 0 ? current / hpMax : 0
  return (
    <div className={styles.plate} data-side={side}>
      <span className={styles.name}>{name}</span>
      <span className={styles.hp} data-hp={`${current}/${hpMax}`}>
        {current}/{hpMax}
      </span>
      <div
        className={styles.bar}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={hpMax}
        aria-valuenow={current}
        aria-label={`${name}: ${current}/${hpMax}`}
      >
        <div
          className={styles.fill}
          style={{
            transform: `scaleX(${ratio})`,
            transitionDuration: `${ANIMATION_CONFIG.hpTweenMs}ms`,
          }}
        />
      </div>
      {statuses.length > 0 ? (
        <div className={styles.statuses}>
          {statuses.map((view, index) => (
            <StatusIcon key={`${view.kind}-${index}`} view={view} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
