// AC: SPEC-A/T-003 — grafo del tablero + verificación con overlay.
// Un test por AC del spec (AC-4 es manual: captura del overlay, gate G0).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  BoardGraphSchema,
  boardFacts,
  crossCheckBoard,
  EXPECTED_CLASSIC_COUNTS,
} from '../packages/content/src/index.ts'
import { createBoardIndex, UnknownNodeError } from '../packages/engine/src/index.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const board = BoardGraphSchema.parse(
  JSON.parse(readFileSync(join(repoRoot, 'content', 'board', 'kanto.json'), 'utf8')) as unknown,
)

// AC: SPEC-A/AC-1 — grafo conexo; conteos del tablero clásico.
test('AC-1 kanto.json es conexo y cumple los conteos esperados', () => {
  const facts = boardFacts(board)
  expect(facts.connected, `nodos inalcanzables: ${facts.unreachable.join(', ')}`).toBe(true)
  expect(facts.unreachable).toEqual([])
  for (const [type, expected] of Object.entries(EXPECTED_CLASSIC_COUNTS)) {
    expect(facts.countsByType[type as keyof typeof facts.countsByType], type).toBe(expected)
  }
  // 20 nodos de mazo = 4 por cada uno de los 5 mazos (deck4).
  for (const deck of Object.keys(facts.deckCounts) as (keyof typeof facts.deckCounts)[]) {
    expect(facts.deckCounts[deck], `mazo ${deck}`).toBe(4)
  }
})

// AC: SPEC-A/AC-2 — forwardOptions excluye cameFrom; en callejón devuelve [].
test('AC-2 neighbors/forwardOptions/isSquare/isDeadEnd', () => {
  const idx = createBoardIndex(board)

  expect([...idx.neighbors('pb_r')].sort()).toEqual(['centro_r', 'duelo_r', 'isla_1'])
  expect([...idx.forwardOptions('pb_r', 'centro_r')].sort()).toEqual(['duelo_r', 'isla_1'])
  expect(idx.forwardOptions('pb_r', null).length).toBe(3)

  // Callejón: sorpresa solo conecta con pb_sn4 ⇒ sin opciones de avance.
  expect(idx.isDeadEnd('sorpresa')).toBe(true)
  expect(idx.forwardOptions('sorpresa', 'pb_sn4')).toEqual([])
  expect(idx.degree('sorpresa')).toBe(1)

  // Cuadrados vs redondos (RULES §2: frenar solo en cuadrados).
  expect(idx.isSquare('centro_r')).toBe(true)
  expect(idx.isSquare('paleta')).toBe(true)
  expect(idx.isSquare('pb_r')).toBe(false)
  expect(idx.isDeadEnd('pb_r')).toBe(false)

  // Id inexistente: error tipado, nunca silencioso.
  expect(() => idx.neighbors('nodo_fantasma')).toThrow(UnknownNodeError)
})

// AC: SPEC-A/AC-3 — nodos de grado != 2 coinciden con el reporte T-003
// (tras integrar la corrección del dueño: 8 bifurcaciones + 3 extremos).
test('AC-3 nodos de grado != 2 coinciden con el reporte', () => {
  const EXPECTED_NON_DEGREE_2 = [
    'centro_l', 'centro_t', 'duelo_t', 'isla_1', 'liga', 'mercado_b',
    'paleta', 'pant_3', 'pb_r', 'plateada', 'sorpresa',
  ]
  const facts = boardFacts(board)
  expect(facts.nonDegree2).toEqual(EXPECTED_NON_DEGREE_2)
  // Cada uno es extremo (grado 1) o bifurcación (grado 3; mercado_b es cruce de grado 4).
  const idx = createBoardIndex(board)
  for (const id of facts.nonDegree2) {
    expect([1, 3, 4]).toContain(idx.degree(id))
  }
})

// AC: t003-verificar-tablero/AC-3 — con VERIFIED el validador no emite warning de estado.
test('crossCheckBoard: 0 errores y sin warning de estado con VERIFIED', () => {
  const { errors, warnings } = crossCheckBoard(board, 'content/board/kanto.json')
  expect(errors, errors.join('\n')).toEqual([])
  expect(warnings).toEqual([])
})
