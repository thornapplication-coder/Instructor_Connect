import { ArrowLeft, ArrowRight, ChevronDown, Info, Plus, Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SignaturePad } from '../components/SignaturePad'
import { Button, Card, CardHeading, Field, inputCls, Modal, Page, selectCls, TopBar } from '../components/ui'
import { contentFingerprint, HASH_VERSION } from '../docHash'
import { networkReachable } from '../net'
import { autoNotCompetent, isFollowUpType, isNotCompetent } from '../gradingRules'
import { navigate, scrollToTop } from '../router'

/**
 * Ohne Netz ist der Versand nicht gescheitert, sondern noch nicht erfolgt:
 * 'queued' hält den Vorgang offen, ohne den Instruktor zum Handeln zu
 * zwingen — die App sendet selbst, sobald wieder Empfang da ist.
 *
 * Jedes unterschriebene Blatt beginnt deshalb im Ausgangskorb. Ob daraus
 * „versendet" wird, entscheidet erst die echte Erreichbarkeitsprobe in
 * saveAll. Vorher stand hier `navigator.onLine`, und das meldet „online"
 * auch im WLAN ohne Internet oder hinter einer Anmeldeseite — also genau
 * dort, wo der Ausgangskorb gebraucht wird: Ein Blatt galt als versendet,
 * ohne dass je eine Netzanfrage stattgefunden hätte.
 */
