import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeading } from '../../components/ui'
import {
  ADMIN_ZEIT_FILTER,
  type AdminZeitFilter,
  formatDauer,
  LEERES_LOGBUCH,
  logbuchVon,
  summeUnterFilter,
} from '../../logbook'
import { useStore } from '../../store'

/**
 * Alle Zeiten aller Instruktoren, aufgeschluesselt — der Ueberblick fuer den
 * Superadmin. Gerechnet wird mit denselben Funktionen wie im einzelnen
 * Logbuch (logbuchVon, summeUnterFilter): Was hier steht, ist die Summe
 * dessen, was jeder Instruktor selbst sieht — Korrekturen, Loeschungen und
 * manuelle Eintraege eingeschlossen. Eine eigene Rechnung daneben waere die
 * zweite Wahrheit fuer dieselbe Stunde.
 */
export function LogbookAdmin() {
  const { t } = useTranslation()
  const { state } = useStore()
  const [filter, setFilter] = useState<AdminZeitFilter>('alle')

  const zeilen = state.users
    .map((u) => {
      const eintraege = logbuchVon(state.gradingRecords, u.id, (state.logbook ?? {})[u.id] ?? LEERES_LOGBUCH)
      return { user: u, alle: eintraege.length, ...summeUnterFilter(eintraege, filter) }
    })
    // Wer gar kein Logbuch fuehrt (kein Eintrag, egal unter welchem Filter),
    // steht nicht als Nullzeile in der Liste — sonst ist die Auswertung so
    // lang wie die Benutzerverwaltung.
    .filter((z) => z.alle > 0)
    .sort((a, b) => b.minuten - a.minuten || a.user.name.localeCompare(b.user.name))

  const gesamtMin = zeilen.reduce((s, z) => s + z.minuten, 0)
  const gesamtAnzahl = zeilen.reduce((s, z) => s + z.anzahl, 0)

  return (
    <Card>
      <CardHeading>{t('admin.logbookHeading')}</CardHeading>
      <p className="mb-3 text-small leading-relaxed text-dim">{t('admin.logbookHint')}</p>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('admin.logbookFilterLabel')}>
        {ADMIN_ZEIT_FILTER.map((f) => (
          <button
            key={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-11 rounded-full border px-3 py-1 text-small transition ${
              filter === f ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15 text-dim hover:text-ink'
            }`}
          >
            {t(`admin.logbookFilter.${f}`)}
          </button>
        ))}
      </div>

      {zeilen.length === 0 ? (
        <p className="text-body text-dim">{t('admin.logbookEmpty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-small">
            <thead>
              <tr className="border-b border-line/15 text-left text-micro uppercase tracking-wide text-dim">
                <th scope="col" className="pb-2 pr-3 font-semibold">{t('admin.logbookInstructor')}</th>
                <th scope="col" className="pb-2 pr-3 text-right font-semibold">{t('admin.logbookEntries')}</th>
                <th scope="col" className="pb-2 text-right font-semibold">{t('admin.logbookTime')}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.user.id} className="border-b border-line/[0.06] last:border-0">
                  <td className="py-2.5 pr-3">
                    {z.user.name}
                    {!z.user.active && <span className="ml-2 text-micro text-dim">({t('admin.inactive')})</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{z.anzahl}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatDauer(z.minuten)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line/15">
                <td className="pt-2.5 pr-3 font-semibold">{t('admin.logbookTotal')}</td>
                <td className="pt-2.5 pr-3 text-right font-semibold tabular-nums">{gesamtAnzahl}</td>
                <td className="pt-2.5 text-right font-semibold tabular-nums">{formatDauer(gesamtMin)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}
