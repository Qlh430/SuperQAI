import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ScriptProduction from './pages/script-production.tsx'
import { PageBoundary } from './components/page-boundary.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Neon workbench root is missing.')
createRoot(rootElement).render(
  <StrictMode>
    <PageBoundary fullScreen onRetry={() => location.reload()}>
      {new URLSearchParams(location.search).get('workspace') === 'script' ? <ScriptProduction /> : <App />}
    </PageBoundary>
  </StrictMode>,
)
