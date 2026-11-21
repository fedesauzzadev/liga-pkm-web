// models:use-new (SPEC-O/T-094/AC-1): busca en assets-src/new/ (sin distinguir
// mayúsculas) los modelos nuevos del dueño por nombre base (gim, pokecenter,
// pokemart, league; admite sufijos _01), imprime la tabla kind → archivo/
// extensión/KB/triángulos (o FALTA, terminando con error si falta alguno),
// lista extensiones no soportadas explicando cuáles sí, copia los hallados a
// apps/web/public/models/new/ y escribe content/board/models.new.json (kind,
// archivo, yawOffsetDeg, estado) + el manifiesto de runtime. Las funciones de
// plan son puras (las testean tests/models-use-new.test.ts); el main corre
// solo cuando el archivo es el entrypoint.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  ModelsManifestSchema, PlacementsFileSchema,
  type ModelsNewFile, type NewModelEntry, type NewModelKind,
} from '../packages/content/src/index.ts'
import {
  detectNewModelFiles, glbBytesOf, glbExternalImages, glbStatsOf, KB_OF, NEW_MODEL_EXTENSIONS,
  objStatsOf, parseObj, type DetectedNewModel,
} from './models-format.ts'

export interface UseNewUnsupported {
  readonly kind: string
  readonly file: string
  readonly ext: string
}

export interface UseNewPlan {
  readonly detected: Readonly<Record<string, DetectedNewModel>>
  readonly missing: readonly string[]
  readonly unsupported: readonly UseNewUnsupported[]
}

/** Extensiones admitidas para los modelos nuevos (AC-1). */
export const SUPPORTED_NEW_MODEL_FORMATS = '.glb/.gltf, .obj+.mtl, .fbx'

const suffixOf = (stem: string, wanted: string): string | null =>
  stem === wanted ? '' : stem.startsWith(wanted) ? stem.slice(wanted.length) : null

/** AC-1: plan de detección — hallados por kind, faltantes y archivos con
 *  nombre correcto pero extensión no soportada (se listan y explican). */
export function planUseNew(
  names: readonly string[],
  files: Readonly<Record<string, string>>,
): UseNewPlan {
  const detected = detectNewModelFiles(names, files)
  const missing = Object.keys(files)
    .filter((kind) => detected[kind] === undefined)
    .sort()
  const unsupported: UseNewUnsupported[] = []
  for (const [kind, base] of Object.entries(files)) {
    const wanted = base.toLowerCase()
    for (const name of names) {
      const dot = name.lastIndexOf('.')
      if (dot <= 0) continue
      const ext = name.slice(dot + 1).toLowerCase()
      if ((NEW_MODEL_EXTENSIONS as readonly string[]).includes(ext)) continue
      const suffix = suffixOf(name.slice(0, dot).toLowerCase(), wanted)
      if (suffix === null || (suffix !== '' && !/^_\d+$/.test(suffix))) continue
      unsupported.push({ kind, file: name, ext })
    }
  }
  return { detected, missing, unsupported }
}

/** Triángulos de un modelo (.glb/.gltf por accessors, .obj por caras); null
 *  para .fbx (binario propietario: se importa igual, sin estadística). */
export function trianglesOfModel(path: string): number | null {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  try {
    if (ext === 'glb') return glbStatsOf(glbBytesOf(path)).triangles
    if (ext === 'gltf') {
      const doc = JSON.parse(readFileSync(path, 'utf8')) as {
        meshes?: { primitives?: { indices?: number; attributes?: { POSITION?: number } }[] }[]
        accessors?: { count?: number }[]
      }
      let triangles = 0
      for (const mesh of doc.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
          const index = primitive.indices ?? primitive.attributes?.POSITION
          if (index === undefined) continue
          triangles += Math.ceil((doc.accessors?.[index]?.count ?? 0) / 3)
        }
      }
      return triangles
    }
    if (ext === 'obj') return parseObj(readFileSync(path, 'utf8')).triangles
  } catch {
    return null
  }
  return null
}

/** AC-1: contenido de models.new.json a partir de la detección + placements. */
export function modelsNewFileOf(
  detected: Readonly<Record<string, DetectedNewModel>>,
  yawByKind: Readonly<Record<string, number>>,
  statusByKind: Readonly<Record<string, string>>,
): ModelsNewFile {
  const models: Record<string, NewModelEntry> = {}
  for (const [kind, entry] of Object.entries(detected)) {
    models[kind] = {
      file: entry.file,
      format: entry.format,
      yawOffsetDeg: yawByKind[kind] ?? 0,
      status: (statusByKind[kind] ?? 'proposed') as NewModelEntry['status'],
    }
  }
  return { _status: 'Generado por `pnpm models:use-new` (SPEC-O/T-094/AC-1).', models }
}

