import { CalendarRange, Download, Info } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeading, selectCls } from '../../components/ui'
import { csvNum, csvRow, downloadCsv } from '../../csv'
import type { Flag } from '../../gradingStats'
import {
  monthlyReport,
  monthsWithData,
  type CompetencyLine,
  type Figures,
  type MonthKey,
  type MonthlyReport as Report,
} from '../../monthlyReport'
import { useStore } from '../../store'
import type { CompetencySetKey, GradingRecord } from '../../types'
import { gradeColor } from '../Grading'

/**
 * Persönlicher Monatsbericht.
 *
 * Der Standardisierungsbericht beantwortet die Frage der ATO („bewertet
 * jemand systematisch strenger?"). Der Einzelne sieht dort eine Zeile unter
 * vielen und erfährt nie von sich aus, wo er steht. Hier ist die
 * Blickrichtung umgedreht: eigene Zahlen eines Monats, gespiegelt gegen die
 * eigenen Muster UND gegen alle Gradings — der erste Vergleich zeigt die
 * Kalibrierung im Muster, der zweite, ob das Muster als Ganzes ausschert.
 *
 * Für Instruktoren ist der Bericht der eigene; Rollen mit vollem
 * Archivzugriff können zusätzlich den Instruktor wählen.
 */

const fmt = (v: number | null, digits = 2) => (v === null ? '–' : v.toFixed(digits))
const fmtPct = (v: number | null) => (v === null ? '–' : `${v.toFixed(0)} %`)
const fmtDelta = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`)

const deltaClass = (v: number | null) => (v === null ? 'text-dim' : Math.abs(v) < 0.4 ? 'text-dim' : v > 0 ? 'text-warm' : 'text-accent')

function FlagBadge({ flag, t }: { flag: Flag; t: (k: string) => string }) {
  const map: Record<Flag, string> = {
    none: 'bg-ok/15 text-ok',
    watch: 'bg-warm/15 text-warm',
    review: 'bg-danger/15 text-danger',
    insufficient: 'bg-line/10 text-dim',
  }
  const label: Record<Flag, string> = {
    none: 'flagNone',
    watch: 'flagWatch',
    review: 'flagReview',
    insufficient: 'flagInsufficient',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${map[flag]}`}>
      {t(`forms:admin.${label[flag]}`)}
    </span>
  )
}

/** Kennzahlenzeile: eigener Wert, Flotte, Gesamt — immer in dieser Ordnung. */
/**
 * Eine Kennzahlzeile. Bewusst echtes <tr>/<th>/<td>: Der Block war ein Raster
 * aus <span>, und damit fehlte jede Verbindung zwischen einem Wert und seiner
 * Spaltenüberschrift. Vorgelesen wurde „2,95 2,88 3,01" ohne die Angabe,
 * welche Zahl die eigene und welche die der Flotte ist — bei einer
 * Gegenüberstellung ist das die ganze Aussage. Mit einer Tabelle nennt die
 * Vorlesesoftware zu jedem Wert Zeile und Spalte.
 */
function FigureRow({ label, own, fleet, all }: { label: string; own: string; fleet: string; all: string }) {
  return (
    <tr className="border-b border-line/[0.06] text-[13px] last:border-0">
      <th scope="row" className="py-1.5 pr-2 text-left font-normal text-dim">
        {label}
      </th>
      <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{own}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-dim">{fleet}</td>
      <td className="py-1.5 pl-2 text-right tabular-nums text-dim">{all}</td>
    </tr>
  )
}

