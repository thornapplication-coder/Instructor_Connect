import { Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, inputCls } from '../../../components/ui'
import type { Treffer } from '../search/suche'
import { useSitzung } from '../sitzung'
import { standardVerbindung } from '../verbindung'
import { useViewer } from './Viewer'

/**
 * Suche über alle geladenen Dokumente (Spez. 7.6). Bis der Fragen-Chat
 * kommt (Phase 7), ist sie der Weg, den Index zu prüfen — und die Abnahme
 * von Phase 2 („BATT 1 OFF BUS", „AMC1 ORA.ATO.230") sichtbar zu machen.
 */
export function Suche() {
  const { t } = useTranslation('doccheck')
  const { docs } = useSitzung()
  const oeffnen = useViewer()
  const [q, setQ] = useState('')
  const [treffer, setTreffer] = useState<Treffer[] | null>(null)
  const [gesucht, setGesucht] = useState('')
  const geladen = docs.filter((d) => d.status === 'fertig').length
  // Dasselbe Handbuch kann als Prüf- UND als Sitzungsdokument geladen sein —
  // ohne Herkunft stünden zwei gleich aussehende Treffer untereinander.
  const herkunft = (id: string) => docs.find((d) => d.id === id)?.rolle

  const suchen = async () => {
    const anfrage = q.trim()
    if (!anfrage) return
    setGesucht(anfrage)
    setTreffer((await standardVerbindung().suchen(anfrage)) ?? [])
  }

  return (
    <div className="space-y-stack">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void suchen()
        }}
      >
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('suche.platzhalter')} aria-label={t('suche.titel')} disabled={!geladen} />
        <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={!geladen || !q.trim()}>
          <span className="flex items-center gap-1.5">
            <Search size={16} /> {t('suche.los')}
          </span>
        </Button>
      </form>
      <p className="text-micro text-dim">{geladen ? t('suche.hinweis', { count: geladen }) : t('suche.keineDokumente')}</p>
      {treffer && (
        <div className="space-y-tight" aria-live="polite">
          <p className="text-small font-semibold">{t('suche.ergebnis', { count: treffer.length, q: gesucht })}</p>
          {treffer.map((x) => (
            <button
              key={`${x.docId}-${x.seite}`}
              onClick={() => oeffnen({ docId: x.docId, seite: x.seite, q: gesucht })}
              className="block w-full rounded-xl border border-line/10 p-3 text-left transition hover:border-accent/40 hover:bg-line/5"
            >
              <span className="flex flex-wrap items-center gap-1.5 text-small">
                <span className="font-semibold">{x.docTitle}</span>
                {/* „S. 12" und „ca. 12" sind schon die Seite — „(Seite 12)" daneben wäre doppelt. */}
                <span className="text-dim">· {x.label ? (/^(S\.|ca\.) /.test(x.label) ? x.label : `${x.label} (${t('suche.pdfSeite', { n: x.seite })})`) : t('suche.pdfSeite', { n: x.seite })}</span>
                {herkunft(x.docId) && <Badge tone="dim">{t(`suche.herkunft.${herkunft(x.docId)}`)}</Badge>}
                {x.exakt && <Badge tone="ok">{t('suche.exakt')}</Badge>}
              </span>
              <span className="mt-1 block font-mono text-micro leading-relaxed text-dim">{x.ausschnitt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
