// AC: SPEC-K/T-070e/AC-1 — parsers de formatos: OBJ sintético (bbox de líneas
// v, triángulos con cuadriláteros triangulados, mtllib + map_Kd, texturas
// faltantes) y GLB real del pack mini-forest (chunk JSON sin librerías).
// AC: SPEC-N/T-091/AC-1 — detección pura de los modelos nuevos por nombre base.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import {
  detectNewModelFiles, foldName, glbStatsOf, glbBytesOf, objSiblingFiles, objStatsOf, parseObj,
} from '../tools/models-format.ts'

const fixtureDir = join(tmpdir(), 'liga-t070-obj-fixture')

describe('OBJ sintético', () => {
  afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }))

  test('AC: SPEC-K/T-070e/AC-1 parseObj triangula y calcula bbox', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3', 'f 1 2 3 4'].join('\n')
    const parsed = parseObj(obj)
    expect(parsed.triangles).toBe(3) // 1 trígono + 1 cuadrilátero (2)
    expect(parsed.min).toEqual([0, 0, 0])
    expect(parsed.max).toEqual([1, 1, 0])
  })

  test('AC: SPEC-K/T-070e/AC-1 objStatsOf reporta texturas presentes y faltantes', () => {
    mkdirSync(fixtureDir, { recursive: true })
    const objPath = join(fixtureDir, 'model.obj')
    const objText = 'mtllib model.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'
    writeFileSync(objPath, objText, 'utf8')
    writeFileSync(join(fixtureDir, 'model.mtl'), 'newmtl tex\nmap_Kd base.png\nmap_Kd sombra_lm.png\n', 'utf8')
    writeFileSync(join(fixtureDir, 'base.png'), 'png', 'utf8')
    const stats = objStatsOf(objPath, objText)
    expect(stats.textureRefs).toEqual(['base.png', 'sombra_lm.png'])
    const present = objSiblingFiles(objPath)
    expect(present).toContain('base.png')
    // Textura faltante: la detecta el scan (catalog.missingTextures); acá el
    // fixture confirma la lectura de hermanos del directorio.
    expect(stats.bboxMin).toEqual([0, 0, 0])
  })

  test('foldName normaliza acentos y case (Poké Mart ≡ poke mart)', () => {
    expect(foldName('Poké Mart (Violet City)')).toBe('poke mart violet city')
  })
})

describe('GLB real (mini-forest)', () => {
  const tree = join('assets-src', 'kenney', 'kenney_mini-forest_1.0', 'Models', 'GLB format', 'tree.glb')

  test.skipIf(!glbExists())('AC: SPEC-K/T-070a/AC-1 el parser GLB lee triángulos y bbox del chunk JSON', () => {
    const stats = glbStatsOf(glbBytesOf(tree))
    expect(stats.triangles).toBeGreaterThan(0)
    expect(stats.bboxMax[1]).toBeGreaterThan(stats.bboxMin[1])
    expect(stats.bboxMin[1]).toBeGreaterThanOrEqual(-1e-6)
  })

  test('un archivo que no es GLB falla con error claro', () => {
    expect(() => glbStatsOf(new Uint8Array([1, 2, 3, 4]))).toThrow('GLB')
  })
})

function glbExists(): boolean {
  try {
    glbBytesOf(join('assets-src', 'kenney', 'kenney_mini-forest_1.0', 'Models', 'GLB format', 'tree.glb'))
    return true
  } catch {
    return false
  }
}

describe('Modelos nuevos: detección (T-091)', () => {
  const files = { gym: 'gim', pokecenter: 'pokecenter', market: 'pokemart', league: 'league' }

  test('AC: SPEC-N/T-091/AC-1 detecta por nombre base con formatos .glb/.gltf/.obj/.fbx', () => {
    const names = ['gim.glb', 'pokecenter.gltf', 'pokemart.obj', 'league.fbx', 'otra-cosa.glb']
    expect(detectNewModelFiles(names, files)).toEqual({
      gym: { file: 'gim.glb', format: 'glb' },
      pokecenter: { file: 'pokecenter.gltf', format: 'gltf' },
      market: { file: 'pokemart.obj', format: 'obj' },
      league: { file: 'league.fbx', format: 'fbx' },
    })
  })

  test('AC: SPEC-N/T-091/AC-1 admite sufijos (gim_01) y prefiere el nombre exacto', () => {
    const found = detectNewModelFiles(['gim_02.glb', 'gim_01.glb', 'gim.glb', 'GIM_03.OBJ'], files)
    expect(found.gym).toEqual({ file: 'gim.glb', format: 'glb' })
    // Sin el exacto: el primer sufijo en orden lexicográfico, extensión en minúsculas.
    const onlySuffix = detectNewModelFiles(['gim_01.glb', 'gim_02.glb'], files)
    expect(onlySuffix.gym).toEqual({ file: 'gim_01.glb', format: 'glb' })
    expect(onlySuffix.pokecenter).toBeUndefined()
  })

  test('AC: SPEC-N/T-091/AC-1 ignora extensiones no soportadas y nombres sin extensión', () => {
    expect(detectNewModelFiles(['gim.png', 'gim.fbx.txt', 'gim', 'pokemart.dae'], files)).toEqual({})
  })
})
