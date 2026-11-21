// AC: SPEC-E/T-046 — mapeo de ataques a movimientos oficiales: `pnpm map-moves`
// propone officialMove+fx (status "proposed"), /admin/cards confirma/cambia el
// mapeo (UI: apps/web/src/admin/AttackEditor.test.tsx) y el informe cuenta
// verificados/propuestos/sin mapear.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { mapMoves, proposeForAttack, type AttackLike } from '../tools/map-moves.ts'
import type { MoveEntry } from '../packages/content/src/reference.ts'
import type { Element } from '../packages/content/src/cards.ts'
import { confirmMoveMapping, setOfficialMove, type Draft } from '../apps/web/src/admin/draft.ts'

const MOVES: { moves: MoveEntry[] } = {
  moves: [
    { id: 'absorb', nameEn: 'Absorb', nameEs: 'Absorber', type: 'grass' },
    { id: 'bubble', nameEn: 'Bubble', nameEs: 'Burbuja', type: 'water' },
    { id: 'double-slap', nameEn: 'Double Slap', nameEs: 'Bofetón doble', type: 'normal' },
    { id: 'fire-spin', nameEn: 'Fire Spin', nameEs: 'Giro fuego', type: 'fire' },
    { id: 'flamethrower', nameEn: 'Flamethrower', nameEs: 'Lanzallamas', type: 'fire' },
    { id: 'headbutt', nameEn: 'Headbutt', nameEs: 'Golpe cabeza', type: 'normal' },
  ],
}

type FileDoc = { _comment?: string; pending?: string[]; cards: { attacks: Record<string, unknown>[] }[] }

/** Ataque (cardIndex, atkIndex) de un doc leído; {} si el índice no existe. */
function attackOf(doc: FileDoc, cardIndex: number, atkIndex: number): Record<string, unknown> {
  return doc.cards[cardIndex]?.attacks[atkIndex] ?? {}
}

function atk(name: string, element: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name,
    kind: 'attack',
    rollFaces: [1, 2],
    cost: [],
    element,
    damage: { base: 10 },
    effects: [],
    rawText: '',
    ...over,
  }
}

function card(id: string, attacks: Record<string, unknown>[]): Record<string, unknown> {
  return {
    id,
    dex: 60,
    name: id,
    stage: 'basic',
    deck: 'pantano',
    hp: 50,
    element: 'water',
    attacks,
    specialties: [],
    evolvesTo: [],
    source: { verified: true },
  }
}

/** content/ de ejemplo: reference/pokeapi/moves.json + pokemon/main.json + staging. */
function makeContent(): string {
  const tmp = mkdtempSync(join(tmpdir(), 't046-'))
  mkdirSync(join(tmp, 'reference', 'pokeapi'), { recursive: true })
  mkdirSync(join(tmp, 'pokemon', '_staging'), { recursive: true })
  writeFileSync(join(tmp, 'reference', 'pokeapi', 'moves.json'), JSON.stringify(MOVES))
  writeFileSync(
    join(tmp, 'pokemon', 'main.json'),
    JSON.stringify({
      _comment: 'fixture',
      pending: ['luego'],
      cards: [
        card('mapeador', [
          atk('Burbujas', 'water'),                       // contención → bubble
          atk('Doble bofetón', 'normal'),                 // mismos tokens en otro orden → double-slap
          atk('Furia inédita', 'dragon'),                 // sin candidato → unmapped
        ]),
        card('yarevisado', [
          atk('Lanzallamas', 'fire', { officialMove: 'flamethrower', officialMoveStatus: 'verified', fx: 'flame' }),
          atk('Golpe cabeza', 'normal', { officialMove: 'headbutt' }), // sin status ⇒ ya mapeado
        ]),
      ],
    }),
  )
  writeFileSync(
    join(tmp, 'pokemon', '_staging', 'nuevo.json'),
    JSON.stringify({ cards: [card('staging', [atk('Giro fuego', 'fire', { fx: 'explosion' })])] }),
  )
  return tmp
}

