// Textura de bioma (SPEC-O/T-096/AC-2): el tinte de zona del terreno sale de
// una textura 1024×1024 con filtro lineal y desenfoque gaussiano, en lugar de
// color por vértice a paso 0,3 (Q-057: bloques cuadrados y escalones de hasta
// 0,195 entre vecinos). Numérico (NO-VISION): los tests leen los bytes; nada
// de acá depende de cómo se vea en pantalla.
import * as THREE from 'three'
import { BOARD3D } from '../theme/board3d'

export interface BiomeTextureInput {
  /** Ancho y alto del mundo: la textura cubre exactamente el terreno. */
  readonly worldSize: readonly [number, number]
  /**
   * Color de suelo en (x, z) en el espacio de trabajo lineal de three
   * (biomas acotados × luz): el mismo cálculo que antes iba por vértice.
   */
  readonly sampleAt: (x: number, z: number, out: THREE.Color) => void
}

/** Muestrea el campo a field² con la convención de UV del plano rotado. */
const sampleField = (
  input: BiomeTextureInput,
  field: number,
  worldW: number,
  worldH: number,
): Float32Array => {
  const data = new Float32Array(field * field * 3)
  const color = new THREE.Color()
  for (let row = 0; row < field; row += 1) {
    // v = (row + 0,5)/field ⇒ z = (0,5 − v)·H (el plano rotado −90° invierte Y).
    const z = (0.5 - (row + 0.5) / field) * worldH
    for (let col = 0; col < field; col += 1) {
      const x = ((col + 0.5) / field - 0.5) * worldW
      input.sampleAt(x, z, color)
      const offset = (row * field + col) * 3
      data[offset] = color.r
      data[offset + 1] = color.g
      data[offset + 2] = color.b
    }
  }
  return data
}

/** Gaussiano separable (kernel del tema, bordes con clamp). */
const blurField = (source: Float32Array, field: number, kernel: readonly number[]): Float32Array => {
  const radius = (kernel.length - 1) / 2
  const weight = kernel.reduce((sum, value) => sum + value, 0)
  const horizontal = new Float32Array(source.length)
  const output = new Float32Array(source.length)
  for (let row = 0; row < field; row += 1) {
    for (let col = 0; col < field; col += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0
        for (let tap = -radius; tap <= radius; tap += 1) {
          const index = Math.min(field - 1, Math.max(0, col + tap))
          sum += (source[(row * field + index) * 3 + channel] ?? 0) * (kernel[tap + radius] ?? 0)
        }
        horizontal[(row * field + col) * 3 + channel] = sum / weight
      }
    }
  }
  for (let row = 0; row < field; row += 1) {
    for (let col = 0; col < field; col += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0
        for (let tap = -radius; tap <= radius; tap += 1) {
          const index = Math.min(field - 1, Math.max(0, row + tap))
          sum += (horizontal[(index * field + col) * 3 + channel] ?? 0) * (kernel[tap + radius] ?? 0)
        }
        output[(row * field + col) * 3 + channel] = sum / weight
      }
    }
  }
  return output
}

/** Subida bilineal field² → size² y codificación sRGB en bytes RGBA. */
const encodeTexture = (fieldData: Float32Array, field: number, size: number): Uint8Array => {
  const data = new Uint8Array(size * size * 4)
  const color = new THREE.Color()
  const srgb = new THREE.Color()
  const channels = [0, 0, 0]
  for (let row = 0; row < size; row += 1) {
    const fy = ((row + 0.5) * field) / size - 0.5
    const yFloor = Math.floor(fy)
    const ty = fy - yFloor
    const y0 = Math.min(field - 1, Math.max(0, yFloor))
    const y1 = Math.min(field - 1, Math.max(0, yFloor + 1))
    for (let col = 0; col < size; col += 1) {
      const fx = ((col + 0.5) * field) / size - 0.5
      const xFloor = Math.floor(fx)
      const tx = fx - xFloor
      const x0 = Math.min(field - 1, Math.max(0, xFloor))
      const x1 = Math.min(field - 1, Math.max(0, xFloor + 1))
      const topLeft = (y0 * field + x0) * 3
      const topRight = (y0 * field + x1) * 3
      const bottomLeft = (y1 * field + x0) * 3
      const bottomRight = (y1 * field + x1) * 3
      for (let channel = 0; channel < 3; channel += 1) {
        const top = (fieldData[topLeft + channel] ?? 0) * (1 - tx) + (fieldData[topRight + channel] ?? 0) * tx
        const bottom =
          (fieldData[bottomLeft + channel] ?? 0) * (1 - tx) + (fieldData[bottomRight + channel] ?? 0) * tx
        channels[channel] = Math.min(1, top * (1 - ty) + bottom * ty)
      }
      color.setRGB(channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0)
      color.getRGB(srgb, THREE.SRGBColorSpace)
      const offset = (row * size + col) * 4
      data[offset] = Math.round(Math.min(1, srgb.r) * 255)
      data[offset + 1] = Math.round(Math.min(1, srgb.g) * 255)
      data[offset + 2] = Math.round(Math.min(1, srgb.b) * 255)
      data[offset + 3] = 255
    }
  }
  return data
}

/**
 * T-096/AC-2: campo muestreado a size/fieldRatio² → gaussiano separable →
 * subida bilineal a size² → bytes sRGB (colorSpace SRGBColorSpace, igual que
 * las CanvasTexture de glifos). DataTexture trae flipY = false: la fila 0 del
 * dato es v = 0, mapea al borde z = +H/2 del plano rotado. Filtro lineal
 * (sin NearestFilter: eso es solo para modelos HGSS) y clamp a los bordes.
 */
export function buildBiomeTexture(input: BiomeTextureInput): THREE.DataTexture {
  const theme = BOARD3D.world.biomeTexture
  const size = theme.size
  const field = Math.max(2, Math.round(size / theme.fieldRatio))
  const [worldW, worldH] = input.worldSize
  const fieldData = sampleField(input, field, worldW, worldH)
  const blurred = blurField(fieldData, field, theme.blur)
  const texture = new THREE.DataTexture(
    encodeTexture(blurred, field, size),
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}
