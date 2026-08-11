import { HardDrive } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { STORAGE_ERROR_EVENT, storageInfo, storageReadFailed } from '../persist'

/**
 * Warnstreifen für die Ablage — sichtbar, BEVOR etwas verloren geht.
 *
 * Vor dem Umzug nach IndexedDB scheiterte das Speichern bei vollem
 * localStorage stillschweigend: Die App lief weiter, verlor aber ab da
 * jede Änderung beim nächsten Neuladen. Jetzt gilt:
 *
 *  1. Schlägt ein Speichervorgang fehl, erscheint sofort ein roter
 *     Streifen — der Zustand lebt dann nur noch in dieser Sitzung.
 *  2. Ist die zugeteilte Ablage zu über 85 % belegt, warnt ein gelber
 *     Streifen, solange noch alles funktioniert.
 *  3. Konnte der gespeicherte Bestand beim Start gar nicht GELESEN werden,
 *     läuft die App auf den Seed-Daten an — sie sieht dann leer aus,
 *     obwohl womöglich alles noch da ist. In dem Fall wird nichts
 *     gespeichert (siehe persist.ts), und der Streifen sagt, dass die App
 *     neu geladen werden muss. Vorher fiel das erst auf, wenn der eigene
 *     Bestand bereits überschrieben war.
 */
const WARN_SHARE = 0.85
const CHECK_MS = 5 * 60_000

export function StorageBanner() {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const [unreadable] = useState(() => storageReadFailed())
  const [nearlyFull, setNearlyFull] = useState(false)

  useEffect(() => {
    const onError = () => setFailed(true)
    window.addEventListener(STORAGE_ERROR_EVENT, onError)
    let stop = false
    const check = () =>
      storageInfo().then((info) => {
        if (!stop && info && info.quota > 0) setNearlyFull(info.usage / info.quota > WARN_SHARE)
      })
    check()
    const iv = setInterval(check, CHECK_MS)
    return () => {
      stop = true
      window.removeEventListener(STORAGE_ERROR_EVENT, onError)
      clearInterval(iv)
    }
  }, [])

  if (!failed && !nearlyFull && !unreadable) return null

  return (
    <div
      role="alert"
      className={`above-sandbox fixed inset-x-0 z-40 mx-3 flex items-center justify-center gap-2.5 rounded-2xl px-4 py-2.5 text-[13.5px] font-medium shadow-soft print:hidden ${
        failed || unreadable ? 'bg-danger text-white' : 'bg-wait text-waitInk'
      }`}
    >
      <HardDrive size={16} className="shrink-0" />
      <span>{unreadable ? t('common.storageUnreadable') : failed ? t('common.storageError') : t('common.storageAlmostFull')}</span>
    </div>
  )
}