const mailStatusNow = () => 'queued' as const
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
  // Formulare sind immer vollständig englisch. Das steht nicht mehr hier,
  // sondern im Namensraum `forms`, den es nur auf Englisch gibt — ein
  // vergessenes getFixedT kann die Sprache damit nicht mehr kippen.
  const { t } = useTranslation()
  const { state, currentUser, saveGradingRecord, can, gradingRecordById } = useStore()
  const grading = state.settings.grading

  // Beide IDs stammen aus der Adresszeile — deshalb über die
  // berechtigungsprüfende Auflösung, nicht roh aus dem Zustand. Ein
  // parentId gehört ausschließlich an Folgeformulare (306/310); an jedem
  // anderen Typ wird es verworfen, sonst umgeht die Adresszeile den
  // Pflicht-Dialog beim Abschluss (der Store verwirft es zusätzlich).
  const existing = recordId ? gradingRecordById(recordId) : undefined
  if (!isFollowUpType(existing?.formTypeId ?? presetType ?? '')) parentId = undefined
  const parent = parentId ? gradingRecordById(parentId) : undefined

  const [formTypeId, setFormTypeId] = useState<FormTypeId | null>(existing?.formTypeId ?? presetType ?? null)
  const formType = grading.formTypes.find((f) => f.id === formTypeId) ?? null
  // Kopfdaten der ATO fuer den einzufrierenden Dokumentenstand (siehe unten).
  const dokKopf = state.settings.documentHeader ?? { atoName: '', approvalNumber: '', approvalNumberUK: '', formRevision: '' }
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
  // Zuständige Behörde: bestimmt die ATO-Kennung im Dokumentkopf
  // (AT.ATO.106 bzw. GBR.ATO.0541). Standard ist AT.
  const [authority, setAuthority] = useState<'AT' | 'UK'>(existing?.authority ?? 'AT')
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
  // Der Schluessel traegt den Nutzer: Auf einem im Schulungsbetrieb
  // geteilten iPad bekam sonst der naechste Instruktor den Entwurf des
  // vorigen angeboten — mit Pilotenname, Noten und Kommentaren. Fremde
  // Bewertungsdaten landeten so im eigenen Blatt.
  const draftKey = `aaa-draft-${currentUser!.id}-${recordId ?? parentId ?? 'new'}-${formTypeId ?? ''}`
  const dirty =
    !existing &&
    (Object.values(header).some((v) => v?.trim()) ||
      trainees.some((tr) => tr.traineeName?.trim() || tr.grades.some((g) => g.grade !== null)) ||
      Object.values(freeText).some((v) => v?.trim()) ||
      attendance.some((a) => a.name.trim()))

  /*
   * Entwurf anbieten — je Formulartyp, nicht nur einmal.
   *
   * `draftLoaded` war ein einfaches Ja/Nein: Wer beim Wiederkommen zuerst
   * den falschen Typ waehlte und dann auf den richtigen zurueckging, hatte
   * die einzige Gelegenheit verbraucht — der Entwurf lag danach unerreichbar
   * im Speicher. Gemerkt wird jetzt, FUER WELCHEN Schluessel bereits
   * geladen wurde; jeder Typwechsel schaut erneut nach.
   */
  const draftLoaded = useRef('')
  useEffect(() => {
    if (draftLoaded.current === draftKey || existing || !formTypeId) return
    draftLoaded.current = draftKey
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
      if (d.authority === 'AT' || d.authority === 'UK') setAuthority(d.authority)
      setDraftRestored(true)
    } catch {
      /* unlesbarer Entwurf wird ignoriert */
    }
  }, [draftKey, existing, formTypeId])

  useEffect(() => {
    if (!dirty || submittingRef.current) return
    const tm = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ header, trainees, freeText, attendance, sessionStatus, step, authority }))
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
    return window.confirm(t('forms:leaveConfirm'))
  }, [dirty, t])

  // Browser-Zurück abfangen: der Hash-Router wechselt sonst kommentarlos die
  // Seite. Ein zusätzlicher History-Eintrag macht die Geste abfangbar.
  useEffect(() => {
    if (!dirty) return
    const route = window.location.hash
    history.pushState(null, '', route)
    const onPop = () => {
      if (submittingRef.current) return
      if (window.confirm(t('forms:leaveConfirm'))) {
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
    trainees.some(isNotCompetent) || sessionStatus === 'not_completed'

  /** Anzahl der Piloten, für die je ein eigenes 306 fällig wird */
  const notCompetentCount = trainees.filter(isNotCompetent).length

  /** Pflicht-Folgeformulare: Not Competent ⇒ 306, Session nicht abgeschlossen ⇒ 310 */
  const requiredFollowUps: FormTypeId[] = [
    ...(trainees.some(isNotCompetent) ? (['306'] as FormTypeId[]) : []),
    ...(sessionStatus === 'not_completed' ? (['310'] as FormTypeId[]) : []),
  ]

  /** Schlüssel des zuerst beanstandeten Feldes — der Fokus springt dorthin,
   *  statt die Meldung weit entfernt von der Ursache stehen zu lassen. */
  const errorKeyRef = useRef<string | null>(null)

  /** Schritt 1: Kopfdaten inkl. Student/Instructor */
  const validateHeader = (): string => {
    errorKeyRef.current = null
    if (!formType) return t('forms:errFormType')
    for (const f of preFields) {
      if (f.required && !header[f.key]?.trim()) {
        errorKeyRef.current = f.key
        return t('forms:errRequired', { field: f.label })
      }
    }
    // Entweder-oder-Paare: eines von beiden ist Pflicht
    for (const f of headerFields) {
      const partner = f.exclusiveWith ? headerFields.find((x) => x.key === f.exclusiveWith) : undefined
      if (!partner) continue
      if (!header[f.key]?.trim() && !header[partner.key]?.trim()) {
        errorKeyRef.current = f.key
        return t('forms:errEitherOr', { a: f.label, b: partner.label })
      }
    }
    if (competencies.length > 0) {
      if (trainees.length === 0 || trainees.some((tr) => !tr.traineeName?.trim())) return t('forms:errNoTrainee')
    }
    return ''
  }

  /** Schritt 2: Bewertung, Session-Daten und Unterschrift */
  const validate = (): string => {
    const headErr = validateHeader()
    if (headErr) return headErr
    if (competencies.length > 0) {
      for (const tr of trainees) {
        const name = tr.traineeName?.trim() || t('forms:trainee')
        if (tr.grades.some((g) => g.grade === null)) return t('forms:errGrades')
        // „NO" heißt not observed. Ein Blatt ohne eine einzige echte Note
        // belegt keine Kompetenz und darf nicht abgeschlossen werden.
        if (!tr.grades.some((g) => typeof g.grade === 'number')) return t('forms:errAllNotObserved', { name })
        if (tr.grades.some((g) => (g.grade === 1 || g.grade === 2) && !g.comment.trim()))
          return t('forms:errGradeComment', { name })
        if (!tr.positiveComment.trim() || !tr.developmentComment.trim() || !tr.summaryComment.trim())
          return t('forms:errComments', { name })
        if (!tr.overall) return t('forms:errOverall')
      }
      if (!sessionStatus) return t('forms:errSession')
    }
    for (const f of postFields) {
      if (f.required && !header[f.key]?.trim()) return t('forms:errRequired', { field: f.label })
    }
    /*
     * 306 und 310 belegen die Nachschulung bzw. den offenen Punkt — ihr
     * Inhalt steht ausschliesslich in den Freitextabschnitten. Die waren an
     * keiner Stelle Pflicht: Ein 306 mit drei leeren Abschnitten, beidseitig
     * unterschrieben, galt in `missingFollowUps` als Nachweis und machte das
     * Ausgangsblatt gruen. Auf dem Grading Sheet erzwingt die App zu jeder 1
     * und 2 einen Kommentar; auf dem Blatt, das die Nachschulung belegen
     * soll, erzwang sie nichts.
     */
    if (isFollowUpType(formTypeId ?? '')) {
      const leer = (formType?.freeTextSections ?? []).find((sec) => !freeText[sec]?.trim())
      if (leer) return t('forms:errRequired', { field: leer })
    }
    // Eine Anwesenheitsliste ohne Anwesende belegt nichts — sie war bisher
    // absendbar und wurde grün.
    if (isAttendance && !attendance.some((a) => a.name.trim())) return t('forms:errNoAttendee')
    // 307A ist eine Anwesenheitsliste: wer daraufsteht, war da und unterschreibt.
    if (formTypeId === '307A') {
      const open = attendance.find((a) => a.name.trim() && !a.signature)
      if (open) return t('forms:errAttendanceSignature', { name: open.name.trim() })
    }
    if (!sigInstructor) return t('forms:errSignature')
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
          // die Seed-Daten vorführbar. Ohne Netz — im Simulator der Normalfall
          // — wandert das Formular stattdessen in den Ausgangskorb.
          mailStatus: signed ? mailStatusNow() : 'pending',
          parentId: parentId ?? existing?.parentId,
          createdAt: existing?.createdAt ?? ts,
          signedAt: signed ? ts : undefined,
          instructorSignedAt: sigInstructor ? ts : undefined,
          authority,
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
        mailStatus: signed ? mailStatusNow() : 'pending',
        parentId: parentId ?? existing?.parentId,
        batchId,
        createdAt: existing?.createdAt ?? ts,
        signedAt: signed ? ts : undefined,
        instructorSignedAt: sigInstructor ? ts : undefined,
        authority,
        // Dokumentenstand einfrieren: ATO, Zulassungsnummer, Formularstand
        // und Formulartitel gehoerten bisher zur Anzeige und wurden zur
        // DRUCKZEIT aus den Einstellungen gelesen — ein altes Dokument
        // druckte danach eine andere Zulassungsnummer als zum
        // Unterschriftszeitpunkt. Ab Fassung 3 sind sie Teil des
        // Fingerabdrucks.
        docSnapshot: {
          atoName: dokKopf.atoName,
          approval: (authority === 'UK' ? dokKopf.approvalNumberUK : dokKopf.approvalNumber) || dokKopf.approvalNumber,
          formRevision: dokKopf.formRevision,
          formTitle: formType?.title ?? '',
        },
      }
    })
  }

  /** Nach einem Schrittwechsel den Fokus auf die Ueberschrift setzen — der
   *  ausloesende Knopf verschwindet, und der Fokus fiele sonst auf <body>. */
  const fokusUeberschrift = () =>
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-page-heading]')?.focus())

  const [submitting, setSubmitting] = useState(false)

  const saveAll = async (): Promise<GradingRecord[]> => {
    // Der Fingerabdruck entsteht im Moment des Unterschreibens — VOR dem
    // Speichern, damit der abgelegte Datensatz ihn von Anfang an trägt.
    const gebaut = await Promise.all(
      buildRecords().map(async (r) =>
        r.status === 'signed' ? { ...r, contentHash: await contentFingerprint(r), hashVersion: HASH_VERSION } : r,
      ),
    )
    // Eine Probe für den ganzen Durchgang: Ist der Origin wirklich
    // erreichbar, gilt der Versand — sonst bleibt alles im Ausgangskorb und
    // geht raus, sobald wieder Empfang da ist.
    const erreichbar = gebaut.some((r) => r.mailStatus === 'queued') ? await networkReachable() : false
    const recs = erreichbar ? gebaut.map((r) => (r.mailStatus === 'queued' ? { ...r, mailStatus: 'sent' as const } : r)) : gebaut
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
    if (future && !window.confirm(t('forms:warnFutureDate'))) return false
    const zeroTime = headerFields.some((f) => f.type === 'duration' && f.required && header[f.key] === '00:00')
    if (zeroTime && !window.confirm(t('forms:warnNoFlightTime'))) return false
    return true
  }

  const submit = async () => {
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
    const recs = await saveAll()
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
    // replace: die Formularadresse verschwindet aus dem Verlauf
    navigate(allOk || recs.length > 1 ? '/grading' : `/grading/${recs[0].id}`, true)
  }

  /** Speichern und die (Pflicht-)Folgeformulare als Kette öffnen */
  const finish = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const recs = await saveAll()
    setShowFollowUp(false)
    // Je Pilot ein eigenes Folgeformular — beide tragen seinen Namen und
    // seine Unterschrift. Das 310 hing frueher einmalig am ersten Blatt des
    // Durchgangs; seit es ein Pflichtfeld „Pilot / Student Name" fuehrt
    // (#24), kann es fuer die uebrigen Piloten nichts belegen, haekelte deren
    // offene Punkte aber trotzdem ab. Jetzt entsteht es je Blatt.
    const chain: FollowUpStep[] = []
    if (followUps.includes('306')) {
      recs.filter((r) => r.trainees.some(isNotCompetent)).forEach((r) => chain.push({ type: '306', parentId: r.id }))
    }
    followUps
      .filter((id) => id !== '306')
      .forEach((id) => recs.forEach((r) => chain.push({ type: id, parentId: r.id })))
    if (chain.length > 0) {
      navigate(`/grading/new?type=${chain[0].type}&parent=${chain[0].parentId}&next=${encodeChain(chain.slice(1))}`)
    } else {
      const allOk = recs.every((r) => r.status === 'signed' && r.mailStatus === 'sent')
      navigate(allOk || recs.length > 1 ? '/grading' : `/grading/${recs[0].id}`, true)
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
      {/* Ankreuzgruppen sind mehrere Knöpfe — sie brauchen eine
          Gruppenbeschriftung, kein <label> (siehe Field). */}
      <Field label={f.label + (f.required ? ' *' : '')} group={f.type === 'radiogroup' || f.type === 'checkgroup'}>
        {f.type === 'select' ? (
          <select
            id={`field-${f.key}`}
            value={header[f.key] ?? ''}
            onChange={(e) => setField(f, e.target.value)}
            // Beanstandung hängt AM Feld, nicht nur als Text weit darunter —
            // eine Sprachausgabe liest sie dann beim Fokussieren mit vor.
            aria-invalid={!!error && errorKeyRef.current === f.key}
            aria-describedby={!!error && errorKeyRef.current === f.key ? 'form-error' : undefined}
            className={selectCls}
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
            className={selectCls}
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
                  aria-pressed={on}
                  onClick={() => setField(f, on ? '' : o)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-[13px] transition ${
                    on ? 'border-accent bg-accent/15 font-medium text-ink' : 'border-line/15 text-dim'
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
                  aria-pressed={on}
                  onClick={() => {
                    // Reihenfolge des Originalformulars beibehalten — eine
                    // alphabetische Sortierung verdrehte z. B. die ATA-Kapitel.
                    const next = on ? sel.filter((x) => x !== o) : [...sel, o]
                    const ordered = optionsOf(f).filter((x) => next.includes(x))
                    setField(f, ordered.join(', '))
                  }}
                  className={`min-h-11 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition ${
                    on ? 'border-accent bg-accent/15 font-medium text-ink' : 'border-line/15 text-dim'
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
            aria-invalid={!!error && errorKeyRef.current === f.key}
            aria-describedby={!!error && errorKeyRef.current === f.key ? 'form-error' : undefined}
            type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
            value={header[f.key] ?? ''}
            onChange={(e) => setField(f, e.target.value)}
            className={inputCls}
          />
        )}
        {/* Fußnoten des Originalformulars, etwa zu den PRG-Sternchen */}
        {f.hint && <p className="mt-1.5 text-[12px] leading-relaxed text-dim">{f.hint}</p>}
      </Field>
    </div>
  )

  if (!mayGrade) {
    return (
      <>
        <TopBar title={t('forms:newForm')} back="/grading" home={false} wide />
        <Page>
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-[13px] leading-relaxed text-dim">{t('forms:noPermission')}</p>
        </Page>
      </>
    )
  }

  return (
    <>
      <TopBar
        title={parent ? `${formTypeId} · ${t('forms:followUpFor')} ${parent.formTypeId}` : t('forms:newForm')}
        back="/grading"
        onBack={leaveGuard}
        home={false}
        wide
      />
      <Page wide className="space-y-4 pb-32">
        {/* Wiederhergestellter Entwurf: sichtbar machen und verwerfbar halten */}
        {draftRestored && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3.5 text-[13px]">
            <p className="min-w-0 flex-1 leading-relaxed">{t('forms:draftRestored')}</p>
            <Button
              variant="ghost"
              onClick={() => {
                clearDraft()
                setDraftRestored(false)
                navigate('/grading')
              }}
            >
              {t('forms:draftDiscard')}
            </Button>
          </div>
        )}

        {/* 1. Formulartyp */}
        <Card className="p-4">
          <Field label={t('forms:formType')}>
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
              className="w-full rounded-xl border border-field bg-bg/60 px-3 py-2.5 text-[14px] disabled:opacity-60"
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
                <CardHeading>{t('forms:participants')}</CardHeading>

                {trainees.map((tr, i) => (
                  <div key={i} className="rounded-xl border border-line/10 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <p className="flex-1 text-[13px] font-semibold text-accent">
                        {isInstructorSheet ? 'Candidate Instructor' : t('forms:student')} {trainees.length > 1 ? i + 1 : ''}
                      </p>
                      {/* Beschriftet und 44 px: Der Knopf loescht einen kompletten
                          Piloten samt Bewertung und wurde als „Schaltflaeche"
                          ohne Inhalt angesagt. */}
                      {trainees.length > 1 && (
                        <button
                          onClick={() => removeTrainee(i)}
                          aria-label={`${isInstructorSheet ? 'Candidate Instructor' : t('forms:student')} ${i + 1} — ${t('common.delete')}`}
                          title={t('common.delete')}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-dim transition hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    {/* Studentenname wird immer frei eingetippt — kein Dropdown */}
                    <input
                      value={tr.traineeName ?? ''}
                      onChange={(e) => setTrainee(i, { traineeName: e.target.value })}
                      placeholder={t('forms:studentName')}
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
                            tr.position === o ? 'border-accent bg-accent/15 font-medium text-ink' : 'border-line/15 text-dim'
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
                            tr.seat === o ? 'border-accent bg-accent/15 font-medium text-ink' : 'border-line/15 text-dim'
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
                  <Plus size={15} /> {t('forms:addTrainee')}
                </button>
                {trainees.length > 1 && (
                  <p className="rounded-xl bg-bg/40 p-3 text-[12px] leading-relaxed text-dim">{t('forms:multiStudentHint')}</p>
                )}

                <div className="rounded-xl border border-line/10 p-3">
                  <p className="mb-2 text-[13px] font-semibold text-accent">
                    {isInstructorSheet ? 'Course Instructor' : t('forms:instructor')}
                  </p>
                  <p className="mb-2 rounded-lg bg-bg/40 px-3 py-2 text-[14px]">{currentUser!.name}</p>
                  <div className={`flex flex-wrap items-center gap-1.5 ${isInstructorSheet ? 'hidden' : ''}`}>
                    {['TKI', 'SFI', 'TRI'].map((o) => (
                      <button
                        key={o}
                        onClick={() => setHeader({ ...header, instructorQual: header.instructorQual === o ? '' : o })}
                        className={`min-h-11 rounded-lg border px-3 py-1.5 text-[13px] transition ${
                          header.instructorQual === o ? 'border-accent bg-accent/15 font-medium text-ink' : 'border-line/15 text-dim'
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
                          header.instructorSeat === o ? 'border-accent bg-accent/15 font-medium text-ink' : 'border-line/15 text-dim'
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
              <CardHeading>{t('forms:headerData')}</CardHeading>
              <div className="grid gap-3 sm:grid-cols-2">{preFields.map(renderField)}</div>
              {/* Kein Katalogfeld: die Behörde gehört zu JEDEM Formulartyp
                  und bestimmt die ATO-Kennung im Dokumentkopf. */}
              <Field label={t('forms:authority')}>
                <select value={authority} onChange={(e) => setAuthority(e.target.value as 'AT' | 'UK')} className={selectCls}>
                  <option value="AT">{t('forms:authorityAT', { nr: state.settings.documentHeader?.approvalNumber || 'AT.ATO.106' })}</option>
                  <option value="UK">{t('forms:authorityUK', { nr: state.settings.documentHeader?.approvalNumberUK || 'GBR.ATO.0541' })}</option>
                </select>
              </Field>
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
                scrollToTop()
                fokusUeberschrift()
              }}
            >
              {competencies.length > 0 ? t('forms:toGrading') : t('forms:continue')} <ArrowRight size={16} />
            </Button>
            {error && (
              <p id="form-error" role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">
                {error}
              </p>
            )}
          </>
        )}

        {formType && step === 2 && (
          <>
            <button onClick={() => { setStep(1); scrollToTop(); fokusUeberschrift() }} className="flex items-center gap-1.5 text-[13.5px] text-dim hover:text-ink">
              <ArrowLeft size={15} /> {t('forms:backToHeader')}
            </button>

            {/* 4. Grading je Pilot */}
            {competencies.length > 0 &&
              trainees.map((tr, i) => {
                const auto = autoNotCompetent(tr)
                return (
                <Card key={i} className="space-y-4 p-4">
                  <div className="flex items-center gap-2">
                    <CardHeading className="flex-1">
                      {tr.traineeName?.trim() || t('forms:traineeN', { n: i + 1 })}
                      {tr.position ? ` · ${tr.position}` : ''}
                      {tr.seat ? ` · ${tr.seat}` : ''}
                    </CardHeading>
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
                              title={t('forms:behaviours')}
                              className="min-h-11 flex shrink-0 items-center gap-1 rounded-lg border border-line/15 px-2 py-1 text-[12px] text-dim hover:text-accent"
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
                          {/* Knopfgruppe mit NAMEN und Zustand: Eine Sprachausgabe
                              las hier je Kompetenz nur „1, 2, 3, 4, 5, NO" —
                              neunmal identisch, ohne Bezug und ohne die Angabe,
                              welche Note gesetzt ist (die steckte allein in
                              Fuellfarbe und Ring). */}
                          <div role="group" aria-label={`${c.code} · ${c.title}`} className="flex flex-wrap gap-1.5">
                            {GRADES.map((val) => (
                              <button
                                key={String(val)}
                                onClick={() => setGrade(i, c.code, val)}
                                aria-pressed={g?.grade === val}
                                aria-label={`${c.code} · ${c.title}: ${val}`}
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
                            placeholder={commentRequired ? t('forms:commentRequired') : t('forms:commentOptional')}
                            // Der Platzhalter wechselt zwischen „erforderlich" und
                            // „optional" — als einziger Name des Feldes hiesse das:
                            // Das Feld heisst je nach Zustand anders.
                            aria-label={`${t('forms:commentOptional')} — ${c.code}`}
                            aria-required={commentRequired}
                            className={`${inputCls} mt-2 text-[13px] ${commentRequired && !g?.comment.trim() ? 'border-danger/60' : ''}`}
                          />
                        </div>
                      )
                    })}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={t('forms:positive') + ' *'}>
                      <textarea value={tr.positiveComment} onChange={(e) => setTrainee(i, { positiveComment: e.target.value })} className={`${inputCls} min-h-24`} />
                    </Field>
                    <Field label={t('forms:development') + ' *'}>
                      <textarea value={tr.developmentComment} onChange={(e) => setTrainee(i, { developmentComment: e.target.value })} className={`${inputCls} min-h-24`} />
                    </Field>
                    <Field label={t('forms:summary') + ' *'}>
                      <textarea value={tr.summaryComment} onChange={(e) => setTrainee(i, { summaryComment: e.target.value })} className={`${inputCls} min-h-24`} />
                    </Field>
                  </div>

                  <Field label={t('forms:overall') + ' *'} group>
                    <div className="flex gap-2">
                      {(['competent', 'not_competent'] as OverallResult[]).map((o) => (
                        <button
                          key={o}
                          aria-pressed={tr.overall === o}
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
                          {t(`forms:${o}`)}
                        </button>
                      ))}
                    </div>
                    {auto && <p role="status" className="mt-2 text-[12.5px] leading-relaxed text-danger">{t('forms:autoNotCompetent')}</p>}
                  </Field>
                </Card>
                )
              })}

            {competencies.length > 0 && (
              <>
                <Card className="p-4">
                  <Field label={t('forms:sessionStatus') + ' *'} group>
                    <div className="flex gap-2">
                      {(['completed', 'not_completed'] as SessionStatus[]).map((sst) => (
                        <button
                          key={sst}
                          aria-pressed={sessionStatus === sst}
                          onClick={() => setSessionStatus(sst)}
                          className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-[13.5px] transition ${
                            sessionStatus === sst ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-line/15 text-dim'
                          }`}
                        >
                          {t(`forms:${sst}`)}
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
                <CardHeading>{t('forms:sessionData')}</CardHeading>
                <p className="text-[12px] leading-relaxed text-dim">{t('forms:sessionDataHint')}</p>
                <div className="grid gap-3 sm:grid-cols-2">{postFields.map(renderField)}</div>
              </Card>
            )}

            {/* 4c. Teilnehmerliste (307A/307B) */}
            {isAttendance && (
              <Card className="space-y-3 p-4">
                <CardHeading>{t('forms:attendance')}</CardHeading>
                {attendance.map((a, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-line/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-[12.5px] text-dim">{i + 1}.</span>
                      <input
                        value={a.name}
                        onChange={(e) => setAttendance(attendance.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                        placeholder={t('forms:studentName')}
                        className={inputCls}
                      />
                      {attendance.length > 1 && (
                        <button
                          onClick={() => setAttendance(attendance.filter((_, j) => j !== i))}
                          aria-label={t('forms:removePilot')}
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
                        label={t('forms:attendanceSignature')}
                      />
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setAttendance([...attendance, { name: '', signature: null }])}
                  className="flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline"
                >
                  <Plus size={15} /> {t('forms:addAttendee')}
                </button>
                {formTypeId === '307B' && <p className="text-[12px] leading-relaxed text-dim">{t('forms:attendance307B')}</p>}
              </Card>
            )}

            {/* 5. Unterschriften — immer live zu leisten, nie gespeichert/übernommen.
                Bei mehreren Studenten unterschreibt JEDER einzeln; pro Student
                entsteht beim Abschluss ein eigenes Formular. */}
            <Card className="space-y-4 p-4">
              <CardHeading>{t('forms:signatures')}</CardHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <SignaturePad value={sigInstructor} onChange={setSigInstructor} label={t('forms:sigInstructor')} />
                {competencies.length > 0 ? (
                  trainees.map((tr, i) => (
                    <SignaturePad
                      key={i}
                      value={sigTrainees[i] ?? null}
                      onChange={(v) => setSigTrainees((s) => ({ ...s, [i]: v }))}
                      label={`${t('forms:sigTrainee')} — ${tr.traineeName?.trim() || t('forms:traineeN', { n: i + 1 })}`}
                    />
                  ))
                ) : (
                  !isAttendance && <SignaturePad value={sigTrainee} onChange={setSigTrainee} label={t('forms:sigTrainee')} />
                )}
              </div>
              {trainees.length > 1 && (
                <p className="text-[12px] leading-relaxed text-dim">{t('forms:multiStudentHint')}</p>
              )}
              <p className="text-[12px] leading-relaxed text-dim">{t('forms:lockNote')}</p>
              <p className="text-[12px] leading-relaxed text-dim">{t('forms:sigLiveNote')}</p>
            </Card>

            {/* Deferred Item: Versand geht immer an den Training Admin */}
            {formTypeId === '310' && (
              <p className="rounded-xl border border-warm/25 bg-warm/5 p-3.5 text-[12.5px] leading-relaxed text-dim">
                {t('forms:deferredMailNote', { recipients: grading.deferredRecipients.join(', ') })}
              </p>
            )}

            {/* 6. Empfänger: Standard (Admin-Konfiguration) + zusätzliche */}
            <Card className="space-y-3 p-4">
              <CardHeading>{t('forms:recipientsCard')}</CardHeading>
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
                      placeholder={t('forms:addRecipient')}
                      className={inputCls}
                    />
                    <Button variant="ghost" onClick={addRecipient} disabled={!/.+@.+\..+/.test(recipientDraft.trim())}>
                      <Plus size={16} />
                    </Button>
                  </div>
                )
              })()}
              <p className="text-[12px] leading-relaxed text-dim">{t('forms:extraRecipientsHint')}</p>
            </Card>

            {/* 7. Senden — erst möglich, wenn alles vollständig ausgefüllt ist */}
            {(() => {
              const liveError = validate()
              return (
                <>
                  {liveError && (
                    <p className="rounded-xl border border-warm/25 bg-warm/5 p-3.5 text-[12.5px] leading-relaxed text-dim">
                      {t('forms:sendBlocked')} {liveError}
                    </p>
                  )}
                  <Button
                    disabled={!!liveError || submitting}
                    className="flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={submit}
                  >
                    <Send size={16} /> {t('forms:finish')}
                  </Button>
                </>
              )
            })()}
          </>
        )}
      </Page>

      {showFollowUp && (
        <Modal title={t('forms:followUpTitle')} onClose={() => setShowFollowUp(false)}>
          <p className="mb-4 text-[13.5px] leading-relaxed text-dim">{t('forms:followUpBodyMandatory')}</p>
          <div className="space-y-2">
            {/* Über den Katalog iterieren, nicht über eine feste Liste: Fehlt
                ein Typ (der Superadmin darf ihn löschen, solange kein
                Datensatz ihn benutzt — im Auslieferungszustand trifft das auf
                310 zu), stürzte der Dialog hier ab und die Session ließ sich
                überhaupt nicht mehr abschließen. */}
            {grading.formTypes
              .filter((f) => f.id === '306' || f.id === '310')
              .map((ft) => {
              const id = ft.id
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
                    <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[12px] font-semibold text-danger">
                      {t('forms:mandatory')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {/* Bei mehreren Piloten im Durchgang entsteht je Pilot ein 306 */}
          {notCompetentCount > 1 && followUps.includes('306') && (
            <p className="mt-3 rounded-xl border border-warm/25 bg-warm/5 p-3 text-[12.5px] leading-relaxed">
              {t('forms:followUp306PerPilot', { count: notCompetentCount })}
            </p>
          )}
          {/* Gleiches gilt seit #24 für das 310: es nennt genau einen Piloten. */}
          {trainees.length > 1 && followUps.includes('310') && (
            <p className="mt-3 rounded-xl border border-warm/25 bg-warm/5 p-3 text-[12.5px] leading-relaxed">
              {t('forms:followUp310PerPilot', { count: trainees.length })}
            </p>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-dim">{t('forms:followUpMailNote')}</p>
          <div className="mt-5 flex justify-end">
            <Button onClick={finish} disabled={followUps.length === 0 || submitting}>
              {t('forms:openFollowUp')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
