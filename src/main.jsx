import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import CardIQ from './components/CardIQ.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CardIQ />
  </StrictMode>,
)
