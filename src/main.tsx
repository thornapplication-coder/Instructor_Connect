import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './components/ui'
import { preloadPersistedState } from './persist'
import './i18n'
import './index.css'

initTheme()

// Der Zustand liegt in IndexedDB und wird VOR dem ersten Render geladen —
// so bleibt der Store synchron lesbar (siehe persist.ts). Normal ist das ein
// einzelner Schlüsselzugriff; antwortet IndexedDB nicht, startet die App
// nach der Zeitgrenze trotzdem (LESE_ZEITGRENZE_MS, Warnstreifen statt
// weißer Seite). Die Bitte um dauerhafte Ablage (persist()) hängt hier
// bewusst NICHT mehr dran — Firefox fragt dafür den Nutzer, und solange
// blieb die App leer (Audit 11/2026, TEC-11).
preloadPersistedState().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
