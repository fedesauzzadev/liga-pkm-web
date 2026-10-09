import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './debug/ErrorBoundary'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('falta #root en index.html')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
