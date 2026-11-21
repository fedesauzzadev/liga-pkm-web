// AC: SPEC-T/T-105 — reconocedor aprendido de números y caras: segmentación de
// glifos por componentes conectados (círculo de HP detectado por color/forma
// aunque se mueva, columna de daño `(10)`/`(+10)`, prefijo de caras `4-5_`),
// aprendizaje por agrupación con etiquetado único en glyphs.html, clasificación
// por centroide con confianza y restricciones del dominio (2ª hipótesis antes
// de needsReview) y meta de exactitud sobre verdad terreno.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { syntheticCard, type SynthSpec } from '../tools/cards-scan/synth.ts'
import { normalizeScan } from '../tools/cards-scan/image.ts'
import { segmentCard, type Rect } from '../tools/cards-scan/segment.ts'
import { extractGlyphs, glyphDistance, GLYPH_VECTOR_LEN, type CardGlyphs, type GlyphPatch } from '../tools/cards-scan/glyphs.ts'
import { buildGlyphLabels, glyphLearnBatch, groupGlyphs, renderGlyphsHtml, type SampledGlyph } from '../tools/cards-scan/glyphlearn.ts'
import {
  classifyGlyph,
  loadGlyphLabels,
  parseGlyphLabels,
  readDamageNumber,
  readFacesPrefix,
  readHpNumber,
  type GlyphClassResult,
  type GlyphLabels,
} from '../tools/cards-scan/gclassify.ts'
import { glyphCheck } from '../tools/cards-scan/glyphcheck.ts'
import { DEFAULT_SCAN_CONFIG } from '../tools/cards-scan/config.ts'

const FIXTURE = fileURLToPath(new URL('../tools/cards-scan/fixtures/dratini.jpg', import.meta.url))
const CFG = DEFAULT_SCAN_CONFIG
const V = CFG.validation

/** Carta de trabajo: 3 ataques con caras/daño conocidos y HP 50. */
const BASE_SPEC: SynthSpec = {
  attacks: 3,
  hp: 50,
  attackSpecs: [
    { faces: [4, 5], damage: 10 },
    { faces: [1, 2, 3], damage: 20, plusDamage: true },
    { faces: [6], damage: 30 },
  ],
}
const ESPEC_2: SynthSpec = { attacks: 2, hp: 90, attackSpecs: [{ faces: [2, 3], damage: 40 }, { faces: [1], damage: 0 }] }

async function glyphsOf(spec: SynthSpec): Promise<CardGlyphs> {
  const norm = await normalizeScan(await syntheticCard(spec))
  if (!norm.ok) throw new Error(norm.error)
  const seg = await segmentCard(norm.png)
  if (!seg.ok) throw new Error(seg.error)
  return extractGlyphs(norm.png, seg.segmentation, CFG)
}

/** Etiqueta conocida de cada glifo (la carta la dibujamos nosotros): por ROL
 * y posición dentro del rol (hp izq→der, prefijo y daño en orden). */
function sampledWithKnown(spec: SynthSpec, g: CardGlyphs, file: string): SampledGlyph[] {
  const atk = spec.attackSpecs ?? []
  const hpChars = [...String(spec.hp ?? '')]
  const preChars = atk.map((a) => [...(a.faces ?? []).join('-'), '_'] as string[])
  const dmgChars = atk.map((a) => ['(', ...(a.plusDamage === true ? ['+'] : []), ...String(a.damage ?? ''), ')'] as string[])
  const out: SampledGlyph[] = []
  const mk = (p: (typeof g.hp)[number], known: string | undefined, role: string): SampledGlyph => ({
    file,
    patch: p,
    thumb: `data:image/png;base64,${file}-${role}`,
    ...(known !== undefined ? { known } : {}),
  })
  g.hp.forEach((p, i) => out.push(mk(p, hpChars[i], 'hp')))
  g.attacks.forEach((a, i) => {
    a.prefix.forEach((p, j) => out.push(mk(p, (preChars[i] ?? [])[j], 'pre' + i)))
    a.damage.forEach((p, j) => out.push(mk(p, (dmgChars[i] ?? [])[j], 'dmg' + i)))
  })
  return out.filter((s) => s.known !== undefined)
}

