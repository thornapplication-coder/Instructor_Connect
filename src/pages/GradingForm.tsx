import { ArrowLeft, ArrowRight, ChevronDown, Info, Plus, Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SignaturePad } from '../components/SignaturePad'
import { Button, Card, Field, inputCls, Modal, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { DURATION_OPTIONS } from '../sandbox/gradingDefaults'
import { useStore } from '../store'
import { GRADES, type AttendanceEntry, type FormField, type FormType, type FormTypeId, type Grade, type GradingRecord, type OverallResult, type SessionStatus, type TraineeGrading } from '../types'
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

/**
 * Folgeformular 306: Der Abschnitt „State exercises marked with grade '2' or
 * below" wird aus dem Ausgangsformular vorbefüllt — händisch abgetippte Listen
 * gingen bisher an einzelnen Kompetenzen vorbei. Der Text bleibt änderbar.
 */
function prefillFromParent(
  parent: GradingRecord | undefined,
  presetType: FormTypeId | undefined,
  formTypes: FormType[],
): Record<string, string> {
  if (!parent || !presetType) return {}
  const sections = formTypes.find((f) => f.id === presetType)?.freeTextSections ?? []
  // Abschnitt anhand seiner Bedeutung finden, damit ein umbenannter Titel
  // im Admin Panel die Vorbefüllung nicht abschaltet.
  const section = sections.find((sec) => /\b2\b/.test(sec) && /below|unter/i.test(sec))
  if (!section) return {}
  // Das 308G führt bewusst keine Kürzel — dort muss der Text die Kompetenz
  // ausschreiben, sonst steht auf dem 306 ein Code, den niemand auflösen kann.
  const usesCodes = formTypes.find((f) => f.id === parent.formTypeId)?.competencySet !== 'instructor'
  const label = (code: string) =>
    usesCodes ? code : parent.competencies?.find((c) => c.code === code)?.title ?? code
  const named = parent.trainees.length > 1
  const lines = parent.trainees
    .map((tr) => {
      const low = tr.grades.filter((gr) => typeof gr.grade === 'number' && gr.grade <= 2)
      if (low.length === 0) return null
      const list = low.map((gr) => `${label(gr.code)} (${gr.grade})`).join(', ')
      return named ? `${tr.traineeName || ''}: ${list}`.trim() : list
    })
    .filter(Boolean)
  if (lines.length === 0) return {}
  const source = parent.header.event ? ` — ${parent.header.event}` : ''
  return { [section]: `${lines.join('\n')}${source}` }
}

/** Ein noch offenes Glied der Folgeformular-Kette: Formulartyp plus das
 *  Ausgangsformular, an dem es hängt. Bei mehreren Piloten je Durchgang ist
 *  der Elternteil je Glied ein anderer — deshalb reicht eine reine Typliste
 *  nicht aus. */
export interface FollowUpStep {
  type: FormTypeId
  parentId: string
}

/** Kette für die Adresszeile: „306:gr-1,306:gr-2,310:gr-1" */
export const encodeChain = (steps: FollowUpStep[]) => steps.map((x) => `${x.type}:${x.parentId}`).join(',')

export function decodeChain(raw: string): FollowUpStep[] {
  return raw
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(':')
      return idx < 0 ? null : { type: part.slice(0, idx), parentId: part.slice(idx + 1) }
    })
    .filter((x): x is FollowUpStep => x !== null && x.parentId.length > 0)
}

