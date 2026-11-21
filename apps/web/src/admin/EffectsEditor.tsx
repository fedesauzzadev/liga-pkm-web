// SPEC-E/T-040/AC-2 — editor de efectos LIMITADO a las primitivas del esquema:
// las ops y sus campos se derivan de EffectSchema.options (docs/EFFECTS.md),
// así es imposible inventar primitivas nuevas; cada cambio re-valida con Zod.
import { z } from 'zod'
import type { $ZodType } from 'zod/v4/core'
import { EffectSchema } from '@liga/content'
import { es } from '../i18n/es'
import { getNum, getStr, setOptionalNumber, setOptionalString, toggleFaces, validateEffectDraft, facesChecked, type Draft } from './draft.ts'
import styles from './cards-admin.module.css'

type FieldKind = 'faces' | 'int' | 'string' | 'enum' | 'bool' | 'const'

export interface EffectFieldSpec {
  readonly key: string
  readonly kind: FieldKind
  readonly options?: readonly string[]
  readonly value?: string | number
  readonly optional?: boolean
}

function specOf(key: string, schema: $ZodType): EffectFieldSpec | null {
  if (schema instanceof z.ZodOptional) {
    const inner = specOf(key, schema.unwrap())
    return inner === null ? null : { ...inner, optional: true }
  }
  if (schema instanceof z.ZodArray) return { key, kind: 'faces' }
  if (schema instanceof z.ZodEnum) return { key, kind: 'enum', options: schema.options.map(String) }
  if (schema instanceof z.ZodLiteral) {
    return typeof schema.value === 'number'
      ? { key, kind: 'bool', value: schema.value }
      : { key, kind: 'const', value: String(schema.value) }
  }
  if (schema instanceof z.ZodNumber) return { key, kind: 'int' }
  if (schema instanceof z.ZodString) return { key, kind: 'string' }
  if (schema instanceof z.ZodUnion) {
    // Uniones de literales (fixedRolls.rolls: 2|3): numéricas ⇒ entero (Zod
    // rechaza otros valores en vivo); de texto ⇒ enum.
    const literals = (schema.options as readonly $ZodType[]).map((o) =>
      o instanceof z.ZodLiteral ? o.value : undefined,
    )
    if (literals.every((v) => typeof v === 'number')) return { key, kind: 'int' }
    if (literals.every((v) => typeof v === 'string')) return { key, kind: 'enum', options: literals.map(String) }
  }
  return null
}

/** Ops del editor = ops del esquema (por construcción, AC-2). */
export const EFFECT_OPS: readonly string[] = EffectSchema.options.map((o) => o.shape.op.value)

export const EFFECT_FIELDS: Readonly<Record<string, readonly EffectFieldSpec[]>> = Object.fromEntries(
  EffectSchema.options.map((o) => [
    o.shape.op.value as string,
    Object.entries(o.shape)
      .filter(([key]) => key !== 'op')
      .map(([key, schema]) => specOf(key, schema))
      .filter((s): s is EffectFieldSpec => s !== null),
  ]),
)

/** Cambia la op conservando nada: prefill de campos const (p. ej. requires). */
export function newEffectDraft(op: string): Draft {
  const draft: Draft = { op }
  for (const spec of EFFECT_FIELDS[op] ?? []) {
    if (spec.kind === 'const' && spec.value !== undefined) draft[spec.key] = spec.value
  }
  return draft
}

// Ayudas por op / campo genérico (plan explicar-campos-admin, AC-3/AC-4).
const effectHelp = es.adminEffectHelp as Readonly<Record<string, string | undefined>>
const effectFieldHelp = es.adminEffectFieldHelp as Readonly<Record<string, string | undefined>>

export function FacesInput({ value, onChange }: { readonly value: unknown; readonly onChange: (next: number[]) => void }) {
  const checked = facesChecked(value)
  return (
    <span className={styles.faces}>
      {[1, 2, 3, 4, 5, 6].map((face) => (
        <label key={face} className={styles.face}>
          <input
            type="checkbox"
            checked={checked[face - 1] === true}
            onChange={(e) => onChange(toggleFaces(value, face, e.target.checked))}
          />
          {face}
        </label>
      ))}
    </span>
  )
}

