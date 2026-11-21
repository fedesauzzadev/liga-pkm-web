// AC: SPEC-T/T-104 — nombre y mazo desde el nombre del archivo + segmentación
// por perfil: analizador tolerante de nombres de archivo (Pokémon contra la
// lista de PokeAPI con distancia ≤ 2, mazo/grupo con alias, variante final,
// líder/entrenador de gimnasio/Liga), OCR del encabezado SOLO como
// verificación (avisa, no pisa), segmentación independiente del color por
// perfil (terrain/gym/league, densidad de bordes), criterio de éxito (≥ 95 %
// gimnasio+Liga, 100 % demás) con superposiciones de debug regeneradas e
// informe de las que siguen fallando con motivo concreto.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import sharp from 'sharp'
import type { PokemonCard } from '../packages/content/src/cards.ts'
import type { SpeciesOut } from '../tools/pokeapi.ts'
import { parseFilename } from '../tools/cards-scan/filename.ts'
import { analyzeCard, type DraftInput, type FileCardInfo } from '../tools/cards-scan/draft.ts'
import { DEFAULT_SCAN_CONFIG } from '../tools/cards-scan/config.ts'
import type { RegionOcr } from '../tools/cards-scan/analyze.ts'
import { syntheticCard } from '../tools/cards-scan/synth.ts'
import { normalizeScan } from '../tools/cards-scan/image.ts'
import { segmentCard } from '../tools/cards-scan/segment.ts'
import { segCheck } from '../tools/cards-scan/segcheck.ts'

const reg = (text: string): RegionOcr => ({ text, confidence: 0.9 })

/** DraftInput mínimo por grupo (los campos que no importan quedan vacíos). */
const draftInput = (group: 'terrain' | 'gym' | 'league', over: { name: string }, file: FileCardInfo | undefined): DraftInput => ({
  group,
  name: reg(over.name),
  hp: reg('(50)'),
  blocks: [{ kind: 'attack', text: reg('4-5_ Envolver: texto.'), damage: reg('(10)') }],
  footerStage: reg('Básico'),
  footerRight: reg('E: Dragonair (2)'),
  ...(file !== undefined ? { file } : {}),
})

// Especies mínimas para el snap (la lista real es gitignored, T-045).
const SPECIES: readonly SpeciesOut[] = [
  { dex: 8, nameEn: 'Wartortle', nameEs: 'Wartortle', types: ['water'] },
  { dex: 10, nameEn: 'Caterpie', nameEs: 'Caterpie', types: ['bug'] },
  { dex: 15, nameEn: 'Beedrill', nameEs: 'Beedrill', types: ['bug', 'poison'] },
  { dex: 26, nameEn: 'Raichu', nameEs: 'Raichu', types: ['electric'] },
  { dex: 29, nameEn: 'Nidoran♀', nameEs: 'Nidoran♀', types: ['poison'] },
  { dex: 55, nameEn: 'Golduck', nameEs: 'Golduck', types: ['water'] },
  { dex: 56, nameEn: 'Mankey', nameEs: 'Mankey', types: ['fighting'] },
  { dex: 58, nameEn: 'Growlithe', nameEs: 'Growlithe', types: ['fire'] },
  { dex: 59, nameEn: 'Arcanine', nameEs: 'Arcanine', types: ['fire'] },
  { dex: 62, nameEn: 'Poliwrath', nameEs: 'Poliwrath', types: ['water', 'fighting'] },
  { dex: 63, nameEn: 'Abra', nameEs: 'Abra', types: ['psychic'] },
  { dex: 69, nameEn: 'Bellsprout', nameEs: 'Bellsprout', types: ['grass', 'poison'] },
  { dex: 70, nameEn: 'Weepinbell', nameEs: 'Weepinbell', types: ['grass', 'poison'] },
  { dex: 95, nameEn: 'Onix', nameEs: 'Onix', types: ['rock', 'ground'] },
  { dex: 98, nameEn: 'Krabby', nameEs: 'Krabby', types: ['water'] },
  { dex: 116, nameEn: 'Horsea', nameEs: 'Horsea', types: ['water'] },
  { dex: 122, nameEn: 'Mr. Mime', nameEs: 'Mr. Mime', types: ['psychic'] },
  { dex: 133, nameEn: 'Eevee', nameEs: 'Eevee', types: ['normal'] },
  { dex: 147, nameEn: 'Dratini', nameEs: 'Dratini', types: ['dragon'] },
]

