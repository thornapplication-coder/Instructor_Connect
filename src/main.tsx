import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './components/ui'
import './i18n'
import './index.css'

initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
