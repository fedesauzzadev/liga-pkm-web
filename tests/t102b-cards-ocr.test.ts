// AC: SPEC-S/T-102b — OCR (tesseract.js, motor inyectable) y análisis del
// texto: bloques de ataque (caras/nombre/habilidad/daño base e ifRoll),
// especialidades en MAYÚSCULAS, pie (etapa/evolución/oportunidad, gimnasio),
// validaciones con corrección obvia (5O→50), snap del nombre a PokeAPI y
// confidence/needsReview. Puro salvo el golden (Dratini), que usa el motor
// real solo si hay fixture + caché de idioma (si no, se omite sin fallar).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { syntheticCard } from '../tools/cards-scan/synth.ts'
import { normalizeScan } from '../tools/cards-scan/image.ts'
import { segmentCard } from '../tools/cards-scan/segment.ts'
import { readCardRegions, type OcrEngine, type OcrRead } from '../tools/cards-scan/ocr.ts'
import { analyzeAttack, analyzeSpecialty, analyzeFooter, analyzeGymHeader, levenshtein, parseFaces, snapNameToPokeapi } from '../tools/cards-scan/analyze.ts'
import { analyzeCard } from '../tools/cards-scan/draft.ts'
import { DEFAULT_SCAN_CONFIG, type ConfidenceConfig, type ValidationConfig } from '../tools/cards-scan/config.ts'
import { scanBatch } from '../tools/cards-scan/run.ts'
import type { SpeciesOut } from '../tools/pokeapi.ts'

const FIXTURE = fileURLToPath(new URL('../tools/cards-scan/fixtures/dratini.jpg', import.meta.url))
const SPECIES_FILE = fileURLToPath(new URL('../content/reference/pokeapi/species.json', import.meta.url))

const V: ValidationConfig = DEFAULT_SCAN_CONFIG.validation
const C: ConfidenceConfig = DEFAULT_SCAN_CONFIG.confidence
const ocr = (text: string, confidence = 0.9): OcrRead => ({ text, confidence })

const species: readonly SpeciesOut[] = [
  { dex: 147, nameEn: 'Dratini', nameEs: 'Dratini', types: ['dragon'] },
  { dex: 148, nameEn: 'Dragonair', nameEs: 'Dragonair', types: ['dragon'] },
  { dex: 95, nameEn: 'Onix', nameEs: 'Onix', types: ['rock', 'ground'] },
]

// AC: SPEC-S/T-102b/AC-1 — cada región se lee por separado con el PSM que
// corresponde: nombre y pie/líneas (psm 7), HP solo dígitos (whitelist), texto
// de cada bloque (psm 6) + franja de daño; el motor es inyectable.
test('AC: SPEC-S/T-102b/AC-1 regiones leídas por separado con psm y whitelist correctos', async () => {
  const calls: Array<{ psm: number; whitelist: string | undefined; w: number; h: number }> = []
  const fake: OcrEngine = {
    recognize: async (image, psm, whitelist) => {
      const meta = await sharpMeta(image)
      calls.push({ psm, whitelist, w: meta.w, h: meta.h })
      return ocr('x', 0.5)
    },
    terminate: async () => undefined,
  }
  const norm = await normalizeScan(await syntheticCard({ attacks: 2, specialty: true }))
  if (!norm.ok) throw new Error(norm.error)
  const seg = await segmentCard(norm.png)
  if (!seg.ok) throw new Error(seg.error)
  const regions = await readCardRegions(norm.png, seg.segmentation, fake, DEFAULT_SCAN_CONFIG)
  expect(regions.blocks.length).toBe(3) // especialidad + 2 ataques
  expect(regions.blocks.filter((b) => b.damage !== null)).toHaveLength(2) // solo ataques leen daño
  // nombre: línea; HP: línea con solo dígitos (y paréntesis)
  const nameCall = calls[0]
  const hpCall = calls[1]
  expect(nameCall?.psm).toBe(7)
  expect(hpCall?.psm).toBe(7)
  expect(hpCall?.whitelist).toBe('0123456789()')
  // bloques: psm 6 para el texto de especialidad y ataques; franja de daño psm 7
  expect(calls[2]?.psm).toBe(6)
  expect(calls[3]?.psm).toBe(6)
  expect(calls[4]?.psm).toBe(7)
  expect(calls[4]?.whitelist).toBe('0123456789()')
  // pie: dos franjas de línea
  const lastTwo = calls.slice(-2)
  expect(lastTwo.every((c) => c.psm === 7)).toBe(true)
})

async function sharpMeta(buf: Buffer): Promise<{ w: number; h: number }> {
  const { default: sharp } = await import('sharp')
  const m = await sharp(buf).metadata()
  return { w: m.width ?? 0, h: m.height ?? 0 }
}

