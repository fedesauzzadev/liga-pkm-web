// N-0016: mariposas decorativas . Three puro: un
// plano por mariposa con color propio (MeshBasicMaterial ⇒ no proyecta ni recibe
// sombra, `applyShadowFlags`) que vuela en círculos y aletea con scale.x.
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'
import { fnv1a, rngSeq } from './rand'
import type { WorldBiome } from './world'

export function buildButterflies(biomes: readonly WorldBiome[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'butterflies'
  const cfg = BOARD3D.world.butterfly
  const { count, zones } = cfg
  const homes = biomes.filter((biome) => (zones as readonly string[]).includes(biome.key))
  if (homes.length === 0) return group
  const rng = rngSeq(fnv1a('butterflies'))
  const geometry = new THREE.PlaneGeometry(cfg.size, cfg.size * 0.7)
  geometry.rotateX(-Math.PI / 2)
  for (let index = 0; index < count; index += 1) {
    const home = homes[index % homes.length]!
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: cfg.colors[index % cfg.colors.length] ?? '#FFFFFF', side: THREE.DoubleSide }),
    )
    mesh.name = `butterfly:${String(index)}`
    mesh.userData = {
      cx: home.center.x + (rng() - 0.5) * (home.half?.[0] ?? 2),
      cz: home.center.z + (rng() - 0.5) * (home.half?.[1] ?? 2),
      radius: cfg.radius[0] + rng() * (cfg.radius[1] - cfg.radius[0]),
      speed: (0.5 + rng()) * (rng() < 0.5 ? 1 : -1),
      phase: rng() * Math.PI * 2,
      height: cfg.height[0] + rng() * (cfg.height[1] - cfg.height[0]),
    }
    group.add(mesh)
  }
  stepButterflies(group, 0)
  return group
}

/** Vuelo en círculo con subidas/bajadas y aleteo; `tSec` en segundos. */
export function stepButterflies(group: THREE.Group, tSec: number): void {
  for (const mesh of group.children) {
    const u = mesh.userData as Record<'cx' | 'cz' | 'radius' | 'speed' | 'phase' | 'height', number>
    const a = u.phase + tSec * u.speed
    mesh.position.set(
      u.cx + Math.cos(a) * u.radius,
      u.height + Math.sin(a * 2.3) * 0.12,
      u.cz + Math.sin(a) * u.radius,
    )
    mesh.rotation.y = -a + (u.speed > 0 ? 0 : Math.PI)
    mesh.scale.x = 0.25 + 0.75 * Math.abs(Math.cos(tSec * BOARD3D.world.butterfly.flapHz * Math.PI * 2 + u.phase))
  }
}
