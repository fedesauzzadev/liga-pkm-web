// AC: SPEC-G/T-061/AC-4 — modo desarrollo: ?seed y ?dice solo fuera de producción.
// El gate de producción es import.meta.env.DEV (se pliega en el build); acá se
// testea el parseo y la fábrica de RNG forzado (la parte pura).
import { expect, test } from 'vitest'
import { createRng } from '@liga/engine'
import { createDevRng, devSeed, parseDevOverrides } from './devmode'

test('AC-4 parsea ?seed y ?dice (valores 1-6 en orden); ignora el resto', () => {
  expect(parseDevOverrides('?seed=7&dice=3,5,1')).toEqual({ seed: 7, dice: [3, 5, 1] })
  expect(parseDevOverrides('?seed=abc&dice=9,2,x,,6')).toEqual({ seed: null, dice: [2, 6] })
  expect(parseDevOverrides('')).toEqual({ seed: null, dice: [] })
})

test('AC-4 el RNG forzado sirve los valores en orden y después delega en el stream real', () => {
  const rngFor = createDevRng([4, 2])
  const forced = rngFor(123)
  expect([forced.d6(), forced.d6()]).toEqual([4, 2])
  // Agotada la cola, delega en el mismo stream que un RNG normal de esa semilla
  // (los valores forzados NO consumen el stream base).
  const plain = createRng(123)
  expect(forced.d6()).toBe(plain.d6())
  // La cola es global (una por tirada a través de comandos), como en la partida:
  // retomando el snapshot, sigue el stream base donde quedó.
  const next = rngFor(forced.snapshot())
  const resumed = createRng(plain.snapshot())
  expect(next.d6()).toBe(resumed.d6())
})

test('AC-4 sin window (SSR/producción) no hay overrides', () => {
  expect(typeof window === 'undefined').toBe(true) // entorno node del test
  expect(devSeed()).toBeNull()
})
