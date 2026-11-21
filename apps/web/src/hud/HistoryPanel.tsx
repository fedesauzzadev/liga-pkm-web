// panel-history (SPEC-I/T-072/AC-1): lista cronológica (lo nuevo abajo, con
// autoscroll) con ícono + texto + etiqueta de turno/jugador, filtro "Todos /
// Solo yo" y tope de 200 entradas (el tope lo aplica appendHistory). AC-3: lo
// de combate va bajo un encabezado plegable "Combate vs X". Controlado: el
// estado vive en PlayScreen para poder testearlo por SSR.
import { useEffect, useRef } from 'react'
import { es } from '../i18n/es'
import { groupHistory, type HistoryEntry } from './history'
import styles from './hud.module.css'

export type HistoryFilter = 'all' | 'me'

export interface HistoryPanelProps {
  readonly entries: readonly HistoryEntry[]
  /** Jugador local (para "Solo yo"); null deshabilita el filtro propio. */
  readonly myPlayerId: string | null
  readonly filter: HistoryFilter
  readonly onFilterChange: (filter: HistoryFilter) => void
  /** Claves de grupos de combate colapsados (AC-3). */
  readonly collapsed: readonly number[]
  readonly onToggleGroup: (key: number) => void
}

function Entry({ entry }: { readonly entry: HistoryEntry }): React.ReactNode {
  return (
    <li
      className={styles.historyEntry}
      data-testid="history-entry"
      data-kind={entry.kind}
      data-turn={entry.turn}
      data-player={entry.playerId ?? ''}
    >
      <span className={styles.historyIcon} aria-hidden="true" />
      <span className={styles.historyText}>{entry.text}</span>
      <span className={styles.historyMeta}>
        {es.historyTurnLabel.replace('{n}', String(entry.turn))}
        {entry.playerLabel === '' ? '' : ` · ${entry.playerLabel}`}
      </span>
    </li>
  )
}

export function HistoryPanel({
  entries,
  myPlayerId,
  filter,
  onFilterChange,
  collapsed,
  onToggleGroup,
}: HistoryPanelProps): React.ReactNode {
  // AC-1: "Solo yo" deja ver las acciones propias + los avisos sin jugador.
  const visible =
    filter === 'me'
      ? entries.filter((entry) => entry.playerId === null || entry.playerId === myPlayerId)
      : entries
  const rows = groupHistory(visible)
  const listRef = useRef<HTMLUListElement | null>(null)
  // AC-1: autoscroll — lo nuevo abajo, el scroll interno queda al final.
  useEffect(() => {
    const list = listRef.current
    if (list !== null) list.scrollTop = list.scrollHeight
  }, [visible.length, filter, collapsed.length])
  return (
    <div className={styles.history} data-history-panel="true">
      <div className={styles.historyFilters} role="group" aria-label={es.shellPanelHistory}>
        <button
          type="button"
          className={styles.historyFilterButton}
          data-testid="history-filter-all"
          aria-pressed={filter === 'all'}
          onClick={() => onFilterChange('all')}
        >
          {es.historyFilterAll}
        </button>
        <button
          type="button"
          className={styles.historyFilterButton}
          data-testid="history-filter-me"
          aria-pressed={filter === 'me'}
          onClick={() => onFilterChange('me')}
        >
          {es.historyFilterMe}
        </button>
      </div>
      <ul className={styles.historyList} ref={listRef} data-autoscroll="true">
        {rows.length === 0 ? <li className={styles.historyEmpty}>{es.historyEmpty}</li> : null}
        {rows.map((row) =>
          row.type === 'entry' ? (
            <Entry key={`e-${String(row.entry.id)}`} entry={row.entry} />
          ) : (
            <li key={`b-${String(row.key)}`} className={styles.historyGroup}>
              <button
                type="button"
                className={styles.historyGroupButton}
                data-testid="history-group-toggle"
                data-battle-key={row.key}
                aria-expanded={!collapsed.includes(row.key)}
                onClick={() => onToggleGroup(row.key)}
              >
                <span className={styles.historyGroupTitle}>
                  {es.historyBattleGroup.replace('{name}', row.name)}
                </span>
                <span className={styles.historyGroupArrow} aria-hidden="true">
                  {collapsed.includes(row.key) ? '▸' : '▾'}
                </span>
              </button>
              {collapsed.includes(row.key) ? null : (
                // N-0006/AC-1: sub-lista propia (un <li> no puede colgar directo de otro <li>).
                <ul className={styles.historyGroupList}>
                  {row.entries.map((entry) => (
                    <Entry key={`e-${String(entry.id)}`} entry={entry} />
                  ))}
                </ul>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
