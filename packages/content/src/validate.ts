// Validación de content/**: esquemas Zod + chequeos cruzados + warnings + stats.
// `content:validate` (CLI) y `loadContent` consumen esto. Solo para entornos Node.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ZodError } from 'zod'
import { PokemonFileSchema, type PokemonCard } from './cards.ts'
import { BoardGraphSchema, type BoardGraph, type BoardStatus } from './board.ts'
import { crossCheckBoard, boardFacts } from './board-checks.ts'
import { RulesetSchema, type Ruleset } from './ruleset.ts'
import { ItemsFileSchema, type Item } from './items.ts'
import { DeckListSchema, type DeckList } from './decks.ts'
import { GymsFileSchema, type GymLeader } from './gyms.ts'

/** Nombre reservado del archivo de líderes dentro de content/pokemon/ (T-023/AC-5). */
export const GYMS_FILE_NAME = 'gyms.json'

export interface PokemonFileLoaded {
  file: string
  cards: PokemonCard[]
  pending: string[]
}

export interface ValidationStats {
  files: number
  cards: number
  verifiedCards: number
  unverifiedCards: number
  customEffects: number
  board?: { nodes: number; edges: number; status: BoardStatus; connected: boolean }
}

export interface ValidationReport {
  ok: boolean
  errors: string[]
  warnings: string[]
  stats: ValidationStats
}

export interface Content {
  ruleset: import('./ruleset.ts').Ruleset
  board: BoardGraph
  cards: PokemonCard[]
  pendingEvos: string[]
  items: Item[]
  decks: DeckList | null
  /** Líderes de content/pokemon/gyms.json; vacío mientras el archivo no exista (T-023). */
  gyms: readonly GymLeader[]
}

