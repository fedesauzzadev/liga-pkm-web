// AC: SPEC-F/T-002b — esquemas del contenido nuevo (multicolor, decks/items/
// energy/gyms, variantes, efectos nuevos). Un test por AC del spec.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  AttackSchema,
  DecksFileSchema,
  EffectSchema,
  EnergyFileSchema,
  GymLeaderSchema,
  HouseEditsFileSchema,
  PokemonCardSchema,
  crossCheckDecks,
  deckTotals,
  type DecksFile,
  type EnergyFile,
  type PokemonCard,
} from '../packages/content/src/index.ts'
import { collect, crossCheckCosts, validateContent, type PokemonFileLoaded } from '../packages/content/src/validate.ts'

const contentDir = join(process.cwd(), 'content')
const atk = {
  id: 'placaje',
  name: 'Placaje',
  kind: 'attack',
  rollFaces: [1, 2],
  cost: [],
  element: 'normal',
  damage: { base: 10 },
  effects: [],
  rawText: '',
} as const
const card = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'fixture',
  dex: 10,
  name: 'Fixture',
  stage: 'basic',
  deck: 'bosque',
  hp: 40,
  element: 'grass',
  attacks: [{ ...atk }],
  specialties: [],
  evolvesTo: [],
  source: { verified: false },
  ...overrides,
})
const readDecks = (): unknown => JSON.parse(readFileSync(join(contentDir, 'decks.json'), 'utf8'))
const readEnergy = (): unknown => JSON.parse(readFileSync(join(contentDir, 'energy.json'), 'utf8'))

// AC: SPEC-F/T-002b/AC-1 — esquemas para decks/items/energy/gyms/house-edits
// y ruleset con las claves nuevas; el contenido real del repo valida.
test('AC-1 decks/items/energy/gyms/house-edits/ruleset validan con las claves nuevas', () => {
  const report = validateContent(contentDir)
  expect(report.errors, report.errors.join('\n')).toEqual([])
  expect(report.ok).toBe(true)
  const { content } = collect(contentDir)
  expect(content).not.toBeNull()
  if (content === null) return
  expect(content.ruleset.start.multicolor).toBe(2)
  expect(content.ruleset.features.sorpresaDeck).toBe(true)
  expect(content.ruleset.features.houseEdits).toBe(true)
  expect(content.ruleset.capture.masterball.guaranteed).toBe(true)
  expect(content.ruleset.oportunidad.minMedals).toBe(4)
  expect(content.items.map((i) => i.id)).toContain('multicolor')
  expect(content.energy.types.length).toBe(15)
  expect(content.gyms.map((l) => l.id)).toContain('giovanni')

  const example = JSON.parse(readFileSync(join(contentDir, 'house-edits', '_example.json'), 'utf8'))
  expect(HouseEditsFileSchema.safeParse(example).success).toBe(true)
})

// AC: SPEC-F/T-002b/AC-2 — variant?, id único (dex repetible), canOpen?,
// efectos fixedRolls/nextAttackBonus y onRoll común.
test('AC-2 variant/canOpen/fixedRolls/nextAttackBonus/onRoll validan; dex repetido con ids distintos pasa', () => {
  const magmarA = PokemonCardSchema.parse(card({ id: 'magmar_a', dex: 126, variant: 'a' }))
  const magmarB = PokemonCardSchema.parse(card({ id: 'magmar_b', dex: 126, variant: 'b' }))
  expect(magmarA.variant).toBe('a')
  expect(magmarB.variant).toBe('b')

  expect(AttackSchema.safeParse({ ...atk, canOpen: true }).success).toBe(true)

  expect(EffectSchema.safeParse({ op: 'fixedRolls', rolls: 3, faces: [1, 2, 3], amount: 30 }).success).toBe(true)
  expect(EffectSchema.safeParse({ op: 'fixedRolls', rolls: 4, faces: [1], amount: 10 }).success).toBe(false)
  expect(EffectSchema.safeParse({ op: 'nextAttackBonus', amount: 30 }).success).toBe(true)
  // onRoll: campo común opcional (EFFECTS §1).
  expect(
    EffectSchema.safeParse({
      op: 'rollGate', failFaces: [1, 2, 3], outcome: 'selfHit', duration: 'combat', onRoll: [4, 5, 6],
    }).success,
  ).toBe(true)

  // El dex puede repetirse: dos cartas con el mismo dex validan por separado.
  const sameDex = PokemonCardSchema.parse(card({ id: 'otro', dex: 126 }))
  expect(sameDex.dex).toBe(magmarA.dex)
})

