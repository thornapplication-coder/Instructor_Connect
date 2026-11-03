import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeading } from '../../components/ui'
import { toast } from '../../components/Toast'
import { downloadCsv } from '../../csv'
import { downloadXlsx } from '../../xlsxExport'
import { adminExcel, adminExportZeilen, adminTabelle, formatDauer, logbuchDateiName, zeilenAlsCsv } from '../../logbook'
import { useStore } from '../../store'
/* Dieselbe Filterleisten-Optik wie auf der Logbuch-Seite — inkl. der festen
   Breite fuer Datumsfelder (WebKit gibt leeren date-Inputs kaum Eigenbreite).
   Eine Klassenliste, nicht zwei Kopien (UID-11). */
import { filterCls } from '../Logbook'

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
  const { state, currentUser } = useStore()
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [muster, setMuster] = useState('')
  const [ohneBriefing, setOhneBriefing] = useState(false)

  /* Eine Rechnung fuer Tabelle, Summenzeile und Musterauswahl (src/logbook.ts).
     Vorher lief `logbuchVon` zweimal je Nutzer, bei jedem Tastendruck im
     Filter — und die Summenzeile stand ungetestet in dieser Datei. */
  const { zeilen, summe, musterListe } = useMemo(
    () =>
      adminTabelle(
        state.users,
        state.gradingRecords,
        state.logbook ?? {},
        { von: von || undefined, bis: bis || undefined, muster: muster || undefined },
        ohneBriefing,
      ),
    [state.users, state.gradingRecords, state.logbook, von, bis, muster, ohneBriefing],
  )

  /* Export folgt der Ansicht: aktive Filter in den Dateikopf, dann exakt die
     Tabelle. CSV und Excel schreiben dieselben Zeilen — aufgebaut in
     src/logbook.ts (adminExportZeilen), mit Uhrzeit und Exportierendem im
     Kopf (KERN-14). */
  const exportEingabe = () => ({
    tabelle: { zeilen, summe },
    filter: { von: von || undefined, bis: bis || undefined, muster: muster || undefined },
    ohneBriefing,
    exportiertAm: Date.now() + state.timeOffsetMs,
    exportiertVon: currentUser?.name ?? '',
  })
  /* Dateiname mit Stand-Datum (logbuchDateiName, EXM-10): vorher hiess jeder
     Auszug gleich und wurde im Downloadordner zur „(1)"-Kopie. Name und
     Dateikopf nehmen denselben Zeitpunkt. */
  const exportCsv = () => {
    const e = exportEingabe()
    downloadCsv(logbuchDateiName(null, e.exportiertAm, 'csv'), zeilenAlsCsv(adminExportZeilen(e)))
    toast(t('toast.downloaded'))
  }
  /* Excel mit Kopfformat, Dezimalstunden, Druckeinrichtung und
     Eigenschaften — die Angaben dazu kommen mit den Zeilen aus
     src/logbook.ts (adminExcel, XLSX-01/EXM-09). */
  const exportExcel = () => {
    const e = exportEingabe()
    const { zeilen: z, optionen } = adminExcel(e)
    downloadXlsx(logbuchDateiName(null, e.exportiertAm, 'xlsx'), 'Logbook', z, optionen)
    toast(t('toast.downloaded'))
  }

  return (
    /* Innenabstand wie jede Karte: Card bringt selbst keinen mit, und hier
       klebten Ueberschrift, Filter, Tabelle und Summenzeile an der Kante
       (Audit 11/2026, UID-03). Die Abstaende laufen ueber den Stapel statt
       ueber einzelne mb-/mt-Werte. */
    <Card className="space-y-stack p-4">
      <div className="space-y-tight">
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
        <p className="text-small leading-relaxed text-dim">{t('admin.logbookHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
                <tr key={z.id} className="border-b border-line/[0.06] last:border-0">
                  <td className="py-2.5 pr-3">
                    {z.name}
                    {!z.aktiv && <span className="ml-2 text-micro text-dim">({t('admin.inactive')})</span>}
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