// ── Formato de errores (AC-2): siempre con ruta relativa y, si aplica, id de carta.
function cardIdAt(raw: unknown, index: number): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const cards = (raw as { cards?: unknown }).cards
  if (!Array.isArray(cards)) return null
  const entry = cards[index]
  if (typeof entry !== 'object' || entry === null) return null
  const id = (entry as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

function valueAt(raw: unknown, path: readonly (string | number | symbol)[]): unknown {
  let cur: unknown = raw
  for (const key of path) {
    if (typeof key === 'symbol') return undefined
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export function formatIssues(relPath: string, error: ZodError, raw?: unknown): string[] {
  return error.issues.map((issue) => {
    const idx = issue.path[0] === 'cards' && typeof issue.path[1] === 'number' ? issue.path[1] : null
    const cardId = raw !== undefined && idx !== null ? cardIdAt(raw, idx) : null
    const where = cardId !== null ? `${relPath}#${cardId}` : relPath
    const at = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    let msg = issue.message
    // El error de unión discriminada no muestra el valor recibido; lo agregamos.
    if (msg.startsWith('Invalid discriminator value') && raw !== undefined) {
      const received = valueAt(raw, issue.path)
      if (received !== undefined) msg += ` — recibido: ${JSON.stringify(received)}`
    }
    return `${where}: ${at}${msg}`
  })
}

export function validatePokemonFile(
  relPath: string,
  raw: unknown,
): { schemaErrors: string[]; cards: PokemonCard[] | null; pending: string[] } {
  const parsed = PokemonFileSchema.safeParse(raw)
  if (!parsed.success) {
    return { schemaErrors: formatIssues(relPath, parsed.error, raw), cards: null, pending: [] }
  }
  return { schemaErrors: [], cards: parsed.data.cards, pending: parsed.data.pending ?? [] }
}

// ── Chequeos cruzados de cartas (AC-3).
export function crossCheckCards(files: PokemonFileLoaded[]): string[] {
  const errors: string[] = []
  const seen = new Map<string, string>()
  const allIds = new Set<string>()
  const pending = new Set(files.flatMap((f) => f.pending))
  for (const f of files) for (const c of f.cards) allIds.add(c.id)

  for (const f of files) {
    for (const card of f.cards) {
      const prev = seen.get(card.id)
      if (prev !== undefined) errors.push(`id de carta duplicado "${card.id}" (visto antes en ${prev})`)
      seen.set(card.id, f.file)

      for (const evo of card.evolvesTo) {
        if (!allIds.has(evo.id) && !pending.has(evo.id)) {
          errors.push(`${f.file}#${card.id}: evolvesTo "${evo.id}" no existe y no está en pending`)
        }
      }

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
          errors.push(`${f.file}#${card.id}: rollFaces se solapan en la cara ${face} (${atks.join(', ')})`)
        }
      }
    }
  }
  return errors
}

// ── Tablero: los chequeos (integridad + conectividad + conteos) viven en board-checks.ts.

// ── Efectos custom (AC-4): permitidos, pero contados (los consume el digest).
export function countCustomEffects(cards: PokemonCard[]): number {
  let n = 0
  for (const card of cards) {
    for (const atk of card.attacks) for (const e of atk.effects) if (e.op === 'custom') n++
    for (const s of card.specialties) if (s.op === 'custom') n++
  }
  return n
}

// ── Gimnasios (T-023/AC-5): líderes ↔ tablero ↔ cartas con gym:{leader,slot}. ──

/**
 * Chequeos cruzados del archivo de líderes (solo si gyms.json existe):
 * ids únicos y presentes en el tablero (y viceversa), equipo completo con slots
 * únicos según `ruleset.gymTeamSize` y premio PKM apuntando a una carta conocida.
 */
export function crossCheckGyms(
  gyms: readonly GymLeader[],
  board: BoardGraph,
  ruleset: Ruleset,
  cards: readonly PokemonCard[],
  pending: readonly string[],
): string[] {
  const errors: string[] = []
  const allIds = new Set(cards.map((c) => c.id))
  const pendingSet = new Set(pending)
  const seen = new Set<string>()
  for (const leader of gyms) {
    if (seen.has(leader.id)) errors.push(`gyms.json: líder duplicado "${leader.id}"`)
    seen.add(leader.id)
    if (!(leader.id in board.gyms)) {
      errors.push(`gyms.json: líder "${leader.id}" no está en board.gyms`)
      continue
    }
    const team = cards.filter((c) => c.gym?.leader === leader.id)
    const slots = team.map((c) => c.gym?.slot ?? 0)
    if (team.length !== ruleset.gymTeamSize) {
      errors.push(
        `gyms.json: "${leader.id}" tiene ${team.length} PKM con gym.leader, se esperaban ${ruleset.gymTeamSize}`,
      )
    }
    if (new Set(slots).size !== slots.length) {
      errors.push(`gyms.json: "${leader.id}" tiene slots de gimnasio repetidos (${slots.join(', ')})`)
    }
    if (leader.prize.kind === 'pkm' && !allIds.has(leader.prize.card) && !pendingSet.has(leader.prize.card)) {
      errors.push(`gyms.json: premio PKM "${leader.prize.card}" de "${leader.id}" no existe ni está en pending`)
    }
  }
  for (const gymKey of Object.keys(board.gyms)) {
    if (!seen.has(gymKey)) errors.push(`gyms.json: gimnasio "${gymKey}" del tablero sin líder`)
  }
  for (const card of cards) {
    if (card.gym !== undefined && !seen.has(card.gym.leader)) {
      errors.push(`carta "${card.id}" marca al líder "${card.gym.leader}" que no está en gyms.json`)
    }
  }
  return errors
}

// ── Mapeos oficiales (AC-6). Formato de moves.json tolerante (lo define T-045).
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

// ── Orquestación: lee content/** y valida todo.
export interface CollectResult {
  errors: string[]
  warnings: string[]
  stats: ValidationStats
  content: Content | null
}

export function collect(contentDir: string): CollectResult {
  const errors: string[] = []
  const warnings: string[] = []
  const stats: ValidationStats = {
    files: 0, cards: 0, verifiedCards: 0, unverifiedCards: 0, customEffects: 0,
  }

  const readJson = (rel: string): unknown | undefined => {
    const full = join(contentDir, rel)
    if (!existsSync(full)) return undefined
    stats.files++
    try {
      return JSON.parse(readFileSync(full, 'utf8')) as unknown
    } catch (err) {
      errors.push(`content/${rel}: JSON inválido — ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  const rulesetRaw = readJson('ruleset.classic.json')
  let ruleset: Content['ruleset'] | null = null
  if (rulesetRaw === undefined) errors.push('falta content/ruleset.classic.json')
  else {
    const r = RulesetSchema.safeParse(rulesetRaw)
    if (!r.success) errors.push(...formatIssues('content/ruleset.classic.json', r.error))
    else ruleset = r.data
  }

  const boardRaw = readJson(join('board', 'kanto.json'))
  let board: BoardGraph | null = null
  if (boardRaw === undefined) errors.push('falta content/board/kanto.json')
  else {
    const b = BoardGraphSchema.safeParse(boardRaw)
    if (!b.success) errors.push(...formatIssues('content/board/kanto.json', b.error))
    else {
      board = b.data
      const check = crossCheckBoard(b.data, 'content/board/kanto.json')
      errors.push(...check.errors)
      warnings.push(...check.warnings)
      stats.board = {
        nodes: b.data.nodes.length,
        edges: b.data.edges.length,
        status: b.data.meta.status,
        connected: boardFacts(b.data).connected,
      }
    }
  }

  const pokemonFiles: PokemonFileLoaded[] = []
  let gyms: readonly GymLeader[] = []
  const pokemonDir = join(contentDir, 'pokemon')
  if (existsSync(pokemonDir)) {
    for (const entry of readdirSync(pokemonDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      // gyms.json (T-023): líderes, no cartas; se valida con su propio esquema.
      if (entry.name === GYMS_FILE_NAME) {
        const raw = readJson(`pokemon/${entry.name}`)
        if (raw === null) continue
        const parsed = GymsFileSchema.safeParse(raw)
        if (!parsed.success) errors.push(...formatIssues('content/pokemon/gyms.json', parsed.error))
        else gyms = parsed.data.leaders
        continue
      }
      const rel = `content/pokemon/${entry.name}`
      const raw = readJson(`pokemon/${entry.name}`)
      if (raw === undefined || raw === null) continue
      const parsed = validatePokemonFile(rel, raw)
      errors.push(...parsed.schemaErrors)
      if (parsed.cards !== null) pokemonFiles.push({ file: rel, cards: parsed.cards, pending: parsed.pending })
    }
  }
  if (pokemonFiles.length === 0 && !errors.some((e) => e.startsWith('content/pokemon/'))) {
    errors.push('no hay archivos de cartas válidos en content/pokemon/')
  }
  errors.push(...crossCheckCards(pokemonFiles))

  const itemsRaw = readJson('items.json')
  let items: Item[] = []
  if (itemsRaw !== undefined && itemsRaw !== null) {
    const i = ItemsFileSchema.safeParse(itemsRaw)
    if (!i.success) errors.push(...formatIssues('content/items.json', i.error))
    else items = i.data.items
  }

  const decksRaw = readJson('decks.json')
  let decks: DeckList | null = null
  if (decksRaw !== undefined && decksRaw !== null) {
    const d = DeckListSchema.safeParse(decksRaw)
    if (!d.success) errors.push(...formatIssues('content/decks.json', d.error))
    else decks = d.data
  }

  const movesRaw = readJson(join('reference', 'pokeapi', 'moves.json'))
  if (movesRaw !== undefined && movesRaw !== null) {
    const check = checkOfficialMoves(pokemonFiles, movesRaw)
    errors.push(...check.errors)
    warnings.push(...check.warnings)
  }

  const cards = pokemonFiles.flatMap((f) => f.cards)
  stats.cards = cards.length
  stats.verifiedCards = cards.filter((c) => c.source.verified).length
  stats.unverifiedCards = cards.length - stats.verifiedCards
  stats.customEffects = countCustomEffects(cards)
  // T-023: los chequeos de líderes solo corren cuando gyms.json existe (AC-5).
  if (gyms.length > 0 && board !== null && ruleset !== null) {
    errors.push(...crossCheckGyms(gyms, board, ruleset, cards, [...new Set(pokemonFiles.flatMap((f) => f.pending))]))
  }

  const content: Content | null =
    ruleset !== null && board !== null && errors.length === 0
      ? {
          ruleset,
          board,
          cards,
          pendingEvos: [...new Set(pokemonFiles.flatMap((f) => f.pending))],
          items,
          decks,
          gyms,
        }
      : null

  return { errors, warnings, stats, content }
}

export function validateContent(contentDir: string): ValidationReport {
  const { errors, warnings, stats } = collect(contentDir)
  return { ok: errors.length === 0, errors, warnings, stats }
}
