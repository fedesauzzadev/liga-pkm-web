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
import {
  DecksFileSchema,
  DeckListSchema,
  crossCheckDecks,
  deckTotals,
  type DeckList,
  type DecksFile,
  type DeckTotal,
} from './decks.ts'
import { EnergyFileSchema, type EnergyFile } from './energy.ts'
import { GymsFileSchema, gymsToList, type GymLeader } from './gyms.ts'
import { HouseEditsFileSchema } from './house-edits.ts'
import { crossCheckCamera, crossCheckCardModal, crossCheckLayout, CardModalSchema, UiCameraSchema, UiLayoutSchema } from './ui.ts'
import { crossCheckEncounterPopup, EncounterPopupSchema } from './encounter-popup.ts'
import { CardArtSchema } from './card-art.ts'
import { crossCheckDecor, DecorSchema, type Decor } from './decor.ts'
import { crossCheckDecorCollision, DecorCollisionSchema } from './decor-collision.ts'
import { BoardStyleSchema, crossCheckStyle } from './style.ts'
import {
  crossCheckModels,
  crossCheckModelsNew,
  HgssWishlistSchema,
  ModelsCatalogSchema,
  ModelsManifestSchema,
  ModelsNewFileSchema,
  type ModelsCatalog,
  type ModelsManifest,
} from './models.ts'
import { applyHouseEdits, type HouseEditSource } from './apply-house-edits.ts'
import { checkOfficialMoves, crossCheckGyms } from './cross-checks.ts'

export { checkOfficialMoves, crossCheckGyms }
import { checkReferenceFiles } from './reference.ts'

/** Ubicación de los líderes: content/gyms.json (SPEC-F/T-002b AC-5). El nombre
 * reservado dentro de content/pokemon/ quedó obsoleto y se rechaza. */
export const GYMS_FILE_NAME = 'gyms.json'
export const HOUSE_EDITS_DIR = 'house-edits'

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
  /** Totales por mazo de terreno (AC-4: los imprime content:validate). */
  decks?: readonly DeckTotal[]
}

export interface ValidationReport {
  ok: boolean
  errors: string[]
  warnings: string[]
  stats: ValidationStats
}

