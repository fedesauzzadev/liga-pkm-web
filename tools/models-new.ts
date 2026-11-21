// models:new (SPEC-N/T-091/AC-1): detecta los modelos nuevos del dueño en
// assets-src/new/ por nombre base (gim.*, pokecenter.*, pokemart.*, league.*;
// admite sufijos como gim_01), copia SOLO esos archivos (y sus texturas
// externas) a apps/web/public/models/new/ — gitignorado, licencia a confirmar
// en docs/ASSETS.md — y escribe `newModels` en content/board/models.manifest.json
// (status "proposed"; el chequeo de T-086 lo hace `pnpm models:check`).
// Corre con type-stripping nativo de Node (≥22.18). Sin dependencias nuevas.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NEW_MODEL_KINDS, ModelsManifestSchema, PlacementsFileSchema,
} from '../packages/content/src/index.ts'
import {
  detectNewModelFiles, glbExternalImages, objStatsOf, parseObj,
} from './models-format.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PLACEMENTS = join(ROOT, 'content', 'board', 'placements.json')
const MANIFEST = join(ROOT, 'content', 'board', 'models.manifest.json')

const fail = (message: string): never => {
  console.error(`models:new FALLA — ${message}`)
  process.exit(1)
}

if (!existsSync(PLACEMENTS)) fail('falta content/board/placements.json')
const placements = PlacementsFileSchema.parse(JSON.parse(readFileSync(PLACEMENTS, 'utf8')) as unknown)
const srcDir = join(ROOT, placements.models.sourceDir)
if (!existsSync(srcDir)) fail(`no existe el directorio fuente ${placements.models.sourceDir}`)

const names = readdirSync(srcDir)
const detected = detectNewModelFiles(names, placements.models.files)

const missing = NEW_MODEL_KINDS.filter((kind) => detected[kind] === undefined)
if (missing.length > 0) {
  for (const kind of missing) {
    console.error(`  falta ${kind} (buscando "${String(placements.models.files[kind])}" con extensión .glb/.gltf/.obj/.fbx)`)
  }
  fail(`archivos incompletos en ${placements.models.sourceDir}/ (${String(missing.length)} de ${String(NEW_MODEL_KINDS.length)})`)
}

const OUT = join(ROOT, 'apps', 'web', 'public', 'models', 'new')
mkdirSync(OUT, { recursive: true })

interface CopyPlan { readonly from: string; readonly to: string }
const plans: CopyPlan[] = []

const push = (from: string, to: string): void => {
  if (existsSync(from)) plans.push({ from, to })
}

for (const kind of NEW_MODEL_KINDS) {
  const entry = detected[kind]!
  const from = join(srcDir, entry.file)
  push(from, join(OUT, entry.file))
  if (entry.format === 'glb' || entry.format === 'gltf') {
    // Texturas externas referenciadas en images[].uri (mismo dir que el modelo).
    for (const uri of glbExternalImages(from)) push(join(dirname(from), uri), join(dirname(join(OUT, entry.file)), uri))
  } else if (entry.format === 'obj') {
    const text = readFileSync(from, 'utf8')
    const dir = dirname(from)
    for (const mtllib of parseObj(text).mtllibs) {
      const mtlFrom = join(dir, mtllib)
      push(mtlFrom, join(dirname(join(OUT, entry.file)), mtllib))
      if (!existsSync(mtlFrom)) continue
      const siblings = new Map(
        readdirSync(dir).filter((name) => /\.(mtl|png)$/i.test(name)).map((name) => [name.toLowerCase(), name]),
      )
      for (const ref of objStatsOf(mtlFrom, text).textureRefs) {
        const hit = siblings.get(ref.split('/').pop()?.toLowerCase() ?? ref.toLowerCase())
        if (hit !== undefined) push(join(dir, hit), join(dirname(join(OUT, entry.file)), hit))
      }
    }
  }
}

let copied = 0
let copiedKB = 0
for (const plan of plans) {
  mkdirSync(dirname(plan.to), { recursive: true })
  copyFileSync(plan.from, plan.to)
  copied += 1
  copiedKB += readFileSync(plan.to).length / 1024
}

// Escribe newModels preservando el resto del manifiesto y los estados que ya
// tenían las entradas con el mismo archivo (approved/failed del dueño).
if (!existsSync(MANIFEST)) fail('falta content/board/models.manifest.json (corré pnpm models:suggest)')
const manifest = ModelsManifestSchema.parse(JSON.parse(readFileSync(MANIFEST, 'utf8')) as unknown)
for (const kind of NEW_MODEL_KINDS) {
  const entry = detected[kind]!
  const previous = manifest.newModels[kind]
  manifest.newModels[kind] =
    previous !== undefined && previous.file === entry.file
      ? { ...previous, format: entry.format }
      : { file: entry.file, format: entry.format, status: 'proposed', options: { ignoreTextures: false, keepOriginalMaterial: false } }
}
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`, 'utf8')

for (const kind of NEW_MODEL_KINDS) {
  const entry = detected[kind]!
  console.log(`  ${kind.padEnd(11)} ← ${placements.models.sourceDir}/${entry.file} (${entry.format})`)
}
console.log(
  `models:new OK — ${String(copied)} archivo(s), ${String(Math.round(copiedKB))} KB → apps/web/public/models/new/ ` +
    '· licencia a confirmar (docs/ASSETS.md) · corré `pnpm models:check` para el chequeo T-086',
)
