// @vitest-environment jsdom
// AC: rediseno-combate-max/AC-2 — dado de combate: SIEMPRE rueda completo
// aunque el valor repita, duración/fases por seed, giro ≥ 540° por tirada y
// cara final exactamente el valor del motor (reloj fijo, sin mirar imágenes).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  BattleDie,
  finalYaw,
  rollDurationMs,
  rollPlan,
  type BattleDieHandle,
} from './BattleDie'
import { DIE_EFFECT_DELAY_MS, DIE_ROLL_SETTLE_MS } from './dieTiming'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('AC: rediseno-combate-max/AC-2 - duración ±10 % por seed: 1600 a 1×, 800 a 2×, 0 skip', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const at1x = rollDurationMs(seed, '1x')
    expect(at1x).toBeGreaterThanOrEqual(1440)
    expect(at1x).toBeLessThanOrEqual(1760)
    const at2x = rollDurationMs(seed, '2x')
    expect(at2x).toBeGreaterThanOrEqual(720)
    expect(at2x).toBeLessThanOrEqual(880)
  }
  expect(rollDurationMs(3, 'skip')).toBe(0)
})

test('AC: rediseno-combate-max/AC-2 - plan puro: giro total ≥ 720° en 2-3 ejes y fases 35/85/100', () => {
  const plan = rollPlan(6, 4, '1x', 'inicial')
  expect(plan.totalSpin).toBeGreaterThanOrEqual(720)
  expect(plan.keyframes.length).toBeGreaterThanOrEqual(6)
  expect(plan.keyframes[0]!.atMs).toBe(0)
  expect(plan.keyframes[1]!.atMs).toBe(Math.round(plan.duration * 0.35))
  // El rebote grande (40 % de la altura) y el chico (15 %) existen.
  const lifts = plan.keyframes.map((keyframe) => keyframe.lift)
  expect(lifts).toContain(1)
  expect(lifts).toContain(0.4)
  expect(lifts).toContain(0.15)
})

test('AC: rediseno-combate-max/AC-2 - dos seeds dan distinta rotación final (tiradas iguales se ven distintas)', () => {
  const a = rollPlan(6, 1, '1x', 'x')
  const b = rollPlan(6, 2, '1x', 'x')
  expect(a.finalRotate).not.toBe(b.finalRotate)
  expect(finalYaw(1)).not.toBe(finalYaw(2))
  // Ningún yaw final es múltiplo de 90 (la cara de arriba no cambia).
  for (let seed = 0; seed < 10; seed += 1) {
    expect(finalYaw(seed) % 90).not.toBe(0)
  }
})

test('AC: rediseno-combate-max/AC-2 - secuencia [6,6,6,1,1,3]: 6 tiradas completas ≥ 1200 ms, giro ≥ 540° y cara final = valor', async () => {
  vi.useFakeTimers()
  const sequence: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [6, 6, 6, 1, 1, 3]
  let handle: BattleDieHandle | null = null
  const { container } = render(
    <BattleDie
      ref={(instance) => {
        handle = instance
      }}
      value={6}
      purpose="Dado de ataque"
    />,
  )
  const die = () => container.querySelector('[data-testid="battle-die"]')! as HTMLElement
  for (let index = 0; index < sequence.length; index += 1) {
    const value = sequence[index]!
    const before = Number(die().getAttribute('data-roll-id'))
    const started = Date.now()
    let done: Promise<void> | null = null
    await act(async () => {
      done = handle!.rollTo(value, { seed: index + 1, speed: '1x' })
      await vi.advanceTimersByTimeAsync(2200)
      await done
    })
    // La promesa resuelve recién al terminar: la tirada fue completa (≥ 1200 ms).
    expect(Date.now() - started).toBeGreaterThanOrEqual(1200)
    // El valor entregado no se modifica: la cara final es exactamente el del motor.
    expect(die().getAttribute('data-value')).toBe(String(value))
    expect(die().getAttribute('data-rolling')).toBe('false')
    // Cada tirada acumuló ≥ 540° (incluidas la 2.ª y 3.ª con valor repetido).
    expect(Number(die().getAttribute('data-spin-total'))).toBeGreaterThanOrEqual(540)
    expect(Number(die().getAttribute('data-roll-id'))).toBe(before + 1)
  }
})

