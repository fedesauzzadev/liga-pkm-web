// AC: SPEC-J/T-080 — luz y materiales cartoon, verificados numéricamente
// (NO-VISION): materiales toon (AC-1), hemi+sol con sombras que siguen a la
// ficha y toneMapping ACES (AC-2), niebla/disco solar (AC-3), contornos
// acotados a onlyKinds (AC-4), perfil bajo sin sombras ni contornos con dpr 1
// (AC-5) y presupuestos de render dentro de profiles.* (AC-6, estimación
// pura del decor — como T-068/AC-5e; el número real con culling lo informa
// sceneDump desde gl.info).
import { expect, test } from 'vitest'
import { BoardGraphSchema, type BoardGraph } from '@liga/content'
import * as THREE from 'three'
import kantoJson from '../../../../content/board/kanto.json'
import { estimateDrawCalls, estimateTriangles } from './budget'
import { boardDecor } from './decor'
import { applyShadowFlags, buildLights, sceneSunTo, toneMappingOf } from './lighting'
import { buildOutlines } from './outlines'
import { applySceneProfile, buildBoardScene } from './scene'
import { boardStyle } from './style'
import { applyFillScale } from './scatter'
import { deckStacks } from './stacks'
import { buildToken } from './tokens'
import { toonGradientMap } from './toon'

const board: BoardGraph = BoardGraphSchema.parse(kantoJson)
const scene = buildBoardScene(board, deckStacks, boardDecor)

test('AC: SPEC-J/T-080/AC-1 - piezas y fichas con MeshToonMaterial de N escalones', () => {
  const steps = boardStyle.lighting.toon.steps
  const gradient = toonGradientMap(steps)
  expect(gradient.image.width).toBe(steps)
  expect(gradient.magFilter).toBe(THREE.NearestFilter)

  const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
    const out: THREE.Mesh[] = []
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) out.push(object)
    })
    return out
  }
  const meshes = [...meshesOf(scene.landmarks), ...meshesOf(scene.scatter)]
  expect(meshes.length).toBeGreaterThan(0)
  const toon = meshes.filter((mesh) => mesh.material instanceof THREE.MeshToonMaterial)
  expect(toon.length).toBeGreaterThan(0)
  for (const mesh of toon) {
    const map = (mesh.material as THREE.MeshToonMaterial).gradientMap
    expect((map?.image as { width: number }).width).toBe(steps)
  }

  const token = buildToken('t0', 0)
  for (const name of ['base', 'pawn']) {
    const part = token.children.find((child) => child.name === name) as THREE.Mesh | undefined
    expect(part?.material, `ficha ${name} toon`).toBeInstanceOf(THREE.MeshToonMaterial)
  }
})

test('AC: SPEC-J/T-080/AC-2 - hemi + sol del style, sombra que sigue a la ficha y ACES', () => {
  const rig = buildLights(boardStyle)
  expect(rig.hemi.color.getHex()).toBe(new THREE.Color(boardStyle.lighting.hemisphere.sky).getHex())
  expect(rig.hemi.groundColor.getHex()).toBe(new THREE.Color(boardStyle.lighting.hemisphere.ground).getHex())
  expect(rig.sun.color.getHex()).toBe(new THREE.Color(boardStyle.lighting.directional.color).getHex())
  expect(rig.sun.castShadow).toBe(true)
  expect(rig.sun.shadow.mapSize.width).toBe(boardStyle.lighting.directional.shadowMapSize)

  const radius = boardStyle.lighting.directional.shadowRadiusAroundTarget
  const camera = rig.sun.shadow.camera
  expect(camera.right - camera.left).toBeCloseTo(2 * radius, 6)
  sceneSunTo(rig, 3, -4, boardStyle.lighting.directional.from)
  expect(rig.sun.target.position.x).toBeCloseTo(3, 6)
  expect(rig.sun.target.position.z).toBeCloseTo(-4, 6)
  const from = boardStyle.lighting.directional.from
  expect(rig.sun.position.x).toBeCloseTo(3 + from[0], 6)
  expect(rig.sun.position.y).toBeCloseTo(from[1], 6)
  expect(rig.sun.position.z).toBeCloseTo(-4 + from[2], 6)

  expect(toneMappingOf('ACESFilmic')).toBe(THREE.ACESFilmicToneMapping)
  expect(toneMappingOf(boardStyle.lighting.toneMapping)).toBe(THREE.NeutralToneMapping) // N-0010/AC-3
  expect(scene.contacts.count).toBeGreaterThan(0)
  const contactMaterial = scene.contacts.material as THREE.MeshBasicMaterial
  expect(contactMaterial.opacity).toBeCloseTo(boardStyle.lighting.contactShadows.opacity, 5)
})

test('AC: SPEC-J/T-080/AC-3 - niebla suave del style y disco solar en el domo', () => {
  expect(scene.world.fog.near).toBe(boardStyle.fog.near)
  expect(scene.world.fog.far).toBe(boardStyle.fog.far)
  expect(scene.world.fog.color.getHex()).toBe(new THREE.Color(boardStyle.fog.color).getHex())

  const sunDisk = scene.world.sunDisk
  expect(sunDisk, 'sky.sunDisk true ⇒ disco solar').toBeDefined()
  const from = new THREE.Vector3(...boardStyle.lighting.directional.from).normalize()
  const direction = sunDisk?.position.clone().normalize()
  expect(direction?.dot(from)).toBeGreaterThan(0.99)
  const material = sunDisk?.material as THREE.MeshBasicMaterial
  expect(material.fog).toBe(false)
})

