import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeading } from '../../components/ui'
import { toast } from '../../components/Toast'
import { csvRow, downloadCsv } from '../../csv'
import { downloadXlsx, type XlsxZelle } from '../../xlsxExport'
import {
  adminZeile,
  filtereEintraege,
  formatDauer,
  LEERES_LOGBUCH,
  logbuchVon,
} from '../../logbook'
import { useStore } from '../../store'
import { formatDate } from '../Grading'

/* Dieselbe Filterleisten-Optik wie auf der Logbuch-Seite — inkl. der festen
   Breite fuer Datumsfelder (WebKit gibt leeren date-Inputs kaum Eigenbreite). */
const filterCls =
  'min-h-11 rounded-xl border border-field bg-bg/60 px-3 py-2 text-small text-ink outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20'

/**
 * Alle Zeiten aller Instruktoren, aufgeschluesselt — der Ueberblick fuer den
 * Superadmin. Gerechnet wird mit denselben Funktionen wie im einzelnen
 * Logbuch (logbuchVon, filtereEintraege, adminZeile): Was hier steht, ist
 * die Summe dessen, was jeder Instruktor selbst sieht — Korrekturen,
 * Loeschungen und manuelle Eintraege eingeschlossen. Eine eigene Rechnung
 * daneben waere die zweite Wahrheit fuer dieselbe Stunde.
 */