// arreglar-dados-combate/AC-4: skip Y reducedMotion muestran el valor final al
// instante (antes reducedMotion esperaba un fundido de 200 ms antes de la cara).
test('AC: arreglar-dados-combate/AC-4 - skip/reducedMotion: valor final al instante, sin giro ni resto pendiente', async () => {
  vi.useFakeTimers()
  let handle: BattleDieHandle | null = null
  const { container } = render(
    <BattleDie
      ref={(instance) => {
        handle = instance
      }}
      value={2}
      purpose="Dado"
      reducedMotion
    />,
  )
  const die = () => container.querySelector('[data-testid="battle-die"]')! as HTMLElement
  await act(async () => {
    await handle!.rollTo(5, { seed: 9, speed: 'skip' })
  })
  expect(die().getAttribute('data-value')).toBe('5')
  expect(die().getAttribute('data-rolling')).toBe('false')
  expect(die().getAttribute('data-spin-total')).toBe('0')

  // reducedMotion también corta al instante (speed 1x no gira nada).
  await act(async () => {
    await handle!.rollTo(3, { seed: 10, speed: '1x' })
  })
  expect(die().getAttribute('data-value')).toBe('3')
  expect(die().getAttribute('data-rolling')).toBe('false')
  expect(die().getAttribute('data-spin-total')).toBe('0')
})

// ── fix-animacion-dados-combate: la cara sigue al valor del evento ──

// AC: fix-animacion-dados-combate/AC-1 - la cara se sincroniza con la prop
// cuando no rueda (antes quedaba con el valor inicial aunque el evento traía
// otro número y el rollTo no corría).
test('AC: fix-animacion-dados-combate/AC-1 - la cara se sincroniza con la prop cuando no rueda', () => {
  const { container, rerender } = render(<BattleDie value={4} purpose="Dado" />)
  const die = () => container.querySelector('[data-testid="battle-die"]')! as HTMLElement
  expect(die().getAttribute('data-value')).toBe('4')
  rerender(<BattleDie value={6} purpose="Dado" />)
  expect(die().getAttribute('data-value')).toBe('6')
})

