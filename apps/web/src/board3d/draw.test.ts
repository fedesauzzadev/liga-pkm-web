// AC: SPEC-G/T-064 — animación de robar carta: lift de la pila, reflejo de la
// cantidad real, proyección a pantalla y línea de tiempo (fases + promesa),
// todo numérico y sin DOM (NO-VISION).
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { buildBoardScene } from './scene'
import { deckStacks } from './stacks'
import {
  drawKindOf,
  drawOriginTarget,
  drawTimings,
  liftStack,
  runDrawTimeline,
  setStackCount,
  stackScreenPos,
} from './draw'

const board = {
  meta: { id: 't064-test', status: 'VERIFIED' },
  gyms: {},
  nodes: [{ id: 'mercado_l', type: 'mercado', shape: 'round', x: 300, y: 400, label: 'Mercado' }],
  edges: [],
}
const scene = buildBoardScene(board as never, deckStacks, boardDecor)

const stackOf = (key: string): THREE.Group => {
  const stack = scene.stacks.get(key)
  if (stack === undefined) throw new Error(`falta la pila ${key}`)
  return stack
}

// AC: SPEC-G/T-064/AC-1 - la pila se resalta elevándose 0,15 exactos y vuelve.
test('AC-1 liftStack eleva la pila 0,15 y la devuelve a su base', () => {
  const stack = stackOf('isla')
  const baseY = stack.position.y
  liftStack(stack, true)
  expect(stack.position.y).toBeCloseTo(baseY + BOARD3D.draw.stackLift, 5)
  liftStack(stack, false)
  expect(stack.position.y).toBeCloseTo(baseY, 5)
  // La base se recuerda: un segundo lift no acumula.
  liftStack(stack, true)
  liftStack(stack, true)
  expect(stack.position.y).toBeCloseTo(baseY + BOARD3D.draw.stackLift, 5)
})

// AC: SPEC-G/T-064/AC-1 - el origen de la carta es la pila proyectada a pantalla.
test('AC-1 stackScreenPos proyecta la pila al centro/semiplano correcto', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
  camera.position.set(0, 12, 14)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const center = stackScreenPos(stackOf('isla'), camera, 800, 600)
  expect(center.x).toBeGreaterThan(300)
  expect(center.x).toBeLessThan(500)
  expect(center.y).toBeGreaterThan(200)
  expect(center.y).toBeLessThan(400)

  const right = stackScreenPos(stackOf('pantano'), camera, 800, 600)
  expect(right.x).toBeGreaterThan(center.x)
})

// AC: SPEC-G/T-064/AC-3 - la pila refleja la cantidad real (mínimo 1, tope 12).
test('AC-3 setStackCount muestra min(max(count,1),12) cartas', () => {
  const stack = stackOf('montana')
  const cards = (visible: boolean): number =>
    stack.children.filter((child) => child.name.startsWith('card:') && child.visible === visible).length
  setStackCount(stack, 5)
  expect(cards(true)).toBe(5)
  expect(cards(false)).toBe(BOARD3D.card.count - 5)
  setStackCount(stack, 30)
  expect(cards(true)).toBe(BOARD3D.card.count)
  setStackCount(stack, 0)
  expect(cards(true)).toBe(1)
  // El blob de sombra no es una carta: sigue visible.
  expect(stack.children.find((child) => child.name === 'blob')?.visible).toBe(true)
})

// AC: SPEC-G/T-064/AC-4 - skip y reducedMotion saltan todo; 2× a la mitad.
test('AC-4 drawTimings respeta speed y reducedMotion', () => {
  const zero = drawTimings('skip', false)
  expect([zero.highlightMs, zero.flyMs, zero.revealMs, zero.stowMs]).toEqual([0, 0, 0, 0])
  expect(drawTimings('1x', true).flyMs).toBe(0)
  const fast = drawTimings('2x', false)
  expect(fast.flyMs).toBe(BOARD3D.draw.flyMs / 2)
  expect(fast.stowMs).toBe(BOARD3D.draw.stowMs / 2)
})

// AC: SPEC-G/T-064/AC-2 - clasificación de la cara por carta.
test('AC-2 drawKindOf distingue pkm / energía / ítem', () => {
  expect(drawKindOf('squirtle')).toBe('pkm')
  expect(drawKindOf('element_water')).toBe('energy')
  expect(drawKindOf('potion')).toBe('item')
})

