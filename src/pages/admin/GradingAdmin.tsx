import { Eye, EyeOff, AlertTriangle, ArrowLeft, BarChart3, ChevronRight, Clock, Download, FolderOpen, Gauge, ListChecks, Pencil, Plus, RefreshCw, Scale, SlidersHorizontal, CalendarRange, Trash2, TrendingDown, UserRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeading, Field, inputCls, selectCls } from '../../components/ui'
import { downloadCsv } from '../../csv'
import { toast } from '../../components/Toast'
import { avgOf, buildGradingCsv, gradingCsvName } from '../../gradingExport'
import { navigate } from '../../router'
import { useStore } from '../../store'
import { HEAD_STANDARD } from '../../sandbox/gradingDefaults'
import type { Competency, CompetencySet, CompetencySetKey, FormField, FormType, GradingRecord } from '../../types'
import { gradingListDate } from '../../gradingRules'
import { formatDate, formatDateTime, missingFollowUps, TrafficIcon, traineesOf, trafficLight, type TrafficColor } from '../Grading'
import { StandardisationReport } from './StandardisationReport'
import { TraineeHistory } from './TraineeHistory'
import { MonthlyReport } from './MonthlyReport'
import { gradingListComparator } from '../../gradingRules'
import { authorityOf, PERIODS, periodLabel, scopeRecords, statsBySet as computeStatsBySet, type PeriodKey } from '../../gradingStats'

type Section = 'dashboard' | 'records' | 'config' | 'stats' | 'standardisation' | 'trainees' | 'monthly'
const SECTIONS: Section[] = ['dashboard', 'records', 'trainees', 'monthly', 'stats', 'standardisation', 'config']

