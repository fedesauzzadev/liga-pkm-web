import { Suspense, lazy } from 'react'
import { DebugPanel } from './debug/DebugPanel'
import { GameApp } from './game/GameApp'
import { es } from './i18n/es'
import styles from './App.module.css'

// Demo del spike de animaciones (SPEC-D/T-032c0): carga perezosa, fuera del bundle
// inicial (ENGINEERING-STANDARDS §3: `import()` para dev).
const FxDemo = lazy(async () => ({ default: (await import('./dev/FxDemo')).FxDemo }))

// Galería de íconos de energía (SPEC-F/T-047/AC-5): carga perezosa como /dev/fx.
const IconsDemo = lazy(async () => ({ default: (await import('./dev/IconsDemo')).IconsDemo }))

// Galería de modelos 3D (SPEC-K/T-070c): solo dev, carga perezosa.
const ModelsDemo = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('./dev/ModelsDemo')).ModelsDemo }))
  : null

// Chequeo de brillo de modelos (T-086/AC-4): solo dev, carga perezosa.
const ModelsCheck = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('./dev/ModelsCheck')).ModelsCheck }))
  : null

// Herramienta de cartas (SPEC-E/T-040/AC-3): SOLO dev. En el build de producción
// `import.meta.env.DEV` es false ⇒ el import dinámico muere y el chunk no se emite.
const CardsAdmin = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('./admin/CardsAdmin')).CardsAdmin }))
  : null

// Ediciones de la casa (SPEC-F/T-048/AC-4): panel junto a la herramienta,
// también solo dev y fuera del bundle de producción.
const HouseEditsPanel = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('./admin/HouseEditsPanel')).HouseEditsPanel }))
  : null

const debugEnabled = (): boolean =>
  typeof window !== 'undefined' && window.location.search.includes('debug=1')

const isDevFx = (): boolean =>
  typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/dev/fx'

const isDevIcons = (): boolean =>
  typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/dev/icons'

const isDevModels = (): boolean =>
  typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/dev/models'

const isDevModelsCheck = (): boolean =>
  typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/dev/models-check'

const isAdminCards = (): boolean =>
  typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/admin/cards'

// Shell fino: el flujo de partida (título/setup/juego, guardado, ajustes) vive
// en GameApp (SPEC-D/T-034); acá quedan las rutas /dev/fx, /dev/icons y
// /admin/cards (dev) y el panel de debug.
export function App() {
  if (isAdminCards()) {
    if (CardsAdmin === null) {
      return (
        <main className={styles.shell}>
          <p className={styles.subtitle}>{es.adminProdUnavailable}</p>
        </main>
      )
    }
    return (
      <Suspense fallback={<p className={styles.subtitle}>{es.loading}</p>}>
        <CardsAdmin />
        {HouseEditsPanel !== null ? <HouseEditsPanel /> : null}
      </Suspense>
    )
  }

  if (isDevFx()) {
    return (
      <Suspense fallback={<p className={styles.subtitle}>{es.loading}</p>}>
        <FxDemo />
      </Suspense>
    )
  }

  if (isDevIcons()) {
    return (
      <Suspense fallback={<p className={styles.subtitle}>{es.loading}</p>}>
        <IconsDemo />
      </Suspense>
    )
  }

  if (isDevModels()) {
    if (ModelsDemo === null) {
      return (
        <main className={styles.shell}>
          <p className={styles.subtitle}>{es.modelsProdUnavailable}</p>
        </main>
      )
    }
    return (
      <Suspense fallback={<p className={styles.subtitle}>{es.loading}</p>}>
        <ModelsDemo />
      </Suspense>
    )
  }

  if (isDevModelsCheck()) {
    if (ModelsCheck === null) {
      return (
        <main className={styles.shell}>
          <p className={styles.subtitle}>{es.modelsProdUnavailable}</p>
        </main>
      )
    }
    return (
      <Suspense fallback={<p className={styles.subtitle}>{es.loading}</p>}>
        <ModelsCheck />
      </Suspense>
    )
  }

  return (
    <main className={styles.shell}>
      <GameApp />
      {debugEnabled() ? <DebugPanel /> : null}
    </main>
  )
}
