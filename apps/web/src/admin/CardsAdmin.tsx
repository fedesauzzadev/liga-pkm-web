// SPEC-E/T-040 — página /admin/cards (solo dev): lista con filtros (AC-1), editor
// lado a lado con la foto (AC-2), guardado vía middleware de Vite (AC-3), chequeos
// cruzados (AC-4) y navegación por teclado para revisar ≥ 30 cartas/hora (AC-5).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PokemonCardSchema } from '@liga/content'
import type { MoveFxAttack } from '../fx/playMoveFx'
import { es } from '../i18n/es'
import { PkmCard } from '../battle/PkmCard'
import { spriteUrl, useSprites } from '../battle/sprites'
import { deleteAdminFile, fetchAdminCards, photoUrl, promoteVerifiedCard, saveAdminFile, type AdminSnapshot } from './api.ts'
import { CardEditor } from './CardEditor.tsx'
import { FxPreview } from './FxPreview.tsx'
import { adminCrossChecks } from './crossChecks.ts'
import {
  addCard, applyFilter, cloneDraft, flattenCards, getObj, getStr, markVerified, moveFxAttackOf,
  neighborKeyAfterRemove, newCardDraft, removeCard, stepIndex, validTargetFile, validateCardDraft,
  adminKeyAction,
  type AdminFilter, type Draft,
} from './draft.ts'
import { deletePokemonForever } from './deleteFlow.ts'
import styles from './cards-admin.module.css'

const FILTERS: readonly AdminFilter[] = ['all', 'unverified', 'custom', 'errors']
const ZOOMS = [1, 1.5, 2, 3] as const

function filterLabel(f: AdminFilter): string {
  switch (f) {
    case 'all': return es.adminFilterAll
    case 'unverified': return es.adminFilterUnverified
    case 'custom': return es.adminFilterCustom
    case 'errors': return es.adminFilterErrors
  }
}

/** Doc editable de un archivo válido (clonado del server). */
function docOf(file: { readonly doc: unknown; readonly fileError: string | null }): Draft | null {
  return file.fileError === null ? cloneDraft(file.doc) : null
}

