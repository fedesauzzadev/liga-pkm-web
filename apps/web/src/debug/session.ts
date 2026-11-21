// Sesión de debug: última semilla, comandos enviados al motor y estado del
// perfil de rendimiento del tablero 3D (T-069/AC-6). Alimenta el reporte de
// bug (SPEC-A/T-006/AC-8); el store real lo graba con T-030.
import type { Command } from '@liga/engine'

export interface DebugSession {
  readonly seed: number | null
  readonly commandLog: readonly Command[]
  readonly perf: PerfInfo
}

/** Perfil bajo del tablero 3D (T-069/AC-6): queda registrado en el bug report. */
export interface PerfInfo {
  readonly lowProfile: boolean
  readonly fps: number | null
}

let seed: number | null = null
const commandLog: Command[] = []
let perf: PerfInfo = { lowProfile: false, fps: null }

export function recordSeed(value: number): void {
  seed = value
}

export function recordCommand(command: Command): void {
  commandLog.push(command)
}

export function recordPerf(value: PerfInfo): void {
  perf = value
}

export function readDebugSession(): DebugSession {
  return { seed, commandLog: [...commandLog], perf }
}