function StringList({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  return (
    <Field label={label} group>
      <div className="mb-2 flex flex-wrap gap-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-small">
            {v}
            <button
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`${t('common.delete')}: ${v}`}
              className="text-dim hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className={inputCls} value={draft} aria-label={label} placeholder={t('admin.addValue')} onChange={(e) => setDraft(e.target.value)} />
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
  // Das Instruktoren-Blatt (308G) kennt keine Kürzel — sie werden hier weder
  // angezeigt noch eingegeben, intern aber weiter als Schlüssel geführt.
  const hideCodes = set.key === 'instructor'

  /** Schlüssel aus dem Titel ableiten, wenn kein Kürzel eingegeben wird */
  const codeFromTitle = (title: string, taken: string[]) => {
    const base = (title.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'CMP').padEnd(3, 'X')
    let code = base
    for (let n = 2; taken.includes(code); n++) code = `${base}${n}`
    return code
  }

  const startEdit = (c?: Competency) => {
    setEditCode(c ? c.code : '__new__')
    setDraft(c ? { code: c.code, title: c.title, behaviours: c.behaviours.join('\n') } : { code: '', title: '', behaviours: '' })
  }

  const save = () => {
    const title = draft.title.trim()
    const taken = set.competencies.filter((c) => c.code !== editCode).map((c) => c.code)
    const comp: Competency = {
      code: draft.code.trim().toUpperCase() || codeFromTitle(title, taken),
      title,
      behaviours: draft.behaviours.split('\n').map((b) => b.trim()).filter(Boolean),
    }
    if (!comp.code || !comp.title) return
    onChange(editCode === '__new__' ? [...set.competencies, comp] : set.competencies.map((c) => (c.code === editCode ? comp : c)))
    setEditCode(null)
  }

  const editorForm = (
    <div className="mt-2 space-y-stack rounded-xl border border-accent/30 bg-bg/40 p-3">
      <div className="flex gap-2">
        {!hideCodes && (
          <Field label={t('forms:admin.codeLabel')}>
            <input className={`${inputCls} w-24 font-mono uppercase`} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          </Field>
        )}
        <div className="flex-1">
          <Field label={t('forms:admin.titleLabel')}>
            <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
        </div>
      </div>
      <Field label={t('forms:admin.obLabel')}>
        <textarea className={`${inputCls} min-h-28 text-micro`} value={draft.behaviours} onChange={(e) => setDraft({ ...draft, behaviours: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditCode(null)}>{t('common.cancel')}</Button>
        <Button disabled={(!hideCodes && !draft.code.trim()) || !draft.title.trim()} onClick={save}>{t('common.save')}</Button>
      </div>
    </div>
  )

  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1.5 text-small font-semibold">{set.name}</p>
      <div className="divide-y divide-line/[0.06] rounded-xl border border-line/10">
        {set.competencies.map((c) => (
          <div key={c.code} className="px-3 py-2">
            <div className="flex items-center gap-2">
              {!hideCodes && <span className="w-12 shrink-0 font-mono text-micro font-semibold">{c.code}</span>}
              <span className="min-w-0 flex-1 truncate text-small">{c.title}</span>
              <span className="shrink-0 text-micro text-dim">{c.behaviours.length} OB</span>
              <button onClick={() => startEdit(c)} title={t('common.edit')} className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim hover:text-accent">
                <Pencil size={14} />
              </button>
              <button
                onClick={() => window.confirm(t('forms:admin.deleteCompetencyConfirm')) && onChange(set.competencies.filter((x) => x.code !== c.code))}
                title={t('common.delete')}
                className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {editCode === c.code && editorForm}
          </div>
        ))}
        <div className="px-3 py-2">
          <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-small font-medium text-accent hover:underline">
            <Plus size={14} /> {t('forms:admin.addCompetency')}
          </button>
          {editCode === '__new__' && editorForm}
        </div>
      </div>
    </div>
  )
}

/**
 * Auswahlwerte eines Formularfeldes pflegen (hinzufügen, umbenennen,
 * löschen) — deckt alle Dropdowns/Ankreuzlisten ab: Event, Location,
 * Varianten, Conv. From/To, ATA-Kapitel, PRG, Operation usw.
 */
function FieldOptionsEditor({ field, onChange }: { field: FormField; onChange: (options: string[]) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const options = field.options ?? []
  const add = () => {
    const v = draft.trim()
    if (v && !options.includes(v)) onChange([...options, v])
    setDraft('')
  }
  return (
    <div className="rounded-xl border border-line/10 p-2.5">
      <p className="mb-1.5 text-micro font-medium">
        {field.label} <span className="text-dim">· {field.type}</span>
      </p>
      {/* Die Musterliste gilt app-weit und wird in den Einstellungen gepflegt */}
      {field.key === 'aircraftType' ? (
        <p className="text-micro leading-relaxed text-dim">{t('forms:admin.aircraftCentral')}</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {options.map((o) => (
              <span key={o} className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-micro">
                <input
                  value={o}
                  onChange={(e) => onChange(options.map((x) => (x === o ? e.target.value : x)))}
                  className="w-auto min-w-16 border-0 bg-transparent p-0 text-micro outline-none"
                  size={Math.max(o.length, 4)}
                />
                <button onClick={() => onChange(options.filter((x) => x !== o))} className="text-dim hover:text-danger">
                  <X size={12} />
                </button>
              </span>
            ))}
            {options.length === 0 && <span className="text-micro text-dim">—</span>}
          </div>
          <div className="flex gap-2">
            <input
              className={`${inputCls} text-small`}
              value={draft}
              placeholder={t('admin.addValue')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <Button variant="ghost" onClick={add}>
              <Plus size={15} />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function FormTypeEditor({ formTypes, onChange }: { formTypes: FormType[]; onChange: (types: FormType[]) => void }) {
  const { t } = useTranslation()
  // ID des bearbeiteten Typs oder '__new__'
  const [editId, setEditId] = useState<string | null>(null)
  // Formulartyp, dessen Auswahlwerte gerade gepflegt werden
  const [optionsId, setOptionsId] = useState<string | null>(null)
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
            <span className="w-14 shrink-0 font-mono text-micro font-semibold">{f.id}</span>
            <span className="min-w-0 flex-1 truncate text-small">{f.title}</span>
            <span className="shrink-0 text-micro text-dim">
              {f.fields.filter((x) => x.required).length} {t('forms:admin.requiredFields')} · {f.fields.length} {t('forms:admin.fieldsTotal')}
            </span>
            <button onClick={() => startEdit(f)} title={t('common.edit')} className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim hover:text-accent">
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setOptionsId(optionsId === f.id ? null : f.id)}
              title={t('forms:admin.editOptions')}
              className={`shrink-0 rounded-lg p-1.5 transition ${optionsId === f.id ? 'text-accent' : 'text-dim hover:text-accent'}`}
            >
              <ListChecks size={14} />
            </button>
            <button
              onClick={() => window.confirm(t('forms:admin.deleteFormTypeConfirm')) && onChange(formTypes.filter((x) => x.id !== f.id))}
              title={t('common.delete')}
              className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {/* Auswahlwerte aller Felder dieses Formulars pflegen */}
          {optionsId === f.id && (
            <div className="mt-2 space-y-stack rounded-xl border border-accent/30 bg-bg/40 p-3">
              <p className="text-micro leading-relaxed text-dim">{t('forms:admin.editOptionsHint')}</p>
              {f.fields.filter((fl) => ['select', 'radiogroup', 'checkgroup'].includes(fl.type)).map((fl) => (
                <FieldOptionsEditor
                  key={fl.key}
                  field={fl}
                  onChange={(options) =>
                    onChange(
                      formTypes.map((x) =>
                        x.id === f.id ? { ...x, fields: x.fields.map((y) => (y.key === fl.key ? { ...y, options } : y)) } : x,
                      ),
                    )
                  }
                />
              ))}
            </div>
          )}
          {editId === f.id && (
            <div className="mt-2 space-y-stack rounded-xl border border-accent/30 bg-bg/40 p-3">
              <Field label={t('forms:admin.titleLabel')}>
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
        <button onClick={() => startEdit()} className="flex items-center gap-1.5 text-small font-medium text-accent hover:underline">
          <Plus size={14} /> {t('forms:admin.addFormType')}
        </button>
        {editId === '__new__' && (
          <div className="mt-2 space-y-stack rounded-xl border border-accent/30 bg-bg/40 p-3">
            <div className="flex gap-2">
              <Field label={t('forms:admin.formIdLabel')}>
                <input className={`${inputCls} w-28 font-mono uppercase`} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} autoFocus />
              </Field>
              <div className="flex-1">
                <Field label={t('forms:admin.titleLabel')}>
                  <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label={t('forms:admin.schemeLabel')}>
              <select
                value={draft.scheme}
                onChange={(e) => setDraft({ ...draft, scheme: e.target.value as CompetencySetKey | 'none' })}
                className={selectCls}
              >
                <option value="pilot">{t('forms:admin.schemePilot')}</option>
                <option value="instructor">{t('forms:admin.schemeInstructor')}</option>
                <option value="none">{t('forms:admin.schemeNone')}</option>
              </select>
            </Field>
            {idTaken && <p className="text-micro text-danger">{t('forms:admin.formIdTaken')}</p>}
            <p className="text-micro leading-relaxed text-dim">{t('forms:admin.newFormHint')}</p>
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

/** @param section Zweites Adresssegment (#/admin/grading/<section>) —
 *  leer zeigt die Kachelübersicht der Ablage. */
export function GradingAdmin({ section: sectionSeg = '' }: { section?: string }) {
  const { t } = useTranslation()
  const { state, currentUser, retryGradingMail, updateGrading, deleteGradingRecord, unhideGradingRecord } = useStore()
  const section = SECTIONS.includes(sectionSeg as Section) ? (sectionSeg as Section) : null
  // Unbekannter Unterbereich: Adresse ehrlich auf die Übersicht der Ablage
  // zurücksetzen, statt sie stehen zu lassen.
  useEffect(() => {
    if (sectionSeg && !section) navigate('/admin/grading', true)
  }, [sectionSeg, section])
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [trafficFilter, setTrafficFilter] = useState<TrafficColor | ''>('')
  /** Nur Blätter zeigen, die mindestens ein Nutzer ausgeblendet hat */
  const [onlyHidden, setOnlyHidden] = useState(false)
  // Filter nach Trainee (Standard-Sicht), Instruktor und Aircraft Type
  const [filterTrainee, setFilterTrainee] = useState('')
  const [filterInstructor, setFilterInstructor] = useState('')
  const [filterAircraft, setFilterAircraft] = useState('')
  // Zeitraum: beliebig / 24h / 7 Tage / Monat / Jahr
  const [filterPeriod, setFilterPeriod] = useState('all')
  // Behörden-Filter der Formularliste (AT.ATO.106 / GBR.ATO.0541)
  const [filterAuthority, setFilterAuthority] = useState<'' | 'AT' | 'UK'>('')
  // Statistik: leer = gesamte Flotte, sonst ein einzelner Aircraft Type
  const [statsFleet, setStatsFleet] = useState('')
  // Zeitraum gilt für Kalibrierung UND Standardisierungsbericht. Vorher kannte
  // nur der Bericht einen Zeitraum, die Kalibrierung rechnete über alles —
  // dieselbe Frage bekam dadurch zwei verschiedene Antworten.
  const [statsPeriod, setStatsPeriod] = useState<PeriodKey>('12m')
  // Behörde für Statistik UND Standardisierungsbericht — beide zeigen
  // denselben Ausschnitt (siehe statsRecords, StandardisationReport).
  const [statsAuthority, setStatsAuthority] = useState<'' | 'AT' | 'UK'>('')

  const g = state.settings.grading
  const doc = state.settings.documentHeader ?? { atoName: '', approvalNumber: '', approvalNumberUK: '', formRevision: '' }
  // Neueste immer zuoberst — memoisiert, damit die Statistik-Aggregationen
  // nicht bei jedem Tastendruck im Suchfeld neu rechnen.
  const records = useMemo(() => [...state.gradingRecords].sort(gradingListComparator(state.gradingRecords)), [state.gradingRecords])
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'
  const traineeLabel = (tr: { traineeName?: string; traineeId: string }) => tr.traineeName || userName(tr.traineeId)
  // einheitlich DD.MM.YYYY
  const dateLabel = (ts: number) => formatDate(ts)

  const openSignatures = records.filter((r) => r.status !== 'signed')
  const failedMails = records.filter((r) => r.mailStatus === 'failed')
  /** Formulare, zu denen ein Pflicht-Folgeformular (306/310) fehlt */
  const openFollowUps = records.filter((r) => missingFollowUps(r, records).length > 0)

  /** Kompetenzsatz eines Formulars — Piloten (308A–F/H) oder Instruktoren (308G) */
  const setOfRecord = useCallback(
    (r: GradingRecord): CompetencySetKey | null => g.formTypes.find((f) => f.id === r.formTypeId)?.competencySet ?? null,
    [g.formTypes],
  )

  /** Datenbasis der Statistik — dieselben Regeln wie im
   *  Standardisierungsbericht (nur unterschriebene Formulare, keine
   *  Folgeformulare, Zeitraum über den Schulungstag). Beide Ansichten
   *  beantworten damit dieselbe Frage gleich. */
  const statsRecords = useMemo(
    () => scopeRecords(records, { fleet: statsFleet, authority: statsAuthority, period: statsPeriod, now: Date.now() + state.timeOffsetMs }),
    [records, statsFleet, statsAuthority, statsPeriod, state.timeOffsetMs],
  )

  /** Kalibrierung je Kompetenzsatz aus dem gemeinsamen Modul. */
  const calibrationSets = useMemo(() => computeStatsBySet(statsRecords, setOfRecord), [statsRecords, setOfRecord])

  /** Ein Durchgang kann mehrere Formulare ergeben (ein Blatt je Pilot) —
   *  gezählt wird der Durchgang, Folgeformulare zählen nicht mit. */
  const sessionCount = useCallback(
    (rs: GradingRecord[]) => new Set(rs.filter((r) => !r.parentId).map((r) => r.batchId ?? r.id)).size,
    [],
  )

  /**
   * Auswertung je Kompetenzsatz. Piloten- und Instruktorenbewertungen folgen
   * unterschiedlichen Maßstäben und dürfen nie gegeneinander gerechnet werden:
   * ein Instruktor, der viele 308G schreibt, wäre sonst gegen Piloten-
   * Durchschnitte kalibriert.
   */
  const statsBySet = useMemo(() => {
    const sets: CompetencySetKey[] = ['pilot', 'instructor']
    return sets
      .map((key) => {
        const rs = statsRecords.filter((r) => setOfRecord(r) === key)
        const allOfSet = records.filter((r) => setOfRecord(r) === key)
        // Beschriftung aus dem eingefrorenen Wortlaut des Formulars, sonst aus
        // dem Katalog. Das 308G führt keine Kürzel — dort wird ausgeschrieben.
        const catalogue = g.competencySets.find((c) => c.key === key)
        const labelOf = (code: string) => {
          if (key !== 'instructor') return code
          const fromRecord = allOfSet.flatMap((r) => r.competencies ?? []).find((c) => c.code === code)?.title
          return fromRecord ?? catalogue?.competencies.find((c) => c.code === code)?.title ?? code
        }

        const byCode: Record<string, (number | 'NO' | null)[]> = {}
        rs.forEach((r) => r.trainees.forEach((tr) => tr.grades.forEach((gr) => (byCode[gr.code] ??= []).push(gr.grade))))
        const trendFlags = Object.entries(byCode)
          .map(([code, vals]) => ({
            code,
            label: labelOf(code),
            avg: avgOf(vals),
            // n zählt bewertete Durchgänge, nicht einzelne Noten — sonst hebt
            // ein einziger Durchgang eine flottenweite Auffälligkeit.
            n: new Set(
              rs
                .filter((r) => r.trainees.some((tr) => tr.grades.some((x) => x.code === code && typeof x.grade === 'number')))
                .map((r) => r.batchId ?? r.id),
            ).size,
          }))
          .filter((x) => x.avg !== null && x.n >= 2 && x.avg < 3.2)
          .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))

        // Aus dem gemeinsamen Modul, damit Kachel und Bericht nicht
        // auseinanderlaufen können.
        const shared = calibrationSets.find((c) => c.key === key)
        // Abweichung UND Kennzeichnung kommen mit — die Kachel rechnete die
        // Abweichung vorher selbst nach und beurteilte sie mit einer eigenen
        // Schwelle (0,50, ohne Mindestdatenmenge). Damit gab es zwei
        // Antworten auf dieselbe Frage: Der Monatsbericht meldete bei 0,45
        // bereits „beobachten", die Kachel schwieg; bei acht Noten meldete
        // die Kachel eine Auffaelligkeit, wo der Bericht ehrlich „zu wenig
        // Daten" sagte.
        const calibration = {
          overall: shared?.overall ?? null,
          rows: (shared?.rows ?? []).map((r) => ({ id: r.id, avg: r.mean, sessions: r.sessions, delta: r.delta, flag: r.flag })),
        }

        const fleets = [...new Set(allOfSet.map((r) => r.header.aircraftType).filter(Boolean))].sort()
        const codes = [...new Set(allOfSet.flatMap((r) => r.trainees.flatMap((tr) => tr.grades.map((x) => x.code))))]
        const cell: Record<string, Record<string, number | null>> = {}
        fleets.forEach((f) => {
          cell[f] = {}
          codes.forEach((c) => {
            const vals = allOfSet
              .filter((r) => r.header.aircraftType === f)
              .flatMap((r) => r.trainees.flatMap((tr) => tr.grades.filter((x) => x.code === c).map((x) => x.grade)))
            cell[f][c] = avgOf(vals)
          })
        })

        return {
          key,
          name: catalogue?.name ?? key,
          sessions: sessionCount(rs),
          trendFlags,
          calibration,
          fleetMatrix: { fleets, codes, cell, labelOf },
        }
      })
      .filter((x) => x.calibration.rows.length > 0 || x.fleetMatrix.fleets.length > 0)
  }, [statsRecords, records, setOfRecord, g.competencySets, sessionCount, calibrationSets])

  // Auswahllisten aus den vorhandenen Formularen ableiten
  // Folgeformulare (306/310) führen ihren Piloten in den Kopfdaten —
  // ohne traineesOf fielen sie aus Filter und Suche heraus.
  const traineeOptions = [...new Set(records.flatMap((r) => traineesOf(r, records).map(traineeLabel)))].filter((n) => n !== '—').sort()
  // Wie bei den Mustern: alle, die Formulare führen dürfen, plus die aus
  // Altdaten — nicht nur die, von denen bereits etwas vorliegt.
  const instructorOptions = [
    ...new Set([
      ...state.users.filter((u) => u.active && u.canGrade).map((u) => u.id),
      ...records.map((r) => r.instructorId),
    ]),
  ]
    .map((id) => ({ id, name: userName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  // Muster kommen aus der zentralen Liste in den Einstellungen, nicht aus den
  // vorhandenen Formularen: eine Flotte ohne abgelegtes Formular ließ sich
  // sonst gar nicht erst auswählen — dabei ist genau das eine Auskunft
  // („für die ATR liegt nichts vor"). Muster aus Altdaten, die nicht mehr in
  // den Einstellungen stehen, werden ergänzt, damit nichts unfilterbar wird.
  const aircraftOptions = [
    ...new Set([...state.settings.aircraftTypes, ...records.map((r) => r.header.aircraftType).filter(Boolean)]),
  ].sort((a, b) => a.localeCompare(b))

  const PERIOD_DAYS: Record<string, number | null> = { all: null, day: 1, week: 7, month: 31, year: 365 }
  const filtered = records.filter((r) => {
    const days = PERIOD_DAYS[filterPeriod]
    if (days && Date.now() + state.timeOffsetMs - r.createdAt > days * 24 * 3600_000) return false
    if (onlyHidden && !r.hiddenFor?.length) return false
    if (filterAuthority && authorityOf(r) !== filterAuthority) return false
    if (filterType && r.formTypeId !== filterType) return false
    if (trafficFilter && trafficLight(r, records) !== trafficFilter) return false
    if (filterTrainee && !traineesOf(r, records).some((tr) => traineeLabel(tr) === filterTrainee)) return false
    if (filterInstructor && r.instructorId !== filterInstructor) return false
    if (filterAircraft && r.header.aircraftType !== filterAircraft) return false
    if (!query) return true
    // Auch die angezeigte Datumsform durchsuchbar machen — gesucht wurde
    // bisher nur der Rohwert 2026-08-04, angezeigt wird 04.08.2026.
    const hay = [
      r.formTypeId,
      userName(r.instructorId),
      ...traineesOf(r, records).map(traineeLabel),
      ...Object.values(r.header),
      r.header.date ? formatDate(r.header.date) : '',
      // Gesucht wird nach dem Tag, der auch in der Zeile steht.
      dateLabel(gradingListDate(r)),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(query.toLowerCase())
  })

  /** Aktive Listenfilter für den Kopf der Exportdatei — die Datei muss
   *  selbst sagen, welcher Ausschnitt sie ist. */
  const activeFilters: [string, string][] = [
    ['Rows', `${filtered.length} of ${records.length}`],
    ...(filterPeriod !== 'all' ? ([['Period', t(`forms:ta.period.${filterPeriod}`)]] as [string, string][]) : []),
    ...(filterType ? ([['Form type', filterType]] as [string, string][]) : []),
    ...(trafficFilter ? ([['Traffic light', trafficFilter]] as [string, string][]) : []),
    ...(filterTrainee ? ([['Trainee', filterTrainee]] as [string, string][]) : []),
    ...(filterInstructor ? ([['Instructor', userName(filterInstructor)]] as [string, string][]) : []),
    ...(filterAircraft ? ([['Aircraft', filterAircraft]] as [string, string][]) : []),
    ...(filterAuthority ? ([['Authority', filterAuthority === 'UK' ? (doc.approvalNumberUK || 'GBR.ATO.0541') : (doc.approvalNumber || 'AT.ATO.106')]] as [string, string][]) : []),
    ...(query ? ([['Search', query]] as [string, string][]) : []),
  ]

  /** Kurzbezeichnung des Ausgangsformulars eines Folgeformulars */
  const parentLabel = (r: GradingRecord) => {
    const parent = records.find((x) => x.id === r.parentId)
    // Schulungstag, nicht Anlagedatum: Ein nachgetragenes Blatt trug hier
    // sonst ein anderes Datum als ueberall sonst in der App (#51).
    return parent ? `${parent.formTypeId} · ${formatDate(gradingListDate(parent))}` : ''
  }

  /**
   * Was man sieht, bekommt man: Der Export nimmt genau die Datensätze der
   * aufrufenden Ansicht entgegen und schreibt deren aktive Filter in den
   * Dateikopf. Vorher exportierte der Knopf neben der gefilterten Liste
   * stillschweigend den Gesamtbestand — gemessen: Liste auf einen
   * Instruktor gefiltert, Datei mit dreien.
   */
  const exportCsv = (scope: 'records' | 'competencies' | 'people', source: { records: GradingRecord[]; filters: [string, string][] }) => {
    // Der Inhalt entsteht in src/gradingExport.ts — dieselbe Funktion nutzt
    // die Ablage des Training Admins, und nur so ist sie pruefbar.
    const jetzt = Date.now() + state.timeOffsetMs
    const csv = buildGradingCsv(scope, {
      records: source.records,
      alle: records,
      filter: source.filters,
      exportiertAm: jetzt,
      exportiertVon: currentUser!.name,
      userName,
      traineeLabel,
      traineesOf,
      parentLabel,
      formatDateTime,
      kalibrierung: statsBySet.flatMap((st) =>
        st.calibration.rows.map((r) => ({
          satz: st.name,
          personId: r.id,
          sessions: r.sessions,
          avg: r.avg,
          abweichung: (r.avg ?? 0) - (st.calibration.overall ?? 0),
        })),
      ),
    })
    downloadCsv(gradingCsvName(scope, jetzt), csv)
    toast(t('forms:toast.exported'))
  }

  /*
   * Kachel-Navigation im Stil des Dashboards.
   *
   * Der Training Admin hat den Bereich seit Neuestem auch — der Verlauf je
   * Pilot ist seine Aufgabe. Die Grading-Konfiguration ist es nicht: Dort
   * werden Kompetenzkataloge geaendert, und das wirkt auf jedes kuenftige
   * Blatt der ganzen ATO. Sie bleibt dem Superadmin.
   */
  const darfKonfigurieren = currentUser?.role === 'superadmin'
  const SECTION_TILES: { key: Section; icon: typeof Gauge; badge?: number }[] = [
    { key: 'dashboard', icon: Gauge, badge: openSignatures.length + failedMails.length + openFollowUps.length },
    { key: 'records', icon: FolderOpen },
    { key: 'trainees', icon: UserRound },
    { key: 'monthly', icon: CalendarRange },
    { key: 'stats', icon: BarChart3 },
    { key: 'standardisation', icon: Scale },
    ...(darfKonfigurieren ? ([{ key: 'config', icon: SlidersHorizontal }] as const) : []),
  ]

  return (
    <div className="space-y-section">
      {section === null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SECTION_TILES.map(({ key, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => navigate(`/admin/grading/${key}`)}
              className="group relative flex aspect-square flex-col items-center justify-center gap-2.5 rounded-3xl border border-line/[0.07] bg-surface shadow-tile transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised"
            >
              {!!badge && (
                <span className="absolute right-3 top-3 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-warm px-1.5 text-micro font-bold text-bg ring-2 ring-bg">
                  {badge}
                </span>
              )}
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-raised text-accent transition group-hover:bg-accent group-hover:text-bg">
                <Icon size={24} />
              </span>
              <span className="px-2 text-center text-small font-semibold leading-tight">{t(`forms:admin.${key}`)}</span>
            </button>
          ))}
        </div>
      )}
      {section !== null && (
        <button onClick={() => navigate('/admin/grading')} className="flex items-center gap-1.5 text-small font-medium text-dim transition hover:text-ink">
          <ArrowLeft size={15} /> {t('admin.grading')}
        </button>
      )}

      {section === 'dashboard' && (
        <div className="space-y-stack">
          {/* Ampel-Legende */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line/10 bg-surface/60 px-3.5 py-2.5 text-micro text-dim">
            <span className="inline-flex items-center gap-1.5"><TrafficIcon color="green" stumm /> {t('forms:traffic.green')}</span>
            <span className="inline-flex items-center gap-1.5"><TrafficIcon color="yellow" stumm /> {t('forms:traffic.yellow')}</span>
            <span className="inline-flex items-center gap-1.5"><TrafficIcon color="red" stumm /> {t('forms:traffic.red')}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: t('forms:admin.openSignatures'), value: openSignatures.length, icon: Clock, tone: openSignatures.length ? 'text-warm' : 'text-dim' },
              { label: t('forms:admin.failedMails'), value: failedMails.length, icon: AlertTriangle, tone: failedMails.length ? 'text-danger' : 'text-dim' },
              { label: t('forms:admin.openFollowUps'), value: openFollowUps.length, icon: AlertTriangle, tone: openFollowUps.length ? 'text-warm' : 'text-dim' },
            ].map((k) => (
              <Card key={k.label} className="flex items-center gap-3 p-4">
                <k.icon size={20} className={k.tone} />
                <div>
                  <p className="text-title font-bold">{k.value}</p>
                  <p className="text-micro text-dim">{k.label}</p>
                </div>
              </Card>
            ))}
          </div>

          {failedMails.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-semibold">
                    {r.formTypeId} · {traineesOf(r, records).map(traineeLabel).join(', ')}
                  </p>
                  <p className="text-micro text-dim">{r.mailError}</p>
                </div>
                <Button variant="ghost" onClick={() => retryGradingMail(r.id)} className="flex shrink-0 items-center gap-1.5 py-1.5 text-micro">
                  <RefreshCw size={13} /> {t('forms:admin.retry')}
                </Button>
              </div>
            </Card>
          ))}

          {openSignatures.map((r) => (
            <Card
              key={r.id}
              onClick={() => navigate(`/grading/${r.id}`)}
              label={`${r.formTypeId} · ${traineesOf(r, records).map(traineeLabel).join(', ') || t('forms:openForm')} · ${dateLabel(gradingListDate(r))}`}
              className="flex items-center gap-3 p-4"
            >
              <Clock size={16} className="shrink-0 text-warm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">
                  {r.formTypeId} · {traineesOf(r, records).map(traineeLabel).join(', ') || '—'}
                </p>
                <p className="text-micro text-dim">{t('forms:admin.awaitingSince', { date: dateLabel(r.createdAt) })}</p>
              </div>
              <ChevronRight size={16} className="text-dim" />
            </Card>
          ))}

          {/* Pflicht-Folgeformulare (306/310), die noch nicht ausgefüllt wurden */}
          {openFollowUps.map((r) => (
            <Card key={`fu-${r.id}`} onClick={() => navigate(`/grading/${r.id}`)} className="flex items-center gap-3 p-4">
              <AlertTriangle size={16} className="shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">
                  {r.formTypeId} · {traineesOf(r, records).map(traineeLabel).join(', ') || '—'}
                </p>
                <p className="text-micro text-dim">
                  {t('forms:admin.followUpMissing', { forms: missingFollowUps(r, records).join(', ') })}
                </p>
              </div>
              <ChevronRight size={16} className="text-dim" />
            </Card>
          ))}

        </div>
      )}

      {section === 'records' && (
        <div className="space-y-stack">
          <div className="flex flex-wrap gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('forms:admin.search')} className={`${inputCls} min-w-40 flex-1`} />
            <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
              {Object.keys(PERIOD_DAYS).map((k) => (
                <option key={k} value={k}>
                  {t(`forms:ta.period.${k}`)}
                </option>
              ))}
            </select>
            {/* Trainee-Filter zuerst — die Standard-Sicht auf die Ablage */}
            <select value={filterTrainee} onChange={(e) => setFilterTrainee(e.target.value)} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
              <option value="">{t('forms:admin.allTrainees')}</option>
              {traineeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select value={filterInstructor} onChange={(e) => setFilterInstructor(e.target.value)} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
              <option value="">{t('forms:admin.allInstructors')}</option>
              {instructorOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select value={filterAuthority} onChange={(e) => setFilterAuthority(e.target.value as '' | 'AT' | 'UK')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
              <option value="">{t('forms:admin.allAuthorities')}</option>
              <option value="AT">{t('forms:authorityAT', { nr: doc.approvalNumber || 'AT.ATO.106' })}</option>
              <option value="UK">{t('forms:authorityUK', { nr: doc.approvalNumberUK || 'GBR.ATO.0541' })}</option>
            </select>
            <select value={filterAircraft} onChange={(e) => setFilterAircraft(e.target.value)} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
              <option value="">{t('forms:admin.allAircraft')}</option>
              {aircraftOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
              <option value="">{t('forms:admin.allTypes')}</option>
              {[...g.formTypes].sort((a, b) => a.id.localeCompare(b.id)).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id}
                </option>
              ))}
            </select>
          </div>
          {/* Ampel-Filter */}
          <div className="flex flex-wrap items-center gap-1.5 text-micro text-dim">
            <button
              onClick={() => setTrafficFilter('')}
              className={`min-h-11 rounded-full border px-2.5 py-1 transition ${trafficFilter === '' ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15'}`}
            >
              {t('forms:traffic.all')}
            </button>
            {(['green', 'yellow', 'red'] as TrafficColor[]).map((c) => (
              <button
                key={c}
                onClick={() => setTrafficFilter(trafficFilter === c ? '' : c)}
                className={`min-h-11 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
                  trafficFilter === c ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15'
                }`}
              >
                <TrafficIcon color={c} stumm /> {t(`forms:traffic.${c}`)}
              </button>
            ))}
            {/* Ausblenden ist je Nutzer — hier sieht der Admin, was irgendwo
                aus einer Liste entfernt wurde, und kann es zurückholen. */}
            <button
              onClick={() => setOnlyHidden(!onlyHidden)}
              aria-pressed={onlyHidden}
              className={`min-h-11 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
                onlyHidden ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line/15'
              }`}
            >
              <EyeOff size={12} /> {t('forms:admin.onlyHidden')}
            </button>
          </div>
          {/* Export genau dieser Ansicht: was die Filter zeigen, steht in der
              Datei — die aktiven Filter wandern in den Dateikopf. */}
          <div className="flex flex-wrap items-center gap-2">
            {(['records', 'competencies'] as const).map((sc) => (
              <Button
                key={sc}
                variant="ghost"
                onClick={() => exportCsv(sc, { records: filtered, filters: activeFilters })}
                className="flex items-center gap-1.5 text-micro"
              >
                <Download size={13} /> {t(`forms:admin.export_${sc}`)}
              </Button>
            ))}
            <span className="text-micro text-dim">{t('forms:admin.exportListHint', { count: filtered.length })}</span>
          </div>
          {/* Filterergebnis ansagen — sichtbar ändert sich nur die Liste */}
          <p role="status" className="sr-only">{t('forms:admin.resultCount', { shown: filtered.length, total: records.length })}</p>
          {filtered.length === 0 && <p className="pt-4 text-center text-body text-dim">{t('forms:empty')}</p>}
          {filtered.map((r) => (
            <Card
              key={r.id}
              onClick={() => navigate(`/grading/${r.id}`)}
              label={`${r.formTypeId} · ${traineesOf(r, records).map(traineeLabel).join(', ') || t('forms:openForm')} · ${dateLabel(gradingListDate(r))}`}
              className="flex items-center gap-3 p-4"
            >
              <TrafficIcon color={trafficLight(r, records)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">
                  {r.formTypeId} · {traineesOf(r, records).map(traineeLabel).join(', ') || '—'}
                </p>
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-micro text-dim">
                  <span className="min-w-0 max-w-full truncate">{userName(r.instructorId)}</span>
                  <span className="shrink-0">· {r.header.aircraftType}</span>
                  {/* Schulungstag, nicht Anlagedatum: Sortiert wird nach dem
                      Schulungstag (gradingListComparator) — die Spalte zeigte
                      etwas anderes als die Reihenfolge, und ein nachgetragenes
                      Blatt stand an der Juli-Position mit August-Datum (#51).
                      Fuer die beiden anderen Listen war das laengst korrigiert. */}
                  <span className="shrink-0">· {dateLabel(gradingListDate(r))}</span>
                </p>
              </div>
              {r.trainees.some((tr) => tr.overall === 'not_competent') && <Badge tone="bad">{t('forms:notCompetent')}</Badge>}
              {!!r.hiddenFor?.length && (
                <>
                  <Badge tone="wait">{t('forms:admin.hiddenBadge', { count: r.hiddenFor.length })}</Badge>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      unhideGradingRecord(r.id)
                    }}
                    title={t('forms:admin.restore')}
                    aria-label={t('forms:admin.restore')}
                    className="pointer-events-auto relative z-10 shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim transition hover:bg-ok/10 hover:text-ok"
                  >
                    <Eye size={16} />
                  </button>
                </>
              )}
              {/* Endgültiges Löschen nur für den Superadmin — der Training
                  Admin sieht dieselbe Ablage bewusst ohne Mülleimer. */}
              {currentUser!.role === 'superadmin' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(t('forms:ta.deleteConfirm'))) deleteGradingRecord(r.id)
                  }}
                  aria-label={t('common.delete')}
                  title={t('common.delete')}
                  className="pointer-events-auto relative z-10 shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim transition hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <ChevronRight size={16} className="shrink-0 text-dim" />
            </Card>
          ))}
        </div>
      )}

      {section === 'config' && darfKonfigurieren && (
        <div className="space-y-section">
          <Card className="space-y-section p-4">
            <StringList label={t('forms:admin.defaultRecipients')} values={g.defaultRecipients} onChange={(v) => updateGrading({ defaultRecipients: v })} />
            <StringList label={t('forms:admin.escalationRecipients')} values={g.escalationRecipients} onChange={(v) => updateGrading({ escalationRecipients: v })} />
            <StringList label={t('forms:admin.deferredRecipients')} values={g.deferredRecipients} onChange={(v) => updateGrading({ deferredRecipients: v })} />
          </Card>

          <Card className="p-4">
            <CardHeading className="mb-3">{t('forms:admin.competencySets')}</CardHeading>
            {g.competencySets.map((set) => (
              <CompetencySetEditor
                key={set.key}
                set={set}
                onChange={(competencies) =>
                  updateGrading({ competencySets: g.competencySets.map((s) => (s.key === set.key ? { ...s, competencies } : s)) })
                }
              />
            ))}
            <p className="mt-2 text-micro leading-relaxed text-dim">{t('forms:admin.competencyHint')}</p>
          </Card>

          <Card className="p-4">
            <CardHeading className="mb-3">{t('forms:admin.formTypes')}</CardHeading>
            <FormTypeEditor formTypes={g.formTypes} onChange={(formTypes) => updateGrading({ formTypes })} />
          </Card>
        </div>
      )}

      {section === 'trainees' && <TraineeHistory records={records} />}

      {section === 'monthly' && <MonthlyReport records={records} />}

      {/* Auswertung im Querformat drucken: die Flottenmatrix wird mit jeder
          Kompetenz breiter und passt hochkant nicht mehr auf ein Blatt. */}
      {section === 'standardisation' && (
        <StandardisationReport
          records={records}
          setOfRecord={setOfRecord}
          fleet={statsFleet}
          onFleetChange={setStatsFleet}
          fleetOptions={aircraftOptions}
          authority={statsAuthority}
          onAuthorityChange={setStatsAuthority}
          period={statsPeriod}
          onPeriodChange={setStatsPeriod}
        />
      )}

      {section === 'stats' && (
        <div className="print-landscape space-y-section">
          {/* Vergleich einzelner Flotten: Auswahl gilt für Trendflags und Kalibrierung */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-small font-medium text-dim">{t('forms:admin.fleetFilter')}</label>
            <select value={statsFleet} onChange={(e) => setStatsFleet(e.target.value)} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
              <option value="">{t('forms:admin.allAircraft')}</option>
              {aircraftOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <label className="text-small font-medium text-dim">{t('forms:admin.authorityFilter')}</label>
            <select value={statsAuthority} onChange={(e) => setStatsAuthority(e.target.value as '' | 'AT' | 'UK')} className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small">
              <option value="">{t('forms:admin.allAuthorities')}</option>
              <option value="AT">{t('forms:authorityAT', { nr: doc.approvalNumber || 'AT.ATO.106' })}</option>
              <option value="UK">{t('forms:authorityUK', { nr: doc.approvalNumberUK || 'GBR.ATO.0541' })}</option>
            </select>
            {/* Zeitraum gilt auch für den Standardisierungsbericht — beide
                zeigen denselben Ausschnitt und nennen ihn. */}
            <label className="text-small font-medium text-dim">{t('forms:std.period.label')}</label>
            <select
              value={statsPeriod}
              onChange={(e) => setStatsPeriod(e.target.value as PeriodKey)}
              className="rounded-xl border border-field bg-bg/60 px-3 py-2 text-small"
            >
              {PERIODS.map((p2) => (
                <option key={p2.key} value={p2.key}>
                  {t(`forms:std.period.${p2.key}`)}
                </option>
              ))}
            </select>
            <span className="text-micro text-dim">
              {t('forms:admin.sessionCount', { count: sessionCount(statsRecords) })}
            </span>
          </div>
          {/* Die Datenbasis gehört sichtbar an die Zahlen: ohne sie war nicht
              erkennbar, warum Kachel und Bericht verschiedene Werte zeigten. */}
          <p className="text-micro leading-relaxed text-dim">{t('forms:admin.statsScopeNote')}</p>

          {statsBySet.length === 0 && <p className="pt-4 text-center text-body text-dim">{t('forms:empty')}</p>}

          {/* Je Kompetenzsatz eine eigene Auswertung — Piloten- und
              Instruktorenbewertungen folgen verschiedenen Maßstäben und
              werden nie miteinander verrechnet. */}
          {statsBySet.map((st) => (
            <div key={st.key} className="space-y-section">
              <p className="border-b border-line/10 pb-1 text-body font-semibold">
                {st.name}{' '}
                <span className="font-normal text-dim">· {t('forms:admin.sessionCount', { count: st.sessions })}</span>
              </p>

              <Card className="p-4">
                <CardHeading className="mb-2 flex items-center gap-2">
                  <TrendingDown size={15} /> {t('forms:admin.trendFlags')}
                </CardHeading>
                {st.trendFlags.length === 0 && <p className="text-small text-dim">{t('forms:admin.noTrendFlags')}</p>}
                {st.trendFlags.map((f) => (
                  <div key={f.code} className="flex items-center justify-between gap-3 border-b border-line/[0.06] py-1.5 text-small last:border-0">
                    <span className="min-w-0 flex-1 font-medium">{f.label}</span>
                    <span className="shrink-0 text-dim">Ø {f.avg!.toFixed(2)} · n={f.n}</span>
                  </div>
                ))}
                <p className="mt-2 text-micro leading-relaxed text-dim">{t('forms:admin.trendHint')}</p>
              </Card>

              <Card className="p-4">
                <CardHeading className="mb-3">{t('forms:admin.calibration')}</CardHeading>
                <p className="mb-2 text-micro text-dim">
                  {t('forms:admin.overallAvg')}: <span className="font-semibold text-ink">{st.calibration.overall?.toFixed(2) ?? '–'}</span>
                </p>
                {st.calibration.rows.map((row) => {
                  const diff = row.delta ?? 0
                  // Ein und dieselbe Schwelle wie im Monatsbericht (WATCH/REVIEW
                  // aus gradingStats) — samt der Mindestdatenmenge, unter der
                  // gar keine Aussage getroffen wird.
                  const ton =
                    row.flag === 'review' ? 'font-semibold text-danger' : row.flag === 'watch' ? 'font-semibold text-warm' : 'text-dim'
                  return (
                    <div key={row.id} className="flex items-center justify-between border-b border-line/[0.06] py-2 text-small last:border-0">
                      <span className="min-w-0 flex-1 truncate">{userName(row.id)}</span>
                      <span className="mx-3 text-micro text-dim">{t('forms:admin.sessionCount', { count: row.sessions })}</span>
                      <span className="w-14 text-right font-semibold tabular-nums">{row.avg?.toFixed(2)}</span>
                      <span className={`w-16 text-right text-micro tabular-nums ${ton}`} title={t(`forms:admin.flag${row.flag[0].toUpperCase()}${row.flag.slice(1)}`)}>
                        {diff >= 0 ? '+' : ''}
                        {diff.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
                <p className="mt-2 text-micro leading-relaxed text-dim">{t('forms:admin.calibrationHint')}</p>
              </Card>

              <Card className="p-4">
                <CardHeading className="mb-3">{t('forms:admin.fleetMatrix')}</CardHeading>
                <div className="overflow-x-auto">
                  <table className="w-full text-micro">
                    <thead>
                      <tr className="text-dim">
                        <th className="p-1.5 text-left font-medium">{t('forms:admin.fleet')}</th>
                        {st.fleetMatrix.codes.map((c) => (
                          <th key={c} className="p-1.5 align-bottom font-medium print:max-w-24 print:whitespace-normal print:text-fine">
                            {st.fleetMatrix.labelOf(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {st.fleetMatrix.fleets.map((f) => (
                        <tr key={f}>
                          <td className="p-1.5 font-medium">{f}</td>
                          {st.fleetMatrix.codes.map((c) => {
                            const v = st.fleetMatrix.cell[f][c]
                            const tone =
                              v === null
                                ? 'text-dim'
                                : v >= 4
                                  ? 'bg-emerald-500/20'
                                  : v >= 3
                                    ? 'bg-emerald-700/20'
                                    : v >= 2
                                      ? 'bg-amber-500/20'
                                      : 'bg-red-500/20'
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
            </div>
          ))}

          <Card className="p-4">
            <CardHeading className="mb-3">{t('forms:admin.export')}</CardHeading>
            <div className="flex flex-wrap gap-2">
              {(['records', 'competencies', 'people'] as const).map((s) => (
                <Button
                  key={s}
                  variant="ghost"
                  onClick={() =>
                    exportCsv(s, {
                      records: records.filter(
                        (r) => (!statsFleet || r.header.aircraftType === statsFleet) && (!statsAuthority || authorityOf(r) === statsAuthority),
                      ),
                      filters: [
                        ['Fleet', statsFleet || 'All fleets'],
                        ['Authority', statsAuthority === 'UK' ? (doc.approvalNumberUK || 'GBR.ATO.0541') : statsAuthority === 'AT' ? (doc.approvalNumber || 'AT.ATO.106') : 'All authorities'],
                      ],
                    })
                  }
                  className="flex items-center gap-1.5 text-small"
                >
                  <Download size={14} /> {t(`forms:admin.export_${s}`)}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-micro leading-relaxed text-dim">{t('forms:admin.exportHint')}</p>
          </Card>
        </div>
      )}
    </div>
  )
}
