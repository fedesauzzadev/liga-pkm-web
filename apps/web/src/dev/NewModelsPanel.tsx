// NewModelsPanel (SPEC-N/T-091/AC-5): los 4 modelos nuevos (gim, pokecenter,
// pokemart, league) con su tamaño final en el tablero (máximos heights/
// footprints de placements.json), el ajuste de yawOffsetDeg por kind y la
// exportación de placements.json actualizado. Puro + handlers (renderToString
// seguro). Los sliders viven acá; la galería los recibe como prop para girar
// las tarjetas en vivo.
import { useState, type ReactNode } from 'react'
import { ModelsManifestSchema, NEW_MODEL_KINDS, type NewModelKind } from '@liga/content'
import { es } from '../i18n/es'
import { boardPlacements } from '../board3d/placements'
import placementsJson from '../../../../content/board/placements.json'
import manifestJson from '../../../../content/board/models.manifest.json'
import styles from './models-demo.module.css'

const manifest = ModelsManifestSchema.parse(manifestJson)

export const initialYawOffset = (): Record<NewModelKind, number> => {
  const yaw = {} as Record<NewModelKind, number>
  for (const kind of NEW_MODEL_KINDS) yaw[kind] = boardPlacements.models.yawOffsetDeg[kind] ?? 0
  return yaw
}

/** placements.json completo con los yawOffsetDeg dados (AC-5: exportar). Puro. */
export function buildPlacementsExport(yaw: Readonly<Partial<Record<NewModelKind, number>>>): string {
  const next = JSON.parse(JSON.stringify(placementsJson)) as {
    models: { yawOffsetDeg: Partial<Record<NewModelKind, number>> }
  }
  for (const kind of NEW_MODEL_KINDS) {
    next.models.yawOffsetDeg[kind] = yaw[kind] ?? boardPlacements.models.yawOffsetDeg[kind] ?? 0
  }
  return `${JSON.stringify(next, null, 2)}\n`
}

export function NewModelsPanel(props: {
  readonly yaw: Readonly<Partial<Record<NewModelKind, number>>>
  readonly onYaw: (kind: NewModelKind, value: number) => void
}): ReactNode {
  const [exported, setExported] = useState(false)
  const exportPlacements = (): void => {
    const blob = new Blob([buildPlacementsExport(props.yaw)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'placements.json'
    link.click()
    URL.revokeObjectURL(link.href)
    setExported(true)
  }
  return (
    <section className={styles.newPanel} data-testid="new-models-panel">
      <h2>{es.modelsNewPanelTitle}</h2>
      <p className={styles.hint}>{es.modelsNewPanelHint}</p>
      <ul className={styles.newList}>
        {NEW_MODEL_KINDS.map((kind) => {
          const file = manifest.newModels[kind]
          return (
            <li key={kind} data-new-kind={kind}>
              <strong>{kind}</strong>
              {' · '}
              <code>{file?.file ?? '—'}</code>
              {' · '}
              <span data-testid={`new-size-${kind}`}>
                {`alto ≤ ${String(boardPlacements.heights[kind])} u · huella ≤ ${String(boardPlacements.footprints[kind])} u`}
              </span>
              {' · '}
              <label>
                {es.modelsYawOffset}
                <input
                  type="number"
                  step={1}
                  min={-180}
                  max={180}
                  value={props.yaw[kind] ?? 0}
                  data-testid={`yaw-${kind}`}
                  onChange={(event) => props.onYaw(kind, Number(event.target.value))}
                />
              </label>
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={exportPlacements} data-action="export-placements">
        {es.modelsExportPlacements}
      </button>
      {exported ? <span className={styles.exported}>{es.modelsPlacementsExported}</span> : null}
    </section>
  )
}
