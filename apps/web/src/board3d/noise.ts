// Ruido determinista por semilla (hash entero + interpolación suave), sin
// Math.random. Lo comparten world.ts (terreno) y zones.ts (biomas).
export const hash2 = (ix: number, iz: number, seed: number): number => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const fade = (t: number): number => t * t * (3 - 2 * t)

export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = fade(x - ix)
  const fz = fade(z - iz)
  const a = hash2(ix, iz, seed)
  const b = hash2(ix + 1, iz, seed)
  const c = hash2(ix, iz + 1, seed)
  const d = hash2(ix + 1, iz + 1, seed)
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz
}

/** Dos octavas de baja frecuencia, centrado en 0 (ruido suave). */
export const fbm = (x: number, z: number, seed: number): number =>
  0.65 * valueNoise(x * 0.16, z * 0.16, seed) +
  0.35 * valueNoise(x * 0.37 + 19.3, z * 0.37 + 7.7, seed ^ 0x9e37) -
  0.5
