import { ArrowLeft, ArrowRight, ChevronDown, Info, Plus, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SignaturePad } from '../components/SignaturePad'
import { Button, Card, Field, inputCls, Modal, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'
import { GRADES, type AttendanceEntry, type FormTypeId, type Grade, type GradingRecord, type OverallResult, type SessionStatus, type TraineeGrading } from '../types'
import { gradeColor } from './Grading'

let seq = 0
const newId = () => `gr-${Date.now()}-${seq++}`

function emptyTrainee(codes: string[], position: string): TraineeGrading {
  return {
    traineeId: '',
    position,
    grades: codes.map((code) => ({ code, grade: null, comment: '' })),
    positiveComment: '',
    developmentComment: '',
    summaryComment: '',
    overall: null,
  }
}

export function GradingForm({ recordId, presetType, parentId, nextTypes = [] }: { recordId?: string; presetType?: FormTypeId; parentId?: string; nextTypes?: FormTypeId[] }) {
  const { t } = useTranslation()
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
  const [attendance, setAttendance] = useState<AttendanceEntry[]>(existing?.attendance ?? [{ name: '', signature: null }])
  const [sigInstructor, setSigInstructor] = useState<string | null>(existing?.signatureInstructor ?? null)
  const [sigTrainee, setSigTrainee] = useState<string | null>(existing?.signatureTrainee ?? null)
  // Ablauf: 1 Kopfdaten (Student/Instructor) -> 2 Grading -> 3 Unterschrift
  const [step, setStep] = useState(existing ? 2 : 1)
  const [openBehaviour, setOpenBehaviour] = useState<string | null>(null)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [followUps, setFollowUps] = useState<FormTypeId[]>([])
  const [error, setError] = useState('')

  // Clientseitige Sperre analog Admin.tsx; serverseitig gilt später RLS.
  const mayGrade = currentUser!.canGrade || currentUser!.role !== 'member'

  const traineeOptions = useMemo(
    () => state.users.filter((u) => u.isTrainee && u.active).sort((a, b) => a.name.localeCompare(b.name)),
    [state.users],
  )

  const setTrainee = (i: number, patch: Partial<TraineeGrading>) =>
    setTrainees((list) => list.map((tr, j) => (j === i ? { ...tr, ...patch } : tr)))

  const setGrade = (i: number, code: string, grade: Grade) =>
    setTrainee(i, { grades: trainees[i].grades.map((g) => (g.code === code ? { ...g, grade } : g)) })

  const setGradeComment = (i: number, code: string, comment: string) =>
    setTrainee(i, { grades: trainees[i].grades.map((g) => (g.code === code ? { ...g, comment } : g)) })

  const headerFields = formType?.fields ?? []

  const isAttendance = formTypeId === '307A' || formTypeId === '307B'

  const needsFollowUp =
    trainees.some((tr) => tr.overall === 'not_competent') || sessionStatus === 'not_completed'

  /** Schritt 1: Kopfdaten inkl. Student/Instructor */
  const validateHeader = (): string => {
    if (!formType) return t('grading.errFormType')
    for (const f of headerFields) {
      if (f.required && !header[f.key]?.trim()) return t('grading.errRequired', { field: f.label })
    }
    if (competencies.length > 0) {
      if (trainees.length === 0 || trainees.some((tr) => !tr.traineeId)) return t('grading.errNoTrainee')
    }
    return ''
  }

  /** Schritt 2: Bewertung und Unterschrift */
  const validate = (): string => {
    const headErr = validateHeader()
    if (headErr) return headErr
    if (competencies.length > 0) {
      for (const tr of trainees) {
        if (tr.grades.some((g) => g.grade === null)) return t('grading.errGrades')
        if (!tr.overall) return t('grading.errOverall')
      }
      if (!sessionStatus) return t('grading.errSession')
    }
    if (!sigInstructor) return t('grading.errSignature')
    return ''
  }

  const buildRecord = (): GradingRecord => {
    // Nicht bestanden oder Session nicht abgeschlossen → Eskalationsempfänger.
    const escalate = needsFollowUp
    return {
      id: existing?.id ?? newId(),
      formTypeId: formType!.id,
      instructorId: currentUser!.id,
      header,
      trainees,
      sessionStatus,
      freeText,
      attendance: isAttendance ? attendance.filter((a) => a.name.trim()) : undefined,
      signatureInstructor: sigInstructor,
      signatureTrainee: sigTrainee,
      status: sigInstructor && (sigTrainee || isAttendance) ? 'signed' : 'awaiting_signature',
      // Sandbox: Versand wird simuliert. Eskalationsfälle bleiben zunächst
      // offen, damit sich der Fehlerfall im Admin-Panel testen lässt.
      mailStatus: sigInstructor && (sigTrainee || isAttendance) ? (escalate ? 'pending' : 'sent') : 'pending',
      parentId: parentId ?? existing?.parentId,
      createdAt: existing?.createdAt ?? Date.now() + state.timeOffsetMs,
      signedAt: sigInstructor && (sigTrainee || isAttendance) ? Date.now() + state.timeOffsetMs : undefined,
    }
  }

  const submit = () => {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setError('')
    if (needsFollowUp && !parentId) {
      setShowFollowUp(true)
      return
    }
    const rec = buildRecord()
    saveGradingRecord(rec)
    // Teil einer Folgeformular-Kette (306 und 310 gewählt): nächstes öffnen.
    if (parentId && nextTypes.length > 0) {
      navigate(`/grading/new?type=${nextTypes[0]}&parent=${parentId}&next=${nextTypes.slice(1).join(',')}`)
      return
    }
    navigate(`/grading/${rec.id}`)
  }

  /** withFollowUps=false: bewusst ohne Folgeformulare abschließen */
  const finish = (withFollowUps: boolean) => {
    const rec = buildRecord()
    saveGradingRecord(rec)
    setShowFollowUp(false)
    if (withFollowUps && followUps.length > 0) {
      navigate(`/grading/new?type=${followUps[0]}&parent=${rec.id}&next=${followUps.slice(1).join(',')}`)
    } else {
      navigate(`/grading/${rec.id}`)
    }
  }

  if (!mayGrade) {
    return (
      <>
        <TopBar title={t('grading.newForm')} back="/grading" />
        <Page>
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] leading-relaxed text-dim">{t('grading.noPermission')}</p>
        </Page>
      </>
    )
  }

  return (
    <>
      <TopBar title={parent ? `${formTypeId} · ${t('grading.followUpFor')} ${parent.formTypeId}` : t('grading.newForm')} back="/grading" />
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
                    <select
                      value={tr.traineeId}
                      onChange={(e) => setTrainee(i, { traineeId: e.target.value })}
                      className="mb-2 w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
                    >
                      <option value="">{t('grading.trainee')} …</option>
                      {traineeOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
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

            {/* 2b. Kopfdaten */}
            <Card className="space-y-3 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.headerData')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {headerFields.map((f) => (
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
                        // Ankreuzfeld-Gruppe wie im Original (z. B. 308H Event)
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
                ))}
              </div>
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
              trainees.map((tr, i) => (
                <Card key={i} className="space-y-4 p-4">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-[13px] font-semibold uppercase tracking-wide text-dim">
                      {state.users.find((u) => u.id === tr.traineeId)?.name ?? t('grading.traineeN', { n: i + 1 })}
                      {tr.position ? ` · ${tr.position}` : ''}
                      {tr.seat ? ` · ${tr.seat}` : ''}
                    </p>
                  </div>


                  <div className="space-y-3">
                    {competencies.map((c) => {
                      const g = tr.grades.find((x) => x.code === c.code)
                      const key = `${i}-${c.code}`
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
                            placeholder={t('grading.commentOptional')}
                            className={`${inputCls} mt-2 text-[13px]`}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <Field label={t('grading.positive')}>
                    <textarea value={tr.positiveComment} onChange={(e) => setTrainee(i, { positiveComment: e.target.value })} className={`${inputCls} min-h-20`} />
                  </Field>
                  <Field label={t('grading.development')}>
                    <textarea value={tr.developmentComment} onChange={(e) => setTrainee(i, { developmentComment: e.target.value })} className={`${inputCls} min-h-20`} />
                  </Field>
                  <Field label={t('grading.summary')}>
                    <textarea value={tr.summaryComment} onChange={(e) => setTrainee(i, { summaryComment: e.target.value })} className={`${inputCls} min-h-20`} />
                  </Field>

                  <Field label={t('grading.overall') + ' *'}>
                    <div className="flex gap-2">
                      {(['competent', 'not_competent'] as OverallResult[]).map((o) => (
                        <button
                          key={o}
                          onClick={() => setTrainee(i, { overall: o })}
                          className={`flex-1 rounded-xl border px-3 py-3 text-[14px] font-semibold transition ${
                            tr.overall === o
                              ? o === 'competent'
                                ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300'
                                : 'border-danger bg-danger/15 text-danger'
                              : 'border-line/15 text-dim'
                          }`}
                        >
                          {t(`grading.${o}`)}
                        </button>
                      ))}
                    </div>
                  </Field>
                </Card>
              ))}

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

            {/* 4b. Teilnehmerliste (307A/307B) */}
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

            {/* 5. Unterschriften */}
            <Card className="space-y-4 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.signatures')}</p>
              <SignaturePad value={sigInstructor} onChange={setSigInstructor} label={t('grading.sigInstructor')} />
              {!isAttendance && <SignaturePad value={sigTrainee} onChange={setSigTrainee} label={t('grading.sigTrainee')} />}
              <p className="text-[11.5px] leading-relaxed text-dim/80">{t('grading.lockNote')}</p>
            </Card>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <Button className="flex w-full items-center justify-center gap-2 py-3" onClick={submit}>
              <Send size={16} /> {t('grading.finish')}
            </Button>
          </>
        )}
      </Page>

      {showFollowUp && (
        <Modal title={t('grading.followUpTitle')} onClose={() => setShowFollowUp(false)}>
          <p className="mb-4 text-[13.5px] leading-relaxed text-dim">{t('grading.followUpBody')}</p>
          <div className="space-y-2">
            {(['306', '310'] as FormTypeId[]).map((id) => {
              const ft = grading.formTypes.find((f) => f.id === id)!
              const on = followUps.includes(id)
              return (
                <button
                  key={id}
                  onClick={() => setFollowUps(on ? followUps.filter((x) => x !== id) : [...followUps, id])}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                    on ? 'border-accent bg-accent/10' : 'border-line/15'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-bg' : 'border-line/30'}`}>
                    {on && '✓'}
                  </span>
                  <span className="text-[14px]">
                    <span className="font-semibold">{ft.id}</span> — {ft.title}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => finish(false)}>
              {t('grading.skipFollowUp')}
            </Button>
            <Button onClick={() => finish(true)} disabled={followUps.length === 0}>
              {t('grading.openFollowUp')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
