import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './components/ui'
import { preloadPersistedState } from './persist'
import './i18n'
import './index.css'

initTheme()

// Der Zustand liegt in IndexedDB und wird VOR dem ersten Render geladen —
// so bleibt der Store synchron lesbar (siehe persist.ts). Die Wartezeit ist
// ein einzelner Schlüsselzugriff, kein spürbarer Startaufschub.
preloadPersistedState().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
