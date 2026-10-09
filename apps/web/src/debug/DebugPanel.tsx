import { es } from '../i18n/es'
import { buildBugReport, exportBugReport } from './bugReport'
import { readDebugSession } from './session'
import styles from './debug.module.css'

// Panel mínimo para `?debug=1` (SPEC-A/T-006/AC-8): versión, semilla y
// comandos de la sesión. El panel completo (estado + últimos eventos) es T-030.
export function DebugPanel() {
  const session = readDebugSession()
  const info = buildBugReport()
  return (
    <aside className={styles.panel} data-testid="debug-panel">
      <h2 className={styles.panelTitle}>{es.debugTitle}</h2>
      <dl className={styles.facts}>
        <dt>{es.debugVersion}</dt>
        <dd>{info.appVersion}</dd>
        <dt>{es.debugSeed}</dt>
        <dd>{session.seed === null ? '—' : String(session.seed)}</dd>
        <dt>{es.debugCommands}</dt>
        <dd>{session.commandLog.length}</dd>
      </dl>
      <button type="button" className={styles.button} onClick={() => exportBugReport()}>
        {es.exportReport}
      </button>
    </aside>
  )
}
