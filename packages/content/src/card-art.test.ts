// AC: SPEC-U/T-105/AC-1 — config del sprite de la carta (content/ui/card-art.json):
// esquema Zod con valores reales del spec y rechazo de medidas fuera de rango.
// El registro en content:validate lo ejercita `pnpm content:validate` (patrón
// de card-modal.json, que tampoco tiene test de wiring propio).
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { CardArtSchema, type CardArt } from './card-art'

const raw: unknown = JSON.parse(
  readFileSync(new URL('../../../content/ui/card-art.json', import.meta.url), 'utf8'),
) as unknown

// AC: SPEC-U/T-105/AC-1 - el archivo real valida y trae los valores del spec
// (plan/layout-carta-modal: modal sin boxHeightPx ⇒ la caja absorbe el sobrante).
test('AC: SPEC-U/T-105/AC-1 - card-art.json valida con los valores del spec', () => {
  const config: CardArt = CardArtSchema.parse(raw)
  expect(config.pkmCard).toEqual({ boxHeightPx: 132, fill: 0.95, maxScale: 4 })
  expect(config.modal).toEqual({ fill: 0.95, maxScale: 3 })
  expect(config.modal.boxHeightPx).toBeUndefined()
})

// AC: achicar-arte-modal-carta/AC-1 - modal.boxHeightPx es int positivo
// OPCIONAL: sin él rige el comportamiento actual (sin tope de alto).
test('AC: achicar-arte-modal-carta/AC-1 - modal.boxHeightPx opcional, int positivo', () => {
  const base = {
    pkmCard: { boxHeightPx: 132, fill: 0.95, maxScale: 4 },
    modal: { fill: 0.95, maxScale: 3 },
  }
  expect(CardArtSchema.safeParse(base).success).toBe(true) // ausente ⇒ sin tope
  expect(
    CardArtSchema.safeParse({ ...base, modal: { ...base.modal, boxHeightPx: 220 } }).success,
  ).toBe(true)
  expect(
    CardArtSchema.safeParse({ ...base, modal: { ...base.modal, boxHeightPx: 220.5 } }).success,
  ).toBe(false) // px enteros
  expect(
    CardArtSchema.safeParse({ ...base, modal: { ...base.modal, boxHeightPx: 0 } }).success,
  ).toBe(false) // positivo
  expect(
    CardArtSchema.safeParse({ ...base, modal: { ...base.modal, boxHeightPx: -8 } }).success,
  ).toBe(false)
})

// AC: SPEC-U/T-105/AC-1 - la frontera Zod rechaza medidas mágicas fuera de rango.
test('AC: SPEC-U/T-105/AC-1 - rechaza boxHeightPx no entero y fill/maxScale fuera de rango', () => {
  const ok = { pkmCard: { boxHeightPx: 132, fill: 0.95, maxScale: 4 }, modal: { fill: 0.95, maxScale: 3 } }
  expect(CardArtSchema.safeParse(ok).success).toBe(true)
  expect(
    CardArtSchema.safeParse({ ...ok, pkmCard: { ...ok.pkmCard, boxHeightPx: 132.5 } }).success,
  ).toBe(false) // px enteros
  expect(CardArtSchema.safeParse({ ...ok, pkmCard: { ...ok.pkmCard, fill: 1 } }).success).toBe(false) // sin margen
  expect(CardArtSchema.safeParse({ ...ok, pkmCard: { ...ok.pkmCard, fill: 0 } }).success).toBe(false)
  expect(CardArtSchema.safeParse({ ...ok, modal: { ...ok.modal, maxScale: 1 } }).success).toBe(false) // tope real
  expect(CardArtSchema.safeParse({ ...ok, modal: { ...ok.modal, maxScale: 99 } }).success).toBe(false) // anti-pixelado
})
