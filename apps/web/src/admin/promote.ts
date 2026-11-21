// verificar-promueve-carta — lado servidor del promote y del borrado de
// archivos vacíos: helpers de escritura validada con Zod (extraídos de
// server.ts, que importa este módulo; nunca al revés). Igual que server.ts:
// usa node:fs, solo lo importa vite.config.ts y tests de Node (SDD §6).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PokemonCardSchema, PokemonFileSchema, type PokemonCard } from '@liga/content'

export class AdminSaveError extends Error {
  public readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// AC-1/AC-3 + borrar-abra-sin-verificar/AC-1: nombres planos sin traversal (sin
// '/', '\', ':' ni '..' inicial); `_` inicial permitido (`_samples.json`, misma
// política que houseEditFilePath).
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.json$/

/** Ruta absoluta si `file` es un destino permitido (pokemon/ o pokemon/_staging/). */
export function adminFilePath(contentDir: string, file: string): string | null {
  const prefixMain = 'content/pokemon/'
  const prefixStaging = 'content/pokemon/_staging/'
  let name: string | null = null
  let staging = false
  if (file.startsWith(prefixStaging)) {
    name = file.slice(prefixStaging.length)
    staging = true
  } else if (file.startsWith(prefixMain)) {
    name = file.slice(prefixMain.length)
  }
  if (name === null || name.includes('/') || name.includes('\\')) return null
  if (!SAFE_NAME.test(name) || name === 'gyms.json') return null
  return staging ? join(contentDir, 'pokemon', '_staging', name) : join(contentDir, 'pokemon', name)
}

/** Cartas oficiales (content/pokemon/*.json, sin _staging); los archivos que no
 * parsean se saltean (ya los reporta listAdminCards). */
export function loadOfficialCards(contentDir: string): PokemonCard[] {
  const dir = join(contentDir, 'pokemon')
  const cards: PokemonCard[] = []
  if (!existsSync(dir)) return cards
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'gyms.json') continue
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) as unknown
    } catch {
      continue
    }
    const parsed = PokemonFileSchema.safeParse(raw)
    if (parsed.success) cards.push(...parsed.data.cards)
  }
  return cards
}

function issueDetail(issues: readonly { path: (string | number | symbol)[]; message: string }[]): string {
  return issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join('; ')
}

/** AC-3 — guarda un doc completo (validado con el esquema) en un destino permitido. */
export function saveAdminFile(contentDir: string, file: string, doc: unknown): void {
  const target = adminFilePath(contentDir, file)
  if (target === null) throw new AdminSaveError(`destino no permitido: ${file}`)
  const parsed = PokemonFileSchema.safeParse(doc)
  if (!parsed.success) {
    throw new AdminSaveError(`esquema inválido — ${issueDetail(parsed.error.issues)}`)
  }
  mkdirSync(join(target, '..'), { recursive: true })
  const tmp = `${target}.tmp`
  writeFileSync(tmp, `${JSON.stringify(doc, null, 1)}\n`, 'utf8')
  renameSync(tmp, target)
}

/** AC-5 — borra un archivo de cartas que quedó con 0 cartas en disco (elimina
 * los vacíos para que no re-aparezcan en la lista); se niega si todavía tiene
 * cartas o si el archivo no valida/no existe. */
export function deleteAdminFileIfEmpty(contentDir: string, file: string): void {
  const target = adminFilePath(contentDir, file)
  if (target === null) throw new AdminSaveError(`destino no permitido: ${file}`)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(target, 'utf8')) as unknown
  } catch (err) {
    throw new AdminSaveError(`${file} no se puede leer — ${err instanceof Error ? err.message : String(err)}`)
  }
  const parsed = PokemonFileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AdminSaveError(`${file} no valida — ${issueDetail(parsed.error.issues)}`)
  }
  if (parsed.data.cards.length > 0) {
    throw new AdminSaveError(`${file} todavía tiene ${String(parsed.data.cards.length)} carta(s); no se borra`)
  }
  rmSync(target)
}

/** Origen del promote: un archivo de _staging. SAFE_NAME no alcanza acá: el
 * lector de escaneos escribe nombres con espacios ("Gimnasios 2_03.json").
 * Sin '/', '\', ':' ni '..' ⇒ plano, sin traversal. */
