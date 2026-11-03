import { CheckCheck, FolderTree } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeading } from '../../../components/ui'
import { formatDate } from '../../../datum'
import { korrekturen, paketStand } from '../recheck/ablauf'
import { paketBestaetigen, paketSetzen, paketStruktur, setzen, useSitzung, type SitzungsDok } from '../sitzung'
import { paketVergleich } from '../paket/struktur'
import { standardVerbindung } from '../verbindung'
import { useStore } from '../../../store'
import { aktiv } from '../settings'

/**
 * Dokumentpaket (Nachtrag N1, N2, Kap. 18): Umschalter „Einzeldokument |
 * Paket", Struktur je Prüfdokument, Paketübersicht. Die Prüfung läuft im
 * Worker und automatisch neu, sobald Struktur, Texte oder bestätigte
 * Korrekturen des Re-Checks sich ändern — ein Knopf „Paket prüfen" wäre
 * eine Gelegenheit, mit einem veralteten Ergebnis weiterzuarbeiten.
 */

const feldCls = 'w-full rounded-lg border border-field bg-bg/60 px-2 py-1 text-small text-ink outline-none focus:border-accent/60'

/** Hält das Paketergebnis aktuell. Gehört in die Desktop-Hülle, damit es auch in „Findings" stimmt. */
export function usePaketPruefung(): void {
  const z = useSitzung()
  const struktur = paketStruktur(z)
  const k = korrekturen(z.recheck)
  const stand = JSON.stringify([struktur, paketStand(z.docs), k])
  const { docCheckSettings } = useStore()
  const an = !!z.paketModus && aktiv(docCheckSettings, 'packageCheck') && struktur.length > 0
  useEffect(() => {
    if (!an) return
    let aktiv = true
    void standardVerbindung()
      .paketPruefen(struktur, k)
      .then((ergebnis) => {
        if (aktiv && ergebnis) setzen((s) => ({ ...s, paketErgebnis: { ergebnis, stand } }))
      })
    return () => {
      aktiv = false
    }
  }, [an, stand])
}

export function PaketUmschalter() {
  const { t } = useTranslation('doccheck')
  const { paketModus } = useSitzung()
  return (
    // Umbrechen je Knopf, nie im Wort: Bei 320 px brach „Einzeldokumente" mitten im Wort (Audit 11/2026, A11Y-11)
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('paket.modus')}>
      {([false, true] as const).map((p) => (
        <button
          key={String(p)}
          role="radio"
          aria-checked={!!paketModus === p}
          onClick={() => setzen((s) => ({ ...s, paketModus: p }))}
          className={`min-h-11 flex-1 whitespace-nowrap rounded-xl border px-3 text-small transition ${!!paketModus === p ? 'border-accent/60 bg-accent/15 font-semibold' : 'border-line/15 hover:bg-line/5'}`}
        >
          {t(p ? 'paket.paket' : 'paket.einzeln')}
        </button>
      ))}
    </div>
  )
}

function Zeile({ d }: { d: SitzungsDok }) {
  const { t } = useTranslation('doccheck')
  const p = d.paket!
  const setze = (patch: Parameters<typeof paketSetzen>[2]) => setzen((s) => paketSetzen(s, d.id, patch))
  return (
    <tr className="border-b border-line/[0.06] align-top last:border-0">
      <td className="py-2 pr-3">
        <span className="block break-words font-medium">{d.felder.titel || d.name}</span>
        {p.erkannt && <Badge tone="accent">{t('upload.erkannt')}</Badge>}
      </td>
      <td className="w-28 py-2 pr-2"><input aria-label={t('paket.col.kuerzel')} className={feldCls} value={p.kuerzel} onChange={(e) => setze({ kuerzel: e.target.value })} /></td>
      <td className="w-16 py-2 pr-2">
        <select aria-label={t('paket.col.ebene')} className={feldCls} value={p.ebene} onChange={(e) => setze({ ebene: Number(e.target.value) })}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </td>
      <td className="w-28 py-2 pr-2"><input aria-label={t('paket.col.gruppe')} className={feldCls} value={p.gruppe} placeholder="—" onChange={(e) => setze({ gruppe: e.target.value })} /></td>
      <td className="w-20 py-2"><input aria-label={t('paket.col.variante')} className={feldCls} value={p.variante} placeholder="—" onChange={(e) => setze({ variante: e.target.value.toUpperCase() })} /></td>
    </tr>
  )
}

export function PaketPanel() {
  const { t } = useTranslation('doccheck')
  const z = useSitzung()
  const docs = z.docs.filter((d) => d.rolle === 'review' && d.status === 'fertig' && d.paket).sort((a, b) => paketVergleich(a.paket!, b.paket!))
  const e = z.paketErgebnis?.ergebnis
  const erkannt = docs.some((d) => d.paket!.erkannt)
  if (!docs.length) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-line/10 bg-bg/40 p-4 text-small text-dim">
        <FolderTree size={18} className="shrink-0" aria-hidden /> {t('paket.leer')}
      </p>
    )
  }
  return (
    <div className="space-y-stack">
      <Card className="space-y-stack p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardHeading>{t('paket.struktur')}</CardHeading>
          {erkannt && (
            <Button variant="ghost" className="!min-h-9 !py-1.5 text-small" onClick={() => setzen(paketBestaetigen)}>
              <span className="flex items-center gap-1.5"><CheckCheck size={15} /> {t('paket.bestaetigen')}</span>
            </Button>
          )}
        </div>
        <p className="text-micro leading-relaxed text-dim">{t('paket.hinweis')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-small">
            <thead>
              <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                {(['dok', 'kuerzel', 'ebene', 'gruppe', 'variante'] as const).map((c) => (
                  <th key={c} className="whitespace-nowrap pb-1.5 pr-2 font-semibold">{t(`paket.col.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <Zeile key={d.id} d={d} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {e && (
        <Card className="space-y-stack p-4">
          <CardHeading>{t('paket.uebersicht')}</CardHeading>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-small">
              <thead>
                <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                  {(['ebene', 'kuerzel', 'dok', 'revision', 'datum'] as const).map((c) => (
                    <th key={c} className="whitespace-nowrap pb-1.5 pr-3 font-semibold">{t(`paket.col.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.uebersicht.map((u) => (
                  <tr key={u.id} className="border-b border-line/[0.06] last:border-0">
                    <td className="py-1.5 pr-3 text-dim">{u.ebene}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 font-semibold">{u.kuerzel || '—'}</td>
                    <td className="py-1.5 pr-3">{u.dokName}</td>
                    <td className={`whitespace-nowrap py-1.5 pr-3 ${u.abweichung.includes('revision') ? 'font-semibold text-wait' : ''}`}>{u.revision || <span className="text-bad">{t('paket.fehlt')}</span>}</td>
                    <td className={`whitespace-nowrap py-1.5 ${u.abweichung.includes('datum') ? 'font-semibold text-wait' : ''}`}>{u.datum ? formatDate(u.datum) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-micro text-dim">{t('paket.befunde', { count: e.befunde.length })}</p>
        </Card>
      )}
    </div>
  )
}