// ── Main (solo como entrypoint) ──────────────────────────────────────────────

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PLACEMENTS = join(ROOT, 'content', 'board', 'placements.json')
const MANIFEST = join(ROOT, 'content', 'board', 'models.manifest.json')
const MODELS_NEW = join(ROOT, 'content', 'board', 'models.new.json')

const fail = (message: string): never => {
  console.error(`models:use-new FALLA — ${message}`)
  process.exit(1)
}

function main(): void {
  if (!existsSync(PLACEMENTS)) fail('falta content/board/placements.json')
  const placements = PlacementsFileSchema.parse(JSON.parse(readFileSync(PLACEMENTS, 'utf8')) as unknown)
  const srcDir = join(ROOT, placements.models.sourceDir)
  if (!existsSync(srcDir)) fail(`no existe el directorio fuente ${placements.models.sourceDir}`)
  if (!existsSync(MANIFEST)) fail('falta content/board/models.manifest.json (corré pnpm models:suggest)')

  const names = readdirSync(srcDir)
  const plan = planUseNew(names, placements.models.files)

  console.log('kind        archivo          ext  KB      triángulos')
  for (const kind of Object.keys(placements.models.files)) {
    const entry = plan.detected[kind]
    if (entry === undefined) {
      console.log(`${kind.padEnd(11)} FALTA`)
      continue
    }
    const from = join(srcDir, entry.file)
    const kb = KB_OF(statSync(from).size)
    const triangles = trianglesOfModel(from)
    console.log(
      `${kind.padEnd(11)} ${entry.file.padEnd(15)} ${entry.format.padEnd(3)} ${String(kb).padStart(6)}  ${triangles === null ? '-' : String(triangles)}`,
    )
  }
  for (const bad of plan.unsupported) {
    console.error(
      `  ✖ ${bad.file}: extensión .${bad.ext} no soportada para ${bad.kind} — admitimos ${SUPPORTED_NEW_MODEL_FORMATS}`,
    )
  }
  if (plan.missing.length > 0) {
    fail(`faltan ${String(plan.missing.length)} modelo(s): ${plan.missing.join(', ')} (buscá en ${placements.models.sourceDir}/)`)
  }

  // Copia a public/models/new/ (archivo + texturas externas + .mtl hermanos).
  const out = join(ROOT, 'apps', 'web', 'public', 'models', 'new')
  mkdirSync(out, { recursive: true })
  let copied = 0
  const copy = (from: string, to: string): void => {
    if (!existsSync(from)) return
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    copied += 1
  }
  for (const entry of Object.values(plan.detected)) {
    const from = join(srcDir, entry.file)
    copy(from, join(out, entry.file))
    if (entry.format === 'glb' || entry.format === 'gltf') {
      for (const uri of glbExternalImages(from)) copy(join(dirname(from), uri), join(out, uri))
    } else if (entry.format === 'obj') {
      const text = readFileSync(from, 'utf8')
      for (const mtllib of parseObj(text).mtllibs) {
        copy(join(dirname(from), mtllib), join(out, mtllib))
        const mtlFrom = join(dirname(from), mtllib)
        if (!existsSync(mtlFrom)) continue
        const siblings = new Map(
          readdirSync(dirname(from)).filter((name) => /\.(mtl|png)$/i.test(name))
            .map((name) => [name.toLowerCase(), name]),
        )
        for (const ref of objStatsOf(from, text).textureRefs) {
          const hit = siblings.get(ref.split('/').pop()?.toLowerCase() ?? ref.toLowerCase())
          if (hit !== undefined) copy(join(dirname(from), hit), join(out, hit))
        }
      }
    }
  }

  // Manifiesto de runtime: preserva estado si el archivo no cambió (AC-2).
  const manifest = ModelsManifestSchema.parse(JSON.parse(readFileSync(MANIFEST, 'utf8')) as unknown)
  const statusByKind: Record<string, string> = {}
  for (const [kind, entry] of Object.entries(plan.detected)) {
    const previous = manifest.newModels[kind as NewModelKind]
    manifest.newModels[kind as NewModelKind] =
      previous !== undefined && previous.file === entry.file
        ? { ...previous, format: entry.format }
        : { file: entry.file, format: entry.format, status: 'proposed', options: { ignoreTextures: false, keepOriginalMaterial: false } }
    statusByKind[kind] = manifest.newModels[kind as NewModelKind]!.status
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`, 'utf8')

  const modelsNew = modelsNewFileOf(plan.detected, placements.models.yawOffsetDeg, statusByKind)
  writeFileSync(MODELS_NEW, `${JSON.stringify(modelsNew, null, 1)}\n`, 'utf8')

  console.log(
    `models:use-new OK — ${String(copied)} archivo(s) → apps/web/public/models/new/ · ` +
      'content/board/models.new.json + models.manifest.json actualizados',
  )
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