function EffectField({ spec, draft, patch }: { readonly spec: EffectFieldSpec; readonly draft: Draft; readonly patch: (next: Draft) => void }) {
  const label = `${spec.key}${spec.optional === true ? '?' : ''}`
  const hint = effectFieldHelp[spec.key]
  const hintNode = hint === undefined ? null : <span className={styles.fieldHint}>{hint}</span>
  if (spec.kind === 'const') {
    return <span className={styles.field}>{label} = {String(spec.value)}{hintNode}</span>
  }
  if (spec.kind === 'faces') {
    return (
      <label className={styles.field}>
        {label} <FacesInput value={draft[spec.key]} onChange={(next) => patch({ ...draft, [spec.key]: next })} />
        {hintNode}
      </label>
    )
  }
  if (spec.kind === 'bool') {
    return (
      <label className={styles.field}>
        <input
          type="checkbox"
          checked={draft[spec.key] !== undefined}
          onChange={(e) => {
            const next = { ...draft }
            if (e.target.checked && spec.value !== undefined) next[spec.key] = spec.value
            else delete next[spec.key]
            patch(next)
          }}
        />
        {label}
        {hintNode}
      </label>
    )
  }
  if (spec.kind === 'enum') {
    const current = getStr(draft, spec.key)
    return (
      <label className={styles.field}>
        {label}{' '}
        <select
          value={current}
          onChange={(e) => {
            const next = { ...draft }
            setOptionalString(next, spec.key, e.target.value)
            patch(next)
          }}
        >
          {spec.optional === true ? <option value="" /> : null}
          {(spec.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {hintNode}
      </label>
    )
  }
  const num = getNum(draft, spec.key)
  return (
    <label className={styles.field}>
      {label}{' '}
      <input
        type={spec.kind === 'int' ? 'number' : 'text'}
        step="1"
        value={spec.kind === 'int' ? (num ?? '') : getStr(draft, spec.key)}
        onChange={(e) => {
          const next = { ...draft }
          if (spec.kind === 'int') setOptionalNumber(next, spec.key, e.target.value)
          else setOptionalString(next, spec.key, e.target.value)
          patch(next)
        }}
      />
      {hintNode}
    </label>
  )
}

function EffectRow({ draft, patch, onRemove }: { readonly draft: Draft; readonly patch: (d: Draft) => void; readonly onRemove: () => void }) {
  const op = getStr(draft, 'op')
  const check = validateEffectDraft(draft)
  return (
    <li className={check.valid ? styles.effectRow : `${styles.effectRow} ${styles.effectBad}`}>
      <select value={op} aria-label={es.adminEffectOp} onChange={(e) => patch(newEffectDraft(e.target.value))}>
        <option value="" />
        {EFFECT_OPS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {op !== '' && effectHelp[op] !== undefined && (
        <span className={`${styles.effectHelp}${op === 'custom' ? ` ${styles.hintWarn}` : ''}`}>
          {effectHelp[op]}
        </span>
      )}
      {op === 'custom' && <span className={`${styles.effectHelp} ${styles.hintWarn}`}>{es.adminCustomWarning}</span>}
      {op !== '' && (EFFECT_FIELDS[op] ?? []).map((spec) => (
        <EffectField key={spec.key} spec={spec} draft={draft} patch={patch} />
      ))}
      <button type="button" className={styles.mini} onClick={onRemove}>
        ×
      </button>
      {!check.valid && (
        <span className={styles.errorText} title={check.errors.join('\n')}>
          {check.errors[0]}
        </span>
      )}
    </li>
  )
}

/** Editor de la lista de efectos (ataques o especialidades). */
export function EffectsEditor({ effects, onChange }: { readonly effects: readonly Draft[]; readonly onChange: (next: Draft[]) => void }) {
  return (
    <div className={styles.effects}>
      <ul className={styles.effectList}>
        {effects.map((draft, i) => (
          <EffectRow
            key={`${getStr(draft, 'op')}-${i}`}
            draft={draft}
            patch={(next) => onChange(effects.map((d, j) => (j === i ? next : d)))}
            onRemove={() => onChange(effects.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      <button type="button" className={styles.mini} onClick={() => onChange([...effects, { op: '' }])}>
        {es.adminAddEffect}
      </button>
    </div>
  )
}
