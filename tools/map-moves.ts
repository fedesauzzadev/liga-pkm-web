// map-moves (SPEC-E/T-046) — propone `officialMove` (+ `fx`) para cada ataque sin
// mapeo de content/pokemon/** (_staging incluido, _errors excluido) y deja
// `officialMoveStatus:"proposed"`; sin candidato confiable ⇒ "unmapped" (cae al
// arquetipo, FX-ADAPTER §Mapeo). Matching determinista contra la tabla ES↔EN de
// T-045 (content/reference/pokeapi/moves.json, gitignored): nombre (exacto EN/ES,
// mismo set de tokens en otro orden, contención) + tokens del rawText + elemento
// vía typeToElement. La confirmación humana vive en /admin/cards (AC-2).
// Núcleo puro (patrón tools/pokeapi.ts) ⇒ testeable sin red; CLI gated por invokedDirectly.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MovesFileSchema, normalizeName, typeToElement, type MoveEntry } from '../packages/content/src/reference.ts'
import { PokemonFileSchema, type Element, type FxArchetype } from '../packages/content/src/cards.ts'

export interface MoveCounts {
  readonly verified: number
  readonly proposed: number
  readonly unmapped: number
}

export interface MapMovesRun {
  readonly ok: boolean
  readonly error: string | null
  /** Rutas relativas a contentDir de los archivos que se escribieron (o escribirían). */
  readonly changedFiles: readonly string[]
  readonly counts: MoveCounts
  readonly summary: readonly string[]
}

/** Ataque mínimo para proponer: nombre, texto y elemento (FX-ADAPTER §Mapeo). */
export interface AttackLike {
  readonly name: string
  readonly rawText: string
  readonly element: Element
}

// ── Puntuación determinista ─────────────────────────────────────────────────────
// 100: nombre exacto (EN o ES) · 90: mismos tokens en otro orden ("Doble bofetón"
// ↔ "Bofetón doble") · 70: contención (len ≥ 4) · tokens compartidos (len ≥ 4,
// nombre+rawText vs nombre EN+ES): 15 c/u, tope 60. Propone sii base ≥ 70, o
// base ≥ 40 con elemento que casa (el elemento nunca alcanza solo). Empates por id.
const words = (s: string): ReadonlySet<string> =>
  new Set(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])

function baseScore(attack: AttackLike, move: MoveEntry): number {
  const nName = normalizeName(attack.name)
  const nEs = normalizeName(move.nameEs)
  const nEn = normalizeName(move.nameEn)
  if (nName.length > 0 && (nName === nEs || nName === nEn)) return 100
  const wName = words(attack.name)
  const wEs = words(move.nameEs)
  const wEn = words(move.nameEn)
  const sameTokens = (target: ReadonlySet<string>): boolean =>
    wName.size > 0 && wName.size === target.size && [...wName].every((w) => target.has(w))
  if (sameTokens(wEs) || sameTokens(wEn)) return 90
  const longEnough = nName.length >= 4 && (nEs.length >= 4 || nEn.length >= 4)
  if (longEnough && (nName.includes(nEs) || nEs.includes(nName) || nName.includes(nEn) || nEn.includes(nName))) return 70
  const wMove = new Set([...wEs, ...wEn])
  let shared = 0
  for (const w of words(`${attack.name} ${attack.rawText}`)) {
    if (wMove.has(w)) shared += 1
  }
  return Math.min(60, shared * 15)
}

/** Mejor candidato para un ataque; null si nada llega al umbral. */
export function proposeForAttack(
  attack: AttackLike,
  moves: readonly MoveEntry[],
): { move: MoveEntry; base: number } | null {
  let best: { move: MoveEntry; base: number } | null = null
  for (const move of moves) {
    const base = baseScore(attack, move)
    if (base < 70 && typeToElement(move.type) !== attack.element) continue
    if (base < 40) continue
    if (
      best === null ||
      base > best.base ||
      (base === best.base && move.id.localeCompare(best.move.id) < 0)
    ) {
      best = { move, base }
    }
  }
  return best
}

// ── fx propuesto: arquetipo por elemento del movimiento ─────────────────────────
// Espejo de defaultFxByElement (apps/web/src/fx/archetypes.ts), que no es
// importable desde tools (web no es dependencia de nadie, SDD §3).
const FX_BY_ELEMENT: Readonly<Record<Element, FxArchetype>> = {
  normal: 'contact',
  fire: 'flame',
  water: 'water',
  grass: 'leaves',
  electric: 'electric',
  psychic: 'psychic',
  fighting: 'contact',
  poison: 'poison',
  ground: 'quake',
  flying: 'wind',
  bug: 'contact',
  ghost: 'ghost',
  ice: 'ice',
  rock: 'quake',
  dragon: 'beam',
}

