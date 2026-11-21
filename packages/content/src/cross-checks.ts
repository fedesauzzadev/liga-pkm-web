// Chequeos cruzados de gimnasios y mapeos oficiales (extraídos de validate.ts
// para respetar el límite de 400 líneas; SPEC-F/T-002b).
import type { PokemonCard } from './cards.ts'
import type { BoardGraph } from './board.ts'
import type { GymLeader } from './gyms.ts'
import type { PokemonFileLoaded } from './validate.ts'

/**
 * Chequeos cruzados de content/gyms.json (SPEC-F/T-002b AC-5): cada líder
 * tiene su nodo de gimnasio (y viceversa), los PKM de gimnasio apuntan a
 * líderes existentes con slots únicos y sin exceder `pokemonCount`; premio
 * PKM apunta a carta conocida (o pending).
 */
export function crossCheckGyms(
  gyms: readonly GymLeader[],
  board: BoardGraph,
  cards: readonly PokemonCard[],
  pending: readonly string[],
): string[] {
  const errors: string[] = []
  const allIds = new Set(cards.map((c) => c.id))
  const pendingSet = new Set(pending)
  const leaderIds = new Set(gyms.map((l) => l.id))

  for (const leader of gyms) {
    const team = cards.filter((c) => c.gym?.leader === leader.id)
    const slots = team.map((c) => c.gym?.slot ?? 0)
    if (team.length > leader.pokemonCount) {
      errors.push(
        `content/gyms.json: "${leader.id}" tiene ${team.length} PKM con gym.leader, declaró ${leader.pokemonCount}`,
      )
    }
    if (new Set(slots).size !== slots.length) {
      errors.push(`content/gyms.json: "${leader.id}" tiene slots de gimnasio repetidos (${slots.join(', ')})`)
    }
    if ('card' in leader.prize && !allIds.has(leader.prize.card) && !pendingSet.has(leader.prize.card)) {
      errors.push(`content/gyms.json: premio PKM "${leader.prize.card}" de "${leader.id}" no existe ni está en pending`)
    }
  }
  const gymNodes = board.nodes.filter((n) => n.type === 'gym')
  for (const node of gymNodes) {
    if (node.gym === undefined) continue
    if (!leaderIds.has(node.gym)) {
      errors.push(`content/gyms.json: gimnasio "${node.gym}" del tablero sin líder`)
    }
  }
  for (const leader of gyms) {
    if (!gymNodes.some((n) => n.gym === leader.id)) {
      errors.push(`content/gyms.json: líder "${leader.id}" no tiene nodo de gimnasio en el tablero`)
    }
  }
  for (const card of cards) {
    if (card.gym !== undefined && !leaderIds.has(card.gym.leader)) {
      errors.push(`carta "${card.id}" marca al líder "${card.gym.leader}" que no está en gyms.json`)
    }
  }
  return errors
}

// ── Mapeos oficiales. Formato de moves.json: reference.ts (T-045).
function moveIds(moves: unknown): Set<string> | null {
  if (Array.isArray(moves)) {
    const out = new Set<string>()
    for (const m of moves) {
      if (typeof m === 'string') out.add(m)
      else if (typeof m === 'object' && m !== null) {
        const o = m as { id?: unknown; name?: unknown }
        if (typeof o.id === 'string') out.add(o.id)
        else if (typeof o.name === 'string') out.add(o.name)
      }
    }
    return out
  }
  if (typeof moves === 'object' && moves !== null) return new Set(Object.keys(moves))
  return null
}

export function checkOfficialMoves(
  files: PokemonFileLoaded[],
  moves: unknown,
): { errors: string[]; warnings: string[] } {
  const ids = moveIds(moves)
  const errors: string[] = []
  const warnings: string[] = []
  for (const f of files) {
    for (const card of f.cards) {
      for (const atk of card.attacks) {
        if (atk.officialMove !== undefined && ids !== null && !ids.has(atk.officialMove)) {
          errors.push(`${f.file}#${card.id}/${atk.id}: officialMove "${atk.officialMove}" no está en moves.json`)
        }
        if (atk.officialMove === undefined && atk.fx === undefined) {
          warnings.push(`${f.file}#${card.id}/${atk.id}: sin officialMove ni fx (usará arquetipo por elemento)`)
        }
      }
    }
  }
  return { errors, warnings }
}