export interface Content {
  ruleset: Ruleset
  board: BoardGraph
  cards: PokemonCard[]
  pendingEvos: string[]
  items: Item[]
  /** Mazos de desarrollo (decks.dev.json); null si no existe. */
  decks: DeckList | null
  /** Composición confirmada (decks.json): energías/ítems + listas pokemon. */
  deckComposition: DecksFile | null
  /** Tipos de energía (energy.json). */
  energy: EnergyFile
  /** Líderes de content/gyms.json (AC-5). */
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

/** Errores de un archivo de ediciones con el id de la edición (T-048/AC-3):
 * el path `edits.<i>.…` se resuelve al `id` de esa edición en el doc crudo. */
function houseEditIssues(relPath: string, error: ZodError, raw: unknown): string[] {
  return error.issues.map((issue) => {
    const idx = issue.path[0] === 'edits' && typeof issue.path[1] === 'number' ? issue.path[1] : null
    const editId = idx !== null ? valueAt(raw, ['edits', idx, 'id']) : null
    const where = typeof editId === 'string' ? `${relPath}#${editId}` : relPath
    const at = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${where}: ${at}${issue.message}`
  })
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

// ── Costos vs energy.json (plan costo-normal-any/AC-2): cada slot de costo
// debe ser 'any' o un elemento con carta de energía. 'normal' y 'dragon' no
// tienen carta (D-24): el círculo gris "cualquier energía" se escribe 'any'.
export function crossCheckCosts(
  files: readonly PokemonFileLoaded[],
  energy: EnergyFile,
): string[] {
  const noCard = new Set(energy.types.filter((type) => !type.energyCard).map((type) => type.id))
  const errors: string[] = []
  for (const f of files) {
    for (const card of f.cards) {
      for (const atk of card.attacks) {
        for (const slot of new Set(atk.cost)) {
          if (slot !== 'any' && noCard.has(slot)) {
            errors.push(
              `${f.file}#${card.id}: el costo de "${atk.name}" usa "${slot}", que no tiene carta de energía (D-24): usá "any"`,
            )
          }
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
      // SPEC-F/T-002b AC-5: los líderes viven en content/gyms.json.
      if (Object.keys(b.data.gyms).length > 0) {
        warnings.push(
          'content/board/kanto.json: bloque "gyms" obsoleto: se ignora (líderes en content/gyms.json)',
        )
      }
      stats.board = {
        nodes: b.data.nodes.length,
        edges: b.data.edges.length,
        status: b.data.meta.status,
        connected: boardFacts(b.data).connected,
      }
    }
  }

  const pokemonFiles: PokemonFileLoaded[] = []
  const pokemonDir = join(contentDir, 'pokemon')
  if (existsSync(pokemonDir)) {
    for (const entry of readdirSync(pokemonDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      if (entry.name === GYMS_FILE_NAME) {
        errors.push(`content/pokemon/${GYMS_FILE_NAME}: obsoleto: los líderes viven en content/${GYMS_FILE_NAME}`)
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

  // Triage de customs (plan triage-customs/AC-5): _staging (extracción sin
  // revisar) también cuenta — los customs deben mapearse a primitivas o cubrirse
  // con un ER. No se valida el esquema completo ahí (avisan, no bloquean).
  // Excepción (SPEC-S/T-102e): los archivos del lector (fromScanner) son
  // pre-revisión: sus customs se listan en scan-reports/report.html y recién
  // cuentan cuando el dueño los cura (al guardarlos pierden la marca).
  const stagingDir = join(pokemonDir, '_staging')
  if (existsSync(stagingDir)) {
    for (const entry of readdirSync(stagingDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const raw = readJson(join('pokemon', '_staging', entry.name))
      if (raw === undefined || raw === null) continue
      const parsed = PokemonFileSchema.safeParse(raw)
      const fromScanner = (raw as { fromScanner?: unknown }).fromScanner === true
      if (parsed.success && !fromScanner) stats.customEffects += countCustomEffects(parsed.data.cards)
      else if (!parsed.success) warnings.push(`content/pokemon/_staging/${entry.name}: esquema inválido (pre-revisión) — customs sin contar`)
    }
  }

  const itemsRaw = readJson('items.json')
  let items: Item[] = []
  if (itemsRaw !== undefined && itemsRaw !== null) {
    const i = ItemsFileSchema.safeParse(itemsRaw)
    if (!i.success) errors.push(...formatIssues('content/items.json', i.error))
    else items = i.data.items
  }

  // Mazos: real (decks.json, confirmado) + desarrollo (decks.dev.json, T-044).
  let deckComposition: DecksFile | null = null
  const decksRaw = readJson('decks.json')
  if (decksRaw !== undefined && decksRaw !== null) {
    const d = DecksFileSchema.safeParse(decksRaw)
    if (!d.success) errors.push(...formatIssues('content/decks.json', d.error))
    else deckComposition = d.data
  }
  let decks: DeckList | null = null
  const devRaw = readJson('decks.dev.json')
  if (devRaw !== undefined && devRaw !== null) {
    const d = DeckListSchema.safeParse(devRaw)
    if (!d.success) errors.push(...formatIssues('content/decks.dev.json', d.error))
    else decks = d.data
  }

  const energyRaw = readJson('energy.json')
  let energy: EnergyFile | null = null
  if (energyRaw === undefined) errors.push('falta content/energy.json (SPEC-F/T-002b)')
  else if (energyRaw !== null) {
    const e = EnergyFileSchema.safeParse(energyRaw)
    if (!e.success) errors.push(...formatIssues('content/energy.json', e.error))
    else energy = e.data
  }
  // plan costo-normal-any/AC-2: slots de costo solo con carta de energía o 'any'.
  if (energy !== null) errors.push(...crossCheckCosts(pokemonFiles, energy))

  // Líderes (AC-5): content/gyms.json.
  let gyms: readonly GymLeader[] = []
  const gymsRaw = readJson(GYMS_FILE_NAME)
  if (gymsRaw !== undefined && gymsRaw !== null) {
    const g = GymsFileSchema.safeParse(gymsRaw)
    if (!g.success) errors.push(...formatIssues(`content/${GYMS_FILE_NAME}`, g.error, gymsRaw))
    else gyms = gymsToList(g.data)
  }

  // Layout del HUD inmersivo (SPEC-I/T-071): esquema + chequeos de solapamiento.
  // Opcional (el motor no lo usa): si falta, warning; si está, debe validar.
  const layoutRaw = readJson(join('ui', 'layout.json'))
  if (layoutRaw === undefined) {
    warnings.push('falta content/ui/layout.json (SPEC-I/T-071): el HUD inmersivo no se valida')
  } else if (layoutRaw !== null) {
    const l = UiLayoutSchema.safeParse(layoutRaw)
    if (!l.success) errors.push(...formatIssues('content/ui/layout.json', l.error))
    else errors.push(...crossCheckLayout(l.data))
  }

  // Ventana de carta del Pokémon (SPEC-R/T-103): opcional para el motor, la
  // vista la exige; si está, debe validar.
  const cardModalRaw = readJson(join('ui', 'card-modal.json'))
  if (cardModalRaw === undefined) {
    warnings.push('falta content/ui/card-modal.json (SPEC-R/T-103): la carta grande no se valida')
  } else if (cardModalRaw !== null) {
    const m = CardModalSchema.safeParse(cardModalRaw)
    if (!m.success) errors.push(...formatIssues('content/ui/card-modal.json', m.error))
    else errors.push(...crossCheckCardModal(m.data))
  }

  // Normalización del sprite en la carta (SPEC-U/T-105): opcional para el
  // motor, la vista la exige; si está, debe validar.
  const cardArtRaw = readJson(join('ui', 'card-art.json'))
  if (cardArtRaw === undefined) {
    warnings.push('falta content/ui/card-art.json (SPEC-U/T-105): el ajuste del sprite no se valida')
  } else if (cardArtRaw !== null) {
    const a = CardArtSchema.safeParse(cardArtRaw)
    if (!a.success) errors.push(...formatIssues('content/ui/card-art.json', a.error))
  }

  // Popup de encuentro salvaje (plan unificar-popup-encuentro): opcional para
  // el motor, la vista lo exige; si está, debe validar.
  const encounterRaw = readJson(join('ui', 'encounter-popup.json'))
  if (encounterRaw === undefined) {
    warnings.push('falta content/ui/encounter-popup.json: el popup de encuentro no se valida')
  } else if (encounterRaw !== null) {
    const e = EncounterPopupSchema.safeParse(encounterRaw)
    if (!e.success) errors.push(...formatIssues('content/ui/encounter-popup.json', e.error))
    else errors.push(...crossCheckEncounterPopup(e.data))
  }

  // Presets de cámara inmersiva (SPEC-I/T-076): opcionales para el motor, la
  // vista 3D los exige; si están, deben validar.
  const cameraUiRaw = readJson(join('ui', 'camera.json'))
  if (cameraUiRaw === undefined) {
    warnings.push('falta content/ui/camera.json (SPEC-I/T-076): la cámara inmersiva no se valida')
  } else if (cameraUiRaw !== null) {
    const c = UiCameraSchema.safeParse(cameraUiRaw)
    if (!c.success) errors.push(...formatIssues('content/ui/camera.json', c.error))
    else errors.push(...crossCheckCamera(c.data))
  }

  // Decoración del mundo continuo (SPEC-H/T-068): opcional para el motor, la
  // vista 3D la exige; si está, debe validar. El look del mundo (terreno,
  // biomas, horizonte, cielo, niebla) vive en style.json desde T-079.
  const decorRaw = readJson(join('board', 'decor.json'))
  let decorData: Decor | null = null
  if (decorRaw === undefined) {
    warnings.push('falta content/board/decor.json (SPEC-H/T-068): la decoración no se valida')
  } else if (decorRaw !== null) {
    const d = DecorSchema.safeParse(decorRaw)
    if (!d.success) errors.push(...formatIssues('content/board/decor.json', d.error))
    else {
      decorData = d.data
      errors.push(...crossCheckDecor(decorData))
    }
  }

  // Reglas de NO-solapamiento de la decoración (SPEC-O/T-095): decor.collision
  // es obligatorio si existe decor.json (el plan de ocupación lo consume).
  const collisionRaw = readJson(join('board', 'decor.collision.json'))
  if (collisionRaw === undefined) {
    if (decorData !== null) {
      errors.push('falta content/board/decor.collision.json (SPEC-O/T-095): sin reglas de ocupación')
    }
  } else if (collisionRaw !== null) {
    const c = DecorCollisionSchema.safeParse(collisionRaw)
    if (!c.success) errors.push(...formatIssues('content/board/decor.collision.json', c.error))
    else errors.push(...crossCheckDecorCollision(c.data, decorData ?? undefined))
  }

  // Look del mundo (SPEC-J): style.json manda sobre decor.json (T-079 migró
  // world/ambient/zones.*.ground; T-080 sumó lighting y profiles).
  const styleRaw = readJson(join('board', 'style.json'))
  if (styleRaw === undefined) {
    warnings.push('falta content/board/style.json (SPEC-J): el look del mundo no se valida')
  } else if (styleRaw !== null) {
    const s = BoardStyleSchema.safeParse(styleRaw)
    if (!s.success) errors.push(...formatIssues('content/board/style.json', s.error))
    else errors.push(...crossCheckStyle(s.data))
  }

  // Modelos externos (SPEC-K/T-070): wishlist siempre que exista; catálogo y
  // manifiesto son opcionales (los genera `pnpm models:scan|suggest`) pero si
  // están deben validar y cruzar entre sí.
  const wishlistRaw = readJson(join('board', 'models.hgss.wishlist.json'))
  if (wishlistRaw !== undefined && wishlistRaw !== null) {
    const w = HgssWishlistSchema.safeParse(wishlistRaw)
    if (!w.success) errors.push(...formatIssues('content/board/models.hgss.wishlist.json', w.error))
  }
  let modelsCatalog: ModelsCatalog | null = null
  const catalogRaw = readJson(join('board', 'models.catalog.json'))
  if (catalogRaw === undefined) {
    warnings.push('falta content/board/models.catalog.json (SPEC-K/T-070a): modelos sin catalogar')
  } else if (catalogRaw !== null) {
    const c = ModelsCatalogSchema.safeParse(catalogRaw)
    if (!c.success) errors.push(...formatIssues('content/board/models.catalog.json', c.error))
    else modelsCatalog = c.data
  }
  let manifestData: ModelsManifest | null = null
  const manifestRaw = readJson(join('board', 'models.manifest.json'))
  if (manifestRaw === undefined) {
    warnings.push('falta content/board/models.manifest.json (SPEC-K/T-070b): sin modelos sugeridos')
  } else if (manifestRaw !== null) {
    const m = ModelsManifestSchema.safeParse(manifestRaw)
    if (!m.success) errors.push(...formatIssues('content/board/models.manifest.json', m.error))
    else {
      manifestData = m.data
      errors.push(...crossCheckModels(m.data, modelsCatalog))
    }
  }

  // Modelos nuevos en uso (SPEC-O/T-094/AC-1): models.new.json es opcional;
  // si está, valida y cruza contra el manifiesto (los escribe models:use-new).
  const modelsNewRaw = readJson(join('board', 'models.new.json'))
  if (modelsNewRaw !== undefined && modelsNewRaw !== null) {
    const n = ModelsNewFileSchema.safeParse(modelsNewRaw)
    if (!n.success) errors.push(...formatIssues('content/board/models.new.json', n.error))
    else if (manifestData !== null) errors.push(...crossCheckModelsNew(n.data, manifestData))
  }

  // Ediciones de la casa (T-048): se valida el esquema y, con
  // ruleset.features.houseEdits, se aplican EN MEMORIA tras cargar las cartas
  // (orden alfabético por archivo, AC-1). Nunca se escriben los originales.
  const houseEditSources: HouseEditSource[] = []
  const editsDir = join(contentDir, HOUSE_EDITS_DIR)
  if (existsSync(editsDir)) {
    for (const entry of readdirSync(editsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const raw = readJson(join(HOUSE_EDITS_DIR, entry.name))
      if (raw === undefined || raw === null) continue
      const h = HouseEditsFileSchema.safeParse(raw)
      if (!h.success) errors.push(...houseEditIssues(`content/${HOUSE_EDITS_DIR}/${entry.name}`, h.error, raw))
      else if (h.data.enabled) {
        houseEditSources.push({ file: `content/${HOUSE_EDITS_DIR}/${entry.name}`, doc: h.data })
      }
    }
  }

  // Chequeos cruzados de mazos ↔ energía (SPEC-F/T-002b AC-3/AC-4).
  if (deckComposition !== null && energy !== null) {
    const check = crossCheckDecks(deckComposition, energy)
    errors.push(...check.errors)
    warnings.push(...check.warnings)
    stats.decks = Object.values(deckTotals(deckComposition))
  }

  // T-045: referencia PokeAPI (gitignored, `pnpm pokeapi`); chequeos solo si existe.
  const ref = checkReferenceFiles((name) => readJson(join('reference', 'pokeapi', name)), pokemonFiles)
  errors.push(...ref.errors)
  warnings.push(...ref.warnings)
  if (ref.moves !== null) {
    const check = checkOfficialMoves(pokemonFiles, ref.moves)
    errors.push(...check.errors)
    warnings.push(...check.warnings)
  }

  const loadedCards = pokemonFiles.flatMap((f) => f.cards)
  const appliedEdits =
    ruleset !== null && ruleset.features.houseEdits
      ? applyHouseEdits(loadedCards, houseEditSources)
      : { cards: loadedCards, errors: [] as string[] }
  errors.push(...appliedEdits.errors)
  const cards = appliedEdits.cards
  stats.cards = cards.length
  stats.verifiedCards = cards.filter((c) => c.source.verified).length
  stats.unverifiedCards = cards.length - stats.verifiedCards
  // Canónico: se SUMA al conteo de _staging de arriba (AC-5: el total debe
  // igualar los ER pendientes; pisarlo escondería los customs de _staging).
  stats.customEffects += countCustomEffects(cards)
  if (gyms.length > 0 && board !== null) {
    errors.push(...crossCheckGyms(gyms, board, cards, [...new Set(pokemonFiles.flatMap((f) => f.pending))]))
  }

  const content: Content | null =
    ruleset !== null && board !== null && energy !== null && errors.length === 0
      ? {
          ruleset,
          board,
          cards,
          pendingEvos: [...new Set(pokemonFiles.flatMap((f) => f.pending))],
          items,
          decks,
          deckComposition,
          energy,
          gyms,
        }
      : null

  return { errors, warnings, stats, content }
}

export function validateContent(contentDir: string): ValidationReport {
  const { errors, warnings, stats } = collect(contentDir)
  return { ok: errors.length === 0, errors, warnings, stats }
}
