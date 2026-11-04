import { ShieldAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { navigate } from '../router'
import { streifenMeldungen } from '../selbsttest'
import { laufMerken, selbsttestAusfuehren, startPruefungFaellig } from '../selbsttestGeraet'
import { useStore } from '../store'

/**
 * Kurz-Check beim Start: einmal je Kalendertag und Gerät, ein paar Sekunden
 * nach dem Laden (nicht im Weg des ersten Handgriffs), ohne DocCheck (zieht
 * pdf.js nach). Gemeldet werden nur FEHLER — eine falsch gehende Uhr vor dem
 * Unterschreiben, eine Ablage, die nicht schreibt, ein Offline-Cache mit
 * Lücken. Hinweise stehen auf der Seite, nicht in jedem Arbeitsgang.
 *
 * Liegt im Stapel unten (App.tsx) wie jeder andere Streifen — sonst
 * verdeckte er die Formularleiste (CLAUDE.md).
 */
export const START_VERZOEGERUNG_MS = 8000

export function SelbsttestWaechter({ aktiv = true, verzoegerungMs = START_VERZOEGERUNG_MS }: { aktiv?: boolean; verzoegerungMs?: number }) {
  const { t } = useTranslation()
  const { state, currentUser } = useStore()
  const [meldung, setMeldung] = useState<'geraet' | 'daten' | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const nutzerId = currentUser?.id ?? null
  const darfDaten = currentUser?.role === 'superadmin'

  useEffect(() => {
    setMeldung(null)
    if (!aktiv || !nutzerId || !startPruefungFaellig(Date.now())) return
    let stop = false
    const uhr = setTimeout(() => {
      const jetzt = Date.now()
      void selbsttestAusfuehren({ state: stateRef.current, jetzt, daten: darfDaten, docCheck: false }).then((es) => {
        if (stop) return
        laufMerken(es, jetzt)
        const m = streifenMeldungen(es, darfDaten)
        if (m.length) setMeldung(m.some((e) => e.gruppe === 'geraet') ? 'geraet' : 'daten')
      })
    }, verzoegerungMs)
    return () => {
      stop = true
      clearTimeout(uhr)
    }
  }, [aktiv, nutzerId, darfDaten, verzoegerungMs])

  if (!meldung) return null
  return (
    <div role="alert" className="pointer-events-auto flex w-full max-w-lg items-center gap-2.5 rounded-2xl bg-danger px-4 py-2 text-small font-medium text-white shadow-soft">
      <ShieldAlert size={16} className="shrink-0" aria-hidden />
      <span className="flex-1">{t(meldung === 'geraet' ? 'selbsttest.streifenGeraet' : 'selbsttest.streifenDaten')}</span>
      <button
        onClick={() => {
          setMeldung(null)
          navigate('/selbsttest')
        }}
        className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold underline underline-offset-2"
      >
        {t('selbsttest.streifenAnsehen')}
      </button>
      <button onClick={() => setMeldung(null)} aria-label={t('selbsttest.streifenSchliessen')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full">
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
