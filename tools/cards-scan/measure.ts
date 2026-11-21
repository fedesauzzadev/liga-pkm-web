// cards-scan/measure (SPEC-S/T-102e/AC-5) — medición del lector contra las
// primeras cartas que el dueño verifica a mano: empareja el staging del lector
// (fromScanner) con los <base>.expected.json (formato carta de oro) y calcula
// las tasas del spec: nombre/HP/etapa/evolución ≥ 95 %, caras y nombre de
// ataque ≥ 90 %, costos ≥ 95 %, efectos exactos ≥ 70 %, custom ≤ 20 % (y el
// tiempo medio por carta lo mide cards:scan; target ≤ 6 s). Núcleo puro.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PokemonCard } from '../../packages/content/src/cards.ts'

/** Targets del spec (SPEC-S/T-102e/AC-5); msPerCard en segundos. */
export const MEASURE_TARGETS = { identity: 0.95, attacks: 0.9, costs: 0.95, effectsExact: 0.7, customMax: 0.2, msPerCard: 6 } as const

export interface MeasurePair {
  readonly base: string
  readonly staged: PokemonCard
  readonly truth: PokemonCard
}

export interface FreqError {
  readonly field: string
  readonly count: number
}

export interface MeasureMetrics {
  readonly cards: number
  readonly nameRate: number
  readonly hpRate: number
  readonly stageRate: number
  readonly evolvesToRate: number
  readonly attackNameRate: number
  readonly facesRate: number
  readonly costRate: number
  readonly effectsRate: number
  readonly customRate: number
  readonly frequentErrors: readonly FreqError[]
  readonly meetsTargets: boolean
}

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const evoSet = (c: PokemonCard): string[] => c.evolvesTo.map((e) => `${e.id}:${e.xp}`).sort()

/** Comparación par por par + tasas globales (denominadores: cartas / ataques). */
export function measureCards(pairs: readonly { staged: PokemonCard; truth: PokemonCard }[]): MeasureMetrics {
  const errs = new Map<string, number>()
  const miss = (field: string): void => {
    errs.set(field, (errs.get(field) ?? 0) + 1)
  }
  let name = 0
  let hp = 0
  let stage = 0
  let evo = 0
  let atkName = 0
  let faces = 0
  let cost = 0
  let effects = 0
  let custom = 0
  let attacks = 0
  for (const { staged, truth } of pairs) {
    if (staged.name.toLowerCase() === truth.name.toLowerCase()) name += 1
    else miss('nombre')
    if (staged.hp === truth.hp) hp += 1
    else miss('hp')
    if (staged.stage === truth.stage) stage += 1
    else miss('etapa')
    if (eq(evoSet(staged), evoSet(truth))) evo += 1
    else miss('evolucion')
    const n = Math.max(staged.attacks.length, truth.attacks.length)
    attacks += n
    for (let i = 0; i < n; i++) {
      const s = staged.attacks[i]
      const t = truth.attacks[i]
      if (s === undefined || t === undefined) {
        miss('ataques')
        continue
      }
      if (s.name.toLowerCase() === t.name.toLowerCase()) atkName += 1
      else miss('nombre de ataque')
      if (eq(s.rollFaces, t.rollFaces)) faces += 1
      else miss('caras')
      if (eq(s.cost, t.cost)) cost += 1
      else miss('costos')
      if (eq(s.effects, t.effects)) effects += 1
      else miss('efectos')
      if (s.effects.some((e) => e.op === 'custom')) {
        custom += 1
        miss('custom')
      }
    }
  }
  const cards = pairs.length
  const rate = (hits: number, denom: number): number => (denom === 0 ? 1 : hits / denom)
  const nameRate = rate(name, cards)
  const hpRate = rate(hp, cards)
  const stageRate = rate(stage, cards)
  const evolvesToRate = rate(evo, cards)
  const attackNameRate = rate(atkName, attacks)
  const facesRate = rate(faces, attacks)
  const costRate = rate(cost, attacks)
  const effectsRate = rate(effects, attacks)
  const customRate = rate(custom, attacks)
  const meets =
    cards > 0 &&
    nameRate >= MEASURE_TARGETS.identity &&
    hpRate >= MEASURE_TARGETS.identity &&
    stageRate >= MEASURE_TARGETS.identity &&
    evolvesToRate >= MEASURE_TARGETS.identity &&
    attackNameRate >= MEASURE_TARGETS.attacks &&
    facesRate >= MEASURE_TARGETS.attacks &&
    costRate >= MEASURE_TARGETS.costs &&
    effectsRate >= MEASURE_TARGETS.effectsExact &&
    customRate <= MEASURE_TARGETS.customMax
  const frequentErrors = [...errs.entries()]
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field))
  return { cards, nameRate, hpRate, stageRate, evolvesToRate, attackNameRate, facesRate, costRate, effectsRate, customRate, frequentErrors, meetsTargets: meets }
}

