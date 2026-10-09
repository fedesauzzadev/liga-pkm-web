// Sesión de debug: última semilla y comandos enviados al motor. Alimenta el
// reporte de bug (SPEC-A/T-006/AC-8); el store real lo graba con T-030.
import type { Command } from '@liga/engine'

export interface DebugSession {
  readonly seed: number | null
  readonly commandLog: readonly Command[]
}

let seed: number | null = null
const commandLog: Command[] = []

export function recordSeed(value: number): void {
  seed = value
}

export function recordCommand(command: Command): void {
  commandLog.push(command)
}

export function readDebugSession(): DebugSession {
  return { seed, commandLog: [...commandLog] }
}