// AC: plan costo-normal-any/AC-1+AC-2 — el círculo gris es `any` (D-24): el
// validador rechaza slots de costo de elementos sin carta de energía
// (normal/dragon) sugiriendo `any`; Charmeleon "Rasguños" quedó en ["any","any"].
test('AC-2 (costo-normal-any) costos con elementos sin carta de energía se rechazan sugiriendo any', () => {
  const energy = EnergyFileSchema.parse(readEnergy()) as EnergyFile
  const badNormal = PokemonCardSchema.parse(card({ attacks: [{ ...atk, cost: ['normal', 'normal'] }] }))
  const badDragon = PokemonCardSchema.parse(card({ id: 'dratini', attacks: [{ ...atk, cost: ['dragon'] }] }))
  const good = PokemonCardSchema.parse(card({ attacks: [{ ...atk, cost: ['any', 'any'] }] }))
  const files = (cards: readonly PokemonCard[]): PokemonFileLoaded[] => [
    { file: 'content/pokemon/_test.json', cards: [...cards], pending: [] },
  ]
  const errors = crossCheckCosts(files([badNormal, badDragon, good]), energy)
  expect(errors).toHaveLength(2) // ['normal','normal'] cuenta 1 (dedup por ataque)
  expect(errors.join('\n')).toContain('normal')
  expect(errors.join('\n')).toContain('dragon')
  expect(errors.join('\n')).toContain('any')
  expect(crossCheckCosts(files([good]), energy)).toEqual([])

  // AC: plan costo-normal-any/AC-1 — el contenido real valida y Charmeleon
  // "Rasguños" ya no exige energías Normal.
  const { content, errors: realErrors } = collect(contentDir)
  expect(realErrors).toEqual([])
  const charmeleon = content?.cards.find((c) => c.id === 'charmeleon')
  expect(charmeleon?.attacks[0]?.cost).toEqual(['any', 'any'])
})

// AC: SPEC-F/T-002b/AC-3 — chequeos cruzados: energías por mazo, ítems = 60,
// Sorpresa no-PKM = 12, tipos de energía existen con energyCard:true.
test('AC-3 crossCheckDecks valida energías/ítems/sorpresa y rechaza totales rotos', () => {
  const decks = structuredClone(DecksFileSchema.parse(readDecks())) as DecksFile
  const energy = EnergyFileSchema.parse(readEnergy()) as EnergyFile
  expect(crossCheckDecks(decks, energy).errors).toEqual([])

  decks.terrain.bosque.energy.grass = 21 // 41 ≠ 40
  expect(crossCheckDecks(decks, energy).errors.join('\n')).toContain('bosque')

  const badItem = structuredClone(DecksFileSchema.parse(readDecks())) as DecksFile
  badItem.item.pokeball = 31 // suma 61 ≠ 60
  expect(crossCheckDecks(badItem, energy).errors.join('\n')).toContain('Ítem')

  const badSorpresa = structuredClone(DecksFileSchema.parse(readDecks())) as DecksFile
  badSorpresa.sorpresa.masterball = 2 // no-PKM = 13 ≠ 12
  expect(crossCheckDecks(badSorpresa, energy).errors.join('\n')).toContain('Sorpresa')

  const noCard = structuredClone(EnergyFileSchema.parse(readEnergy())) as EnergyFile
  noCard.types[0]!.energyCard = false // grass deja de tener carta de energía
  expect(crossCheckDecks(decks, noCard).errors.join('\n')).toContain('energy.json')
})

