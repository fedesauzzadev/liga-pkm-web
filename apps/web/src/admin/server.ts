// SPEC-E/T-040 — middleware de Vite (SOLO dev) para /admin/cards: lista cartas de
// content/pokemon/** y _staging/**, sirve fotos y guarda JSON validado.
// Este módulo usa node:fs: solo puede importarlo vite.config.ts y tests de Node;
// la UI nunca lo importa (SDD §6). `apply: 'serve'` ⇒ no existe en el build.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import {
  HouseEditsFileSchema,
  applyHouseEdits,
  type HouseEditSource,
} from '@liga/content'
import {
  AdminSaveError,
  deleteAdminFileIfEmpty,
  loadOfficialCards,
  promoteVerifiedCard,
  saveAdminFile,
} from './promote.ts'

// verificar-promueve-carta: AdminSaveError/adminFilePath/saveAdminFile viven en
// promote.ts (server.ts quedó arriba del límite de 400 líneas); se re-exportan
// para no romper los imports existentes de tests y vite.config.ts.
export { AdminSaveError, adminFilePath, saveAdminFile } from './promote.ts'

/** Raíz content/ del repo (apps/web/src/admin → 4 niveles arriba: src → web → apps → raíz). */
export const CONTENT_DIR = fileURLToPath(new URL('../../../../content', import.meta.url))

export interface AdminCardEntry {
  readonly raw: unknown
  readonly id: string | null
}
export interface AdminFileEntry {
  readonly file: string
  readonly staging: boolean
  readonly fileError: string | null
  readonly pending: readonly string[]
  readonly cards: readonly AdminCardEntry[]
  /** Doc completo si el JSON parsea (preserva _comment/pending al guardar). */
  readonly doc: unknown
}

/** AC-1 — snapshot de todos los archivos de cartas (incluye _staging/). */
export function listAdminCards(contentDir: string): { files: AdminFileEntry[] } {
  const files: AdminFileEntry[] = []
  const readDir = (dirRel: string, staging: boolean): void => {
    const dir = join(contentDir, dirRel)
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      if (!staging && entry.name === 'gyms.json') continue
      const file = `content/pokemon/${staging ? `_staging/${entry.name}` : entry.name}`
      let fileError: string | null = null
      let doc: unknown = null
      try {
        doc = JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) as unknown
      } catch (err) {
        fileError = err instanceof Error ? err.message : String(err)
      }
      let cards: AdminCardEntry[] = []
      let pending: string[] = []
      if (doc !== null) {
        const o = doc as { cards?: unknown; pending?: unknown }
        if (Array.isArray(o.pending)) {
          pending = o.pending.filter((p): p is string => typeof p === 'string')
        }
        if (Array.isArray(o.cards)) {
          cards = o.cards.map((raw) => ({
            raw,
            id: typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string'
              ? (raw as { id: string }).id
              : null,
          }))
        } else if (fileError === null) {
          fileError = 'el archivo no tiene array "cards"'
        }
      }
      files.push({ file, staging, fileError, pending, cards, doc: fileError === null ? doc : null })
    }
  }
  readDir(join('pokemon'), false)
  readDir(join('pokemon', '_staging'), true)
  return { files }
}

// ── T-048: ediciones de la casa (content/house-edits/*.json) ──

export interface HouseEditsEntry {
  readonly file: string
  readonly enabled: boolean
  readonly error: string | null
  /** Doc completo si parsea y valida (para el diff original vs. editada). */
  readonly doc: unknown
}

/** T-048/AC-4 — ruta absoluta si `file` es content/house-edits/<nombre seguro>.
 * Acepta guión bajo inicial (`_example.json`); sin subcarpetas ni traversal. */
export function houseEditFilePath(contentDir: string, file: string): string | null {
  const prefix = 'content/house-edits/'
  if (!file.startsWith(prefix)) return null
  const name = file.slice(prefix.length)
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.json$/.test(name)) return null
  return join(contentDir, 'house-edits', name)
}

