import { Eye, EyeOff, AlertTriangle, ArrowLeft, BarChart3, ChevronRight, Clock, Download, FolderOpen, Gauge, ListChecks, Lock, Pencil, Plus, RefreshCw, Scale, Search, SlidersHorizontal, CalendarRange, Trash2, TrendingDown, UserRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, CardHeading, ChipListe, CountBadge, Field, FilterAuswahl, inputCls, inputInlineCls, selectCls } from '../../components/ui'
import { AuswertungsFilter } from './AuswertungsFilter'
import { DocumentHead } from '../../components/DocumentHead'
import { downloadCsv } from '../../csv'
import { toast, useQuittung } from '../../components/Toast'
import { avgOf, buildGradingCsv, gradingCsvName, kalibrierungsZeilen, statistikKopf, statistikRohdaten } from '../../gradingExport'
import { navigate } from '../../router'
import { useStore } from '../../store'
import { HEAD_STANDARD } from '../../sandbox/gradingDefaults'
import type { Competency, CompetencySet, CompetencySetKey, FormType, GradingRecord } from '../../types'
import { codeVergeben, formularTypInGebrauch, gradingListDate, personenKurz, personenSuche } from '../../gradingRules'
import { missingFollowUps, TrafficIcon, traineesOf, trafficLight, type TrafficColor } from '../Grading'
import { formatDate, formatDateTime } from '../../datum'
import { useDruckTitel } from '../../useDruckTitel'
import { StandardisationReport } from './StandardisationReport'
import { TraineeHistory } from './TraineeHistory'
import { MonthlyReport } from './MonthlyReport'
import { FieldOptionsEditor } from './FieldOptionsEditor'
import { gradingListComparator } from '../../gradingRules'
import { auswertungDruckTeile, authorityOf, berichtsKennung, briefkopfZulassung, flottenMatrix, formatDelta, imZeitraum, LISTEN_ZEITRAEUME, matrixTon, periodLabel, scopeRecords, statsBySet as computeStatsBySet, zeitraumTage, type MatrixTon, type PeriodKey } from '../../gradingStats'

/** Flächen der Matrixstufen (index.css). Ausgeschrieben, nicht aus dem
 *  Stufennamen zusammengesetzt: Tailwind übernimmt nur Klassen, die
 *  wörtlich im Quelltext stehen. */
const MATRIX_KLASSE: Record<MatrixTon, string> = {
  hoch: 'matrix-ton-hoch',
  gut: 'matrix-ton-gut',
  niedrig: 'matrix-ton-niedrig',
  schwach: 'matrix-ton-schwach',
}

type Section = 'dashboard' | 'records' | 'config' | 'stats' | 'standardisation' | 'trainees' | 'monthly'
const SECTIONS: Section[] = ['dashboard', 'records', 'trainees', 'monthly', 'stats', 'standardisation', 'config']