// AC: SPEC-F/T-002b/AC-4 — content:validate imprime totales por mazo y marca
// VERIFY (warning) si un mazo completo no suma 60.
test('AC-4 totales por mazo en stats y warning VERIFY cuando el mazo completo no suma 60', () => {
  const report = validateContent(contentDir)
  const totals = report.stats.decks
  expect(totals?.map((t) => `${t.deck}:${t.energy}`)).toEqual([
    'bosque:40', 'montana:40', 'isla:38', 'llanura:38', 'pantano:40',
  ])
  // Con las listas `pokemon` aún vacías no hay VERIFY (los PKM no cargaron).
  expect(report.warnings.join('\n')).not.toContain('VERIFY')

  // Mazo "completo" (isla 38+20=58 ≠ 60) ⇒ warning VERIFY, no error.
  const decks = structuredClone(DecksFileSchema.parse(readDecks())) as DecksFile
  decks.terrain.isla.pokemon = Array.from({ length: 20 }, (_, i) => `isla_pkm_${i}`)
  const energy = EnergyFileSchema.parse(readEnergy()) as EnergyFile
  const check = crossCheckDecks(decks, energy)
  expect(check.errors).toEqual([])
  expect(check.warnings.join('\n')).toContain('VERIFY')
  expect(check.warnings.join('\n')).toContain('isla')
  expect(deckTotals(decks).isla?.total).toBe(58)
})

// AC: SPEC-F/T-002b/AC-5 — los gimnasios salen de content/gyms.json; el bloque
// gyms de kanto.json se ignora con warning.
test('AC-5 líderes desde content/gyms.json; bloque gyms de kanto.json obsoleto con warning', () => {
  const { content } = collect(contentDir)
  expect(content?.gyms.find((l) => l.id === 'brock')?.medal).toBe('Roca')
  expect(content?.gyms.find((l) => l.id === 'giovanni')?.requiresMedals).toBe(7)
  expect(
    GymLeaderSchema.safeParse({
      id: 'brock', name: 'Brock', city: 'plateada', cityLabel: 'Ciudad Plateada',
      medal: 'Roca', prize: { from: 'llanura', count: 1 }, pokemonCount: 2,
    }).success,
  ).toBe(true)

  const report = validateContent(contentDir)
  expect(report.warnings.join('\n')).toContain('gyms')
  expect(report.warnings.join('\n')).toContain('obsoleto')
})

// AC: SPEC-F/T-002b/AC-6 — el viejo nombre de Multicolor ya no existe en el código.
test('AC-6 sin el viejo nombre de Multicolor en packages, apps y tests', () => {
  const roots = ['packages/content/src', 'packages/engine/src', 'apps/web/src', 'tests', 'tools']
  const hits: string[] = []
  for (const root of roots) {
    for (const file of walk(join(process.cwd(), root))) {
      if (file.endsWith('t002b-content.test.ts')) continue // este test nombra la palabra
      if (!/\.(ts|tsx|css|json)$/.test(file)) continue
      const text = readFileSync(file, 'utf8')
      // Identificadores del viejo nombre (case-sensitive: `wildCard` = PKM salvaje,
      // otro concepto) + la palabra en español en cualquier grafía.
      if (/wildcards|Wildcard|WILDCARD/.test(text) || /comod/i.test(text)) hits.push(file)
    }
  }
  expect(hits, `mencionan el viejo nombre: ${hits.join(', ')}`).toEqual([])
})

// AC: SPEC-F/T-002b/AC-7 — las cartas de _samples.json siguen validando.
test('AC-7 _samples.json sigue validando (4 cartas, sin errores)', () => {
  const { content, errors } = collect(contentDir)
  expect(errors).toEqual([])
  expect(content?.cards.length).toBeGreaterThanOrEqual(4)
  expect(content?.cards.map((c) => c.id)).toContain('tangela_erika')
})

// ── helpers
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}
