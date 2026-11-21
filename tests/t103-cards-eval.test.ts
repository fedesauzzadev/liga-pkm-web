// AC: SPEC-T/T-103 — medición y diagnóstico del lector por etapa (cards:eval):
// verdad terreno (verified + carta de oro) con aviso si hay < 20, atribución de
// la etapa que falla (segmentación/OCR/análisis/íconos/mapeo), recortes de
// errores con esperado/leído + tabla de confusiones, comparación de motores de
// OCR (tesseract, tesseract+preproceso, rapidocr, paddle solo si hace falta) y
// motor elegido persistido en scan-config.json › ocr.engine.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import type { PokemonCard } from '../packages/content/src/cards.ts'
import { loadScanConfig, setOcrEngine } from '../tools/cards-scan/config.ts'
import { charConfusions, diagnoseCard, summarize, type DiagError, type RawEvidence } from '../tools/cards-scan/evaldiag.ts'
import { preprocessForOcr, withPreprocess, type EngineRunResult } from '../tools/cards-scan/evalengines.ts'
import { buildEngineTable, buildPairs, collectTruth, truthWarning, writeFailureCrops } from '../tools/cards-scan/eval.ts'
import type { CardRegions } from '../tools/cards-scan/ocr.ts'

// ---------------------------------------------------------------------------
// helpers: cartas de prueba (misma forma que tests/t102e-card-output.test.ts)
// ---------------------------------------------------------------------------
const atk = (name: string, faces: number[], base: number, cost: string[], effects: unknown[] = [], rawText = ''): PokemonCard['attacks'][number] => ({
  id: name.toLowerCase(), name, kind: 'attack', rollFaces: faces as never, cost: cost as never, element: 'normal',
  damage: { base }, effects: effects as never, rawText,
})
const card = (over: Partial<PokemonCard> = {}): PokemonCard => ({
  id: 'dratini', dex: 147, name: 'Dratini', stage: 'basic', deck: 'montana', hp: 50, element: 'dragon',
  attacks: [
    atk('Envolver', [4, 5], 10, ['any'], [{ op: 'rivalSkipsAttack', faces: [4, 5, 6] }], '4-5-6 tu rival no atacará.'),
    atk('Attack-trueno', [1, 2], 20, ['electric'], [{ op: 'rollGate', failFaces: [1, 2] }], 'si tu rival saca 1-2 no ataca.'),
  ],
  specialties: [], evolvesTo: [{ id: 'dragonair', xp: 2 }], source: { verified: false },
  ...over,
})
const rawBien: RawEvidence = {
  hp: '(50)',
  footerStage: 'Básico',
  footerRight: 'E: Dragonair (2)',
  blocks: [
    { kind: 'attack', text: '4-5_ Envolver: 4-5-6 tu rival no atacará.', damage: '(10)' },
    { kind: 'attack', text: '1-2_ Attack-trueno: si tu rival saca 1-2 no ataca.', damage: '(20)' },
  ],
}
const err = (d: ReturnType<typeof diagnoseCard>, field: string, attack: number | null = null): DiagError | undefined =>
  d.errors.find((e) => e.field === field && e.attack === attack)

