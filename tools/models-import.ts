// models:import (SPEC-K/T-070d/AC-1): copia a apps/web/public/models/ SOLO los
// archivos utilizables (approved; si el dueño no revisó, proposed) + la
// licencia de cada pack. Falla si el total supera decor.json ›
// budgets.maxModelsMB, listando los más pesados para sacar. Regenera la
// carpeta completa (es generada). hgss/** es gitignored (uso privado).
// T-086/AC-2: además copia las texturas externas que un .glb Kenney referencia
// (images[].uri) al lado del .glb, para que el cargador del juego las resuelva
// contra el directorio del modelo (setResourcePath).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DecorSchema, ModelsManifestSchema, usableCandidates } from '../packages/content/src/index.ts'
import { glbExternalImages, objStatsOf } from './models-format.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST = join(ROOT, 'content', 'board', 'models.manifest.json')
const DECOR = join(ROOT, 'content', 'board', 'decor.json')
const SRC = join(ROOT, 'assets-src')
const OUT = join(ROOT, 'apps', 'web', 'public', 'models')

if (!existsSync(MANIFEST)) {
  console.error('models:import FALLA — falta content/board/models.manifest.json (corré pnpm models:suggest)')
  process.exit(1)
}
const manifest = ModelsManifestSchema.parse(JSON.parse(readFileSync(MANIFEST, 'utf8')) as unknown)
const maxModelsMB = DecorSchema.parse(JSON.parse(readFileSync(DECOR, 'utf8')) as unknown).budgets.maxModelsMB

interface CopyPlan {
  readonly from: string
  readonly to: string
  readonly sizeKB: number
  readonly label: string
}

const plans: CopyPlan[] = []
const licenses = new Set<string>()

// Kenney: por kind, approved si hay alguno; si no, proposed (AC-1).
// En public/models/ se deja el prefijo kenney/ fuera (SPEC-K: models/<pack>/).
const publicPath = (file: string): string => file.replace(/^kenney\//, '')
for (const [kind, entry] of Object.entries(manifest.kinds)) {
  const candidates = usableCandidates(entry.candidates)
  const approved = candidates.filter((candidate) => candidate.status === 'approved')
  const chosen = approved.length > 0 ? approved : candidates
  for (const candidate of chosen) {
    const from = join(SRC, candidate.file)
    if (!existsSync(from)) continue
    plans.push({
      from,
      to: join(OUT, publicPath(candidate.file)),
      sizeKB: Math.round((statSync(from).size / 1024) * 10) / 10,
      label: `${kind} ← ${candidate.file}`,
    })
    // T-086/AC-2: texturas externas del .glb, al lado del .glb importado.
    for (const uri of glbExternalImages(from)) {
      const textureFrom = join(dirname(from), uri)
      if (!existsSync(textureFrom)) continue
      plans.push({
        from: textureFrom,
        to: join(OUT, dirname(publicPath(candidate.file)), uri),
        sizeKB: Math.round((statSync(textureFrom).size / 1024) * 10) / 10,
        label: `${kind} textura ← ${candidate.file} :: ${uri}`,
      })
    }
    licenses.add(candidate.pack)
  }
}

// HGSS: mismo criterio + .mtl y SOLO las texturas que el .mtl referencia
// (map_Kd, match case-insensitive): los rips traen normales/efectos sueltos
// que el juego no usa y no deben comer presupuesto (fichas-modelo-3d-hgss/AC-3).
for (const [kind, group] of Object.entries(manifest.hgss)) {
  const usable = usableCandidates(group.files)
  const approved = usable.filter((file) => file.status === 'approved')
  const chosen = approved.length > 0 ? approved : usable
  for (const file of chosen) {
    const from = join(SRC, file.entry)
    if (!existsSync(from)) continue
    const dir = dirname(from)
    const relDir = dirname(file.entry.slice('hgss/'.length))
    const siblings = new Map(
      readdirSync(dir).filter((name) => /\.(mtl|png)$/i.test(name)).map((name) => [name.toLowerCase(), name]),
    )
    const wanted = new Set<string>()
    for (const ref of objStatsOf(from, readFileSync(from, 'utf8')).textureRefs) {
      const hit = siblings.get(ref.split('/').pop()?.toLowerCase() ?? ref)
      if (hit !== undefined) wanted.add(hit)
    }
    const names = [basename(from)]
    for (const name of siblings.values()) {
      if (name.toLowerCase().endsWith('.mtl') || wanted.has(name)) names.push(name)
    }
    for (const name of names) {
      plans.push({
        from: join(dir, name),
        to: join(OUT, 'hgss', relDir, name),
        sizeKB: Math.round((statSync(join(dir, name)).size / 1024) * 10) / 10,
        label: `hgss/${kind} ← ${relDir}/${name}`,
      })
    }
  }
}

const totalKB = plans.reduce((sum, plan) => sum + plan.sizeKB, 0)
if (totalKB > maxModelsMB * 1024) {
  console.error(
    `models:import FALLA — ${String(Math.round(totalKB))} KB > presupuesto ${String(maxModelsMB)} MB (decor.json › budgets.maxModelsMB).`,
  )
  console.error('Los más pesados para sacar (rechazalos en /dev/models y exportá):')
  for (const plan of [...plans].sort((a, b) => b.sizeKB - a.sizeKB).slice(0, 12)) {
    console.error(`  ${String(plan.sizeKB).padStart(7)} KB  ${plan.label}`)
  }
  process.exit(1)
}

// Regenera todo salvo new/ (SPEC-N/T-091/AC-1: la copia de los modelos nuevos
// la hace `pnpm models:new`; este tool no los toca).
if (existsSync(OUT)) {
  for (const name of readdirSync(OUT)) {
    if (name === 'new') continue
    rmSync(join(OUT, name), { recursive: true, force: true })
  }
}
for (const plan of plans) {
  mkdirSync(dirname(plan.to), { recursive: true })
  copyFileSync(plan.from, plan.to)
}
for (const pack of licenses) {
  const packDir = join(SRC, 'kenney', pack)
  if (!existsSync(packDir)) continue
  const license = readdirSync(packDir).find((name) => /license/i.test(name))
  if (license === undefined) continue
  mkdirSync(join(OUT, pack), { recursive: true })
  copyFileSync(join(packDir, license), join(OUT, pack, license))
}
if (plans.length > 0) {
  writeFileSync(
    join(OUT, 'README.md'),
    '# Modelos importados (T-070)\n\nCarpeta GENERADA por `pnpm models:import`. Kenney CC0 (ver License.txt por pack).\n`hgss/` es de uso privado: NO se commitea ni se publica (docs/PRIVACY-DEPLOY.md).\n',
    'utf8',
  )
}
console.log(
  `models:import OK — ${String(plans.length)} archivo(s), ${String(Math.round(totalKB))} KB de ${String(maxModelsMB * 1024)} KB → apps/web/public/models/`,
)
