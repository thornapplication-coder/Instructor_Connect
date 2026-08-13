import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasUnsavedWork } from '../editGuard'

/**
 * Registriert den Service Worker (Offline-Start) und hält die App aktuell.
 *
 * Sobald eine neue Version bereitsteht, erscheint unten SICHTBAR ein
 * Streifen „Neue Version verfügbar" — damit man sieht, dass sich etwas
 * ändert, und an der Versionsnummer erkennt, womit man arbeitet. Die
 * Übernahme läuft dann AUTOMATISCH: nach ein paar Sekunden lädt die App
 * von selbst neu. Der Knopf „Jetzt aktualisieren" macht es sofort, ist
 * aber nie nötig.
 *
 * Wer gerade etwas ausfüllt, wird nicht unterbrochen: der Streifen bleibt
 * stehen, die Übernahme wartet, bis die Arbeit gesichert oder verworfen
 * ist (editGuard) — dann geschieht sie ebenfalls von selbst.
 *
 * Auf neue Versionen wird aktiv geprüft: beim Start, jede Minute und immer,
 * wenn die App den Fokus bekommt oder wieder sichtbar wird.
 */

// Kurze Anzeigezeit, bevor die App selbsttätig neu lädt — lang genug, um
// den Streifen wahrzunehmen, kurz genug, um nicht im Weg zu stehen.
const AUTO_APPLY_MS = 5000

export function UpdateBanner() {
  const { t } = useTranslation()
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  // true, sobald die Übernahme angestoßen ist — dann darf neu geladen werden
  const tookOver = useRef(false)
  // Erstinstallation: Vor der Registrierung gibt es keinen Controller — der
  // erste `controllerchange` ist dann kein Update und darf nichts neu laden.
  const erstinstallation = useRef(!navigator.serviceWorker?.controller)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cleanup: (() => void) | undefined

    // Die wartende Version übernehmen (Neustart folgt über controllerchange).
    const takeOver = (sw: ServiceWorker) => {
      tookOver.current = true
      sw.postMessage({ type: 'SKIP_WAITING' })
    }

    // Neue Version gefunden: Streifen zeigen. Die eigentliche Übernahme
    // besorgt der Nachzug-Timer unten — sobald keine Arbeit offen ist.
    const announce = (sw: ServiceWorker) => setWaiting(sw)

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      /*
       * Neu laden, sobald die neue Version uebernommen hat — auch dann, wenn
       * die Uebernahme aus einem ANDEREN Tab kam.
       *
       * Bisher lud nur der Tab neu, der sie angestossen hatte. Die uebrigen
       * liefen mit altem Code unter dem neuen Worker weiter, dessen
       * `activate` ihre Caches bereits geloescht hat — jede Datei, die sie
       * spaeter nachfordern, ist auf dem Server laengst ersetzt. Ein solcher
       * Tab ist ein Zombie.
       *
       * Bei der ERSTINSTALLATION (vorher gab es keinen Controller) wird
       * nicht neu geladen, und offene Arbeit wird nicht weggeworfen: Dann
       * bleibt der Streifen stehen und der Nutzer entscheidet.
       */
      if (tookOver.current) {
        window.location.reload()
        return
      }
      if (erstinstallation.current) return
      if (!hasUnsavedWork()) window.location.reload()
    })

    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js')
      .then((reg) => {
        // Neue Version wartet bereits (App war lange geöffnet)
        if (reg.waiting) announce(reg.waiting)
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) announce(nw)
          })
        })

        // Aktive Update-Prüfung: Intervall + Fokus + Sichtbarkeit
        const check = () => reg.update().catch(() => {})
        const iv = setInterval(check, 60_000)
        // Automatische Übernahme: sobald eine Version wartet und nichts mehr
        // in Bearbeitung ist, wird sie nach kurzer Sichtzeit selbst geladen.
        // Läuft im 1-Sekunden-Takt, damit die Sichtzeit verlässlich greift.
        let seenSince = 0
        const auto = setInterval(() => {
          if (!reg.waiting || tookOver.current) return
          if (hasUnsavedWork()) {
            seenSince = 0
            return
          }
          const now = performance.now()
          if (seenSince === 0) seenSince = now
          else if (now - seenSince >= AUTO_APPLY_MS) takeOver(reg.waiting)
        }, 1000)
        const onVisible = () => {
          if (document.visibilityState === 'visible') check()
        }
        window.addEventListener('focus', check)
        document.addEventListener('visibilitychange', onVisible)
        cleanup = () => {
          clearInterval(iv)
          clearInterval(auto)
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
    <div className="above-sandbox fixed inset-x-0 z-50 mx-3 flex items-center justify-center gap-3 rounded-2xl bg-accent px-4 py-3 text-body font-semibold text-bg shadow-soft">
      <RefreshCw size={16} className="shrink-0" />
      <span>{t('common.updateAvailable')}</span>
      <button
        onClick={() => {
          tookOver.current = true
          waiting.postMessage({ type: 'SKIP_WAITING' })
        }}
        className="min-h-11 rounded-full bg-bg/25 px-4 py-1.5 transition hover:bg-bg/35"
      >
        {t('common.updateNow')}
      </button>
    </div>
  )
}
