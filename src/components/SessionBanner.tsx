import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'

/**
 * Die Anmeldung ist abgelaufen, aber es ist noch Arbeit offen.
 *
 * Vorher warf der Takt um Mitternacht ohne Rückfrage aus dem offenen
 * Formular — die geleisteten Unterschriften waren weg (Audit 11/2026,
 * TEC-04). Jetzt bleibt die Sitzung, bis die Arbeit gesichert oder
 * verworfen ist (höchstens die Nachfrist aus sitzungsablauf.ts), und dieser
 * Streifen sagt, warum gleich die Anmeldung kommt.
 */
export function SessionBanner() {
  const { t } = useTranslation()
  const { sessionExpired } = useStore()
  if (!sessionExpired) return null
  return (
    <div role="alert" className="pointer-events-auto flex w-full max-w-lg items-center justify-center gap-2.5 rounded-2xl bg-wait px-4 py-2.5 text-small font-medium text-waitInk shadow-soft">
      <Clock size={16} className="shrink-0" />
      <span>{t('common.sessionExpired')}</span>
    </div>
  )
}