// AC: SPEC-T/T-104/AC-1 — el nombre y el mazo/grupo salen del NOMBRE del
// archivo: tolerante a mayúsculas/tildes y separadores `_`, `-`, espacio;
// Pokémon contra la lista de PokeAPI (distancia ≤ 2); mazo/grupo con alias
// (`montana|montaña`, `isla|lago`, `evolucion|evo`, `sorpresa|s`,
// `gimnasio|gym`, `liga|league|l`); número (o letra a/b/c) final = copia o
// variante; líder de gimnasio y entrenador de Liga; lo no interpretable queda
// needsReview y cae al OCR.
test('AC: SPEC-T/T-104/AC-1 parseFilename: nombre, mazo, variante y líder', () => {
  const casos: readonly { file: string; expect: Partial<ReturnType<typeof parseFilename>> }[] = [
    { file: 'Caterpie A Bosque.jpg', expect: { name: 'Caterpie', dex: 10, group: 'terrain', deck: 'bosque', variant: 'a', ok: true } },
    { file: 'Growlithe A  Montana.jpg', expect: { deck: 'montana', variant: 'a' } }, // doble espacio
    { file: 'Dratini Montaña.JPG', expect: { name: 'Dratini', deck: 'montana', variant: null } }, // tilde + MAYÚSCULAS
    { file: 'Krabby Lago.jpg', expect: { deck: 'isla' } }, // alias lago → isla
    { file: 'Bellsprut Bosque.jpg', expect: { name: 'Bellsprout', dex: 69 } }, // distancia 1
    { file: 'Warturtle S.jpg', expect: { name: 'Wartortle', dex: 8, group: 'sorpresa', deck: 'sorpresa' } },
    { file: 'Nidoran F Pantano.jpg', expect: { name: 'Nidoran♀', dex: 29, deck: 'pantano' } }, // nombre de 2 palabras
    { file: 'Mr.Mime S.jpg', expect: { name: 'Mr. Mime', dex: 122, group: 'sorpresa' } }, // punto como separador
    { file: 'Onix Brock Gym.jpg', expect: { name: 'Onix', dex: 95, group: 'gym', deck: 'gimnasio', leaderOrTrainer: 'Brock' } },
    { file: 'Raichu Surge  Gym.jpg', expect: { group: 'gym', leaderOrTrainer: 'Surge' } }, // doble espacio
    { file: 'Eevee Gary L League.jpg', expect: { group: 'league', deck: 'liga', leaderOrTrainer: 'Gary', variant: null } },
    { file: 'Horsea Misty L League.png', expect: { group: 'league', leaderOrTrainer: 'Misty' } },
    { file: 'Arcanine Evo A.jpg', expect: { group: 'evolution', deck: 'evolucion', variant: 'a' } },
    { file: 'Golduck Evo a.jpg', expect: { group: 'evolution', variant: 'a' } }, // minúscula
    { file: 'Poliwrath Evo 2.jpg', expect: { group: 'evolution', variant: '2' } }, // número final = copia
    { file: ' poliwrath_evo-2 .jpeg', expect: { group: 'evolution', variant: '2' } }, // `_` y `-` como separadores
    { file: 'Beedril Evo C.jpg', expect: { name: 'Beedrill', dex: 15, variant: 'c' } },
    { file: 'Monkey Llanura.jpg', expect: { name: 'Mankey', dex: 56, deck: 'llanura' } }, // apodo del dueño → snap
  ]
  for (const c of casos) {
    const r = parseFilename(c.file, SPECIES)
    expect(r, c.file).toMatchObject(c.expect)
    expect(r.ok, c.file).toBe(true)
    expect(r.notes.length, c.file).toBe(0)
  }

  // Sin grupo en el nombre (cae a la carpeta en el llamador): el nombre igual sale.
  const sinGrupo = parseFilename('Weepinbell.jpg', SPECIES)
  expect(sinGrupo.name).toBe('Weepinbell')
  expect(sinGrupo.group).toBeNull()
  expect(sinGrupo.deck).toBeNull()

  // Nombre no reconocible → needsReview y cae al OCR.
  const raro = parseFilename('Xyzzy Bosque.jpg', SPECIES)
  expect(raro.name).toBeNull()
  expect(raro.ok).toBe(false)
  expect(raro.notes.join(' ')).toMatch(/no reconoc|PokeAPI/i)

  // Sin lista de especies: nombre crudo del archivo + nota.
  const sinLista = parseFilename('Onix Brock Gym.jpg', null)
  expect(sinLista.name).toBe('Onix')
  expect(sinLista.dex).toBeNull()
  expect(sinLista.leaderOrTrainer).toBe('Brock')
  expect(sinLista.notes.join(' ')).toMatch(/sin lista/i)
})

