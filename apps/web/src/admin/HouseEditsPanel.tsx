// SPEC-F/T-048/AC-4 — panel de ediciones de la casa en /admin/cards: activar/
// desactivar cada archivo de content/house-edits/ (persiste `enabled` vía la
// API dev de T-040) y diff original vs. editada lado a lado por carta con
// ediciones activas. Usa la MISMA función pura que el loader (applyHouseEdits).
import { useEffect, useMemo, useState } from 'react'
import {
  HouseEditsFileSchema,
  PokemonCardSchema,
  applyHouseEdits,
  type HouseEditSource,
  type PokemonCard,
} from '@liga/content'
import { es } from '../i18n/es'
import { gameContent } from '../game/content'
import {
  fetchAdminCards,
  fetchAdminHouseEdits,
  setAdminHouseEditEnabled,
  type AdminSnapshot,
  type HouseEditsSnapshot,
} from './api.ts'
import styles from './cards-admin.module.css'

export interface HouseEditsPanelProps {
  /** Snapshot de ediciones (tests/SSR); sin él se fetchea la API dev. */
  readonly edits?: HouseEditsSnapshot
  /** Snapshot de cartas originales (tests/SSR); sin él se fetchea la API dev. */
  readonly cards?: AdminSnapshot
}

interface EditMeta {
  readonly file: string
  readonly id: string
  readonly reason: string | null
}

interface DiffRow {
  readonly target: string
  readonly edits: readonly EditMeta[]
  readonly original: PokemonCard | null
  readonly edited: PokemonCard | null
  readonly error: string | null
}

const cardJson = (card: PokemonCard): string => JSON.stringify(card, null, 1)

/** Fuentes activas (enabled + features.houseEdits) ya parseadas, en orden. */
function activeSources(snapshot: HouseEditsSnapshot): HouseEditSource[] {
  if (!gameContent.ruleset.features.houseEdits) return []
  const sources: HouseEditSource[] = []
  for (const entry of snapshot.files) {
    if (entry.error !== null || !entry.enabled) continue
    const parsed = HouseEditsFileSchema.safeParse(entry.doc)
    if (parsed.success) sources.push({ file: entry.file, doc: parsed.data })
  }
  return sources
}

