// AC: SPEC-A/AC-5 — el motor usa los tipos canónicos de @liga/content; no define los propios.
import { readFileSync } from 'node:fs'
import { expect, expectTypeOf, test } from 'vitest'
import type {
  Attack,
  BoardGraph,
  Content,
  DeckList,
  Effect,
  Element,
  Item,
  PokemonCard,
  Ruleset,
} from './index'
import { ENGINE_NAME } from './index'

test('content exporta su identificador (wiring T-001)', () => {
  expect(ENGINE_NAME).toBe('liga-pkm-engine')
})

test('AC-5 engine reexporta los tipos de contenido (identidad con @liga/content)', () => {
  expectTypeOf<PokemonCard>().toEqualTypeOf<import('@liga/content').PokemonCard>()
  expectTypeOf<Attack>().toEqualTypeOf<import('@liga/content').Attack>()
  expectTypeOf<Effect>().toEqualTypeOf<import('@liga/content').Effect>()
  expectTypeOf<Ruleset>().toEqualTypeOf<import('@liga/content').Ruleset>()
  expectTypeOf<BoardGraph>().toEqualTypeOf<import('@liga/content').BoardGraph>()
  expectTypeOf<DeckList>().toEqualTypeOf<import('@liga/content').DeckList>()
  expectTypeOf<Item>().toEqualTypeOf<import('@liga/content').Item>()
  expectTypeOf<Element>().toEqualTypeOf<import('@liga/content').Element>()
  expectTypeOf<Content>().toEqualTypeOf<import('@liga/content').Content>()

  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  expect(src).toMatch(/export type \{[^}]*PokemonCard[^}]*\} from '@liga\/content'/)
  expect(src).not.toMatch(/\binterface (PokemonCard|Attack|Effect|Ruleset|BoardGraph|DeckList|Item)\b/)

  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  expect(pkg.dependencies?.['@liga/content']).toBe('workspace:*')
})
