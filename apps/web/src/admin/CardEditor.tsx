// SPEC-E/T-040/AC-2 — editor de una carta: campos básicos con selectores de
// íconos, evoluciones, especialidades (primitivas), ataques (AttackEditor),
// fuente/foto y acciones Guardar/Verificada (AC-3).
import { useEffect, useState, type ReactNode } from 'react'
import { DECK_IDS, ELEMENTS, type Element } from '@liga/content'
import type { MoveFxAttack } from '../fx/playMoveFx'
import { ElementIcon } from '../battle/icons'
import { es } from '../i18n/es'
import { fetchAdminPhotos } from './api.ts'
import {
  getArr, getNum, getObj, getStr, moveFxAttackOf, photosByFolder, setOptionalNumber, setOptionalString,
  type Draft,
} from './draft.ts'
import { AttackEditor } from './AttackEditor.tsx'
import { EffectsEditor } from './EffectsEditor.tsx'
import styles from './cards-admin.module.css'

const STAGES = ['basic', 'evolution', 'gym', 'league', 'surprise'] as const
const GROUPS = ['gimnasio', 'liga', 'sorpresa', 'evolucion'] as const

function asElement(v: string): Element {
  return ELEMENTS.includes(v as Element) ? (v as Element) : 'normal'
}

function deckLabel(deck: string): string {
  const five = es.setupDeckNames as Readonly<Record<string, string | undefined>>
  const groups = es.adminDeckGroupNames as Readonly<Record<string, string | undefined>>
  return five[deck] ?? groups[deck] ?? deck
}

function Field({ label, hint, children }: { readonly label: string; readonly hint?: string; readonly children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint !== undefined && <span className={styles.fieldHint}>{hint}</span>}
    </label>
  )
}

function newAttackDraft(n: number): Draft {
  return {
    id: `atk_${n + 1}`,
    name: '',
    kind: 'attack',
    rollFaces: [],
    cost: [],
    element: 'normal',
    damage: { base: 0 },
    effects: [],
    rawText: '',
  }
}

