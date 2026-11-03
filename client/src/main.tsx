import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ThemeProvider from './contexts/ThemeProvider'
import BrandingProvider from './contexts/BrandingProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandingProvider><ThemeProvider><App /></ThemeProvider></BrandingProvider>
  </StrictMode>,
)
