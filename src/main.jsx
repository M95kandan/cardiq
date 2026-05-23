import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CardIQ from './components/CardIQ.jsx'
import AuthGate from './components/AuthGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <CardIQ />
    </AuthGate>
  </StrictMode>,
)