/** T-048/AC-4 — listado de archivos de ediciones con su estado `enabled`. */
export function listHouseEdits(contentDir: string): { files: HouseEditsEntry[] } {
  const files: HouseEditsEntry[] = []
  const dir = join(contentDir, 'house-edits')
  if (!existsSync(dir)) return { files }
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const file = `content/house-edits/${entry.name}`
    let doc: unknown = null
    try {
      doc = JSON.parse(readFileSync(join(dir, entry.name), 'utf8')) as unknown
    } catch (err) {
      files.push({ file, enabled: false, error: err instanceof Error ? err.message : String(err), doc: null })
      continue
    }
    const parsed = HouseEditsFileSchema.safeParse(doc)
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      files.push({ file, enabled: false, error: `esquema inválido — ${detail}`, doc: null })
      continue
    }
    files.push({ file, enabled: parsed.data.enabled, error: null, doc })
  }
  return { files }
}

/** T-048/AC-4 — persiste SOLO el flag `enabled` de un archivo de ediciones
 * (validado); el resto del doc (edits, _comment) se conserva tal cual.
 * T-048b: antes de habilitar hace un dry-run — el archivo (junto con los ya
 * habilitados) debe aplicar limpio sobre las cartas oficiales; si no, se
 * rechaza con el error. Así el toggle no puede dejar la app sin contenido.
 * Deshabilitar nunca se bloquea (es la vía de recuperación). */
