// Detalle del suelo: la textura de bioma (T-096) da el COLOR de cada zona pero
// es lisa; acá va el grano. Una textura tileable 512² con un patrón por canal
// (R pasto, G roca, B surcos de arena/trigo, A barro) se multiplica sobre el
// color en el shader del terreno, eligiendo canal con un peso por vértice
// (`aBiome`). Determinista (hash2, sin Math.random); three puro.
import * as THREE from 'three'
import { hash2 } from './noise'
import { smoothstep } from './smooth'
import { biomeWeightsAt, type ZoneInput } from './zones'

// 512² + octava `micro` (128 celdas): grano nítido con zoom cercano y dpr 2.
const SIZE = 512
/** Una baldosa de detalle cada 1,5 unidades de mundo. */
export const DETAIL_TILE = 1.5
/** Canal de `aBiome` por zona: x roca, y surcos, z barro (resto ⇒ pasto). */
const CHANNEL: Readonly<Record<string, number>> = { montana: 0, isla: 1, llanura: 1, pantano: 2 }

/** Ruido de valor periódico: tilea cada `period` celdas. */
const tileNoise = (x: number, y: number, period: number, seed: number): number => {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const sx = smoothstep(0, 1, x - x0)
  const sy = smoothstep(0, 1, y - y0)
  const at = (ix: number, iy: number): number => hash2(((ix % period) + period) % period, ((iy % period) + period) % period, seed)
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
  return top + (bottom - top) * sy
}

/** Los 4 patrones en (u, v) ∈ [0, 1): 0,5 = neutro, <0,5 oscurece, >0,5 aclara. */
export function detailAt(u: number, v: number): readonly [number, number, number, number] {
  const coarse = tileNoise(u * 8, v * 8, 8, 1) - 0.5
  const fine = tileNoise(u * 32, v * 32, 32, 2) - 0.5
  const grain = tileNoise(u * 64, v * 64, 64, 3)
  const micro = (tileNoise(u * 128, v * 128, 128, 7) - 0.5) * 0.22
  // Pasto: manchones + matas oscuras y brotes claros.
  const grass = 0.5 + coarse * 0.5 + fine * 0.3 + (grain > 0.72 ? -0.2 : grain < 0.2 ? 0.14 : 0)
  // Roca: estratos ondulados + grietas (ruido crestado).
  const strata = Math.sin((v + 0.08 * tileNoise(u * 6, v * 6, 6, 4)) * Math.PI * 2 * 7)
  const crack = smoothstep(0.9, 1, 1 - Math.abs(2 * tileNoise(u * 10, v * 10, 10, 5) - 1))
  const rock = 0.55 + fine * 0.4 + strata * 0.12 - crack * 0.45
  // Surcos: ondas de arena / hileras de trigo.
  const furrow = 0.5 + 0.2 * Math.sin((v * 12 + 0.15 * Math.sin(u * Math.PI * 6)) * Math.PI * 2) + (grain - 0.5) * 0.24
  // Barro: charcos oscuros de borde neto + burbujas.
  const mud = 0.5 + (smoothstep(0.45, 0.6, tileNoise(u * 5, v * 5, 5, 6)) - 0.5) * 0.6 + fine * 0.2 - (grain > 0.8 ? 0.2 : 0)
  return [grass + micro, rock + micro, furrow + micro, mud + micro]
}

let cached: THREE.DataTexture | null = null

/** Una sola por sesión: no depende del tablero y armarla cuesta ~2 M de muestras de ruido. */
export function buildDetailTexture(): THREE.DataTexture {
  if (cached !== null) return cached
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      detailAt(col / SIZE, row / SIZE).forEach((value, channel) => {
        data[(row * SIZE + col) * 4 + channel] = Math.round(Math.min(1, Math.max(0, value)) * 255)
      })
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  // Sin esto el suelo lejano (ángulo rasante) se lava a un color plano; three lo acota al máximo de la GPU.
  texture.anisotropy = 16
  texture.needsUpdate = true
  cached = texture
  return texture
}

/** Peso de patrón por vértice del terreno (atributo `aBiome`, 3 canales). */
export function biomeDetailAttribute(position: THREE.BufferAttribute, input: ZoneInput): THREE.BufferAttribute {
  const weights = new Float32Array(position.count * 3)
  for (let index = 0; index < position.count; index += 1) {
    for (const { biome, weight } of biomeWeightsAt(position.getX(index), position.getZ(index), input).weights) {
      const channel = CHANNEL[biome.key]
      if (channel !== undefined) weights[index * 3 + channel] = Math.min(1, (weights[index * 3 + channel] ?? 0) + weight)
    }
  }
  return new THREE.BufferAttribute(weights, 3)
}

/** Engancha el detalle al material del terreno (necesita `map` ⇒ vMapUv). */
export function applyTerrainDetail(material: THREE.MeshStandardMaterial, worldSize: number): THREE.DataTexture {
  const detail = buildDetailTexture()
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail }
    shader.uniforms.uDetailRepeat = { value: worldSize / DETAIL_TILE }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBiome;\nvarying vec3 vBiome;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBiome = aBiome;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform float uDetailRepeat;\nvarying vec3 vBiome;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Segunda escala (×0,19) para que no se note la repetición de la baldosa.
        vec4 dMix = mix(texture2D(uDetail, vMapUv * uDetailRepeat), texture2D(uDetail, vMapUv * uDetailRepeat * 0.19), 0.35);
        float dGrass = clamp(1.0 - vBiome.x - vBiome.y - vBiome.z, 0.0, 1.0);
        float dVal = dMix.r * dGrass + dMix.g * vBiome.x + dMix.b * vBiome.y + dMix.a * vBiome.z;
        diffuseColor.rgb *= 0.6 + 0.8 * dVal;`,
      )
  }
  return detail
}
