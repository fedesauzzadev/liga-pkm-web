// AC: SPEC-S/T-102c — íconos (elemento, costos, mazo): extracción por
// componentes conectados (junto al HP, columna derecha de cada bloque, pie;
// costos en fila o apilados en 2 filas en orden de lectura), aprendizaje por
// agrupación (vector 16×16 + color) con etiquetado único en icons.html,
// clasificación por centroide más cercano (círculo gris = any siempre) y
// deck/element por ícono + deck por nombre/ruta del escaneo (Q-081).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { syntheticCard, type SynthSpec } from '../tools/cards-scan/synth.ts'
import { normalizeScan } from '../tools/cards-scan/image.ts'
import { segmentCard } from '../tools/cards-scan/segment.ts'
import { extractIcons, type CardIcons } from '../tools/cards-scan/icons.ts'
import { buildLabels, groupIcons, renderIconsHtml, type IconGroup, type SampledPatch } from '../tools/cards-scan/iconlearn.ts'
import { learnBatch } from '../tools/cards-scan/learn.ts'
import { attackElementOf, classifyCardIcons, classifyPatch, parseIconLabels, type CardIconClasses, type IconLabels } from '../tools/cards-scan/iclassify.ts'
import { analyzeCard } from '../tools/cards-scan/draft.ts'
import { DEFAULT_SCAN_CONFIG, type ConfidenceConfig, type ValidationConfig } from '../tools/cards-scan/config.ts'
import { scanBatch } from '../tools/cards-scan/run.ts'
import { deckFromFilename, deckFromPath } from '../tools/cards-scan/filename.ts'
import type { OcrEngine, OcrRead } from '../tools/cards-scan/ocr.ts'

const FIXTURE = fileURLToPath(new URL('../tools/cards-scan/fixtures/dratini.jpg', import.meta.url))
const V: ValidationConfig = DEFAULT_SCAN_CONFIG.validation
const C: ConfidenceConfig = DEFAULT_SCAN_CONFIG.confidence
const ocr = (text: string, confidence = 0.9): OcrRead => ({ text, confidence })
const fakeEngine: OcrEngine = {
  recognize: async () => ({ text: 'x', confidence: 0.5 }),
  terminate: async () => undefined,
}

async function iconsOf(spec: SynthSpec): Promise<CardIcons> {
  const norm = await normalizeScan(await syntheticCard(spec))
  if (!norm.ok) throw new Error(norm.error)
  const seg = await segmentCard(norm.png)
  if (!seg.ok) throw new Error(seg.error)
  return extractIcons(norm.png, seg.segmentation, DEFAULT_SCAN_CONFIG)
}

function sampledOf(icons: CardIcons, file: string): SampledPatch[] {
  const out: SampledPatch[] = []
  const mk = (p: SampledPatch['patch'], thumb: string): SampledPatch => ({ file, patch: p, thumb: `data:image/png;base64,${thumb}` })
  if (icons.element !== null) out.push(mk(icons.element, `${file}-element`))
  if (icons.deck !== null) out.push(mk(icons.deck, `${file}-deck`))
  icons.costs.forEach((cs, i) => {
    for (const p of cs) out.push(mk(p, `${file}-cost${i}`))
  })
  return out
}

/** Etiqueta de cada grupo según el color promedio de su centroide (cola rgb). */
function labelByColor(g: IconGroup): string {
  const r = g.vector[256] ?? 0
  const gr = g.vector[257] ?? 0
  const b = g.vector[258] ?? 0
  if (g.allGray) return 'any'
  // Tolerancia generosa: el disco mezcla su color con el fondo del bbox.
  const near = (x: number, y: number, z: number): boolean => Math.abs(r - x) + Math.abs(gr - y) + Math.abs(b - z) < 0.3
  if (near(240 / 255, 200 / 255, 40 / 255)) return 'electric' // amarillo
  if (near(224 / 255, 128 / 255, 32 / 255)) return 'fire' // naranja
  if (near(80 / 255, 96 / 255, 224 / 255)) return 'pantano' // azul
  if (near(84 / 255, 52 / 255, 110 / 255)) return 'montana' // violeta
  return 'otro'
}

type DraftInput = Parameters<typeof analyzeCard>[0]
type Block = DraftInput['blocks'][number]

