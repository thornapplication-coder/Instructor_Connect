import { AlertTriangle, ChevronRight, Clock, Download, Pencil, Plus, RefreshCw, Trash2, TrendingDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Field, inputCls } from '../../components/ui'
import { csvRow, downloadCsv } from '../../csv'
import { navigate } from '../../router'
import { useStore } from '../../store'
import { HEAD_STANDARD } from '../../sandbox/gradingDefaults'
import type { Competency, CompetencySet, CompetencySetKey, FormType } from '../../types'
import { formatDate, formatDateTime, TrafficDot, trafficLight, type TrafficColor } from '../Grading'

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

/** Kompetenzen samt Observable Behaviours anlegen, bearbeiten, löschen */
function CompetencySetEditor({ set, onChange }: { set: CompetencySet; onChange: (competencies: Competency[]) => void }) {
  const { t } = useTranslation()
  // Code der bearbeiteten Kompetenz oder '__new__' für einen neuen Eintrag
  const [editCode, setEditCode] = useState<string | null>(null)
  const [draft, setDraft] = useState({ code: '', title: '', behaviours: '' })

  const startEdit = (c?: Competency) => {
    setEditCode(c ? c.code : '__new__')
    setDraft(c ? { code: c.code, title: c.title, behaviours: c.behaviours.join('\n') } : { code: '', title: '', behaviours: '' })
  }

  const save = () => {
    const comp: Competency = {
      code: draft.code.trim().toUpperCase(),
      title: draft.title.trim(),
      behaviours: draft.behaviours.split('\n').map((b) => b.trim()).filter(Boolean),
    }
    if (!comp.code || !comp.title) return
    onChange(editCode === '__new__' ? [...set.competencies, comp] : set.competencies.map((c) => (c.code === editCode ? comp : c)))
    setEditCode(null)
  }

  const editorForm = (
    <div className="mt-2 space-y-2.5 rounded-xl border border-accent/30 bg-bg/40 p-3">
      <div className="flex gap-2">
        <Field label={t('grading.admin.codeLabel')}>
          <input className={`${inputCls} w-24 font-mono uppercase`} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
        </Field>
        <div className="flex-1">
          <Field label={t('grading.admin.titleLabel')}>
            <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
        </div>
      </div>
      <Field label={t('grading.admin.obLabel')}>
        <textarea className={`${inputCls} min-h-28 text-[12.5px]`} value={draft.behaviours} onChange={(e) => setDraft({ ...draft, behaviours: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditCode(null)}>{t('common.cancel')}</Button>
        <Button disabled={!draft.code.trim() || !draft.title.trim()} onClick={save}>{t('common.save')}</Button>
      </div>
    </div>
  )

  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1.5 text-[13.5px] font-semibold">{set.name}</p>
      <div className="divide-y divide-line/[0.06] rounded-xl border border-line/10">
        {set.competencies.map((c) => (
          <div key={c.code} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-[12.5px] font-semibold">{c.code}</span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{c.title}</span>
              <span className="shrink-0 text-[11.5px] text-dim">{c.behaviours.length} OB</span>
              <button onClick={() => startEdit(c)} title={t('common.edit')} className="shrink-0 rounded-lg p-1.5 text-dim hover:text-accent">
                <Pencil size={14} />
              </button>
              <button
                onClick={() => window.confirm(t('grading.admin.deleteCompetencyConfirm')) && onChange(set.competencies.filter((x) => x.code !== c.code))}
                title={t('common.delete')}
                className="shrink-0 rounded-lg p-1.5 text-dim hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {editCode === c.code && editorForm}
          </div>
        ))}
        <div className="px-3 py-2">
          <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
            <Plus size={14} /> {t('grading.admin.addCompetency')}
          </button>
          {editCode === '__new__' && editorForm}
        </div>
      </div>
    </div>
  )
}

/** Formulartypen: Namen editieren, neue anlegen, löschen */
function FormTypeEditor({ formTypes, onChange }: { formTypes: FormType[]; onChange: (types: FormType[]) => void }) {
  const { t } = useTranslation()
  // ID des bearbeiteten Typs oder '__new__'
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ id: '', title: '', scheme: 'pilot' as CompetencySetKey | 'none' })

  const startEdit = (f?: FormType) => {
    setEditId(f ? f.id : '__new__')
    setDraft(f ? { id: f.id, title: f.title, scheme: f.competencySet ?? 'none' } : { id: '', title: '', scheme: 'pilot' })
  }

  const idTaken = editId === '__new__' && formTypes.some((f) => f.id.toUpperCase() === draft.id.trim().toUpperCase())

  const save = () => {
    const id = draft.id.trim().toUpperCase()
    const title = draft.title.trim()
    if (!id || !title || idTaken) return
    if (editId === '__new__') {
      // Neue Typen erhalten die Standard-Kopffelder; ohne Bewertungsschema
      // nur die Basisdaten plus einen Freitextabschnitt.
      const competencySet = draft.scheme === 'none' ? null : draft.scheme
      const fields = competencySet
        ? HEAD_STANDARD
        : HEAD_STANDARD.filter((f) => ['aircraftType', 'date', 'event'].includes(f.key))
      onChange([...formTypes, { id, title, competencySet, fields, freeTextSections: competencySet ? [] : ['Notes'] }])
    } else {
      // Bearbeiten: nur der Name ist änderbar — die Nummer identifiziert
      // bestehende Formulare und bleibt daher fix.
      onChange(formTypes.map((f) => (f.id === editId ? { ...f, title } : f)))
    }
    setEditId(null)
  }

  return (
    <div className="divide-y divide-line/[0.06] rounded-xl border border-line/10">
      {[...formTypes].sort((a, b) => a.id.localeCompare(b.id)).map((f) => (
        <div key={f.id} className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 font-mono text-[12.5px] font-semibold">{f.id}</span>
            <span className="min-w-0 flex-1 truncate text-[13px]">{f.title}</span>
            <span className="shrink-0 text-[11.5px] text-dim">
              {f.fields.filter((x) => x.required).length} {t('grading.admin.requiredFields')} · {f.fields.length} {t('grading.admin.fieldsTotal')}
            </span>
            <button onClick={() => startEdit(f)} title={t('common.edit')} className="shrink-0 rounded-lg p-1.5 text-dim hover:text-accent">
              <Pencil size={14} />
            </button>
            <button
              onClick={() => window.confirm(t('grading.admin.deleteFormTypeConfirm')) && onChange(formTypes.filter((x) => x.id !== f.id))}
              title={t('common.delete')}
              className="shrink-0 rounded-lg p-1.5 text-dim hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {editId === f.id && (
            <div className="mt-2 space-y-2.5 rounded-xl border border-accent/30 bg-bg/40 p-3">
              <Field label={t('grading.admin.titleLabel')}>
                <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditId(null)}>{t('common.cancel')}</Button>
                <Button disabled={!draft.title.trim()} onClick={save}>{t('common.save')}</Button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="px-3 py-2">
        <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
          <Plus size={14} /> {t('grading.admin.addFormType')}
        </button>
        {editId === '__new__' && (
          <div className="mt-2 space-y-2.5 rounded-xl border border-accent/30 bg-bg/40 p-3">
            <div className="flex gap-2">
              <Field label={t('grading.admin.formIdLabel')}>
                <input className={`${inputCls} w-28 font-mono uppercase`} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} autoFocus />
              </Field>
              <div className="flex-1">
                <Field label={t('grading.admin.titleLabel')}>
                  <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label={t('grading.admin.schemeLabel')}>
              <select
                value={draft.scheme}
                onChange={(e) => setDraft({ ...draft, scheme: e.target.value as CompetencySetKey | 'none' })}
                className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
              >
                <option value="pilot">{t('grading.admin.schemePilot')}</option>
                <option value="instructor">{t('grading.admin.schemeInstructor')}</option>
                <option value="none">{t('grading.admin.schemeNone')}</option>
              </select>
            </Field>
            {idTaken && <p className="text-[12.5px] text-danger">{t('grading.admin.formIdTaken')}</p>}
            <p className="text-[11.5px] leading-relaxed text-dim/80">{t('grading.admin.newFormHint')}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditId(null)}>{t('common.cancel')}</Button>
              <Button disabled={!draft.id.trim() || !draft.title.trim() || idTaken} onClick={save}>{t('common.save')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function GradingAdmin() {
  const { t } = useTranslation()
  const { state, currentUser, retryGradingMail, updateGrading } = useStore()
  const [section, setSection] = useState<Section>('dashboard')
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [trafficFilter, setTrafficFilter] = useState<TrafficColor | ''>('')

  const g = state.settings.grading
  // Neueste immer zuoberst
  const records = [...state.gradingRecords].sort((a, b) => b.createdAt - a.createdAt)
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'
  const traineeLabel = (tr: { traineeName?: string; traineeId: string }) => tr.traineeName || userName(tr.traineeId)
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
    if (trafficFilter && trafficLight(r) !== trafficFilter) return false
    if (!query) return true
    const hay = [r.formTypeId, userName(r.instructorId), ...r.trainees.map(traineeLabel), ...Object.values(r.header)].join(' ').toLowerCase()
    return hay.includes(query.toLowerCase())
  })

  const exportCsv = (scope: 'records' | 'competencies' | 'people') => {
    // csvRow escapet Trennzeichen und entschärft Formelzeichen (siehe csv.ts).
    const row = csvRow
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
          csv += row([r.formTypeId, userName(r.instructorId), traineeLabel(tr), r.header.aircraftType, r.header.trainingDevice, r.header.date, tr.overall, r.sessionStatus, avg?.toFixed(2)])
        }),
      )
    } else if (scope === 'competencies') {
      csv += row(['Form', 'Trainee', 'Competency', 'Grade', 'Comment'])
      records.forEach((r) =>
        r.trainees.forEach((tr) =>
          tr.grades.forEach((gr) => {
            csv += row([r.formTypeId, traineeLabel(tr), gr.code, gr.grade, gr.comment])
          }),
        ),
      )
    } else {
      csv += row(['Person', 'Role', 'Sessions', 'AvgGrade'])
      calibration.rows.forEach((r2) => {
        csv += row([userName(r2.id), 'Instructor', r2.sessions, r2.avg?.toFixed(2)])
      })
    }
    // Exportzeitpunkt auch im Dateinamen
    const d = new Date(Date.now() + state.timeOffsetMs)
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`
    downloadCsv(`grading-${scope}_${stamp}.csv`, csv)
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
                    {r.formTypeId} · {r.trainees.map(traineeLabel).join(', ')}
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
                  {r.formTypeId} · {r.trainees.map(traineeLabel).join(', ') || '—'}
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
          {/* Ampel-Filter */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-dim">
            <button
              onClick={() => setTrafficFilter('')}
              className={`rounded-full border px-2.5 py-1 transition ${trafficFilter === '' ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15'}`}
            >
              {t('grading.traffic.all')}
            </button>
            {(['green', 'yellow', 'red'] as TrafficColor[]).map((c) => (
              <button
                key={c}
                onClick={() => setTrafficFilter(trafficFilter === c ? '' : c)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
                  trafficFilter === c ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line/15'
                }`}
              >
                <TrafficDot color={c} /> {t(`grading.traffic.${c}`)}
              </button>
            ))}
          </div>
          {filtered.length === 0 && <p className="pt-4 text-center text-sm text-dim">{t('grading.empty')}</p>}
          {filtered.map((r) => (
            <Card key={r.id} onClick={() => navigate(`/grading/${r.id}`)} className="flex items-center gap-3 p-4">
              <TrafficDot color={trafficLight(r)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">
                  {r.formTypeId} · {r.trainees.map(traineeLabel).join(', ') || '—'}
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
              <CompetencySetEditor
                key={set.key}
                set={set}
                onChange={(competencies) =>
                  updateGrading({ competencySets: g.competencySets.map((s) => (s.key === set.key ? { ...s, competencies } : s)) })
                }
              />
            ))}
            <p className="mt-2 text-[12px] leading-relaxed text-dim/80">{t('grading.admin.competencyHint')}</p>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.admin.formTypes')}</p>
            <FormTypeEditor formTypes={g.formTypes} onChange={(formTypes) => updateGrading({ formTypes })} />
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