function Distribution({ dist, t }: { dist: Figures['dist']; t: (k: string) => string }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0)
  return (
    <div>
      <CardHeading className="mb-2">{t('forms:admin.distribution')}</CardHeading>
      <div className="flex flex-wrap gap-1.5">
        {(['1', '2', '3', '4', '5', 'NO'] as const).map((k) => {
          const n = dist[k] ?? 0
          const share = total === 0 ? 0 : Math.round((n / total) * 100)
          return (
            <span key={k} className="flex items-center gap-1.5 rounded-lg border border-line/10 px-2 py-1">
              <span className={`flex h-6 w-7 items-center justify-center rounded-md text-[12px] font-bold ${gradeColor(k === 'NO' ? 'NO' : Number(k))}`}>
                {k}
              </span>
              <span className="text-[12.5px] tabular-nums">
                {n} <span className="text-dim">· {share} %</span>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function CompetencyTable({ lines, t }: { lines: CompetencyLine[]; t: (k: string) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line/15 text-left text-[12px] uppercase tracking-wide text-dim">
            <th className="py-2 pr-2 font-semibold">{t('forms:admin.perCompetency')}</th>
            <th className="py-2 px-2 text-right font-semibold">{t('forms:admin.yours')}</th>
            <th className="py-2 px-2 text-right font-semibold">{t('forms:admin.fleetCol')}</th>
            <th className="py-2 px-2 text-right font-semibold">{t('forms:admin.allCol')}</th>
            <th className="py-2 px-2 text-right font-semibold">{t('forms:admin.vsFleet')}</th>
            <th className="py-2 pl-2 text-right font-semibold">{t('forms:admin.vsAll')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((c) => (
            <tr key={c.code} className="border-b border-line/[0.06] last:border-0">
              <td className="py-2 pr-2">
                <span className="font-semibold">{c.code}</span> <span className="text-dim">{c.title}</span>
              </td>
              <td className="py-2 px-2 text-right font-semibold tabular-nums">{fmt(c.own)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-dim">{fmt(c.fleet)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-dim">{fmt(c.all)}</td>
              <td className={`py-2 px-2 text-right tabular-nums ${deltaClass(c.deltaFleet)}`}>{fmtDelta(c.deltaFleet)}</td>
              <td className={`py-2 pl-2 text-right tabular-nums ${deltaClass(c.deltaAll)}`}>{fmtDelta(c.deltaAll)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MonthlyReport({ records }: { records: GradingRecord[] }) {
  // Kein `lng` mehr: Der Text dieses Berichts liegt im Namensraum `forms`,
  // den es nur auf Englisch gibt. Vorher entschied die einbindende Ansicht
  // über die Sprache — und vergaß sie an einer von zwei Stellen, weshalb
  // derselbe Bericht im Grading Tool englisch und im Admin-Panel deutsch war.
  const { t } = useTranslation()
  const { state, currentUser, can } = useStore()

  const mayPickInstructor = can('grading_view_all')
  /*
   * Vorbelegung: der eigene Bericht — aber nur, wenn es ihn geben kann.
   *
   * `useState(currentUser.id)` allein log: Ein Training Admin bewertet nicht
   * (`canGrade: false`), steht deshalb gar nicht in `instructorOptions` — das
   * Auswahlfeld zeigte dann den ERSTEN fremden Namen an, waehrend der Bericht
   * weiter fuer ihn selbst rechnete und „keine Bewertungen" meldete. Man las
   * einen Namen mit Daten und ein leeres Ergebnis. Dasselbe traf den
   * Superadmin, der selbst nicht bewertet.
   */
  const [instructorId, setInstructorId] = useState('')
  const who = mayPickInstructor ? instructorId || currentUser!.id : currentUser!.id

  const ownMonths = useMemo(() => monthsWithData(records, who), [records, who])
  // Wer fuer andere auswerten darf, hat oft selbst keine Bewertungen. Dann
  // duerfen die Monate nicht leer bleiben — sonst verschwaende die Auswahl
  // und mit ihr der Instruktorwaehler.
  const months = useMemo(
    () => (ownMonths.length > 0 ? ownMonths : mayPickInstructor ? monthsWithData(records) : []),
    [ownMonths, mayPickInstructor, records],
  )
  const [picked, setPicked] = useState<string>('')
  const month: MonthKey | undefined = months.find((m) => `${m.year}-${m.month}` === picked) ?? months[0]

  // Kompetenzsatz je Blatt aus dem Katalog — der Bericht vergleicht nur
  // innerhalb eines Satzes (siehe monthlyReport.ts).
  const setOfRecord = useCallback(
    (r: GradingRecord): CompetencySetKey | null =>
      state.settings.grading.formTypes.find((f) => f.id === r.formTypeId)?.competencySet ?? null,
    [state.settings.grading.formTypes],
  )
  const report: Report | undefined = useMemo(
    () => (month ? monthlyReport(records, who, month, setOfRecord) : undefined),
    [records, who, month, setOfRecord],
  )

  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? id
  const instructorOptions = useMemo(
    () =>
      [...new Set([...state.users.filter((u) => u.active && u.canGrade).map((u) => u.id), ...records.map((r) => r.instructorId)])]
        .map((id) => ({ id, name: userName(id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.users, records],
  )

  /*
   * Steht der aktuelle Nutzer nicht zur Wahl (oder hat er in keinem Monat
   * Daten), auf den ersten Instruktor MIT Daten wechseln — sonst zeigt das
   * Feld einen anderen Namen, als der Bericht rechnet.
   */
  useEffect(() => {
    if (!mayPickInstructor || instructorId) return
    const eigenerHatDaten = records.some((r) => r.instructorId === currentUser!.id)
    if (eigenerHatDaten && instructorOptions.some((o) => o.id === currentUser!.id)) {
      setInstructorId(currentUser!.id)
      return
    }
    const ersterMitDaten = instructorOptions.find((o) => records.some((r) => r.instructorId === o.id))
    if (ersterMitDaten) setInstructorId(ersterMitDaten.id)
  }, [mayPickInstructor, instructorId, instructorOptions, records, currentUser])

  const monthLabel = (m: MonthKey) =>
    // Der Monatsname gehoert zum Berichtstext und bleibt deshalb englisch.
    new Date(m.year, m.month, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })

  const exportCsv = () => {
    if (!report) return
    let csv = csvRow([t('forms:admin.monthly'), monthLabel(report.month), userName(report.instructorId)])
    csv += csvRow([])
    csv += csvRow(['', t('forms:admin.yours'), t('forms:admin.fleetCol'), t('forms:admin.allCol')])
    const rows: [string, keyof Figures][] = [
      [t('forms:admin.sessions'), 'sessions'],
      [t('forms:admin.traineesGraded'), 'trainees'],
      [t('forms:admin.gradesGiven'), 'gradesN'],
    ]
    rows.forEach(([label, key]) => csv += csvRow([label, report.own[key] as number, report.fleet[key] as number, report.all[key] as number]))
    csv += csvRow([t('forms:admin.meanGrade'), csvNum(report.own.mean), csvNum(report.fleet.mean), csvNum(report.all.mean)])
    csv += csvRow([t('forms:admin.lowShareLbl'), csvNum(report.own.lowShare, 0), csvNum(report.fleet.lowShare, 0), csvNum(report.all.lowShare, 0)])
    csv += csvRow([t('forms:admin.highShareLbl'), csvNum(report.own.highShare, 0), csvNum(report.fleet.highShare, 0), csvNum(report.all.highShare, 0)])
    csv += csvRow([t('forms:admin.ncRateLbl'), csvNum(report.own.ncRate, 0), csvNum(report.fleet.ncRate, 0), csvNum(report.all.ncRate, 0)])
    csv += csvRow([])
    csv += csvRow([t('forms:admin.perCompetency'), t('forms:admin.yours'), t('forms:admin.fleetCol'), t('forms:admin.allCol'), t('forms:admin.vsFleet'), t('forms:admin.vsAll')])
    report.competencies.forEach((c) =>
      csv += csvRow([`${c.code} ${c.title}`, csvNum(c.own), csvNum(c.fleet), csvNum(c.all), csvNum(c.deltaFleet), csvNum(c.deltaAll)]),
    )
    const m = report.month
    downloadCsv(`monthly-report_${userName(report.instructorId).replace(/\s+/g, '-')}_${m.year}-${String(m.month + 1).padStart(2, '0')}.csv`, csv)
  }

  if (months.length === 0)
    return <Card className="p-4 text-[13.5px] text-dim">{t('forms:admin.noMonths')}</Card>

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-dim">{t('forms:admin.monthlyHint')}</p>

      {/* Auswahl: Monat und — mit vollem Archivzugriff — der Instruktor */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[13px] font-medium text-dim">
          <CalendarRange size={15} /> {t('forms:admin.month')}
        </label>
        <select
          value={picked || (month ? `${month.year}-${month.month}` : '')}
          onChange={(e) => setPicked(e.target.value)}
          aria-label={t('forms:admin.month')}
          className={`${selectCls} w-auto`}
        >
          {months.map((m) => (
            <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        {mayPickInstructor && (
          <>
            <label className="text-[13px] font-medium text-dim">{t('forms:admin.instructorPick')}</label>
            <select
              value={instructorId}
              onChange={(e) => { setInstructorId(e.target.value); setPicked('') }}
              aria-label={t('forms:admin.instructorPick')}
              className={`${selectCls} w-auto`}
            >
              {instructorOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </>
        )}
        <button
          onClick={exportCsv}
          className="ml-auto flex min-h-11 items-center gap-1.5 rounded-xl border border-line/15 px-3 py-2 text-[13px] text-dim transition hover:border-accent/40 hover:text-accent"
        >
          <Download size={15} /> {t('forms:admin.downloadCsv')}
        </button>
      </div>

      {!report || report.own.sessions === 0 ? (
        <Card className="p-4 text-[13.5px] text-dim">{t('forms:admin.noDataMonth')}</Card>
      ) : (
        <>
          {/* Kalibrierung zuerst — sie ist die Aussage, der Rest ist Beleg. */}
          <Card className="space-y-2.5 p-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="text-[15.5px] font-bold">{userName(report.instructorId)}</h3>
              <span className="text-[13px] text-dim">· {monthLabel(report.month)}</span>
              {report.fleets.length > 0 && <span className="text-[13px] text-dim">· {report.fleets.join(', ')}</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {/* Ohne fremde Formulare in der Gruppe vergleicht man sich mit
                  sich selbst — die 0 waere dann keine Aussage, sondern Zufall
                  der Datenlage. Dann lieber den Grund nennen. */}
              <div className="rounded-xl border border-line/10 p-3">
                <p className="mb-1 text-[12px] uppercase tracking-wide text-dim">{t('forms:admin.vsFleet')}</p>
                {report.fleetHasOthers ? (
                  <>
                    <p className={`text-[19px] font-bold tabular-nums ${deltaClass(report.deltaFleet)}`}>{fmtDelta(report.deltaFleet)}</p>
                    <FlagBadge flag={report.flagFleet} t={t} />
                  </>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-dim">{t('forms:admin.onlyYou')}</p>
                )}
              </div>
              <div className="rounded-xl border border-line/10 p-3">
                <p className="mb-1 text-[12px] uppercase tracking-wide text-dim">{t('forms:admin.vsAll')}</p>
                {report.allHasOthers ? (
                  <>
                    <p className={`text-[19px] font-bold tabular-nums ${deltaClass(report.deltaAll)}`}>{fmtDelta(report.deltaAll)}</p>
                    <FlagBadge flag={report.flagAll} t={t} />
                  </>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-dim">{t('forms:admin.onlyYou')}</p>
                )}
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-dim">{t('forms:admin.deltaHint')}</p>
          </Card>

          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t('forms:admin.figuresCaption')}</caption>
                <thead>
                  <tr className="border-b border-line/15 text-[12px] uppercase tracking-wide text-dim">
                    <td />
                    <th scope="col" className="py-1.5 px-2 text-right font-semibold">{t('forms:admin.yours')}</th>
                    <th scope="col" className="py-1.5 px-2 text-right font-semibold">{t('forms:admin.fleetCol')}</th>
                    <th scope="col" className="py-1.5 pl-2 text-right font-semibold">{t('forms:admin.allCol')}</th>
                  </tr>
                </thead>
                <tbody>
            <FigureRow label={t('forms:admin.sessions')} own={String(report.own.sessions)} fleet={String(report.fleet.sessions)} all={String(report.all.sessions)} />
            <FigureRow label={t('forms:admin.traineesGraded')} own={String(report.own.trainees)} fleet={String(report.fleet.trainees)} all={String(report.all.trainees)} />
            <FigureRow label={t('forms:admin.gradesGiven')} own={String(report.own.gradesN)} fleet={String(report.fleet.gradesN)} all={String(report.all.gradesN)} />
            <FigureRow label={t('forms:admin.meanGrade')} own={fmt(report.own.mean)} fleet={fmt(report.fleet.mean)} all={fmt(report.all.mean)} />
            <FigureRow label={t('forms:admin.lowShareLbl')} own={fmtPct(report.own.lowShare)} fleet={fmtPct(report.fleet.lowShare)} all={fmtPct(report.all.lowShare)} />
            <FigureRow label={t('forms:admin.highShareLbl')} own={fmtPct(report.own.highShare)} fleet={fmtPct(report.fleet.highShare)} all={fmtPct(report.all.highShare)} />
            <FigureRow label={t('forms:admin.ncRateLbl')} own={fmtPct(report.own.ncRate)} fleet={fmtPct(report.fleet.ncRate)} all={fmtPct(report.all.ncRate)} />
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <Distribution dist={report.own.dist} t={t} />
          </Card>

          <Card className="p-4">
            <CompetencyTable lines={report.competencies} t={t} />
          </Card>

          <div className="flex items-start gap-2.5 rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[12.5px] text-dim">
            <Info size={15} className="mt-0.5 shrink-0 text-accent" />
            <p>{t('forms:admin.onlyOwn')}</p>
          </div>
        </>
      )}
    </div>
  )
}
