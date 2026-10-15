import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Archivo empaquetada, no desde Google Fonts: el stack corre en una LAN que
// puede no tener salida a internet, y ahí la tipografía se caería a la del
// sistema y la app dejaría de parecerse al portal.
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/archivo/800.css'

// La base compartida vive en Rivara-Intranet (src/rivara-ui.css) y se copia
// acá tal cual. No se edita en esta app.
import './rivara-ui.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
