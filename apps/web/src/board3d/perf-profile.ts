// Perfil bajo automático (SPEC-H/T-069/AC-6): lógica pura (fps y reloj
// inyectados) para testear en node. Si el FPS medido queda por debajo del
// umbral durante lowFpsSeconds, se baja a perfil bajo (sin nubes ni
// animaciones, dpr al mínimo, −50 % de relleno para T-068) y NO se recupera
// solo: queda registrado en el reporte de bug (debug/session.ts).
export interface PerfProfileState {
  readonly belowSince: number | null
  readonly low: boolean
}

export const initialPerfProfile: PerfProfileState = { belowSince: null, low: false }

/**
 * Muestra de FPS: por debajo del umbral acumula `lowSeconds`; al cumplirlos
 * marca `low: true` (definitivo). Por encima solo reinicia el acumulador.
 */
export function perfSample(
  state: PerfProfileState,
  fps: number,
  nowMs: number,
  threshold: number,
  lowSeconds: number,
): PerfProfileState {
  if (fps >= threshold) return { belowSince: null, low: state.low }
  const since = state.belowSince ?? nowMs
  const low = state.low || nowMs - since >= lowSeconds * 1000
  return { belowSince: since, low }
}

/** AC-6: el relleno de zonas (T-068) se reduce a la mitad en perfil bajo. */
export const fillScaleFor = (lowProfile: boolean): number => (lowProfile ? 0.5 : 1)
