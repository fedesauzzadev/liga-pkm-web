// AC: SPEC-S/T-102e — salida, reporte e integración del lector de cartas:
// JSON validado con Zod en _staging (id/contentHash/source.photo/fromScanner),
// report.html autocontenido (miniaturas, filtros, marcas rojas, customs
// agrupados), /admin/cards los lista y edita, carta de oro (Dratini) punta a
// punta y medición contra cartas verificadas a mano (targets del AC-5).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadEffectPatterns } from '../tools/cards-scan/effects.ts'
import { analyzeCard, type DraftCard } from '../tools/cards-scan/draft.ts'
import { DEFAULT_SCAN_CONFIG, type ConfidenceConfig, type ValidationConfig } from '../tools/cards-scan/config.ts'
import {
  buildStagingCard,
  contentHashOf,
  idify,
  stagingFileName,
  writeStagingFiles,
  type ReportRow,
} from '../tools/cards-scan/staging.ts'
import { buildReportHtml } from '../tools/cards-scan/report.ts'
import { MEASURE_TARGETS, measureCards, loadMeasurePairs } from '../tools/cards-scan/measure.ts'
import { collectCustoms } from '../tools/triage-customs.ts'
import { listAdminCards } from '../apps/web/src/admin/server.ts'
import { PokemonCardSchema, type PokemonCard } from '../packages/content/src/cards.ts'
import type { SpeciesOut } from '../tools/pokeapi.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const patterns = loadEffectPatterns(ROOT)
const V: ValidationConfig = DEFAULT_SCAN_CONFIG.validation
const C: ConfidenceConfig = DEFAULT_SCAN_CONFIG.confidence
const SPECIES: readonly SpeciesOut[] = [{ dex: 147, nameEn: 'Dratini', nameEs: 'Dratini', types: ['dragon'] }]

const FIXTURE = fileURLToPath(new URL('../tools/cards-scan/fixtures/dratini.jpg', import.meta.url))
const SPECIES_FILE = join(ROOT, 'content', 'reference', 'pokeapi', 'species.json')
const GOLDEN = join(ROOT, 'content', 'pokemon', '_golden', 'dratini.expected.json')

const ocr = (text: string, confidence = 0.9): { text: string; confidence: number } => ({ text, confidence })
const icon = (label: string, confidence = 0.95) => ({ label, confidence, distance: 0.02 })

/** Draft de Dratini (mismo contenido que la carta de oro) con íconos ok. */
function dratiniDraft(): DraftCard {
  return analyzeCard(
    {
      group: 'terrain',
      name: ocr('Dratini'),
      hp: ocr('(50)'),
      blocks: [
        { kind: 'attack', text: ocr('4-5_ Envolver: 4-5-6 tu rival no atacará.'), damage: ocr('(10)') },
        { kind: 'attack', text: ocr('3_ “Agilidad”: Dratini empieza atacando cada combate. 4-5-6 atacá de nuevo.'), damage: ocr('', 0) },
        { kind: 'attack', text: ocr('1-2_ Attack-trueno: si tu rival saca 1-2 no ataca.'), damage: ocr('(20)') },
      ],
      footerStage: ocr('Básico'),
      footerRight: ocr('E: Dragonair (2)'),
      species: SPECIES,
      deckHint: 'montana',
      icons: {
        element: icon('dragon'),
        deck: icon('montana'),
        costs: [[icon('any')], [icon('any')], [icon('electric')]],
      },
    },
    V,
    C,
  )
}

