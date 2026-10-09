import { Component, type ErrorInfo, type ReactNode } from 'react'
import { es } from '../i18n/es'
import { exportBugReport } from './bugReport'
import styles from './debug.module.css'

interface ErrorBoundaryProps {
  readonly children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

// ErrorBoundary genérico del shell (SPEC-A/T-006/AC-8): un error nunca deja la
// pantalla en blanco; ofrece Reintentar y Exportar reporte.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // El reporte se exporta a pedido del jugador; acá no imprimimos nada.
  }

  private readonly retry = (): void => {
    this.setState({ error: null })
  }

  private readonly exportReport = (): void => {
    if (this.state.error !== null) exportBugReport(this.state.error)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error !== null) {
      return (
        <main className={styles.boundary} role="alert">
          <h1 className={styles.title}>{es.errorTitle}</h1>
          <p className={styles.message}>{error.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={this.retry}>
              {es.retry}
            </button>
            <button type="button" className={styles.button} onClick={this.exportReport}>
              {es.exportReport}
            </button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
