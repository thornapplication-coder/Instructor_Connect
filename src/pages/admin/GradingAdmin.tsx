import { AlertTriangle, ChevronRight, Clock, Download, RefreshCw, TrendingDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Field, inputCls } from '../../components/ui'
import { navigate } from '../../router'
import { useStore } from '../../store'
import { formatDate, formatDateTime, TrafficDot, trafficLight } from '../Grading'

type Section = 'dashboard' | 'records' | 'config' | 'stats'

/** Durchschnitt der numerischen Noten (NO zählt nicht mit) */
function avgOf(values: (number | 'NO' | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number')
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

function StringList({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  return (
    <Field label={label}>
      <div className="mb-2 flex flex-wrap gap-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[13px]">
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="text-dim hover:text-danger">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className={inputCls} value={draft} placeholder={t('admin.addValue')} onChange={(e) => setDraft(e.target.value)} />
        <Button
          variant="ghost"
          onClick={() => {
            const v = draft.trim()
            if (v && !values.includes(v)) onChange([...values, v])
            setDraft('')
          }}
        >
          +
        </Button>
      </div>
    </Field>
  )
}

export function GradingAdmin() {
  const { t } = useTranslation()
  const { state, currentUser, retryGradingMail, updateGrading } = useStore()
  const [section, setSection] = useState<Section>('dashboard')
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState('')

  const g = state.settings.grading
  const records = state.gradingRecords
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'
  // einheitlich DD.MM.YYYY
  const dateLabel = (ts: number) => formatDate(ts)

  const openSignatures = records.filter((r) => r.status !== 'signed')
  const failedMails = records.filter((r) => r.mailStatus === 'failed')

  /** Trendflag: Kompetenz flottenweit im Schnitt niedrig (Spez. 6.3) */
  const trendFlags = useMemo(() => {
    const byCode: Record<string, (number | 'NO' | null)[]> = {}
    records.forEach((r) => r.trainees.forEach((tr) => tr.grades.forEach((gr) => (byCode[gr.code] ??= []).push(gr.grade))))
    return Object.entries(byCode)
      .map(([code, vals]) => ({ code, avg: avgOf(vals), n: vals.filter((v) => typeof v === 'number').length }))
      .filter((x) => x.avg !== null && x.n >= 2 && x.avg < 3.2)
      .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))
  }, [records])

  /** Instruktor-Kalibrierung: Abweichung vom Gesamtdurchschnitt (Spez. 6.3) */
  const calibration = useMemo(() => {
    const overall = avgOf(records.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.map((x) => x.grade))))
    const byInstr: Record<string, (number | 'NO' | null)[]> = {}
    records.forEach((r) => r.trainees.forEach((tr) => tr.grades.forEach((gr) => (byInstr[r.instructorId] ??= []).push(gr.grade))))
    return {
      overall,
      rows: Object.entries(byInstr)
        .map(([id, vals]) => ({ id, avg: avgOf(vals), sessions: records.filter((r) => r.instructorId === id).length }))
        .filter((r) => r.avg !== null)
        .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)),
    }
  }, [records])

  /** Flotten-Matrix: Kompetenz × Aircraft Type */
  const fleetMatrix = useMemo(() => {
    const fleets = [...new Set(records.map((r) => r.header.aircraftType).filter(Boolean))].sort()
    const codes = [...new Set(records.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.map((x) => x.code))))]
    const cell: Record<string, Record<string, number | null>> = {}
    fleets.forEach((f) => {
      cell[f] = {}
      codes.forEach((c) => {
        const vals = records
          .filter((r) => r.header.aircraftType === f)
          .flatMap((r) => r.trainees.flatMap((tr) => tr.grades.filter((x) => x.code === c).map((x) => x.grade)))
        cell[f][c] = avgOf(vals)
      })
    })
    return { fleets, codes, cell }
  }, [records])

  const filtered = records.filter((r) => {
    if (filterType && r.formTypeId !== filterType) return false
    if (!query) return true
    const hay = [r.formTypeId, userName(r.instructorId), ...r.trainees.map((tr) => userName(tr.traineeId)), ...Object.values(r.header)].join(' ').toLowerCase()
    return hay.includes(query.toLowerCase())
  })

  const exportCsv = (scope: 'records' | 'competencies' | 'people') => {
    // Alle Werte escapen — freie Texte können das Trennzeichen enthalten.
    const esc = (v: unknown) => String(v ?? '').replace(/;/g, ',').replace(/\r?\n/g, ' ')
    const row = (cells: unknown[]) => cells.map(esc).join(';') + '\n'
    // Jeder Export trägt Zeitpunkt und exportierende Person im Kopf.
    let csv = row(['Instructor Connect — Grading Export'])
    csv += row(['Exported (date/time)', formatDateTime(Date.now() + state.timeOffsetMs), 'Exported by', currentUser!.name])
    csv += row([])
    if (scope === 'records') {
      csv += row(['Form', 'Instructor', 'Trainee', 'AircraftType', 'Device', 'Date', 'Overall', 'Session', 'Avg'])
      records.forEach((r) =>
        r.trainees.forEach((tr) => {
          // Durchschnitt je Pilot, nicht des gesamten Formulars
          const avg = avgOf(tr.grades.map((g) => g.grade))
          csv += row([r.formTypeId, userName(r.instructorId), userName(tr.traineeId), r.header.aircraftType, r.header.trainingDevice, r.header.date, tr.overall, r.sessionStatus, avg?.toFixed(2)])
        }),
      )
    } else if (scope === 'competencies') {
      csv += row(['Form', 'Trainee', 'Competency', 'Grade', 'Comment'])
      records.forEach((r) =>
        r.trainees.forEach((tr) =>
          tr.grades.forEach((gr) => {
            csv += row([r.formTypeId, userName(tr.traineeId), gr.code, gr.grade, gr.comment])
          }),
        ),
      )
    } else {
      csv += row(['Person', 'Role', 'Sessions', 'AvgGrade'])
      calibration.rows.forEach((r2) => {
        csv += row([userName(r2.id), 'Instructor', r2.sessions, r2.avg?.toFixed(2)])
      })
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    // Exportzeitpunkt auch im Dateinamen
    const d = new Date(Date.now() + state.timeOffsetMs)
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`
    a.download = `grading-${scope}_${stamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sections: Section[] = ['dashboard', 'records', 'config', 'stats']

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
              section === s ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15 text-dim'
            }`}
          >
            {t(`grading.admin.${s}`)}
          </button>
        ))}
      </div>

      {section === 'dashboard' && (
        <div className="space-y-3">
          {/* Ampel-Legende */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line/10 bg-surface/60 px-3.5 py-2.5 text-[11.5px] text-dim">
            <span className="inline-flex items-center gap-1.5"><TrafficDot color="green" /> {t('grading.traffic.green')}</span>
            <span className="inline-flex items-center gap-1.5"><TrafficDot color="yellow" /> {t('grading.traffic.yellow')}</span>
            <span className="inline-flex items-center gap-1.5"><TrafficDot color="red" /> {t('grading.traffic.red')}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: t('grading.admin.openSignatures'), value: openSignatures.length, icon: Clock, tone: openSignatures.length ? 'text-warm' : 'text-dim' },
              { label: t('grading.admin.failedMails'), value: failedMails.length, icon: AlertTriangle, tone: failedMails.length ? 'text-danger' : 'text-dim' },
              { label: t('grading.admin.trendFlags'), value: trendFlags.length, icon: TrendingDown, tone: trendFlags.length ? 'text-warm' : 'text-dim' },
            ].map((k) => (
              <Card key={k.label} className="flex items-center gap-3 p-4">
                <k.icon size={20} className={k.tone} />
                <div>
                  <p className="text-xl font-bold">{k.value}</p>
                  <p className="text-[12px] text-dim">{k.label}</p>
                </div>
              </Card>
            ))}
          </div>

          {failedMails.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">
                    {r.formTypeId} · {r.trainees.map((tr) => userName(tr.traineeId)).join(', ')}
                  </p>
                  <p className="text-[12.5px] text-dim">{r.mailError}</p>
                </div>
                <Button variant="ghost" onClick={() => retryGradingMail(r.id)} className="flex shrink-0 items-center gap-1.5 py-1.5 text-[12.5px]">
                  <RefreshCw size={13} /> {t('grading.admin.retry')}
                </Button>
              </div>
            </Card>
          ))}

          {openSignatures.map((r) => (
            <Card key={r.id} onClick={() => navigate(`/grading/${r.id}`)} className="flex items-center gap-3 p-4">
              <Clock size={16} className="shrink-0 text-warm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">
                  {r.formTypeId} · {r.trainees.map((tr) => userName(tr.traineeId)).join(', ') || '—'}
                </p>
                <p className="text-[12.5px] text-dim">{t('grading.admin.awaitingSince', { date: dateLabel(r.createdAt) })}</p>
              </div>
              <ChevronRight size={16} className="text-dim" />
            </Card>
          ))}

          {trendFlags.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-dim">
                <TrendingDown size={15} /> {t('grading.admin.trendFlags')}
              </p>
              {trendFlags.map((f) => (
                <div key={f.code} className="flex items-center justify-between border-b border-line/[0.06] py-1.5 text-[13.5px] last:border-0">
                  <span className="font-medium">{f.code}</span>
                  <span className="text-dim">Ø {f.avg!.toFixed(2)} · n={f.n}</span>
                </div>
              ))}
              <p className="mt-2 text-[12px] leading-relaxed text-dim/80">{t('grading.admin.trendHint')}</p>
            </Card>
          )}
        </div>
      )}

      {section === 'records' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('grading.admin.search')} className={`${inputCls} flex-1`} />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-[13.5px]">
              <option value="">{t('grading.admin.allTypes')}</option>
              {[...g.formTypes].sort((a, b) => a.id.localeCompare(b.id)).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id}
                </option>
              ))}
            </select>
          </div>
          {filtered.length === 0 && <p className="pt-4 text-center text-sm text-dim">{t('grading.empty')}</p>}
          {filtered.map((r) => (
            <Card key={r.id} onClick={() => navigate(`/grading/${r.id}`)} className="flex items-center gap-3 p-4">
              <TrafficDot color={trafficLight(r)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">
                  {r.formTypeId} · {r.trainees.map((tr) => userName(tr.traineeId)).join(', ') || '—'}
                </p>
                <p className="truncate text-[12.5px] text-dim">
                  {userName(r.instructorId)} · {r.header.aircraftType} · {dateLabel(r.createdAt)}
                </p>
              </div>
              {r.trainees.some((tr) => tr.overall === 'not_competent') && <Badge tone="warm">{t('grading.notCompetent')}</Badge>}
              <ChevronRight size={16} className="shrink-0 text-dim" />
            </Card>
          ))}
        </div>
      )}

      {section === 'config' && (
        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <StringList label={t('grading.admin.defaultRecipients')} values={g.defaultRecipients} onChange={(v) => updateGrading({ defaultRecipients: v })} />
            <StringList label={t('grading.admin.escalationRecipients')} values={g.escalationRecipients} onChange={(v) => updateGrading({ escalationRecipients: v })} />
            <StringList label={t('grading.admin.deferredRecipients')} values={g.deferredRecipients} onChange={(v) => updateGrading({ deferredRecipients: v })} />
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.admin.competencySets')}</p>
            {g.competencySets.map((set) => (
              <div key={set.key} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-[13.5px] font-semibold">{set.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {set.competencies.map((c) => (
                    <span key={c.code} className="rounded-full bg-raised px-2.5 py-1 text-[12px]" title={c.title}>
                      {c.code}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <p className="mt-2 text-[12px] leading-relaxed text-dim/80">{t('grading.admin.competencyHint')}</p>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.admin.formTypes')}</p>
            {[...g.formTypes].sort((a, b) => a.id.localeCompare(b.id)).map((f) => (
              <div key={f.id} className="border-b border-line/[0.06] py-2 last:border-0">
                <p className="text-[13.5px] font-medium">
                  {f.id} — {f.title}
                </p>
                <p className="text-[12px] text-dim">
                  {f.fields.filter((x) => x.required).length} {t('grading.admin.requiredFields')} · {f.fields.length} {t('grading.admin.fieldsTotal')}
                </p>
              </div>
            ))}
          </Card>
        </div>
      )}

      {section === 'stats' && (
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.admin.calibration')}</p>
            <p className="mb-2 text-[12.5px] text-dim">
              {t('grading.admin.overallAvg')}: <span className="font-semibold text-ink">{calibration.overall?.toFixed(2) ?? '–'}</span>
            </p>
            {calibration.rows.map((row) => {
              const diff = (row.avg ?? 0) - (calibration.overall ?? 0)
              return (
                <div key={row.id} className="flex items-center justify-between border-b border-line/[0.06] py-2 text-[13.5px] last:border-0">
                  <span className="min-w-0 flex-1 truncate">{userName(row.id)}</span>
                  <span className="mx-3 text-[12px] text-dim">
                    {row.sessions} {t('grading.admin.sessions')}
                  </span>
                  <span className="w-14 text-right font-semibold">{row.avg?.toFixed(2)}</span>
                  <span className={`w-16 text-right text-[12.5px] ${Math.abs(diff) >= 0.5 ? 'font-semibold text-warm' : 'text-dim'}`}>
                    {diff >= 0 ? '+' : ''}
                    {diff.toFixed(2)}
                  </span>
                </div>
              )
            })}
            <p className="mt-2 text-[12px] leading-relaxed text-dim/80">{t('grading.admin.calibrationHint')}</p>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.admin.fleetMatrix')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-dim">
                    <th className="p-1.5 text-left font-medium">{t('grading.admin.fleet')}</th>
                    {fleetMatrix.codes.map((c) => (
                      <th key={c} className="p-1.5 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fleetMatrix.fleets.map((f) => (
                    <tr key={f}>
                      <td className="p-1.5 font-medium">{f}</td>
                      {fleetMatrix.codes.map((c) => {
                        const v = fleetMatrix.cell[f][c]
                        const tone = v === null ? 'text-dim' : v >= 4 ? 'bg-emerald-500/20' : v >= 3 ? 'bg-emerald-700/20' : v >= 2 ? 'bg-amber-500/20' : 'bg-red-500/20'
                        return (
                          <td key={c} className="p-1">
                            <span className={`block rounded px-1 py-1 text-center ${tone}`}>{v === null ? '–' : v.toFixed(1)}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.admin.export')}</p>
            <div className="flex flex-wrap gap-2">
              {(['records', 'competencies', 'people'] as const).map((s) => (
                <Button key={s} variant="ghost" onClick={() => exportCsv(s)} className="flex items-center gap-1.5 text-[13px]">
                  <Download size={14} /> {t(`grading.admin.export_${s}`)}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-dim/80">{t('grading.admin.exportHint')}</p>
          </Card>
        </div>
      )}
    </div>
  )
}