function draftInput(
  blocks: readonly Block[],
  icons: CardIconClasses | undefined,
  deckHint?: string | undefined,
): DraftInput {
  return {
    group: 'terrain',
    name: ocr('Dratini'),
    hp: ocr('(50)'),
    blocks,
    footerStage: ocr('Básico'),
    footerRight: ocr('E: Dragonair (2)'),
    ...(icons !== undefined ? { icons } : {}),
    ...(deckHint !== undefined ? { deckHint } : {}),
  }
}

// AC: SPEC-S/T-102c/AC-1 — extrae los íconos por componentes conectados en
// los tres lugares (elemento junto al HP, costos en la columna derecha de
// cada bloque, mazo en el pie); los costos en fila o apilados en 2 filas se
// leen en orden de lectura (fila de arriba izq→der, luego la de abajo).
test('AC: SPEC-S/T-102c/AC-1 componentes conectados: elemento, costos (fila y 2 filas) y mazo', async () => {
  const icons = await iconsOf({
    attacks: 3,
    icons: {
      element: '#2060c0',
      deck: '#703020',
      costs: [['any'], ['#d02020'], ['any', '#20b040', '#c0a020']],
    },
  })
  // Elemento del encabezado (a la derecha, zona del HP) y mazo del pie.
  expect(icons.element).not.toBeNull()
  if (icons.element !== null) {
    expect(icons.element.grayCircle).toBe(false)
    expect(icons.element.rect.x).toBeGreaterThan(700 * 0.85)
    expect(icons.element.rect.y).toBeLessThan(95)
  }
  expect(icons.deck).not.toBeNull()
  if (icons.deck !== null) {
    expect(icons.deck.rect.y).toBeGreaterThan(940) // pie, bajo la línea gruesa
    expect(icons.deck.rect.x).toBeGreaterThan(700 * 0.36)
  }
  // Un costo por ataque en los ataques 1 y 2; 3 apilados en 2 filas en el 3.
  expect(icons.costs).toHaveLength(3)
  expect(icons.costs[0]).toHaveLength(1)
  expect(icons.costs[0]?.[0]?.grayCircle).toBe(true)
  expect(icons.costs[1]).toHaveLength(1)
  expect(icons.costs[1]?.[0]?.grayCircle).toBe(false)
  const tres = icons.costs[2] ?? []
  expect(tres).toHaveLength(3)
  const [a, b, c] = tres
  if (a === undefined || b === undefined || c === undefined) throw new Error('faltan costos')
  expect(a.attackIndex).toBe(2)
  expect(b.attackIndex).toBe(2)
  expect(c.attackIndex).toBe(2)
  // Orden de lectura: a y b en la fila de arriba (misma altura, a a la
  // izquierda), c en la fila de abajo.
  expect(Math.abs(a.rect.y + a.rect.h / 2 - (b.rect.y + b.rect.h / 2))).toBeLessThan(12)
  expect(a.rect.x).toBeLessThan(b.rect.x)
  expect(c.rect.y).toBeGreaterThan(b.rect.y + 12)
  // El vector es 16×16 de luma + color promedio.
  for (const p of [icons.element, icons.deck, ...tres]) {
    if (p !== null) expect(p.vector).toHaveLength(259)
  }
})