export function HouseEditsPanel({ edits, cards }: HouseEditsPanelProps) {
  const [editsSnap, setEditsSnap] = useState<HouseEditsSnapshot | null>(edits ?? null)
  const [cardsSnap, setCardsSnap] = useState<AdminSnapshot | null>(cards ?? null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (edits !== undefined && cards !== undefined) return
    void (async () => {
      try {
        if (edits === undefined) setEditsSnap(await fetchAdminHouseEdits())
        if (cards === undefined) setCardsSnap(await fetchAdminCards())
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [edits, cards])

  const originals = useMemo(() => {
    const list: PokemonCard[] = []
    for (const file of cardsSnap?.files ?? []) {
      for (const entry of file.cards) {
        const parsed = PokemonCardSchema.safeParse(entry.raw)
        if (parsed.success) list.push(parsed.data)
      }
    }
    return list
  }, [cardsSnap])

  // Diff por carta: original vs. resultado encadenado de TODAS las ediciones
  // activas que la tocan (mismo orden y fusión que el loader).
  const rows = useMemo<DiffRow[]>(() => {
    if (editsSnap === null) return []
    const sources = activeSources(editsSnap)
    const targets: string[] = []
    for (const source of sources) {
      for (const edit of source.doc.edits) {
        if (!targets.includes(edit.target)) targets.push(edit.target)
      }
    }
    const rows: DiffRow[] = []
    for (const target of targets) {
      const touching: HouseEditSource[] = sources
        .map((s) => ({
          file: s.file,
          doc: { ...s.doc, edits: s.doc.edits.filter((e) => e.target === target) },
        }))
        .filter((s) => s.doc.edits.length > 0)
      const meta: EditMeta[] = []
      for (const s of touching) {
        for (const e of s.doc.edits) meta.push({ file: s.file, id: e.id, reason: e.reason ?? null })
      }
      const original = originals.find((card) => card.id === target) ?? null
      if (original === null) {
        rows.push({ target, edits: meta, original: null, edited: null, error: `la carta "${target}" no existe` })
        continue
      }
      const applied = applyHouseEdits([original], touching)
      rows.push({
        target,
        edits: meta,
        original,
        edited: applied.cards[0] ?? null,
        error: applied.errors.length > 0 ? applied.errors.join('\n') : null,
      })
    }
    return rows
  }, [editsSnap, originals])

  const toggle = async (file: string, enabled: boolean): Promise<void> => {
    try {
      await setAdminHouseEditEnabled(file, enabled)
      setEditsSnap((prev) =>
        prev === null
          ? prev
          : { files: prev.files.map((f) => (f.file === file ? { ...f, enabled } : f)) },
      )
      setStatus(es.adminHouseEditsSaved)
    } catch (err) {
      setStatus(`${es.adminSaveFailed}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (editsSnap === null || cardsSnap === null) {
    return (
      <section className={styles.checks} aria-label={es.adminHouseEditsTitle}>
        <h2 className={styles.subtitle}>{es.adminHouseEditsTitle}</h2>
        <p className={styles.hint}>{error === null ? es.loading : `${es.errorTitle}: ${error}`}</p>
      </section>
    )
  }

  return (
    <section className={styles.checks} aria-label={es.adminHouseEditsTitle}>
      <h2 className={styles.subtitle}>{es.adminHouseEditsTitle}</h2>
      {!gameContent.ruleset.features.houseEdits && (
        <p className={styles.hint}>{es.adminHouseEditsFeatureOff}</p>
      )}
      <ul className={styles.editFiles}>
        {editsSnap.files.map((f) => (
          <li key={f.file}>
            <span>{f.file}</span>
            {f.error !== null ? (
              <span className={styles.flagBad}>{f.error}</span>
            ) : (
              <>
                <span className={f.enabled ? styles.flag : styles.flagWarn}>
                  {f.enabled ? es.adminHouseEditsEnabled : es.adminHouseEditsDisabled}
                </span>
                <button
                  type="button"
                  className={styles.mini}
                  aria-pressed={f.enabled}
                  onClick={() => void toggle(f.file, !f.enabled)}
                >
                  {f.enabled ? es.adminHouseEditsDisable : es.adminHouseEditsEnable}
                </button>
              </>
            )}
          </li>
        ))}
        {editsSnap.files.length === 0 && <li className={styles.hint}>{es.adminHouseEditsNoActive}</li>}
      </ul>
      <span className={styles.hint} role="status">{status}</span>

      {rows.length === 0 ? (
        editsSnap.files.length > 0 && <p className={styles.hint}>{es.adminHouseEditsNoActive}</p>
      ) : (
        rows.map((row) => (
          <div key={row.target} className={styles.editDiff}>
            <p className={styles.editHead}>
              <strong>{row.target}</strong>
              {row.edits.map((edit) => ` · ${edit.id} (${edit.file})${edit.reason === null ? '' : ` — ${edit.reason}`}`)}
            </p>
            {row.error !== null ? (
              <p className={styles.flagBad}>{row.error}</p>
            ) : row.original !== null && row.edited !== null ? (
              <div className={styles.diffColumns}>
                <div>
                  <p className={styles.fieldLabel}>{es.adminHouseEditsOriginal}</p>
                  <pre>{cardJson(row.original)}</pre>
                </div>
                <div>
                  <p className={styles.fieldLabel}>{es.adminHouseEditsEdited}</p>
                  <pre>{cardJson(row.edited)}</pre>
                </div>
              </div>
            ) : null}
          </div>
        ))
      )}
    </section>
  )
}
