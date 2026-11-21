// verificar-promueve-carta/AC-4 — merge de los canónicos content/pokemon/*.json
// que carga el juego: parse tolerante (archivo inválido ⇒ error + salteo, la
// app no rompe — patrón house-edits), dedupe por id (gana el primero en orden
// alfabético) y `pending` concatenado de todos los archivos.
import { PokemonFileSchema, type PokemonCard } from '@liga/content'

export interface PokemonFileEntry {
  /** Etiqueta del archivo (p. ej. 'content/pokemon/_samples.json'). */
  readonly file: string
  readonly doc: unknown
}

export interface MergedPokemonFiles {
  readonly cards: readonly PokemonCard[]
  readonly pendingEvos: readonly string[]
  readonly errors: readonly string[]
}

/** AC-4 — merge tolerante de archivos de cartas en orden alfabético por nombre. */
export function mergePokemonFiles(entries: readonly PokemonFileEntry[]): MergedPokemonFiles {
  const sorted = [...entries].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  const cards: PokemonCard[] = []
  const ids = new Set<string>()
  const pending: string[] = []
  const errors: string[] = []
  for (const entry of sorted) {
    const parsed = PokemonFileSchema.safeParse(entry.doc)
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.map(String).join('.')}: ${i.message}`)
        .join('; ')
      errors.push(`${entry.file}: esquema inválido — ${detail}`)
      continue
    }
    for (const evo of parsed.data.pending ?? []) {
      if (!pending.includes(evo)) pending.push(evo)
    }
    for (const card of parsed.data.cards) {
      if (ids.has(card.id)) {
        errors.push(`${entry.file}: id duplicado "${card.id}" (ya cargado de un archivo anterior; se ignora)`)
        continue
      }
      ids.add(card.id)
      cards.push(card)
    }
  }
  return { cards, pendingEvos: pending, errors }
}