// AC: SPEC-S/T-102c/AC-2 — `cards:icons:learn`: agrupa una muestra de íconos
// por parecido (16×16 + color), genera icons.html con un grupo por bloque
// (ejemplos, cantidad y desplegable para ponerle nombre UNA vez) y botón
// Exportar que arma icon-labels.json (centroides + etiquetas).
test('AC: SPEC-S/T-102c/AC-2 agrupación, icons.html y exportación de etiquetas únicas', async () => {
  const a = await iconsOf({ attacks: 2, icons: { element: '#e08020', deck: '#54346e', costs: [['any'], ['#f0c828']] } })
  const b = await iconsOf({ attacks: 2, icons: { element: '#e08020', deck: '#5060e0', costs: [['any'], ['#f0c828']] } })
  const patches = [...sampledOf(a, 'a.png'), ...sampledOf(b, 'b.png')]
  const groups = groupIcons(patches, DEFAULT_SCAN_CONFIG.icons.groupThreshold)
  // any×2, electric×2, fire(elemento)×2 y un grupo por mazo distinto.
  expect(groups).toHaveLength(5)
  expect(groups.map((g) => g.count).sort((x, y) => y - x)).toEqual([2, 2, 2, 1, 1])
  expect(groups.filter((g) => g.allGray)).toHaveLength(1)
  // Determinista: misma muestra ⇒ mismos grupos.
  expect(groupIcons(patches, DEFAULT_SCAN_CONFIG.icons.groupThreshold).map((g) => g.id)).toEqual(groups.map((g) => g.id))

  const html = renderIconsHtml(groups, DEFAULT_SCAN_CONFIG.iconClasses)
  for (const marca of ['<select', 'Exportar', 'icon-labels.json', 'data:image/png;base64,', 'any', 'pantano']) expect(html).toContain(marca)
  expect(html).not.toMatch(/src="http/) // autocontenido, sin servidor

  // Etiquetado único: cada grupo se nombra una vez; sin etiqueta y 'otro' no
  // se exportan (los centroides sí).
  const byId: Record<string, string> = {}
  for (const g of groups) byId[g.id] = labelByColor(g)
  byId[groups[0]!.id] = '' // uno sin etiquetar
  const labels = buildLabels(groups, byId)
  expect(labels.version).toBe(1)
  expect(labels.icons).toHaveLength(4)
  expect(labels.icons.every((l) => l.vector.length === 259 && l.label.length > 0)).toBe(true)
})

// AC: SPEC-S/T-102c/AC-2 — CLI `pnpm cards:icons:learn <carpeta> [--sample]`:
// recorre la carpeta (sin OCR), muestrea con tope y escribe icons.html.
test('AC: SPEC-S/T-102c/AC-2 learnBatch escribe icons.html con --sample', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't102c-learn-'))
  try {
    writeFileSync(join(tmp, 'a.png'), await syntheticCard({ attacks: 2, icons: { element: '#e08020', deck: '#54346e', costs: [['any'], ['#f0c828']] } }))
    writeFileSync(join(tmp, 'b.png'), await syntheticCard({ attacks: 2, icons: { element: '#e08020', deck: '#5060e0', costs: [['any'], ['#f0c828']] } }))
    const res = await learnBatch({ input: tmp, outDir: tmp })
    expect(res.ok).toBe(true)
    expect(res.cards).toBe(2)
    expect(res.sampled).toBe(6) // 2 cartas × (elemento + 2 costos); SIN pie (Q-081)
    expect(existsSync(join(tmp, 'icons.html'))).toBe(true)
    const html = readFileSync(join(tmp, 'icons.html'), 'utf8')
    expect(html).toContain('Exportar')
    // --sample recorta la muestra (round-robin por rol: no corta un rol entero).
    const chico = await learnBatch({ input: tmp, outDir: join(tmp, 'chico'), sample: 3 })
    expect(chico.sampled).toBe(3)
    expect(chico.ok).toBe(true)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102c/AC-3 — clasificación por centroide más cercano con
// confidence; el círculo gris vacío es SIEMPRE any (aunque no esté aprendido);
// distancia > máxima ⇒ unknown + needsReview; el costo de la carta es la
// lista de clases y el element del ataque es el primer color (o normal).
test('AC: SPEC-S/T-102c/AC-3 centroide más cercano, any garantizado, unknown y element del ataque', async () => {
  const a = await iconsOf({ attacks: 2, icons: { element: '#e08020', deck: '#54346e', costs: [['any'], ['#f0c828']] } })
  const grupos = groupIcons(sampledOf(a, 'a.png'), DEFAULT_SCAN_CONFIG.icons.groupThreshold)
  const byId: Record<string, string> = {}
  for (const g of grupos) byId[g.id] = labelByColor(g)
  const labels = buildLabels(grupos, byId)

  // Misma carta redibujada (ruido numérico chico) ⇒ misma clase, conf alta.
  const a2 = await iconsOf({ attacks: 2, icons: { element: '#e08020', deck: '#54346e', costs: [['any'], ['#f0c828']] } })
  const cost = a2.costs[1]?.[0]
  if (cost === undefined) throw new Error('falta costo electric')
  const r = classifyPatch(cost, labels, DEFAULT_SCAN_CONFIG.icons.maxDistance)
  expect(r.label).toBe('electric')
  expect(r.confidence).toBeGreaterThan(0.8)
  expect(r.distance).toBeLessThan(DEFAULT_SCAN_CONFIG.icons.maxDistance)

  // Color no aprendido ⇒ unknown (confianza 0) ⇒ tarjeta a revisar.
  const extraña = await iconsOf({ attacks: 1, icons: { element: '#e08020', deck: '#54346e', costs: [['#ff40c0']] } })
  const rosa = extraña.costs[0]?.[0]
  if (rosa === undefined) throw new Error('falta costo rosa')
  const u = classifyPatch(rosa, labels, DEFAULT_SCAN_CONFIG.icons.maxDistance)
  expect(u.label).toBe('unknown')
  expect(u.confidence).toBe(0)

  // Círculo gris: any SIEMPRE, incluso si las etiquetas no traen ninguno.
  const gris = a2.costs[0]?.[0]
  if (gris === undefined) throw new Error('falta costo any')
  expect(gris.grayCircle).toBe(true)
  const sinAny = { version: 1 as const, icons: labels.icons.filter((l) => l.label !== 'any') }
  expect(classifyPatch(gris, sinAny, DEFAULT_SCAN_CONFIG.icons.maxDistance).label).toBe('any')

  // element del ataque: primer color del costo; todo any ⇒ normal.
  expect(attackElementOf(['any', 'any'])).toBe('normal')
  expect(attackElementOf(['any', 'electric'])).toBe('electric')
  expect(attackElementOf(['fire', 'water'])).toBe('fire')
  expect(attackElementOf([])).toBe('normal')

  // icon-labels.json: se parsea y valida; JSON inválido ⇒ null (sin romper).
  const parsed = parseIconLabels(JSON.stringify(labels))
  expect(parsed?.icons.map((l) => l.label).sort()).toEqual(['any', 'electric', 'fire', 'montana'])
  expect(parseIconLabels('{no json')).toBeNull()
  expect(parseIconLabels(JSON.stringify({ version: 1, icons: [{ id: 'g1', label: 'x', vector: [1, 2] }] }))).toBeNull()
})

// AC: SPEC-S/T-102c/AC-4 — el ícono del pie determina deck y el del
// encabezado, element del Pokémon (incluido dragon); se integran al draft con
// costos por ataque y revisión cuando hay unknown.
test('AC: SPEC-S/T-102c/AC-4 deck del pie, element del encabezado e integración al draft', async () => {
  const base = await iconsOf({ attacks: 2, icons: { element: '#e08020', deck: '#5060e0', costs: [['any'], ['#f0c828']] } })
  const grupos = groupIcons(sampledOf(base, 'base.png'), DEFAULT_SCAN_CONFIG.icons.groupThreshold)
  const byId: Record<string, string> = {}
  for (const g of grupos) byId[g.id] = labelByColor(g)
  const labels = buildLabels(grupos, byId)
  const dragonLabels: IconLabels = {
    version: 1,
    icons: labels.icons.map((l) => (l.label === 'fire' ? { ...l, label: 'dragon' } : l)),
  }

  const card = await iconsOf({ attacks: 2, icons: { element: '#e08020', deck: '#5060e0', costs: [['any'], ['#f0c828']] } })
  const classes = classifyCardIcons(card, dragonLabels, DEFAULT_SCAN_CONFIG.icons.maxDistance)
  expect(classes.element?.label).toBe('dragon')
  expect(classes.deck?.label).toBe('pantano')

  // Draft: element/deck de la carta + costo y element por ataque.
  const draft = analyzeCard(
    draftInput(
      [
        { kind: 'attack', text: ocr('4-5_ Envolver: texto'), damage: ocr('(10)') },
        { kind: 'attack', text: ocr('1-2_ Trueno: texto'), damage: ocr('(20)') },
      ],
      classes,
    ),
    V,
    C,
  )
  expect(draft.element.value).toBe('dragon')
  expect(draft.deck.value).toBe('pantano')
  expect(draft.attacks.map((a) => a.cost)).toEqual([['any'], ['electric']])
  expect(draft.attacks.map((a) => a.element)).toEqual(['normal', 'electric'])

  // Unknown en el costo ⇒ aviso + needsReview.
  const raro = await iconsOf({ attacks: 1, icons: { element: '#e08020', deck: '#5060e0', costs: [['#ff40c0']] } })
  const classesRaro = classifyCardIcons(raro, dragonLabels, DEFAULT_SCAN_CONFIG.icons.maxDistance)
  const draftRaro = analyzeCard(draftInput([{ kind: 'attack', text: ocr('1_ X: t'), damage: ocr('(10)') }], classesRaro), V, C)
  expect(draftRaro.attacks[0]?.cost).toEqual(['unknown'])
  expect(draftRaro.warnings.join(' ')).toMatch(/desconocido/)
  expect(draftRaro.needsReview).toBe(true)

  // Sin icon-labels.json los íconos no penalizan (se clasifican después).
  const sinIconos = analyzeCard(draftInput([{ kind: 'attack', text: ocr('4-5_ Envolver: texto'), damage: ocr('(10)') }], undefined), V, C)
  expect(sinIconos.element.value).toBeNull()
  expect(sinIconos.attacks[0]?.cost).toBeNull()
  expect(sinIconos.needsReview).toBe(false)
})

// AC: SPEC-S/T-102c/AC-3 (integración) — el lote cards:scan clasifica íconos
// cuando hay etiquetas inyectadas y los guarda en el caché (v7).
test('AC: SPEC-S/T-102c/AC-3 scanBatch clasifica íconos con etiquetas', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't102c-run-'))
  try {
    writeFileSync(join(tmp, 'carta.png'), await syntheticCard({ attacks: 2, icons: { element: '#e08020', deck: '#5060e0', costs: [['any'], ['#f0c828']] } }))
    const base = await iconsOf({ attacks: 2, icons: { element: '#e08020', deck: '#5060e0', costs: [['any'], ['#f0c828']] } })
    const grupos = groupIcons(sampledOf(base, 'base.png'), DEFAULT_SCAN_CONFIG.icons.groupThreshold)
    const byId: Record<string, string> = {}
    for (const g of grupos) byId[g.id] = labelByColor(g)
    const labels = buildLabels(grupos, byId)
    const res = await scanBatch({ input: tmp, outDir: tmp, engine: fakeEngine, iconLabels: labels })
    expect(res.ok).toBe(true)
    const hash = createHash('sha256').update(readFileSync(join(tmp, 'carta.png'))).digest('hex')
    const entry = JSON.parse(readFileSync(join(tmp, '.cache', `${hash}.json`), 'utf8')) as {
      v?: number
      icons?: { element?: { vector: number[] } | null }
      draft?: { element?: { value: string | null }; deck?: { value: string | null }; attacks?: { cost: string[] | null }[] }
    }
    expect(entry.v).toBe(9) // v9 (T-104): nombre/mazo del archivo + perfil de segmentación
    expect(entry.icons?.element?.vector).toHaveLength(259)
    expect(entry.draft?.element?.value).toBe('fire')
    expect(entry.draft?.deck?.value).toBe('pantano')
    expect(entry.draft?.attacks?.map((a) => a.cost)).toEqual([['any'], ['electric']])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-S/T-102c/AC-5 — carta de oro: con el aprendizaje hecho sobre la
// carta de oro (etiquetada por rol, que conocemos del expected) Dratini sale
// con element dragon, deck montana y costos [any], [any], [electric]. Se omite
// si no hay fixture (fotos reales, gitignored).
const tieneFixture = existsSync(FIXTURE)
test.skipIf(!tieneFixture)('AC: SPEC-S/T-102c/AC-5 carta de oro: Dratini dragon/montana/[any,any,electric]', async () => {
  const norm = await normalizeScan(readFileSync(FIXTURE))
  expect(norm.ok).toBe(true)
  if (!norm.ok) return
  const seg = await segmentCard(norm.png)
  expect(seg.ok).toBe(true)
  if (!seg.ok) return
  const icons = await extractIcons(norm.png, seg.segmentation, DEFAULT_SCAN_CONFIG)
  // Extracción puntual: 1 elemento, 1 mazo y exactamente un costo por ataque.
  expect(icons.element).not.toBeNull()
  expect(icons.deck).not.toBeNull()
  expect(icons.costs).toHaveLength(3)
  expect(icons.costs.map((cs) => cs.length)).toEqual([1, 1, 1])

  // Aprendizaje sobre la propia carta de oro…
  const grupos = groupIcons(sampledOf(icons, 'dratini.jpg'), DEFAULT_SCAN_CONFIG.icons.groupThreshold)
  // …etiquetado por ROL (la carta de oro sabemos qué es cada ícono): los tres
  // íconos de color caen en grupos distintos.
  const byId: Record<string, string> = {}
  for (const g of grupos) {
    if (g.allGray) {
      byId[g.id] = 'any'
      continue
    }
    const ej = g.examples[0]
    if (ej === undefined) continue
    if (ej.role === 'element') byId[g.id] = 'dragon'
    else if (ej.role === 'deck') byId[g.id] = 'montana'
    else if (ej.attackIndex === 2) byId[g.id] = 'electric'
    else byId[g.id] = 'otro'
  }
  const labels = buildLabels(grupos, byId)
  expect(new Set(labels.icons.map((l) => l.label))).toEqual(new Set(['any', 'dragon', 'montana', 'electric']))

  // Clasificación + draft ⇒ el resultado de la carta de oro.
  const classes = classifyCardIcons(icons, labels, DEFAULT_SCAN_CONFIG.icons.maxDistance)
  expect(classes.element?.label).toBe('dragon')
  expect(classes.deck?.label).toBe('montana')
  expect(classes.costs.map((cs) => cs.map((c) => c.label))).toEqual([['any'], ['any'], ['electric']])

  const draft = analyzeCard(
    draftInput(
      [
        { kind: 'attack', text: ocr('4-5_ Envolver: texto'), damage: ocr('(10)') },
        { kind: 'attack', text: ocr('3_ “Agilidad”: texto'), damage: ocr('', 0) },
        { kind: 'attack', text: ocr('1-2_ Attack-trueno: texto'), damage: ocr('(20)') },
      ],
      classes,
    ),
    V,
    C,
  )
  expect(draft.element.value).toBe('dragon')
  expect(draft.deck.value).toBe('montana')
  expect(draft.attacks.map((a) => a.cost)).toEqual([['any'], ['any'], ['electric']])
  expect(draft.attacks.map((a) => a.element)).toEqual(['normal', 'normal', 'electric'])
})

// AC: SPEC-S/T-102c/AC-4 — decisión del dueño (Q-081): el deck sale del
// NOMBRE del escaneo (" Bosque"…" Pantano", " S", " Gym", " League", "Evo")
// o de la RUTA, y pisa al ícono del pie (chequeo cruzado si difieren).
test('AC: SPEC-S/T-102c/AC-4 deck por nombre/ruta del archivo pisa al ícono del pie', () => {
  expect(deckFromFilename('Bellsprut Bosque.jpg')).toBe('bosque')
  expect(deckFromFilename('Abra S.jpg')).toBe('sorpresa')
  expect(deckFromFilename('Electrode Surge Gym.jpg')).toBe('gimnasio')
  expect(deckFromFilename('Arcanine Gary League.png')).toBe('liga')
  expect(deckFromFilename('Hypno Evo A.jpg')).toBe('evolucion')
  expect(deckFromFilename('Charizard.jpg')).toBeNull()
  expect(deckFromPath(join('scans', 'evolution', 'Charizard.jpg'))).toBe('evolucion')
  const bloque: Block = { kind: 'attack', text: ocr('4-5_ A: t'), damage: ocr('(10)') }
  expect(analyzeCard(draftInput([bloque], undefined, 'montana'), V, C).deck.value).toBe('montana')
  // Ícono del pie distinto ⇒ aviso de chequeo cruzado, gana el nombre/ruta.
  const pieOtro: CardIconClasses = { element: null, deck: { label: 'pantano', confidence: 0.9, distance: 0.01 }, costs: [] }
  const cruzado = analyzeCard(draftInput([bloque], pieOtro, 'montana'), V, C)
  expect(cruzado.deck.value).toBe('montana')
  expect(cruzado.warnings.join(' ')).toMatch(/≠/)
})
