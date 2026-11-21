// SPEC-E/T-040 — cliente de la API dev de /admin/cards (middleware de Vite).
// Tipos espejo de admin/server.ts; la validación de fondo vive en el servidor.
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
export interface AdminSnapshot {
  readonly files: readonly AdminFileEntry[]
}

/** AC-3 (carga manual) — fotos de content/photos/** agrupables por carpeta. */
export interface AdminPhotos {
  readonly photos: readonly string[]
}

// T-048 — ediciones de la casa (content/house-edits/*.json).
export interface HouseEditsEntry {
  readonly file: string
  readonly enabled: boolean
  readonly error: string | null
  readonly doc: unknown
}
export interface HouseEditsSnapshot {
  readonly files: readonly HouseEditsEntry[]
}

export class AdminApiError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new AdminApiError(`GET ${url} → ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  // Guard: si el middleware de dev no está (p. ej. server viejo sin reiniciar),
  // el fallback SPA devuelve index.html 200 y res.json() rompería con un
  // SyntaxError críptico ("Unexpected token '<'"). Mensaje accionable en vez.
  if (!type.includes('application/json')) {
    throw new AdminApiError(`GET ${url} → respuesta no JSON (${type || 'sin content-type'}); reiniciá pnpm dev`)
  }
  return (await res.json()) as T
}

export function fetchAdminCards(): Promise<AdminSnapshot> {
  return getJson<AdminSnapshot>('/admin/api/cards')
}

/** AC-3 (carga manual) — listado recursivo de fotos (GET /admin/api/photos). */
export function fetchAdminPhotos(): Promise<AdminPhotos> {
  return getJson<AdminPhotos>('/admin/api/photos')
}

/** AC-3 — guarda el documento completo de un archivo de cartas. */
export async function saveAdminFile(file: string, doc: unknown): Promise<void> {
  const res = await fetch('/admin/api/cards', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file, doc }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AdminApiError(body?.error ?? `PUT /admin/api/cards → ${res.status}`)
  }
}

/** verificar-promueve-carta — respuesta del POST /admin/api/promote. */
export interface PromoteOutcome {
  /** Archivo canónico que recibió la carta (content/pokemon/<deck>.json). */
  readonly to: string
  /** true si el archivo de staging quedó vacío y se borró del disco. */
  readonly stagingDeleted: boolean
}

/** verificar-promueve-carta/AC-1 — verifica y promueve una carta de _staging al
 * canónico en una sola operación (el server valida todo antes de escribir). */
export async function promoteVerifiedCard(file: string, doc: unknown, card: unknown): Promise<PromoteOutcome> {
  const res = await fetch('/admin/api/promote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file, doc, card }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AdminApiError(body?.error ?? `POST /admin/api/promote → ${res.status}`)
  }
  return (await res.json()) as PromoteOutcome
}

/** verificar-promueve-carta/AC-5 — borra un archivo que quedó con 0 cartas
 * (el server se niega si el disco todavía tiene cartas). */
export async function deleteAdminFile(file: string): Promise<void> {
  const res = await fetch('/admin/api/cards', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AdminApiError(body?.error ?? `DELETE /admin/api/cards → ${res.status}`)
  }
}

/** T-048 — listado de archivos de ediciones con su estado (GET /admin/api/house-edits). */
export function fetchAdminHouseEdits(): Promise<HouseEditsSnapshot> {
  return getJson<HouseEditsSnapshot>('/admin/api/house-edits')
}

/** T-048/AC-4 — alterna `enabled` de un archivo de ediciones (persiste en disco). */
export async function setAdminHouseEditEnabled(
  file: string,
  enabled: boolean,
): Promise<HouseEditsEntry> {
  const res = await fetch('/admin/api/house-edits', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file, enabled }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new AdminApiError(body?.error ?? `PUT /admin/api/house-edits → ${res.status}`)
  }
  return (await res.json()) as HouseEditsEntry
}

/** URL de la foto de referencia (solo content/photos/**, servida por el middleware). */
export function photoUrl(photo: string): string {
  return `/admin/api/photo?src=${encodeURIComponent(photo)}`
}