export interface PairsResult {
  readonly pairs: readonly MeasurePair[]
  /** Bases del lector sin verificación manual (todavía no se miden). */
  readonly missing: readonly string[]
}

/** Empareja _staging (fromScanner) con golden/<base>.expected.json. */
export function loadMeasurePairs(stagingDir: string, truthDir: string): PairsResult {
  const pairs: MeasurePair[] = []
  const missing: string[] = []
  if (!existsSync(stagingDir)) return { pairs, missing }
  for (const f of readdirSync(stagingDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!f.isFile() || !f.name.endsWith('.json')) continue
    const base = f.name.replace(/\.json$/, '')
    let doc: unknown
    try {
      doc = JSON.parse(readFileSync(join(stagingDir, f.name), 'utf8')) as unknown
    } catch {
      continue
    }
    if ((doc as { fromScanner?: unknown }).fromScanner !== true) continue // solo el lector
    const card = (doc as { cards?: unknown }).cards
    if (!Array.isArray(card) || card.length === 0) continue
    const truthFile = existsSync(join(truthDir, `${base}.expected.json`)) ? join(truthDir, `${base}.expected.json`) : existsSync(join(truthDir, `${base}.json`)) ? join(truthDir, `${base}.json`) : null
    if (truthFile === null) {
      missing.push(base)
      continue
    }
    pairs.push({ base, staged: card[0] as PokemonCard, truth: JSON.parse(readFileSync(truthFile, 'utf8')) as PokemonCard })
  }
  return { pairs, missing }
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const USAGE = 'uso: pnpm cards:measure [--staging content/pokemon/_staging] [--truth content/photos/scan-reports/golden]'

function parseArgs(argv: readonly string[]): { staging: string; truth: string } | { error: string } {
  let staging = join(repoRoot, 'content', 'pokemon', '_staging')
  let truth = join(repoRoot, 'content', 'photos', 'scan-reports', 'golden')
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const v = argv[i + 1]
    if ((a === '--staging' || a === '--truth') && v !== undefined) {
      if (a === '--staging') staging = v
      else truth = v
      i += 1
    } else return { error: `argumento desconocido o incompleto: ${a ?? ''}\n${USAGE}` }
  }
  return { staging, truth }
}

function cli(argv: readonly string[]): number {
  const args = parseArgs(argv)
  if ('error' in args) {
    console.error(`cards:measure: ${args.error}`)
    return 2
  }
  const { pairs, missing } = loadMeasurePairs(args.staging, args.truth)
  if (pairs.length === 0) {
    console.log(`cards:measure: 0 pares — poné las cartas verificadas a mano en ${args.truth} como <base>.expected.json (formato carta de oro)`)
    return 0
  }
  const m = measureCards(pairs)
  const p = (n: number): string => `${(n * 100).toFixed(1)}%`
  console.log(`cartas medidas: ${m.cards} (sin verificar: ${missing.length})`)
  console.log(`  nombre      ${p(m.nameRate)} (≥95)   HP      ${p(m.hpRate)} (≥95)`)
  console.log(`  etapa       ${p(m.stageRate)} (≥95)   evol.   ${p(m.evolvesToRate)} (≥95)`)
  console.log(`  nom. ataque ${p(m.attackNameRate)} (≥90)   caras  ${p(m.facesRate)} (≥90)`)
  console.log(`  costos      ${p(m.costRate)} (≥95)   efectos ${p(m.effectsRate)} (≥70)`)
  console.log(`  custom      ${p(m.customRate)} (≤20)`)
  console.log(`  targets del spec: ${m.meetsTargets ? 'CUMPLE' : 'NO cumple'} (el tiempo medio lo reporta cards:scan; ≤6 s)`)
  if (m.frequentErrors.length > 0) {
    console.log('  errores más frecuentes:')
    for (const e of m.frequentErrors.slice(0, 10)) console.log(`    ${String(e.count).padStart(3)} × ${e.field}`)
  }
  return 0
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) process.exitCode = cli(process.argv.slice(2))