/** Kompetenzen samt Observable Behaviours anlegen, bearbeiten, löschen */
function CompetencySetEditor({ set, onChange }: { set: CompetencySet; onChange: (competencies: Competency[]) => void }) {
  const { t, i18n } = useTranslation()
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

  // Ein Kürzel je Satz — die Note hängt am Kürzel; zwei gleiche bewerteten
  // im Formular beide auf einen Klick (Audit 11/2026, GRD-19). Beim 308G
  // erzeugt codeFromTitle ein freies Kürzel, eine Eingabe gibt es dort nicht.
  const codeTaken = !hideCodes && editCode !== null && codeVergeben(draft.code, set.competencies, editCode === '__new__' ? null : editCode)

  const save = () => {
    const title = draft.title.trim()
    const taken = set.competencies.filter((c) => c.code !== editCode).map((c) => c.code)
    const comp: Competency = {
      code: draft.code.trim().toUpperCase() || codeFromTitle(title, taken),
      title,
      behaviours: draft.behaviours.split('\n').map((b) => b.trim()).filter(Boolean),
    }
    if (!comp.code || !comp.title || codeTaken) return
    onChange(editCode === '__new__' ? [...set.competencies, comp] : set.competencies.map((c) => (c.code === editCode ? comp : c)))
    setEditCode(null)
  }

  const editorForm = (
    <div className="mt-2 space-y-stack rounded-xl border border-accent/30 bg-bg/40 p-3">
      <div className="flex gap-2">
        {!hideCodes && (
          <Field label={t('forms:admin.codeLabel')}>
            <input className={`${inputInlineCls} w-24 font-mono uppercase`} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
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
      {codeTaken && <p className="text-micro text-danger">{t('forms:admin.codeTaken')}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" lang={i18n.language} onClick={() => setEditCode(null)}>{t('common.cancel')}</Button>
        <Button lang={i18n.language} disabled={(!hideCodes && !draft.code.trim()) || !draft.title.trim() || codeTaken} onClick={save}>{t('common.save')}</Button>
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
              <button onClick={() => startEdit(c)} title={t('common.edit')} lang={i18n.language} className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim hover:text-accent">
                <Pencil size={14} />
              </button>
              <button
                onClick={() => window.confirm(t('forms:admin.deleteCompetencyConfirm')) && onChange(set.competencies.filter((x) => x.code !== c.code))}
                title={t('common.delete')}
                lang={i18n.language}
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

function FormTypeEditor({
  formTypes,
  records,
  onChange,
}: {
  formTypes: FormType[]
  /** Bestand — entscheidet, ob ein Typ gelöscht werden kann (GRD-18) */
  records: GradingRecord[]
  onChange: (types: FormType[]) => void
}) {
  const { t, i18n } = useTranslation()
  const { removeFormType } = useStore()
  const quittieren = useQuittung()
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
            <button onClick={() => startEdit(f)} title={t('common.edit')} lang={i18n.language} className="shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim hover:text-accent">
              <Pencil size={14} />
            </button>
            {/* 44 px wie die Nachbarknöpfe — vorher 26 px (Audit 11/2026, GRD-17) */}
            <button
              onClick={() => setOptionsId(optionsId === f.id ? null : f.id)}
              title={t('forms:admin.editOptions')}
              aria-expanded={optionsId === f.id}
              className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-lg transition ${optionsId === f.id ? 'text-accent' : 'text-dim hover:text-accent'}`}
            >
              <ListChecks size={14} />
            </button>
            {/* Ein Typ, den der Store ohnehin behielte, bekommt keinen
                Löschdialog mit falschem Versprechen: Der Knopf ist als
                gesperrt erkennbar (Schloss), nennt den Grund und sagt ihn beim Klick
                (Audit 11/2026, GRD-18). aria-disabled statt disabled, damit
                er per Tastatur erreichbar bleibt und der Grund ankommt. */}
            {(() => {
              const gebrauch = formularTypInGebrauch(f.id, records)
              const grund = gebrauch === 'pflicht' ? t('forms:admin.formTypeRequired') : t('forms:admin.formTypeInUse')
              /* Jeder Ausgang meldet sich (Audit 11/2026, R3-FORMULARTYP):
                 gesperrt → Grund VOR der Rückfrage; gelöscht → Quittung nach
                 dem Speichern; nach der Rückfrage doch abgelehnt (in einem
                 zweiten Tab inzwischen benutzt oder entfernt) → Grund. Vorher
                 lief das Löschen über die gekürzte Liste, der Store holte den
                 Typ still zurück, und nach „OK" kam nichts. Abbrechen bleibt
                 still: Da ist nichts geschehen, das gemeldet werden müsste. */
              const ablehnung = { pflicht: t('forms:admin.formTypeRequired'), datensaetze: t('forms:admin.formTypeInUse'), unbekannt: t('forms:admin.formTypeGone') }
              return (
                <button
                  onClick={() => {
                    if (gebrauch) {
                      toast(grund, 'wait')
                      return
                    }
                    if (!window.confirm(t('forms:admin.deleteFormTypeConfirm'))) return
                    const ausgang = removeFormType(f.id)
                    if (ausgang === 'geloescht') void quittieren(t('forms:toast.formTypeDeleted', { id: f.id }), 'ok', t('forms:toast.saveFailed'))
                    else toast(ablehnung[ausgang], 'wait')
                  }}
                  aria-disabled={gebrauch ? true : undefined}
                  aria-label={t('forms:admin.deleteOption', { value: f.id })}
                  title={gebrauch ? grund : t('forms:admin.deleteOption', { value: f.id })}
                  className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim ${gebrauch ? 'cursor-not-allowed' : 'hover:text-danger'}`}
                >
                  {/* Schloss statt Mülleimer: sichtbar gesperrt, ohne
                      Deckkraft zu dämpfen (Kontrast, VERW-17) */}
                  {gebrauch ? <Lock size={14} aria-hidden /> : <Trash2 size={14} aria-hidden />}
                </button>
              )
            })()}
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
                <Button variant="ghost" lang={i18n.language} onClick={() => setEditId(null)}>{t('common.cancel')}</Button>
                <Button lang={i18n.language} disabled={!draft.title.trim()} onClick={save}>{t('common.save')}</Button>
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
                <input className={`${inputInlineCls} w-28 font-mono uppercase`} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} autoFocus />
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
              <Button variant="ghost" lang={i18n.language} onClick={() => setEditId(null)}>{t('common.cancel')}</Button>
              <Button lang={i18n.language} disabled={!draft.id.trim() || !draft.title.trim() || idTaken} onClick={save}>{t('common.save')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Der ganze Bereich zeigt den vollen Bestand samt CSV-Export und Verlauf je
 * Pilot — er steht deshalb nur mit grading_view_all offen. Die Reiterliste
 * (adminTabsFuer) laesst ihn ohne das Recht gar nicht erst erscheinen; der
 * Riegel hier haelt auch dann, wenn ein geoeffneter Bereich stehen bleibt,
 * waehrend der Superadmin das Recht entzieht (Audit 11/2026, VERW-03).
 *
 * Bewusst NICHT `visibleGradingRecords`: Diese Liste laesst weg, was die
 * angemeldete Person in ihrer eigenen Ansicht ausgeblendet hat. Das Panel
 * muss genau diese Blaetter zeigen — sonst koennte sie niemand wieder
 * einblenden.
 *
 * @param section Zweites Adresssegment (#/admin/grading/<section>) —
 *  leer zeigt die Kachelübersicht der Ablage. */
export function GradingAdmin({ section = '' }: { section?: string }) {
  const { t } = useTranslation()
  const { can } = useStore()
  if (!can('grading_view_all')) return <p className="pt-10 text-center text-body text-dim">{t('admin.noAccess')}</p>
  return <GradingAblage section={section} />
}

function GradingAblage({ section: sectionSeg }: { section: string }) {
  const { t, i18n } = useTranslation()
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

  // Name des gedruckten PDFs der Statistik — sie hat einen eigenen Druck
  // (Kopf, Querformat), hiess aber „Instructor Connect.pdf" (Audit 11/2026,
  // EXM-04). Nur solange der Bereich offen ist; sonst gilt der vorige Titel.
  useDruckTitel(
    section === 'stats'
      ? auswertungDruckTeile(t('forms:admin.stats'), {
          fleet: statsFleet,
          authority: statsAuthority,
          period: statsPeriod,
          doc,
          now: Date.now() + state.timeOffsetMs,
        })
      : null,
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

        // Dieselbe Datenbasis wie Trend und Kalibrierung (signiert, keine
        // Folgeformulare, Zeitraum, Behörde), aber über ALLE Flotten — die
        // Matrix vergleicht die Flotten untereinander (Audit 11/2026,
        // GRD-07/UID-01). allOfSet dient nur noch der Beschriftung.
        const matrix = flottenMatrix(records, setOfRecord, key, {
          authority: statsAuthority,
          period: statsPeriod,
          now: Date.now() + state.timeOffsetMs,
        })

        return {
          key,
          name: catalogue?.name ?? key,
          sessions: sessionCount(rs),
          trendFlags,
          calibration,
          fleetMatrix: { ...matrix, labelOf },
        }
      })
      // Ein Satz ohne Sitzung im Ausschnitt erscheint nicht — vorher hielt
      // ihn die (ungefilterte) Matrix sichtbar, und „0 sessions" stand
      // neben gefüllten Zellen.
      .filter((x) => x.sessions > 0)
  }, [statsRecords, records, setOfRecord, g.competencySets, sessionCount, calibrationSets, statsAuthority, statsPeriod, state.timeOffsetMs])

  // Auswahllisten aus den vorhandenen Formularen ableiten
  // Folgeformulare (306/310) führen ihren Piloten in den Kopfdaten,
  // Anwesenheitslisten (307A/307B) ihre Teilnehmer — ohne personenSuche
  // fielen sie aus Filter und Suche heraus.
  const traineeOptions = [...new Set(records.flatMap((r) => personenSuche(r, records, traineeLabel)))].filter((n) => n !== '—').sort()
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

  const filtered = records.filter((r) => {
    // Schulungstag statt Erfassung — dieselbe Regel wie in der Liste des
    // Training Admins und in der Statistik (Audit 11/2026, GRD-09). Die
    // Zeile zeigt den Schulungstag; gefiltert wurde nach dem Anlagedatum.
    if (!imZeitraum(r, zeitraumTage(filterPeriod), Date.now() + state.timeOffsetMs)) return false
    if (onlyHidden && !r.hiddenFor?.length) return false
    if (filterAuthority && authorityOf(r) !== filterAuthority) return false
    if (filterType && r.formTypeId !== filterType) return false
    if (trafficFilter && trafficLight(r, records) !== trafficFilter) return false
    if (filterTrainee && !personenSuche(r, records, traineeLabel).includes(filterTrainee)) return false
    if (filterInstructor && r.instructorId !== filterInstructor) return false
    if (filterAircraft && r.header.aircraftType !== filterAircraft) return false
    if (!query) return true
    // Auch die angezeigte Datumsform durchsuchbar machen — gesucht wurde
    // bisher nur der Rohwert 2026-08-04, angezeigt wird 04.08.2026.
    const hay = [
      r.formTypeId,
      userName(r.instructorId),
      ...personenSuche(r, records, traineeLabel),
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
    ...(filterAuthority ? ([['Authority', berichtsKennung(filterAuthority, doc)]] as [string, string][]) : []),
    ...(query ? ([['Search', query]] as [string, string][]) : []),
    // „Nur ausgeblendete" filtert die Liste — ohne diese Zeile sah die
    // Datei aus wie ein ungefilterter Auszug (Audit 11/2026, EXP-03).
    ...(onlyHidden ? ([['Hidden only', 'yes']] as [string, string][]) : []),
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
      formTypes: g.formTypes,
      beschriftung: (schluessel) => t(schluessel),
      // Abweichung und Einstufung übernommen, nicht nachgerechnet — vorher
      // stand ein Instruktor ohne Zahlnote als −Gesamtmittel in der Datei
      // (Audit 11/2026, EXP-02).
      kalibrierung: kalibrierungsZeilen(
        calibrationSets,
        (key) => g.competencySets.find((c) => c.key === key)?.name ?? key,
        (flag) => t(`forms:std.flag.${flag}`),
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

  // Der ganze Bereich ist englisch (forms) — auch im Admin-Panel einer
  // deutschen Oberfläche. Ohne Auszeichnung las die Sprachausgabe ihn
  // deutsch (A11Y-12); die wenigen Knöpfe aus `common` tragen ihre Sprache.
  return (
    <div lang="en" className="space-y-section">
      {section === null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SECTION_TILES.map(({ key, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => navigate(`/admin/grading/${key}`)}
              className="group relative flex aspect-square flex-col items-center justify-center gap-2.5 rounded-3xl border border-line/[0.07] bg-surface shadow-tile transition motion-safe:hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised"
            >
              {/* Dieselbe Zählmarke wie auf der Startseite — vorher braun
                  (bg-warm) und ohne Ansage (Audit 11/2026, UID-08) */}
              <CountBadge count={badge ?? 0} label={t('forms:admin.openItems')} className="right-3 top-3" />
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-raised text-accent transition group-hover:bg-accent group-hover:text-bg">
                <Icon size={24} />
              </span>
              <span className="px-2 text-center text-small font-semibold leading-tight">{t(`forms:admin.${key}`)}</span>
            </button>
          ))}
        </div>
      )}
      {/* Einziger Rückweg im Unterbereich (Admin.tsx blendet „Zur
          Übersicht" hier aus, UID-13) — deshalb mit voller Trefferfläche. */}
      {section !== null && (
        <button onClick={() => navigate('/admin/grading')} className="flex min-h-11 items-center gap-1.5 text-small font-medium text-dim transition hover:text-ink">
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
          {/* „Offen/fehlt" in EINEM Ton: wait, wie die Ampel-Legende darüber.
              Vorher standen dafür drei Farben auf einem Bildschirm — text-warm
              (braun, im Dunkelmodus fast weiß), ein helles Amber (2,1:1 auf der
              Karte) und das Orange der Legende (Audit 11/2026, UID-08). */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: t('forms:admin.openSignatures'), value: openSignatures.length, icon: Clock, tone: openSignatures.length ? 'text-wait' : 'text-dim' },
              { label: t('forms:admin.failedMails'), value: failedMails.length, icon: AlertTriangle, tone: failedMails.length ? 'text-danger' : 'text-dim' },
              { label: t('forms:admin.openFollowUps'), value: openFollowUps.length, icon: AlertTriangle, tone: openFollowUps.length ? 'text-wait' : 'text-dim' },
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
                    {r.formTypeId} · {personenKurz(r, records, traineeLabel)}
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
              label={`${r.formTypeId} · ${personenKurz(r, records, traineeLabel) || t('forms:openForm')} · ${dateLabel(gradingListDate(r))}`}
              className="flex items-center gap-3 p-4"
            >
              <Clock size={16} className="shrink-0 text-wait" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">
                  {r.formTypeId} · {personenKurz(r, records, traineeLabel) || '—'}
                </p>
                <p className="text-micro text-dim">{t('forms:admin.awaitingSince', { date: dateLabel(r.createdAt) })}</p>
              </div>
              <ChevronRight size={16} className="text-dim" />
            </Card>
          ))}

          {/* Pflicht-Folgeformulare (306/310), die noch nicht ausgefüllt wurden */}
          {openFollowUps.map((r) => (
            <Card key={`fu-${r.id}`} onClick={() => navigate(`/grading/${r.id}`)} className="flex items-center gap-3 p-4">
              <AlertTriangle size={16} className="shrink-0 text-wait" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">
                  {r.formTypeId} · {personenKurz(r, records, traineeLabel) || '—'}
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
          {/* Dieselbe Gestalt wie die Liste des Training Admins: Suche in
              eigener Zeile (der Platzhalter wurde neben sechs Auswahlfeldern
              abgeschnitten), darunter die Filter — jeder mit Namen, nicht nur
              mit seinem aktuellen Wert (Audit 11/2026, UID-17/A11Y-07). */}
          <div className="relative">
            <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('forms:admin.search')}
              aria-label={t('forms:admin.search')}
              className={`${inputCls} pl-9`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterAuswahl label={t('forms:ta.periodLabel')} value={filterPeriod} onChange={setFilterPeriod}>
              {LISTEN_ZEITRAEUME.map(({ key: k }) => (
                <option key={k} value={k}>
                  {t(`forms:ta.period.${k}`)}
                </option>
              ))}
            </FilterAuswahl>
            {/* Trainee-Filter zuerst — die Standard-Sicht auf die Ablage */}
            <FilterAuswahl label={t('forms:admin.filterTrainee')} value={filterTrainee} onChange={setFilterTrainee}>
              <option value="">{t('forms:admin.allTrainees')}</option>
              {traineeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </FilterAuswahl>
            <FilterAuswahl label={t('forms:admin.instructorPick')} value={filterInstructor} onChange={setFilterInstructor}>
              <option value="">{t('forms:admin.allInstructors')}</option>
              {instructorOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </FilterAuswahl>
            <FilterAuswahl label={t('forms:admin.authorityFilter')} value={filterAuthority} onChange={(v) => setFilterAuthority(v as '' | 'AT' | 'UK')}>
              <option value="">{t('forms:admin.allAuthorities')}</option>
              <option value="AT">{t('forms:authorityAT', { nr: doc.approvalNumber || 'AT.ATO.106' })}</option>
              <option value="UK">{t('forms:authorityUK', { nr: doc.approvalNumberUK || 'GBR.ATO.0541' })}</option>
            </FilterAuswahl>
            <FilterAuswahl label={t('forms:admin.filterAircraft')} value={filterAircraft} onChange={setFilterAircraft}>
              <option value="">{t('forms:admin.allAircraft')}</option>
              {aircraftOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </FilterAuswahl>
            <FilterAuswahl label={t('forms:admin.filterFormType')} value={filterType} onChange={setFilterType}>
              <option value="">{t('forms:admin.allTypes')}</option>
              {[...g.formTypes].sort((a, b) => a.id.localeCompare(b.id)).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id}
                </option>
              ))}
            </FilterAuswahl>
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
          <p role="status" className="sr-only">{t('forms:admin.resultCount', { shown: filtered.length, count: records.length })}</p>
          {filtered.length === 0 && <p className="pt-4 text-center text-body text-dim">{t('forms:empty')}</p>}
          {filtered.map((r) => (
            <Card
              key={r.id}
              onClick={() => navigate(`/grading/${r.id}`)}
              label={`${r.formTypeId} · ${personenKurz(r, records, traineeLabel) || t('forms:openForm')} · ${dateLabel(gradingListDate(r))}`}
              className="flex items-center gap-3 p-4"
            >
              <TrafficIcon color={trafficLight(r, records)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">
                  {r.formTypeId} · {personenKurz(r, records, traineeLabel) || '—'}
                </p>
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-micro text-dim">
                  <span className="min-w-0 max-w-full truncate">{userName(r.instructorId)}</span>
                  {/* „—" statt eines hängenden Punkts, wie in der Liste des
                      Training Admins (Audit 11/2026, GTY-02) */}
                  <span className="shrink-0">· {r.header.aircraftType || '—'}</span>
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
                  lang={i18n.language}
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
            {/* formularTexte: auch Platzhalter und Knopfnamen der Listen
                englisch wie der übrige Grading-Bereich (UID-18). */}
            <ChipListe label={t('forms:admin.defaultRecipients')} values={g.defaultRecipients} onChange={(v) => updateGrading({ defaultRecipients: v })} formularTexte />
            <ChipListe label={t('forms:admin.escalationRecipients')} values={g.escalationRecipients} onChange={(v) => updateGrading({ escalationRecipients: v })} formularTexte />
            <ChipListe label={t('forms:admin.deferredRecipients')} values={g.deferredRecipients} onChange={(v) => updateGrading({ deferredRecipients: v })} formularTexte />
          </Card>

          <Card className="p-4">
            <CardHeading level={2} className="mb-3">{t('forms:admin.competencySets')}</CardHeading>
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
            <CardHeading level={2} className="mb-3">{t('forms:admin.formTypes')}</CardHeading>
            <FormTypeEditor formTypes={g.formTypes} records={records} onChange={(formTypes) => updateGrading({ formTypes })} />
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
          {/* Kopf des Ausdrucks — vorher druckte die Seite ohne ATO, Titel
              und Zeitpunkt, mit Auswahlfeldern und einer Exportkarte ohne
              Knöpfe (Audit 11/2026, RPT-01). Auf dem Bildschirm sagen die
              Auswahlfelder dasselbe. */}
          <DocumentHead
            nurDruck
            absender={[doc.atoName, briefkopfZulassung(statsAuthority, doc)]}
            titel={t('forms:admin.stats')}
            bereich={`${t('forms:std.period.label')}: ${periodLabel(statsPeriod)} · ${t('forms:admin.fleet')}: ${statsFleet || t('forms:admin.allAircraft')} · ${t('forms:admin.authority')}: ${berichtsKennung(statsAuthority, doc)} · ${t('forms:admin.sessionCount', { count: sessionCount(statsRecords) })}`}
            stempel={t('forms:exportStamp', { date: formatDateTime(Date.now() + state.timeOffsetMs), name: currentUser!.name })}
          />
          {/* Vergleich einzelner Flotten: Auswahl gilt für Trendflags und
              Kalibrierung, der Zeitraum auch für den Standardisierungsbericht
              — beide zeigen denselben Ausschnitt mit derselben Filterzeile. */}
          <AuswertungsFilter
            fleet={statsFleet}
            onFleetChange={setStatsFleet}
            fleetOptions={aircraftOptions}
            authority={statsAuthority}
            onAuthorityChange={setStatsAuthority}
            period={statsPeriod}
            onPeriodChange={setStatsPeriod}
          >
            <span className="text-micro text-dim">{t('forms:admin.sessionCount', { count: sessionCount(statsRecords) })}</span>
          </AuswertungsFilter>
          {/* Die Datenbasis gehört sichtbar an die Zahlen: ohne sie war nicht
              erkennbar, warum Kachel und Bericht verschiedene Werte zeigten. */}
          <p className="text-micro leading-relaxed text-dim">{t('forms:admin.statsScopeNote')}</p>

          {statsBySet.length === 0 && <p className="pt-4 text-center text-body text-dim">{t('forms:empty')}</p>}

          {/* Je Kompetenzsatz eine eigene Auswertung — Piloten- und
              Instruktorenbewertungen folgen verschiedenen Maßstäben und
              werden nie miteinander verrechnet. Der Name des Satzes ist
              die Überschrift seiner Karten (h2 über deren h3): Als Absatz
              sprang die Gliederung von h1 auf h3, und „Pilot competencies"
              fehlte in der Überschriftenliste (Audit 11/2026, A11Y-14). */}
          {statsBySet.map((st) => (
            <div key={st.key} className="space-y-section">
              <h2 className="border-b border-line/10 pb-1 text-body font-semibold">
                {st.name}{' '}
                <span className="font-normal text-dim">· {t('forms:admin.sessionCount', { count: st.sessions })}</span>
              </h2>

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
                  // Ein und dieselbe Schwelle wie im Monatsbericht (WATCH/REVIEW
                  // aus gradingStats) — samt der Mindestdatenmenge, unter der
                  // gar keine Aussage getroffen wird.
                  const ton =
                    row.flag === 'review' ? 'font-semibold text-danger' : row.flag === 'watch' ? 'font-semibold text-wait' : 'text-dim'
                  return (
                    <div key={row.id} className="flex items-center justify-between border-b border-line/[0.06] py-2 text-small last:border-0">
                      <span className="min-w-0 flex-1 truncate">{userName(row.id)}</span>
                      <span className="mx-3 text-micro text-dim">{t('forms:admin.sessionCount', { count: row.sessions })}</span>
                      {/* Ohne Zahlnote (nur „NO") gibt es weder Schnitt noch
                          Abweichung: beide „–". Vorher stand „+0.00" neben
                          einer leeren Zelle — „genau im Schnitt", wo es keinen
                          Schnitt gibt (Audit 11/2026, Nachtrag Exporte
                          Kern-App #2). Gleiche Schreibweise wie die Berichte. */}
                      <span className="w-14 text-right font-semibold tabular-nums">{row.avg === null ? '–' : row.avg.toFixed(2)}</span>
                      <span className={`w-16 text-right text-micro tabular-nums ${ton}`} title={t(`forms:admin.flag${row.flag[0].toUpperCase()}${row.flag.slice(1)}`)}>
                        {formatDelta(row.delta)}
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
                      {/* Erste Spalte als Einheit: „Fle/et" und „CL/30" standen
                          bei 1440 px auf zwei Zeilen (Audit 11/2026, UID-02,
                          A11Y-18). Die Kompetenzköpfe dürfen an Wortgrenzen
                          umbrechen, im Druck auch schmal (print:max-w-24). */}
                      <tr className="text-dim">
                        <th className="zusammen whitespace-nowrap p-1.5 text-left font-medium">{t('forms:admin.fleet')}</th>
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
                          <td className="zusammen whitespace-nowrap p-1.5 font-medium">{f}</td>
                          {st.fleetMatrix.codes.map((c) => {
                            const v = st.fleetMatrix.cell[f][c]
                            const ton = matrixTon(v)
                            const tone = ton ? MATRIX_KLASSE[ton] : 'text-dim'
                            return (
                              <td key={c} className="p-1">
                                <span className={`block whitespace-nowrap rounded px-1 py-1 text-center tabular-nums ${tone}`}>{v === null ? '–' : v.toFixed(1)}</span>
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

          {/* Bedienelement, kein Inhalt — im Ausdruck stand die Karte ohne
              ihre Knöpfe (RPT-01). */}
          <Card className="p-4 print:hidden">
            <CardHeading level={2} className="mb-3">{t('forms:admin.export')}</CardHeading>
            <div className="flex flex-wrap gap-2">
              {(['records', 'competencies', 'people'] as const).map((s) => (
                <Button
                  key={s}
                  variant="ghost"
                  onClick={() =>
                    // Alle drei Auszüge folgen demselben Ausschnitt, und der
                    // Kopf nennt Zeitraum und Basis (Audit 11/2026, EXP-03).
                    exportCsv(s, {
                      records: statistikRohdaten(records, {
                        fleet: statsFleet,
                        authority: statsAuthority,
                        period: statsPeriod,
                        now: Date.now() + state.timeOffsetMs,
                      }),
                      filters: statistikKopf(s, { fleet: statsFleet, authority: statsAuthority, period: statsPeriod, doc }),
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
