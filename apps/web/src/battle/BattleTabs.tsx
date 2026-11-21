// Pestañas de combate (rediseno-combate-max/AC-6): Atacar/Cambiar/Mochila/
// Dejar ir, fila de 52 px de diseño; la activa resaltada; inicial: Atacar.
import { BATTLE_TABS, type BattleTab } from './controls'
import styles from './BattleControls.module.css'

export interface BattleTabsProps {
  readonly active: BattleTab
  /** Espectador o animaciones en curso: pestañas deshabilitadas. */
  readonly disabled?: boolean
  readonly onSelect: (tab: BattleTab) => void
}

export function BattleTabs({ active, disabled = false, onSelect }: BattleTabsProps) {
  return (
    <div className={styles.tabs} data-testid="battle-tabs" role="tablist" aria-label="Acciones de combate">
      {BATTLE_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={styles.tab}
          data-testid={tab.testid}
          data-selected={tab.id === active ? 'true' : undefined}
          aria-selected={tab.id === active}
          disabled={disabled}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
