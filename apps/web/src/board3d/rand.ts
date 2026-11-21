// RNG determinista compartido por el tablero 3D (pilas, guijarros): FNV-1a
// para sembrar por texto y LCG para secuencias. Sin Math.random (motor puro
// de estilo; NO-VISION: todo reproducible en tests).
export const fnv1a = (text: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** Secuencia determinista de valores en [0, 1) sembrada con un entero. */
export function rngSeq(seed: number): () => number {
  let state = (seed >>> 0) || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}