export function CardEditor({
  file,
  draft,
  valid,
  errors,
  autoFocusFirst = false,
  photoList,
  onChange,
  onSave,
  onVerify,
  onPreview,
}: {
  readonly file: string
  readonly draft: Draft
  readonly valid: boolean
  readonly errors: readonly string[]
  /** Carga manual/AC-1: enfoca el primer campo al montar (carta recién agregada). */
  readonly autoFocusFirst?: boolean
  /** Carga manual/AC-3: inyecta el listado de fotos (tests); por defecto se fetchea. */
  readonly photoList?: readonly string[]
  readonly onChange: (next: Draft) => void
  readonly onSave: () => void
  readonly onVerify: () => void
  readonly onPreview: (attack: MoveFxAttack, name: string, dex: number | null) => void
}) {
  const [fetchedPhotos, setFetchedPhotos] = useState<readonly string[] | null>(null)
  useEffect(() => {
    if (photoList !== undefined) return
    let alive = true
    void fetchAdminPhotos()
      .then((p) => {
        if (alive) setFetchedPhotos(p.photos)
      })
      .catch(() => {
        if (alive) setFetchedPhotos(null)
      })
    return () => {
      alive = false
    }
  }, [photoList])
  const photos = photoList ?? fetchedPhotos

  const source = getObj(draft, 'source') ?? {}
  const gym = getObj(draft, 'gym')
  const attacks = getArr(draft, 'attacks')
  const evolves = getArr(draft, 'evolvesTo')
  const dex = getNum(draft, 'dex')

  const patchSource = (patch: Draft): void => onChange({ ...draft, source: { ...source, ...patch } })

  return (
    <div className={styles.cardEditor} data-testid="admin-card-editor">
      <header className={styles.editorHeader}>
        <span className={styles.filePath}>{file}</span>
        <span className={valid ? styles.badgeOk : styles.badgeBad} title={errors.join('\n')}>
          {valid ? es.adminValidOk : `${es.adminInvalid} (${errors.length})`}
        </span>
        <button type="button" className={styles.action} onClick={onSave}>{es.adminSave}</button>
        <button type="button" className={`${styles.action} ${styles.actionVerify}`} onClick={onVerify}>{es.adminVerifyNext}</button>
      </header>
      {!valid && (
        <ul className={styles.errorList}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className={styles.attackRow}>
        <Field label={es.adminFieldId} hint={es.adminHelpId}>
          <input value={getStr(draft, 'id')} autoFocus={autoFocusFirst} onChange={(e) => onChange({ ...draft, id: e.target.value })} />
        </Field>
        <Field label={es.adminFieldDex} hint={es.adminHelpDex}>
          <input type="number" min="1" max="151" step="1" value={dex ?? ''} onChange={(e) => onChange({ ...draft, dex: Number(e.target.value) || 0 })} />
        </Field>
        <Field label={es.adminFieldName} hint={es.adminHelpName}>
          <input value={getStr(draft, 'name')} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </Field>
        <Field label={es.setupHp} hint={es.adminHelpHp}>
          <input type="number" min="1" step="1" value={getNum(draft, 'hp') ?? ''} onChange={(e) => onChange({ ...draft, hp: Number(e.target.value) || 0 })} />
        </Field>
        <Field label={es.setupElement} hint={es.adminHelpElement}>
          <span className={styles.iconSelect}>
            <select value={getStr(draft, 'element')} onChange={(e) => onChange({ ...draft, element: e.target.value })}>
              {ELEMENTS.map((el) => (
                <option key={el} value={el}>{es.elementNames[el]}</option>
              ))}
            </select>
            <ElementIcon element={asElement(getStr(draft, 'element'))} small />
          </span>
        </Field>
        <Field label={es.adminFieldStage} hint={es.adminHelpStage}>
          <select value={getStr(draft, 'stage')} onChange={(e) => onChange({ ...draft, stage: e.target.value })}>
            {STAGES.map((s) => (
              <option key={s} value={s}>{es.adminStageNames[s]}</option>
            ))}
          </select>
        </Field>
        <Field label={es.adminFieldDeck} hint={es.adminHelpDeck}>
          <select value={getStr(draft, 'deck')} onChange={(e) => onChange({ ...draft, deck: e.target.value })}>
            {[...DECK_IDS, ...GROUPS].map((d) => (
              <option key={d} value={d}>{deckLabel(d)}</option>
            ))}
          </select>
        </Field>
        <Field label={es.adminFieldChances} hint={es.adminHelpChances}>
          <input type="number" min="1" step="1" value={getNum(draft, 'chances') ?? ''} onChange={(e) => { const next = { ...draft }; setOptionalNumber(next, 'chances', e.target.value); onChange(next) }} />
        </Field>
      </div>

      <div className={styles.attackRow}>
        <Field label={es.adminFieldGymLeader} hint={es.adminHelpGymLeader}>
          <span className={styles.iconSelect}>
            <input
              type="checkbox"
              checked={gym !== null}
              onChange={(e) => {
                const next = { ...draft }
                if (e.target.checked) next.gym = { leader: '', slot: 1 }
                else delete next.gym
                onChange(next)
              }}
            />
            {gym !== null && (
              <input value={getStr(gym, 'leader')} aria-label={es.adminFieldGymLeader} onChange={(e) => onChange({ ...draft, gym: { ...gym, leader: e.target.value } })} />
            )}
          </span>
        </Field>
        {gym !== null && (
          <Field label={es.adminFieldGymSlot} hint={es.adminHelpGymSlot}>
            <select value={String(gym.slot ?? '')} onChange={(e) => onChange({ ...draft, gym: { ...gym, slot: Number(e.target.value) || 1 } })}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </Field>
        )}
        <Field label={es.adminFieldManualPage} hint={es.adminHelpManualPage}>
          <input type="number" min="1" step="1" value={getNum(source, 'manualPage') ?? ''} onChange={(e) => { const next = { ...source }; setOptionalNumber(next, 'manualPage', e.target.value); patchSource(next) }} />
        </Field>
        <Field label={es.adminFieldPhoto} hint={es.adminHelpPhoto}>
          <span className={styles.photoRow}>
            <input value={getStr(source, 'photo')} placeholder="photos/pantano_03.jpg" onChange={(e) => { const next = { ...source }; setOptionalString(next, 'photo', e.target.value); patchSource(next) }} />
            {photos !== null && photos.length > 0 && (
              <select
                aria-label={es.adminPhotoPicker}
                value=""
                onChange={(e) => {
                  if (e.target.value === '') return
                  const next = { ...source }
                  setOptionalString(next, 'photo', e.target.value)
                  patchSource(next)
                }}
              >
                <option value="">{es.adminPhotoPick}</option>
                {photosByFolder(photos).map(({ folder, photos: list }) => (
                  <optgroup key={folder} label={folder}>
                    {list.map((p) => (
                      <option key={p} value={p}>{p.slice('photos/'.length)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </span>
        </Field>
        <Field label={es.adminFieldVerified} hint={es.adminHelpVerified}>
          <input type="checkbox" checked={source.verified === true} onChange={(e) => patchSource({ verified: e.target.checked })} />
        </Field>
      </div>

      <div className={styles.fieldBlock}>
        <span className={styles.fieldLabel}>{es.adminEvolvesTo}</span>
        <span className={styles.fieldHint}>{es.adminHelpEvolves}</span>
        <ul className={styles.effectList}>
          {evolves.map((evo, i) => (
            <li key={i} className={styles.effectRow}>
              <label className={styles.field}>
                {es.adminEvolvesId}
                <input value={getStr(evo, 'id')} onChange={(ev) => onChange({ ...draft, evolvesTo: evolves.map((x, j) => (j === i ? { ...x, id: ev.target.value } : x)) })} />
                <span className={styles.fieldHint}>{es.adminHelpEvolvesId}</span>
              </label>
              <label className={styles.field}>
                {es.adminEvolvesXp}
                <input type="number" min="0" step="1" value={getNum(evo, 'xp') ?? ''} onChange={(ev) => onChange({ ...draft, evolvesTo: evolves.map((x, j) => (j === i ? { ...x, xp: Number(ev.target.value) || 0 } : x)) })} />
                <span className={styles.fieldHint}>{es.adminHelpEvolvesXp}</span>
              </label>
              <button type="button" className={styles.mini} onClick={() => onChange({ ...draft, evolvesTo: evolves.filter((_, j) => j !== i) })}>×</button>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.mini} onClick={() => onChange({ ...draft, evolvesTo: [...evolves, { id: '', xp: 0 }] })}>{es.adminAddEvolution}</button>
      </div>

      <div className={styles.fieldBlock}>
        <span className={styles.fieldLabel}>{es.adminSpecialties}</span>
        <EffectsEditor effects={getArr(draft, 'specialties')} onChange={(next) => onChange({ ...draft, specialties: next })} />
      </div>

      <div className={styles.fieldBlock}>
        <span className={styles.fieldLabel}>{es.adminAttacksTitle}</span>
        {attacks.map((atk, i) => (
          <AttackEditor
            key={`${getStr(atk, 'id')}-${i}`}
            attack={atk}
            patch={(next) => onChange({ ...draft, attacks: attacks.map((a, j) => (j === i ? next : a)) })}
            onPreview={() => onPreview(moveFxAttackOf(atk), getStr(draft, 'name'), dex)}
          />
        ))}
        <button type="button" className={styles.mini} onClick={() => onChange({ ...draft, attacks: [...attacks, newAttackDraft(attacks.length)] })}>{es.adminAddAttack}</button>
      </div>
    </div>
  )
}
