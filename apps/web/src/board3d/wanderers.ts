// N-0034: pokémon salvajes caminando por el mapa. Three puro: un plano por
// pokémon (sprite 2D de Showdown) que recorre un circuito cerrado dentro de su
// zona sin pisar nodos, caminos, edificios ni agua, y siempre mira a la cámara
// (billboard). MeshBasicMaterial ⇒ sin sombras. La textura la pone la capa R3F
// (Wanderers3D); sin textura el plano queda invisible.
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { fnv1a, rngSeq } from './rand'
import type { WorldBiome, WorldInput } from './world'
import { clearDistance } from './zones'

const CFG = BOARD3D.world.wanderer
const RULES = BOARD3D.world.zones.rules as Readonly<Record<string, { readonly water?: { readonly level: number } } | undefined>>

interface WandererData {
  dex: number
  /** Circuito muestreado denso: x, y, z por punto (y = alto del terreno). */
  path: number[]
  /** Puntos del circuito por segundo. */
  rate: number
  phase: number
  dirX: number
  dirZ: number
  /** Tamaño en mundo (lo fija la textura). */
  w: number
  h: number
}

/** Alto del terreno en (x, z); lo inyecta world.ts (evita el import circular). */
export type HeightAt = (x: number, z: number) => number

const dataOf = (mesh: THREE.Object3D): WandererData => mesh.userData as WandererData

const walkable = (x: number, z: number, biome: WorldBiome, input: WorldInput, heightAt: HeightAt): boolean =>
  clearDistance(x, z, input) > CFG.clearance &&
  // El pedestal del mazo vive en el centro de la zona.
  Math.hypot(x - biome.center.x, z - biome.center.z) > BOARD3D.world.zones.pedestalRadius &&
  // El agua de la zona cubre el terreno que queda bajo su nivel: se camina por arriba.
  heightAt(x, z) > (RULES[biome.key]?.water?.level ?? Number.NEGATIVE_INFINITY) + CFG.shore

/** Circuito cerrado caminable (denso, cada ~`sampleStep`), o null si no hay lugar. */
function findLoop(rng: () => number, biome: WorldBiome, input: WorldInput, heightAt: HeightAt): number[] | null {
  const half = biome.half ?? [2, 2]
  for (let attempt = 0; attempt < CFG.attempts; attempt += 1) {
    const hx = biome.center.x + (rng() - 0.5) * 2 * half[0] * CFG.spread
    const hz = biome.center.z + (rng() - 0.5) * 2 * half[1] * CFG.spread
    const corners = Array.from({ length: CFG.corners }, (_, index) => {
      const angle = ((index + rng() * 0.6) / CFG.corners) * Math.PI * 2
      const radius = CFG.radius[0] + rng() * (CFG.radius[1] - CFG.radius[0])
      return [hx + Math.cos(angle) * radius, hz + Math.sin(angle) * radius] as const
    })
    const path: number[] = []
    let ok = true
    for (let index = 0; ok && index < corners.length; index += 1) {
      const [ax, az] = corners[index]!
      const [bx, bz] = corners[(index + 1) % corners.length]!
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / CFG.sampleStep))
      for (let step = 0; step < steps; step += 1) {
        const x = ax + ((bx - ax) * step) / steps
        const z = az + ((bz - az) * step) / steps
        if (!walkable(x, z, biome, input, heightAt)) {
          ok = false
          break
        }
        path.push(x, heightAt(x, z), z)
      }
    }
    if (ok) return path
  }
  return null
}

export function buildWanderers(input: WorldInput, heightAt: HeightAt): THREE.Group {
  const group = new THREE.Group()
  group.name = 'wanderers'
  // Origen en los pies: el sprite se apoya en el suelo al escalarlo.
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)
  for (const [zone, species] of Object.entries(CFG.species)) {
    const biome = input.biomes.find((candidate) => candidate.key === zone)
    if (biome === undefined) continue
    for (const dex of species) {
      const rng = rngSeq(fnv1a(`wanderer:${zone}:${String(dex)}`))
      const path = findLoop(rng, biome, input, heightAt)
      // shortcut: sin circuito libre el pokémon no aparece; el relleno (árboles, pasto) no cuenta como obstáculo, pasarle el plan de decor si molesta.
      if (path === null) continue
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ alphaTest: 0.5, side: THREE.DoubleSide }),
      )
      mesh.name = `wanderer:${String(dex)}`
      mesh.visible = false
      const speed = CFG.speed[0] + rng() * (CFG.speed[1] - CFG.speed[0])
      const data: WandererData = {
        dex, path, rate: speed / CFG.sampleStep, phase: rng() * (path.length / 3), dirX: 1, dirZ: 0, w: 0, h: 0,
      }
      mesh.userData = data
      group.add(mesh)
    }
  }
  stepWanderers(group, 0)
  return group
}

/** Avanza cada pokémon por su circuito con un saltito de paso; `tSec` en segundos. */
export function stepWanderers(group: THREE.Group, tSec: number): void {
  for (const mesh of group.children) {
    const data = dataOf(mesh)
    const count = data.path.length / 3
    const u = (data.phase + tSec * data.rate) % count
    const a = Math.floor(u) * 3
    const b = ((Math.floor(u) + 1) % count) * 3
    const f = u - Math.floor(u)
    const at = (offset: number): number => data.path[a + offset]! + (data.path[b + offset]! - data.path[a + offset]!) * f
    mesh.position.set(at(0), at(1) + Math.abs(Math.sin(tSec * CFG.hopHz * Math.PI)) * CFG.hop, at(2))
    data.dirX = data.path[b]! - data.path[a]!
    data.dirZ = data.path[b + 2]! - data.path[a + 2]!
  }
}

/** Pone el sprite: el tamaño en mundo sale de los píxeles del GIF (los pokémon grandes se ven grandes). */
export function setWandererTexture(mesh: THREE.Object3D, texture: THREE.Texture, widthPx: number, heightPx: number): void {
  const data = dataOf(mesh)
  data.w = widthPx * CFG.unitsPerPx
  data.h = heightPx * CFG.unitsPerPx
  const material = (mesh as THREE.Mesh).material as THREE.MeshBasicMaterial
  material.map = texture
  material.needsUpdate = true
  mesh.scale.set(data.w, data.h, 1)
  mesh.visible = true
}

const right = new THREE.Vector3()

/**
 * Billboard: el plano copia la orientación de la cámara, así el sprite 2D se ve
 * de frente desde cualquier giro. Los sprites de Showdown miran a la izquierda:
 * si en pantalla camina hacia la derecha, se espeja.
 */
export function faceWanderers(group: THREE.Group, camera: THREE.Camera): void {
  right.setFromMatrixColumn(camera.matrixWorld, 0)
  for (const mesh of group.children) {
    const data = dataOf(mesh)
    mesh.quaternion.copy(camera.quaternion)
    const flip = data.dirX * right.x + data.dirZ * right.z > 0 ? -1 : 1
    mesh.scale.set(data.w * flip, data.h, 1)
  }
}
