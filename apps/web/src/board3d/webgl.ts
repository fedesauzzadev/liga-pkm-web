// Detección de WebGL (SPEC-G/T-062/AC-8): si el navegador no puede crear un
// contexto, BoardHost cae automáticamente al tablero 2D SVG (ADR-8).
export interface CanvasProbeTarget {
  getContext(type: string): unknown
}

export type CanvasProbe = () => CanvasProbeTarget | null

const defaultProbe: CanvasProbe = () => {
  if (typeof document === 'undefined') return null
  return document.createElement('canvas')
}

function probeHasWebGl(probe: CanvasProbe): boolean {
  const canvas = probe()
  if (canvas === null) return false
  try {
    if (canvas.getContext('webgl2')) return true
    return canvas.getContext('webgl') !== null && canvas.getContext('webgl') !== undefined
  } catch {
    return false
  }
}

// T-066: caché del probe por defecto. BoardHost re-evalúa hasWebGl() en cada
// render y cada canvas+getContext deja un contexto WebGL VIVO en Chromium:
// sin caché se acumulan ("Too many active WebGL contexts") y el navegador
// pierde el contexto del tablero (canvas en blanco). Los probes inyectados
// (tests) no tocan la caché.
let cachedDefault: boolean | null = null

export function hasWebGl(probe: CanvasProbe = defaultProbe): boolean {
  if (probe !== defaultProbe) return probeHasWebGl(probe)
  if (cachedDefault === null) cachedDefault = probeHasWebGl(probe)
  return cachedDefault
}
