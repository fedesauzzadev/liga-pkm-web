// SPEC-K/T-070c — middleware de Vite (SOLO dev) para /dev/models: sirve los
// archivos de assets-src/** (packs Kenney + HGSS privados, gitignored) para
// que la galería los renderice antes de importar. node:fs ⇒ solo vite.config
// y tests de Node (SDD §6); `apply: 'serve'` ⇒ no existe en el build.
import { existsSync, readFileSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/** Raíz assets-src/ del repo (apps/web/src/dev → 4 niveles arriba). */
export const ASSETS_SRC = fileURLToPath(new URL('../../../../assets-src', import.meta.url))

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.mtl': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}

/** Ruta absoluta si `path` es un destino permitido (kenney/, hgss/ o new/ de
 *  SPEC-N/T-091, sin traversal). */
export function modelsAssetPath(assetsSrc: string, path: string): string | null {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!(clean.startsWith('kenney/') || clean.startsWith('hgss/') || clean.startsWith('new/'))) return null
  const segments = clean.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  const ext = segments[segments.length - 1]!.slice(segments[segments.length - 1]!.lastIndexOf('.'))
  if (!(ext in CONTENT_TYPES)) return null
  const full = normalize(join(assetsSrc, ...segments))
  if (!full.startsWith(normalize(assetsSrc) + sep)) return null
  return full
}

const notFound = (res: ServerResponse, error: string): void => {
  res.statusCode = 404
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error }))
}

const serveFile = (res: ServerResponse, full: string): void => {
  const name = full.slice(full.lastIndexOf(sep) + 1)
  const ext = name.slice(name.lastIndexOf('.'))
  res.statusCode = 200
  res.setHeader('content-type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
  res.setHeader('cache-control', 'no-store')
  res.end(readFileSync(full))
}

/** Plugin de Vite: GET /dev-models/asset?path=… (query) y /dev-models/file/<path>
 *  (path-style, AC-1 fix galería: el dirUrl clásico del OBJ/MTL/texturas funciona
 *  igual para galería y runtime). Ambos validan con modelsAssetPath. */
export function modelsDevPlugin(assetsSrc = ASSETS_SRC): Plugin {
  return {
    name: 'models-gallery-dev',
    apply: 'serve',
    configureServer(server) {
      // Montar ANTES que /dev-models: connect matchea prefijos en orden de registro.
      server.middlewares.use('/dev-models/file', (req, res) => {
        let clean = ''
        try {
          clean = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
        } catch {
          clean = ''
        }
        const full = clean === '' ? null : modelsAssetPath(assetsSrc, clean)
        if (full === null || !existsSync(full)) {
          notFound(res, 'asset no encontrado o no permitido')
          return
        }
        serveFile(res, full)
      })
      server.middlewares.use('/dev-models', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname.replace(/\/+$/, '') !== '/asset') {
          notFound(res, 'ruta no implementada')
          return
        }
        const full = modelsAssetPath(assetsSrc, url.searchParams.get('path') ?? '')
        if (full === null || !existsSync(full)) {
          notFound(res, 'asset no encontrado o no permitido')
          return
        }
        serveFile(res, full)
      })
    },
  }
}