// AC: SPEC-E/T-046/AC-1 — `pnpm map-moves` propone officialMove (+fx) para cada
// ataque sin mapeo usando nombre, texto, elemento y la tabla ES↔EN; deja
// officialMoveStatus:"proposed"; sin candidato ⇒ "unmapped"; no toca lo mapeado.
test('AC: SPEC-E/T-046/AC-1 mapMoves propone y escribe sin tocar lo ya mapeado', () => {
  const tmp = makeContent()
  try {
    const run = mapMoves({ contentDir: tmp })
    expect(run.ok).toBe(true)
    expect(run.changedFiles).toEqual(['pokemon/_staging/nuevo.json', 'pokemon/main.json'].sort())

    const doc = JSON.parse(readFileSync(join(tmp, 'pokemon', 'main.json'), 'utf8')) as FileDoc
    expect(attackOf(doc, 0, 0)).toMatchObject({ officialMove: 'bubble', officialMoveStatus: 'proposed', fx: 'water' })
    expect(attackOf(doc, 0, 1)).toMatchObject({ officialMove: 'double-slap', officialMoveStatus: 'proposed', fx: 'contact' })
    expect(attackOf(doc, 0, 2).officialMove).toBeUndefined()
    expect(attackOf(doc, 0, 2).officialMoveStatus).toBe('unmapped')
    // Ya mapeados (verified o sin status): intactos.
    expect(attackOf(doc, 1, 0)).toMatchObject({ officialMove: 'flamethrower', officialMoveStatus: 'verified' })
    expect(attackOf(doc, 1, 1)).toMatchObject({ officialMove: 'headbutt' })
    expect(attackOf(doc, 1, 1).officialMoveStatus).toBeUndefined()
    // Conserva metadatos del archivo y formato del admin (indent 1 + \n final).
    expect(doc._comment).toBe('fixture')
    expect(doc.pending).toEqual(['luego'])
    expect(readFileSync(join(tmp, 'pokemon', 'main.json'), 'utf8').endsWith('}\n')).toBe(true)
    // fx existente no se pisa (Giro fuego → fire-spin, conserva fx "explosion").
    const staging = JSON.parse(readFileSync(join(tmp, 'pokemon', '_staging', 'nuevo.json'), 'utf8')) as FileDoc
    expect(attackOf(staging, 0, 0)).toMatchObject({ officialMove: 'fire-spin', officialMoveStatus: 'proposed', fx: 'explosion' })
    // Idempotente: nada nuevo que proponer ⇒ sin cambios.
    expect(mapMoves({ contentDir: tmp }).changedFiles).toEqual([])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-E/T-046/AC-1 — sin tabla de T-045 no hay propuesta posible: error claro.
test('AC: SPEC-E/T-046/AC-1 sin moves.json falla con error claro (corré pnpm pokeapi)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't046-empty-'))
  try {
    mkdirSync(join(tmp, 'pokemon'), { recursive: true })
    writeFileSync(join(tmp, 'pokemon', 'main.json'), JSON.stringify({ cards: [card('x', [atk('Burbujas', 'water')])] }))
    const run = mapMoves({ contentDir: tmp })
    expect(run.ok).toBe(false)
    expect(run.error).toMatch(/pokeapi/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// AC: SPEC-E/T-046/AC-1 — el matcher: exacto ES/EN, orden de tokens distinto,
// contención, tokens compartidos solo con elemento que casa; empates deterministas.
test('AC: SPEC-E/T-046/AC-1 proposeForAttack puntúa nombre, tokens y elemento', () => {
  const ex = (name: string, rawText: string, element: Element): AttackLike => ({ name, rawText, element })
  expect(proposeForAttack(ex('Burbuja', '', 'water'), MOVES.moves)?.move.id).toBe('bubble')
  expect(proposeForAttack(ex('Bubble', '', 'water'), MOVES.moves)?.move.id).toBe('bubble')
  expect(proposeForAttack(ex('Bofetón doble', '', 'normal'), MOVES.moves)?.move.id).toBe('double-slap')
  expect(proposeForAttack(ex('Super lanzallamas', '', 'fire'), MOVES.moves)?.move.id).toBe('flamethrower')
  // Tokens compartidos pero sin elemento que casa ⇒ no propone.
  expect(proposeForAttack(ex('Doble bofetón veloz', '', 'psychic'), MOVES.moves)).toBeNull()
  expect(proposeForAttack(ex('Furia inédita', 'un texto sin relación', 'dragon'), MOVES.moves)).toBeNull()
})

// AC: SPEC-E/T-046/AC-2 — /admin/cards confirma (verified) o cambia el mapeo
// (vuelve a proposed; vaciarlo ⇒ unmapped). El render del botón y la vista
// previa de FX se cubren en apps/web/src/admin/AttackEditor.test.tsx.
test('AC: SPEC-E/T-046/AC-2 confirmar/cambiar mapeo (lógica de draft)', () => {
  const proposed: Draft = { ...atk('Burbujas', 'water'), officialMove: 'bubble', officialMoveStatus: 'proposed', fx: 'water' }
  const sinMove: Draft = atk('Furia inédita', 'dragon')

  expect(confirmMoveMapping(proposed)).toMatchObject({ officialMove: 'bubble', officialMoveStatus: 'verified' })
  expect(confirmMoveMapping(sinMove)).toBe(sinMove) // sin officialMove no hay nada que confirmar

  const verified = { ...proposed, officialMoveStatus: 'verified' }
  expect(setOfficialMove(verified, 'water-gun')).toMatchObject({ officialMove: 'water-gun', officialMoveStatus: 'proposed' })
  const emptied = setOfficialMove(verified, '')
  expect(emptied.officialMove).toBeUndefined()
  expect(emptied.officialMoveStatus).toBe('unmapped')
})

// AC: SPEC-E/T-046/AC-3 — informe: # verificados / propuestos / sin mapear.
test('AC: SPEC-E/T-046/AC-3 el informe cuenta verificados, propuestos y sin mapear', () => {
  const tmp = makeContent()
  try {
    const run = mapMoves({ contentDir: tmp })
    // main: 2 nuevos proposed + 1 unmapped + 1 verified + 1 sin status (⇒ proposed);
    // staging: 1 nuevo proposed. Totales: 1/4/1.
    expect(run.counts).toEqual({ verified: 1, proposed: 4, unmapped: 1 })
    expect(run.summary.join('\n')).toContain('1 verificado(s)')
    expect(run.summary.join('\n')).toContain('4 propuesto(s)')
    expect(run.summary.join('\n')).toContain('1 sin mapear')
    // dry-run: mismo informe, sin escribir.
    const tmp2 = makeContent()
    try {
      const dry = mapMoves({ contentDir: tmp2, dryRun: true })
      expect(dry.counts).toEqual(run.counts)
      const doc = JSON.parse(readFileSync(join(tmp2, 'pokemon', 'main.json'), 'utf8')) as FileDoc
      expect(attackOf(doc, 0, 0).officialMove).toBeUndefined()
    } finally {
      rmSync(tmp2, { recursive: true, force: true })
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
