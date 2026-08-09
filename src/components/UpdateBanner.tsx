import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Registriert den Service Worker (Offline-Start) und hält die App aktuell.
 *
 * Neue Versionen werden AUTOMATISCH übernommen, sobald das gefahrlos ist:
 * Wer gerade nichts ausfüllt, bekommt sie sofort; wer in einem Formular
 * steckt, sieht den Banner und entscheidet selbst. Sonst könnte ein
 * Update, dessen Knopf man nicht erreicht, die App dauerhaft alt halten.
 *
 * Auf neue Versionen wird AKTIV geprüft: beim Start, dann jede Minute
 * sowie immer, wenn die App den Fokus bekommt oder wieder sichtbar wird.
 */

/** Formulare mit ungesicherter Eingabe — dort wird nie automatisch neu geladen. */
function isEditing(): boolean {
  const h = window.location.hash
  return h.startsWith('#/grading/new') || h.includes('?print=1')
}

export function UpdateBanner() {
  const { t } = useTranslation()
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const clicked = useRef(false)
  // automatische Übernahme läuft — der Neustart darf dann erfolgen
  const tookOver = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cleanup: (() => void) | undefined

    /**
     * Wartende Version übernehmen: außerhalb von Formularen sofort und
     * ohne Zutun, im Formular nur als Banner-Angebot.
     */
    const apply = (sw: ServiceWorker) => {
      if (isEditing()) {
        setWaiting(sw)
        return
      }
      tookOver.current = true
      sw.postMessage({ type: 'SKIP_WAITING' })
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Neu laden, sobald die neue Version übernommen hat — außer bei der
      // Erstinstallation (dann gab es vorher keinen Controller).
      if (clicked.current || tookOver.current) window.location.reload()
    })

    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js')
      .then((reg) => {
        // Neue Version wartet bereits (App war lange geöffnet)
        if (reg.waiting) apply(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) apply(nw)
          })
        })

        // Aktive Update-Prüfung: Intervall + Fokus + Sichtbarkeit
        const check = () => reg.update().catch(() => {})
        const iv = setInterval(check, 60_000)
        const onVisible = () => {
          if (document.visibilityState === 'visible') check()
        }
        window.addEventListener('focus', check)
        document.addEventListener('visibilitychange', onVisible)
        cleanup = () => {
          clearInterval(iv)
          window.removeEventListener('focus', check)
          document.removeEventListener('visibilitychange', onVisible)
        }
      })
      .catch(() => {
        /* Dev-Server ohne sw.js — Produktion/Preview registriert normal */
      })

    return () => cleanup?.()
  }, [])

  if (!waiting) return null
  // Unten statt oben: am iPhone verdeckt die Dynamic Island sonst den
  // Aktualisieren-Knopf. Sitzt über der Sandbox-Leiste.
  return (
    <div className="above-sandbox fixed inset-x-0 z-50 mx-3 flex items-center justify-center gap-3 rounded-2xl bg-accent px-4 py-3 text-[14px] font-semibold text-bg shadow-soft">
      <RefreshCw size={16} className="shrink-0" />
      <span>{t('common.updateAvailable')}</span>
      <button
        onClick={() => {
          clicked.current = true
          waiting.postMessage({ type: 'SKIP_WAITING' })
        }}
        className="rounded-full bg-bg/25 px-4 py-1.5 transition hover:bg-bg/35"
      >
        {t('common.updateNow')}
      </button>
    </div>
  )
}