export function CardsAdmin({ initial }: { readonly initial?: AdminSnapshot }) {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(initial ?? null)
  const [error, setError] = useState<string | null>(null)
  const [docs, setDocs] = useState<Map<string, Draft>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<AdminFilter>('all')
  const [status, setStatus] = useState('')
  const [zoomIdx, setZoomIdx] = useState(0)
  const [preview, setPreview] = useState<{ attack: MoveFxAttack; name: string; dex: number | null; trigger: number } | null>(null)
  // Carga manual: archivo destino para "Agregar pokemon" (null = el de la carta
  // seleccionada; '__new__' = nombre nuevo) y key de la carta recién agregada.
  const [target, setTarget] = useState<string | null>(null)
  const [newFile, setNewFile] = useState('content/pokemon/_staging/carga-manual.json')
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const docsRef = useRef(docs)
  docsRef.current = docs

  useEffect(() => {
    if (initial !== undefined) return
    void (async () => {
      try {
        const snap = await fetchAdminCards()
        setSnapshot(snap)
        setDocs(docsFrom(snap))
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [initial])

  const effective = useMemo<AdminSnapshot>(() => {
    if (snapshot === null) return { files: [] }
    return {
      files: snapshot.files.map((f) => {
        const doc = docs.get(f.file)
        if (f.fileError !== null || doc === undefined) return f
        const cards = Array.isArray(doc.cards) ? doc.cards : []
        return { ...f, cards: cards.map((raw) => ({ raw, id: idOf(raw) })) }
      }),
    }
  }, [snapshot, docs])

  const flat = useMemo(() => flattenCards(effective), [effective])
  const visible = useMemo(() => applyFilter(flat, filter), [flat, filter])
  const checks = useMemo(() => adminCrossChecks(effective), [effective])

  // Selección derivada (sin efecto): la primera visible mientras no se elija.
  const selectedKey = selected ?? visible[0]?.key ?? null
  const current = useMemo(() => flat.find((c) => c.key === selectedKey) ?? null, [flat, selectedKey])

  const patchCard = useCallback((file: string, index: number, next: Draft): void => {
    setDocs((prev) => {
      const doc = prev.get(file)
      if (doc === undefined) return prev
      const cards = Array.isArray(doc.cards) ? doc.cards : []
      const patched = { ...doc, cards: cards.map((c, i) => (i === index ? next : c)) }
      return new Map(prev).set(file, patched)
    })
  }, [])

  /** Recarga el snapshot del disco; conserva ediciones locales salvo en `drop`
   * (archivos cuyo estado del disco es la verdad: guardado, promote, borrado). */
  const reloadSnapshot = useCallback(async (drop: readonly string[]): Promise<void> => {
    try {
      const fresh = await fetchAdminCards()
      const next = docsFrom(fresh)
      for (const [key, local] of docsRef.current) {
        if (!drop.includes(key) && !next.has(key)) next.set(key, local)
      }
      setSnapshot(fresh)
      setDocs(next)
    } catch {
      // El guardado ya quedó; si la recarga falla, seguimos con el estado local.
    }
  }, [])

  /** AC: eliminar-carta-definitivo — PUT + recarga; null = guardado, string = error. */
  const persistDoc = useCallback(async (file: string, doc: Draft): Promise<string | null> => {
    try {
      await saveAdminFile(file, doc)
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
    await reloadSnapshot([file])
    return null
  }, [reloadSnapshot])

  const saveFile = useCallback(async (file: string, docOverride?: Draft): Promise<boolean> => {
    const doc = docOverride ?? docsRef.current.get(file)
    if (doc === undefined) return false
    const error = await persistDoc(file, doc)
    if (error !== null) {
      setStatus(`${es.adminSaveFailed}: ${error}`)
      return false
    }
    setStatus(es.adminSaved)
    return true
  }, [persistDoc])

  const moveSelection = useCallback(
    (delta: number): void => {
      const idx = visible.findIndex((c) => c.key === selectedKey)
      const nextIdx = stepIndex(idx === -1 ? 0 : idx, visible.length, delta)
      const next = visible[nextIdx]
      if (next !== undefined) setSelected(next.key)
    },
    [visible, selectedKey],
  )

  const verifyCurrent = useCallback(async (): Promise<void> => {
    if (current === null) return
    const verified = markVerified(current.draft)
    if (current.staging) {
      // verificar-promueve-carta/AC-1: staging ⇒ una sola acción deja la carta
      // verificada Y usable (promueve al canónico content/pokemon/<deck>.json).
      const doc = docsRef.current.get(current.file)
      if (doc === undefined) return
      const nextDoc = removeCard(doc, current.index)
      const neighbor = neighborKeyAfterRemove(visible, current.key)
      try {
        await promoteVerifiedCard(current.file, nextDoc, verified)
      } catch (err) {
        setStatus(`${es.adminSaveFailed}: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      await reloadSnapshot([current.file])
      setSelected(neighbor)
      setStatus(es.adminPromoted)
      return
    }
    // AC-3: canónica ⇒ source.verified=true + PUT al mismo archivo (no se mueve).
    patchCard(current.file, current.index, verified)
    if (await saveFile(current.file)) moveSelection(1)
  }, [current, patchCard, saveFile, moveSelection, visible, reloadSnapshot])

  // ── Carga manual (plan carga-manual-cartas) ──
  /** Destino efectivo del selector: sin elegir ⇒ archivo de la carta actual. */
  const targetValue = target ?? current?.file ?? '__new__'
  const editableFiles = useMemo(
    () => snapshot?.files.filter((f) => f.fileError === null) ?? [],
    [snapshot],
  )

  const addPokemon = useCallback((): void => {
    const raw = targetValue === '__new__' ? newFile.trim() : targetValue
    if (raw === '' || !validTargetFile(raw)) {
      setStatus(es.adminBadTarget)
      return
    }
    // Archivo existente pero no editable (JSON roto): no se puede agregar acá.
    const inSnapshot = (snapshot?.files ?? []).some((f) => f.file === raw)
    const existing = docsRef.current.get(raw)
    if (existing === undefined && inSnapshot) {
      setStatus(es.adminBadTarget)
      return
    }
    const card = newCardDraft()
    const count = existing !== undefined && Array.isArray(existing.cards) ? existing.cards.length : 0
    if (existing !== undefined) {
      setDocs(new Map(docsRef.current).set(raw, addCard(existing, card)))
    } else {
      // AC-4: archivo destino nuevo ⇒ entrada sintética en el snapshot; el
      // archivo real se crea recién al guardar (SAFE_NAME ya validado arriba).
      setSnapshot((prev) => ({
        files: [
          ...(prev ?? { files: [] }).files,
          { file: raw, staging: raw.startsWith('content/pokemon/_staging/'), fileError: null, pending: [], cards: [], doc: { cards: [] } },
        ],
      }))
      setDocs(new Map(docsRef.current).set(raw, { cards: [card] }))
    }
    const key = `${raw}#${count}`
    setSelected(key)
    setFocusKey(key)
    setStatus(es.adminAdded)
  }, [targetValue, newFile, snapshot])

  // AC: eliminar-carta-definitivo — el borrado es definitivo (persiste al
  // confirmar); la reversión y el error de guardado los maneja el flujo.
  // verificar-promueve-carta/AC-5 — la última carta borrada elimina el archivo.
  const deletePokemon = useCallback(async (): Promise<void> => {
    if (current === null) return
    await deletePokemonForever(
      { file: current.file, index: current.index, key: current.key, draft: current.draft },
      docsRef.current,
      visible,
      {
        confirmRemove: (message) => window.confirm(message),
        persist: persistDoc,
        deleteEmptyFile: async (file) => {
          try {
            await deleteAdminFile(file)
          } catch (err) {
            return err instanceof Error ? err.message : String(err)
          }
          await reloadSnapshot([file])
          return null
        },
        setDocs,
        setSelected,
        setStatus,
      },
    )
  }, [current, visible, persistDoc, reloadSnapshot])

  // El foco del editor recién agregado se consume al montar (autoFocus).
  useEffect(() => {
    if (focusKey !== null) setFocusKey(null)
  }, [focusKey])

  const runPreview = useCallback((attack: MoveFxAttack, name: string, dex: number | null): void => {
    setPreview((p) => ({ attack, name, dex, trigger: (p?.trigger ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = e.target instanceof Element ? e.target.tagName : ''
      const action = adminKeyAction(e.key, tag)
      if (action === null) return
      e.preventDefault()
      switch (action) {
        case 'next': moveSelection(1); break
        case 'prev': moveSelection(-1); break
        case 'save': if (current !== null) void saveFile(current.file); break
        case 'verify': void verifyCurrent(); break
        case 'zoomIn': setZoomIdx((i) => Math.min(i + 1, ZOOMS.length - 1)); break
        case 'zoomOut': setZoomIdx((i) => Math.max(i - 1, 0)); break
        case 'fx': {
          if (current === null) break
          const attacks = Array.isArray(current.draft.attacks) ? current.draft.attacks : []
          const atk = attacks[0]
          if (atk !== undefined && typeof atk === 'object' && atk !== null) {
            const dex = typeof current.draft.dex === 'number' ? current.draft.dex : null
            runPreview(moveFxAttackOf(atk as Draft), getStr(current.draft, 'name'), dex)
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moveSelection, saveFile, verifyCurrent, current, runPreview])

  const source = current === null ? null : getObj(current.draft, 'source')
  const photo = source === null ? null : getStr(source, 'photo')
  const validation = current === null ? null : validateCardDraft(current.draft)
  // Carta generada desde el draft (como se ve en el juego): PkmCard dibuja solo si
  // el dato valida contra el esquema; si no, se avisa y se corrige en el editor.
  // El arte es el sprite del manifest de `pnpm assets` (igual que en combate).
  const sprites = useSprites()
  const renderedCard = useMemo(() => {
    if (current === null) return null
    const check = PokemonCardSchema.safeParse(current.draft)
    return check.success ? check.data : null
  }, [current])
  if (snapshot === null) {
    return (
      <section className={styles.page}>
        <h1 className={styles.title}>{es.adminTitle}</h1>
        <p className={styles.hint}>{error === null ? es.loading : `${es.errorTitle}: ${error}`}</p>
        {error !== null && <button type="button" className={styles.mini} onClick={() => location.reload()}>{es.retry}</button>}
      </section>
    )
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{es.adminTitle}</h1>
        <div className={styles.filters} role="group" aria-label={es.adminFilterAll}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={filter === f ? `${styles.chip} ${styles.chipOn}` : styles.chip} onClick={() => setFilter(f)}>
              {`${filterLabel(f)} (${applyFilter(flat, f).length})`}
            </button>
          ))}
        </div>
        <span className={styles.status} role="status">{status}</span>
      </header>

      <div className={styles.manualBar}>
        <button type="button" className={styles.action} onClick={addPokemon}>{es.adminAddPokemon}</button>
        <button
          type="button"
          className={`${styles.action} ${styles.actionDanger}`}
          onClick={() => void deletePokemon()}
          disabled={current === null}
        >
          {es.adminDeletePokemon}
        </button>
        <label className={styles.targetSelect}>
          <span className={styles.fieldLabel}>{es.adminTargetFile}</span>
          <select value={targetValue} onChange={(e) => setTarget(e.target.value)}>
            {editableFiles.map((f) => (
              <option key={f.file} value={f.file}>{f.file}</option>
            ))}
            <option value="__new__">{es.adminTargetNew}</option>
          </select>
        </label>
        {targetValue === '__new__' && (
          <label className={styles.targetSelect}>
            <span className={styles.fieldLabel}>{es.adminTargetNewName}</span>
            <input value={newFile} onChange={(e) => setNewFile(e.target.value)} />
          </label>
        )}
      </div>

      <div className={styles.columns}>
        <ul className={styles.list} data-testid="admin-card-list">
          {visible.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                className={c.key === selectedKey ? `${styles.item} ${styles.itemOn}` : styles.item}
                onClick={() => setSelected(c.key)}
              >
                <span className={styles.itemName}>{labelOf(c.draft)}</span>
                <span className={styles.flags}>
                  {c.staging ? <span className={styles.flag}>{es.adminStagingBadge}</span> : null}
                  {c.unverified ? <span className={styles.flagWarn}>{es.adminFilterUnverified}</span> : null}
                  {c.custom ? <span className={styles.flag}>{es.adminFilterCustom}</span> : null}
                  {!c.valid ? <span className={styles.flagBad}>{es.adminFilterErrors}</span> : null}
                </span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className={styles.hint}>{es.adminNoCards}</li>}
        </ul>

        <aside className={styles.photoPanel} aria-label={es.adminPhotoTitle}>
          {photo !== null && photo !== '' ? (
            <div className={styles.photoWrap}>
              <img className={styles.photo} src={photoUrl(photo)} alt={es.adminPhotoTitle} style={{ transform: `scale(${ZOOMS[zoomIdx] ?? 1})` }} />
            </div>
          ) : (
            <p className={styles.hint}>{es.adminNoPhoto}</p>
          )}
          <div className={styles.zoomRow}>
            <button type="button" className={styles.mini} aria-label={es.adminZoomOut} onClick={() => setZoomIdx((i) => Math.max(i - 1, 0))}>−</button>
            <span>{`${ZOOMS[zoomIdx] ?? 1}×`}</span>
            <button type="button" className={styles.mini} aria-label={es.adminZoomIn} onClick={() => setZoomIdx((i) => Math.min(i + 1, ZOOMS.length - 1))}>+</button>
          </div>
          <div className={styles.cardWrap} aria-label={es.adminCardPreview}>
            <p className={styles.cardCaption}>{es.adminCardPreview}</p>
            {renderedCard !== null ? (
              <PkmCard
                card={renderedCard}
                damage={0}
                artUrl={spriteUrl(sprites?.sprites ?? null, renderedCard.dex, 'front')}
                mode="own"
              />
            ) : (
              <p className={styles.hint}>{es.adminCardInvalid}</p>
            )}
          </div>
        </aside>

        <div className={styles.editor}>
          {current !== null ? (
            <CardEditor
              key={current.key}
              file={current.file}
              draft={current.draft}
              valid={validation?.valid === true}
              errors={validation?.errors ?? []}
              autoFocusFirst={current.key === focusKey}
              onChange={(next) => patchCard(current.file, current.index, next)}
              onSave={() => void saveFile(current.file)}
              onVerify={() => void verifyCurrent()}
              onPreview={runPreview}
            />
          ) : (
            <p className={styles.hint}>{es.adminNoCards}</p>
          )}
        </div>
      </div>

      <section className={styles.checks} aria-label={es.adminChecksTitle}>
        <h2 className={styles.subtitle}>{es.adminChecksTitle}</h2>
        {checks.length === 0 ? (
          <p className={styles.hint}>{es.adminChecksOk}</p>
        ) : (
          <ul className={styles.checkList}>
            {checks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      {preview !== null && <FxPreview name={preview.name} dex={preview.dex} attack={preview.attack} trigger={preview.trigger} />}
      <p className={styles.hint}>{es.adminKeyboardHint}</p>
    </section>
  )
}

function docsFrom(snap: AdminSnapshot): Map<string, Draft> {
  const docs = new Map<string, Draft>()
  for (const f of snap.files) {
    const doc = docOf(f)
    if (doc !== null) docs.set(f.file, doc)
  }
  return docs
}

function idOf(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const id = (raw as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

function labelOf(draft: Draft): string {
  const name = getStr(draft, 'name') || getStr(draft, 'id') || '?'
  const dex = typeof draft.dex === 'number' ? `#${draft.dex} ` : ''
  return `${dex}${name}`
}