export function LogbookAdmin() {
  const { t } = useTranslation()
  const { state } = useStore()
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [muster, setMuster] = useState('')
  const [ohneBriefing, setOhneBriefing] = useState(false)

  const alleZeilen = state.users.map((u) => {
    const alle = logbuchVon(state.gradingRecords, u.id, (state.logbook ?? {})[u.id] ?? LEERES_LOGBUCH)
    const gefiltert = filtereEintraege(alle, { von: von || undefined, bis: bis || undefined, muster: muster || undefined })
    return { user: u, hatUeberhaupt: alle.length > 0, ...adminZeile(gefiltert, ohneBriefing) }
  })
  // Wer gar kein Logbuch fuehrt, steht nicht als Nullzeile in der Liste —
  // sonst ist die Auswertung so lang wie die Benutzerverwaltung. Wer nur
  // unter dem aktiven Filter leer ist, bleibt stehen: Das ist eine Aussage.
  const zeilen = alleZeilen
    .filter((z) => z.hatUeberhaupt)
    .sort((a, b) => b.gesamt - a.gesamt || a.user.name.localeCompare(b.user.name))
  const summe = {
    anzahl: zeilen.reduce((s, z) => s + z.anzahl, 0),
    ground: zeilen.reduce((s, z) => s + z.ground, 0),
    simulator: zeilen.reduce((s, z) => s + z.simulator, 0),
    other: zeilen.reduce((s, z) => s + z.other, 0),
    gesamt: zeilen.reduce((s, z) => s + z.gesamt, 0),
  }
  // Muster-Auswahl aus dem Bestand: was irgendwo in einem Logbuch vorkommt
  const musterListe = [...new Set(state.users.flatMap((u) => logbuchVon(state.gradingRecords, u.id, (state.logbook ?? {})[u.id] ?? LEERES_LOGBUCH).map((e) => e.aircraftType)).filter(Boolean))].sort()

  /* Export folgt der Ansicht: aktive Filter in den Dateikopf, dann exakt die
     Tabelle. CSV und Excel schreiben dieselben Zeilen. */
  const exportZeilen = (): XlsxZelle[][] => [
    ['AAA Logbook — all instructors'],
    ['Exported', formatDate(Date.now())],
    ['Period', von || bis ? `${von ? formatDate(von) : '…'} - ${bis ? formatDate(bis) : '…'}` : 'all'],
    ['Aircraft type', muster || 'all'],
    ['Counting', ohneBriefing ? 'without briefing' : 'with briefing'],
    [],
    ['Instructor', 'Aircraft types', 'Entries', 'Ground Training', 'Simulator Training', 'Other Training', 'Total'],
    ...zeilen.map((z) => [z.user.name, z.muster.join(', '), z.anzahl, formatDauer(z.ground), formatDauer(z.simulator), formatDauer(z.other), formatDauer(z.gesamt)] as XlsxZelle[]),
    ['Total', '', summe.anzahl, formatDauer(summe.ground), formatDauer(summe.simulator), formatDauer(summe.other), formatDauer(summe.gesamt)],
  ]
  const exportCsv = () => {
    const csv = exportZeilen().map((r) => csvRow(r)).join('')
    downloadCsv('aaa-logbook-instructors.csv', csv)
    toast(t('toast.downloaded'))
  }
  const exportExcel = () => {
    downloadXlsx('aaa-logbook-instructors.xlsx', 'Logbook', exportZeilen())
    toast(t('toast.downloaded'))
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardHeading>{t('admin.logbookHeading')}</CardHeading>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={exportCsv} className="flex items-center gap-1.5 text-micro">
            <Download size={13} /> CSV
          </Button>
          <Button variant="ghost" onClick={exportExcel} className="flex items-center gap-1.5 text-micro">
            <Download size={13} /> Excel
          </Button>
        </div>
      </div>
      <p className="mb-3 mt-1 text-small leading-relaxed text-dim">{t('admin.logbookHint')}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 items-center gap-1.5 text-small text-dim">
          {t('logbook.from')}
          <input type="date" className={`${filterCls} w-36`} value={von} onChange={(e) => setVon(e.target.value)} />
        </label>
        <label className="flex min-w-0 items-center gap-1.5 text-small text-dim">
          {t('logbook.to')}
          <input type="date" className={`${filterCls} w-36`} value={bis} onChange={(e) => setBis(e.target.value)} />
        </label>
        <select value={muster} onChange={(e) => setMuster(e.target.value)} aria-label={t('logbook.aircraft')} className={filterCls}>
          <option value="">{t('logbook.allAircraft')}</option>
          {musterListe.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {/* Mit/ohne Briefing als Pillen — die Kategorien sind jetzt Spalten */}
        {([false, true] as const).map((ohne) => (
          <button
            key={String(ohne)}
            aria-pressed={ohneBriefing === ohne}
            onClick={() => setOhneBriefing(ohne)}
            className={`min-h-11 rounded-full border px-3 py-1 text-small transition ${
              ohneBriefing === ohne ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim hover:text-ink'
            }`}
          >
            {t(`admin.logbookFilter.${ohne ? 'ohneBriefing' : 'alle'}`)}
          </button>
        ))}
      </div>

      {zeilen.length === 0 ? (
        <p className="text-body text-dim">{t('admin.logbookEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-small">
            <thead>
              <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                <th scope="col" className="pb-2 pr-3 font-semibold">{t('admin.logbookInstructor')}</th>
                <th scope="col" className="pb-2 pr-3 font-semibold">{t('logbook.aircraft')}</th>
                <th scope="col" className="pb-2 pr-3 text-right font-semibold">{t('admin.logbookEntries')}</th>
                <th scope="col" className="pb-2 pr-3 text-right font-semibold">Ground</th>
                <th scope="col" className="pb-2 pr-3 text-right font-semibold">Simulator</th>
                <th scope="col" className="pb-2 pr-3 text-right font-semibold">Other</th>
                <th scope="col" className="pb-2 text-right font-semibold">{t('admin.logbookTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.user.id} className="border-b border-line/[0.06] last:border-0">
                  <td className="py-2.5 pr-3">
                    {z.user.name}
                    {!z.user.active && <span className="ml-2 text-micro text-dim">({t('admin.inactive')})</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="flex flex-wrap gap-1">
                      {z.muster.map((m) => (
                        <Badge key={m} tone="dim">{m}</Badge>
                      ))}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{z.anzahl}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatDauer(z.ground)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatDauer(z.simulator)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatDauer(z.other)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatDauer(z.gesamt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line/15">
                <td className="pt-2.5 pr-3 font-semibold">{t('admin.logbookTotal')}</td>
                <td className="pt-2.5 pr-3" />
                <td className="pt-2.5 pr-3 text-right font-semibold tabular-nums">{summe.anzahl}</td>
                <td className="pt-2.5 pr-3 text-right font-semibold tabular-nums">{formatDauer(summe.ground)}</td>
                <td className="pt-2.5 pr-3 text-right font-semibold tabular-nums">{formatDauer(summe.simulator)}</td>
                <td className="pt-2.5 pr-3 text-right font-semibold tabular-nums">{formatDauer(summe.other)}</td>
                <td className="pt-2.5 text-right font-semibold tabular-nums">{formatDauer(summe.gesamt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}