// AC: SPEC-N/T-090/AC-2 + AC-4 - Ítem/Sorpresa parten del nodo (sin pedestal);
// el terreno sigue saliendo de su pedestal; el origen del nodo está a ≤ 0,5 px
// del nodo proyectado.
test('AC-2/AC-4 drawOriginTarget: item desde el nodo ≤0,5 px; terreno desde su pedestal', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
  camera.position.set(0, 12, 14)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const mercado = scene.nodes.get('mercado_l')
  expect(mercado).toBeDefined()
  // El scene ya no tiene pila/pedestal de Ítem/Sorpresa (AC-1).
  expect(scene.stacks.has('item')).toBe(false)
  expect(scene.stacks.has('sorpresa')).toBe(false)

  // AC-2: Ítem y Sorpresa resuelven al nodo del robo…
  const itemTarget = drawOriginTarget(scene.stacks, scene.nodes, 'item', 'mercado_l')
  expect(itemTarget).toBe(mercado)
  expect(drawOriginTarget(scene.stacks, scene.nodes, 'sorpresa', 'mercado_l')).toBe(mercado)
  // …el terreno sigue en su pedestal…
  expect(drawOriginTarget(scene.stacks, scene.nodes, 'isla', 'mercado_l')).toBe(stackOf('isla'))
  // …y sin pedestal ni nodo no hay origen (el robo anima igual, sin fly visual).
  expect(drawOriginTarget(scene.stacks, scene.nodes, 'item', null)).toBeNull()
  expect(drawOriginTarget(scene.stacks, scene.nodes, 'item', 'no-existe')).toBeNull()

  // AC-4: el origen proyectado del nodo está a ≤ 0,5 px del nodo proyectado.
  const origin = stackScreenPos(itemTarget!, camera, 800, 600)
  const projectedNode = stackScreenPos(mercado!, camera, 800, 600)
  expect(Math.hypot(origin.x - projectedNode.x, origin.y - projectedNode.y)).toBeLessThanOrEqual(0.5)
})

// AC: SPEC-G/T-064/AC-5 - orden de fases resaltar→volar→revelar→decisión + promesa.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('AC-5 runDrawTimeline pkm: fases en orden y promesa al final', async () => {
  const seen: string[] = []
  const done = runDrawTimeline({
    kind: 'pkm',
    timings: drawTimings('1x', false),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onHighlight: () => seen.push('highlight'),
    onFly: () => seen.push('fly'),
    onReveal: () => seen.push('reveal'),
  })
  // advanceTimersByTimeAsync corre los timers vencidos Y sus microtareas: al
  // vencer el highlight ya entra el fly (su timer de 700 ms queda pendiente).
  await vi.advanceTimersByTimeAsync(BOARD3D.draw.highlightMs)
  expect(seen).toEqual(['highlight', 'fly'])
  await vi.advanceTimersByTimeAsync(BOARD3D.draw.flyMs)
  expect(seen).toEqual(['highlight', 'fly', 'reveal'])
  await vi.advanceTimersByTimeAsync(BOARD3D.draw.revealMs)
  expect(seen).toEqual(['highlight', 'fly', 'reveal'])
  await expect(done).resolves.toBe('decision')
})

// AC: SPEC-G/T-064/AC-5 - energía/ítem: tras revelar vuela al inventario (stow).
test('AC-5 runDrawTimeline energía: revelar → stow al inventario y resuelve', async () => {
  const seen: string[] = []
  const done = runDrawTimeline({
    kind: 'energy',
    timings: drawTimings('1x', false),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onHighlight: () => seen.push('highlight'),
    onFly: () => seen.push('fly'),
    onReveal: () => seen.push('reveal'),
    onStow: () => seen.push('stow'),
  })
  await vi.advanceTimersByTimeAsync(
    BOARD3D.draw.highlightMs + BOARD3D.draw.flyMs + BOARD3D.draw.revealMs,
  )
  expect(seen).toEqual(['highlight', 'fly', 'reveal', 'stow'])
  await vi.advanceTimersByTimeAsync(BOARD3D.draw.stowMs)
  expect(seen).toEqual(['highlight', 'fly', 'reveal', 'stow'])
  await expect(done).resolves.toBe('stowed')
})

// AC: SPEC-G/T-064/AC-4 - con skip todo ocurre sin esperar y resuelve ya.
test('AC-4/AC-5 skip: fases completas y promesa resuelta sin avanzar el reloj', async () => {
  const seen: string[] = []
  const done = runDrawTimeline({
    kind: 'energy',
    timings: drawTimings('skip', false),
    delay: (ms) => (ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))),
    onHighlight: () => seen.push('highlight'),
    onFly: () => seen.push('fly'),
    onReveal: () => seen.push('reveal'),
    onStow: () => seen.push('stow'),
  })
  await expect(done).resolves.toBe('stowed')
  expect(seen).toEqual(['highlight', 'fly', 'reveal', 'stow'])
})

// AC: SPEC-G/T-064/AC-4 - cancelación (desmonte) corta la línea de tiempo.
test('AC-4 shouldStop cancela entre fases', async () => {
  let stop = false
  const seen: string[] = []
  const done = runDrawTimeline({
    kind: 'pkm',
    timings: drawTimings('1x', false),
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    shouldStop: () => stop,
    onHighlight: () => seen.push('highlight'),
    onFly: () => {
      stop = true
      seen.push('fly')
    },
  })
  await vi.advanceTimersByTimeAsync(BOARD3D.draw.highlightMs + BOARD3D.draw.flyMs + 1000)
  await expect(done).resolves.toBe('cancelled')
  expect(seen).toEqual(['highlight', 'fly'])
})