/** Un centroide promedio por carácter (equivalente a que el dueño etiquetó
 * cada grupo de glyphs.html UNA vez). */
async function learnedLabels(specs: readonly SynthSpec[]): Promise<GlyphLabels> {
  const sums = new Map<string, number[]>()
  const counts = new Map<string, number>()
  for (const spec of specs) {
    for (const s of sampledWithKnown(spec, await glyphsOf(spec), 'x.png')) {
      if (s.known === undefined) continue
      const acc = sums.get(s.known) ?? new Array<number>(GLYPH_VECTOR_LEN).fill(0)
      s.patch.vector.forEach((v, i) => {
        acc[i] = (acc[i] ?? 0) + v
      })
      sums.set(s.known, acc)
      counts.set(s.known, (counts.get(s.known) ?? 0) + 1)
    }
  }
  return {
    version: 1,
    glyphs: [...sums.entries()].map(([char, acc], i) => {
      const n = counts.get(char) ?? 1
      return { id: `g${i + 1}`, label: char, vector: acc.map((v) => v / n) }
    }),
  }
}

async function readCard(spec: SynthSpec, labels: GlyphLabels): Promise<{ hp: number | null; faces: (number[] | null)[]; damage: (number | null)[] }> {
  const g = await glyphsOf(spec)
  const cls = (p: GlyphPatch): GlyphClassResult => classifyGlyph(p, labels, CFG.glyphs.maxDistance)
  return {
    hp: readHpNumber(g.hp.map(cls), V.hp).value,
    faces: g.attacks.map((a) => {
      const v = readFacesPrefix(a.prefix.map(cls)).value
      return v === null ? null : [...v]
    }),
    damage: g.attacks.map((a) => readDamageNumber(a.damage.map(cls), V.damage).value),
  }
}

// AC: SPEC-T/T-105/AC-1 — segmenta glifos (componentes conectados) en el
// círculo de HP (detectado por color/forma aunque cambie de posición), la
// columna de daño `(10)`/`(+10)` y el prefijo de caras `4-5_`.
test('AC: SPEC-T/T-105/AC-1 glifos por componentes conectados en HP, daño y prefijo', async () => {
  const g = await glyphsOf(BASE_SPEC)
  // Círculo blanco del HP: detectado cerca de su posición real (575,44) r≈34+trazo.
  expect(g.hpCircle).not.toBeNull()
  if (g.hpCircle !== null) {
    const r = g.hpCircle
    expect(r.w).toBeGreaterThan(50)
    expect(r.w).toBeLessThan(110)
    expect(Math.abs(r.w / r.h - 1)).toBeLessThan(0.3)
    expect(r.x + r.w / 2).toBeGreaterThan(540)
    expect(r.x + r.w / 2).toBeLessThan(615)
    expect(r.y + r.h / 2).toBeGreaterThan(20)
    expect(r.y + r.h / 2).toBeLessThan(70)
  }
  // HP `50` = 2 glifos en orden de lectura.
  expect(g.hp).toHaveLength(2)
  if (g.hp[0] !== undefined && g.hp[1] !== undefined) expect(g.hp[0].rect.x).toBeLessThan(g.hp[1].rect.x)
  // Prefijos: `4-5_` (4 glifos), `1-2-3_` (6), `6_` (2).
  expect(g.attacks.map((a) => a.prefix.length)).toEqual([4, 6, 2])
  // Daño: `(10)` (4), `(+20)` (5), `(30)` (4).
  expect(g.attacks.map((a) => a.damage.length)).toEqual([4, 5, 4])
  for (const a of g.attacks) {
    for (const p of [...a.prefix, ...a.damage]) expect(p.vector).toHaveLength(GLYPH_VECTOR_LEN)
  }
  // Los glifos del HP viven DENTRO del círculo detectado.
  for (const p of g.hp) {
    const c = g.hpCircle as Rect
    expect(p.rect.x).toBeGreaterThanOrEqual(c.x)
    expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(c.x + c.w)
  }

  // El detector sigue al círculo aunque se mueva (misma carta, círculo corrido).
  const movida = await glyphsOf({ ...BASE_SPEC, hpCircleDx: -90 })
  expect(movida.hpCircle).not.toBeNull()
  if (movida.hpCircle !== null) {
    expect(movida.hpCircle.x + movida.hpCircle.w / 2).toBeLessThan(520)
    expect(movida.hp).toHaveLength(2)
  }

  // Distancias: mismo carácter ≈ 0; caracteres distintos > umbral de grupo.
  const g2 = await glyphsOf(BASE_SPEC)
  const same = glyphDistance(g.hp[0]?.vector ?? [], g2.hp[0]?.vector ?? [])
  const other = glyphDistance(g.hp[0]?.vector ?? [], g2.hp[1]?.vector ?? [])
  expect(same).toBeLessThan(CFG.glyphs.groupThreshold)
  expect(other).toBeGreaterThan(CFG.glyphs.groupThreshold)
})