// AC: SPEC-T/T-104/AC-2 — el OCR del encabezado queda SOLO como verificación:
// si el nombre leído difiere del nombre del archivo se AVISA (no se usa el
// leído); el mazo y el líder del archivo mandan sobre el ícono/encabezado.
test('AC: SPEC-T/T-104/AC-2 el OCR del encabezado solo verifica (avisa, no pisa)', () => {
  const conf = DEFAULT_SCAN_CONFIG
  const file: FileCardInfo = { name: 'Bellsprout', dex: 69, deck: 'bosque', leaderOrTrainer: null, variant: null }
  const difiere = analyzeCard(draftInput('terrain', { name: 'Bellsprut' }, file), conf.validation, conf.confidence)
  expect(difiere.name.value).toBe('Bellsprout') // se usa el del archivo
  expect(difiere.name.note).toMatch(/nombre del archivo/)
  expect(difiere.warnings.join(' ')).toMatch(/Bellsprut.*Bellsprout/)
  expect(difiere.deck.value).toBe('bosque')
  const coincide = analyzeCard(draftInput('terrain', { name: 'Bellsprout' }, file), conf.validation, conf.confidence)
  expect(coincide.warnings.join(' ')).not.toMatch(/nombre leído/)

  // Gimnasio: el encabezado parseado (#n X de Y) se verifica contra el archivo
  // y el líder del archivo gana; el slot sigue viniendo del encabezado.
  const gymFile: FileCardInfo = { name: 'Onix', dex: 95, deck: 'gimnasio', leaderOrTrainer: 'Brock', variant: null }
  const gym = analyzeCard(draftInput('gym', { name: '#1 Onix de Broke' }, gymFile), conf.validation, conf.confidence)
  expect(gym.name.value).toBe('Onix')
  expect(gym.gym).not.toBeNull()
  expect(gym.gym?.slot).toBe(1)
  expect(gym.gym?.leaderOrTrainer).toBe('Brock') // el del archivo, no "Broke"
  expect(gym.warnings.join(' ')).toMatch(/Broke.*Brock/)
  // Liga sin encabezado legible: el entrenador igual sale del archivo.
  const leagueFile: FileCardInfo = { name: 'Eevee', dex: 133, deck: 'liga', leaderOrTrainer: 'Gary', variant: null }
  const league = analyzeCard(draftInput('league', { name: '???' }, leagueFile), conf.validation, conf.confidence)
  expect(league.leagueTrainer).toBe('Gary')
})

// AC: SPEC-T/T-104/AC-3 — segmentación INDEPENDIENTE del color y por perfil
// (terrain/gym/league): los separadores se detectan por perfil de proyección
// horizontal (densidad de bordes + líneas oscuras de cualquier tono), la línea
// gruesa del pie y los bloques de texto; un separador claro (no rojo oscuro,
// invisible para el detector cromático) segmenta igual en gym y league.
test('AC: SPEC-T/T-104/AC-3 segmentación por perfil e independiente del color', async () => {
  const casos: readonly { profile: 'terrain' | 'gym' | 'league'; separator: string; attacks: number }[] = [
    { profile: 'gym', separator: '#a8c8e8', attacks: 2 }, // azul claro: mx>185 ⇒ invisible para croma oscura
    { profile: 'league', separator: '#c8d8a8', attacks: 2 }, // verde claro visible (no rojo oscuro)
    { profile: 'gym', separator: '#d8c8a8', attacks: 1 },
    { profile: 'terrain', separator: '#97392b', attacks: 3 }, // regresión: rojo oscuro original
  ]
  for (const c of casos) {
    const norm = await normalizeScan(await syntheticCard({ attacks: c.attacks, profile: c.profile, separator: c.separator }))
    expect(norm.ok, c.profile).toBe(true)
    if (!norm.ok) continue
    const seg = await segmentCard(norm.png, undefined, c.profile)
    expect(seg.ok, `${c.profile} ${c.separator}`).toBe(true)
    if (!seg.ok) continue
    expect(seg.segmentation.profile).toBe(c.profile)
    expect(seg.segmentation.attacks.length, c.profile).toBe(c.attacks)
    expect(seg.segmentation.footer.h, c.profile).toBeGreaterThan(0)
    expect(seg.segmentation.footerLine.y, c.profile).toBeGreaterThan(900)
  }
})

