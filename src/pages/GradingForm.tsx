import { ArrowLeft, ArrowRight, ChevronDown, Info, Plus, Send, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SignaturePad } from '../components/SignaturePad'
import { Ankreuzknopf, Button, Card, CardHeading, Field, inputCls, Modal, Page, selectCls, TopBar } from '../components/ui'
import { toast } from '../components/Toast'
import { contentFingerprint, HASH_VERSION } from '../docHash'
import { networkReachable } from '../net'
import { lokalerTag } from '../datum'
import { entwurfMitEingaben, hatEigeneEingaben, type Vorbelegt } from '../drafts'
import { encodeChain, folgeKette, type FollowUpStep } from '../folgeKette'
import { auswahlVon, fuehrtInstruktorAngaben, INSTRUKTOR_QUALI, INSTRUKTOR_SITZ, kopfFuerTyp, kopfVomElternblatt, vorbelegen, vorbelegung } from '../gradingPrefill'
import {
  autoNotCompetent,
  behoerdeFuer,
  bezeichnungen,
  einfrieren,
  empfaengerVon,
  isFollowUpType,
  isNotCompetent,
  istInstruktorBlatt,
  istUnterschrift,
  kopfHinweise,
  overallNachNote,
} from '../gradingRules'
import { navigate, scrollToTop } from '../router'
import { springeZuFeld } from '../sprungZiel'

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

/** Id der Meldung am beanstandeten Feld — es steht immer höchstens eine da. */
const FELD_FEHLER = 'feld-fehler'

/**
 * Meldung direkt unter dem beanstandeten Feld (Audit 11/2026, A11Y-16): Sie
 * stand allein unter dem Weiter-Knopf, auf dem Telefon außer Sicht. Ohne
 * role=alert — angesagt wird einmal, über die Meldung am Knopf; hier liest
 * die Sprachausgabe sie über aria-describedby, sobald das Feld den Fokus hat.
 */
