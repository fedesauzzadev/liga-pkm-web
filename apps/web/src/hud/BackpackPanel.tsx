// panel-backpack (SPEC-I/T-073): 5 filas fijas (Energías, Multicolor, Pociones,
// Bolas, Especiales) con mini-cartas apiladas y contador. Arrastre por pointer
// events (AC-1), selección por tap/teclado como alternativa accesible (AC-4),
// botón "Usar" para Oportunidad (AC-2) y selector de 13 energías para el
// Multicolor. El detalle del ítem seleccionado se muestra abajo (clic = detalle).
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Command, Element, GameState, PlayerState } from '@liga/engine'
import { es } from '../i18n/es'
import { EnergyIcon } from '../energy/EnergyIcon'
import { useCarried, useCarryStore, carryOf, type CarriedItem } from './carry'
import { backpackRows, samePayload, type DragPayload } from './backpack'
import styles from './backpack.module.css'

export interface MulticolorChoice {
  readonly pkmName: string
  readonly elements: readonly Element[]
  readonly onPick: (element: Element) => void
  readonly onCancel: () => void
}

export interface BackpackPanelProps {
  readonly player: PlayerState
  readonly state: GameState
  /** Mensaje del último drop ilegal (AC-3); el motivo lo escribe el motor. */
  readonly note?: string | null
  readonly multicolorChoice?: MulticolorChoice | null
  /** Carried fijo desde afuera (SSR proxy); sin él vive en el store. */
  readonly carryOverride?: CarriedItem | null
  readonly onCommand: (command: Command) => boolean
}

export function BackpackPanel({
  player,
  state,
  note = null,
  multicolorChoice = null,
  carryOverride,
  onCommand,
}: BackpackPanelProps) {
  const rows = backpackRows(player)
  const carried = useCarried(carryOverride)
  const rejected = useCarryStore((store) => store.rejected)
  const [shake, setShake] = useState(false)
  const canOrganize = state.phase === 'organize' && state.pending === null

  // AC-3: la carta vuelve a la fila con sacudida cuando el drop es ilegal.
  useEffect(() => {
    if (rejected === 0) return
    setShake(true)
    const timer = setTimeout(() => setShake(false), 700)
    return () => clearTimeout(timer)
  }, [rejected])

  const selectedHint =
    carried === null
      ? null
      : rows
          .flatMap((row) => row.tokens)
          .find((token) => samePayload(token.payload, carried.payload))?.hint ?? null

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, payload: DragPayload): void => {
    if (event.button !== 0) return
    carryOf().startDrag(payload, event.clientX, event.clientY)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const unequipTarget = carried?.payload.kind === 'unequip'

  return (
    <div
      className={`${styles.backpack} ${shake ? styles.shake : ''}`}
      data-backpack-panel="true"
      data-drop-target="backpack"
      data-drop-state={unequipTarget ? 'valid' : undefined}
      data-shake={shake ? 'true' : 'false'}
    >
      <ul className={styles.rows}>
        {rows.map((row) => {
          const visible = row.tokens.filter((token) => token.count > 0)
          return (
            <li
              className={styles.row}
              key={row.key}
              data-testid="backpack-row"
              data-row={row.key}
              aria-label={row.label}
            >
              <span className={styles.rowLabel}>{row.label}</span>
              <span className={styles.rowTokens}>
                {visible.length === 0 ? (
                  <span className={styles.rowEmpty}>{es.backpackEmptyRow}</span>
                ) : (
                  visible.map((token) => {
                    const selected =
                      carried !== null && samePayload(token.payload, carried.payload)
                    return (
                      <button
                        type="button"
                        className={`${styles.token} ${selected ? styles.tokenSelected : ''}`}
                        key={token.key}
                        data-testid="backpack-token"
                        data-token={token.key}
                        data-count={token.count}
                        data-selected={selected ? 'true' : 'false'}
                        title={token.hint}
                        aria-label={`${token.label} ×${String(token.count)}`}
                        onPointerDown={(event) => startDrag(event, token.payload)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            carryOf().select(token.payload)
                          }
                        }}
                      >
                        {token.icon !== null ? (
                          <EnergyIcon type={token.icon} size={24} />
                        ) : (
                          <span className={styles.glyph} aria-hidden="true">{token.glyph}</span>
                        )}
                        <span className={styles.count} data-count={token.count}>×{String(token.count)}</span>
                      </button>
                    )
                  })
                )}
                {row.key === 'special' && player.items.oportunidad > 0 ? (
                  <button
                    type="button"
                    className={styles.useButton}
                    data-testid="btn-oportunidad"
                    data-command="UseOportunidad"
                    disabled={!canOrganize}
                    onClick={() => {
                      onCommand({ type: 'UseOportunidad' })
                    }}
                  >
                    {es.backpackUse}
                  </button>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
      {selectedHint !== null ? (
        <p className={styles.detail} data-testid="backpack-detail">
          {selectedHint}
        </p>
      ) : (
        <p className={styles.detailHint}>{es.backpackSelectHint}</p>
      )}
      {note !== null ? (
        <p className={styles.note} data-testid="backpack-note" role="status">
          {note}
        </p>
      ) : null}
      {multicolorChoice !== null ? (
        <div
          className={styles.picker}
          data-testid="multicolor-picker"
          role="dialog"
          aria-label={es.backpackMulticolorTitle}
        >
          <p className={styles.pickerText}>
            {es.backpackMulticolorFor.replace('{name}', multicolorChoice.pkmName)}
          </p>
          <span className={styles.pickerElements}>
            {multicolorChoice.elements.map((element) => (
              <button
                type="button"
                className={styles.pickerButton}
                key={element}
                data-testid="multicolor-option"
                data-element={element}
                aria-label={es.elementNames[element]}
                onClick={() => {
                  multicolorChoice.onPick(element)
                }}
              >
                <EnergyIcon type={element} size={16} />
              </button>
            ))}
          </span>
          <button
            type="button"
            className={styles.pickerCancel}
            data-testid="multicolor-cancel"
            onClick={multicolorChoice.onCancel}
          >
            {es.shellTipClose}
          </button>
        </div>
      ) : null}
    </div>
  )
}
