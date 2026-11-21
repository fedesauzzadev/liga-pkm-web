// models-export (SPEC-K/T-070c/AC-3): arma el JSON del manifiesto con los
// cambios hechos en la galería /dev/models (status aprobado/rechazado y
// cambios de kind). Puro (sin DOM): lo usa ModelsDemo para el download y es
// testeable en node. T-091/AC-5: preserva `newModels` intacto (lo exporta el
// panel NewModelsPanel hacia placements.json).
import type { ModelKind, ModelStatus } from '@liga/content'
import { MODEL_TARGET_HEIGHTS } from '@liga/content'

export type GalleryEdits = Readonly<Record<string, { status?: ModelStatus; kind?: ModelKind | null }>>

export function buildManifestExport(
  source: unknown,
  edits: GalleryEdits,
): string {
  const next = JSON.parse(JSON.stringify(source)) as {
    kinds: Record<string, { targetHeight: number; candidates: unknown[] }>
    hgss: Record<string, { files: { entry: string; status: ModelStatus }[] }>
    unclassified: { pack: string; file: string }[]
  }
  const editOf = (key: string): { status?: ModelStatus; kind?: ModelKind | null } | undefined => edits[key]
  for (const [kind, entry] of Object.entries(next.kinds)) {
    const moved = entry.candidates.filter((candidate) => {
      const c = candidate as { pack: string; file: string }
      const edit = editOf(`${c.pack}::${c.file}`)
      return edit?.kind !== undefined && edit.kind !== null && edit.kind !== kind
    }) as { pack: string; file: string; weight: number; rotY: number; status: ModelStatus }[]
    entry.candidates = entry.candidates.filter((candidate) => {
      const c = candidate as { pack: string; file: string }
      const edit = editOf(`${c.pack}::${c.file}`)
      return !(edit?.kind !== undefined && edit.kind !== null && edit.kind !== kind)
    })
    for (const candidate of entry.candidates as { pack: string; file: string; status: ModelStatus }[]) {
      const edit = editOf(`${candidate.pack}::${candidate.file}`)
      if (edit?.status !== undefined) candidate.status = edit.status
    }
    for (const candidate of moved) {
      const target = editOf(`${candidate.pack}::${candidate.file}`)?.kind
      if (target === undefined || target === null) continue
      const bucket = (next.kinds[target] ??= { targetHeight: MODEL_TARGET_HEIGHTS[target], candidates: [] })
      bucket.candidates.push({ ...candidate, targetHeight: MODEL_TARGET_HEIGHTS[target], status: editOf(`${candidate.pack}::${candidate.file}`)?.status ?? candidate.status })
    }
  }
  next.unclassified = next.unclassified.filter((entry) => edits[`${entry.pack}::${entry.file}`]?.kind === undefined)
  for (const [key, edit] of Object.entries(edits)) {
    if (edit?.kind === undefined || edit.kind === null) continue
    const separator = key.indexOf('::')
    const pack = key.slice(0, separator)
    const file = key.slice(separator + 2)
    if (next.kinds[edit.kind]?.candidates.some((candidate) => (candidate as { file: string }).file === file)) continue
    next.kinds[edit.kind]!.candidates.push({
      pack, file, weight: 1, targetHeight: MODEL_TARGET_HEIGHTS[edit.kind], rotY: 0, status: edit.status ?? 'proposed',
      options: { ignoreTextures: false, keepOriginalMaterial: false },
    })
  }
  for (const group of Object.values(next.hgss)) {
    for (const file of group.files) {
      const edit = edits[`hgss::${file.entry}`]
      if (edit?.status !== undefined) file.status = edit.status
    }
  }
  return `${JSON.stringify(next, null, 1)}\n`
}