// AC: SPEC-S/T-102e/AC-1 — para cada imagen se escribe el JSON validado con
// Zod (PokemonCard) en _staging: id = idify(nombre) (snake_case del repo:
// 'attack_trueno'), source {photo, verified:false} y contentHash de los
// ataques normalizados (estable y distinto si cambia un ataque). Las cartas
// que no alcanzan para el esquema van a _staging/_errors con el motivo
// (convención T-041; el admin y los validadores las saltan).
test('AC: SPEC-S/T-102e/AC-1 JSON validado con Zod, id, contentHash y _errors', () => {
  const built = buildStagingCard(dratiniDraft(), patterns, 'Dratini Montana.jpg')
  expect(built.kind).toBe('ok')
  if (built.kind !== 'ok') return
  expect(PokemonCardSchema.safeParse(built.card).success).toBe(true)
  expect(built.card.id).toBe('dratini')
  expect(built.card.source).toEqual({ photo: 'Dratini Montana.jpg', verified: false })
  expect(built.card.attacks.map((a) => a.id)).toEqual(['envolver', 'agilidad', 'attack_trueno'])
  expect(built.card.attacks.map((a) => a.rawText)).toEqual([
    '4-5-6 tu rival no atacará.',
    'Dratini empieza atacando cada combate. 4-5-6 atacá de nuevo.',
    'si tu rival saca 1-2 no ataca.',
  ])
  // Habilidad sin número de daño ⇒ base 0 (la carta no trae daño).
  expect(built.card.attacks[1]?.damage.base).toBe(0)
  expect(built.meta.contentHash).toMatch(/^[0-9a-f]{12,}$/)
  expect(contentHashOf(built.card)).toBe(built.meta.contentHash)
  const otra = { ...built.card, attacks: [{ ...built.card.attacks[0]!, damage: { base: 30 } }, ...built.card.attacks.slice(1)] }
  expect(contentHashOf(otra as PokemonCard)).not.toBe(built.meta.contentHash)

  // Sin HP ⇒ inválida con motivo, sin inventar datos.
  const sinHp = buildStagingCard(analyzeCard({ group: 'terrain', name: ocr('Dratini'), hp: ocr('xx', 0), blocks: dratiniDraft().attacks.map(() => ({ kind: 'attack' as const, text: ocr('4-5_ A: t'), damage: ocr('(10)') })), footerStage: ocr('Básico'), footerRight: ocr(''), species: SPECIES, deckHint: 'montana' }, V, C), patterns, 'x.jpg')
  expect(sinHp.kind).toBe('invalid')
  if (sinHp.kind === 'invalid') expect(sinHp.issues.join(' ')).toMatch(/hp/i)

  // idify: snake_case sin tildes (convención del repo: doble_bofeton).
  expect(idify('Attack-trueno')).toBe('attack_trueno')
  expect(idify('Doble bofetón')).toBe('doble_bofeton')
  expect(stagingFileName('Tangela B Bosque.jpg')).toBe('tangela_b_bosque.json')

  // writeStagingFiles: válida a _staging/<base>.json (fromScanner + cards),
  // inválida a _staging/_errors/<base>.json con issues; y PODA los
  // fromScanner viejos que ya no tienen escaneo (renombres del dueño).
  const tmp = mkdtempSync(join(tmpdir(), 't102e-staging-'))
  try {
    writeFileSync(join(tmp, 'viejo.json'), JSON.stringify({ fromScanner: true, cards: [] }))
    writeFileSync(join(tmp, 'curada.json'), JSON.stringify({ cards: [] }))
    const invalidDraft = analyzeCard({ group: 'terrain', name: ocr('??', 0), hp: ocr('xx', 0), blocks: [], footerStage: ocr('??', 0), footerRight: ocr(''), species: SPECIES }, V, C)
    const res = writeStagingFiles(tmp, [
      { file: 'Dratini Montana.jpg', status: 'ok', draft: dratiniDraft() },
      { file: 'Roto Bosque.jpg', status: 'error', error: 'no parece una carta' },
      { file: 'Sin HP Isla.jpg', status: 'ok', draft: invalidDraft },
    ])
    expect(res.valid).toBe(1)
    expect(res.invalid).toBe(1)
    expect(res.errors).toBe(1)
    const doc = JSON.parse(readFileSync(join(tmp, 'dratini_montana.json'), 'utf8')) as Record<string, unknown>
    expect(doc.fromScanner).toBe(true)
    expect((doc.cards as PokemonCard[])[0]?.id).toBe('dratini')
    expect(doc.needsReview).toBe(true) // hay una habilidad ⇒ revisión
    expect(typeof doc.contentHash).toBe('string')
    expect(typeof doc.confidence).toBe('object')
    const err = JSON.parse(readFileSync(join(tmp, '_errors', 'sin_hp_isla.json'), 'utf8')) as Record<string, unknown>
    expect(err.fromScanner).toBe(true)
    expect(Array.isArray(err.issues)).toBe(true)
    expect(Array.isArray((err as { cards?: unknown }).cards)).toBe(false)
    // Poda: el fromScanner sin escaneo se borra; el curado (sin marca) queda.
    expect(existsSync(join(tmp, 'viejo.json'))).toBe(false)
    expect(existsSync(join(tmp, 'curada.json'))).toBe(true)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102e/AC-2 — report.html AUTOCONTENIDO (sin servidor): hoja de
// contacto con miniatura base64 + resumen legible (nombre, HP, elemento,
// ataques con caras/daño/costo y efectos), marcas rojas donde hay needsReview,
// filtros todas/con revisión/con custom/con error, resumen estadístico al
// inicio y los textos custom agrupados y contados.
test('AC: SPEC-S/T-102e/AC-2 report.html autocontenido con filtros y estadísticas', () => {
  const built = buildStagingCard(dratiniDraft(), patterns, 'Dratini Montana.jpg')
  if (built.kind !== 'ok') throw new Error('la carta de prueba debió ser válida')
  const rows: readonly ReportRow[] = [
    { file: 'Dratini Montana.jpg', base: 'dratini_montana', status: 'ok', needsReview: true, customCount: 0, unmatched: [], card: built.card, confidence: built.meta.confidence, contentHash: built.meta.contentHash ?? undefined, thumb: 'data:image/jpeg;base64,AAA' },
    { file: 'Roto Bosque.jpg', base: 'roto_bosque', status: 'error', needsReview: false, customCount: 0, unmatched: [], confidence: 0, error: 'no parece una carta' },
    { file: 'Con Custom Isla.jpg', base: 'con_custom_isla', status: 'invalid', needsReview: true, customCount: 1, unmatched: ['hace (+10) por cada energia'], issues: ['hp'], confidence: 0.2 },
  ]
  const html = buildReportHtml(rows, { total: 3, valid: 1, invalid: 1, review: 2, custom: 1, errors: 1, avgMs: 1234, unmatchedGroups: [{ text: 'hace (+10) por cada energia', count: 3 }], repeats: [] })
  expect(html).toContain('<html')
  expect(html).toContain('data:image/jpeg;base64,AAA') // miniatura embebida
  expect(html).toContain('data-f="todas"') // filtros
  for (const f of ['todas', 'revision', 'custom', 'error']) expect(html).toContain(`data-f="${f}"`)
  expect(html).toMatch(/REVISAR|revisar/) // marca roja
  expect(html).toContain('Envolver') // resumen legible del ataque
  expect(html).toContain('4-5-6') // caras del ataque
  expect(html).toContain('no parece una carta') // errores visibles
  expect(html).toContain('hace (+10) por cada energia') // customs agrupados y contados
  expect(html).toContain('×3') // conteo del grupo
  expect(html).not.toMatch(/src="http|href="http/) // autocontenido, sin servidor
})

// AC: SPEC-S/T-102e/AC-2 (integración) — el lote cards:scan escribe _staging
// y report.html al final (desde el caché del outDir, solo los archivos de
// esta corrida) y el resumen del lote incluye el tiempo medio por carta.
test('AC: SPEC-S/T-102e/AC-2 scanBatch escribe _staging y report.html', async () => {
  const { scanBatch } = await import('../tools/cards-scan/run.ts')
  const { syntheticCard } = await import('../tools/cards-scan/synth.ts')
  const tmp = mkdtempSync(join(tmpdir(), 't102e-run-'))
  try {
    writeFileSync(join(tmp, 'carta.png'), await syntheticCard({ attacks: 2, icons: { element: '#e08020', deck: '#54346e', costs: [['any'], ['#f0c828']] } }))
    const fakeEngine = { recognize: async () => ({ text: 'x', confidence: 0.5 }), terminate: async () => undefined }
    const res = await scanBatch({ input: tmp, outDir: tmp, engine: fakeEngine })
    expect(res.ok).toBe(true)
    expect(existsSync(join(tmp, 'report.html'))).toBe(true)
    const html = readFileSync(join(tmp, 'report.html'), 'utf8')
    expect(html).toContain('carta.png')
    // OCR falso ⇒ carta inválida ⇒ _errors; el reporte la lista en rojo.
    expect(readdirSync(join(tmp, '.staging', '_errors'))).toContain('carta.json')
    expect(typeof res.msPerCard).toBe('number')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102e/AC-3 — /admin/cards (T-040) lista las cartas del lector:
// el archivo con cards[] aparece con su id; _errors/ (subcarpeta) no se lista.
test('AC: SPEC-S/T-102e/AC-3 /admin/cards lista y edita las cartas de _staging', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't102e-admin-'))
  try {
    const staging = join(tmp, 'pokemon', '_staging')
    mkdirSync(join(staging, '_errors'), { recursive: true })
    const built = buildStagingCard(dratiniDraft(), patterns, 'Dratini Montana.jpg')
    if (built.kind !== 'ok') throw new Error('draft inválido')
    writeFileSync(join(staging, 'dratini_montana.json'), JSON.stringify({ fromScanner: true, cards: [built.card] }))
    writeFileSync(join(staging, '_errors', 'roto.json'), JSON.stringify({ fromScanner: true, issues: ['hp'] }))
    const listado = listAdminCards(tmp)
    const file = listado.files.find((f) => f.file === 'content/pokemon/_staging/dratini_montana.json')
    expect(file).toBeDefined()
    expect(file?.cards.map((c) => c.id)).toEqual(['dratini'])
    expect(listado.files.some((f) => f.file.includes('_errors'))).toBe(false)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102e/AC-4 — carta de oro: con fixtures/dratini.jpg la salida
// punta a punta (normalizar + segmentar + OCR real + íconos + efectos +
// staging) coincide con dratini.expected.json en TODOS los campos salvo
// source y confidence. Se omite si no hay fixture/especies (gitignored).
const tieneFixture = existsSync(FIXTURE) && existsSync(SPECIES_FILE)
test.skipIf(!tieneFixture)('AC: SPEC-S/T-102e/AC-4 carta de oro: Dratini punta a punta', { timeout: 180_000 }, async (ctx) => {
  const { normalizeScan } = await import('../tools/cards-scan/image.ts')
  const { segmentCard } = await import('../tools/cards-scan/segment.ts')
  const { extractIcons } = await import('../tools/cards-scan/icons.ts')
  const { groupIcons, buildLabels } = await import('../tools/cards-scan/iconlearn.ts')
  const { classifyCardIcons } = await import('../tools/cards-scan/iclassify.ts')
  const { readCardRegions, createTesseractEngine } = await import('../tools/cards-scan/ocr.ts')
  let engine: Awaited<ReturnType<typeof createTesseractEngine>>
  try {
    engine = await createTesseractEngine(DEFAULT_SCAN_CONFIG.ocr)
  } catch {
    ctx.skip() // sin red ni caché de idioma: el golden se omite (SPEC-S/T-102a/AC-5)
    return
  }
  try {
    const norm = await normalizeScan(readFileSync(FIXTURE))
    expect(norm.ok).toBe(true)
    if (!norm.ok) return
    const seg = await segmentCard(norm.png)
    expect(seg.ok).toBe(true)
    if (!seg.ok) return
    // Íconos: aprendizaje sobre la propia carta etiquetado por ROL (hermético,
    // no depende del icon-labels.json del dueño) — mismo criterio que T-102c.
    const icons = await extractIcons(norm.png, seg.segmentation, DEFAULT_SCAN_CONFIG)
    const patches = [
      ...(icons.element !== null ? [{ patch: icons.element, file: 'dratini.jpg', thumb: '' }] : []),
      ...(icons.deck !== null ? [{ patch: icons.deck, file: 'dratini.jpg', thumb: '' }] : []),
      ...icons.costs.flat().map((p) => ({ patch: p, file: 'dratini.jpg', thumb: '' })),
    ]
    const groups = groupIcons(patches as never, DEFAULT_SCAN_CONFIG.icons.groupThreshold)
    const byId: Record<string, string> = {}
    for (const g of groups) {
      if (g.allGray) byId[g.id] = 'any'
      else if (g.examples[0]?.role === 'element') byId[g.id] = 'dragon'
      else if (g.examples[0]?.role === 'deck') byId[g.id] = 'montana'
      else if (g.examples[0]?.attackIndex === 2) byId[g.id] = 'electric'
      else byId[g.id] = 'otro'
    }
    const labels = buildLabels(groups, byId)
    const classes = classifyCardIcons(icons, labels, DEFAULT_SCAN_CONFIG.icons.maxDistance)
    const species = (JSON.parse(readFileSync(SPECIES_FILE, 'utf8')) as { species: SpeciesOut[] }).species
    const regions = await readCardRegions(norm.png, seg.segmentation, engine, DEFAULT_SCAN_CONFIG)
    const draft = analyzeCard({ ...regions, group: 'terrain', species, deckHint: 'montana', icons: classes }, V, C)
    const built = buildStagingCard(draft, patterns, 'dratini.jpg')
    expect(built.kind).toBe('ok')
    if (built.kind !== 'ok') return
    const expected = JSON.parse(readFileSync(GOLDEN, 'utf8')) as PokemonCard & { _comment?: string }
    const { source: _s, _comment: _c, ...esperado } = expected
    const { source: _s2, ...salida } = built.card
    expect(salida).toEqual(esperado)
  } finally {
    await engine.terminate()
  }
})

// AC: SPEC-S/T-102e/AC-5 — medición contra cartas verificadas a mano: los
// targets del spec (nombre/HP/etapa/evolución ≥95 %, caras y nombre de ataque
// ≥90 %, costos ≥95 %, efectos exactos ≥70 %, custom ≤20 %, ≤6 s por carta)
// y el cálculo exacto de tasas + errores más frecuentes sobre pares sintéticos.
test('AC: SPEC-S/T-102e/AC-5 measureCards: targets, tasas exactas y errores frecuentes', () => {
  expect(MEASURE_TARGETS).toEqual({ identity: 0.95, attacks: 0.9, costs: 0.95, effectsExact: 0.7, customMax: 0.2, msPerCard: 6 })
  const atk = (n: string, faces: number[], cost: string[], effects: unknown[] = []): PokemonCard['attacks'][number] => ({
    id: idify(n), name: n, kind: 'attack', rollFaces: faces as never, cost: cost as never, element: 'normal',
    damage: { base: 10 }, effects: effects as never, rawText: 't',
  })
  const card = (hp: number, attacks: PokemonCard['attacks']): PokemonCard => ({
    id: 'x', dex: 1, name: 'X', stage: 'basic', deck: 'bosque', hp, element: 'grass',
    attacks, specialties: [], evolvesTo: [{ id: 'y', xp: 2 }], source: { verified: false },
  })
  const bien = card(50, [atk('Envolver', [4, 5], ['any']), atk('Hojas', [1], ['grass'])])
  const pares = [
    { staged: bien, truth: bien }, // todo bien
    { staged: card(60, [atk('Envolver', [4, 5], ['any']), atk('Hojas', [1], ['grass'])]), truth: bien }, // hp mal
    { staged: card(50, [atk('Envolve', [4, 6], ['any']), atk('Hojas', [1, 2], ['fire'])]), truth: bien }, // nombre de atk + caras + costo mal
    { staged: card(50, [atk('Envolver', [4, 5], ['any'], [{ op: 'custom', handler: 'TODO', rawText: 'raro' }]), atk('Hojas', [1], ['grass'])]), truth: bien }, // custom
  ]
  const m = measureCards(pares)
  expect(m.cards).toBe(4)
  expect(m.nameRate).toBe(1)
  expect(m.hpRate).toBe(0.75)
  expect(m.stageRate).toBe(1)
  expect(m.evolvesToRate).toBe(1)
  expect(m.attackNameRate).toBeCloseTo(0.875) // 7/8
  expect(m.facesRate).toBeCloseTo(0.75) // 6/8 (los 2 ataques del par 3)
  expect(m.costRate).toBeCloseTo(0.875) // 7/8
  expect(m.effectsRate).toBeCloseTo(0.875) // 7/8 (custom ≠ exacto)
  expect(m.customRate).toBeCloseTo(0.125) // 1/8
  expect(m.meetsTargets).toBe(false)
  expect(m.frequentErrors[0]).toMatchObject({ field: 'caras' })
  // Set perfecto de 20: cumple todos los targets.
  const perfectos = Array.from({ length: 20 }, () => ({ staged: bien, truth: bien }))
  const ok20 = measureCards(perfectos)
  expect(ok20.meetsTargets).toBe(true)
  expect(ok20.hpRate).toBe(1)
})

// AC: SPEC-S/T-102e/AC-5 (pares) — loadMeasurePairs empareja el staging del
// lector (fromScanner) con los <base>.expected.json que el dueño verifica a
// mano y avisa los que quedaron sin par.
test('AC: SPEC-S/T-102e/AC-5 loadMeasurePairs empareja staging con la verificación manual', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't102e-pairs-'))
  try {
    const staging = join(tmp, 'staging')
    const truth = join(tmp, 'golden')
    mkdirSync(staging, { recursive: true })
    mkdirSync(truth, { recursive: true })
    const built = buildStagingCard(dratiniDraft(), patterns, 'Dratini Montana.jpg')
    if (built.kind !== 'ok') throw new Error('draft inválido')
    for (const base of ['dratini_montana', 'otra_carta']) {
      writeFileSync(join(staging, `${base}.json`), JSON.stringify({ fromScanner: true, photo: `${base}.jpg`, cards: [built.card] }))
    }
    writeFileSync(join(truth, 'dratini_montana.expected.json'), JSON.stringify(built.card))
    const { pairs, missing } = loadMeasurePairs(staging, truth)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.staged.id).toBe('dratini')
    expect(missing).toEqual(['otra_carta'])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102e/AC-6 — el flujo nuevo (scans/<grupo>/<mazo>, cards:scan,
// cards:icons:learn, reporte, revisión, medición) queda documentado en
// docs/CARD-INGESTION.md.
test('AC: SPEC-S/T-102e/AC-6 CARD-INGESTION documenta el flujo del lector', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'CARD-INGESTION.md'), 'utf8')
  for (const marca of ['content/photos/scans', 'cards:scan', 'cards:icons:learn', 'report.html', 'cards:measure', '_staging']) {
    expect(doc).toContain(marca)
  }
})

// Integración (triage-customs): los archivos del lector llevan fromScanner y
// sus customs NO cuentan para el triage (se trackean en report.html hasta que
// el dueño los revisa; al guardarlos desde /admin/cards pierden la marca y
// vuelven al flujo normal de ER/patrones).
test('Integración: triage-customs salta los archivos fromScanner', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't102e-triage-'))
  try {
    const staging = join(tmp, 'pokemon', '_staging')
    mkdirSync(staging, { recursive: true })
    const custom = { op: 'custom', handler: 'TODO', rawText: 'texto sin patron' }
    const cardConCustom = { id: 'x', attacks: [{ id: 'a', effects: [custom] }], specialties: [] }
    writeFileSync(join(staging, 'scanner.json'), JSON.stringify({ fromScanner: true, cards: [cardConCustom] }))
    writeFileSync(join(staging, 'curada.json'), JSON.stringify({ cards: [cardConCustom] }))
    const colecta = collectCustoms(tmp)
    expect(colecta.instances).toHaveLength(1)
    expect(colecta.instances[0]?.file).toBe('pokemon/_staging/curada.json')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// helper para el hash de repetidas (usa createHash como el staging).
test('contentHash detecta repetidas (D-25)', () => {
  const a = buildStagingCard(dratiniDraft(), patterns, 'A.jpg')
  const b = buildStagingCard(dratiniDraft(), patterns, 'B.jpg')
  if (a.kind !== 'ok' || b.kind !== 'ok') throw new Error('draft inválido')
  expect(a.meta.contentHash).toBe(b.meta.contentHash) // mismas cartas ⇒ mismo hash
  const hash = createHash('sha1')
  expect(hash.digest('hex').length).toBeGreaterThan(0)
})
