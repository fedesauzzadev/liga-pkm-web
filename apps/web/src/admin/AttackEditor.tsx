// SPEC-E/T-040/AC-2 — editor de un ataque: caras del dado, costos con selector de
// íconos, daño (base + ifRoll), efectos (primitivas), mapeo oficial y FX.
import type { ReactNode } from 'react'
import { CostIcon, ElementIcon } from '../battle/icons'
import { ELEMENTS, FX_ARCHETYPES, type CostSlot, type Element } from '@liga/content'
import { es } from '../i18n/es'
import { confirmMoveMapping, getArr, getNum, getObj, getStr, setOfficialMove, setOptionalString, type Draft } from './draft.ts'
import { EffectsEditor, FacesInput } from './EffectsEditor.tsx'
import styles from './cards-admin.module.css'

const KINDS = ['attack', 'ability'] as const
const MOVE_STATUSES = ['proposed', 'verified', 'unmapped'] as const

function asSlot(v: string): CostSlot {
  return (v === 'any' || ELEMENTS.includes(v as Element)) ? (v as CostSlot) : 'any'
}

function AttackField({ label, hint, children }: { readonly label: string; readonly hint?: string; readonly children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint !== undefined && <span className={styles.fieldHint}>{hint}</span>}
    </label>
  )
}