// AC: SPEC-T/T-103/AC-1 — verdad terreno: cartas con source.verified:true en
// content/pokemon (incl. _staging) + la carta de oro (_golden + fixture);
// empareja con el escaneo (foto del staging fromScanner); las verified sin
// escaneo quedan "sin escaneo"; si hay < 20 pares, el reporte lo dice y pide
// al dueño confirmar las cartas en revisión (aceptar/corregir).
test('AC: SPEC-T/T-103/AC-1 verdad terreno (verified + golden), pares y aviso < 20', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't103-truth-'))
  try {
    const pokemon = join(tmp, 'content', 'pokemon')
    mkdirSync(pokemon, { recursive: true })
    const verified = { ...card(), source: { verified: true } }
    const squirtle = { ...card({ id: 'squirtle', name: 'Squirtle', attacks: [] }), source: { verified: true } }
    writeFileSync(join(pokemon, 'samples.json'), JSON.stringify({ cards: [verified, squirtle] }))
    const goldenDir = join(pokemon, '_golden')
    const fixtureDir = join(tmp, 'tools', 'cards-scan', 'fixtures')
    mkdirSync(goldenDir, { recursive: true })
    mkdirSync(fixtureDir, { recursive: true })
    writeFileSync(join(goldenDir, 'dratini.expected.json'), JSON.stringify(card()))
    writeFileSync(join(fixtureDir, 'dratini.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    const staging = join(pokemon, '_staging')
    mkdirSync(staging)
    writeFileSync(
      join(staging, 'poliwag_pantano.json'),
      JSON.stringify({ fromScanner: true, needsReview: true, photo: 'Poliwag Pantano.jpg', cards: [{ ...card(), source: { photo: 'x', verified: false } }] }),
    )
    writeFileSync(
      join(staging, 'bellsprut_bosque.json'),
      JSON.stringify({ fromScanner: true, needsReview: true, photo: 'Bellsprout Bosque.jpg', cards: [{ ...card(), id: 'bellsprout', name: 'Bellsprout', source: { photo: 'x', verified: false } }] }),
    )
    const scans = join(tmp, 'content', 'photos', 'scans', 'terrain', 'pantano')
    mkdirSync(scans, { recursive: true })
    writeFileSync(join(scans, 'Poliwag Pantano.jpg'), Buffer.from([0xff, 0xd8]))

    const t = collectTruth(tmp)
    expect(t.verified.map((v) => v.card.id).sort()).toEqual(['dratini', 'squirtle'])
    expect(t.golden.map((g) => g.card.id)).toEqual(['dratini'])
    const { pairs, unpaired, inRevision } = buildPairs(tmp, t)
    // dratini por id de staging (verified) + dratini golden (fixture); squirtle sin escaneo.
    expect(pairs.map((p) => `${p.truth.id}:${p.source}`).sort()).toEqual(['dratini:golden', 'dratini:verified'])
    expect(unpaired).toEqual(['squirtle'])
    expect(inRevision).toContain('bellsprut_bosque')
    expect(inRevision).not.toContain('poliwag_pantano') // ya tiene par: es verdad terreno
    const warn = truthWarning(pairs.length, inRevision)
    expect(warn.join('\n')).toContain('20')
    expect(warn.join('\n')).toMatch(/revisi|confirm/i)
    expect(warn.join('\n')).toContain('bellsprut_bosque')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-T/T-103/AC-2 — para cada campo calcula exactitud y EN QUÉ ETAPA
// falla: segmentación (bloques/ataques perdidos o de más), OCR (el texto crudo
// no contiene el valor esperado), análisis (el texto estaba pero se parseó
// mal), íconos (costos/elemento) o mapeo de efectos (texto bien leído,
// efecto distinto).
test('AC: SPEC-T/T-103/AC-2 diagnoseCard: etapa de falla por campo', () => {
  // Todo bien ⇒ 14/14 (hp, etapa, evolución, elemento + 5 campos × 2 ataques).
  const ok = diagnoseCard('a', card(), card(), rawBien)
  expect(ok.errors).toHaveLength(0)
  expect(ok.checks).toBe(14)
  expect(ok.hits).toBe(14)

  // HP por OCR (el crudo no tiene el 50) vs por análisis (lo tenía).
  expect(err(diagnoseCard('a', card({ hp: 30 }), card(), { ...rawBien, hp: '(3O)' }), 'hp')?.stage).toBe('ocr')
  expect(err(diagnoseCard('a', card({ hp: 60 }), card(), rawBien), 'hp')?.stage).toBe('análisis')

  // Caras: prefijo sin el 4-5 ⇒ OCR; con él ⇒ análisis.
  const caras = { ...rawBien, blocks: [{ kind: 'attack' as const, text: '4-6_ Envolver: 4-5-6 tu rival no atacará.', damage: '(10)' }, rawBien.blocks[1]!] }
  expect(err(diagnoseCard('a', card({ attacks: [atk('Envolver', [4, 6], 10, ['any']), card().attacks[1]!] }), card(), caras), 'caras', 1)?.stage).toBe('ocr')
  expect(err(diagnoseCard('a', card({ attacks: [atk('Envolver', [4, 6], 10, ['any']), card().attacks[1]!] }), card(), rawBien), 'caras', 1)?.stage).toBe('análisis')

  // Daño por OCR (la columna de daño no tiene el número).
  const dmg = { ...rawBien, blocks: [{ kind: 'attack' as const, text: rawBien.blocks[0]!.text, damage: '(3O)' }, rawBien.blocks[1]!] }
  expect(err(diagnoseCard('a', card({ attacks: [atk('Envolver', [4, 5], 30, ['any']), card().attacks[1]!] }), card(), dmg), 'daño', 1)?.stage).toBe('ocr')

  // Costos y elemento ⇒ íconos.
  const iconos = diagnoseCard('a', card({ element: 'water', attacks: [atk('Envolver', [4, 5], 10, ['water']), card().attacks[1]!] }), card(), rawBien)
  expect(err(iconos, 'costos', 1)?.stage).toBe('íconos')
  expect(err(iconos, 'elemento')?.stage).toBe('íconos')

  // Etapa y evolución: texto del pie presente ⇒ análisis; ausente ⇒ OCR.
  expect(err(diagnoseCard('a', card({ stage: 'evolution' as PokemonCard['stage'] }), card(), rawBien), 'etapa')?.stage).toBe('análisis')
  expect(err(diagnoseCard('a', card({ stage: 'evolution' as PokemonCard['stage'] }), card(), { ...rawBien, footerStage: '??' }), 'etapa')?.stage).toBe('ocr')
  expect(err(diagnoseCard('a', card({ evolvesTo: [{ id: 'dragonite', xp: 3 }] }), card(), rawBien), 'evolución')?.stage).toBe('análisis')
  expect(err(diagnoseCard('a', card({ evolvesTo: [{ id: 'dragonite', xp: 3 }] }), card(), { ...rawBien, footerRight: 'E: ??? (2)' }), 'evolución')?.stage).toBe('ocr')

  // Nombre de ataque: crudo sin el nombre ⇒ OCR; con él ⇒ análisis.
  const nom = { ...rawBien, blocks: [{ kind: 'attack' as const, text: '4-5_ Envolve: 4-5-6 tu rival no atacará.', damage: '(10)' }, rawBien.blocks[1]!] }
  expect(err(diagnoseCard('a', card({ attacks: [atk('Envolve', [4, 5], 10, ['any']), card().attacks[1]!] }), card(), nom), 'nombre de ataque', 1)?.stage).toBe('ocr')
  expect(err(diagnoseCard('a', card({ attacks: [atk('Envolve', [4, 5], 10, ['any']), card().attacks[1]!] }), card(), rawBien), 'nombre de ataque', 1)?.stage).toBe('análisis')

  // Efectos: mismo texto pero otro efecto ⇒ mapeo; texto distinto ⇒ OCR.
  const mapTxt = atk('Envolver', [4, 5], 10, ['any'], [{ op: 'custom', handler: 'TODO' }], '4-5-6 tu rival no atacará.')
  expect(err(diagnoseCard('a', card({ attacks: [mapTxt, card().attacks[1]!] }), card(), rawBien), 'efectos', 1)?.stage).toBe('mapeo de efectos')
  const efe = atk('Envolver', [4, 5], 10, ['any'], [{ op: 'custom', handler: 'TODO' }], 'otra cosa')
  expect(err(diagnoseCard('a', card({ attacks: [efe, card().attacks[1]!] }), card(), rawBien), 'efectos', 1)?.stage).toBe('ocr')

  // Ataque perdido / de más ⇒ segmentación en sus campos.
  const pierde = diagnoseCard('a', card({ attacks: [card().attacks[0]!] }), card(), { ...rawBien, blocks: [rawBien.blocks[0]!] })
  expect(pierde.errors.filter((e) => e.attack === 2 && e.stage === 'segmentación')).toHaveLength(5)
  const sobra = diagnoseCard('a', card({ attacks: [...card().attacks, atk('Extra', [6], 10, ['any'])] }), card(), {
    ...rawBien, blocks: [...rawBien.blocks, { kind: 'attack', text: '6_ Extra: x', damage: '(10)' }],
  })
  expect(err(sobra, 'nombre de ataque', 3)?.stage).toBe('segmentación')

  // Especialidad: bloque presente sin mapear ⇒ mapeo; bloque ausente ⇒ segmentación.
  const truthEsp = card({ specialties: [{ op: 'poisonTouch' } as never] })
  const espMap = diagnoseCard('a', card(), truthEsp, { ...rawBien, blocks: [{ kind: 'specialty', text: 'VENENO: 10 al principio del turno', damage: null }, ...rawBien.blocks] })
  expect(err(espMap, 'efectos', null)?.stage).toBe('mapeo de efectos')
  const espSeg = diagnoseCard('a', card(), truthEsp, rawBien)
  expect(err(espSeg, 'efectos', null)?.stage).toBe('segmentación')
})

// AC: SPEC-T/T-103/AC-3 — recortes de cada error en
// scan-reports/failures/<campo>/ con esperado y leído en el nombre del
// archivo, y tabla de confusiones frecuentes (p. ej. 5→S, -→~, _→.).
test('AC: SPEC-T/T-103/AC-3 confusiones y recortes de errores', async () => {
  // Confusiones carácter a carácter con alineación por edición.
  expect(charConfusions('50', '5O')).toEqual(['0→O'])
  expect(charConfusions('4-5', '4-S')).toEqual(['5→S'])
  expect(charConfusions('-', '~')).toEqual(['-→~'])
  expect(charConfusions('_', '.')).toEqual(['_→.'])
  expect(charConfusions('10', '1')).toEqual(['0→∅'])
  expect(charConfusions('50', '50')).toEqual([])

  // Recortes: un error de HP (región del círculo) y uno de costos (bloque).
  const tmp = mkdtempSync(join(tmpdir(), 't103-crops-'))
  try {
    const png = await sharp({ create: { width: 700, height: 1060, channels: 3, background: '#fff' } }).png().toBuffer()
    const regions: CardRegions = {
      name: { text: 'Dratini', confidence: 0.9 },
      hp: { text: '(3O)', confidence: 0.4 },
      blocks: [{ kind: 'attack', text: { text: 'x', confidence: 0.9 }, damage: null, rect: { x: 30, y: 500, w: 640, h: 90 }, damageRect: null }],
      footerStage: { text: 'Básico', confidence: 0.9 },
      footerRight: { text: 'E:', confidence: 0.9 },
      nameRect: { x: 35, y: 20, w: 500, h: 50 },
      hpRect: { x: 536, y: 26, w: 76, h: 80 },
      footerStageRect: { x: 21, y: 960, w: 260, h: 40 },
      footerRightRect: { x: 364, y: 960, w: 315, h: 40 },
    }
    const errors: readonly DiagError[] = [
      { field: 'hp', attack: null, stage: 'ocr', expected: '50', read: '3O' },
      { field: 'costos', attack: 1, stage: 'íconos', expected: 'electric', read: 'water' },
    ]
    const n = await writeFailureCrops(tmp, 'dratini_montana', errors, regions, null, png)
    expect(n).toBe(2)
    const hpDir = join(tmp, 'hp')
    const hpFiles = readdirSync(hpDir)
    expect(hpFiles).toHaveLength(1)
    expect(hpFiles[0]).toMatch(/^dratini_montana__esperado_50__leido_3O\.png$/)
    const costos = readdirSync(join(tmp, 'costos'))
    expect(costos[0]).toMatch(/^dratini_montana__esperado_electric__leido_water\.png$/)
    // El recorte es un PNG válido más chico que la carta completa.
    const meta = await sharp(join(hpDir, hpFiles[0]!)).metadata()
    expect(meta.width).toBeLessThan(700)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-T/T-103/AC-4 — comparación de motores sobre las MISMAS regiones:
// A) tesseract actual, B) tesseract con preproceso (×3 + Sauvola, el
// preproceso de T-106), C) rapidocr (ONNX local), D) paddleocr solo si C no
// alcanza. Tabla comparativa de exactitud y tiempo por carta.
test('AC: SPEC-T/T-103/AC-4 preproceso, wrapper y tabla comparativa', async () => {
  // Preproceso: ×3 Lanczos + grises + Sauvola ⇒ imagen binaria (solo 0/255).
  const grad = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ffffff' } })
    .composite([{ input: await sharp({ create: { width: 10, height: 8, channels: 3, background: '#333333' } }).png().toBuffer(), top: 6, left: 8 }])
    .png().toBuffer()
  const pre = await preprocessForOcr(grad)
  const meta = await sharp(pre).metadata()
  expect(meta.width).toBe(120)
  expect(meta.height).toBe(60)
  const { data } = await sharp(pre).grayscale().raw().toBuffer({ resolveWithObject: true })
  expect(Array.from(new Set(data)).every((v) => v === 0 || v === 255)).toBe(true)

  // Wrapper: el motor recibe la imagen PREPROCESADA (otro buffer, PNG válido).
  let visto: Buffer | null = null
  const falso = { recognize: async (image: Buffer) => { visto = image; return { text: 'x', confidence: 0.9 } }, terminate: async () => undefined }
  await withPreprocess(falso).recognize(grad, 7)
  expect(visto).not.toBeNull()
  expect(Buffer.compare(visto!, grad)).not.toBe(0)
  await expect(sharp(visto!).metadata()).resolves.toMatchObject({ format: 'png' })

  // Tabla comparativa: motores disponibles con números + no disponibles con nota.
  const runs: readonly EngineRunResult[] = [
    { id: 'tesseract', label: 'A) tesseract (actual)', available: true, msPerCard: 3200, cards: 2, fieldHits: 18, fieldChecks: 28 },
    { id: 'tesseract-prep', label: 'B) tesseract + preproceso', available: true, msPerCard: 4100, cards: 2, fieldHits: 22, fieldChecks: 28 },
    { id: 'rapidocr', label: 'C) rapidocr (ONNX)', available: true, msPerCard: 900, cards: 2, fieldHits: 26, fieldChecks: 28 },
    { id: 'paddleocr', label: 'D) paddleocr', available: false, note: 'se prueba solo si C no alcanza', msPerCard: null, cards: 0, fieldHits: 0, fieldChecks: 0 },
  ]
  const tabla = buildEngineTable(runs)
  const txt = tabla.join('\n')
  for (const id of ['tesseract', 'tesseract-prep', 'rapidocr', 'paddleocr']) expect(txt).toContain(id)
  expect(txt).toContain('64.3%') // 18/28
  expect(txt).toContain('92.9%') // 26/28
  expect(txt).toContain('3.2') // s/carta
  expect(txt).toContain('no disponible')
})

// AC: SPEC-T/T-103/AC-5 — el motor elegido queda en
// content/cards/scan-config.json › ocr.engine (y loadScanConfig lo lee;
// 'tesseract.js' legacy se normaliza a 'tesseract').
test('AC: SPEC-T/T-103/AC-5 setOcrEngine persiste ocr.engine', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't103-engine-'))
  try {
    const cfgDir = join(tmp, 'content', 'cards')
    mkdirSync(cfgDir, { recursive: true })
    writeFileSync(join(cfgDir, 'scan-config.json'), JSON.stringify({ normalize: { width: 700, height: 1060 }, ocr: { engine: 'tesseract.js', lang: 'spa' } }, null, 1))
    expect(loadScanConfig(tmp).ocr.engine).toBe('tesseract')
    const path = setOcrEngine(tmp, 'rapidocr')
    expect(path).toContain('scan-config.json')
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { ocr: { engine: string; lang: string }; normalize: { width: number } }
    expect(raw.ocr.engine).toBe('rapidocr')
    expect(raw.ocr.lang).toBe('spa') // no se pisa el resto de la config
    expect(raw.normalize.width).toBe(700)
    expect(loadScanConfig(tmp).ocr.engine).toBe('rapidocr')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-T/T-103/AC-6 — el diagnóstico ordena las causas por cantidad de
// cartas afectadas y expone las confusiones para el reporte (la tabla final
// y el plan van a tasks/reports/T-103.md).
test('AC: SPEC-T/T-103/AC-6 summarize: causas ordenadas + confusiones', () => {
  const base = (b: string, staged: PokemonCard, raw: RawEvidence): ReturnType<typeof diagnoseCard> => diagnoseCard(b, staged, card(), raw)
  const d1 = base('uno', card({ hp: 30 }), { ...rawBien, hp: '(3O)' }) // ocr (hp)
  const d2 = base('dos', card({ attacks: [card().attacks[0]!] }), { ...rawBien, blocks: [rawBien.blocks[0]!] }) // segmentación ×5
  const d3 = base('tres', card({ element: 'water' }), rawBien) // íconos (elemento)
  const s = summarize([d1, d2, d3])
  expect(s.cards).toBe(3)
  expect(s.fields.find((f) => f.field === 'hp')).toMatchObject({ checks: 3, hits: 2 })
  const seg = s.causes.find((c) => c.stage === 'segmentación')
  const ocr = s.causes.find((c) => c.stage === 'ocr')
  const iconos = s.causes.find((c) => c.stage === 'íconos')
  expect(seg?.cards).toBe(1)
  expect(seg?.errors).toBe(5)
  expect(ocr).toMatchObject({ cards: 1, errors: 1 })
  expect(iconos).toMatchObject({ cards: 1, errors: 1 })
  // Orden descendente por cartas afectadas (segmentación 5 errores pero 1 carta
  // igual que ocr/íconos ⇒ desempata por errores).
  expect(s.causes.map((c) => c.stage)).toEqual(['segmentación', 'ocr', 'íconos'])
  // La confusión del HP (50 leído 3O) aparece contada.
  expect(s.confusions[0]).toMatchObject({ pair: '0→O', count: 1 })
})