function FeldFehler({ text }: { text: string }) {
  return (
    <p id={FELD_FEHLER} className="mt-1.5 text-micro leading-relaxed text-danger">
      {text}
    </p>
  )
}

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
  const usesCodes = bezeichnungen({ id: parent.formTypeId, competencySet: formTypes.find((f) => f.id === parent.formTypeId)?.competencySet }).kuerzel
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

  // Vom Elternblatt nur, was der Folgetyp führt — das Training Device stand
  // sonst unsichtbar in jedem 306/310 (gradingPrefill.ts).
  const [header, setHeader] = useState<Record<string, string>>(
    existing?.header ?? (parent ? kopfVomElternblatt(parent, formType ?? undefined) : {}),
  )
  const [trainees, setTrainees] = useState<TraineeGrading[]>(existing?.trainees ?? [])
  const [freeText, setFreeText] = useState<Record<string, string>>(existing?.freeText ?? prefillFromParent(parent, presetType, grading.formTypes))
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(existing?.sessionStatus ?? null)
  // Zuständige Behörde: bestimmt die ATO-Kennung im Dokumentkopf
  // (AT.ATO.106 bzw. GBR.ATO.0541). Standard ist AT; ein Folgeformular
  // gehört zur Zulassung seines Elternblatts (GRD-04, siehe behoerdeFuer).
  const [authority, setAuthority] = useState<'AT' | 'UK'>(behoerdeFuer(existing, parent))
  /*
   * Was das Formular von sich aus eingetragen hat (Elternblatt, Vorbelegung,
   * Behörde) — der Maßstab, an dem `dirty` misst (GRD-10). Startet mit dem
   * Anfangsstand dieses ersten Renderns; die Vorbelegung unten ergänzt ihn.
   */
  const [basis, setBasis] = useState<Vorbelegt>(() => ({ header, freeText, authority }))
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
  /** Kompetenz, deren freiwilliges Kommentarfeld gerade geoeffnet ist. */
  const [openComment, setOpenComment] = useState<string | null>(null)
  /** Liste der offenen Punkte in der Abschlussleiste aufgeklappt? */
  const [offenOffen, setOffenOffen] = useState(false)
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

  /*
   * Vorbelegung der Kopfdaten — die Regel steht in gradingPrefill.ts (GRD-06).
   *
   * Gefuellt wird nur, was leer ist, nur Felder, die der gewaehlte
   * Formulartyp ueberhaupt fuehrt UND die man hier sieht, und bei
   * Auswahlfeldern nur Werte, die dort auch zur Wahl stehen. Alles bleibt
   * aenderbar — es ist ein Vorschlag, keine Vorgabe. Ein Entwurf gewinnt: Er
   * wird zuerst geladen, und diese Ergaenzung fasst nur noch die
   * verbliebenen Luecken an.
   */
  const letztesEigene = useMemo(
    () =>
      [...state.gradingRecords]
        .filter((r) => r.instructorId === currentUser!.id && r.trainees.length > 0)
        .sort((a, b) => b.createdAt - a.createdAt)[0],
    [state.gradingRecords, currentUser],
  )
  useEffect(() => {
    if (existing || !formType) return
    const vorschlag = vorbelegung(formType, {
      letztesEigene,
      eigeneMuster: currentUser!.aircraftTypes ?? [],
      muster: state.settings.aircraftTypes,
      // Ortszeit, nicht der UTC-Tag: Nach Mitternacht stand sonst bis 01:00
      // (Sommer 02:00) das Datum von gestern im Nachweis (GRD-16).
      heute: lokalerTag(Date.now() + state.timeOffsetMs),
      anzahlKompetenzen: competencies.length,
    })
    setHeader((h) => vorbelegen(h, vorschlag))
    // Derselbe Vorschlag ist Teil der Basis: Was nur er eingetragen hat, ist
    // keine Eingabe des Nutzers (GRD-10). Die Basis waechst mit jedem
    // gewaehlten Typ, damit ein Typwechsel dessen Vorbelegung nicht
    // ploetzlich zur „Eingabe" macht.
    setBasis((b) => {
      const kopf = vorbelegen((b.header ?? {}) as Record<string, string>, vorschlag)
      return kopf === b.header ? b : { ...b, header: kopf }
    })
    // competencies folgt formType — als Zahl, sonst liefe der Effekt bei jedem Rendern.
  }, [formType, existing, letztesEigene, currentUser, state.timeOffsetMs, state.settings.aircraftTypes, competencies.length])

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
  /** Rest der Folgeformular-Kette als Zeichenkette — stabil über Renderläufe,
   *  anders als das Feld, das die Adresszeile bei jedem Rendern neu baut. */
  const kette = encodeChain(next)
  /*
   * Ungesichert ist nur, was der Nutzer selbst eingetragen hat (GRD-10,
   * TEC-05). Vorher reichte ein beliebiger Kopfwert — und die Vorbelegung
   * setzt immer das Datum: Bloßes Öffnen erzeugte einen Entwurf, eine
   * Rückfrage beim Verlassen, eine Sperre beim Neuladen und beim nächsten
   * Mal „A draft of this form was restored.".
   */
  const dirty = !existing && hatEigeneEingaben({ header, trainees, freeText, attendance, sessionStatus, authority }, basis)
  /*
   * Gesetzt, sobald das Formular selbst hinausführt (Zurück bestätigt,
   * Entwurf verworfen). navigate() setzt den Hash, und das löst ein popstate
   * aus — der Wächter dafür fragte dann ein ZWEITES Mal, nach „Verwerfen"
   * sogar mit „Your entries are saved as a draft" (GRD-10).
   */
  const verlassenRef = useRef(false)

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
      // Ein Entwurf ohne eigene Eingabe — Altbestand aus bloßem Öffnen — ist
      // keiner: kein Hinweis „restored", und weg damit (GRD-10).
      if (!entwurfMitEingaben(d)) {
        localStorage.removeItem(draftKey)
        return
      }
      if (d.header) setHeader(d.header)
      if (d.trainees) setTrainees(d.trainees)
      if (d.freeText) setFreeText(d.freeText)
      if (d.attendance) setAttendance(d.attendance)
      if (d.sessionStatus) setSessionStatus(d.sessionStatus)
      if (typeof d.step === 'number') setStep(d.step)
      // Beim Folgeformular gewinnt das Elternblatt, nicht der Entwurf (GRD-04).
      setAuthority(behoerdeFuer(existing, parent, d.authority))
      setDraftRestored(true)
    } catch {
      /* unlesbarer Entwurf wird ignoriert */
    }
  }, [draftKey, existing, formTypeId])

  useEffect(() => {
    if (existing || submittingRef.current || verlassenRef.current) return
    const tm = setTimeout(() => {
      // Erst beim Feuern prüfen: Ein Takt, der vor „Verwerfen" oder dem
      // Absenden geplant wurde, schriebe den Entwurf sonst wieder hin.
      if (submittingRef.current || verlassenRef.current) return
      try {
        if (!dirty) {
          // Alles zurückgenommen: Ein früher gesicherter Stand würde sonst
          // als „Entwurf" mit Eingaben angeboten, die es nicht mehr gibt.
          // Verzögert wie das Sichern — beim Öffnen läuft dieser Effekt,
          // bevor der wiederhergestellte Stand gerendert ist.
          if (draftLoaded.current === draftKey) localStorage.removeItem(draftKey)
          return
        }
        // Die Kette (`next`) reist mit: Ohne sie verlor „Fortsetzen" aus der
        // Liste die übrigen Pflichtformulare des Durchgangs (GRD-01). Die
        // Basis ebenso: An ihr erkennt die Liste ein Phantom (GRD-10).
        localStorage.setItem(
          draftKey,
          JSON.stringify({ header, trainees, freeText, attendance, sessionStatus, step, authority, next: kette, basis }),
        )
      } catch {
        /* Speicher voll: der Entwurf gilt dann nur für diese Sitzung */
      }
    }, 400)
    return () => clearTimeout(tm)
  }, [existing, dirty, draftKey, header, trainees, freeText, attendance, sessionStatus, step, authority, kette, basis])

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey)
    } catch {
      /* nichts zu verwerfen */
    }
  }, [draftKey])

  /** Vor dem Verlassen fragen — gibt false zurück, wenn geblieben wird. */
  const leaveGuard = useCallback(() => {
    if (!dirty || submittingRef.current || verlassenRef.current) return true
    const gehen = window.confirm(t('forms:leaveConfirm'))
    // Das folgende navigate() löst popstate aus — nicht noch einmal fragen.
    if (gehen) verlassenRef.current = true
    return gehen
  }, [dirty, t])

  // Browser-Zurück abfangen: der Hash-Router wechselt sonst kommentarlos die
  // Seite. Ein zusätzlicher History-Eintrag macht die Geste abfangbar.
  useEffect(() => {
    if (!dirty) return
    const route = window.location.hash
    history.pushState(null, '', route)
    const onPop = () => {
      if (submittingRef.current || verlassenRef.current) return
      if (window.confirm(t('forms:leaveConfirm'))) {
        // navigate() setzt den Hash und löst damit selbst wieder popstate aus.
        verlassenRef.current = true
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
      if (verlassenRef.current || submittingRef.current) return
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
        // Automatik greift sofort und setzt das Overall Result fest — und
        // nimmt es zurück, wenn die auslösende Note korrigiert wird (GRD-08).
        return overallNachNote(tr, { ...tr, grades })
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
  const blattArt = { id: formTypeId ?? '', competencySet: formType?.competencySet }
  const isInstructorSheet = istInstruktorBlatt(blattArt)
  // Personen und Unterschriften heißen wie auf dem Dokument (GTY-10) — die
  // Ansicht fragt dieselbe Stelle.
  const b = bezeichnungen(blattArt)
  // Instruktoren-Kompetenzen werden ausgeschrieben, ohne Kürzel (Original 308G)
  const hideCodes = !b.kuerzel
  /** Kompetenz, wie das Formular sie zeigt: auf dem 308G ohne Kürzel — die
   *  offenen Punkte nannten dort „PRE", „CLI", Kürzel, die das Formular
   *  nirgends zeigt (GTY-10). Ebenso die Namen der Notenknöpfe. */
  const kompVoll = (c: { code: string; title: string }) => (hideCodes ? c.title : `${c.code} · ${c.title}`)

  const needsFollowUp =
    trainees.some(isNotCompetent) || sessionStatus === 'not_completed'

  /** Anzahl der Piloten, für die je ein eigenes 306 fällig wird */
  const notCompetentCount = trainees.filter(isNotCompetent).length
  /** Wie viele 306 die Auswahl im Folgedialog öffnet — je Pilot entsteht
   *  ein Blatt, die Vorschau rechnet deshalb mit einem Blatt je Pilot. */
  const anzahl306 = folgeKette(
    trainees.map((tr, i) => ({ id: String(i), trainees: [tr] })),
    followUps,
  ).filter((x) => x.type === '306').length

  /** Pflicht-Folgeformulare: Not Competent ⇒ 306, Session nicht abgeschlossen ⇒ 310 */
  const requiredFollowUps: FormTypeId[] = [
    ...(trainees.some(isNotCompetent) ? (['306'] as FormTypeId[]) : []),
    ...(sessionStatus === 'not_completed' ? (['310'] as FormTypeId[]) : []),
  ]

  /** Schlüssel der beanstandeten Felder — der Fokus springt zum ersten,
   *  statt die Meldung weit entfernt von der Ursache stehen zu lassen. Mehr
   *  als einer bei Entweder-oder-Paaren: Dort fehlt keines der beiden Felder
   *  für sich, sondern beide zusammen (GTY-12). */
  const errorKeysRef = useRef<string[]>([])
  /** Ist dieses Feld beanstandet? */
  const beanstandet = (key: string) => !!error && errorKeysRef.current.includes(key)
  /** Steht die Meldung hier? Nur beim ersten beanstandeten Feld — sie stand
   *  vorher allein unter dem Weiter-Knopf, auf dem Telefon außer Sicht und
   *  von der Sandbox-Leiste angeschnitten (A11Y-16). */
  const meldungHier = (key: string) => !!error && errorKeysRef.current[0] === key

  /*
   * Plausibilität der Kopfdaten (gradingRules.ts): Zukunftswarnung nur beim
   * Schulungsdatum, Due Date nicht vor dem Datum (GTY-05), Von ≠ Nach
   * (GTY-11), ganze Zahlen ab 0 (GTY-07). Jeder Fehler wird dort gemeldet,
   * wo sein Feld steht — Schritt 1 in `validateHeader`, Session-Daten in der
   * Liste der offenen Punkte —, also genau einmal.
   */
  const heute = lokalerTag(Date.now() + state.timeOffsetMs)
  const plausibel = useMemo(() => kopfHinweise(formType?.fields ?? [], header, heute), [formType, header, heute])
  const imSchritt2 = useCallback((key: string) => !!formType?.fields.find((f) => f.key === key)?.postGrading, [formType])

  /**
   * ALLE offenen Punkte des Bewertungsschritts, jeder mit Sprungziel.
   *
   * `validate()` liefert immer nur den ERSTEN — und die Meldung stand
   * gemessene 3.900 px von der Stelle entfernt, an der etwas fehlte, ohne
   * Sprungziel und ohne zu sagen, welche Kompetenz gemeint ist. Nach dem
   * Beheben erschien der naechste Punkt: serielles Aufdecken ueber sechs
   * Bildschirme. Diese Liste zeigt den Stand vollstaendig und fuehrt hin.
   */
  const openItems = useMemo(() => {
    if (!formType || step !== 2) return []
    const out: { id: string; text: string }[] = []
    trainees.forEach((tr, i) => {
      const wer = tr.traineeName?.trim() || t(b.personN, { n: i + 1 })
      competencies.forEach((c) => {
        const g = tr.grades.find((x) => x.code === c.code)
        if (g?.grade === null || g?.grade === undefined) out.push({ id: `komp-${i}-${c.code}`, text: `${wer} · ${hideCodes ? c.title : c.code} — ${t('forms:gradeMissing')}` })
        else if ((g.grade === 1 || g.grade === 2) && !g.comment.trim())
          out.push({ id: `komp-${i}-${c.code}`, text: `${wer} · ${hideCodes ? c.title : c.code} — ${t('forms:commentRequired')}` })
      })
      if (competencies.length > 0) {
        // „NO" heisst not observed. Ein Blatt ohne eine einzige echte Note
        // belegt keine Kompetenz und darf nicht abgeschlossen werden — das
        // stand nur in der Absendepruefung und fehlte in der Leiste, die den
        // Knopf steuert.
        if (!tr.grades.some((g) => typeof g.grade === 'number'))
          out.push({ id: `komp-${i}-${competencies[0]?.code ?? ''}`, text: t('forms:errAllNotObserved', { name: wer }) })
        if (!tr.positiveComment.trim() || !tr.developmentComment.trim() || !tr.summaryComment.trim())
          out.push({ id: `zusammen-${i}`, text: `${wer} — ${t('forms:summaryMissing')}` })
        if (!tr.overall) out.push({ id: `overall-${i}`, text: `${wer} — ${t('forms:overall')}` })
      }
    })
    if (competencies.length > 0 && !sessionStatus) out.push({ id: 'session', text: t('forms:errSession') })
    postFields.forEach((f) => {
      if (f.required && !header[f.key]?.trim()) out.push({ id: 'sessiondaten', text: `${f.label} — ${t('forms:gradeMissing')}` })
    })
    // Beanstandete Session-Daten führen direkt ins Feld (Takeoffs/Landings).
    plausibel.fehler
      .filter((x) => imSchritt2(x.feld))
      .forEach((x) => out.push({ id: `field-${x.feld}`, text: t(x.schluessel, x.werte) }))
    /* 306 und 310 belegen die Nachschulung bzw. den offenen Punkt — ihr
       Inhalt steht ausschliesslich in den Freitextabschnitten. Sie fehlten
       hier, und weil die Leiste den Senden-Knopf steuert, meldete ein leeres
       306 „Alles erledigt" in Gruen und brach beim Klick ab. */
    if (isFollowUpType(formTypeId ?? '')) {
      ;(formType.freeTextSections ?? []).forEach((sec) => {
        if (!freeText[sec]?.trim()) out.push({ id: 'freitext', text: `${sec} — ${t('forms:gradeMissing')}` })
      })
    }
    // Eine Anwesenheitsliste ohne Anwesende belegt nichts.
    if (isAttendance && !attendance.some((a) => a.name.trim())) out.push({ id: 'anwesenheit', text: t('forms:errNoAttendee') })
    if (formTypeId === '307A') {
      // 307A ist eine Anwesenheitsliste: wer daraufsteht, war da und unterschreibt.
      attendance
        .filter((a) => a.name.trim() && !istUnterschrift(a.signature))
        .forEach((a) => out.push({ id: 'anwesenheit', text: t('forms:errAttendanceSignature', { name: a.name.trim() }) }))
    }
    // Ein Bild ohne Inhalt ist keine Unterschrift (MOB-01).
    if (!istUnterschrift(sigInstructor)) out.push({ id: 'unterschriften', text: t('forms:errSignature') })
    return out
  }, [formType, formTypeId, step, trainees, competencies, b, hideCodes, sessionStatus, postFields, header, plausibel, imSchritt2, freeText, isAttendance, attendance, sigInstructor, t])

  /** Fortschritt: wie viele Noten sind gesetzt? */
  const gradedCount = trainees.reduce((n, tr) => n + tr.grades.filter((g) => g.grade !== null).length, 0)
  const gradesTotal = trainees.length * competencies.length

  /* Solange die Abschlussleiste steht, ruecken die uebrigen fixierten
     Streifen (Offline, Update) darueber — siehe index.css. */
  useEffect(() => {
    const an = !!formType && step === 2
    document.body.classList.toggle('hat-formularleiste', an)
    return () => document.body.classList.remove('hat-formularleiste')
  }, [formType, step])

  /*
   * Höhe der Abschlussleiste als `--formularleiste-h` am Wurzelelement.
   *
   * Audit 11/2026, A11Y-01/MOB-03 (WCAG 2.4.11): Der Browser scrollte ein
   * per Tab erreichtes Element nur bis an den Fensterrand — und dort stand
   * die Leiste. Gemessen 26 von 139 Fokusstopps ganz verdeckt, auf dem iPad
   * „LTW · Leadership & teamwork: 1" komplett darunter; eine Note ließ sich
   * per Leertaste auf einem unsichtbaren Knopf setzen. `scroll-padding` in
   * index.css hält den Bereich frei — mit der GEMESSENEN Höhe, denn die
   * Leiste wächst mit der aufgeklappten Liste der offenen Punkte.
   */
  const leisteRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const leiste = leisteRef.current
    const wurzel = document.documentElement
    if (!leiste) return
    const messen = () => wurzel.style.setProperty('--formularleiste-h', `${leiste.offsetHeight}px`)
    messen()
    const beobachter = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(messen)
    beobachter?.observe(leiste)
    return () => {
      beobachter?.disconnect()
      wurzel.style.removeProperty('--formularleiste-h')
    }
  }, [formType, step])

  const springeZu = (id: string, nochmal = true) => {
    /* Manche offenen Punkte liegen auf Schritt 1 — bei 306/310 stehen die
       Freitextabschnitte dort, die Leiste steht aber auf Schritt 2. Ohne den
       Rücksprung verpuffte der Klick wortlos: Das Ziel gibt es im Baum gar
       nicht, und der Punkt blieb offen, ohne dass man erfuhr, wo er steht.
       Erst nach dem Wechsel suchen — vorher ist das Ziel nicht gerendert;
       und nur einmal, sonst liefe ein fehlendes Ziel endlos im Kreis. */
    if (springeZuFeld(id) || !nochmal) return
    setStep(1)
    window.setTimeout(() => springeZu(id, false), 60)
  }

  /** Schritt 1: Kopfdaten inkl. Student/Instructor */
  const validateHeader = (): string => {
    errorKeysRef.current = []
    if (!formType) return t('forms:errFormType')
    for (const f of preFields) {
      if (f.required && !header[f.key]?.trim()) {
        errorKeysRef.current = [f.key]
        return t('forms:errRequired', { field: f.label })
      }
    }
    // Entweder-oder-Paare: eines von beiden ist Pflicht
    for (const f of headerFields) {
      const partner = f.exclusiveWith ? headerFields.find((x) => x.key === f.exclusiveWith) : undefined
      if (!partner) continue
      if (!header[f.key]?.trim() && !header[partner.key]?.trim()) {
        errorKeysRef.current = [f.key, partner.key]
        return t('forms:errEitherOr', { a: f.label, b: partner.label })
      }
    }
    // Plausibilität (GTY-05, GTY-07, GTY-11) — am Feld, wie die Pflichtfelder.
    const kopfFehler = plausibel.fehler.find((x) => !imSchritt2(x.feld))
    if (kopfFehler) {
      errorKeysRef.current = [kopfFehler.feld]
      return t(kopfFehler.schluessel, kopfFehler.werte)
    }
    if (competencies.length > 0) {
      // Der Sprung führte hier auf das erste Feld mit Platzhalter — auch dann,
      // wenn der zweite Pilot ohne Namen war.
      const ohneName = trainees.findIndex((tr) => !tr.traineeName?.trim())
      if (ohneName >= 0) errorKeysRef.current = [`traineeName-${ohneName}`]
      if (trainees.length === 0 || ohneName >= 0) return t('forms:errNoTrainee')
    }
    return ''
  }

  /** Schritt 2: Bewertung, Session-Daten und Unterschrift */
  /**
   * Absendepruefung — sie leitet sich aus derselben Liste ab, die unten in
   * der Leiste steht.
   *
   * Vorher waren es zwei Pruefungen mit unterschiedlichem Umfang, und die
   * Leiste steuerte den Knopf (`disabled={openItems.length > 0}`). Was nur
   * hier stand und nicht in `openItems`, fuehrte deshalb zur schlimmsten
   * Kombination: Die Leiste meldete „Alles erledigt" in Gruen, der Knopf war
   * aktiv, und der Klick brach mit einer Meldung weit oberhalb der Falz ab.
   * Betroffen waren ausgerechnet die Blaetter, die eine Nachschulung belegen
   * (306/310, leere Freitexte), die Anwesenheitslisten (307A/B) und ein Blatt
   * aus lauter „NO".
   *
   * Zwei Listen, die dasselbe prüfen sollen, laufen frueher oder spaeter
   * auseinander — beim naechsten Formulartyp spaetestens. Deshalb gibt es
   * jetzt nur noch eine, und diese Funktion nimmt ihren ersten Eintrag.
   * Die Kopfdaten bleiben getrennt: Sie gehoeren zu Schritt 1, wo es die
   * Leiste noch gar nicht gibt.
   */
  const validate = (): string => {
    const headErr = validateHeader()
    if (headErr) return headErr
    return openItems[0]?.text ?? ''
  }

  /*
   * Dokumentenstand einfrieren: ATO, Zulassungsnummer, Formularstand und
   * Formulartitel gehoerten bisher zur Anzeige und wurden zur DRUCKZEIT aus
   * den Einstellungen gelesen — ein altes Dokument druckte danach eine
   * andere Zulassungsnummer als zum Unterschriftszeitpunkt. Ab Fassung 3
   * sind sie Teil des Fingerabdrucks. Das galt lange nur fuer die Grading
   * Sheets; 306, 310, 307A und 307B blieben auf dem Altbestandsweg (GRD-03).
   * Dasselbe fuer die Empfaenger: eingefroren beim Absenden (GTY-06). BEIDE
   * Zweige unten gehen durch `einfrieren` (gradingRules.ts).
   */
  const stand = (r: GradingRecord): GradingRecord => einfrieren(r, dokKopf, formType?.title ?? '', grading)

  /**
   * Mehrere Studenten im selben Durchgang dienen nur der Bedienbarkeit:
   * beim Abschluss entsteht PRO Student ein eigenes Formular mit eigener
   * Unterschrift. Formulare ohne Kompetenzbewertung (306/310/307) bleiben
   * ein einzelnes Dokument.
   */
  const buildRecords = (): GradingRecord[] => {
    const ts = Date.now() + state.timeOffsetMs
    // Nur, was das Formular zeigt — auch aus einem älteren Entwurf
    // (gradingPrefill.ts, kopfFuerTyp).
    const kopf = kopfFuerTyp(header, formType!, competencies.length)
    if (competencies.length === 0) {
      const signed = istUnterschrift(sigInstructor) && (istUnterschrift(sigTrainee) || isAttendance)
      return [
        stand({
          id: existing?.id ?? newId(),
          formTypeId: formType!.id,
          instructorId: currentUser!.id,
          header: kopf,
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
          instructorSignedAt: istUnterschrift(sigInstructor) ? ts : undefined,
          authority,
        }),
      ]
    }
    // Ein Durchgang = ein Batch: alle daraus entstehenden Formulare teilen
    // sich die ID, damit ein 306/310 für den ganzen Durchgang zählt.
    const batchId = existing?.batchId ?? newId()
    return trainees.map((tr, i) => {
      // Automatik nochmals hart durchsetzen, falls ein alter Zustand vorliegt.
      const fixed = autoNotCompetent(tr) ? { ...tr, overall: 'not_competent' as OverallResult } : tr
      const sigT = sigTrainees[i] ?? null
      const signed = istUnterschrift(sigInstructor) && istUnterschrift(sigT)
      return stand({
        id: existing && trainees.length === 1 ? existing.id : newId(),
        formTypeId: formType!.id,
        instructorId: currentUser!.id,
        header: kopf,
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
        instructorSignedAt: istUnterschrift(sigInstructor) ? ts : undefined,
        authority,
      })
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
    // Ortszeit: Mit dem UTC-Tag galt das richtige Datum kurz nach
    // Mitternacht als „in der Zukunft" (GRD-16). Und nur das Schulungsdatum:
    // Ein Due Date liegt naturgemäß in der Zukunft (GTY-05).
    if (plausibel.zukunft && !window.confirm(t('forms:warnFutureDate'))) return false
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
      toast(t('forms:toast.chainNext'), 'ok')
      navigate(`/grading/new?type=${next[0].type}&parent=${next[0].parentId}&next=${encodeChain(next.slice(1))}`)
      return
    }
    // Komplett unterschrieben UND erfolgreich versendet → zurück zum Grading
    // Dashboard (bei einer 306/310-Kette erst hier, nach dem letzten Glied).
    // Blieb etwas offen (Unterschrift, Versand), zeigt die Detailansicht warum.
    const allOk = recs.every((r) => r.status === 'signed' && r.mailStatus === 'sent')
    /* Bis hierher sprang das Formular wortlos in die Liste zurueck. Drei
       Ausgaenge sahen dabei gleich aus: fertig und versendet, unterschrieben
       aber ohne Netz (Ausgangskorb), oder noch etwas offen. Genau die
       Unterscheidung braucht der Instruktor, bevor er das Geraet weglegt. */
    const alleUnterschrieben = recs.every((r) => r.status === 'signed')
    const imKorb = recs.some((r) => r.mailStatus === 'queued')
    if (allOk) toast(t('forms:toast.signedAndSent'), 'ok')
    else if (alleUnterschrieben && imKorb) toast(t('forms:toast.queued'), 'wait')
    else toast(t('forms:toast.openLeft'), 'wait')
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
    // offene Punkte aber trotzdem ab. Jetzt entsteht es je Blatt. Ein
    // freiwillig angekreuztes 306 fiel ohne „Not Competent" still heraus
    // (GRD-11) — die Regel steht in folgeKette.ts.
    const chain = folgeKette(recs, followUps)
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
  const optionsOf = (f: FormField): string[] => auswahlVon(f, state.settings.aircraftTypes) ?? []

  /** Kopf- und Session-Datenfelder — in Schritt 1 (pre) und Schritt 2 (post) genutzt */
  const renderField = (f: FormField) => {
    const gruppe = f.type === 'radiogroup' || f.type === 'checkgroup'
    const fehler = beanstandet(f.key)
    /* Entweder-oder-Paare (308F: Zyklus ODER ATA-Kapitel): Keines der beiden
       ist für sich Pflicht, deshalb kein Stern — und so war die Pflicht erst
       NACH dem Fehler zu erkennen (GTY-12). Der Hinweis steht unter beiden. */
    const partner = f.exclusiveWith ? headerFields.find((x) => x.key === f.exclusiveWith) : undefined
    const hinweisId = partner ? `field-${f.key}-eitheror` : undefined
    // Beanstandung hängt AM Feld, nicht nur als Text weit darunter — eine
    // Sprachausgabe liest sie dann beim Fokussieren mit vor.
    const beschreibung = [fehler ? FELD_FEHLER : undefined, hinweisId].filter(Boolean).join(' ') || undefined
    const amFeld = { id: `field-${f.key}`, 'aria-invalid': fehler, 'aria-describedby': beschreibung }
    return (
      <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
        {/* Ankreuzgruppen sind mehrere Knöpfe — sie brauchen eine
            Gruppenbeschriftung, kein <label> (siehe Field). Id, Beanstandung
            und Beschreibung tragen sie an der Gruppe (GTY-12). */}
        <Field
          label={f.label + (f.required ? ' *' : '')}
          group={gruppe}
          id={gruppe ? `field-${f.key}` : undefined}
          invalid={gruppe && fehler}
          describedBy={gruppe ? beschreibung : undefined}
        >
          {f.type === 'select' ? (
            <select {...amFeld} value={header[f.key] ?? ''} onChange={(e) => setField(f, e.target.value)} className={selectCls}>
              <option value="">…</option>
              {[...optionsOf(f)].sort((a, b) => a.localeCompare(b)).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.type === 'duration' ? (
            // Zeiten immer im Format hh:mm, wählbar in 30-Minuten-Schritten
            <select {...amFeld} value={header[f.key] ?? ''} onChange={(e) => setField(f, e.target.value)} className={selectCls}>
              <option value="">hh:mm …</option>
              {DURATION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea {...amFeld} value={header[f.key] ?? ''} onChange={(e) => setField(f, e.target.value)} className={`${inputCls} min-h-20`} />
          ) : f.type === 'radiogroup' ? (
            // Einfachauswahl als Ankreuzfelder wie im Original
            <div className="flex flex-wrap gap-1.5">
              {optionsOf(f).map((o) => {
                const on = header[f.key] === o
                return (
                  <Ankreuzknopf key={o} an={on} onClick={() => setField(f, on ? '' : o)}>
                    {o}
                  </Ankreuzknopf>
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
                  <Ankreuzknopf
                    key={o}
                    an={on}
                    klein
                    onClick={() => {
                      // Reihenfolge des Originalformulars beibehalten — eine
                      // alphabetische Sortierung verdrehte z. B. die ATA-Kapitel.
                      const next = on ? sel.filter((x) => x !== o) : [...sel, o]
                      const ordered = optionsOf(f).filter((x) => next.includes(x))
                      setField(f, ordered.join(', '))
                    }}
                  >
                    {o}
                  </Ankreuzknopf>
                )
              })}
            </div>
          ) : (
            <input
              {...amFeld}
              /* Zahlen als Text mit Ziffernfeld, nicht type=number (GTY-07):
                 Dort verschwand ein getipptes „e" wortlos (der Browser meldet
                 dann den Wert ""), „-3" und „2.5" gingen durch. Als Text bleibt
                 stehen, was man sieht, und `ganzzahligNichtNegativ` beanstandet
                 es beim Weiter bzw. in den offenen Punkten. */
              type={f.type === 'date' ? 'date' : 'text'}
              inputMode={f.type === 'number' ? 'numeric' : undefined}
              autoComplete={f.type === 'number' ? 'off' : undefined}
              value={header[f.key] ?? ''}
              onChange={(e) => setField(f, e.target.value)}
              className={inputCls}
            />
          )}
          {/* Fußnoten des Originalformulars, etwa zu den PRG-Sternchen */}
          {f.hint && <p className="mt-1.5 text-micro leading-relaxed text-dim">{f.hint}</p>}
        </Field>
        {/* Außerhalb des <label>: Text darin würde Teil des Feldnamens. */}
        {partner && (
          <p id={hinweisId} className="mt-1.5 text-micro leading-relaxed text-dim">
            {t('forms:eitherOrHint', { other: partner.label })}
          </p>
        )}
        {meldungHier(f.key) && <FeldFehler text={error} />}
      </div>
    )
  }

  if (!mayGrade) {
    return (
      <>
        <TopBar title={t('forms:newForm')} back="/grading" home={false} wide />
        <Page>
          <p className="rounded-xl border border-line/10 bg-surface/60 p-3.5 text-small leading-relaxed text-dim">{t('forms:noPermission')}</p>
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
      <Page wide className="space-y-section pb-32">
        {/* Wiederhergestellter Entwurf: sichtbar machen und verwerfbar halten */}
        {draftRestored && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3.5 text-small">
            <p className="min-w-0 flex-1 leading-relaxed">{t('forms:draftRestored')}</p>
            <Button
              variant="ghost"
              onClick={() => {
                // Verworfen ist verworfen: keine Rückfrage, die von einem
                // gesicherten Entwurf spricht (GRD-10).
                verlassenRef.current = true
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
                // Was der neue Typ nicht zeigt, fällt aus dem Kopf — die
                // Vorbelegung des vorigen Typs (Device, Qualifikation, Sitz)
                // blieb sonst unsichtbar stehen. Die Basis ebenso, sonst
                // gälte das Wegfallen als Eingabe (GRD-06, GRD-10).
                if (ft) {
                  setHeader((h) => kopfFuerTyp(h, ft, cs.length))
                  setBasis((b) => ({ ...b, header: kopfFuerTyp((b.header ?? {}) as Record<string, string>, ft, cs.length) }))
                }
                // Liste wird neu aufgebaut — alte Unterschriften dürfen nicht stehen bleiben
                setSigTrainees({})
              }}
              className="w-full rounded-xl border border-field bg-bg/60 px-3 py-2.5 text-body disabled:opacity-60"
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
              <Card className="space-y-section p-4">
                <CardHeading>{t(b.teilnehmer)}</CardHeading>

                {trainees.map((tr, i) => {
                  // Bei mehreren Piloten sagt der Name der Gruppe, wessen Sitz es ist —
                  // sonst stand „Left" zweimal hintereinander ohne Bezug (A11Y-08).
                  const wessen = trainees.length > 1 ? ` — ${t(b.person)} ${i + 1}` : ''
                  return (
                  <div key={i} className="rounded-xl border border-line/10 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <p className="flex-1 text-small font-semibold text-accent">
                        {t(b.person)} {trainees.length > 1 ? i + 1 : ''}
                      </p>
                      {/* Beschriftet und 44 px: Der Knopf loescht einen kompletten
                          Piloten samt Bewertung und wurde als „Schaltflaeche"
                          ohne Inhalt angesagt. */}
                      {trainees.length > 1 && (
                        <button
                          onClick={() => removeTrainee(i)}
                          aria-label={`${t(b.person)} ${i + 1} — ${t('common.delete')}`}
                          title={t('common.delete')}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-dim transition hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    {/* Studentenname wird immer frei eingetippt — kein Dropdown.
                        Der Platzhalter war sein einziger Name und verschwand mit
                        dem ersten Buchstaben (A11Y-07); als Sprungziel trägt das
                        Feld eine id und seine Beanstandung (A11Y-16). */}
                    <input
                      id={`field-traineeName-${i}`}
                      value={tr.traineeName ?? ''}
                      onChange={(e) => setTrainee(i, { traineeName: e.target.value })}
                      placeholder={t(b.name)}
                      aria-label={`${t(b.name)}${wessen}`}
                      aria-invalid={beanstandet(`traineeName-${i}`)}
                      aria-describedby={beanstandet(`traineeName-${i}`) ? FELD_FEHLER : undefined}
                      className={`${inputCls} mb-2`}
                    />
                    {meldungHier(`traineeName-${i}`) && <FeldFehler text={error} />}
                    {/* 308G kennt keine CDR/FO- und Sitzchips — dort stehen
                        Qualifikation und Position im Kopf des Formulars.
                        Zwei eigene Gruppen statt eines Trennstrichs im
                        gemeinsamen Umbruch: Der Strich hing bei 360 px allein am
                        Zeilenende (MOB-11); jetzt bricht die zweite Gruppe als
                        Ganzes um, und jede trägt ihren Namen (A11Y-08). */}
                    <div className={`flex flex-wrap gap-x-section gap-y-tight ${isInstructorSheet ? 'hidden' : ''}`}>
                      <div role="group" aria-label={`${t('forms:traineePosition')}${wessen}`} className="flex flex-wrap gap-1.5">
                        {['CDR', 'FO'].map((o) => (
                          <Ankreuzknopf key={o} an={tr.position === o} onClick={() => setTrainee(i, { position: o })}>
                            {o}
                          </Ankreuzknopf>
                        ))}
                      </div>
                      <div role="group" aria-label={`${t('forms:traineeSeat')}${wessen}`} className="flex flex-wrap gap-1.5">
                        {['Left', 'Right'].map((o) => (
                          <Ankreuzknopf key={o} an={tr.seat === o} onClick={() => setTrainee(i, { seat: tr.seat === o ? '' : o })}>
                            {o}
                          </Ankreuzknopf>
                        ))}
                      </div>
                    </div>
                  </div>
                  )
                })}

                <button
                  onClick={() => setTrainees([...trainees, emptyTrainee(codes, isInstructorSheet ? '' : 'CDR')])}
                  className="flex items-center gap-1.5 text-small font-medium text-accent hover:underline"
                >
                  <Plus size={15} /> {t(b.hinzufuegen)}
                </button>
                {trainees.length > 1 && (
                  <p className="rounded-xl bg-bg/40 p-3 text-micro leading-relaxed text-dim">{t('forms:multiStudentHint')}</p>
                )}

                <div className="rounded-xl border border-line/10 p-3">
                  <p className="mb-2 text-small font-semibold text-accent">{t(b.ausbilder)}</p>
                  <p className="mb-2 rounded-lg bg-bg/40 px-3 py-2 text-body">{currentUser!.name}</p>
                  {/* Dieselbe Bedingung wie die Vorbelegung (GRD-06): Was hier
                      nicht zu sehen ist, darf auch nicht vorbelegt werden. */}
                  <div className={`flex flex-wrap gap-x-section gap-y-tight ${formType && fuehrtInstruktorAngaben(formType, competencies.length) ? '' : 'hidden'}`}>
                    <div role="group" aria-label={t('forms:instructorQual')} className="flex flex-wrap gap-1.5">
                      {INSTRUKTOR_QUALI.map((o) => (
                        <Ankreuzknopf
                          key={o}
                          an={header.instructorQual === o}
                          onClick={() => setHeader({ ...header, instructorQual: header.instructorQual === o ? '' : o })}
                        >
                          {o}
                        </Ankreuzknopf>
                      ))}
                    </div>
                    <div role="group" aria-label={t('forms:instructorSeat')} className="flex flex-wrap gap-1.5">
                      {INSTRUKTOR_SITZ.map((o) => (
                        <Ankreuzknopf
                          key={o}
                          an={header.instructorSeat === o}
                          onClick={() => setHeader({ ...header, instructorSeat: header.instructorSeat === o ? '' : o })}
                        >
                          {o}
                        </Ankreuzknopf>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 2b. Kopfdaten (nur Felder, die VOR dem Grading erfasst werden) */}
            <Card className="space-y-stack p-4">
              <CardHeading>{t('forms:headerData')}</CardHeading>
              <div className="grid gap-3 sm:grid-cols-2">{preFields.map(renderField)}</div>
              {/* Kein Katalogfeld: die Behörde gehört zu JEDEM Formulartyp
                  und bestimmt die ATO-Kennung im Dokumentkopf. */}
              {parent ? (
                /* Folgeformular: nur anzeigen. Es gehört zur Zulassung seines
                   Elternblatts — wählbar startete es mit AT, und das 306 einer
                   UK-Session druckte AT.ATO.106 (GRD-04). */
                <div>
                  <p className="mb-1.5 text-small font-medium text-dim">{t('forms:authority')}</p>
                  <p className="rounded-xl bg-bg/40 px-3 py-2.5 text-body">
                    {authority === 'UK'
                      ? t('forms:authorityUK', { nr: state.settings.documentHeader?.approvalNumberUK || 'GBR.ATO.0541' })
                      : t('forms:authorityAT', { nr: state.settings.documentHeader?.approvalNumber || 'AT.ATO.106' })}
                  </p>
                  <p className="mt-1 text-micro leading-relaxed text-dim">{t('forms:authorityFromParent', { form: parent.formTypeId })}</p>
                </div>
              ) : (
                <Field label={t('forms:authority')}>
                  <select value={authority} onChange={(e) => setAuthority(e.target.value as 'AT' | 'UK')} className={selectCls}>
                    <option value="AT">{t('forms:authorityAT', { nr: state.settings.documentHeader?.approvalNumber || 'AT.ATO.106' })}</option>
                    <option value="UK">{t('forms:authorityUK', { nr: state.settings.documentHeader?.approvalNumberUK || 'GBR.ATO.0541' })}</option>
                  </select>
                </Field>
              )}
            </Card>

            {/* 3. Freitextabschnitte (306/310) */}
            {formType.freeTextSections.length > 0 && (
              <Card id="freitext" className="scroll-mt-24 space-y-stack p-4">
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
                  // hunderte Pixel von der Ursache entfernt. Bei Ankreuzgruppen
                  // fand der Sprung nichts und blieb auf diesem Knopf (GTY-12).
                  if (errorKeysRef.current[0]) springeZuFeld(`field-${errorKeysRef.current[0]}`)
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
              <p id="form-error" role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-small text-danger">
                {error}
              </p>
            )}
          </>
        )}

        {formType && step === 2 && (
          <>
            <button onClick={() => { setStep(1); scrollToTop(); fokusUeberschrift() }} className="flex items-center gap-1.5 text-small text-dim hover:text-ink">
              <ArrowLeft size={15} /> {t('forms:backToHeader')}
            </button>

            {/* 4. Grading je Pilot */}
            {competencies.length > 0 &&
              trainees.map((tr, i) => {
                const auto = autoNotCompetent(tr)
                return (
                <Card key={i} className="space-y-section p-4">
                  <div className="flex items-center gap-2">
                    <CardHeading className="flex-1">
                      {tr.traineeName?.trim() || t(b.personN, { n: i + 1 })}
                      {tr.position ? ` · ${tr.position}` : ''}
                      {tr.seat ? ` · ${tr.seat}` : ''}
                    </CardHeading>
                  </div>


                  <div className="space-y-stack lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                    {competencies.map((c) => {
                      const g = tr.grades.find((x) => x.code === c.code)
                      const key = `${i}-${c.code}`
                      const commentRequired = g?.grade === 1 || g?.grade === 2
                      return (
                        /*
                          Kompakter: Titelzeile mit OB-Knopf, darunter EINE Reihe
                          Noten, das Kommentarfeld nur, wenn es gebraucht wird.
                          Gemessen passten vorher 2,95 Kompetenzen auf einen
                          Bildschirm — neun Kompetenzen waren 2.117 px reines
                          Bewerten, bei zwei Piloten 11,3 Bildschirme am Stueck.
                        */
                        <div key={c.code} id={`komp-${i}-${c.code}`} className="scroll-mt-24 rounded-xl border border-line/10 p-2.5">
                          <div className="mb-1.5 flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-body font-semibold leading-snug">
                                {hideCodes ? c.title : <>{c.code} <span className="font-normal text-dim">· {c.title}</span></>}
                              </p>
                            </div>
                            <button
                              onClick={() => setOpenBehaviour(openBehaviour === key ? null : key)}
                              title={t('forms:behaviours')}
                              aria-expanded={openBehaviour === key}
                              className="min-h-11 flex shrink-0 items-center gap-1 rounded-lg border border-line/15 px-2 py-1 text-micro text-dim hover:text-accent"
                            >
                              <Info size={12} /> OB <ChevronDown size={11} className={openBehaviour === key ? 'rotate-180' : ''} />
                            </button>
                          </div>
                          {openBehaviour === key && (
                            <ul className="mb-2.5 list-disc space-y-tight rounded-lg bg-bg/50 p-3 pl-7 text-micro leading-relaxed text-dim">
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
                          {/* Eine Reihe statt zwei: sechs Knoepfe zu je 52 px
                              passen in die Inhaltsbreite von 324 px. */}
                          <div role="group" aria-label={kompVoll(c)} className="grid grid-cols-6 gap-1.5">
                            {GRADES.map((val) => (
                              <button
                                key={String(val)}
                                onClick={() => setGrade(i, c.code, val)}
                                aria-pressed={g?.grade === val}
                                aria-label={`${kompVoll(c)}: ${val}`}
                                className={`min-h-11 rounded-lg px-1 py-2.5 text-body font-semibold transition ${
                                  g?.grade === val ? gradeColor(val) + ' ring-2 ring-accent' : 'bg-line/[0.06] text-dim hover:bg-line/10'
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                          {/* Das Kommentarfeld stand bei JEDER Kompetenz offen —
                              9 × 45 px, rund 11 % der Seitenhoehe, obwohl es nur
                              bei 1 und 2 Pflicht ist. Jetzt erscheint es, wenn es
                              gebraucht wird oder schon Text traegt; sonst genuegt
                              ein leiser Knopf. */}
                          {(commentRequired || (g?.comment ?? '').length > 0 || openComment === key) && (
                          <input
                            value={g?.comment ?? ''}
                            onChange={(e) => setGradeComment(i, c.code, e.target.value)}
                            placeholder={commentRequired ? t('forms:commentRequired') : t('forms:commentOptional')}
                            // Der Platzhalter wechselt zwischen „erforderlich" und
                            // „optional" — als einziger Name des Feldes hiesse das:
                            // Das Feld heisst je nach Zustand anders.
                            aria-label={`${t('forms:commentOptional')} — ${hideCodes ? c.title : c.code}`}
                            aria-required={commentRequired}
                            className={`${inputCls} mt-1.5 text-small ${commentRequired && !g?.comment.trim() ? 'border-danger/60' : ''}`}
                          />
                          )}
                          {!commentRequired && !(g?.comment ?? '').length && openComment !== key && (
                            <button
                              onClick={() => setOpenComment(key)}
                              className="mt-1.5 text-micro text-dim underline-offset-2 hover:text-accent hover:underline"
                            >
                              + {t('forms:commentOptional')}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Sprungziel der Abschlussleiste */}
                  <div id={`zusammen-${i}`} className="grid scroll-mt-24 gap-3 sm:grid-cols-3">
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

                  <Field label={t('forms:overall') + ' *'} group id={`overall-${i}`}>
                    <div className="flex gap-2">
                      {(['competent', 'not_competent'] as OverallResult[]).map((o) => (
                        <button
                          key={o}
                          aria-pressed={tr.overall === o}
                          disabled={o === 'competent' && auto}
                          onClick={() => setTrainee(i, { overall: o })}
                          className={`flex-1 rounded-xl border px-3 py-3 text-body font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
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
                    {auto && <p role="status" className="mt-2 text-micro leading-relaxed text-danger">{t('forms:autoNotCompetent')}</p>}
                  </Field>
                </Card>
                )
              })}

            {competencies.length > 0 && (
              <>
                <Card className="p-4">
                  <Field label={t('forms:sessionStatus') + ' *'} group id="session">
                    <div className="flex gap-2">
                      {(['completed', 'not_completed'] as SessionStatus[]).map((sst) => (
                        <button
                          key={sst}
                          aria-pressed={sessionStatus === sst}
                          onClick={() => setSessionStatus(sst)}
                          className={`min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-small transition ${
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
              <Card id="sessiondaten" className="scroll-mt-24 space-y-stack p-4">
                <CardHeading>{t('forms:sessionData')}</CardHeading>
                <p className="text-micro leading-relaxed text-dim">{t('forms:sessionDataHint')}</p>
                <div className="grid gap-3 sm:grid-cols-2">{postFields.map(renderField)}</div>
              </Card>
            )}

            {/* 4c. Teilnehmerliste (307A/307B) */}
            {isAttendance && (
              <Card id="anwesenheit" className="scroll-mt-24 space-y-stack p-4">
                <CardHeading>{t('forms:attendance')}</CardHeading>
                {attendance.map((a, i) => (
                  <div key={i} className="space-y-stack rounded-xl border border-line/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-micro text-dim">{i + 1}.</span>
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
                        zeitversatzMs={state.timeOffsetMs}
                      />
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setAttendance([...attendance, { name: '', signature: null }])}
                  className="flex items-center gap-1.5 text-small font-medium text-accent hover:underline"
                >
                  <Plus size={15} /> {t('forms:addAttendee')}
                </button>
                {formTypeId === '307B' && <p className="text-micro leading-relaxed text-dim">{t('forms:attendance307B')}</p>}
              </Card>
            )}

            {/* 5. Unterschriften — immer live zu leisten, nie gespeichert/übernommen.
                Bei mehreren Studenten unterschreibt JEDER einzeln; pro Student
                entsteht beim Abschluss ein eigenes Formular. */}
            <Card id="unterschriften" className="scroll-mt-24 space-y-section p-4">
              <CardHeading>{t('forms:signatures')}</CardHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Wie auf dem Dokument: auf dem 308G COI und CAI (GTY-10). */}
                <SignaturePad value={sigInstructor} onChange={setSigInstructor} label={t(b.sigAusbilder)} zeitversatzMs={state.timeOffsetMs} />
                {competencies.length > 0 ? (
                  trainees.map((tr, i) => (
                    <SignaturePad
                      key={i}
                      value={sigTrainees[i] ?? null}
                      onChange={(v) => setSigTrainees((s) => ({ ...s, [i]: v }))}
                      label={`${t(b.sigPerson)} — ${tr.traineeName?.trim() || t(b.personN, { n: i + 1 })}`}
                      zeitversatzMs={state.timeOffsetMs}
                    />
                  ))
                ) : (
                  !isAttendance && <SignaturePad value={sigTrainee} onChange={setSigTrainee} label={t(b.sigPerson)} zeitversatzMs={state.timeOffsetMs} />
                )}
              </div>
              {trainees.length > 1 && (
                <p className="text-micro leading-relaxed text-dim">{t('forms:multiStudentHint')}</p>
              )}
              <p className="text-micro leading-relaxed text-dim">{t('forms:lockNote')}</p>
              <p className="text-micro leading-relaxed text-dim">{t('forms:sigLiveNote')}</p>
            </Card>

            {/* Deferred Item: Versand geht immer an den Training Admin */}
            {formTypeId === '310' && (
              <p className="rounded-xl border border-warm/25 bg-warm/5 p-3.5 text-micro leading-relaxed text-dim">
                {t('forms:deferredMailNote', { recipients: grading.deferredRecipients.join(', ') })}
              </p>
            )}

            {/* 6. Empfänger: Standard (Admin-Konfiguration) + zusätzliche */}
            <Card className="space-y-stack p-4">
              <CardHeading>{t('forms:recipientsCard')}</CardHeading>
              <div className="flex flex-wrap gap-1.5">
                {/* Dieselbe Regel, deren Ergebnis beim Absenden im Datensatz
                    landet (GTY-06) — vorher kannte diese Vorschau die
                    Eskalation bei 306 nicht. Über alle Piloten des Durchgangs. */}
                {empfaengerVon({ formTypeId: formTypeId ?? '', trainees, sessionStatus }, grading).map((r) => (
                  <span key={r} className="rounded-full bg-raised px-2.5 py-1 text-micro text-dim">
                    {r}
                  </span>
                ))}
                {/* Das „×" hatte keinen Namen (angesagt als „×") und eine
                    Trefferfläche von 13 px (A11Y-07, MOB-05). Jetzt 44 px — die
                    negativen Ränder halten die Marke trotzdem flach. */}
                {extraRecipients.map((r) => (
                  <span key={r} className="flex items-center rounded-full border border-accent/40 bg-accent/10 py-1 pl-2.5 text-micro text-accent">
                    {r}
                    <button
                      type="button"
                      onClick={() => setExtraRecipients(extraRecipients.filter((x) => x !== r))}
                      aria-label={t('forms:removeRecipient', { r })}
                      title={t('forms:removeRecipient', { r })}
                      className="-my-3 -ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:text-danger"
                    >
                      <X size={14} aria-hidden />
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
                    {/* Platzhalter und Symbol waren die einzigen Namen — der eine
                        verschwand beim Tippen, das andere wurde als „Schaltfläche"
                        angesagt (A11Y-07). */}
                    <input
                      value={recipientDraft}
                      onChange={(e) => setRecipientDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                      placeholder={t('forms:addRecipient')}
                      aria-label={t('forms:recipientInput')}
                      className={inputCls}
                    />
                    <Button variant="ghost" onClick={addRecipient} label={t('forms:addRecipientButton')} disabled={!/.+@.+\..+/.test(recipientDraft.trim())}>
                      <Plus size={16} aria-hidden />
                    </Button>
                  </div>
                )
              })()}
              <p className="text-micro leading-relaxed text-dim">{t('forms:extraRecipientsHint')}</p>
            </Card>

            {/* 7. Senden — der Knopf sitzt in der Abschlussleiste unten. Hier
                bleibt nur der Abstand, damit die Leiste nichts verdeckt. */}
            <div className="h-24" />
          </>
        )}
      </Page>

      {/*
        Abschlussleiste — sie steht IMMER im Bild.
        Vorher lag der Senden-Knopf am Seitenende: inaktiv, ohne Begruendung
        in Reichweite, und die Fehlermeldung nannte immer nur den ersten
        offenen Punkt — gemessene 3.900 px von der Stelle entfernt, an der er
        fehlte. Jetzt steht der Fortschritt dauerhaft da, die Liste nennt
        ALLE offenen Punkte, und jeder Eintrag springt hin.
      */}
      {formType && step === 2 && (
        <div ref={leisteRef} className="formularleiste above-sandbox fixed inset-x-0 z-30 border-t border-line/10 bg-bg/95 px-3 pb-3 pt-2 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {/* Höchstens die halbe Höhe, und ein Schatten am Rand, solange
                darunter noch etwas steht (`scroll-schatten`, index.css): Bei
                160 px Höhe zeigte die Liste auf dem Telefon 3 von 6 Punkten,
                ohne dass etwas auf die übrigen hinwies — darunter ausgerechnet
                die fehlende Unterschrift (MOB-11). */}
            {offenOffen && openItems.length > 0 && (
              <ul className="scroll-schatten max-h-[50vh] space-y-tight overflow-y-auto rounded-xl border border-line/10 p-2">
                {openItems.map((o) => (
                  <li key={o.id + o.text}>
                    <button
                      onClick={() => {
                        setOffenOffen(false)
                        springeZu(o.id)
                      }}
                      className="min-h-11 w-full rounded-lg px-2 text-left text-small text-dim transition hover:bg-line/5 hover:text-accent"
                    >
                      {o.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOffenOffen((v) => !v)}
                disabled={openItems.length === 0}
                aria-expanded={offenOffen}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line/15 px-3 text-left text-small transition disabled:opacity-60"
              >
                <span className="block truncate font-semibold">
                  {gradesTotal > 0 ? t('forms:gradedOf', { done: gradedCount, total: gradesTotal }) : ''}
                </span>
                <span className={`block truncate text-micro ${openItems.length ? 'text-wait' : 'text-ok'}`}>
                  {openItems.length ? t('forms:openItems', { count: openItems.length }) : t('forms:allDone')}
                </span>
              </button>
              <Button
                disabled={openItems.length > 0 || submitting}
                className="flex shrink-0 items-center justify-center gap-2 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={submit}
              >
                <Send size={16} /> {t('forms:finish')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showFollowUp && (
        <Modal title={t('forms:followUpTitle')} onClose={() => setShowFollowUp(false)}>
          <p className="mb-4 text-small leading-relaxed text-dim">{t('forms:followUpBodyMandatory')}</p>
          <div className="space-y-stack">
            {/* Über den Katalog iterieren, nicht über eine feste Liste. Früher
                durfte der Superadmin 306/310 löschen, solange kein Datensatz
                sie benutzte — dann stürzte der Dialog hier ab, und die Session
                ließ sich nicht mehr abschließen. Inzwischen hält `updateGrading`
                (store.tsx) beide immer im Katalog; die Abfrage bleibt, weil
                ein Katalog aus einem älteren Stand trotzdem lückenhaft sein
                kann und ein fehlender Typ dann nur wegfällt, statt abzustürzen. */}
            {grading.formTypes
              .filter((f) => f.id === '306' || f.id === '310')
              .map((ft) => {
              const id = ft.id
              const required = requiredFollowUps.includes(id)
              const on = followUps.includes(id)
              return (
                /* Zustand als aria-pressed, das Häkchen ist Schmuck — vorher
                   stand die Wahl allein im „✓" (A11Y-08). */
                <button
                  key={id}
                  type="button"
                  disabled={required}
                  aria-pressed={on}
                  onClick={() => setFollowUps(on ? followUps.filter((x) => x !== id) : [...followUps, id])}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                    on ? 'border-accent bg-accent/10' : 'border-line/15'
                  } ${required ? 'cursor-default' : ''}`}
                >
                  <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-bg' : 'border-line/30'}`}>
                    {on && '✓'}
                  </span>
                  <span className="min-w-0 flex-1 text-body">
                    <span className="font-semibold">{ft.id}</span> — {ft.title}
                  </span>
                  {/* Pflichtformular: vorausgewählt und nicht abwählbar */}
                  {required && (
                    <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-micro font-semibold text-danger">
                      {t('forms:mandatory')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {/* Bei mehreren Piloten im Durchgang entsteht je Pilot ein 306 —
              gezählt nach derselben Regel, nach der `finish` die Kette baut
              (GRD-11): ohne „Not Competent" eines je Blatt. */}
          {anzahl306 > 1 && (
            <p className="mt-3 rounded-xl border border-warm/25 bg-warm/5 p-3 text-micro leading-relaxed">
              {notCompetentCount > 0
                ? t('forms:followUp306PerPilot', { count: anzahl306 })
                : t('forms:followUp306Optional', { count: anzahl306 })}
            </p>
          )}
          {/* Gleiches gilt seit #24 für das 310: es nennt genau einen Piloten. */}
          {trainees.length > 1 && followUps.includes('310') && (
            <p className="mt-3 rounded-xl border border-warm/25 bg-warm/5 p-3 text-micro leading-relaxed">
              {t('forms:followUp310PerPilot', { count: trainees.length })}
            </p>
          )}
          <p className="mt-3 text-micro leading-relaxed text-dim">{t('forms:followUpMailNote')}</p>
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
