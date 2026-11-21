// AC: eliminar-carta-definitivo — orquestación de "Eliminar pokemon" en
// /admin/cards: el borrado persiste al confirmar (PUT inmediato); si el
// guardado falla, la UI vuelve al estado del disco. Extraída de CardsAdmin
// para testear la reversión sin jsdom (patrón host inyectable del repo).
import { es } from '../i18n/es'
import { getStr, neighborKeyAfterRemove, removeCard, type Draft } from './draft'

/** Carta a borrar (datos de la selección actual que el flujo necesita). */
export interface DeleteTarget {
  readonly file: string
  readonly index: number
  readonly key: string
  readonly draft: Draft
}

/** Dependencias inyectadas: confirmación de usuario, persistencia y setters. */
export interface DeleteIo {
  readonly confirmRemove: (message: string) => boolean
  /** Persiste el doc; null = guardado, string = mensaje de error. */
  readonly persist: (file: string, doc: Draft) => Promise<string | null>
  /** verificar-promueve-carta/AC-5 — borra el archivo si quedó con 0 cartas;
   * null = borrado, string = mensaje de error. */
  readonly deleteEmptyFile: (file: string) => Promise<string | null>
  readonly setDocs: (docs: Map<string, Draft>) => void
  readonly setSelected: (key: string | null) => void
  readonly setStatus: (status: string) => void
}

/** AC-1/AC-2/AC-3 — borra la carta y la persiste; revierte si el disco manda otro estado. */
export async function deletePokemonForever(
  target: DeleteTarget,
  docs: Map<string, Draft>,
  visible: readonly { readonly key: string; readonly file: string; readonly index: number }[],
  io: DeleteIo,
): Promise<void> {
  const label = getStr(target.draft, 'name') || getStr(target.draft, 'id') || '?'
  if (!io.confirmRemove(`${es.adminDeleteConfirm} ${label}`)) return
  const doc = docs.get(target.file)
  if (doc === undefined) return
  const neighbor = neighborKeyAfterRemove(visible, target.key)
  // AC-1: borrado local + persistencia inmediata del doc sin la carta.
  const nextDoc = removeCard(doc, target.index)
  io.setDocs(new Map(docs).set(target.file, nextDoc))
  io.setSelected(neighbor)
  const error = await io.persist(target.file, nextDoc)
  if (error === null) {
    io.setStatus(es.adminDeleted)
    // verificar-promueve-carta/AC-5 — el doc quedó con 0 cartas ⇒ el archivo
    // se borra del disco (sin archivos vacíos re-apareciendo en la lista).
    const remaining = Array.isArray(nextDoc.cards) ? nextDoc.cards.length : 0
    if (remaining === 0) {
      const delError = await io.deleteEmptyFile(target.file)
      if (delError !== null) io.setStatus(`${es.adminSaveFailed}: ${delError}`)
    }
    return
  }
  // AC-2: el guardado falló ⇒ reversión al doc previo y error visible.
  io.setDocs(docs)
  io.setStatus(`${es.adminSaveFailed}: ${error}`)
}
