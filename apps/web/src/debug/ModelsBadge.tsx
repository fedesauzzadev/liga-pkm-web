// Insignia de modelos nuevos para `?debug=1` (SPEC-O/T-094/AC-3): una línea
// por kind — `gym ✔ gim.glb` o `pokecenter ✖ procedural: <motivo>` — sobre el
// registro vivo de report.ts (window.__debug.modelsReport expone lo mismo).
import { useSyncExternalStore, type ReactNode } from 'react'
import { es } from '../i18n/es'
import {
  modelsReportEntries, reportLineOf, subscribeModelsReport,
} from '../board3d/models/report'
import styles from './debug.module.css'

export function ModelsBadge(): ReactNode {
  const entries = useSyncExternalStore(subscribeModelsReport, modelsReportEntries, modelsReportEntries)
  return (
    <section className={styles.models} data-testid="debug-models" aria-label={es.debugModelsTitle}>
      <h3 className={styles.panelTitle}>{es.debugModelsTitle}</h3>
      {entries.map((entry) => (
        <p key={entry.kind} className={entry.ok ? styles.modelOk : styles.modelFallback}>
          {reportLineOf(entry)}
        </p>
      ))}
      <p className={styles.modelsHint}>{es.debugModelsHint}</p>
    </section>
  )
}
