import { CloudOff, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'

/**
 * Offline-Betrieb: Im Simulator und in Hangars gibt es regelmäßig kein Netz.
 * Die App läuft dort weiter (Service Worker liefert sie aus dem Cache, die
 * Daten liegen lokal) — nur der Versand kann nicht stattfinden.
 *
 * Zwei Dinge macht dieser Streifen sichtbar:
 *  1. dass gerade kein Netz da ist — sonst wirkt der ausbleibende Versand
 *     wie ein Fehler der App,
 *  2. wie viele Formulare im Ausgangskorb liegen und automatisch rausgehen,
 *     sobald wieder Empfang da ist.
 *
 * Der Versand wird auch bei Rückkehr des Netzes nicht dem Zufall überlassen:
 * neben dem online-Ereignis wird beim Sichtbarwerden der App geprüft. Wer
 * das Gerät im Flugmodus einsteckt und später aufweckt, bekommt sonst kein
 * online-Ereignis zu sehen.
 */
export function OfflineBanner() {
  const { t } = useTranslation()
  const { state, flushOutbox } = useStore()
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const queued = state.gradingRecords.filter((r) => r.mailStatus === 'queued').length

  useEffect(() => {
    const sync = () => {
      const up = navigator.onLine !== false
      setOnline(up)
      if (up) flushOutbox()
    }
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    document.addEventListener('visibilitychange', sync)
    // Beim Start ebenfalls prüfen: die App kann geschlossen worden sein,
    // während noch etwas im Ausgangskorb lag.
    sync()
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [flushOutbox])

  // Online und nichts offen: kein Streifen. Online mit Rest im Korb kann
  // nur kurz auftreten (Versand läuft) — dann zeigt der Streifen das an.
  if (online && queued === 0) return null

  return (
    <div
      role="status"
      className={`above-sandbox fixed inset-x-0 z-40 mx-3 flex items-center justify-center gap-2.5 rounded-2xl px-4 py-2.5 text-[13.5px] font-medium shadow-soft print:hidden ${
        online ? 'bg-ok text-ok-ink' : 'bg-wait text-wait-ink'
      }`}
    >
      {online ? <UploadCloud size={16} className="shrink-0" /> : <CloudOff size={16} className="shrink-0" />}
      <span>{online ? t('common.outboxSending', { count: queued }) : t('common.offline')}</span>
      {!online && queued > 0 && <span className="opacity-90">· {t('common.outboxQueued', { count: queued })}</span>}
    </div>
  )
}