// AC: SPEC-S/T-102b/AC-2 — análisis de cada bloque: prefijo `^(\d(?:-\d)*)_`
// → rollFaces; nombre hasta ':'; habilidad si va entre comillas o (sin daño);
// daño entre paréntesis a la derecha → base; `N-N-N (X)` → ifRoll; `(00)` = 0
// con needsReview.
test('AC: SPEC-S/T-102b/AC-2 bloque de ataque: caras, nombre, daño e ifRoll', () => {
  const a = analyzeAttack(ocr('4-5_ Envolver: 4-5-6 tu rival no atacará.'), ocr('(10)', 0.65), V.facesDigits)
  expect(a.rollFaces).toEqual([4, 5])
  expect(a.name).toBe('Envolver')
  expect(a.kind).toBe('attack')
  expect(a.damageBase).toBe(10)
  expect(a.effectText).toBe('4-5-6 tu rival no atacará.')

  // Habilidad: nombre entre comillas (la carta real de Dratini trae “Agilidad”).
  const b = analyzeAttack(ocr('3_ “Agilidad”: Dratini empieza atacando cada combate. 4-5-6 atacá de nuevo.'), ocr('', 0), V.facesDigits)
  expect(b.kind).toBe('ability')
  expect(b.name).toBe('Agilidad')
  expect(b.damageBase).toBeNull()

  // ifRoll dentro del texto: "(10) 4-5-6 (20)".
  const c = analyzeAttack(ocr('1-2_ Golpe: hace (10) y 4-5-6 (20) si sale.'), ocr('(10)'), V.facesDigits)
  expect(c.damageBase).toBe(10)
  expect(c.ifRoll).toEqual({ faces: [4, 5, 6], damage: 20 })

  // (00) = daño 0 admitido, con revisión.
  const d = analyzeAttack(ocr('5_ Placaje: nada.'), ocr('(00)'), V.facesDigits)
  expect(d.damageBase).toBe(0)
  expect(d.needsReview).toBe(true)

  // Habilidad sin comillas inferida por ausencia de daño (nota, no error).
  const e = analyzeAttack(ocr('2_ Refuerzo: sube el daño.'), ocr('', 0), V.facesDigits)
  expect(e.kind).toBe('ability')
  expect(e.notes.join(' ')).toMatch(/habilidad inferida/)

  // (+X) por cada … queda para el mapeador (efecto, no daño).
  const f = analyzeAttack(ocr('6_ Ráfaga: (+10) por cada energía.'), ocr('(20)'), V.facesDigits)
  expect(f.damageBase).toBe(20)
  expect(f.effectText).toContain('(+10) por cada')
})

// AC: SPEC-S/T-102b/AC-3 — especialidades: líneas previas a los ataques que
// empiezan con `^[A-ZÁÉÍÓÚÑ ]{4,}:` (texto original en rawText).
test('AC: SPEC-S/T-102b/AC-3 especialidades en MAYÚSCULAS con dos puntos', () => {
  expect(analyzeSpecialty(ocr('AGILIDAD: este PKM empieza atacando cada combate.'))?.key).toBe('AGILIDAD')
  expect(analyzeSpecialty(ocr('DUREZA: los ataques le hacen (-10).'))?.key).toBe('DUREZA')
  expect(analyzeSpecialty(ocr('Envolver: texto normal de ataque'))).toBeNull()
  expect(analyzeSpecialty(ocr('ABC: demasiado corto'))).toBeNull()
  expect(analyzeSpecialty(ocr('BARRERA: texto'))?.rawText).toContain('BARRERA:')
})

// AC: SPEC-S/T-102b/AC-4 — pie: Básico/Evolución, `E: Nombre (n)`,
// `Oportunidad: n`; gimnasio: `#n` y líder del encabezado, ciudad del pie.
test('AC: SPEC-S/T-102b/AC-4 pie y gimnasio', () => {
  const f1 = analyzeFooter(ocr('Básico'), ocr('E: Dragonair (2)'))
  expect(f1.stage).toBe('basic')
  expect(f1.evolvesTo).toEqual([{ id: 'dragonair', name: 'Dragonair', xp: 2 }])

  expect(analyzeFooter(ocr('Evolución'), ocr('nada')).stage).toBe('evolution')

  const f2 = analyzeFooter(ocr('Básico'), ocr('Oportunidad: 3'))
  expect(f2.chances).toBe(3)
  expect(f2.evolvesTo).toEqual([])

  const g = analyzeGymHeader(ocr('#2 Onix de Brock'))
  expect(g).toEqual({ slot: 2, name: 'Onix', leaderOrTrainer: 'Brock' })
  expect(analyzeGymHeader(ocr('Dratini'))).toBeNull()
})

