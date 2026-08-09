import { Printer, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { csvNum, csvRow, downloadCsv } from '../../csv'
import { selectCls } from '../../components/ui'
import { useStore } from '../../store'
import type { CompetencySetKey, Grade, GradingRecord } from '../../types'
import { formatDateTime } from '../Grading'

/**
 * Standardisierungsbericht nach ORA.ATO.110: Bewertet ein Instruktor
 * systematisch strenger oder milder als der Rest der Flotte? Genau diese
 * Frage muss eine ATO in der Standardisierungsbesprechung beantworten, und
 * genau dafür lag die Grundlage bisher nur roh in der Statistik.
 *
 * Der Bericht ist ein Dokument für die Behörde und deshalb — wie die
 * Formulare — durchgehend englisch, unabhängig von der Bediensprache.
 */

/** Ab dieser Menge ist eine Abweichung überhaupt aussagekräftig. Darunter
 *  erklärt sich jeder Unterschied durch Zufall, und eine Kennzeichnung
 *  würde einen Instruktor zu Unrecht in Erklärungsnot bringen. */
const MIN_GRADES = 10
const MIN_SESSIONS = 3
/** Schwellen in Notenpunkten. Bewusst feste, erklärbare Werte statt einer
 *  Standardabweichung: bei drei bis fünf Instruktoren ist die Streuung
 *  selbst so unsicher, dass sie keine belastbare Grenze hergibt. */
const WATCH = 0.4
const REVIEW = 0.8

type Flag = 'none' | 'watch' | 'review' | 'insufficient'

type Row = {
  id: string
  name: string
  sessions: number
  n: number
  mean: number | null
  delta: number | null
  dist: Record<string, number>
  lowShare: number | null
  highShare: number | null
  ncRate: number | null
  flag: Flag
}

const PERIODS = [
  { key: 'all', months: 0 },
  { key: '12m', months: 12 },
  { key: '6m', months: 6 },
  { key: '3m', months: 3 },
] as const

/** Nur die Zahlen zählen; „NO" (not observed) ist keine schlechte Note,
 *  sondern gar keine — sie darf den Schnitt nicht senken. */
function numbersOf(vals: (Grade | null)[]): number[] {
  return vals.filter((v): v is Exclude<Grade, 'NO'> => typeof v === 'number')
}

function mean(vals: (Grade | null)[]): number | null {
  const nums = numbersOf(vals)
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length
}

function pct(part: number, total: number): number | null {
  return total === 0 ? null : (part / total) * 100
}

const fmt = (v: number | null, digits = 2) => (v === null ? '–' : v.toFixed(digits))
const fmtPct = (v: number | null) => (v === null ? '–' : `${v.toFixed(0)} %`)
const fmtDelta = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`)

export function StandardisationReport({
  records,
  setOfRecord,
  fleet,
  onFleetChange,
  fleetOptions,
}: {
  records: GradingRecord[]
  setOfRecord: (r: GradingRecord) => CompetencySetKey | null
  fleet: string
  onFleetChange: (v: string) => void
  fleetOptions: string[]
}) {
  const { t: tUi, i18n } = useTranslation()
  // Der Bericht selbst ist ein Behördendokument und bleibt englisch.
  const t = i18n.getFixedT('en')
  const { state, currentUser } = useStore()
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('12m')

  const doc = state.settings.documentHeader
  const g = state.settings.grading
  const now = Date.now() + state.timeOffsetMs

  const scoped = useMemo(() => {
    const months = PERIODS.find((p) => p.key === period)!.months
    const from = months === 0 ? 0 : new Date(new Date(now).setMonth(new Date(now).getMonth() - months)).getTime()
    return records.filter(
      (r) => !r.parentId && r.createdAt >= from && (!fleet || r.header.aircraftType === fleet) && r.trainees.length > 0,
    )
  }, [records, period, fleet, now])

  const sets = useMemo(() => {
    return (['pilot', 'instructor'] as const)
      .map((key) => {
        const rs = scoped.filter((r) => setOfRecord(r) === key)
        const allGrades = rs.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.map((x) => x.grade)))
        const overall = mean(allGrades)

        const byInstr = new Map<string, GradingRecord[]>()
        rs.forEach((r) => byInstr.set(r.instructorId, [...(byInstr.get(r.instructorId) ?? []), r]))

        const rows: Row[] = [...byInstr.entries()]
          .map(([id, own]) => {
            const grades = own.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.map((x) => x.grade)))
            const nums = numbersOf(grades)
            // Ein Durchgang kann mehrere Blätter ergeben (eines je Pilot) —
            // gezählt wird der Durchgang, nicht das Blatt.
            const sessions = new Set(own.map((r) => r.batchId ?? r.id)).size
            const m = mean(grades)
            const dist: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, NO: 0 }
            grades.forEach((v) => {
              if (v === null) return
              dist[String(v)] = (dist[String(v)] ?? 0) + 1
            })
            const trainees = own.flatMap((r) => r.trainees)
            const nc = trainees.filter((tr) => tr.overall === 'not_competent').length
            const delta = m === null || overall === null ? null : m - overall
            const enough = nums.length >= MIN_GRADES && sessions >= MIN_SESSIONS
            const flag: Flag = !enough
              ? 'insufficient'
              : delta === null || Math.abs(delta) < WATCH
                ? 'none'
                : Math.abs(delta) < REVIEW
                  ? 'watch'
                  : 'review'
            return {
              id,
              name: state.users.find((u) => u.id === id)?.name ?? id,
              sessions,
              n: nums.length,
              mean: m,
              delta,
              dist,
              lowShare: pct(nums.filter((v) => v <= 2).length, nums.length),
              highShare: pct(nums.filter((v) => v >= 4).length, nums.length),
              ncRate: pct(nc, trainees.length),
              flag,
            }
          })
          .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))

        const nums = numbersOf(allGrades)
        const fleetTrainees = rs.flatMap((r) => r.trainees)
        return {
          key,
          name: g.competencySets.find((c) => c.key === key)?.name ?? key,
          overall,
          rows,
          sessions: new Set(rs.map((r) => r.batchId ?? r.id)).size,
          n: nums.length,
          lowShare: pct(nums.filter((v) => v <= 2).length, nums.length),
          highShare: pct(nums.filter((v) => v >= 4).length, nums.length),
          ncRate: pct(fleetTrainees.filter((tr) => tr.overall === 'not_competent').length, fleetTrainees.length),
        }
      })
      .filter((s) => s.rows.length > 0)
  }, [scoped, setOfRecord, state.users, g.competencySets])

  const periodLabel = period === 'all' ? 'All records' : `Last ${PERIODS.find((p) => p.key === period)!.months} months`

  const exportCsv = () => {
    const row = csvRow
    let csv = row(['Instructor Connect — Standardisation Report'])
    csv += row([doc.atoName, doc.approvalNumber])
    csv += row(['Period', periodLabel, 'Fleet', fleet || 'All fleets'])
    csv += row(['Generated', formatDateTime(now), 'Generated by', currentUser!.name])
    csv += row(['Thresholds', `watch >= ${WATCH.toFixed(2)}`, `review >= ${REVIEW.toFixed(2)}`, `min ${MIN_GRADES} grades / ${MIN_SESSIONS} sessions`])
    csv += row([])
    sets.forEach((s) => {
      csv += row([`Competency set: ${s.name}`])
      csv += row([
        'Instructor', 'Sessions', 'Grades', 'Mean', 'DeviationFromFleetMean',
        'Grade1', 'Grade2', 'Grade3', 'Grade4', 'Grade5', 'NotObserved',
        'ShareGrade1or2Pct', 'ShareGrade4or5Pct', 'NotCompetentRatePct', 'Assessment',
      ])
      s.rows.forEach((r) => {
        csv += row([
          r.name, r.sessions, r.n, csvNum(r.mean), csvNum(r.delta),
          r.dist['1'], r.dist['2'], r.dist['3'], r.dist['4'], r.dist['5'], r.dist.NO,
          csvNum(r.lowShare), csvNum(r.highShare), csvNum(r.ncRate), t(`grading.std.flag.${r.flag}`),
        ])
      })
      csv += row([
        'Fleet mean', s.sessions, s.n, csvNum(s.overall), '',
        '', '', '', '', '', '',
        csvNum(s.lowShare), csvNum(s.highShare), csvNum(s.ncRate), '',
      ])
      csv += row([])
    })
    const d = new Date(now)
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    downloadCsv(`standardisation-report_${stamp}.csv`, csv)
  }

  const flagCls: Record<Flag, string> = {
    none: 'text-dim',
    watch: 'font-semibold text-warm',
    review: 'font-semibold text-danger',
    insufficient: 'text-dim',
  }

  return (
    <div className="space-y-3 print-landscape">
      {/* Bedienelemente in der Bediensprache — sie stehen nicht auf dem Papier */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={fleet} onChange={(e) => onFleetChange(e.target.value)} className={`${selectCls} w-auto`}>
          <option value="">{tUi('grading.admin.allAircraft')}</option>
          {fleetOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className={`${selectCls} w-auto`}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {tUi(`grading.std.period.${p.key}`)}
            </option>
          ))}
        </select>
        <button
          onClick={() => window.print()}
          className="min-h-11 flex items-center gap-1.5 rounded-xl border border-line/15 px-3 text-[13px] transition hover:bg-line/5"
        >
          <Printer size={15} /> {tUi('grading.print')}
        </button>
        <button
          onClick={exportCsv}
          className="min-h-11 flex items-center gap-1.5 rounded-xl border border-line/15 px-3 text-[13px] transition hover:bg-line/5"
          disabled={sets.length === 0}
        >
          <Table2 size={15} /> {tUi('grading.std.exportCsv')}
        </button>
      </div>

      {/* Kopf des Dokuments: ohne ATO, Zeitraum und Flotte ist ein Ausdruck
          nicht zuordenbar — genau daran scheitern Audits. */}
      <div className="border-b-2 border-line/60 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide">
          {[doc.atoName, doc.approvalNumber].filter(Boolean).join(' · ')}
        </p>
        <h2 className="text-[19px] font-bold tracking-tight">{t('grading.std.title')}</h2>
        <p className="mt-1 flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-[11px] text-dim">
          <span>
            {t('grading.std.period.label')}: {periodLabel} · {t('grading.admin.fleet')}: {fleet || t('grading.admin.allAircraft')}
          </span>
          <span>{t('grading.exportStamp', { date: formatDateTime(now), name: currentUser!.name })}</span>
        </p>
      </div>

      {sets.length === 0 && <p className="pt-4 text-center text-sm text-dim">{t('grading.empty')}</p>}

      {sets.map((s) => (
        <div key={s.key} className="rounded-2xl border border-line/10 bg-surface/60 p-3.5">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-dim">
            {t('grading.std.set')}: <span className="text-ink">{s.name}</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-line/20 text-left text-dim">
                  <th className="py-1.5 pr-2 font-medium">{t('grading.std.instructor')}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t('grading.std.sessionsCol')}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t('grading.std.gradesCol')}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t('grading.std.meanCol')}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t('grading.std.deltaCol')}</th>
                  {['1', '2', '3', '4', '5', 'NO'].map((k) => (
                    <th key={k} className="py-1.5 pr-2 text-right font-medium">
                      {k}
                    </th>
                  ))}
                  <th className="py-1.5 pr-2 text-right font-medium">{t('grading.std.lowCol')}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t('grading.std.highCol')}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t('grading.std.ncCol')}</th>
                  <th className="py-1.5 font-medium">{t('grading.std.assessmentCol')}</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/10">
                    <td className="py-1.5 pr-2 font-medium">{r.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.sessions}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{r.n}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.mean)}</td>
                    <td className={`py-1.5 pr-2 text-right tabular-nums ${flagCls[r.flag]}`}>{fmtDelta(r.delta)}</td>
                    {['1', '2', '3', '4', '5', 'NO'].map((k) => (
                      <td key={k} className="py-1.5 pr-2 text-right tabular-nums text-dim">
                        {r.dist[k] || '–'}
                      </td>
                    ))}
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtPct(r.lowShare)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtPct(r.highShare)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtPct(r.ncRate)}</td>
                    <td className={`py-1.5 ${flagCls[r.flag]}`}>{t(`grading.std.flag.${r.flag}`)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line/30 font-semibold">
                  <td className="py-1.5 pr-2">{t('grading.std.fleetMean')}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{s.sessions}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{s.n}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(s.overall)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">—</td>
                  {['1', '2', '3', '4', '5', 'NO'].map((k) => (
                    <td key={k} className="py-1.5 pr-2" />
                  ))}
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtPct(s.lowShare)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtPct(s.highShare)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtPct(s.ncRate)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {sets.length > 0 && (
        <p className="text-[10.5px] leading-relaxed text-dim">
          {t('grading.std.footnote', { watch: WATCH.toFixed(2), review: REVIEW.toFixed(2), grades: MIN_GRADES, sessions: MIN_SESSIONS })}
        </p>
      )}
    </div>
  )
}
