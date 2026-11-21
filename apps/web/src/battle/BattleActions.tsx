// Panel de acciones (rediseno-combate-max/AC-6): alto FIJO 200 px de diseño;
// contenido según la pestaña activa + `battle-effect-box` (texto completo del
// efecto del ataque elegido o el motivo de algo deshabilitado) y la fila final
// con Aceptar/Cancelar a la derecha. Los "deshabilitados con motivo" usan
// aria-disabled: el clic muestra el motivo sin despachar nada (nota n.º 5);
// los vacíos (sin ataque) son disabled reales.
import { es } from '../i18n/es'
import type { AttackOption, BagOption, BattleTab, SwitchOption } from './controls'
import styles from './BattleControls.module.css'

export interface BattleActionsProps {
  readonly tab: BattleTab
  readonly attackOptions: readonly AttackOption[]
  readonly switchOptions: readonly SwitchOption[]
  readonly bagOptions: readonly BagOption[]
  /** Texto de confirmación de Dejar ir ("¿Dejar ir a X? Se termina tu turno."). */
  readonly releaseText: string
  /** Efecto/motivo del recuadro (battle-effect-box). */
  readonly effectText: string | null
  readonly canAccept: boolean
  /** Animaciones en curso o espectador: todo bloqueado. */
  readonly blocked: boolean
  readonly selectedAttackId: string | null
  readonly selectedSwitchUid: string | null
  readonly selectedItemId: string | null
  readonly onPickAttack: (option: AttackOption) => void
  readonly onPickSwitch: (option: SwitchOption) => void
  readonly onPickItem: (option: BagOption) => void
  readonly onAccept: () => void
  readonly onCancel: () => void
}

export function BattleActions(props: BattleActionsProps) {
  const { blocked } = props
  return (
    <div className={styles.actions} data-testid="battle-actions">
      <div className={styles.options}>
        {props.tab === 'attack' ? (
          <div
            className={styles.list}
            data-testid="battle-attack-list"
            role="listbox"
            aria-label={es.battleTabAttack}
          >
            {props.attackOptions.map((option) =>
              option.attack === null ? (
                <button
                  key={option.slot}
                  type="button"
                  className={styles.option}
                  data-testid={option.testid}
                  disabled
                  aria-label={es.battleAttackEmpty}
                />
              ) : (
                <button
                  key={option.slot}
                  type="button"
                  className={styles.option}
                  data-testid={option.testid}
                  data-selected={props.selectedAttackId === option.attack.id ? 'true' : undefined}
                  aria-disabled={option.legal ? undefined : 'true'}
                  onClick={() => {
                    if (!blocked) props.onPickAttack(option)
                  }}
                >
                  <span className={styles.optionFaces}>{option.attack.rollFaces.join('-')}</span>
                  <span className={styles.optionName}>{option.attack.name}</span>
                </button>
              ),
            )}
          </div>
        ) : null}
        {props.tab === 'switch' ? (
          <div className={styles.list} data-testid="battle-switch-list">
            {props.switchOptions.map((option) => (
              <button
                key={option.uid}
                type="button"
                className={styles.option}
                data-testid={option.testid}
                data-selected={props.selectedSwitchUid === option.uid ? 'true' : undefined}
                aria-disabled={option.legal ? undefined : 'true'}
                onClick={() => {
                  if (!blocked) props.onPickSwitch(option)
                }}
              >
                <span className={styles.optionName}>{option.name}</span>
                <span className={styles.optionMeta}>
                  {option.fainted ? es.battleSwitchFainted : `HP ${option.hp}`}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {props.tab === 'bag' ? (
          <div className={styles.list} data-testid="battle-bag-list">
            {props.bagOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={styles.option}
                data-testid={option.testid}
                data-selected={props.selectedItemId === option.id ? 'true' : undefined}
                aria-disabled={option.legal ? undefined : 'true'}
                onClick={() => {
                  if (!blocked) props.onPickItem(option)
                }}
              >
                <span className={styles.optionName}>{option.label}</span>
                <span className={styles.optionMeta}>×{String(option.count)}</span>
              </button>
            ))}
            {props.bagOptions.length === 0 ? (
              <p className={styles.empty}>{es.battleBagEmpty}</p>
            ) : null}
          </div>
        ) : null}
        {props.tab === 'release' ? (
          <div className={styles.list} data-testid="battle-release-list">
            <p className={styles.releaseText}>{props.releaseText}</p>
          </div>
        ) : null}
      </div>
      <div className={styles.effectRow}>
        <p className={styles.effectBox} data-testid="battle-effect-box">
          {props.effectText ?? ''}
        </p>
        <div className={styles.acceptRow}>
          <button
            type="button"
            className={styles.secondary}
            data-testid="btn-cancel"
            disabled={blocked}
            onClick={props.onCancel}
          >
            {es.battleCancel}
          </button>
          <button
            type="button"
            className={styles.primary}
            data-testid="btn-accept"
            disabled={blocked || !props.canAccept}
            onClick={props.onAccept}
          >
            {es.battleAccept}
          </button>
        </div>
      </div>
    </div>
  )
}