// AC: SPEC-S/T-102b/AC-5 — validaciones: HP 20-150 múltiplo de 10, daño
// 0-200 múltiplo de 10, caras 1-6 en orden, 1-4 ataques, caras no pisadas;
// corrección obvia única (5O→50) o needsReview.
test('AC: SPEC-S/T-102b/AC-5 validaciones y correcciones obvias', () => {
  expect(parseFaces('4-5', V.facesDigits).faces).toEqual([4, 5])
  expect(parseFaces('4-S', V.facesDigits).faces).toEqual([4, 5])
  expect(parseFaces('4-S', V.facesDigits).corrected).toBe(true)
  expect(parseFaces('5-4', V.facesDigits).faces).toEqual([4, 5]) // orden ascendente
  expect(parseFaces('4-9', V.facesDigits).faces).toBeNull() // cara fuera de 1-6

  const hpOk = analyzeCard(baseInput({ hp: ocr('(50)') }), V, C)
  expect(hpOk.hp.value).toBe(50)
  expect(hpOk.hp.note).toBeUndefined()
  const hpFix = analyzeCard(baseInput({ hp: ocr('(5O)') }), V, C)
  expect(hpFix.hp.value).toBe(50)
  expect(hpFix.hp.note).toMatch(/corregido/)
  const hpBad = analyzeCard(baseInput({ hp: ocr('(77)') }), V, C)
  expect(hpBad.hp.value).toBe(77)
  expect(hpBad.needsReview).toBe(true)

  const dmgBad = analyzeAttack(ocr('1-2_ X: texto'), ocr('(15)'), V.facesDigits)
  expect(dmgBad.notes.join(' ')).toMatch(/no válido/)

  const pisadas = analyzeCard(baseInput({ blocks: twoAttacks('1-2_ A: x', '(10)', '2-3_ B: y', '(20)') }), V, C)
  expect(pisadas.warnings.join(' ')).toMatch(/caras pisadas/)

  const muchas = analyzeCard(
    baseInput({ blocks: [1, 2, 3, 4, 5].map((i) => atk(`${i}_ A${i}: x`, '(10)')) }),
    V,
    C,
  )
  expect(muchas.warnings.join(' ')).toMatch(/cantidad de ataques 5/)
})

// AC: SPEC-S/T-102b/AC-6 — el nombre se ajusta a la lista de PokeAPI si la
// distancia de edición ≤ 2 y completa el dex; sin lista, se omite.
test('AC: SPEC-S/T-102b/AC-6 snap del nombre a PokeAPI', () => {
  expect(levenshtein('dratini', 'dratini')).toBe(0)
  const s1 = snapNameToPokeapi('Dratini', species, 2)
  expect(s1).toEqual({ name: 'Dratini', dex: 147, distance: 0 })
  const s2 = snapNameToPokeapi('Dratim', species, 2) // 1 error de OCR
  expect(s2?.dex).toBe(147)
  expect(snapNameToPokeapi('Xyzabc', species, 2)).toBeNull()

  const card = analyzeCard(baseInput({ name: ocr('Dratim') }, species), V, C)
  expect(card.name.value).toBe('Dratini')
  expect(card.dex.value).toBe(147)
  // Sin lista: el ajuste se omite (no penaliza).
  const sinLista = analyzeCard(baseInput({ name: ocr('Dratim') }), V, C)
  expect(sinLista.name.value).toBe('Dratim')
  expect(sinLista.needsReview).toBe(false)
})

// AC: SPEC-S/T-102b/AC-7 — confidence por campo (OCR + validaciones) y
// needsReview si algún campo < 0,8, hay habilidad o hay algo sin validar.
test('AC: SPEC-S/T-102b/AC-7 confidence y needsReview', () => {
  const limpia = analyzeCard(baseInput({}), V, C)
  expect(limpia.needsReview).toBe(false)
  expect(limpia.confidence).toBeGreaterThan(0.8)

  const confBaja = analyzeCard(baseInput({ name: ocr('Dratini', 0.5) }), V, C)
  expect(confBaja.needsReview).toBe(true)

  const habilidad = analyzeCard(baseInput({ blocks: [atk('3_ “Agilidad”: texto', '(10)')] }), V, C)
  expect(habilidad.attacks[0]?.kind).toBe('ability')
  expect(habilidad.needsReview).toBe(true) // AC-7: habilidad ⇒ revisión
})