function stagingSourcePath(contentDir: string, file: string): string | null {
  const prefix = 'content/pokemon/_staging/'
  if (!file.startsWith(prefix)) return null
  const name = file.slice(prefix.length)
  if (!name.endsWith('.json') || /[/\\:]/.test(name) || name.startsWith('..') || name === '.json') {
    return null
  }
  return join(contentDir, 'pokemon', '_staging', name)
}

export interface PromoteOutcome {
  /** Archivo canónico que recibió la carta (content/pokemon/<deck>.json). */
  readonly to: string
  /** true si el archivo de staging quedó con 0 cartas y se borró del disco. */
  readonly stagingDeleted: boolean
}

/** AC-1/AC-2 — verifica y promueve en una sola operación: valida TODO con Zod
 * antes de escribir (carta completa, doc de staging sin ella, doc destino con
 * la carta y sin ids duplicados en canónicos), agrega la carta a
 * content/pokemon/<deck>.json (conserva _comment/pending del destino), guarda
 * el doc de staging sin ella y, si quedó con 0 cartas, borra el archivo.
 * Escrituras atómicas (tmp+rename, como saveAdminFile). */
export function promoteVerifiedCard(
  contentDir: string,
  file: string,
  doc: unknown,
  card: unknown,
): PromoteOutcome {
  const stagingPath = stagingSourcePath(contentDir, file)
  if (stagingPath === null) throw new AdminSaveError(`origen no permitido: ${file}`)
  const parsedCard = PokemonCardSchema.safeParse(card)
  if (!parsedCard.success) {
    throw new AdminSaveError(`carta inválida — ${issueDetail(parsedCard.error.issues)}`)
  }
  const parsedStaging = PokemonFileSchema.safeParse(doc)
  if (!parsedStaging.success) {
    throw new AdminSaveError(`doc de staging inválido — ${issueDetail(parsedStaging.error.issues)}`)
  }
  if (parsedStaging.data.cards.some((c) => c.id === parsedCard.data.id)) {
    throw new AdminSaveError(`el doc de staging todavía contiene la carta "${parsedCard.data.id}"`)
  }
  const id = parsedCard.data.id
  if (loadOfficialCards(contentDir).some((c) => c.id === id)) {
    throw new AdminSaveError(`ya existe una carta con id "${id}" en los archivos canónicos`)
  }
  const toFile = `content/pokemon/${parsedCard.data.deck}.json`
  const target = adminFilePath(contentDir, toFile)
  if (target === null) throw new AdminSaveError(`destino no permitido: ${toFile}`)
  // Se escribe el doc crudo enviado (preserva claves fuera del esquema como
  // fromScanner), ya validado arriba; el destino conserva _comment/pending.
  let targetDoc: Record<string, unknown>
  if (existsSync(target)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(target, 'utf8')) as unknown
    } catch (err) {
      throw new AdminSaveError(`${toFile} no se puede leer — ${err instanceof Error ? err.message : String(err)}`)
    }
    const parsedTarget = PokemonFileSchema.safeParse(raw)
    if (!parsedTarget.success) {
      throw new AdminSaveError(`${toFile} no valida — ${issueDetail(parsedTarget.error.issues)}`)
    }
    targetDoc = { ...(raw as Record<string, unknown>), cards: [...parsedTarget.data.cards, card] }
  } else {
    targetDoc = { cards: [card] }
  }
  if (!PokemonFileSchema.safeParse(targetDoc).success) {
    throw new AdminSaveError(`el doc destino (${toFile}) no valida con la carta agregada`)
  }
  mkdirSync(join(target, '..'), { recursive: true })
  const tmpTarget = `${target}.tmp`
  writeFileSync(tmpTarget, `${JSON.stringify(targetDoc, null, 1)}\n`, 'utf8')
  renameSync(tmpTarget, target)
  const stagingDeleted = parsedStaging.data.cards.length === 0
  if (stagingDeleted) {
    rmSync(stagingPath, { force: true })
  } else {
    const tmpStaging = `${stagingPath}.tmp`
    writeFileSync(tmpStaging, `${JSON.stringify(doc, null, 1)}\n`, 'utf8')
    renameSync(tmpStaging, stagingPath)
  }
  return { to: toFile, stagingDeleted }
}
