import { Suspense, lazy } from 'react'
import { es } from './i18n/es'
import { DebugPanel } from './debug/DebugPanel'
import styles from './App.module.css'

// Demo del spike de animaciones (SPEC-D/T-032c0): carga perezosa, fuera del bundle
// inicial (ENGINEERING-STANDARDS §3: `import()` para dev).
const FxDemo = lazy(async () => ({ default: (await import('./dev/FxDemo')).FxDemo }))

// `?debug=1` activa el panel mínimo de debug (SPEC-A/T-006/AC-8).
// Guard de `window` para poder renderizar la App en Node (App.test.tsx).
const debugEnabled = (): boolean =>
  typeof window !== 'undefined' && window.location.search.includes('debug=1')

const isDevFx = (): boolean =>
  typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/dev/fx'

export function App() {
  if (isDevFx()) {
    return (
      <Suspense fallback={<p className={styles.subtitle}>{es.loading}</p>}>
        <FxDemo />
      </Suspense>
    )
  }
  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>{es.appTitle}</h1>
      <p className={styles.subtitle}>{es.appSubtitle}</p>
      {debugEnabled() ? <DebugPanel /> : null}
    </main>
  )
}
