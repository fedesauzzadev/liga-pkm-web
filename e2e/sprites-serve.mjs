// AC: arreglar-sprites-showdown/AC-5 — los manifiestos de sprites servidos por
// /sprites/{sprites,trainers}.json son válidos y cada URL apunta a un archivo
// existente en apps/web/public (si el archivo falta, el server devolvería 404;
// test de node, sin levantar server). Falla si:
// - sprites.json tiene nulls o claves que no son dex 1..151 (p.ej. "trainers"
//   anidado: invalidaba isSpritesManifest y la UI quedaba sin ningún sprite —
//   causa raíz de arreglar-sprites-showdown).
// - trainers.json no cubre a los 8 líderes (gyms.json ↔ assets.config.json ↔
//   trainers.json por sdId, AC-3) o su archivo no existe.
// Uso: pnpm e2e (o node e2e/sprites-serve.mjs).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'apps', 'web', 'public')
let failed = 0

const fileExists = (url) => {
  if (typeof url !== 'string' || !url.startsWith('/')) return false
  return existsSync(join(PUB, url.replace(/^\//, '')))
}

// sprites.json: 151 dex, 0 nulls, archivos presentes.
try {
  const sprites = JSON.parse(readFileSync(join(PUB, 'sprites', 'sprites.json'), 'utf8'))
  const keys = Object.keys(sprites)
  if (keys.length !== 151) throw new Error(`esperaba 151 entradas, hay ${String(keys.length)}`)
  const badKeys = keys.filter((k) => !/^[1-9][0-9]{0,2}$/.test(k) || Number(k) > 151)
  if (badKeys.length > 0) {
    throw new Error(`claves no-dex (rompen isSpritesManifest de la UI): ${badKeys.slice(0, 5).join(', ')}`)
  }
  const missing = []
  for (const key of keys) {
    const entry = sprites[key]
    for (const side of ['front', 'back']) {
      const url = entry?.[side] ?? null
      if (url === null) {
        missing.push(`${key}.${side}=null`)
      } else if (!fileExists(url)) {
        missing.push(`${key}.${side} → ${url} (404)`)
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`sin sprite/archivo: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` … +${String(missing.length - 5)}` : ''}`)
  }
  console.log('ok   sprites.json: 151 dex, 0 nulls, 302 archivos presentes')
} catch (error) {
  failed += 1
  console.error(`FAIL sprites.json: ${error instanceof Error ? error.message : String(error)}`)
}

// trainers.json: 8 líderes con front y archivo; consistencia con gyms.json y
// assets.config.json por sdId (AC-3).
try {
  const trainers = JSON.parse(readFileSync(join(PUB, 'sprites', 'trainers.json'), 'utf8'))
  const gyms = JSON.parse(readFileSync(join(ROOT, 'content', 'gyms.json'), 'utf8'))
  const config = JSON.parse(readFileSync(join(ROOT, 'tools', 'assets.config.json'), 'utf8'))
  const ids = new Set([
    ...Object.keys(gyms.leaders ?? {}),
    ...config.trainers.map((t) => t.sdId),
  ])
  const missing = []
  for (const id of ids) {
    const url = trainers[id]?.front ?? null
    if (url === null) {
      missing.push(`${id} sin front en trainers.json`)
    } else if (!fileExists(url)) {
      missing.push(`${id} → ${url} (404)`)
    }
  }
  if (missing.length > 0) throw new Error(missing.join('; '))
  console.log(`ok   trainers.json: ${String(Object.keys(trainers).length)} líderes (gyms ↔ assets.config ↔ trainers), archivos presentes`)
} catch (error) {
  failed += 1
  console.error(`FAIL trainers.json: ${error instanceof Error ? error.message : String(error)}`)
}

if (failed > 0) {
  console.error(`\n${String(failed)} verificaciones fallaron`)
  process.exit(1)
}
console.log('\ne2e sprites-serve: manifiestos válidos y servibles (0 nulls, 0 archivos faltantes)')