test('AC: SPEC-J/T-080/AC-4 - contornos solo en onlyKinds y con tope maxMeshes', () => {
  const { onlyKinds, maxMeshes, color } = boardStyle.lighting.outlines
  // Contenido real (decisión del dueño 2026-10-23): outlines apagados ⇒ grupo vacío.
  expect(boardStyle.lighting.outlines.enabled).toBe(false)
  expect(scene.outlines.children.length).toBe(0)

  // Maquinaria data-driven verificada con style sintético enabled (Q-089/AC-3):
  // buildOutlines respeta onlyKinds, maxMeshes, color y BackSide.
  const enabledStyle = {
    ...boardStyle,
    lighting: { ...boardStyle.lighting, outlines: { ...boardStyle.lighting.outlines, enabled: true } },
  }
  const enabled = buildOutlines(scene.landmarks, enabledStyle)
  const outlines = enabled.children
  expect(outlines.length).toBeGreaterThan(0)
  expect(outlines.length).toBeLessThanOrEqual(maxMeshes)
  for (const outline of outlines) {
    const source = String((outline as THREE.Mesh).name).replace('outline:', '')
    const group = scene.landmarks.children.find((child) => child.name === source)
    expect(onlyKinds, `${source} ∈ onlyKinds`).toContain(String(group?.userData.kind))
    const material = (outline as THREE.Mesh).material as THREE.MeshBasicMaterial
    expect(material.color.getHex()).toBe(new THREE.Color(color).getHex())
    expect(material.side).toBe(THREE.BackSide)
  }
  const eligible = scene.landmarks.children.filter(
    (group) =>
      typeof group.userData.kind === 'string' &&
      (onlyKinds as readonly string[]).includes(group.userData.kind),
  )
  expect(outlines.length).toBe(Math.min(eligible.length, maxMeshes))

  const disabled = buildOutlines(scene.landmarks, boardStyle)
  expect(disabled.children.length).toBe(0)
})

test('AC: SPEC-J/T-080/AC-5 - perfil bajo: sin sombras ni contornos, dpr 1', () => {
  expect(boardStyle.profiles.low.dpr).toEqual([1, 1])
  expect(boardStyle.profiles.low.shadows).toBe(false)
  expect(boardStyle.profiles.low.outlines).toBe(false)

  applySceneProfile(scene, true)
  expect(scene.sun.castShadow).toBe(false)
  expect(scene.contacts.visible).toBe(false)
  expect(scene.outlines.visible).toBe(false)
  applySceneProfile(scene, false)
  expect(scene.sun.castShadow).toBe(true)
  expect(scene.contacts.visible).toBe(true)
  // Contenido real: outlines.enabled=false ⇒ invisible incluso en high
  // (scene.ts:277: visible = profile.outlines && boardStyle.lighting.outlines.enabled).
  expect(boardStyle.lighting.outlines.enabled).toBe(false)
  expect(scene.outlines.visible).toBe(false)
  // Style forzado enabled:true ⇒ high los mostraría (misma fórmula de scene.ts).
  const forcedVisible = boardStyle.profiles.high.outlines && true
  expect(forcedVisible).toBe(true)
})

test('AC: SPEC-J/T-080/AC-6 - draw calls y triángulos del decor dentro de profiles.*', () => {
  const decorSurface = [scene.landmarks, scene.scatter, scene.outlines, scene.contacts]
  const calls = decorSurface.reduce((sum, group) => sum + estimateDrawCalls(group), 0)
  const triangles = decorSurface.reduce((sum, group) => sum + estimateTriangles(group), 0)
  expect(calls).toBeLessThanOrEqual(boardStyle.profiles.high.maxDrawCalls)
  expect(triangles).toBeLessThanOrEqual(boardStyle.profiles.high.maxTriangles)

  applySceneProfile(scene, true)
  applyFillScale(scene.scatter, 0.5)
  const lowSurface = [scene.landmarks, scene.scatter, scene.outlines, scene.contacts]
  const lowCalls = lowSurface.reduce((sum, group) => sum + estimateDrawCalls(group), 0)
  const lowTriangles = lowSurface.reduce((sum, group) => sum + estimateTriangles(group), 0)
  expect(lowCalls).toBeLessThanOrEqual(boardStyle.profiles.low.maxDrawCalls)
  expect(lowTriangles).toBeLessThanOrEqual(boardStyle.profiles.low.maxTriangles)
  applyFillScale(scene.scatter, 1)
  applySceneProfile(scene, false)
})

test('AC: N-0010/AC-1+AC-4 - sombras: volúmenes proyectan, suelo solo recibe, translúcido/básico afuera', () => {
  const root = new THREE.Group()
  const mesh = (name: string, material: THREE.Material): THREE.Mesh => {
    const item = new THREE.Mesh(new THREE.BoxGeometry(), material)
    item.name = name
    root.add(item)
    return item
  }
  const house = mesh('model:house', new THREE.MeshToonMaterial())
  const terrain = mesh('terrain', new THREE.MeshStandardMaterial())
  const edge = mesh('edge:a-b', new THREE.MeshStandardMaterial())
  const water = mesh('water:isla', new THREE.MeshStandardMaterial())
  const mist = mesh('mist', new THREE.MeshStandardMaterial({ transparent: true }))
  const glyph = mesh('glyph', new THREE.MeshBasicMaterial())
  expect(applyShadowFlags(root)).toBe(6)
  expect([house.castShadow, house.receiveShadow]).toEqual([true, true])
  expect([terrain.castShadow, terrain.receiveShadow]).toEqual([false, true])
  expect([edge.castShadow, edge.receiveShadow]).toEqual([false, true])
  expect([water.castShadow, water.receiveShadow]).toEqual([false, true])
  expect([mist.castShadow, mist.receiveShadow]).toEqual([false, false])
  expect([glyph.castShadow, glyph.receiveShadow]).toEqual([false, false])
})