export function GradingForm({ recordId, presetType, parentId, next = [] }: { recordId?: string; presetType?: FormTypeId; parentId?: string; next?: FollowUpStep[] }) {
  // Formulare sind immer vollständig englisch, unabhängig von der App-Sprache.
  const { i18n } = useTranslation()
  const t = useMemo(() => i18n.getFixedT('en'), [i18n])
  const { state, currentUser, saveGradingRecord, can, gradingRecordById } = useStore()
  const grading = state.settings.grading

  // Beide IDs stammen aus der Adresszeile — deshalb über die
  // berechtigungsprüfende Auflösung, nicht roh aus dem Zustand.
  const existing = recordId ? gradingRecordById(recordId) : undefined
  const parent = parentId ? gradingRecordById(parentId) : undefined

  const [formTypeId, setFormTypeId] = useState<FormTypeId | null>(existing?.formTypeId ?? presetType ?? null)
  const formType = grading.formTypes.find((f) => f.id === formTypeId) ?? null
  const competencies = formType?.competencySet
    ? grading.competencySets.find((c) => c.key === formType.competencySet)?.competencies ?? []
    : []
  const codes = competencies.map((c) => c.code)

  const [header, setHeader] = useState<Record<string, string>>(
    existing?.header ??
      (parent
        ? {
            aircraftType: parent.header.aircraftType,
            date: parent.header.date,
            trainingDevice: parent.header.trainingDevice ?? '',
            // Folgeformulare gehören genau einem Piloten — Name aus dem
            // Ausgangsformular übernehmen, bleibt änderbar.
            traineeName: parent.trainees[0]?.traineeName ?? parent.header.traineeName ?? '',
          }
        : {}),
  )
  const [trainees, setTrainees] = useState<TraineeGrading[]>(existing?.trainees ?? [])
  const [freeText, setFreeText] = useState<Record<string, string>>(existing?.freeText ?? prefillFromParent(parent, presetType, grading.formTypes))
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
  const [draftRestored, setDraftRestored] = useState(false)
  // Doppeltipp-Schutz: navigate() setzt nur den Hash, die Komponente bleibt
  // kurz stehen — ohne Sperre entstünde ein zweiter Satz Formulare.
  const submittingRef = useRef(false)
  /** zusätzliche Empfänger, die der Instruktor am Formularende angibt */
  const [extraRecipients, setExtraRecipients] = useState<string[]>(existing?.extraRecipients ?? [])
  const [recipientDraft, setRecipientDraft] = useState('')

  // Clientseitige Sperre analog Admin.tsx; serverseitig gilt später RLS.
  const mayGrade = can('grading_create')

  /**
   * Entwurfssicherung. Eine halbe Stunde Bewertung war bisher mit einer
   * Wischgeste verloren: Browser-Zurück, Pfeil in der Kopfzeile und F5
   * verwarfen alles ohne Nachfrage. Der Stand wird deshalb laufend
   * gesichert und beim nächsten Öffnen angeboten. Unterschriften werden
   * bewusst NIE gesichert — sie müssen immer neu geleistet werden.
   */
  const draftKey = `aaa-draft-${recordId ?? parentId ?? 'new'}-${formTypeId ?? ''}`
  const dirty =
    !existing &&
    (Object.values(header).some((v) => v?.trim()) ||
      trainees.some((tr) => tr.traineeName?.trim() || tr.grades.some((g) => g.grade !== null)) ||
      Object.values(freeText).some((v) => v?.trim()) ||
      attendance.some((a) => a.name.trim()))

  // Beim ersten Rendern einen vorhandenen Entwurf anbieten
  const draftLoaded = useRef(false)
  useEffect(() => {
    if (draftLoaded.current || existing || !formTypeId) return
    draftLoaded.current = true
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.header) setHeader(d.header)
      if (d.trainees) setTrainees(d.trainees)
      if (d.freeText) setFreeText(d.freeText)
      if (d.attendance) setAttendance(d.attendance)
      if (d.sessionStatus) setSessionStatus(d.sessionStatus)
      if (typeof d.step === 'number') setStep(d.step)
      setDraftRestored(true)
    } catch {
      /* unlesbarer Entwurf wird ignoriert */
    }
  }, [draftKey, existing, formTypeId])

  useEffect(() => {
    if (!dirty || submittingRef.current) return
    const tm = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ header, trainees, freeText, attendance, sessionStatus, step }))
      } catch {
        /* Speicher voll: der Entwurf gilt dann nur für diese Sitzung */
      }
    }, 400)
    return () => clearTimeout(tm)
  }, [dirty, draftKey, header, trainees, freeText, attendance, sessionStatus, step])

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey)
    } catch {
      /* nichts zu verwerfen */
    }
  }, [draftKey])

  /** Vor dem Verlassen fragen — gibt false zurück, wenn geblieben wird. */
  const leaveGuard = useCallback(() => {
    if (!dirty || submittingRef.current) return true
    return window.confirm(t('grading.leaveConfirm'))
  }, [dirty, t])

  // Browser-Zurück abfangen: der Hash-Router wechselt sonst kommentarlos die
  // Seite. Ein zusätzlicher History-Eintrag macht die Geste abfangbar.
  useEffect(() => {
    if (!dirty) return
    const route = window.location.hash
    history.pushState(null, '', route)
    const onPop = () => {
      if (submittingRef.current) return
      if (window.confirm(t('grading.leaveConfirm'))) {
        navigate('/grading')
        return
      }
      // Bleiben: den Eintrag wieder aufspannen
      history.pushState(null, '', route)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [dirty, t])

  // Neuladen und Schließen des Tabs abfangen
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const setTrainee = (i: number, patch: Partial<TraineeGrading>) =>
    setTrainees((list) => list.map((tr, j) => (j === i ? { ...tr, ...patch } : tr)))

  /**
   * Studenten entfernen: die Unterschriften hängen am Listenindex und müssen
   * mit-verschoben werden — sonst erbt der nachrückende Student die
   * Unterschrift des gelöschten (falsches Dokument!).
   */
  const removeTrainee = (i: number) => {
    setTrainees((list) => list.filter((_, j) => j !== i))
    setSigTrainees((sigs) => {
      const next: Record<number, string | null> = {}
      Object.entries(sigs).forEach(([key, sig]) => {
        const idx = Number(key)
        if (idx < i) next[idx] = sig
        else if (idx > i) next[idx - 1] = sig
      })
      return next
    })
  }

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
  // 308G bewertet einen Candidate Instructor durch einen Course Instructor —
  // die Sitz-/Positionsangaben stehen dort im Kopf, nicht als Chips.
  const isInstructorSheet = formTypeId === '308G'
  // Instruktoren-Kompetenzen werden ausgeschrieben, ohne Kürzel (Original 308G)
  const hideCodes = formType?.competencySet === 'instructor'

  const needsFollowUp =
    trainees.some((tr) => tr.overall === 'not_competent' || autoNotCompetent(tr)) || sessionStatus === 'not_completed'

  /** Anzahl der Piloten, für die je ein eigenes 306 fällig wird */
  const notCompetentCount = trainees.filter((tr) => tr.overall === 'not_competent' || autoNotCompetent(tr)).length

  /** Pflicht-Folgeformulare: Not Competent ⇒ 306, Session nicht abgeschlossen ⇒ 310 */
  const requiredFollowUps: FormTypeId[] = [
    ...(trainees.some((tr) => tr.overall === 'not_competent' || autoNotCompetent(tr)) ? (['306'] as FormTypeId[]) : []),
    ...(sessionStatus === 'not_completed' ? (['310'] as FormTypeId[]) : []),
  ]

  /** Schlüssel des zuerst beanstandeten Feldes — der Fokus springt dorthin,
   *  statt die Meldung weit entfernt von der Ursache stehen zu lassen. */
  const errorKeyRef = useRef<string | null>(null)

  /** Schritt 1: Kopfdaten inkl. Student/Instructor */
  const validateHeader = (): string => {
    errorKeyRef.current = null
    if (!formType) return t('grading.errFormType')
    for (const f of preFields) {
      if (f.required && !header[f.key]?.trim()) {
        errorKeyRef.current = f.key
        return t('grading.errRequired', { field: f.label })
      }
    }
    // Entweder-oder-Paare: eines von beiden ist Pflicht
    for (const f of headerFields) {
      const partner = f.exclusiveWith ? headerFields.find((x) => x.key === f.exclusiveWith) : undefined
      if (!partner) continue
      if (!header[f.key]?.trim() && !header[partner.key]?.trim()) {
        errorKeyRef.current = f.key
        return t('grading.errEitherOr', { a: f.label, b: partner.label })
      }
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
        // „NO" heißt not observed. Ein Blatt ohne eine einzige echte Note
        // belegt keine Kompetenz und darf nicht abgeschlossen werden.
        if (!tr.grades.some((g) => typeof g.grade === 'number')) return t('grading.errAllNotObserved', { name })
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
    // 307A ist eine Anwesenheitsliste: wer daraufsteht, war da und unterschreibt.
    if (formTypeId === '307A') {
      const open = attendance.find((a) => a.name.trim() && !a.signature)
      if (open) return t('grading.errAttendanceSignature', { name: open.name.trim() })
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
          // Der Versand wird in der Sandbox simuliert und gelingt. Nur so kann
          // ein vollständiger Vorgang grün werden; der Fehlerfall bleibt über
          // die Seed-Daten vorführbar.
          mailStatus: signed ? 'sent' : 'pending',
          parentId: parentId ?? existing?.parentId,
          createdAt: existing?.createdAt ?? ts,
          signedAt: signed ? ts : undefined,
        },
      ]
    }
    // Ein Durchgang = ein Batch: alle daraus entstehenden Formulare teilen
    // sich die ID, damit ein 306/310 für den ganzen Durchgang zählt.
    const batchId = existing?.batchId ?? newId()
    return trainees.map((tr, i) => {
      // Automatik nochmals hart durchsetzen, falls ein alter Zustand vorliegt.
      const fixed = autoNotCompetent(tr) ? { ...tr, overall: 'not_competent' as OverallResult } : tr
      const sigT = sigTrainees[i] ?? null
      const signed = sigInstructor && sigT
      return {
        id: existing && trainees.length === 1 ? existing.id : newId(),
        formTypeId: formType!.id,
        instructorId: currentUser!.id,
        header,
        trainees: [fixed],
        // Wortlaut einfrieren — spätere Katalogpflege darf dieses Dokument
        // nicht mehr verändern.
        competencies: competencies.map((c) => ({ code: c.code, title: c.title })),
        sessionStatus,
        freeText,
        attendance: undefined,
        signatureInstructor: sigInstructor,
        signatureTrainee: sigT,
        extraRecipients,
        status: signed ? 'signed' : 'awaiting_signature',
        // Eskalationsfälle gehen zusätzlich an die Eskalationsempfänger, der
        // Versand gilt aber ebenso als gelungen — sonst bliebe genau der
        // wichtigste Vorgang dauerhaft gelb.
        mailStatus: signed ? 'sent' : 'pending',
        parentId: parentId ?? existing?.parentId,
        batchId,
        createdAt: existing?.createdAt ?? ts,
        signedAt: signed ? ts : undefined,
      }
    })
  }

  const [submitting, setSubmitting] = useState(false)

  const saveAll = (): GradingRecord[] => {
    const recs = buildRecords()
    recs.forEach(saveGradingRecord)
    clearDraft()
    return recs
  }

  /**
   * Plausibilität: unbestimmte Angaben werden nicht blockiert, aber einmal
   * hinterfragt — ein Tippfehler im Datum oder eine vergessene Flugzeit soll
   * nicht unbemerkt in die Ablage wandern.
   */
  const confirmImplausible = (): boolean => {
    const today = new Date(Date.now() + state.timeOffsetMs).toISOString().slice(0, 10)
    const future = headerFields.some((f) => f.type === 'date' && header[f.key] && header[f.key] > today)
    if (future && !window.confirm(t('grading.warnFutureDate'))) return false
    const zeroTime = headerFields.some((f) => f.type === 'duration' && f.required && header[f.key] === '00:00')
    if (zeroTime && !window.confirm(t('grading.warnNoFlightTime'))) return false
    return true
  }

  const submit = () => {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    if (!confirmImplausible()) return
    setError('')
    if (needsFollowUp && !parentId) {
      // Pflichtformulare sind vorausgewählt und nicht abwählbar
      setFollowUps(requiredFollowUps)
      setShowFollowUp(true)
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const recs = saveAll()
    // Teil einer Folgeformular-Kette: nächstes Glied öffnen — mit SEINEM
    // Ausgangsformular, nicht mit dem des gerade abgeschlossenen.
    if (parentId && next.length > 0) {
      navigate(`/grading/new?type=${next[0].type}&parent=${next[0].parentId}&next=${encodeChain(next.slice(1))}`)
      return
    }
    // Komplett unterschrieben UND erfolgreich versendet → zurück zum Grading
    // Dashboard (bei einer 306/310-Kette erst hier, nach dem letzten Glied).
    // Blieb etwas offen (Unterschrift, Versand), zeigt die Detailansicht warum.
    const allOk = recs.every((r) => r.status === 'signed' && r.mailStatus === 'sent')
    navigate(allOk || recs.length > 1 ? '/grading' : `/grading/${recs[0].id}`)
  }

  /** Speichern und die (Pflicht-)Folgeformulare als Kette öffnen */
  const finish = () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const recs = saveAll()
    setShowFollowUp(false)
    // Je nicht bestandenem Piloten ein eigenes 306 — es dokumentiert dessen
    // Defizite und trägt dessen Unterschrift. Das 310 betrifft dagegen den
    // ganzen Durchgang und wird einmal am ersten Formular angehängt.
    const chain: FollowUpStep[] = []
    if (followUps.includes('306')) {
      recs
        .filter((r) => r.trainees.some((tr) => tr.overall === 'not_competent'))
        .forEach((r) => chain.push({ type: '306', parentId: r.id }))
    }
    followUps.filter((id) => id !== '306').forEach((id) => chain.push({ type: id, parentId: recs[0].id }))
    if (chain.length > 0) {
      navigate(`/grading/new?type=${chain[0].type}&parent=${chain[0].parentId}&next=${encodeChain(chain.slice(1))}`)
    } else {
      const allOk = recs.every((r) => r.status === 'signed' && r.mailStatus === 'sent')
      navigate(allOk || recs.length > 1 ? '/grading' : `/grading/${recs[0].id}`)
    }
  }

  /**
   * Kopfdatenfeld setzen. Bei Entweder-oder-Paaren (z. B. Recurrent-Zyklus
   * ODER ATA-Kapitel auf 308F) wird die Gegenseite geleert, sobald hier
   * etwas ausgewählt ist.
   */
  const setField = (f: FormField, value: string) =>
    setHeader((h) => {
      const next = { ...h, [f.key]: value }
      if (f.exclusiveWith && value.trim()) next[f.exclusiveWith] = ''
      return next
    })

  /**
   * Auswahlwerte eines Feldes. Die Musterliste kommt zentral aus den
   * Einstellungen — damit stehen in ALLEN Formularen dieselben Aircraft
   * Types und der Admin pflegt sie an einer Stelle.
   */
  const optionsOf = (f: FormField): string[] =>
    f.key === 'aircraftType' ? state.settings.aircraftTypes : (f.options ?? [])

  /** Kopf- und Session-Datenfelder — in Schritt 1 (pre) und Schritt 2 (post) genutzt */
  const renderField = (f: FormField) => (
    <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
      <Field label={f.label + (f.required ? ' *' : '')}>
        {f.type === 'select' ? (
          <select
            id={`field-${f.key}`}
            value={header[f.key] ?? ''}
            onChange={(e) => setField(f, e.target.value)}
            className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-[14px]"
          >
            <option value="">…</option>
            {[...optionsOf(f)].sort((a, b) => a.localeCompare(b)).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : f.type === 'duration' ? (
          // Zeiten immer im Format hh:mm, wählbar in 30-Minuten-Schritten
          <select
            id={`field-${f.key}`}
            value={header[f.key] ?? ''}
            onChange={(e) => setField(f, e.target.value)}
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
            id={`field-${f.key}`}
            value={header[f.key] ?? ''}
            onChange={(e) => setField(f, e.target.value)}
            className={`${inputCls} min-h-20`}
          />
        ) : f.type === 'radiogroup' ? (
          // Einfachauswahl als Ankreuzfelder wie im Original
          <div className="flex flex-wrap gap-1.5">
            {optionsOf(f).map((o) => {
              const on = header[f.key] === o
              return (
                <button
                  key={o}
                  onClick={() => setField(f, on ? '' : o)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-[13px] transition ${
                    on ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                  }`}
                >
                  {on ? '☒' : '☐'} {o}
                </button>
              )
            })}
          </div>
        ) : f.type === 'checkgroup' ? (
          // Ankreuzfeld-Gruppe in der Reihenfolge des Original-Formulars
          // (z. B. IOS / RH Seat / LH Seat auf 308G, ATA Chapters auf 308F)
          <div className="flex flex-wrap gap-1.5">
            {optionsOf(f).map((o) => {
              const sel = (header[f.key] ?? '').split(', ').filter(Boolean)
              const on = sel.includes(o)
              return (
                <button
                  key={o}
                  onClick={() => setField(f, (on ? sel.filter((x) => x !== o) : [...sel, o]).sort().join(', '))}
                  className={`min-h-11 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition ${
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
            id={`field-${f.key}`}
            type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
            value={header[f.key] ?? ''}
            onChange={(e) => setField(f, e.target.value)}
            className={inputCls}
          />
        )}
        {/* Fußnoten des Originalformulars, etwa zu den PRG-Sternchen */}
        {f.hint && <p className="mt-1.5 text-[11.5px] leading-relaxed text-dim">{f.hint}</p>}
      </Field>
    </div>
  )

  if (!mayGrade) {
    return (
      <>
        <TopBar title={t('grading.newForm')} back="/grading" home={false} wide />
        <Page>
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] leading-relaxed text-dim">{t('grading.noPermission')}</p>
        </Page>
      </>
    )
  }

  return (
    <>
      <TopBar
        title={parent ? `${formTypeId} · ${t('grading.followUpFor')} ${parent.formTypeId}` : t('grading.newForm')}
        back="/grading"
        onBack={leaveGuard}
        home={false}
        wide
      />
      <Page wide className="space-y-4 pb-32">
        {/* Wiederhergestellter Entwurf: sichtbar machen und verwerfbar halten */}
        {draftRestored && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3.5 text-[13px]">
            <p className="min-w-0 flex-1 leading-relaxed">{t('grading.draftRestored')}</p>
            <Button
              variant="ghost"
              onClick={() => {
                clearDraft()
                setDraftRestored(false)
                navigate('/grading')
              }}
            >
              {t('grading.draftDiscard')}
            </Button>
          </div>
        )}

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
                // Auf dem 308G wird ein Instruktor beurteilt — CDR/FO ist dort
                // keine gültige Angabe und darf auch nicht gedruckt werden.
                const pos = ft?.competencySet === 'instructor' ? '' : 'CDR'
                setTrainees(cs.length > 0 ? [emptyTrainee(cs.map((c) => c.code), pos)] : [])
                // Liste wird neu aufgebaut — alte Unterschriften dürfen nicht stehen bleiben
                setSigTrainees({})
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
                        {isInstructorSheet ? 'Candidate Instructor' : t('grading.student')} {trainees.length > 1 ? i + 1 : ''}
                      </p>
                      {trainees.length > 1 && (
                        <button onClick={() => removeTrainee(i)} className="text-dim hover:text-danger">
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
                    {/* 308G kennt keine CDR/FO- und Sitzchips — dort stehen
                        Qualifikation und Position im Kopf des Formulars */}
                    <div className={`flex flex-wrap items-center gap-1.5 ${isInstructorSheet ? 'hidden' : ''}`}>
                      {['CDR', 'FO'].map((o) => (
                        <button
                          key={o}
                          onClick={() => setTrainee(i, { position: o })}
                          className={`min-h-11 rounded-lg border px-3 py-1.5 text-[13px] transition ${
                            tr.position === o ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                          }`}
                        >
                          {tr.position === o ? '☒' : '☐'} {o}
                        </button>
                      ))}
                      <span className="mx-1 h-6 w-px shrink-0 bg-line/15" />
                      {['Left', 'Right'].map((o) => (
                        <button
                          key={o}
                          onClick={() => setTrainee(i, { seat: tr.seat === o ? '' : o })}
                          className={`min-h-11 rounded-lg border px-3 py-1.5 text-[13px] transition ${
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
                  onClick={() => setTrainees([...trainees, emptyTrainee(codes, isInstructorSheet ? '' : 'CDR')])}
                  className="flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline"
                >
                  <Plus size={15} /> {t('grading.addTrainee')}
                </button>
                {trainees.length > 1 && (
                  <p className="rounded-xl bg-bg/40 p-3 text-[12px] leading-relaxed text-dim">{t('grading.multiStudentHint')}</p>
                )}

                <div className="rounded-xl border border-line/10 p-3">
                  <p className="mb-2 text-[13px] font-semibold text-accent">
                    {isInstructorSheet ? 'Course Instructor' : t('grading.instructor')}
                  </p>
                  <p className="mb-2 rounded-lg bg-bg/40 px-3 py-2 text-[14px]">{currentUser!.name}</p>
                  <div className={`flex flex-wrap items-center gap-1.5 ${isInstructorSheet ? 'hidden' : ''}`}>
                    {['TKI', 'SFI', 'TRI'].map((o) => (
                      <button
                        key={o}
                        onClick={() => setHeader({ ...header, instructorQual: header.instructorQual === o ? '' : o })}
                        className={`min-h-11 rounded-lg border px-3 py-1.5 text-[13px] transition ${
                          header.instructorQual === o ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line/15 text-dim'
                        }`}
                      >
                        {header.instructorQual === o ? '☒' : '☐'} {o}
                      </button>
                    ))}
                    <span className="mx-1 h-6 w-px shrink-0 bg-line/15" />
                    {['Left', 'Right', 'Rear'].map((o) => (
                      <button
                        key={o}
                        onClick={() => setHeader({ ...header, instructorSeat: header.instructorSeat === o ? '' : o })}
                        className={`min-h-11 rounded-lg border px-3 py-1.5 text-[13px] transition ${
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
                  // Zum beanstandeten Feld springen — die Meldung stand sonst
                  // hunderte Pixel von der Ursache entfernt.
                  const target = errorKeyRef.current
                    ? document.getElementById(`field-${errorKeyRef.current}`)
                    : document.querySelector<HTMLElement>('input[placeholder]')
                  target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                  target?.focus({ preventScroll: true })
                  return
                }
                setError('')
                setStep(2)
                window.scrollTo(0, 0)
              }}
            >
              {competencies.length > 0 ? t('grading.toGrading') : t('grading.continue')} <ArrowRight size={16} />
            </Button>
            {error && (
              <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">
                {error}
              </p>
            )}
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


                  <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                    {competencies.map((c) => {
                      const g = tr.grades.find((x) => x.code === c.code)
                      const key = `${i}-${c.code}`
                      const commentRequired = g?.grade === 1 || g?.grade === 2
                      return (
                        <div key={c.code} className="rounded-xl border border-line/10 p-3">
                          <div className="mb-2 flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold">
                                {hideCodes ? c.title : <>{c.code} <span className="font-normal text-dim">· {c.title}</span></>}
                              </p>
                            </div>
                            <button
                              onClick={() => setOpenBehaviour(openBehaviour === key ? null : key)}
                              title={t('grading.behaviours')}
                              className="min-h-11 flex shrink-0 items-center gap-1 rounded-lg border border-line/15 px-2 py-1 text-[11.5px] text-dim hover:text-accent"
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
                                className={`min-h-11 min-w-[52px] rounded-lg px-3 py-2.5 text-[14px] font-semibold transition ${
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

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={t('grading.positive') + ' *'}>
                      <textarea value={tr.positiveComment} onChange={(e) => setTrainee(i, { positiveComment: e.target.value })} className={`${inputCls} min-h-24`} />
                    </Field>
                    <Field label={t('grading.development') + ' *'}>
                      <textarea value={tr.developmentComment} onChange={(e) => setTrainee(i, { developmentComment: e.target.value })} className={`${inputCls} min-h-24`} />
                    </Field>
                    <Field label={t('grading.summary') + ' *'}>
                      <textarea value={tr.summaryComment} onChange={(e) => setTrainee(i, { summaryComment: e.target.value })} className={`${inputCls} min-h-24`} />
                    </Field>
                  </div>

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
                                ? 'border-emerald-700 bg-emerald-700 text-white'
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
                          className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-[13.5px] transition ${
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
                <p className="text-[12px] leading-relaxed text-dim">{t('grading.sessionDataHint')}</p>
                <div className="grid gap-3 sm:grid-cols-2">{postFields.map(renderField)}</div>
              </Card>
            )}

            {/* 4c. Teilnehmerliste (307A/307B) */}
            {isAttendance && (
              <Card className="space-y-3 p-4">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.attendance')}</p>
                {attendance.map((a, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-line/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-[12.5px] text-dim">{i + 1}.</span>
                      <input
                        value={a.name}
                        onChange={(e) => setAttendance(attendance.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                        placeholder={t('grading.studentName')}
                        className={inputCls}
                      />
                      {attendance.length > 1 && (
                        <button
                          onClick={() => setAttendance(attendance.filter((_, j) => j !== i))}
                          aria-label={t('common.delete')}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dim hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    {/* 307A: die Teilnehmer sind vor Ort und unterschreiben selbst.
                        307B (CBT/WBT/VCR) findet ohne Anwesenheit statt — dort
                        bürgt allein die Unterschrift des Instruktors. */}
                    {formTypeId === '307A' && a.name.trim() && (
                      <SignaturePad
                        value={a.signature}
                        onChange={(sig) => setAttendance(attendance.map((x, j) => (j === i ? { ...x, signature: sig } : x)))}
                        label={t('grading.attendanceSignature')}
                      />
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setAttendance([...attendance, { name: '', signature: null }])}
                  className="flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline"
                >
                  <Plus size={15} /> {t('grading.addAttendee')}
                </button>
                {formTypeId === '307B' && <p className="text-[11.5px] leading-relaxed text-dim">{t('grading.attendance307B')}</p>}
              </Card>
            )}

            {/* 5. Unterschriften — immer live zu leisten, nie gespeichert/übernommen.
                Bei mehreren Studenten unterschreibt JEDER einzeln; pro Student
                entsteht beim Abschluss ein eigenes Formular. */}
            <Card className="space-y-4 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-dim">{t('grading.signatures')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              {trainees.length > 1 && (
                <p className="text-[11.5px] leading-relaxed text-dim">{t('grading.multiStudentHint')}</p>
              )}
              <p className="text-[11.5px] leading-relaxed text-dim">{t('grading.lockNote')}</p>
              <p className="text-[11.5px] leading-relaxed text-dim">{t('grading.sigLiveNote')}</p>
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
              <p className="text-[11.5px] leading-relaxed text-dim">{t('grading.extraRecipientsHint')}</p>
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
                    disabled={!!liveError || submitting}
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
          {/* Bei mehreren Piloten im Durchgang entsteht je Pilot ein 306 */}
          {notCompetentCount > 1 && followUps.includes('306') && (
            <p className="mt-3 rounded-xl border border-warm/25 bg-warm/5 p-3 text-[12.5px] leading-relaxed">
              {t('grading.followUp306PerPilot', { count: notCompetentCount })}
            </p>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-dim">{t('grading.followUpMailNote')}</p>
          <div className="mt-5 flex justify-end">
            <Button onClick={finish} disabled={followUps.length === 0 || submitting}>
              {t('grading.openFollowUp')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