/** Editor de un ataque (fila del repetidor de la carta). */
export function AttackEditor({
  attack,
  patch,
  onPreview,
}: {
  readonly attack: Draft
  readonly patch: (next: Draft) => void
  readonly onPreview: () => void
}) {
  const damage = getObj(attack, 'damage') ?? {}
  const ifRoll = getObj(damage, 'ifRoll')
  const cost = Array.isArray(attack.cost) ? (attack.cost.filter((c): c is string => typeof c === 'string')) : []
  const setCost = (next: string[]): void => patch({ ...attack, cost: next.map(asSlot) })

  return (
    <div className={styles.attackBox}>
      <div className={styles.attackRow}>
        <AttackField label={es.adminAttackId} hint={es.adminHelpAttackId}>
          <input value={getStr(attack, 'id')} onChange={(e) => patch({ ...attack, id: e.target.value })} />
        </AttackField>
        <AttackField label={es.adminAttackName} hint={es.adminHelpAttackName}>
          <input value={getStr(attack, 'name')} onChange={(e) => patch({ ...attack, name: e.target.value })} />
        </AttackField>
        <AttackField label={es.adminKind} hint={es.adminHelpKind}>
          <select value={getStr(attack, 'kind')} onChange={(e) => patch({ ...attack, kind: e.target.value })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'attack' ? es.adminKindAttack : es.adminKindAbility}
              </option>
            ))}
          </select>
        </AttackField>
        <AttackField label={es.setupElement} hint={es.adminHelpAttackElement}>
          <span className={styles.iconSelect}>
            <select
              value={getStr(attack, 'element')}
              aria-label={es.setupElement}
              onChange={(e) => patch({ ...attack, element: e.target.value })}
            >
              {ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {es.elementNames[el]}
                </option>
              ))}
            </select>
            <ElementIcon element={asElement(getStr(attack, 'element'))} small />
          </span>
        </AttackField>
      </div>

      <div className={styles.attackRow}>
        <AttackField label={es.adminRollFaces} hint={es.adminHelpRollFaces}>
          <FacesInput value={attack.rollFaces} onChange={(next) => patch({ ...attack, rollFaces: next })} />
        </AttackField>
        <AttackField label={es.adminCost} hint={es.adminHelpCost}>
          <span className={styles.costEditor}>
            {cost.map((slot, i) => (
              <span key={i} className={styles.iconSelect}>
                <select
                  value={slot}
                  aria-label={`${es.adminCost} ${i + 1}`}
                  onChange={(e) => setCost(cost.map((c, j) => (j === i ? e.target.value : c)))}
                >
                  <option value="any">{es.anyElement}</option>
                  {ELEMENTS.map((el) => (
                    <option key={el} value={el}>
                      {es.elementNames[el]}
                    </option>
                  ))}
                </select>
                <CostIcon slot={asSlot(slot)} />
                <button type="button" className={styles.mini} aria-label={`${es.adminRemove} ${es.adminCost} ${i + 1}`} onClick={() => setCost(cost.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
            <button type="button" className={styles.mini} onClick={() => setCost([...cost, 'any'])}>
              +
            </button>
          </span>
        </AttackField>
      </div>

      <div className={styles.attackRow}>
        <AttackField label={es.adminDamageBase} hint={es.adminHelpDamageBase}>
          <input
            type="number"
            step="1"
            min="0"
            value={getNum(damage, 'base') ?? ''}
            onChange={(e) => patch({ ...attack, damage: { ...damage, base: numberOrZero(e.target.value) } })}
          />
        </AttackField>
        <AttackField label={es.adminIfRoll} hint={es.adminHelpIfRoll}>
          <span className={styles.iconSelect}>
            <input
              type="checkbox"
              checked={ifRoll !== null}
              onChange={(e) => {
                const next = { ...damage }
                if (e.target.checked) next.ifRoll = { faces: [4, 5, 6], damage: 20 }
                else delete next.ifRoll
                patch({ ...attack, damage: next })
              }}
            />
            {ifRoll !== null && (
              <>
                <FacesInput value={ifRoll.faces} onChange={(faces) => patch({ ...attack, damage: { ...damage, ifRoll: { ...ifRoll, faces } } })} />
                <input
                  className={styles.smallNum}
                  type="number"
                  step="1"
                  min="0"
                  aria-label={es.adminIfRollDamage}
                  value={getNum(ifRoll, 'damage') ?? ''}
                  onChange={(e) => patch({ ...attack, damage: { ...damage, ifRoll: { ...ifRoll, damage: numberOrZero(e.target.value) } } })}
                />
              </>
            )}
          </span>
        </AttackField>
      </div>

      <div className={styles.attackRow}>
        <AttackField label={es.adminRawText} hint={es.adminHelpRawText}>
          <textarea rows={2} value={getStr(attack, 'rawText')} onChange={(e) => patch({ ...attack, rawText: e.target.value })} />
        </AttackField>
      </div>

      <div className={styles.attackRow}>
        <AttackField label={es.adminOfficialMove} hint={es.adminOfficialMoveHelp}>
          <input value={getStr(attack, 'officialMove')} onChange={(e) => patch(setOfficialMove(attack, e.target.value))} />
        </AttackField>
        <AttackField label={es.adminOfficialMoveStatus} hint={es.adminOfficialMoveHelpStatus}>
          <select
            value={getStr(attack, 'officialMoveStatus')}
            onChange={(e) => { const next = { ...attack }; setOptionalString(next, 'officialMoveStatus', e.target.value); patch(next) }}
          >
            <option value="">—</option>
            {MOVE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </AttackField>
        <AttackField label={es.adminFx} hint={es.adminOfficialMoveHelpFx}>
          <select value={getStr(attack, 'fx')} onChange={(e) => { const next = { ...attack }; setOptionalString(next, 'fx', e.target.value); patch(next) }}>
            <option value="">—</option>
            {FX_ARCHETYPES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </AttackField>
        <button type="button" className={styles.previewBtn} onClick={onPreview}>
          {es.adminFxPreview}
        </button>
        <button
          type="button"
          className={styles.previewBtn}
          disabled={getStr(attack, 'officialMove') === ''}
          title={es.adminConfirmMoveHint}
          onClick={() => patch(confirmMoveMapping(attack))}
        >
          {es.adminConfirmMove}
        </button>
        <div className={styles.helpBlock}>
          <p className={styles.hint}>{es.adminOfficialMoveHelpSources}</p>
        </div>
      </div>

      <div className={styles.attackRow}>
        <div className={styles.fieldBlock}>
          <span className={styles.fieldLabel}>{es.adminEffects}</span>
          <EffectsEditor effects={getArr(attack, 'effects')} onChange={(next) => patch({ ...attack, effects: next })} />
        </div>
      </div>
    </div>
  )
}

function asElement(v: string): Element {
  return ELEMENTS.includes(v as Element) ? (v as Element) : 'normal'
}

function numberOrZero(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}