// AC: fix-animacion-dados-combate/AC-1 - una tirada superada no pisa a la
// última: el roll viejo termina solo y el valor final es el del roll nuevo.
test('AC: fix-animacion-dados-combate/AC-1 - roll superado: el último roll gana y el viejo resuelve', async () => {
  vi.useFakeTimers()
  let handle: BattleDieHandle | null = null
  const { container } = render(
    <BattleDie
      ref={(instance) => {
        handle = instance
      }}
      value={1}
      purpose="Dado"
    />,
  )
  const die = () => container.querySelector('[data-testid="battle-die"]')! as HTMLElement
  let firstDone = false
  await act(async () => {
    void handle!.rollTo(3, { seed: 1, speed: '1x' }).then(() => {
      firstDone = true
    })
    await vi.advanceTimersByTimeAsync(50)
  })
  await act(async () => {
    handle!.rollTo(6, { seed: 2, speed: 'skip' })
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(die().getAttribute('data-value')).toBe('6')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(firstDone).toBe(true)
  expect(die().getAttribute('data-value')).toBe('6')
  expect(die().getAttribute('data-rolling')).toBe('false')
})

// ── arreglar-dados-combate: dados legibles que siempre terminan ──

const cubeOf = (container: HTMLElement): HTMLElement =>
  container.querySelector('[data-testid="battle-die"]')!.firstElementChild!.children[1] as HTMLElement

const yawOf = (cube: HTMLElement): number =>
  Number(/rotateY\((-?\d+)deg\)/.exec(cube.style.transform)?.[1] ?? '999')

// AC: arreglar-dados-combate/AC-1 - la cara final mira al frente: inclinación
// ≤ 15° para toda seed (antes finalYaw dejaba 17°-87°: a ~87° se veía casi de
// canto) y data-value = valor tirado.
test('AC: arreglar-dados-combate/AC-1 - inclinación final ≤ 15° y cara = valor tirado', async () => {
  for (let seed = 0; seed < 24; seed += 1) {
    const yaw = finalYaw(seed)
    expect(Math.abs(yaw)).toBeLessThanOrEqual(15)
    expect(yaw % 90).not.toBe(0)
  }
  vi.useFakeTimers()
  let handle: BattleDieHandle | null = null
  const { container } = render(
    <BattleDie
      ref={(instance) => {
        handle = instance
      }}
      value={1}
      purpose="Dado"
    />,
  )
  const die = () => container.querySelector('[data-testid="battle-die"]')! as HTMLElement
  await act(async () => {
    void handle!.rollTo(5, { seed: 7, speed: '1x' })
    await vi.advanceTimersByTimeAsync(2200)
  })
  expect(die().getAttribute('data-value')).toBe('5')
  expect(die().getAttribute('data-rolling')).toBe('false')
  // El cubo queda en la orientación de descanso con el yaw legible (≤ 15°),
  // sin los giros completos acumulados del plan (nada de re-giro al asentar).
  expect(Math.abs(yawOf(cubeOf(container)))).toBeLessThanOrEqual(15)
})

// AC: arreglar-dados-combate/AC-2 - toda tirada termina: a los
// rollDurationMs(seed, speed) + margen ms del disparo, data-rolling='false' y
// cara = valor. Cubre supersede, replan 1x→2x y corte por skip a mitad.
test('AC: arreglar-dados-combate/AC-2 - terminación garantizada ante supersede y replan de contexto', async () => {
  vi.useFakeTimers()
  const margin = DIE_ROLL_SETTLE_MS + DIE_EFFECT_DELAY_MS
  let handle: BattleDieHandle | null = null
  const { container } = render(
    <BattleDie
      ref={(instance) => {
        handle = instance
      }}
      value={1}
      purpose="Dado"
    />,
  )
  const die = () => container.querySelector('[data-testid="battle-die"]')! as HTMLElement
  // Tirada normal 1x: termina dentro de duración + margen.
  await act(async () => {
    void handle!.rollTo(4, { seed: 2, speed: '1x' })
    await vi.advanceTimersByTimeAsync(rollDurationMs(2, '1x') + margin)
  })
  expect(die().getAttribute('data-rolling')).toBe('false')
  expect(die().getAttribute('data-value')).toBe('4')
  // Replan a mitad (como DieSlot ante cambio de contexto): 1x → skip corta ya.
  await act(async () => {
    void handle!.rollTo(6, { seed: 2, speed: '1x' })
    await vi.advanceTimersByTimeAsync(300)
  })
  expect(die().getAttribute('data-rolling')).toBe('true')
  await act(async () => {
    void handle!.rollTo(6, { seed: 2, speed: 'skip' })
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(die().getAttribute('data-rolling')).toBe('false')
  expect(die().getAttribute('data-value')).toBe('6')
  // Replan 1x → 2x a mitad: re-planifica y termina en la duración de 2x + margen.
  await act(async () => {
    void handle!.rollTo(3, { seed: 5, speed: '1x' })
    await vi.advanceTimersByTimeAsync(400)
  })
  expect(die().getAttribute('data-rolling')).toBe('true')
  await act(async () => {
    void handle!.rollTo(3, { seed: 5, speed: '2x' })
    await vi.advanceTimersByTimeAsync(rollDurationMs(5, '2x') + margin)
  })
  expect(die().getAttribute('data-rolling')).toBe('false')
  expect(die().getAttribute('data-value')).toBe('3')
})

// AC: arreglar-dados-combate/AC-5 - cambio 100 % UI: sin Math.random/Date.now
// en los archivos del dado/coreografía (packages/engine ni se toca).
test('AC: arreglar-dados-combate/AC-5 - sin Math.random/Date.now en la UI del dado', () => {
  const files = [
    'BattleDie.tsx',
    'dieTiming.ts',
    'BattleScene.tsx',
    'ChoreographedBattle.tsx',
    'choreo/registry.ts',
    'choreo/timing.ts',
  ]
  for (const file of files) {
    const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    expect(source.includes('Math.random(')).toBe(false)
    expect(source.includes('Date.now(')).toBe(false)
  }
})
