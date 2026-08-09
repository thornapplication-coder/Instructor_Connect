import { ArrowLeft, ArrowRight, ChevronDown, Info, Plus, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SignaturePad } from '../components/SignaturePad'
import { Button, Card, Field, inputCls, Modal, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { DURATION_OPTIONS } from '../sandbox/gradingDefaults'
import { useStore } from '../store'
import { GRADES, type AttendanceEntry, type FormField, type FormTypeId, type Grade, type GradingRecord, type OverallResult, type SessionStatus, type TraineeGrading } from '../types'
import { gradeColor } from './Grading'

let seq = 0
const newId = () => `gr-${Date.now()}-${seq++}`

function emptyTrainee(codes: string[], position: string): TraineeGrading {
  return {
    traineeId: '',
    traineeName: '',
    position,
    grades: codes.map((code) => ({ code, grade: null, comment: '' })),
    positiveComment: '',
    developmentComment: '',
    summaryComment: '',
    overall: null,
  }
}

/** Automatik laut Vorgabe: mind. eine „1“ oder mind. zwei „2“ ⇒ Not Competent */
export function autoNotCompetent(tr: TraineeGrading): boolean {
  const ones = tr.grades.filter((g) => g.grade === 1).length
  const twos = tr.grades.filter((g) => g.grade === 2).length
  return ones >= 1 || twos >= 2
}

export function GradingForm({ recordId, presetType, parentId, nextTypes = [] }: { recordId?: string; presetType?: FormTypeId; parentId?: string; nextTypes?: FormTypeId[] }) {
  // Formulare sind immer vollständig englisch, unabhängig von der App-Sprache.
  const { i18n } = useTranslation()
  const t = useMemo(() => i18n.getFixedT('en'), [i18n])
  const { state, currentUser, saveGradingRecord } = useStore()
  const grading = state.settings.grading

  const existing = recordId ? state.gradingRecords.find((r) => r.id === recordId) : undefined
  const parent = parentId ? state.gradingRecords.find((r) => r.id === parentId) : undefined

  const [formTypeId, setFormTypeId] = useState<FormTypeId | null>(existing?.formTypeId ?? presetType ?? null)
  const formType = grading.formTypes.find((f) => f.id === formTypeId) ?? null
  const competencies = formType?.competencySet
    ? grading.competencySets.find((c) => c.key === formType.competencySet)?.competencies ?? []
    : []
  const codes = competencies.map((c) => c.code)

  const [header, setHeader] = useState<Record<string, string>>(
    existing?.header ?? (parent ? { aircraftType: parent.header.aircraftType, date: parent.header.date, trainingDevice: parent.header.trainingDevice ?? '' } : {}),
  )
  const [trainees, setTrainees] = useState<TraineeGrading[]>(existing?.trainees ?? [])
  const [freeText, setFreeText] = useState<Record<string, string>>(existing?.freeText ?? {})
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(existing?.sessionStatus ?? null)
  // Unterschriften werden grundsätzlich NIE übernommen — auch beim Bearbeiten
  // eines bestehenden Formulars muss neu unterschrieben werden.
  const [attendance, setAttendance] = useState<AttendanceEntry[]>(
    existing?.attendance?.map((a) => ({ ...a, signature: null })) ?? [{ name: '', signature: null }],
  )
  const [sigInstructor, setSigInstructor] = useState<string | null>(null)
  const [sigTrainee, setSigTrainee] = useState<string | null>(null)
  /** je Student eine eigene Unterschrift (Index der Trainee-Liste) */
  const [sigTrainees, setSigTrainees] = useState<Record<number, string | null>>({})
  // Ablauf: 1 Kopfdaten (Student/Instructor) -> 2 Grading + Session-Daten -> Unterschrift
  const [step, setStep] = useState(existing ? 2 : 1)
  const [openBehaviour, setOpenBehaviour] = useState<string | null>(null)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [followUps, setFollowUps] = useState<FormTypeId[]>([])
  const [error, setError] = useState('')
  /** zusätzliche Empfänger, die der Instruktor am Formularende angibt */
  const [extraRecipients, setExtraRecipients] = useState<string[]>(existing?.extraRecipients ?? [])
  const [recipientDraft, setRecipientDraft] = useState('')

  // Clientseitige Sperre analog Admin.tsx; serverseitig gilt später RLS.
  const mayGrade = currentUser!.canGrade || currentUser!.role !== 'member'

  const setTrainee = (i: number, patch: Partial<TraineeGrading>) =>
    setTrainees((list) => list.map((tr, j) => (j === i ? { ...tr, ...patch } : tr)))

  const setGrade = (i: number, code: string, grade: Grade) =>
    setTrainees((list) =>
      list.map((tr, j) => {
        if (j !== i) return tr
        const grades = tr.grades.map((g) => (g.code === code ? { ...g, grade } : g))
        const next = { ...tr, grades }
        // Automatik greift sofort und setzt das Overall Result fest.
        return autoNotCompetent(next) ? { ...next, overall: 'not_competent' as OverallResult } : next
      }),
    )

  const setGradeComment = (i: number, code: string, comment: string) =>
    setTrainee(i, { grades: trainees[i].grades.map((g) => (g.code === code ? { ...g, comment } : g)) })

  const headerFields = formType?.fields ?? []
  /** vor dem Grading zu erfassen (Schritt 1) */
  const preFields = headerFields.filter((f) => !f.postGrading)
  /** erst NACH dem Grading zu erfassen (Flight Time, Landings, …) */
  const postFields = headerFields.filter((f) => f.postGrading)

  const isAttendance = formTypeId === '307A' || formTypeId === '307B'

  const needsFollowUp =
    trainees.some((tr) => tr.overall === 'not_competent' || autoNotCompetent(tr)) || sessionStatus === 'not_completed'

  /** Pflicht-Folgeformulare: Not Competent ⇒ 306, Session nicht abgeschlossen ⇒ 310 */
  const requiredFollowUps: FormTypeId[] = [
    ...(trainees.some((tr) => tr.overall === 'not_competent' || autoNotCompetent(tr)) ? (['306'] as FormTypeId[]) : []),
    ...(sessionStatus === 'not_completed' ? (['310'] as FormTypeId[]) : []),
  ]

  /** Schritt 1: Kopfdaten inkl. Student/Instructor */
  const validateHeader = (): string => {
    if (!formType) return t('grading.errFormType')
    for (const f of preFields) {
      if (f.required && !header[f.key]?.trim()) return t('grading.errRequired', { field: f.label })
    }
    if (competencies.length > 0) {
      if (trainees.length === 0 || trainees.some((tr) => !tr.traineeName?.trim())) return t('grading.errNoTrainee')
    }
    return ''
  }

  /** Schritt 2: Bewertung, Session-Daten und Unterschrift */
  const validate = (): string => {
    const headErr = validateHeader()
    if (headErr) return headErr
    if (competencies.length > 0) {
      for (const tr of trainees) {
        const name = tr.traineeName?.trim() || t('grading.trainee')
        if (tr.grades.some((g) => g.grade === null)) return t('grading.errGrades')
        if (tr.grades.some((g) => (g.grade === 1 || g.grade === 2) && !g.comment.trim()))
          return t('grading.errGradeComment', { name })
        if (!tr.positiveComment.trim() || !tr.developmentComment.trim() || !tr.summaryComment.trim())
          return t('grading.errComments', { name })
        if (!tr.overall) return t('grading.errOverall')
      }
      if (!sessionStatus) return t('grading.errSession')
    }
    for (const f of postFields) {
      if (f.required && !header[f.key]?.trim()) return t('grading.errRequired', { field: f.label })
    }
    if (!sigInstructor) return t('grading.errSignature')
    return ''
  }

  /**
   * Mehrere Studenten im selben Durchgang dienen nur der Bedienbarkeit:
   * beim Abschluss entsteht PRO Student ein eigenes Formular mit eigener
   * Unterschrift. Formulare ohne Kompetenzbewertung (306/310/307) bleiben
   * ein einzelnes Dokument.
   */
  const buildRecords = (): GradingRecord[] => {
    const ts = Date.now() + state.timeOffsetMs
    if (competencies.length === 0) {
      const signed = sigInstructor && (sigTrainee || isAttendance)
      const escalate = sessionStatus === 'not_completed'
      return [
        {
          id: existing?.id ?? newId(),
          formTypeId: formType!.id,
          instructorId: currentUser!.id,
          header,
          trainees: [],
          sessionStatus,
          freeText,
          attendance: isAttendance ? attendance.filter((a) => a.name.trim()) : undefined,
          signatureInstructor: sigInstructor,
          signatureTrainee: sigTrainee,
          extraRecipients,
          status: signed ? 'signed' : 'awaiting_signature',
          mailStatus: signed ? (escalate ? 'pending' : 'sent') : 'pending',
          parentId: parentId ?? existing?.parentId,
          createdAt: existing?.createdAt ?? ts,
          signedAt: signed ? ts : undefined,
        },
      ]
    }
    return trainees.map((tr, i) => {
      // Automatik nochmals hart durchsetzen, falls ein alter Zustand vorliegt.
      const fixed = autoNotCompetent(tr) ? { ...tr, overall: 'not_competent' as OverallResult } : tr
      const sigT = sigTrainees[i] ?? null
      const signed = sigInstructor && sigT
      // Nicht bestanden oder Session nicht abgeschlossen → Eskalationsempfänger.
      const escalate = fixed.overall === 'not_competent' || sessionStatus === 'not_completed'
      return {
        id: existing && trainees.length === 1 ? existing.id : newId(),
        formTypeId: formType!.id,
        instructorId: currentUser!.id,
        header,
        trainees: [fixed],
        sessionStatus,
        freeText,
        attendance: undefined,
        signatureInstructor: sigInstructor,
        signatureTrainee: sigT,
        extraRecipients,
        status: signed ? 'signed' : 'awaiting_signature',
        // Sandbox: Versand wird simuliert. Eskalationsfälle bleiben zunächst
        // offen, damit sich der Fehlerfall im Admin-Panel testen lässt.
        mailStatus: signed ? (escalate ? 'pending' : 'sent') : 'pending',
        parentId: parentId ?? existing?.parentId,
        createdAt: existing?.createdAt ?? ts,
        signedAt: signed ? ts : undefined,
      }
    })
  }

  const saveAll = (): GradingRecord[] => {
    const recs = buildRecords()
    recs.forEach(saveGradingRecord)
    return recs
  }

  const submit = () => {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setError('')
    if (needsFollowUp && !parentId) {
      // Pflichtformulare sind vorausgewählt und nicht abwählbar
      setFollowUps(requiredFollowUps)
      setShowFollowUp(true)
      return
    }
    const recs = saveAll()
    // Teil einer Folgeformular-Kette (306 und 310 gewählt): nächstes öffnen.
    if (parentId && nextTypes.length > 0) {
      navigate(`/grading/new?type=${nextTypes[0]}&parent=${parentId}&next=${nextTypes.slice(1).join(',')}`)
      return
    }
    navigate(recs.length === 1 ? `/grading/${recs[0].id}` : '/grading')
  }

  /** Speichern und die (Pflicht-)Folgeformulare als Kette öffnen */
  const finish = () => {
    const recs = saveAll()
    setShowFollowUp(false)
    // Folgeformulare hängen am (ersten) Not-Competent-Formular
    const parentRec = recs.find((r) => r.trainees.some((tr) => tr.overall === 'not_competent')) ?? recs[0]
    if (followUps.length > 0) {
      navigate(`/grading/new?type=${followUps[0]}&parent=${parentRec.id}&next=${followUps.slice(1).join(',')}`)
    } else {
      navigate(recs.length === 1 ? `/grading/${recs[0].id}` : '/grading')
    }
  }

  /** Kopf- und Session-Datenfelder — in Schritt 1 (pre) und Schritt 2 (post) genutzt */
  const renderField = (f: FormField) => (
    <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
      <Field label={f.label + (f.required ? ' *' : '')}>
        {f.type === 'select' ? (
          <select
            value={header[f.key] ?? ''}
            onChange={(e) => setHeader({ ...header, [f.key]: e.target.value })}
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
          >
            <option value="">…</option>
            {[...(f.options ?? [])].sort((a, b) => a.localeCompare(b)).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : f.type === 'duration' ? (
          // Zeiten immer im Format hh:mm, wählbar in 30-Minuten-Schritten
          <select
            value={header[f.key] ?? ''}
            onChange={(e) => setHeader({ ...header, [f.key]: e.target.value })}
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
          >
            <option value="">hh:mm …</option>
            {DURATION_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : f.type === 'textarea' ? (
          <textarea
            value={header[f.key] ?? ''}
            onChange={(e) => setHeader({ ...header, [f.key]: e.target.value })}
            className={`${inputCls} min-h-20`}
          />
        ) : f.type === 'radiogroup' ? (
          // Einfachauswahl als Ankreuzfelder wie im Original
          <div className="flex flex-wrap gap-1.5">
            {(f.options ?? []).map((o) => {
              const on = header[f.key] === o
              return (
                <button
                  key={o}
                  onClick={() => setHeader({ ...header, [f.key]: on ? '' : o })}
                  className={`rounded-lg border px-3 py-2 text-[13px] transition ${
                    on ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                  }`}
                >
                  {on ? '☒' : '☐'} {o}
                </button>
              )
            })}
          </div>
        ) : f.type === 'checkgroup' ? (
          // Ankreuzfeld-Gruppe wie im Original (z. B. ATA Chapters bei 308F)
          <div className="flex flex-wrap gap-1.5">
            {[...(f.options ?? [])].sort((a, b) => a.localeCompare(b)).map((o) => {
              const sel = (header[f.key] ?? '').split(', ').filter(Boolean)
              const on = sel.includes(o)
              return (
                <button
                  key={o}
                  onClick={() =>
                    setHeader({
                      ...header,
                      [f.key]: (on ? sel.filter((x) => x !== o) : [...sel, o]).sort().join(', '),
                    })
                  }
                  className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] transition ${
                    on ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                  }`}
                >
                  {on ? '☒' : '☐'} {o}
                </button>
              )
            })}
          </div>
        ) : (
          <input
            type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
            value={header[f.key] ?? ''}
            onChange={(e) => setHeader({ ...header, [f.key]: e.target.value })}
            className={inputCls}
          />
        )}
      </Field>
    </div>
  )

  if (!mayGrade) {
    return (
      <>
        <TopBar title={t('grading.newForm')} back="/grading" home={false} />
        <Page>
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] leading-relaxed text-dim">{t('grading.noPermission')}</p>
        </Page>
      </>
    )
  }

  return (
    <>
      <TopBar title={parent ? `${formTypeId} · ${t('grading.followUpFor')} ${parent.formTypeId}` : t('grading.newForm')} back="/grading" home={false} />
      <Page className="space-y-4 pb-32">
        {/* 1. Formulartyp */}
        <Card className="p-4">
          <Field label={t('grading.formType')}>
            <select
              value={formTypeId ?? ''}
              disabled={!!existing || !!presetType}
              onChange={(e) => {
                const id = e.target.value as FormTypeId
                setFormTypeId(id)
                setStep(1)
                setError('')
                const ft = grading.formTypes.find((f) => f.id === id)
                const cs = ft?.competencySet ? grading.competencySets.find((c) => c.key === ft.competencySet)?.competencies ?? [] : []
                setTrainees(cs.length > 0 ? [emptyTrainee(cs.map((c) => c.code), 'CDR')] : [])
              }}
              className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px] disabled:opacity-60"
            >
              <option value="">…</option>
              {[...grading.formTypes]
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.id} — {f.title}
                  </option>
                ))}
            </select>
          </Field>
        </Card>

        {formType && step === 1 && (
          <>
            {/* 2a. Student / Instructor — Aufbau wie im Originalformular */}
            {competencies.length > 0 && (
              <Card className="space-y-4 p-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.participants')}</p>

                {trainees.map((tr, i) => (
                  <div key={i} className="rounded-xl border border-line/10 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <p className="flex-1 text-[13px] font-semibold text-accent">
                        {t('grading.student')} {trainees.length > 1 ? i + 1 : ''}
                      </p>
                      {trainees.length > 1 && (
                        <button onClick={() => setTrainees(trainees.filter((_, j) => j !== i))} className="text-dim hover:text-danger">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    {/* Studentenname wird immer frei eingetippt — kein Dropdown */}
                    <input
                      value={tr.traineeName ?? ''}
                      onChange={(e) => setTrainee(i, { traineeName: e.target.value })}
                      placeholder={t('grading.studentName')}
                      className={`${inputCls} mb-2`}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {['CDR', 'FO'].map((o) => (
                        <button
                          key={o}
                          onClick={() => setTrainee(i, { position: o })}
                          className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
                            tr.position === o ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                          }`}
                        >
                          {tr.position === o ? '☒' : '☐'} {o}
                        </button>
                      ))}
                      <span className="w-full" />
                      {['Left', 'Right'].map((o) => (
                        <button
                          key={o}
                          onClick={() => setTrainee(i, { seat: tr.seat === o ? '' : o })}
                          className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
                            tr.seat === o ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                          }`}
                        >
                          {tr.seat === o ? '☒' : '☐'} {o}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setTrainees([...trainees, emptyTrainee(codes, 'CDR')])}
                  className="flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline"
                >
                  <Plus size={15} /> {t('grading.addTrainee')}
                </button>
                {trainees.length > 1 && (
                  <p className="rounded-xl bg-bg/40 p-3 text-[12px] leading-relaxed text-dim">{t('grading.multiStudentHint')}</p>
                )}

                <div className="rounded-xl border border-line/10 p-3">
                  <p className="mb-2 text-[13px] font-semibold text-accent">{t('grading.instructor')}</p>
                  <p className="mb-2 rounded-lg bg-bg/40 px-3 py-2 text-[14px]">{currentUser!.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['TKI', 'SFI', 'TRI'].map((o) => (
                      <button
                        key={o}
                        onClick={() => setHeader({ ...header, instructorQual: header.instructorQual === o ? '' : o })}
                        className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
                          header.instructorQual === o ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                        }`}
                      >
                        {header.instructorQual === o ? '☒' : '☐'} {o}
                      </button>
                    ))}
                    <span className="w-full" />
                    {['Left', 'Right', 'Rear'].map((o) => (
                      <button
                        key={o}
                        onClick={() => setHeader({ ...header, instructorSeat: header.instructorSeat === o ? '' : o })}
                        className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
                          header.instructorSeat === o ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                        }`}
                      >
                        {header.instructorSeat === o ? '☒' : '☐'} {o}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* 2b. Kopfdaten (nur Felder, die VOR dem Grading erfasst werden) */}
            <Card className="space-y-3 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.headerData')}</p>
              <div className="grid gap-3 sm:grid-cols-2">{preFields.map(renderField)}</div>
            </Card>

            {/* 3. Freitextabschnitte (306/310) */}
            {formType.freeTextSections.length > 0 && (
              <Card className="space-y-3 p-4">
                {formType.freeTextSections.map((sec) => (
                  <Field key={sec} label={sec}>
                    <textarea
                      value={freeText[sec] ?? ''}
                      onChange={(e) => setFreeText({ ...freeText, [sec]: e.target.value })}
                      className={`${inputCls} min-h-24`}
                    />
                  </Field>
                ))}
              </Card>
            )}

            <Button
              className="flex w-full items-center justify-center gap-2 py-3"
              onClick={() => {
                const err = validateHeader()
                if (err) {
                  setError(err)
                  return
                }
                setError('')
                setStep(2)
                window.scrollTo(0, 0)
              }}
            >
              {competencies.length > 0 ? t('grading.toGrading') : t('grading.continue')} <ArrowRight size={16} />
            </Button>
            {error && <p className="text-[13px] text-danger">{error}</p>}
          </>
        )}

        {formType && step === 2 && (
          <>
            <button onClick={() => { setStep(1); window.scrollTo(0, 0) }} className="flex items-center gap-1.5 text-[13.5px] text-dim hover:text-ink">
              <ArrowLeft size={15} /> {t('grading.backToHeader')}
            </button>

            {/* 4. Grading je Pilot */}
            {competencies.length > 0 &&
              trainees.map((tr, i) => {
                const auto = autoNotCompetent(tr)
                return (
                <Card key={i} className="space-y-4 p-4">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-[13px] font-semibold uppercase tracking-wide text-dim">
                      {tr.traineeName?.trim() || t('grading.traineeN', { n: i + 1 })}
                      {tr.position ? ` · ${tr.position}` : ''}
                      {tr.seat ? ` · ${tr.seat}` : ''}
                    </p>
                  </div>


                  <div className="space-y-3">
                    {competencies.map((c) => {
                      const g = tr.grades.find((x) => x.code === c.code)
                      const key = `${i}-${c.code}`
                      const commentRequired = g?.grade === 1 || g?.grade === 2
                      return (
                        <div key={c.code} className="rounded-xl border border-line/10 p-3">
                          <div className="mb-2 flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold">
                                {c.code} <span className="font-normal text-dim">· {c.title}</span>
                              </p>
                            </div>
                            <button
                              onClick={() => setOpenBehaviour(openBehaviour === key ? null : key)}
                              title={t('grading.behaviours')}
                              className="flex shrink-0 items-center gap-1 rounded-lg border border-line/15 px-2 py-1 text-[11.5px] text-dim hover:text-accent"
                            >
                              <Info size={12} /> OB <ChevronDown size={11} className={openBehaviour === key ? 'rotate-180' : ''} />
                            </button>
                          </div>
                          {openBehaviour === key && (
                            <ul className="mb-2.5 list-disc space-y-1 rounded-lg bg-bg/50 p-3 pl-7 text-[12.5px] leading-relaxed text-dim">
                              {c.behaviours.map((b, bi) => (
                                <li key={bi}>{b}</li>
                              ))}
                            </ul>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {GRADES.map((val) => (
                              <button
                                key={String(val)}
                                onClick={() => setGrade(i, c.code, val)}
                                className={`min-w-[52px] rounded-lg px-3 py-2.5 text-[14px] font-semibold transition ${
                                  g?.grade === val ? gradeColor(val) + ' ring-2 ring-accent' : 'bg-line/[0.06] text-dim hover:bg-line/10'
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                          <input
                            value={g?.comment ?? ''}
                            onChange={(e) => setGradeComment(i, c.code, e.target.value)}
                            placeholder={commentRequired ? t('grading.commentRequired') : t('grading.commentOptional')}
                            className={`${inputCls} mt-2 text-[13px] ${commentRequired && !g?.comment.trim() ? 'border-danger/60' : ''}`}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <Field label={t('grading.positive') + ' *'}>
                    <textarea value={tr.positiveComment} onChange={(e) => setTrainee(i, { positiveComment: e.target.value })} className={`${inputCls} min-h-20`} />
                  </Field>
                  <Field label={t('grading.development') + ' *'}>
                    <textarea value={tr.developmentComment} onChange={(e) => setTrainee(i, { developmentComment: e.target.value })} className={`${inputCls} min-h-20`} />
                  </Field>
                  <Field label={t('grading.summary') + ' *'}>
                    <textarea value={tr.summaryComment} onChange={(e) => setTrainee(i, { summaryComment: e.target.value })} className={`${inputCls} min-h-20`} />
                  </Field>

                  <Field label={t('grading.overall') + ' *'}>
                    <div className="flex gap-2">
                      {(['competent', 'not_competent'] as OverallResult[]).map((o) => (
                        <button
                          key={o}
                          disabled={o === 'competent' && auto}
                          onClick={() => setTrainee(i, { overall: o })}
                          className={`flex-1 rounded-xl border px-3 py-3 text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            tr.overall === o
                              ? o === 'competent'
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-red-600 bg-red-600 text-white'
                              : 'border-line/15 text-dim'
                          }`}
                        >
                          {t(`grading.${o}`)}
                        </button>
                      ))}
                    </div>
                    {auto && <p className="mt-2 text-[12.5px] leading-relaxed text-danger">{t('grading.autoNotCompetent')}</p>}
                  </Field>
                </Card>
                )
              })}

            {competencies.length > 0 && (
              <>
                <Card className="p-4">
                  <Field label={t('grading.sessionStatus') + ' *'}>
                    <div className="flex gap-2">
                      {(['completed', 'not_completed'] as SessionStatus[]).map((sst) => (
                        <button
                          key={sst}
                          onClick={() => setSessionStatus(sst)}
                          className={`flex-1 rounded-xl border px-3 py-2.5 text-[13.5px] transition ${
                            sessionStatus === sst ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line/15 text-dim'
                          }`}
                        >
                          {t(`grading.${sst}`)}
                        </button>
                      ))}
                    </div>
                  </Field>
                </Card>
              </>
            )}

            {/* 4b. Session-Daten — werden immer erst NACH dem Grading erfasst */}
            {postFields.length > 0 && (
              <Card className="space-y-3 p-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.sessionData')}</p>
                <p className="text-[12px] leading-relaxed text-dim/80">{t('grading.sessionDataHint')}</p>
                <div className="grid gap-3 sm:grid-cols-2">{postFields.map(renderField)}</div>
              </Card>
            )}

            {/* 4c. Teilnehmerliste (307A/307B) */}
            {isAttendance && (
              <Card className="space-y-3 p-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.attendance')}</p>
                {attendance.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-[12.5px] text-dim">{i + 1}.</span>
                    <input
                      value={a.name}
                      onChange={(e) => setAttendance(attendance.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder={t('grading.studentName')}
                      className={inputCls}
                    />
                    {attendance.length > 1 && (
                      <button onClick={() => setAttendance(attendance.filter((_, j) => j !== i))} className="shrink-0 text-dim hover:text-danger">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setAttendance([...attendance, { name: '', signature: null }])}
                  className="flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline"
                >
                  <Plus size={15} /> {t('grading.addAttendee')}
                </button>
                {formTypeId === '307B' && <p className="text-[11.5px] leading-relaxed text-dim/80">{t('grading.attendance307B')}</p>}
              </Card>
            )}

            {/* 5. Unterschriften — immer live zu leisten, nie gespeichert/übernommen.
                Bei mehreren Studenten unterschreibt JEDER einzeln; pro Student
                entsteht beim Abschluss ein eigenes Formular. */}
            <Card className="space-y-4 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.signatures')}</p>
              <SignaturePad value={sigInstructor} onChange={setSigInstructor} label={t('grading.sigInstructor')} />
              {competencies.length > 0 ? (
                trainees.map((tr, i) => (
                  <SignaturePad
                    key={i}
                    value={sigTrainees[i] ?? null}
                    onChange={(v) => setSigTrainees((s) => ({ ...s, [i]: v }))}
                    label={`${t('grading.sigTrainee')} — ${tr.traineeName?.trim() || t('grading.traineeN', { n: i + 1 })}`}
                  />
                ))
              ) : (
                !isAttendance && <SignaturePad value={sigTrainee} onChange={setSigTrainee} label={t('grading.sigTrainee')} />
              )}
              {trainees.length > 1 && (
                <p className="text-[11.5px] leading-relaxed text-dim/80">{t('grading.multiStudentHint')}</p>
              )}
              <p className="text-[11.5px] leading-relaxed text-dim/80">{t('grading.lockNote')}</p>
              <p className="text-[11.5px] leading-relaxed text-dim/80">{t('grading.sigLiveNote')}</p>
            </Card>

            {/* Deferred Item List: Versand geht immer an den Training Admin */}
            {formTypeId === '310' && (
              <p className="rounded-xl border border-warm/25 bg-warm/5 p-3.5 text-[12.5px] leading-relaxed text-dim">
                {t('grading.deferredMailNote', { recipients: grading.deferredRecipients.join(', ') })}
              </p>
            )}

            {/* 6. Empfänger: Standard (Admin-Konfiguration) + zusätzliche */}
            <Card className="space-y-3 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.recipientsCard')}</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ...grading.defaultRecipients,
                  ...(formTypeId === '310' ? grading.deferredRecipients : []),
                  ...(needsFollowUp ? grading.escalationRecipients : []),
                ].map((r) => (
                  <span key={r} className="rounded-full bg-raised px-2.5 py-1 text-[12px] text-dim">
                    {r}
                  </span>
                ))}
                {extraRecipients.map((r) => (
                  <span key={r} className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] text-accent">
                    {r}
                    <button onClick={() => setExtraRecipients(extraRecipients.filter((x) => x !== r))} className="hover:text-danger">
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {(() => {
                const addRecipient = () => {
                  const v = recipientDraft.trim()
                  if (!/.+@.+\..+/.test(v) || extraRecipients.includes(v)) return
                  setExtraRecipients([...extraRecipients, v])
                  setRecipientDraft('')
                }
                return (
                  <div className="flex gap-2">
                    <input
                      value={recipientDraft}
                      onChange={(e) => setRecipientDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                      placeholder={t('grading.addRecipient')}
                      className={inputCls}
                    />
                    <Button variant="ghost" onClick={addRecipient} disabled={!/.+@.+\..+/.test(recipientDraft.trim())}>
                      <Plus size={16} />
                    </Button>
                  </div>
                )
              })()}
              <p className="text-[11.5px] leading-relaxed text-dim/80">{t('grading.extraRecipientsHint')}</p>
            </Card>

            {/* 7. Senden — erst möglich, wenn alles vollständig ausgefüllt ist */}
            {(() => {
              const liveError = validate()
              return (
                <>
                  {liveError && (
                    <p className="rounded-xl border border-warm/25 bg-warm/5 p-3.5 text-[12.5px] leading-relaxed text-dim">
                      {t('grading.sendBlocked')} {liveError}
                    </p>
                  )}
                  <Button
                    disabled={!!liveError}
                    className="flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={submit}
                  >
                    <Send size={16} /> {t('grading.finish')}
                  </Button>
                </>
              )
            })()}
          </>
        )}
      </Page>

      {showFollowUp && (
        <Modal title={t('grading.followUpTitle')} onClose={() => setShowFollowUp(false)}>
          <p className="mb-4 text-[13.5px] leading-relaxed text-dim">{t('grading.followUpBodyMandatory')}</p>
          <div className="space-y-2">
            {(['306', '310'] as FormTypeId[]).map((id) => {
              const ft = grading.formTypes.find((f) => f.id === id)!
              const required = requiredFollowUps.includes(id)
              const on = followUps.includes(id)
              return (
                <button
                  key={id}
                  disabled={required}
                  onClick={() => setFollowUps(on ? followUps.filter((x) => x !== id) : [...followUps, id])}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                    on ? 'border-accent bg-accent/10' : 'border-line/15'
                  } ${required ? 'cursor-default' : ''}`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-bg' : 'border-line/30'}`}>
                    {on && '✓'}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px]">
                    <span className="font-semibold">{ft.id}</span> — {ft.title}
                  </span>
                  {/* Pflichtformular: vorausgewählt und nicht abwählbar */}
                  {required && (
                    <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
                      {t('grading.mandatory')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-dim/80">{t('grading.followUpMailNote')}</p>
          <div className="mt-5 flex justify-end">
            <Button onClick={finish} disabled={followUps.length === 0}>
              {t('grading.openFollowUp')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
