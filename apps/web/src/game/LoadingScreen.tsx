/* pantalla-carga-tablero: overlay a pantalla completa que tapa el tablero/HUD
   mientras el tablero termina de renderizar (imagen fullhd + texto i18n +
   spinner CSS puro). La salida es un fade corto puramente cosmético: ningún
   resultado del juego depende de la animación (Animación ≠ lógica). */
/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import loadingBg from '../../../../content/loading/loading fullhd.jpg'
import { es } from '../i18n/es'
import styles from './loading.module.css'

export interface LoadingScreenProps {
  /** AC-3: fase de salida — funde a opacidad 0 hasta que PlayScreen lo desmonta. */
  readonly leaving?: boolean
}

export function LoadingScreen({ leaving = false }: LoadingScreenProps): ReactNode {
  const rootClass = leaving ? `${styles.root} ${styles.leaving}` : styles.root
  return (
    <div
      className={rootClass}
      data-testid="loading-screen"
      data-leaving={leaving ? 'true' : undefined}
      role="status"
      aria-live="polite"
      aria-label={es.loading}
    >
      <img className={styles.bg} src={loadingBg} alt="" aria-hidden="true" draggable={false} />
      <div className={styles.center}>
        <span className={styles.spinner} data-testid="loading-spinner" aria-hidden="true" />
        <p className={styles.text} data-testid="loading-text">
          {es.loading}
        </p>
      </div>
    </div>
  )
}
