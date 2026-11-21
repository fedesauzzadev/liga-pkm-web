// Reporte de bug reproducible (ENGINEERING-STANDARDS §5): con la versión, la
// semilla y el log de comandos se reconstruye la partida exacta (`replay`).
// La descarga usa el DOM solo si existe (SSR/Node-safe); en Node devuelve el reporte.
import { createInitialState } from '@liga/engine'
import webPkg from '../../package.json'
import { readDebugSession, type PerfInfo } from './session'

interface AnchorLike {
  href: string
  download: string
  click(): void
}

type DocumentLike = { createElement(tagName: 'a'): AnchorLike }

export interface BugReportError {
  readonly name: string
  readonly message: string
  readonly stack: string | null
}

export interface BugReport {
  readonly app: string
  readonly appVersion: string
  readonly stateVersion: number
  readonly seed: number | null
  readonly commandLog: readonly unknown[]
  /** T-069/AC-6: perfil bajo del tablero 3D y último FPS medido. */
  readonly perf: PerfInfo
  readonly error: BugReportError | null
  readonly userAgent: string
  readonly generatedAt: string
}

const asErrorInfo = (error: unknown): BugReportError | null =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack ?? null }
    : null

export function buildBugReport(error?: unknown): BugReport {
  const session = readDebugSession()
  return {
    app: webPkg.name,
    appVersion: webPkg.version,
    stateVersion: createInitialState().version,
    seed: session.seed,
    commandLog: session.commandLog,
    perf: session.perf,
    error: error === undefined ? null : asErrorInfo(error),
    userAgent: typeof navigator === 'undefined' ? 'desconocido' : navigator.userAgent,
    generatedAt: new Date().toISOString(),
  }
}

/** Construye el reporte y, si hay DOM, lo descarga como JSON. */
export function exportBugReport(error?: unknown): BugReport {
  const report = buildBugReport(error)
  const doc = (globalThis as unknown as { document?: DocumentLike }).document
  if (doc !== undefined && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = doc.createElement('a')
    anchor.href = url
    anchor.download = `liga-pkm-bug-report-${report.generatedAt}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return report
}