// AC: SPEC-S/T-102b/AC-1 (integración) — el lote completo OCR + análisis con
// motor inyectado cuenta las que necesitan revisión y no rompe el resumen.
test('AC: SPEC-S/T-102b/AC-1 lote con motor inyectado: draft + conteo de revisión', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't102b-run-'))
  try {
    writeFileSync(join(tmp, 'carta.png'), await syntheticCard({ attacks: 2 }))
    const fake: OcrEngine = {
      recognize: async () => ocr('Texto genérico', 0.95),
      terminate: async () => undefined,
    }
    const res = await scanBatch({ input: tmp, outDir: tmp, engine: fake })
    expect(res.ok).toBe(true)
    expect(res.processed).toBe(1)
    expect(res.lines.join('\n')).toMatch(/1 con revisión/)
    const cacheDir = join(tmp, '.cache')
    const hash = createHash('sha256').update(readFileSync(join(tmp, 'carta.png'))).digest('hex')
    const entryFile = readFileSync(join(cacheDir, `${hash}.json`), 'utf8')
    const entry = JSON.parse(entryFile) as { draft?: { name: { value: string } } }
    expect(entry.draft?.name.value).toBe('Texto genérico')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102b/AC-2..AC-7 (carta de oro) — con el fixture de Dratini y
// el motor real (caché de idioma ya bajada) el draft coincide con
// dratini.expected.json en TODOS los campos que cubre T-102b (efectos: T-102d).
const tieneFixture = existsSync(FIXTURE) && existsSync(SPECIES_FILE)
test.skipIf(!tieneFixture)('AC: SPEC-S/T-102b/AC-2 carta de oro: Dratini con OCR real', { timeout: 120_000 }, async (ctx) => {
  const { createTesseractEngine } = await import('../tools/cards-scan/ocr.ts')
  let engine: OcrEngine
  try {
    engine = await createTesseractEngine(DEFAULT_SCAN_CONFIG.ocr)
  } catch {
    ctx.skip() // sin red ni caché de idioma: el golden se omite (SPEC-S/T-102a/AC-5)
    return
  }
  try {
    const rawSpecies = JSON.parse(readFileSync(SPECIES_FILE, 'utf8')) as { species: SpeciesOut[] }
    const norm = await normalizeScan(readFileSync(FIXTURE))
    expect(norm.ok).toBe(true)
    if (!norm.ok) return
    const seg = await segmentCard(norm.png)
    expect(seg.ok).toBe(true)
    if (!seg.ok) return
    const regions = await readCardRegions(norm.png, seg.segmentation, engine, DEFAULT_SCAN_CONFIG)
    const card = analyzeCard({ ...regions, group: 'terrain', species: rawSpecies.species }, V, C)
    expect(card.name.value).toBe('Dratini')
    expect(card.dex.value).toBe(147)
    expect(card.hp.value).toBe(50)
    expect(card.stage.value).toBe('basic')
    expect(card.evolvesTo).toEqual([{ id: 'dragonair', name: 'Dragonair', xp: 2 }])
    expect(card.attacks.map((a) => a.rollFaces)).toEqual([[4, 5], [3], [1, 2]])
    expect(card.attacks.map((a) => a.kind)).toEqual(['attack', 'ability', 'attack'])
    expect(card.attacks.map((a) => a.damageBase)).toEqual([10, null, 20])
    expect(card.specialties).toEqual([])
    expect(card.needsReview).toBe(true) // hay una habilidad (AC-7)
  } finally {
    await engine.terminate()
  }
})

// ── helpers ───────────────────────────────────────────────────────────────────
interface InputOverrides {
  name?: OcrRead
  hp?: OcrRead
  blocks?: ReadonlyArray<{ kind: 'specialty' | 'attack'; text: OcrRead; damage: OcrRead | null }>
  footerStage?: OcrRead
  footerRight?: OcrRead
}
type DraftInput = Parameters<typeof analyzeCard>[0]

function baseInput(o: InputOverrides = {}, speciesList?: readonly SpeciesOut[]): DraftInput {
  return {
    group: 'terrain',
    name: o.name ?? ocr('Dratini'),
    hp: o.hp ?? ocr('(50)'),
    blocks: o.blocks ?? [atk('4-5_ Envolver: 4-5-6 tu rival no atacará.', '(10)')],
    footerStage: o.footerStage ?? ocr('Básico'),
    footerRight: o.footerRight ?? ocr('E: Dragonair (2)'),
    ...(speciesList !== undefined ? { species: speciesList } : {}),
  }
}

function atk(text: string, damage: string | null): { kind: 'attack'; text: OcrRead; damage: OcrRead | null } {
  return { kind: 'attack', text: ocr(text), damage: damage === null ? null : ocr(damage) }
}

function twoAttacks(t1: string, d1: string, t2: string, d2: string): ReadonlyArray<{ kind: 'attack'; text: OcrRead; damage: OcrRead | null }> {
  return [atk(t1, d1), atk(t2, d2)]
}
