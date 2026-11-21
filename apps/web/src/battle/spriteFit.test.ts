// AC: SPEC-U/T-105/AC-2, AC-3 — fitSprite pura: una sola regla de escala para
// todas las cartas. Property tests con fast-check (SDD §8.3: invariantes).
import fc from 'fast-check'
import { expect, test } from 'vitest'
import { cardArtConfig, fitSprite } from './spriteFit'

const naturalArb = fc.record({
  width: fc.integer({ min: 1, max: 600 }),
  height: fc.integer({ min: 1, max: 600 }),
})
const boxArb = fc.record({
  width: fc.integer({ min: 1, max: 800 }),
  height: fc.integer({ min: 1, max: 800 }),
})
// fill ∈ (0,1) y maxScale ∈ (1,10] como enteros escalados (sin floats raros).
const cfgArb = fc.record({
  fill: fc.integer({ min: 1, max: 999 }).map((v) => v / 1000),
  maxScale: fc.integer({ min: 11, max: 100 }).map((v) => v / 10),
})

// AC: SPEC-U/T-105/AC-2 - px enteros ≥ 1 y con los valores reales del config.
test('AC: SPEC-U/T-105/AC-2 - devuelve px enteros y respeta el config real', () => {
  const out = fitSprite({ width: 96, height: 96 }, { width: 300, height: 132 }, cardArtConfig.pkmCard)
  expect(out).toEqual({ width: 125, height: 125 }) // fitScale 132/96=1.375 → 1.375·0.95=1.30625
  expect(Number.isInteger(out.width)).toBe(true)
  expect(Number.isInteger(out.height)).toBe(true)
})

// AC: SPEC-U/T-105/AC-3a - el resultado entra SIEMPRE en la caja.
test('AC: SPEC-U/T-105/AC-3a - el resultado entra siempre en la caja', () => {
  fc.assert(
    fc.property(naturalArb, boxArb, cfgArb, (natural, box, cfg) => {
      const out = fitSprite(natural, box, cfg)
      return out.width <= box.width && out.height <= box.height
    }),
  )
})

// AC: SPEC-U/T-105/AC-3b - proporción conservada: cada lado a ±1 px del
// tamaño exacto de la escala aplicada (una sola escala para ambos lados). Los
// fits sub-píxel (caja absurda) quedan en el piso de 1 px y no entran acá.
test('AC: SPEC-U/T-105/AC-3b - la proporción se conserva (±1 px por redondeo)', () => {
  fc.assert(
    fc.property(naturalArb, boxArb, cfgArb, (natural, box, cfg) => {
      const out = fitSprite(natural, box, cfg)
      const scale = Math.min(
        Math.min(box.width / natural.width, box.height / natural.height) * cfg.fill,
        cfg.maxScale,
      )
      if (natural.width * scale < 1 || natural.height * scale < 1) return true // piso de 1 px
      const eps = 1e-9
      return (
        Math.abs(out.width - natural.width * scale) <= 0.5 + eps &&
        Math.abs(out.height - natural.height * scale) <= 0.5 + eps
      )
    }),
  )
})

// AC: SPEC-U/T-105/AC-3c - sprites chicos: si fitScale > maxScale/fill, la
// escala queda clavada en maxScale (tope anti-pixelado, nunca pasa).
test('AC: SPEC-U/T-105/AC-3c - los chicos suben hasta el tope maxScale y no más', () => {
  const tiny = { width: 10, height: 10 }
  const hugeBox = { width: 100_000, height: 100_000 }
  expect(fitSprite(tiny, hugeBox, cardArtConfig.pkmCard)).toEqual({ width: 40, height: 40 }) // 10·4
  expect(fitSprite(tiny, hugeBox, cardArtConfig.modal)).toEqual({ width: 30, height: 30 }) // 10·3
  fc.assert(
    fc.property(naturalArb, cfgArb, (natural, cfg) => {
      const box = { width: natural.width * 10_000, height: natural.height * 10_000 }
      const out = fitSprite(natural, box, cfg)
      return Math.abs(out.width - natural.width * cfg.maxScale) <= 0.5 + 1e-9
    }),
  )
})

// AC: SPEC-U/T-105/AC-3d - sprites más grandes que la caja nunca desbordan.
test('AC: SPEC-U/T-105/AC-3d - sprites más grandes que la caja no desbordan', () => {
  const bigArb = fc.record({
    width: fc.integer({ min: 801, max: 4000 }),
    height: fc.integer({ min: 801, max: 4000 }),
  })
  const smallBoxArb = fc.record({
    width: fc.integer({ min: 40, max: 400 }),
    height: fc.integer({ min: 40, max: 400 }),
  })
  fc.assert(
    fc.property(bigArb, smallBoxArb, cfgArb, (natural, box, cfg) => {
      const out = fitSprite(natural, box, cfg)
      return out.width <= box.width && out.height <= box.height
    }),
  )
})
