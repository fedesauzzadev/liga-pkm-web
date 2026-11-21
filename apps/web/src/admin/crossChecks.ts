// SPEC-E/T-040/AC-4 — chequeos cruzados visibles en /admin/cards (puros, cliente):
// evoluciones faltantes, dex duplicados y solapamiento de rollFaces
// (CARD-INGESTION §4). Solo cartas que validan contra el esquema participan.
import { PokemonCardSchema } from '@liga/content'
import type { AdminSnapshot } from './api.ts'

export interface CardCheckRef {
  readonly file: string
  readonly id: string
}

interface LoadedCard {
  readonly file: string
  readonly card: import('@liga/content').PokemonCard
}

function loadValidCards(snapshot: AdminSnapshot): LoadedCard[] {
  const out: LoadedCard[] = []
  for (const f of snapshot.files) {
    for (const entry of f.cards) {
      const parsed = PokemonCardSchema.safeParse(entry.raw)
      if (parsed.success) out.push({ file: f.file, card: parsed.data })
    }
  }
  return out
}

/** Todos los chequeos cruzados; cada problema es una línea legible. */
export function adminCrossChecks(snapshot: AdminSnapshot): string[] {
  const problems: string[] = []
  const cards = loadValidCards(snapshot)
  const pending = new Set(snapshot.files.flatMap((f) => [...f.pending]))

  // 1) Evoluciones: cada evolvesTo debe existir como carta o estar en pending.
  const known = new Set(cards.map((c) => c.card.id))
  for (const { file, card } of cards) {
    for (const evo of card.evolvesTo) {
      if (!known.has(evo.id) && !pending.has(evo.id)) {
        problems.push(`${file}#${card.id}: la evolución "${evo.id}" no existe ni está en pending`)
      }
    }
  }

  // 2) Dex duplicados (151 sin repetir cuando esté completo, SDD §6).
  const byDex = new Map<number, CardCheckRef[]>()
  for (const { file, card } of cards) {
    const list = byDex.get(card.dex) ?? []
    list.push({ file, id: card.id })
    byDex.set(card.dex, list)
  }
  for (const [dex, refs] of byDex) {
    if (refs.length > 1) {
      const where = refs.map((r) => `${r.file}#${r.id}`).join(', ')
      problems.push(`dex ${dex} duplicado en ${where}`)
    }
  }

  // 3) rollFaces: cada cara 1-6 en a lo sumo 1 ataque por carta (huecos = no ataca).
  for (const { file, card } of cards) {
    const faceToAttacks = new Map<number, string[]>()
    for (const atk of card.attacks) {
      for (const face of atk.rollFaces) {
        const list = faceToAttacks.get(face) ?? []
        list.push(atk.id)
        faceToAttacks.set(face, list)
      }
    }
    for (const [face, atks] of faceToAttacks) {
      if (atks.length > 1) {
        problems.push(`${file}#${card.id}: rollFaces se solapan en la cara ${face} (${atks.join(', ')})`)
      }
    }
  }

  return problems
}