// AC: SPEC-T/T-105/AC-2 — `pnpm cards:glyphs:learn` agrupa los glifos de una
// muestra por parecido y genera glyphs.html para etiquetar UNA vez (0-9, -,
// _, (, ), +); Exportar baja glyph-labels.json (centroides + etiquetas).
test('AC: SPEC-T/T-105/AC-2 agrupación, glyphs.html y exportación de etiquetas únicas', async () => {
  const a = await glyphsOf(BASE_SPEC)
  const b = await glyphsOf(ESPEC_2)
  const muestra = [...sampledWithKnown(BASE_SPEC, a, 'a.png'), ...sampledWithKnown(ESPEC_2, b, 'b.png')]
  const groups = groupGlyphs(muestra, CFG.glyphs.groupThreshold)
  // Cada carácter forma UN grupo: tantos grupos como caracteres distintos y
  // los tamaños coinciden con las ocurrencias de cada uno en la muestra.
  const ocurrencias = new Map<string, number>()
  for (const s of muestra) {
    if (s.known !== undefined) ocurrencias.set(s.known, (ocurrencias.get(s.known) ?? 0) + 1)
  }
  expect(groups).toHaveLength(ocurrencias.size)
  expect([...groups.map((g) => g.count)].sort((x, y) => y - x)).toEqual([...ocurrencias.values()].sort((x, y) => y - x))
  // Determinista: misma muestra ⇒ mismos grupos.
  expect(groupGlyphs(muestra, CFG.glyphs.groupThreshold).map((g) => g.id)).toEqual(groups.map((g) => g.id))

  const html = renderGlyphsHtml(groups, {})
  for (const marca of ['<select', 'Exportar', 'glyph-labels.json', 'data:image/png;base64,']) expect(html).toContain(marca)
  for (const ch of ['0', '4', '-', '_', '(', ')', '+']) expect(html).toContain(`value="${ch}"`)
  expect(html).not.toMatch(/src="http/) // autocontenido, sin servidor

  // Etiquetado único: cada grupo se nombra una vez; sin etiqueta y 'otro' no
  // se exportan (los centroides sí).
  const ref = await learnedLabels([BASE_SPEC, ESPEC_2])
  const byId: Record<string, string> = {}
  for (const grp of groups) {
    byId[grp.id] = [...ref.glyphs].sort((p, q) => glyphDistance(grp.vector, p.vector) - glyphDistance(grp.vector, q.vector))[0]?.label ?? ''
  }
  byId[groups[0]!.id] = '' // uno sin etiquetar
  const labels = buildGlyphLabels(groups, byId)
  expect(labels.version).toBe(1)
  expect(labels.glyphs).toHaveLength(groups.length - 1)
  expect(labels.glyphs.every((l) => l.vector.length === GLYPH_VECTOR_LEN && l.label.length > 0)).toBe(true)

  // glyph-labels.json: se parsea y valida; JSON inválido ⇒ null (sin romper).
  const parsed = parseGlyphLabels(JSON.stringify(labels))
  expect(parsed?.glyphs.length).toBe(labels.glyphs.length)
  expect(parseGlyphLabels('{no json')).toBeNull()
  expect(parseGlyphLabels(JSON.stringify({ version: 1, glyphs: [{ id: 'g1', label: '4', vector: [1, 2] }] }))).toBeNull()
})

// AC: SPEC-T/T-105/AC-2 — CLI `pnpm cards:glyphs:learn <carpeta> [--sample]`:
// recorre los escaneos (sin OCR), muestrea con tope y escribe glyphs.html.
test('AC: SPEC-T/T-105/AC-2 glyphLearnBatch escribe glyphs.html con --sample', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't105-learn-'))
  try {
    writeFileSync(join(tmp, 'a.png'), await syntheticCard(BASE_SPEC))
    writeFileSync(join(tmp, 'b.png'), await syntheticCard(ESPEC_2))
    const res = await glyphLearnBatch({ input: tmp, outDir: tmp })
    expect(res.ok).toBe(true)
    expect(res.cards).toBe(2)
    expect(res.sampled).toBeGreaterThan(0)
    expect(existsSync(join(tmp, 'glyphs.html'))).toBe(true)
    expect(readFileSync(join(tmp, 'glyphs.html'), 'utf8')).toContain('Exportar')
    const chico = await glyphLearnBatch({ input: tmp, outDir: join(tmp, 'chico'), sample: 5 })
    expect(chico.sampled).toBe(5)
    expect(chico.ok).toBe(true)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-T/T-105/AC-3 — clasificación por centroide más cercano con
// confianza; restricciones del dominio (HP 20-150 múltiplo de 10, daño 0-200
// múltiplo de 10, caras 1-6 ascendentes con `-` y `_` final): si una lectura
// viola una restricción se prueba la SEGUNDA mejor hipótesis antes de marcar
// needsReview.
test('AC: SPEC-T/T-105/AC-3 centroide, restricciones de dominio y segunda hipótesis', async () => {
  const labels = await learnedLabels([BASE_SPEC, ESPEC_2])
  // Carta REDIBUJADA con valores nuevos (mismos glifos): lectura exacta.
  const leido = await readCard(
    { attacks: 3, hp: 60, attackSpecs: [{ faces: [3, 4], damage: 50 }, { faces: [1, 2], damage: 10, plusDamage: true }, { faces: [2, 4, 6], damage: 100 }] },
    labels,
  )
  expect(leido.hp).toBe(60)
  expect(leido.faces).toEqual([[3, 4], [1, 2], [2, 4, 6]])
  expect(leido.damage).toEqual([50, 10, 100])

  // 2ª hipótesis por restricción (alternativas construidas a mano).
  const fake = (pairs: readonly [string, number][]): GlyphClassResult => ({
    label: pairs[0]?.[0] ?? 'unknown',
    confidence: 0.9,
    ranked: pairs.map(([label, distance]) => ({ label, distance })),
  })

  // HP: `55` no es múltiplo de 10 ⇒ 2ª hipótesis `50`.
  const hp55 = readHpNumber([fake([['5', 0.01], ['0', 0.05]]), fake([['5', 0.02], ['0', 0.04]])], V.hp)
  expect(hp55.value).toBe(50)
  expect(hp55.usedSecondBest).toBe(true)
  expect(hp55.needsReview).toBe(false)
  // HP ilegible (ninguna hipótesis válida) ⇒ needsReview.
  const hpMal = readHpNumber([fake([['5', 0.01], ['7', 0.05]]), fake([['5', 0.02], ['9', 0.04]])], V.hp)
  expect(hpMal.value).toBeNull()
  expect(hpMal.needsReview).toBe(true)
  // La 1ª hipótesis válida gana si ya cumple la restricción.
  const hp60 = readHpNumber([fake([['6', 0.01]]), fake([['0', 0.01]])], V.hp)
  expect(hp60.value).toBe(60)
  expect(hp60.usedSecondBest).toBe(false)

  // Caras: `5-4_` no es ascendente ⇒ 2ª hipótesis `4-5_`.
  const caras = readFacesPrefix([fake([['5', 0.01], ['4', 0.03]]), fake([['-', 0.01]]), fake([['4', 0.02], ['5', 0.03]]), fake([['_', 0.01]])])
  expect(caras.value).toEqual([4, 5])
  expect(caras.usedSecondBest).toBe(true)
  // Sin `_` final ⇒ needsReview (el prefijo termina siempre en `_`).
  const sinRaya = readFacesPrefix([fake([['4', 0.01]]), fake([['-', 0.01]]), fake([['5', 0.01]])])
  expect(sinRaya.value).toBeNull()
  expect(sinRaya.needsReview).toBe(true)
  // Cara fuera de 1-6 (el `7` no existe en un dado) ⇒ 2ª hipótesis.
  const cara7 = readFacesPrefix([fake([['7', 0.01], ['1', 0.04]]), fake([['_', 0.01]])])
  expect(cara7.value).toEqual([1])
  expect(cara7.usedSecondBest).toBe(true)

  // Daño: `(15)` no es múltiplo de 10 ⇒ `10` por 2ª hipótesis; `(+10)` y `(0)` valen.
  const dano = readDamageNumber([fake([['(', 0.01]]), fake([['1', 0.01]]), fake([['5', 0.02], ['0', 0.03]]), fake([[')', 0.01]])], V.damage)
  expect(dano.value).toBe(10)
  expect(dano.usedSecondBest).toBe(true)
  const danoPlus = readDamageNumber([fake([['(', 0.01]]), fake([['+', 0.01]]), fake([['1', 0.01]]), fake([['0', 0.01]]), fake([[')', 0.01]])], V.damage)
  expect(danoPlus.value).toBe(10)
  expect(danoPlus.usedSecondBest).toBe(false)
  const danoCero = readDamageNumber([fake([['(', 0.01]]), fake([['0', 0.01]]), fake([[')', 0.01]])], V.damage)
  expect(danoCero.value).toBe(0)
  // Sin glifos de daño (habilidad) ⇒ null SIN needsReview.
  const habilidad = readDamageNumber([], V.damage)
  expect(habilidad.value).toBeNull()
  expect(habilidad.needsReview).toBe(false)
})

// AC: SPEC-T/T-105/AC-4 — exactitud objetivo sobre la verdad terreno:
// HP ≥ 98 %, caras del dado ≥ 95 %, daño ≥ 97 %.
test('AC: SPEC-T/T-105/AC-4 exactitud sobre verdad terreno (sintética, misma fuente)', async () => {
  const aprender: SynthSpec[] = [
    BASE_SPEC,
    ESPEC_2,
    { attacks: 2, hp: 120, attackSpecs: [{ faces: [1, 6], damage: 80 }, { faces: [5, 6], damage: 150 }] },
    { attacks: 2, hp: 30, attackSpecs: [{ faces: [3, 4, 5], damage: 20, plusDamage: true }, { faces: [2, 5], damage: 70 }] },
  ]
  const labels = await learnedLabels(aprender)
  const medir: SynthSpec[] = [
    { attacks: 3, hp: 60, attackSpecs: [{ faces: [3, 4], damage: 50 }, { faces: [1, 2], damage: 10, plusDamage: true }, { faces: [2, 4, 6], damage: 100 }] },
    { attacks: 2, hp: 110, attackSpecs: [{ faces: [1, 2, 3, 4], damage: 70 }, { faces: [5], damage: 200 }] },
    { attacks: 2, hp: 40, attackSpecs: [{ faces: [2, 3], damage: 30 }, { faces: [4, 6], damage: 90, plusDamage: true }] },
    { attacks: 2, hp: 70, attackSpecs: [{ faces: [1, 5], damage: 0 }, { faces: [3, 6], damage: 130 }] },
    { attacks: 2, hp: 100, attackSpecs: [{ faces: [6], damage: 60, plusDamage: true }, { faces: [1, 3, 5], damage: 20 }] },
    { attacks: 2, hp: 80, attackSpecs: [{ faces: [2, 6], damage: 110 }, { faces: [4, 5], damage: 40 }] },
    { attacks: 2, hp: 20, attackSpecs: [{ faces: [3], damage: 10 }, { faces: [1, 4], damage: 120, plusDamage: true }] },
    { attacks: 2, hp: 130, attackSpecs: [{ faces: [1, 2, 6], damage: 140 }, { faces: [3, 5], damage: 0 }] },
  ]
  let hpOk = 0
  let carasOk = 0
  let carasN = 0
  let danoOk = 0
  let danoN = 0
  for (const spec of medir) {
    const r = await readCard(spec, labels)
    if (r.hp === spec.hp) hpOk += 1
    spec.attackSpecs?.forEach((a, i) => {
      if (JSON.stringify(r.faces[i]) === JSON.stringify([...(a.faces ?? [])])) carasOk += 1
      carasN += 1
      if (r.damage[i] === a.damage) danoOk += 1
      danoN += 1
    })
  }
  expect(hpOk / medir.length).toBeGreaterThanOrEqual(0.98)
  expect(carasOk / carasN).toBeGreaterThanOrEqual(0.95)
  expect(danoOk / danoN).toBeGreaterThanOrEqual(0.97)
})

// AC: SPEC-T/T-105/AC-4 — glyphCheck mide lo mismo sobre los PARES reales
// (golden + verified) cuando existen; sin etiquetas o sin pares avisa y no rompe.
test('AC: SPEC-T/T-105/AC-4 glyphCheck avisa sin etiquetas ni pares', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't105-check-'))
  try {
    // Sin etiquetas: ok=false con línea que pide cards:glyphs:learn.
    const sin = await glyphCheck({ root: tmp, outDir: tmp })
    expect(sin.ok).toBe(false)
    expect(sin.lines.join(' ')).toMatch(/cards:glyphs:learn/)
    // Con etiquetas inyectadas y SIN pares: avisa la verdad terreno chica.
    const labels = await learnedLabels([BASE_SPEC])
    const vacio = await glyphCheck({ root: tmp, outDir: tmp, labels })
    expect(vacio.ok).toBe(false)
    expect(vacio.lines.join(' ')).toMatch(/verdad terreno|par/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-T/T-105/AC-1 — carta de oro (escaneo real): el extractor encuentra
// el círculo del HP por color/forma y glifos en las tres zonas. Se omite si no
// hay fixture (fotos reales, gitignored). En el escaneo real el corte
// geométrico del prefijo deja pasar letras del nombre y la zona de daño puede
// traer texto del efecto: el corte fino lo hace el LECTOR por etiquetas
// (AC-3), por lo que acá se mide la ESTRUCTURA (círculo + dígitos + bloques).
const tieneFixture = existsSync(FIXTURE)
test.skipIf(!tieneFixture)('AC: SPEC-T/T-105/AC-1 carta de oro: extracción de glifos en Dratini', async () => {
  const norm = await normalizeScan(readFileSync(FIXTURE))
  expect(norm.ok).toBe(true)
  if (!norm.ok) return
  const seg = await segmentCard(norm.png)
  expect(seg.ok).toBe(true)
  if (!seg.ok) return
  const g = await extractGlyphs(norm.png, seg.segmentation, CFG)
  expect(g.hpCircle).not.toBeNull()
  if (g.hpCircle !== null) {
    // Círculo blanco redondo a la derecha del encabezado.
    expect(g.hpCircle.w).toBeGreaterThanOrEqual(42)
    expect(Math.abs(g.hpCircle.w / g.hpCircle.h - 1)).toBeLessThan(0.5)
    expect(g.hpCircle.x).toBeGreaterThan(700 * 0.6)
  }
  expect(g.hp).toHaveLength(2) // HP 50, dentro del círculo
  expect(g.hp[0]?.rect.x).toBeLessThan(g.hp[1]?.rect.x ?? 0)
  expect(g.attacks).toHaveLength(3)
  // Prefijos `4-5_`, `3_`, `1-2_`: al menos los dígitos quedan (puede haber
  // letras del nombre extra que el lector descarta por etiqueta).
  for (const a of g.attacks) expect(a.prefix.length).toBeGreaterThanOrEqual(2)
  // Daños `(10)` y `(20)` en los ataques 1 y 3 (paréntesis + dígitos); la
  // habilidad del medio puede no traer nada.
  expect(g.attacks[0]?.damage.length).toBeGreaterThanOrEqual(3)
  expect(g.attacks[2]?.damage.length).toBeGreaterThanOrEqual(3)
})

test('loadGlyphLabels tolera archivo ausente', () => {
  expect(loadGlyphLabels(join(tmpdir(), 't105-no-existe'))).toBeNull()
})
