// AC: SPEC-E/T-044/AC-1 — `tools/gen-dev-decks.ts` arma mazos de desarrollo con cartas existentes + elementos sintéticos + ítems.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test } from 'vitest'
import { buildDevDeckList, writeDevDeckList } from '../tools/gen-dev-decks.ts'

test('AC: SPEC-E/T-044/AC-1 genera mazos dev desde el contenido disponible', () => {
  const list = buildDevDeckList(process.cwd())
  const decks = list.decks as Record<string, { entries: Array<{ id: string; count: number }>; devOnly: boolean }>
  const bosque = decks['bosque']!
  const montana = decks['montana']!
  const isla = decks['isla']!
  const pantano = decks['pantano']!
  const item = decks['item']!

  expect(Object.keys(decks).sort()).toEqual(['bosque', 'isla', 'item', 'llanura', 'montana', 'pantano'])
  expect(bosque.devOnly).toBe(true)
  expect(bosque.entries.some((entry) => entry.id === 'element_grass')).toBe(true)
  expect(montana.entries.some((entry) => entry.id === 'charmander')).toBe(true)
  expect(isla.entries.some((entry) => entry.id === 'squirtle')).toBe(true)
  expect(pantano.entries.some((entry) => entry.id === 'poliwag')).toBe(true)
  expect(item.entries.some((entry) => entry.id === 'pokeball')).toBe(true)
  expect(item.entries.some((entry) => entry.id === 'potion')).toBe(true)

  for (const deck of Object.values(decks)) {
    expect(deck.entries.length).toBeGreaterThan(0)
    expect(deck.entries.every((entry) => entry.count > 0)).toBe(true)
  }
})

test('AC: SPEC-E/T-044/AC-1 escribe un archivo de mazos dev estable en disco', () => {
  const tmp = mkdtempSync(join(tmpdir(), 't044-'))

  writeDevDeckList(process.cwd(), join(tmp, 'decks.dev.json'))
  const written = JSON.parse(readFileSync(join(tmp, 'decks.dev.json'), 'utf8'))

  expect(written.decks.bosque.entries.some((entry: { id: string }) => entry.id === 'element_grass')).toBe(true)
  expect(written.decks.item.entries.some((entry: { id: string }) => entry.id === 'pokeball')).toBe(true)
  expect(written.decks.pantano.entries.some((entry: { id: string }) => entry.id === 'element_psychic')).toBe(true)

  rmSync(tmp, { recursive: true, force: true })
})