// AC: SPEC-T/T-104/AC-4 — criterio de éxito medible: segmentación correcta
// (≥ 1 bloque de ataque, pie encontrado, cantidad de bloques igual a la
// verdad terreno cuando exista) en ≥ 95 % de gym+Liga y 100 % de las demás;
// las superposiciones debug/*.png se regeneran para el dueño.
test('AC: SPEC-T/T-104/AC-4 cards:segcheck: ≥95 % gym+Liga, 100 % demás, debug regenerado', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't104-seg-'))
  try {
    const scans = join(tmp, 'content', 'photos', 'scans')
    mkdirSync(join(scans, 'terrain', 'bosque'), { recursive: true })
    mkdirSync(join(scans, 'gym'), { recursive: true })
    mkdirSync(join(scans, 'league'), { recursive: true })
    writeFileSync(join(scans, 'terrain', 'bosque', 'Caterpie A Bosque.jpg'), await syntheticCard({ attacks: 2 }))
    writeFileSync(join(scans, 'gym', 'Onix Brock Gym.jpg'), await syntheticCard({ attacks: 2, profile: 'gym', separator: '#a8c8e8' }))
    writeFileSync(join(scans, 'league', 'Eevee Gary L League.jpg'), await syntheticCard({ attacks: 2, profile: 'league', separator: '#cfe3cf' }))
    // Verdad terreno para el conteo de bloques: Caterpie verificada + staging con la foto.
    const atk = (name: string): PokemonCard['attacks'][number] => ({
      id: name.toLowerCase(), name, kind: 'attack', rollFaces: [4] as never, cost: [] as never, element: 'normal',
      damage: { base: 10 }, effects: [] as never, rawText: 'x',
    })
    const caterpie: PokemonCard = {
      id: 'caterpie', dex: 10, name: 'Caterpie', stage: 'basic', deck: 'bosque', hp: 40, element: 'bug',
      attacks: [atk('Placaje'), atk('Picadura')], specialties: [], evolvesTo: [], source: { verified: true },
    }
    const pokemon = join(tmp, 'content', 'pokemon')
    mkdirSync(pokemon)
    writeFileSync(join(pokemon, 'samples.json'), JSON.stringify({ cards: [caterpie] }))
    const staging = join(pokemon, '_staging')
    mkdirSync(staging)
    writeFileSync(
      join(staging, 'caterpie_bosque.json'),
      JSON.stringify({ fromScanner: true, needsReview: false, photo: 'Caterpie A Bosque.jpg', cards: [{ ...caterpie, source: { photo: 'x', verified: false } }] }),
    )

    const res = await segCheck({ root: tmp, input: scans, outDir: join(tmp, 'content', 'photos', 'scan-reports') })
    expect(res.total).toBe(3)
    expect(res.gymLeague).toMatchObject({ ok: 2, total: 2 })
    expect(res.others).toMatchObject({ ok: 1, total: 1 })
    expect(res.ok).toBe(true)
    // La verdad terreno cruza el conteo de bloques (2 ataques, sin especialidad).
    const caterpieRow = res.rows.find((r) => r.file === 'Caterpie A Bosque.jpg')
    expect(caterpieRow?.expectedBlocks).toBe(2)
    expect(caterpieRow?.ok).toBe(true)
    // Superposiciones de debug regeneradas para el dueño.
    const debug = join(tmp, 'content', 'photos', 'scan-reports', 'debug')
    expect(existsSync(join(debug, 'Onix Brock Gym.png'))).toBe(true)
    expect(existsSync(join(debug, 'Eevee Gary L League.png'))).toBe(true)
    expect(existsSync(join(tmp, 'content', 'photos', 'scan-reports', 'segmentation.json'))).toBe(true)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-T/T-104/AC-5 — el informe lista las imágenes que siguen fallando
// con el MOTIVO CONCRETO y solo entonces pide al dueño volver a escanear esas.
test('AC: SPEC-T/T-104/AC-5 falla con motivo concreto y pedido de re-escaneo', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 't104-fail-'))
  try {
    const scans = join(tmp, 'scans')
    mkdirSync(join(scans, 'gym'), { recursive: true })
    writeFileSync(join(scans, 'gym', 'Onix Brock Gym.jpg'), await syntheticCard({ attacks: 2, profile: 'gym', separator: '#a8c8e8' }))
    // Carta sin líneas (gris plano): normaliza pero no segmenta.
    const plana = await sharp({ create: { width: 700, height: 1060, channels: 3, background: '#9a9a9a' } }).jpeg().toBuffer()
    writeFileSync(join(scans, 'gym', 'Rota Gym.jpg'), plana)

    const res = await segCheck({ root: tmp, input: scans, outDir: join(tmp, 'out') })
    expect(res.ok).toBe(false)
    expect(res.gymLeague).toMatchObject({ ok: 1, total: 2 })
    const rota = res.rows.find((r) => r.file === 'Rota Gym.jpg')
    expect(rota?.ok).toBe(false)
    expect(rota?.reasons.join(' ')).toMatch(/líneas|segment/)
    const txt = res.lines.join('\n')
    expect(txt).toContain('Rota Gym.jpg')
    expect(txt).toMatch(/re-?escanear|volver a escanear/i)
    const doc = JSON.parse(readFileSync(join(tmp, 'out', 'segmentation.json'), 'utf8')) as { rows: unknown[] }
    expect(doc.rows).toHaveLength(2)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
