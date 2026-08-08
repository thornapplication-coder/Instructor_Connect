import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Registriert den Service Worker (Offline-Start) und zeigt einen Banner,
 * sobald eine neue Version bereitsteht. Erst der Tipp auf „Aktualisieren“
 * aktiviert sie — kein stiller Neustart mitten in der Nutzung.
 */
export function UpdateBanner() {
  const { t } = useTranslation()
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const clicked = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Nur neu laden, wenn der Nutzer das Update angestoßen hat —
      // sonst würde schon die Erstinstallation die Seite neu laden.
      if (clicked.current) window.location.reload()
    })
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js')
      .then((reg) => {
        // Neue Version wartet bereits (App war lange geöffnet)
        if (reg.waiting) setWaiting(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(nw)
          })
        })
      })
      .catch(() => {
        /* Dev-Server ohne sw.js — Produktion/Preview registriert normal */
      })
  }, [])

  if (!waiting) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-bg shadow-soft">
      <RefreshCw size={15} className="shrink-0" />
      <span>{t('common.updateAvailable')}</span>
      <button
        onClick={() => {
          clicked.current = true
          waiting.postMessage({ type: 'SKIP_WAITING' })
        }}
        className="rounded-full bg-bg/20 px-3.5 py-1 transition hover:bg-bg/30"
      >
        {t('common.updateNow')}
      </button>
    </div>
  )
}
