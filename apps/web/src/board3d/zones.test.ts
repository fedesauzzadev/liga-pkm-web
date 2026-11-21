// N-0011: zonas con forma propia — máscara, relieve y agua verificados sobre
// el tablero real (NO-VISION: números además de la captura mirada).
import { expect, test } from 'vitest'
import { BoardGraphSchema } from '@liga/content'
import type * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { BOARD3D } from '../theme/board3d'
import { boardDecor } from './decor'
import { buildWorldInput } from './scene'
import { deckStacks } from './stacks'
import { buildWorld, terrainHeightAt } from './world'
import { zoneMaskAt } from './zones'

const input = buildWorldInput(BoardGraphSchema.parse(kantoJson), deckStacks, boardDecor)
const world = buildWorld(input)

test('AC: N-0011/AC-1+AC-3 - cada zona tiene celda propia y no pisa nodos, caminos ni edificios', () => {
  expect(input.biomes.map((biome) => biome.key).sort()).toEqual(['bosque', 'isla', 'llanura', 'montana', 'pantano'])
  for (const biome of input.biomes) {
    let peak = 0
    for (let step = 0; step < 64; step += 1) {
      const angle = (Math.PI * 2 * step) / 64
      const radius = 0.9 + (step % 4) * 0.25
      peak = Math.max(peak, zoneMaskAt(biome.center.x + radius * Math.cos(angle), biome.center.z + radius * Math.sin(angle), input, biome))
    }
    expect(peak, `zona ${biome.key} sin celda`).toBeGreaterThan(0.9)
    for (const node of input.nodes) expect(zoneMaskAt(node.x, node.z, input, biome)).toBe(0)
    for (const item of input.obstacles ?? []) expect(zoneMaskAt(item.x, item.z, input, biome)).toBe(0)
  }
})

test('AC: N-0011/AC-2 - lago opaco con islote para el mazo, charcos en pantano y relieve en montaña', () => {
  const names = world.root.children.filter((child) => child.name.startsWith('water:')).map((child) => child.name).sort()
  expect(names).toEqual(['water:isla', 'water:pantano'])
  const lake = world.water
  if (lake === null) throw new Error('sin lago')
  expect((lake.material as THREE.MeshStandardMaterial).transparent).toBe(false)
  expect((lake.geometry as THREE.BufferGeometry).index?.count ?? 0).toBeGreaterThan(0)

  const isla = input.biomes.find((biome) => biome.key === 'isla')
  const montana = input.biomes.find((biome) => biome.key === 'montana')
  if (isla === undefined || montana === undefined) throw new Error('faltan zonas')
  // El mazo queda en tierra firme (islote) y hay fondo bajo el nivel del agua.
  expect(terrainHeightAt(isla.center.x, isla.center.z, input)).toBeGreaterThan(lake.position.y)
  let lowest = 0
  let highest = 0
  for (let step = 0; step < 200; step += 1) {
    const angle = step * 2.399963
    const radius = 0.9 + (step / 200) * 1.3
    lowest = Math.min(lowest, terrainHeightAt(isla.center.x + radius * Math.cos(angle), isla.center.z + radius * Math.sin(angle), input))
    highest = Math.max(highest, terrainHeightAt(montana.center.x + radius * Math.cos(angle), montana.center.z + radius * Math.sin(angle), input))
  }
  expect(lowest).toBeLessThan(lake.position.y)
  expect(highest).toBeGreaterThan(BOARD3D.world.zones.rules.montana.rise * 0.5)
})
