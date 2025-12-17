import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import HeatDiffusionVisualization from './heat_diffusion.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HeatDiffusionVisualization />
  </StrictMode>,
)
