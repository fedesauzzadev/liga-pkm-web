// Registro de resolución de los modelos nuevos (SPEC-O/T-094/AC-3): un estado
// por kind (gym/pokecenter/market/league) que explica QUÉ se está usando —
// modelo nuevo ✔ o fallback procedural ✖ con motivo. El registro dispara un
// único console.warn por kind caído, alimenta window.__debug.modelsReport() y
// la insignia `?debug=1` (data-testid="debug-models"). Puro, sin three.
import { NEW_MODEL_KINDS, type NewModelKind } from '@liga/content'

/** Motivos de fallback del spec (AC-3) + presupuesto agotado (honestidad). */
export type ModelsReportReason =
  | 'no encontrado'
  | 'error de carga'
  | 'falló chequeo'
  | 'rechazado'
  | 'sin presupuesto'

export interface ModelsReportEntry {
  readonly kind: NewModelKind
  /** true ⇒ el modelo nuevo está en escena. */
  readonly ok: boolean
  /** Archivo en uso (p. ej. "gim.glb"); null si no hay. */
  readonly file: string | null
  /** Motivo del fallback; null si ok o aún pendiente. */
  readonly reason: ModelsReportReason | null
  /** Detalle técnico (mensaje del error, URL, presupuesto). */
  readonly detail: string | null
}

type Listener = () => void

const isModelKind = (kind: string): kind is NewModelKind =>
  (NEW_MODEL_KINDS as readonly string[]).includes(kind)

/** Estado por kind: arranca pendiente (la carga es por cercanía de cámara). */
const entries = new Map<NewModelKind, ModelsReportEntry>(
  NEW_MODEL_KINDS.map((kind) => [kind, { kind, ok: false, file: null, reason: null, detail: null }]),
)
const listeners = new Set<Listener>()
const warned = new Set<NewModelKind>()

const emit = (): void => {
  for (const listener of listeners) listener()
}

/** Registra una resolución exitosa (el primer evento por kind es definitivo). */
export function registerModelResolved(kind: string, file: string): void {
  if (!isModelKind(kind)) return
  const current = entries.get(kind)
  // Ya decidido (✔ o ✖): el primer evento queda (AC-3: "se registra una vez").
  if (current !== undefined && (current.ok || current.reason !== null)) return
  entries.set(kind, { kind, ok: true, file, reason: null, detail: null })
  emit()
}

/** Registra un fallback procedural: UN console.warn por kind (AC-3). */
export function registerModelFallback(
  kind: string,
  reason: ModelsReportReason,
  detail?: string,
): void {
  if (!isModelKind(kind)) return
  const current = entries.get(kind)
  if (current !== undefined && current.ok) return
  entries.set(kind, { kind, ok: false, file: null, reason, detail: detail ?? null })
  if (!warned.has(kind)) {
    warned.add(kind)
    console.warn(`[models] ${kind} ✖ procedural: ${reason}${detail === undefined ? '' : ` (${detail})`}`)
  }
  emit()
}

export function modelsReportEntries(): readonly ModelsReportEntry[] {
  return NEW_MODEL_KINDS.map((kind) => entries.get(kind)!)
}

/** Línea de la insignia (AC-3): `gym ✔ gim.glb` / `pokecenter ✖ procedural: <motivo>`. */
export function reportLineOf(entry: ModelsReportEntry): string {
  if (entry.ok) return `${entry.kind} ✔ ${entry.file ?? '?'}`
  if (entry.reason === null) return `${entry.kind} · pendiente`
  return `${entry.kind} ✖ procedural: ${entry.reason}`
}

export function subscribeModelsReport(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Solo tests: vuelve al estado inicial (todo pendiente, sin warns). */
export function resetModelsReport(): void {
  for (const kind of NEW_MODEL_KINDS) {
    entries.set(kind, { kind, ok: false, file: null, reason: null, detail: null })
  }
  warned.clear()
  emit()
}
