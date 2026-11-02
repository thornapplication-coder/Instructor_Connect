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

export function UpdateBanner({ neuLaden = () => window.location.reload() }: { neuLaden?: () => void } = {}) {
  const { t } = useTranslation()
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  // true, sobald die Übernahme angestoßen ist — dann darf neu geladen werden
  const tookOver = useRef(false)
  // Erstinstallation: Vor der Registrierung gibt es keinen Controller — der
  // erste `controllerchange` ist dann kein Update und darf nichts neu laden.
  const erstinstallation = useRef(!navigator.serviceWorker?.controller)
  /*
   * Ein ANDERER Tab hat die neue Version übernommen, dieser lud wegen
   * offener Arbeit nicht nach (Audit 11/2026, TEC-02: DocCheck-Sitzung).
   * Dann gibt es keinen wartenden Worker mehr — „Jetzt aktualisieren" muss
   * selbst neu laden, und sobald die Arbeit erledigt ist, tut es der
   * Nachzug-Timer. Vorher schickte der Knopf SKIP_WAITING an einen längst
   * aktiven Worker, und nichts geschah.
   */
  const [nachzuladen, setNachzuladen] = useState(false)
  const nachzuladenRef = useRef(false)

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
       * bleibt der Streifen stehen, und das Neuladen folgt, sobald die
       * Arbeit gesichert oder verworfen ist.
       */
      if (tookOver.current) {
        neuLaden()
        return
      }
      if (erstinstallation.current) {
        /*
         * Nur der ERSTE Wechsel ist die Installation; jeder weitere ist ein
         * Update. Vorher blieb die Marke stehen: Wer die App zum ersten Mal
         * öffnete und den Tab offen ließ, überging jede spätere Übernahme
         * aus einem anderen Tab — der Streifen versprach „wird automatisch
         * geladen", und „Jetzt aktualisieren" schickte SKIP_WAITING an einen
         * längst aktiven Worker (Gegenprüfung P3, im Browser nachgestellt).
         */
        erstinstallation.current = false
        return
      }
      if (!hasUnsavedWork()) {
        neuLaden()
        return
      }
      nachzuladenRef.current = true
      setNachzuladen(true)
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
          if (tookOver.current || (!reg.waiting && !nachzuladenRef.current)) return
          if (hasUnsavedWork()) {
            seenSince = 0
            return
          }
          const now = performance.now()
          if (seenSince === 0) seenSince = now
          else if (now - seenSince >= AUTO_APPLY_MS) {
            // Schon übernommen (anderer Tab): nur noch nachladen.
            if (nachzuladenRef.current) {
              tookOver.current = true
              neuLaden()
            } else if (reg.waiting) takeOver(reg.waiting)
          }
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
    // neuLaden bewusst nicht in den Abhängigkeiten: Die Registrierung läuft
    // genau einmal, ein neuer Funktionswert darf sie nicht wiederholen.
  }, [])

  if (!waiting && !nachzuladen) return null
  /*
   * Zwei Lagen, zwei Streifen. Wartet die neue Version nur, läuft dieser Tab
   * heil weiter — der blaue Hinweis genügt, das Laden kommt von selbst.
   * Hat dagegen ein ANDERER Tab übernommen, läuft dieser mit altem Code
   * unter dem neuen Worker: Dessen `activate` hat den alten Cache gelöscht,
   * und eine Datei, die erst jetzt nachgeladen wird (etwa die Bibliothek
   * eines Exports), gibt es unter ihrem alten Namen vielleicht nirgends
   * mehr. „Wird automatisch geladen" stimmte dort auch nicht — die offene
   * Arbeit hält das Neuladen ja gerade auf. Deshalb mahnt der Streifen dann
   * in der Wartefarbe und sagt, was zu tun ist (Gegenprüfung zu TEC-02).
   */
  const veraltet = nachzuladen
  // Unten statt oben: am iPhone verdeckt die Dynamic Island sonst den
  // Aktualisieren-Knopf. Sitzt über der Sandbox-Leiste.
  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-lg items-center justify-center gap-3 rounded-2xl px-4 py-3 shadow-soft ${
        veraltet ? 'bg-wait text-small font-medium text-waitInk' : 'bg-accent text-body font-semibold text-bg'
      }`}
    >
      <RefreshCw size={16} className="shrink-0" />
      <span>{t(veraltet ? 'common.updateStale' : 'common.updateAvailable')}</span>
      <button
        onClick={() => {
          tookOver.current = true
          if (nachzuladenRef.current || !waiting) neuLaden()
          else waiting.postMessage({ type: 'SKIP_WAITING' })
        }}
        // Veraltet: der Knopf als volle Gegenfläche — er ist dann der
        // eigentliche Ausweg, nicht nur eine Abkürzung.
        className={`min-h-11 shrink-0 rounded-full px-4 py-1.5 transition ${veraltet ? 'bg-waitInk font-semibold text-wait hover:bg-waitInk/90' : 'bg-bg/25 hover:bg-bg/35'}`}
      >
        {t('common.updateNow')}
      </button>
    </div>
  )
}
