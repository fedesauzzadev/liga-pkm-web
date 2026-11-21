// AC: verificar-promueve-carta/AC-4 — merge de los canónicos
// content/pokemon/*.json: parse tolerante, dedupe por id y pending concatenado.
import { expect, test } from 'vitest'
import type { PokemonCard } from '@liga/content'
import { mergePokemonFiles } from './pokemonFiles'

function card(id: string, over: Partial<PokemonCard> = {}): PokemonCard {
  return {
    id,
    dex: 10,
    name: id,
    stage: 'basic',
    deck: 'bosque',
    hp: 40,
    element: 'grass',
    attacks: [
      {
        id: 'placaje',
        name: 'Placaje',
        kind: 'attack',
        rollFaces: [1, 2],
        cost: ['any'],
        element: 'normal',
        damage: { base: 10 },
        effects: [],
        rawText: '',
      },
    ],
    specialties: [],
    evolvesTo: [],
    source: { verified: true },
    ...over,
  }
}

// AC-4 — el juego carga todos los canónicos: cartas y pending de todos los
// archivos en orden alfabético.
test('AC: verificar-promueve-carta/AC-4 mergePokemonFiles concatena cartas y pending de todos los archivos', () => {
  const out = mergePokemonFiles([
    { file: 'content/pokemon/bosque.json', doc: { cards: [card('b1')], pending: ['evo_b'] } },
    { file: 'content/pokemon/_samples.json', doc: { cards: [card('s1')], pending: ['evo_s', 'evo_b'] } },
  ])
  expect(out.errors).toEqual([])
  expect(out.cards.map((c) => c.id)).toEqual(['s1', 'b1'])
  expect(out.pendingEvos).toEqual(['evo_s', 'evo_b'])
})

// AC-4 — archivo inválido ⇒ error reportado y salteo (la app no rompe).
test('AC: verificar-promueve-carta/AC-4 el archivo inválido se saltea con error', () => {
  const out = mergePokemonFiles([
    { file: 'content/pokemon/roto.json', doc: { cards: [{ mal: 1 }] } },
    { file: 'content/pokemon/ok.json', doc: { cards: [card('ok')] } },
  ])
  expect(out.cards.map((c) => c.id)).toEqual(['ok'])
  expect(out.errors).toHaveLength(1)
  expect(out.errors[0]).toContain('roto.json')
})

// AC-4 — id duplicado entre archivos ⇒ gana el primero en orden alfabético.
test('AC: verificar-promueve-carta/AC-4 id duplicado gana el primero en orden alfabético con aviso', () => {
  const out = mergePokemonFiles([
    { file: 'content/pokemon/b.json', doc: { cards: [card('x', { hp: 99 })] } },
    { file: 'content/pokemon/a.json', doc: { cards: [card('x')] } },
  ])
  expect(out.cards).toHaveLength(1)
  expect(out.cards[0]?.hp).toBe(40)
  expect(out.errors.join('\n')).toContain('"x"')
})