function fxForMove(move: MoveEntry): FxArchetype {
  return FX_BY_ELEMENT[typeToElement(move.type) ?? 'normal']
}

// ── Recorrido de archivos (determinista: orden alfabético) ─────────────────────
function listPokemonFiles(contentDir: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '_errors') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.json')) out.push(full)
    }
  }
  walk(join(contentDir, 'pokemon'))
  return out.sort()
}

const ZERO: MoveCounts = { verified: 0, proposed: 0, unmapped: 0 }

// ── Núcleo (AC-1 + AC-3): propone, escribe (indent 1 como admin/server.ts) e informa.
export function mapMoves(opts: { contentDir: string; dryRun?: boolean }): MapMovesRun {
  let movesRaw: unknown
  try {
    movesRaw = JSON.parse(readFileSync(join(opts.contentDir, 'reference', 'pokeapi', 'moves.json'), 'utf8'))
  } catch {
    return {
      ok: false,
      error: 'falta o no parsea content/reference/pokeapi/moves.json — corré pnpm pokeapi',
      changedFiles: [],
      counts: ZERO,
      summary: [],
    }
  }
  const parsedMoves = MovesFileSchema.safeParse(movesRaw)
  if (!parsedMoves.success) {
    const first = parsedMoves.error.issues[0]
    return {
      ok: false,
      error: `moves.json inválido: ${first !== undefined ? `${first.path.join('.')}: ${first.message}` : 'esquema'}`,
      changedFiles: [],
      counts: ZERO,
      summary: [],
    }
  }
  const moves = parsedMoves.data.moves

  let files = 0
  let total = 0
  const counts = { verified: 0, proposed: 0, unmapped: 0 }
  const changedFiles: string[] = []
  const summary: string[] = []

  for (const file of listPokemonFiles(opts.contentDir)) {
    files += 1
    let doc: unknown
    try {
      doc = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      summary.push(`WARN ${file}: JSON roto, se saltea`)
      continue
    }
    const parsed = PokemonFileSchema.safeParse(doc)
    if (!parsed.success) {
      summary.push(`WARN ${file}: esquema inválido, se saltea`)
      continue
    }
    let changed = false
    for (const card of parsed.data.cards) {
      for (const atk of card.attacks) {
        if (atk.officialMove === undefined || atk.officialMoveStatus === 'unmapped') {
          const proposal = proposeForAttack({ name: atk.name, rawText: atk.rawText, element: atk.element }, moves)
          if (proposal !== null) {
            atk.officialMove = proposal.move.id
            atk.officialMoveStatus = 'proposed'
            if (atk.fx === undefined) atk.fx = fxForMove(proposal.move)
            changed = true
          } else if (atk.officialMove === undefined && atk.officialMoveStatus !== 'unmapped') {
            atk.officialMoveStatus = 'unmapped'
            changed = true
          }
        }
        if (atk.officialMoveStatus === 'verified') counts.verified += 1
        else if (atk.officialMove === undefined || atk.officialMoveStatus === 'unmapped') counts.unmapped += 1
        else counts.proposed += 1
        total += 1
      }
    }
    if (changed) {
      changedFiles.push(relative(opts.contentDir, file).split(sep).join('/'))
      if (opts.dryRun !== true) writeFileSync(file, `${JSON.stringify(parsed.data, null, 1)}\n`, 'utf8')
    }
  }

  if (files === 0) summary.push('WARN no se encontraron archivos en content/pokemon')
  summary.push(`informe: ${counts.verified} verificado(s) · ${counts.proposed} propuesto(s) · ${counts.unmapped} sin mapear (${total} ataques en ${files} archivo(s))`)
  return { ok: true, error: null, changedFiles, counts, summary }
}

// ── CLI: pnpm map-moves [--dir content] [--dry-run] ─────────────────────────────
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const USAGE = 'uso: pnpm map-moves [--dir content] [--dry-run]'

function cli(argv: readonly string[]): number {
  let dir = join(repoRoot, 'content')
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--dir' && value !== undefined) {
      dir = value
      i += 1
    } else {
      console.error(`map-moves: argumento desconocido "${arg ?? ''}"\n${USAGE}`)
      return 2
    }
  }
  const run = mapMoves({ contentDir: dir, dryRun })
  for (const line of run.summary) console.log(line)
  if (run.changedFiles.length > 0) {
    for (const f of run.changedFiles) console.log(`  actualizado: ${f}${dryRun ? ' (dry-run)' : ''}`)
  }
  if (!run.ok) {
    console.error(`map-moves: ${run.error ?? 'error'}`)
    return 1
  }
  return 0
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  process.exitCode = cli(process.argv.slice(2))
}