export function setHouseEditEnabled(
  contentDir: string,
  file: string,
  enabled: boolean,
): HouseEditsEntry {
  const target = houseEditFilePath(contentDir, file)
  if (target === null) throw new AdminSaveError(`destino no permitido: ${file}`)
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(target, 'utf8')) as unknown
  } catch (err) {
    throw new AdminSaveError(`JSON inválido — ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!HouseEditsFileSchema.safeParse(doc).success) {
    throw new AdminSaveError('el archivo de ediciones no valida el esquema')
  }
  if (enabled) {
    const sources: HouseEditSource[] = []
    for (const entry of listHouseEdits(contentDir).files) {
      if (entry.error !== null || (!entry.enabled && entry.file !== file)) continue
      const parsed = HouseEditsFileSchema.safeParse(entry.doc)
      if (parsed.success) sources.push({ file: entry.file, doc: parsed.data })
    }
    const dry = applyHouseEdits(loadOfficialCards(contentDir), sources)
    if (dry.errors.length > 0) {
      throw new AdminSaveError(`no se puede habilitar — ${dry.errors.join('; ')}`)
    }
  }
  const next = { ...(doc as Record<string, unknown>), enabled }
  writeFileSync(target, `${JSON.stringify(next, null, 1)}\n`, 'utf8')
  return { file, enabled, error: null, doc: next }
}

/** Foto de referencia (CARD-INGESTION §2): solo content/photos/**, subcarpetas permitidas
 *  (los recortes reales tienen espacios/acentos, p. ej. "photos/Mazos/Mazo bosque/01 - Paras.jpg").
 *  Anti-traversal por segmento: nada de '..', '/', '\' ni ':' dentro de un segmento. */
export function readAdminPhoto(contentDir: string, src: string): { bytes: Buffer; type: string } | null {
  const clean = src.split('#')[0] ?? src
  if (!clean.startsWith('photos/')) return null
  const segs = clean.slice('photos/'.length).split('/')
  const badSeg = segs.some((s) => s.length === 0 || s === '.' || s === '..' || /[/\\:]/.test(s))
  const name = segs[segs.length - 1] ?? ''
  if (badSeg || segs.length === 0 || !/\.(jpe?g|png|webp)$/i.test(name)) return null
  const full = join(contentDir, 'photos', ...segs)
  if (!existsSync(full)) return null
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { bytes: readFileSync(full), type }
}

const PHOTO_EXT = /\.(jpe?g|png|webp)$/i

/** AC-3 (carga manual) — listado recursivo de content/photos/** con segmentos
 *  seguros y filtro por extensión; las rutas se devuelven como "photos/…"
 *  (el formato exacto de source.photo que espera readAdminPhoto). */
export function listAdminPhotos(contentDir: string): { photos: string[] } {
  const photos: string[] = []
  const walk = (dir: string, rel: readonly string[]): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (/[/\\:]/.test(entry.name) || entry.name === '.' || entry.name === '..') continue
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), [...rel, entry.name])
        continue
      }
      if (!entry.isFile() || !PHOTO_EXT.test(entry.name)) continue
      photos.push(`photos/${[...rel, entry.name].join('/')}`)
    }
  }
  walk(join(contentDir, 'photos'), [])
  return { photos }
}

function sendJson(res: { statusCode: number; setHeader(k: string, v: string): void; end(body: string): void }, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readBody(req: { on(ev: string, cb: (chunk?: Buffer) => void): void }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk?: Buffer) => {
      if (chunk !== undefined) chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Plugin de Vite: monta la API /admin/api/* en el server de desarrollo. */
export function adminCardsPlugin(contentDir = CONTENT_DIR): Plugin {
  return {
    name: 'admin-cards-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/admin/api', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const route = `${req.method ?? ''} ${url.pathname.replace(/\/+$/, '')}`
        if (route === 'GET /cards') {
          sendJson(res, 200, listAdminCards(contentDir))
          return
        }
        if (route === 'GET /house-edits') {
          sendJson(res, 200, listHouseEdits(contentDir))
          return
        }
        if (route === 'PUT /house-edits') {
          void (async () => {
            try {
              const body: unknown = JSON.parse(await readBody(req))
              const file = (body as { file?: unknown }).file
              const enabled = (body as { enabled?: unknown }).enabled
              if (typeof file !== 'string' || typeof enabled !== 'boolean') {
                throw new AdminSaveError('faltan "file" (string) o "enabled" (boolean)')
              }
              sendJson(res, 200, setHouseEditEnabled(contentDir, file, enabled))
            } catch (err) {
              const status = err instanceof AdminSaveError ? err.status : 400
              sendJson(res, status, { error: err instanceof Error ? err.message : String(err) })
            }
          })()
          return
        }
        if (route === 'GET /photos') {
          sendJson(res, 200, listAdminPhotos(contentDir))
          return
        }
        if (route === 'GET /photo') {
          const photo = readAdminPhoto(contentDir, url.searchParams.get('src') ?? '')
          if (photo === null) {
            sendJson(res, 404, { error: 'foto no encontrada o no permitida' })
            return
          }
          res.statusCode = 200
          res.setHeader('content-type', photo.type)
          res.setHeader('cache-control', 'no-store')
          res.end(photo.bytes)
          return
        }
        if (route === 'PUT /cards') {
          void (async () => {
            try {
              const body: unknown = JSON.parse(await readBody(req))
              const file = (body as { file?: unknown }).file
              const doc = (body as { doc?: unknown }).doc
              if (typeof file !== 'string') throw new AdminSaveError('falta "file"')
              saveAdminFile(contentDir, file, doc)
              sendJson(res, 200, { ok: true, file })
            } catch (err) {
              const status = err instanceof AdminSaveError ? err.status : 400
              sendJson(res, status, { error: err instanceof Error ? err.message : String(err) })
            }
          })()
          return
        }
        // verificar-promueve-carta/AC-1 — verificar una carta de _staging la
        // promueve al canónico en una sola operación (server valida todo antes
        // de escribir).
        if (route === 'POST /promote') {
          void (async () => {
            try {
              const body: unknown = JSON.parse(await readBody(req))
              const file = (body as { file?: unknown }).file
              const doc = (body as { doc?: unknown }).doc
              const card = (body as { card?: unknown }).card
              if (typeof file !== 'string') throw new AdminSaveError('falta "file"')
              sendJson(res, 200, { ok: true, ...promoteVerifiedCard(contentDir, file, doc, card) })
            } catch (err) {
              const status = err instanceof AdminSaveError ? err.status : 400
              sendJson(res, status, { error: err instanceof Error ? err.message : String(err) })
            }
          })()
          return
        }
        // verificar-promueve-carta/AC-5 — borra un archivo que quedó con 0
        // cartas (se niega si el disco todavía tiene cartas).
        if (route === 'DELETE /cards') {
          void (async () => {
            try {
              const body: unknown = JSON.parse(await readBody(req))
              const file = (body as { file?: unknown }).file
              if (typeof file !== 'string') throw new AdminSaveError('falta "file"')
              deleteAdminFileIfEmpty(contentDir, file)
              sendJson(res, 200, { ok: true })
            } catch (err) {
              const status = err instanceof AdminSaveError ? err.status : 400
              sendJson(res, status, { error: err instanceof Error ? err.message : String(err) })
            }
          })()
          return
        }
        // Ruta desconocida bajo /admin/api: 404 JSON en vez de next(), porque
        // el fallback SPA de Vite devolvería index.html (200 text/html) y el
        // cliente rompería al parsearlo como JSON ("Unexpected token '<'").
        sendJson(res, 404, { error: `ruta no implementada: ${route}` })
      })
    },
  }
}
