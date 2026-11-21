// models:scan (SPEC-K/T-070a + T-070e/AC-1): recorre assets-src/**, mide cada
// .glb Kenney y cada .obj HGSS (con sus .mtl/.png) y escribe
// content/board/models.catalog.json. Verifica licencia CC0 por pack (AC-3).
// Node con type-stripping; sin dependencias nuevas.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ModelsCatalogSchema, type CatalogEntry, type CatalogPack } from '../packages/content/src/models.ts'
import { foldName, glbBytesOf, glbStatsOf, KB_OF, objDirSizeBytes, objSiblingFiles, objStatsOf } from './models-format.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'assets-src')
const OUT = join(ROOT, 'content', 'board', 'models.catalog.json')
const HEAVY_TRI = 20_000
const BIG_KB = 300

const listFiles = (dir: string, keep: (name: string) => boolean, acc: string[] = []): string[] => {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) listFiles(full, keep, acc)
    else if (keep(entry.name)) acc.push(full)
  }
  return acc
}

const relFromSrc = (full: string): string => full.slice(SRC.length + 1).replace(/\\/g, '/')

function kenneyPacks(): string[] {
  if (!existsSync(join(SRC, 'kenney'))) return []
  return readdirSync(join(SRC, 'kenney'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** AC-3: cada pack Kenney necesita License*.txt que diga CC0. */
function licenseOf(packDir: string): { name: string | null; ok: boolean } {
  const files = readdirSync(packDir)
  const license = files.find((name) => foldName(name).startsWith('license '))
    ?? files.find((name) => foldName(name) === 'license')
    ?? null
  if (license === null) return { name: null, ok: false }
  const text = readFileSync(join(packDir, license), 'utf8')
  return { name: license, ok: /cc0/i.test(text) }
}

function glbEntry(pack: string, fileRel: string): CatalogEntry | null {
  const full = join(SRC, fileRel)
  let stats
  try {
    stats = glbStatsOf(glbBytesOf(full))
  } catch (err) {
    console.warn(`WARN no se pudo leer ${fileRel}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
  const sizeKB = KB_OF(statSync(full).size)
  const dims: [number, number, number] = [
    stats.bboxMax[0] - stats.bboxMin[0],
    stats.bboxMax[1] - stats.bboxMin[1],
    stats.bboxMax[2] - stats.bboxMin[2],
  ]
  return {
    pack,
    file: fileRel,
    format: 'glb',
    sizeKB,
    triangles: stats.triangles,
    bbox: { min: [...stats.bboxMin] as [number, number, number], max: [...stats.bboxMax] as [number, number, number] },
    dimensions: dims,
    flags: [...(stats.triangles > HEAVY_TRI ? ['heavy' as const] : []), ...(sizeKB > BIG_KB ? ['big' as const] : [])],
    textures: [],
    missingTextures: [],
  }
}

function objEntry(fileRel: string): CatalogEntry {
  const full = join(SRC, fileRel)
  const text = readFileSync(full, 'utf8')
  const stats = objStatsOf(full, text)
  const siblings = objSiblingFiles(full)
  const present = new Set(siblings.map((name) => name.toLowerCase()))
  // Case-insensitive: los rips HGSS mezclan mayúsculas (p. ej. Casey_bodyCl_ctr.png)
  // y el runtime resuelve la textura tolerando case (textureUrlCandidates).
  const missing = [...new Set(stats.textureRefs.filter((ref) => !present.has(ref.split('/').pop()?.toLowerCase() ?? ref)))]
  const dims: [number, number, number] = [
    stats.bboxMax[0] - stats.bboxMin[0],
    stats.bboxMax[1] - stats.bboxMin[1],
    stats.bboxMax[2] - stats.bboxMin[2],
  ]
  return {
    pack: 'hgss',
    file: fileRel,
    format: 'obj',
    sizeKB: KB_OF(objDirSizeBytes(full)),
    triangles: stats.triangles,
    bbox: { min: [...stats.bboxMin] as [number, number, number], max: [...stats.bboxMax] as [number, number, number] },
    dimensions: dims,
    flags: [...(stats.triangles > HEAVY_TRI ? ['heavy' as const] : []), ...(missing.length > 0 ? ['big' as const] : [])],
    textures: [...new Set(stats.textureRefs)],
    missingTextures: missing,
  }
}

if (!existsSync(SRC)) {
  console.error('models:scan FALLA — no existe assets-src/ (descomprimí los packs, SPEC-K)')
  process.exit(1)
}

const entries: CatalogEntry[] = []
const packs: Record<string, CatalogPack> = {}
let licenseErrors = 0

for (const pack of kenneyPacks()) {
  const packDir = join(SRC, 'kenney', pack)
  const license = licenseOf(packDir)
  if (!license.ok) {
    console.error(`FAIL licencia: assets-src/kenney/${pack} sin License*.txt CC0 (T-070a/AC-3)`)
    licenseErrors += 1
  }
  const glbs = listFiles(packDir, (name) => name.toLowerCase().endsWith('.glb'))
    .map(relFromSrc)
    .sort()
  for (const rel of glbs) {
    const entry = glbEntry(pack, rel)
    if (entry !== null) entries.push(entry)
  }
  packs[pack] = {
    files: glbs.length,
    triangles: entries.filter((entry) => entry.pack === pack).reduce((sum, entry) => sum + entry.triangles, 0),
    sizeKB: Math.round(entries.filter((entry) => entry.pack === pack).reduce((sum, entry) => sum + entry.sizeKB, 0) * 10) / 10,
    license: license.name,
    licenseOk: license.ok,
    private: false,
  }
}

const objs = listFiles(join(SRC, 'hgss'), (name) => name.toLowerCase().endsWith('.obj'))
  .map(relFromSrc)
  .sort()
const hgssEntries = objs.map(objEntry)
entries.push(...hgssEntries)
if (objs.length > 0 || existsSync(join(SRC, 'hgss'))) {
  packs.hgss = {
    files: objs.length,
    triangles: hgssEntries.reduce((sum, entry) => sum + entry.triangles, 0),
    sizeKB: Math.round(hgssEntries.reduce((sum, entry) => sum + entry.sizeKB, 0) * 10) / 10,
    license: null,
    licenseOk: false,
    private: true,
  }
}

const catalog = ModelsCatalogSchema.parse({
  _status: 'Generado por `pnpm models:scan` (SPEC-K/T-070a). flags: heavy (>20000 tri) / big (>300 KB). Las rutas file/ son relativas a assets-src/. No editar a mano: regenerar.',
  packs,
  entries,
})
writeFileSync(OUT, `${JSON.stringify(catalog, null, 1)}\n`, 'utf8')

// AC-2: resumen por pack + marcas de heavy/big.
console.log(`models:scan — ${String(entries.length)} archivo(s) en ${String(Object.keys(packs).length)} pack(s)`)
for (const [pack, info] of Object.entries(packs)) {
  console.log(
    `  ${pack.padEnd(30)} ${String(info.files).padStart(3)} arch ${String(info.triangles).padStart(7)} tri ${String(info.sizeKB).padStart(8)} KB` +
      (info.private ? ' [privado]' : info.licenseOk ? ' [CC0 ok]' : ' [SIN CC0]'),
  )
}
const flagged = entries.filter((entry) => entry.flags.length > 0)
for (const entry of flagged) {
  console.log(`    marca ${entry.flags.join('+')}: ${entry.file}`)
}
if (licenseErrors > 0) {
  console.error(`models:scan FALLA — ${String(licenseErrors)} pack(s) sin licencia CC0`)
  process.exit(1)
}
console.log(`OK → content/board/models.catalog.json`)
