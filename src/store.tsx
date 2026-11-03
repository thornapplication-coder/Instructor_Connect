import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formularTypEntfernen, formularTypInGebrauch, gradingListComparator, isComplete, isFollowUpType, type FormularTypLoeschung } from './gradingRules'
import { networkReachable } from './net'
import { createSeedState } from './sandbox/seed'
import { migrateState } from './migrateState'
import { SANDBOX } from './sandbox/flag'
import { gruppenPflicht, gruppenTauglich, musterBelegt, musterFehlt, musterInVerwendung, musterListeBehalten, musterPflicht, nachMuster, sichtbarFuer, verliertLetzteGruppe } from './aircraftScope'
import { userHasPerm, userMayModule } from './adminAccess'
import { darfAbstimmen, darfFeedbackBearbeiten, darfGruppeAnlegen, darfInfoVerwalten, darfKontakteVerwalten, darfLessonPlansVerwalten, darfSchreiben, darfStummschalten, darfUmfrageSchliessen, darfVerwaltung, feedbackFuer } from './storeRechte'
import { kontaktFehler, kontaktNormalisieren } from './contacts'
import { feedbackFehlt } from './feedbackPruefung'
import { gueltigkeitFehler, infoEntryAppliesTo, infoGesehenBis, infoIsExpired, infoIsPublished, neuesteFremdeVeroeffentlichung } from './infoAcks'
import { adminKandidaten, gruppenAenderungFehler, gruppenName, gruppenNameFehler } from './gruppen'
import { nachrichtAbgewiesen, umfrageAbgewiesen } from './chatRules'
import { schalteStumm } from './chatMute'
import { einzelAenderung } from './benutzerRegeln'
import { domainErlaubt, domainListe, domainSperre } from './domains'
import { importPlanen, type ImportEingabe } from './userImport'
import { darf, docCheckRolle, kachelZahl, recheckAudit, rechteAudit, rechteSetzen, rollenAudit, type RecheckEintrag } from './modules/doccheck/access'
import { einstellungen as docCheckEinstellungen } from './modules/doccheck/settings'
import { faelligeErinnerungen, offeneEmpfehlungen, SANDBOX_DOKUMENTE, SANDBOX_EMPFEHLUNGEN } from './modules/doccheck/library'
import type { DocCheckAuditEintrag, DocCheckFlags, DocCheckRolle, DocCheckSettings, DocCheckState } from './modules/doccheck/types'
import { overrideSetzen, type LogbookManuell, type LogbookOverride, type LogbookStand } from './logbook'
import { RETENTION_MS, type AppState, type Attachment, type ConfigurableRole, type GradingRecord, type GradingSettings, type Group, type LessonPlan, type ModuleKey, type Note, type PermKey, type PollType, type RetentionKey, type Role, type SeenState, type Settings, type User } from './types'
import { clearPersistedState, ladeStand, persistState, readPreloadedState, storageReadFailed, subscribeToOtherTabs } from './persist'
import { hasUnsavedWork } from './editGuard'
import { sitzungsSchritt, type SitzungsSchritt } from './sitzungsablauf'
import { naechsteZeitgrenze } from './zeitTakt'
import { basisWaehlen, kopfAus, kopfLesen, standNachricht, standZusammenfuehren, type Stammstand } from './zusammenfuehren'
import type { FeedbackEntry, InfoEntry } from './types'

const EMPTY_SEEN: SeenState = { chat: {}, info: 0, contacts: 0 }

let idCounter = 0
const uid = (prefix: string) => `${prefix}-${Date.now()}-${idCounter++}`

export interface Store {
  state: AppState
  now: () => number
  currentUser: User | null
  effectiveRetention: (group: Group) => RetentionKey
  visibleMessages: (groupId: string) => AppState['messages']
  visiblePolls: (groupId: string) => AppState['polls']
  /** Gruppen des aktuellen Nutzers, alphabetisch sortiert */
  myGroups: Group[]
  /** Gruppen des aktuellen Nutzers mit ungesehenen Nachrichten/Umfragen */
  unreadGroups: Set<string>
  hasNewInfo: boolean
  hasNewContacts: boolean
  markChatSeen: (groupId: string) => void
  markInfoSeen: () => void
  markContactsSeen: () => void
  login: (identifier: string) => boolean
  logout: () => void
  /** Sitzung abgelaufen, aber Arbeit offen — Warnstreifen statt Abmeldung
   *  (sitzungsablauf.ts). Abgemeldet wird, sobald die Arbeit gesichert oder
   *  verworfen ist, spaetestens nach der Nachfrist. */
  sessionExpired: boolean
  /** Wartet, bis der aktuelle Stand geschrieben ist: `true` gesichert,
   *  `false` gescheitert. Grundlage der Quittungen (quittung.ts,
   *  R3-SPEICHERQUITTUNG) — gruen erst NACH dem Schreiben. */
  gesichert: () => Promise<boolean>
  switchUser: (userId: string) => void
  advanceTime: (ms: number) => void
  resetSandbox: () => void
  /** `false`, wenn die Nachricht abgewiesen wurde (chatRules.ts) — die
   *  Ansicht leert die Eingabe nur bei `true`, sonst war der Text weg
   *  (Audit 11/2026, KERN-08). */
  sendMessage: (groupId: string, text: string, attachment?: Attachment) => boolean
  deleteMessage: (id: string) => void
  /** `false`, wenn die Umfrage abgewiesen wurde — der Dialog bleibt dann offen. */
  createPoll: (groupId: string, question: string, type: PollType, options: string[], validUntil?: number) => boolean
  vote: (pollId: string, optionIndex: number) => void
  closePoll: (pollId: string) => void
  /** Stummschalten fuer den AKTUELLEN Nutzer umschalten (chatMute.ts, KERN-06). */
  toggleMute: (groupId: string) => void
  setGroupRetention: (groupId: string, retention: RetentionKey | null) => void
  /** `false`, wenn die Aenderung abgewiesen wurde (Rechte, Zugang, letzte Gruppe). */
  setGroupMembers: (groupId: string, memberIds: string[]) => boolean
  /** `false`, wenn abgewiesen (Recht, Muster, Gültigkeit) — der Dialog bleibt
   *  dann offen und sagt es (R3-DIALOGMELDUNG). Ebenso die übrigen
   *  Speicheraktionen mit Dialog: saveContact, saveNote, addLessonPlan,
   *  logbookOverride, logbookAddManual, logbookUpdateManual. */
  addInfoEntry: (entry: Omit<InfoEntry, 'id' | 'authorId' | 'createdAt'>) => boolean
  deleteInfoEntry: (id: string) => void
  /** Stern-Markierung des aktuellen Nutzers für einen Info-Eintrag umschalten */
  toggleStarInfo: (id: string) => void
  /** IDs der vom aktuellen Nutzer markierten Info-Einträge */
  starredInfoIds: Set<string>
  /** Lese-Bestätigung des aktuellen Nutzers für einen Info-Eintrag */
  acknowledgeInfo: (id: string) => void
  submitFeedback: (entry: { category: string; recipient: string; urgent: boolean; message: string; attachment?: Attachment; aircraftType?: string }) => void
  deleteFeedback: (id: string) => void
  /** Feedback als bearbeitet markieren (mit optionaler Notiz) bzw. wieder öffnen */
  resolveFeedback: (id: string, note: string) => void
  reopenFeedback: (id: string) => void
  saveContact: (contact: { id?: string; department: string; position: string; name: string; phone: string; email: string }) => boolean
  deleteContact: (id: string) => void
  /** Nutzer anlegen — die Zuweisung zu mindestens einer Gruppe ist Pflicht */
  /** Legt den Nutzer an; `false`, wenn eine Invariante ihn abgewiesen hat.
   *  Der Rueckgabewert ist kein Beiwerk: Der Dialog schloss vorher auch bei
   *  Ablehnung und quittierte einen Nutzer, den es nicht gab. */
  addUser: (user: { name: string; email: string; phone: string; role: Role; groupIds: string[]; aircraftTypes: string[] }) => boolean
  /** Info-Einträge, die der aktuelle Nutzer sehen darf (Gruppen-Sichtbarkeit) */
  visibleInfoEntries: AppState['infoEntries']
  /** Wie viele gueltige Eintraege wartet der aktuelle Nutzer noch zu bestaetigen? */
  openAcks: number
  /** Rueckmeldungen, die der aktuelle Nutzer im Panel sehen darf (Gruppe UND Muster). */
  visibleFeedback: FeedbackEntry[]
  updateUser: (id: string, patch: Partial<User>) => void
  /** `false`, wenn die Gruppe nicht angelegt wurde (Rechte, Name leer oder vergeben). */
  addGroup: (name: string, purpose: string, aircraftType?: string) => boolean
  setGroupAircraft: (id: string, aircraftType: string) => void
  renameGroup: (id: string, name: string) => void
  deleteGroup: (id: string) => void
  /** Mitglieder, die durch das Löschen ohne Gruppe zurückblieben — leer =
   *  die Gruppe darf gelöscht werden. */
  groupDeleteBlockers: (id: string) => User[]
  setGroupAdmins: (id: string, adminIds: string[]) => void
  updateSettings: (patch: Partial<AppState['settings']>) => void
  /** Formulare, die der aktuelle Nutzer sehen darf (eigene; Admins alle) */
  visibleGradingRecords: GradingRecord[]
  /** Einzelnes Formular per ID — nur wenn der aktuelle Nutzer es sehen darf.
   *  Die Listenfilter allein schützen nicht: IDs stehen in der URL. */
  gradingRecordById: (id: string) => GradingRecord | undefined
  saveGradingRecord: (record: GradingRecord) => void
  /** entfernt ein Formular nur aus der Instruktor-Ansicht — Admin behält es */
  hideGradingRecord: (id: string) => void
  /** Für alle wieder einblenden — nur mit grading_view_all */
  unhideGradingRecord: (id: string) => void
  /** löscht ein Formular endgültig (Training Admin / Superadmin) */
  deleteGradingRecord: (id: string) => void
  retryGradingMail: (id: string) => void
  /** Ausgangskorb leeren: alle ohne Netz erfassten Formulare versenden */
  /** Ausgangskorb senden; liefert, ob der Origin tatsächlich erreichbar war */
  flushOutbox: () => Promise<boolean>
  updateGrading: (patch: Partial<GradingSettings>) => void
  /** Formulartyp aus dem Katalog nehmen; liefert den Ausgang samt Grund
   *  (gradingRules.formularTypEntfernen, R3-FORMULARTYP). */
  removeFormType: (id: string) => FormularTypLoeschung
  /** Lesson Plans, die der aktuelle Nutzer sehen darf */
  visibleLessonPlans: LessonPlan[]
  /** Nutzer aus einer Tabelle anlegen, jeweils in die gewaehlten Gruppen,
   *  die sie betreten koennen. Liefert die Anzahl der angelegten. */
  importUsers: (rows: ImportEingabe[], groupIds: string[]) => number
  /** Eigene Notizen — fremde sind in dieser Liste gar nicht erst enthalten. */
  visibleNotes: Note[]
  /** Anlegen ODER aendern: ohne `id` entsteht eine neue Notiz. */
  saveNote: (n: { id?: string; title: string; body: string }) => boolean
  deleteNote: (id: string) => void
  /** my AAA Logbook: Korrektur an einem abgeleiteten Eintrag des EIGENEN
   *  Logbuchs. `null` setzt die Korrektur zurueck auf die Ableitung. Sie
   *  gilt für den ganzen Durchgang (`blattIds`, src/logbook.ts
   *  `overrideSetzen`). */
  logbookOverride: (eintrag: { id: string; blattIds?: string[] }, ov: LogbookOverride | null) => boolean
  logbookAddManual: (e: Omit<LogbookManuell, 'id'>) => boolean
  logbookUpdateManual: (id: string, patch: Partial<Omit<LogbookManuell, 'id'>>) => boolean
  logbookDeleteManual: (id: string) => void
  toggleNotePin: (id: string) => void
  addLessonPlan: (plan: { title: string; description: string; aircraftType: string; category: string; fileName: string }) => boolean
  deleteLessonPlan: (id: string) => void
  /** Rechte-Matrix: darf der aktuelle Nutzer diese Fähigkeit nutzen? */
  can: (key: PermKey) => boolean
  /** Darf der aktuelle Nutzer dieses Modul betreten? (Kachel und Route) */
  moduleAllowed: (module: ModuleKey) => boolean
  setPermission: (role: ConfigurableRole, key: PermKey, value: boolean) => void
  /** Code-Login: Code an die E-Mail „senden“ bzw. prüfen */
  requestLoginCode: (email: string) => boolean
  verifyLoginCode: (code: string) => boolean
  /** DocCheck-Rolle des aktuellen Nutzers — abgeleitet, nie gespeichert. */
  docCheckRolle: DocCheckRolle
  /** Gespeicherte DocCheck-Einstellungen, ergänzt um die Vorgaben. */
  docCheckSettings: DocCheckSettings
  /** Zahl auf der DocCheck-Kachel (Spez. DocCheck 3.2). */
  docCheckBadge: number
  /** DocCheck-Rechte vergeben — nur Superadmin, jede Änderung protokolliert. */
  setDocCheckRights: (userId: string, wunsch: DocCheckFlags) => void
  /** DocCheck-Einstellungen ändern — nur Superadmin, protokolliert. */
  updateDocCheckSettings: (patch: Partial<DocCheckSettings>) => void
  /** Revisionserinnerung „Stand bestätigt" — DocCheck-Admin oder Superadmin. */
  docCheckConfirmRevision: (docId: string) => void
  /** Re-Check-Vorschläge bestätigt (Nachtrag N3/N11) — eine Audit-Zeile je
   *  Bestätigung, mit Listennummern und Status, ohne Befundtext. */
  docCheckRecheckConfirm: (liste: string, eintraege: RecheckEintrag[]) => void
}

const DC_LEER: DocCheckState = { audit: [], bestaetigt: {} }

const StoreCtx = createContext<Store | null>(null)

const USER_KEY = 'aaa-user'
const SESSION_EXP_KEY = 'aaa-session-exp'
/** Bei jeder Änderung an der Form von AppState hochzählen — ein alter
 *  gespeicherter Stand wird dann verworfen statt halb geladen. */
const STATE_VERSION = 2

/** Gespeicherten Anwendungszustand lesen (aus IndexedDB vorgeladen, siehe
 *  persist.ts). Ein unlesbarer oder veralteter Stand wird beiseitegelegt
 *  (ladeStand), die App startet dann auf den Seed-Daten. */
function loadPersistedState(): AppState | null {
  return ladeStand(readPreloadedState(), STATE_VERSION)
}

/** Sitzungen gelten bis Mitternacht (lokal) — außer man meldet sich ab. */
function endOfDay(): number {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** Angemeldet bleiben bis Mitternacht: gespeicherte Anmeldung wiederherstellen,
 *  solange der Nutzer existiert, aktiv ist und die Sitzung nicht abgelaufen ist. */
function initialState(): AppState {
  // Ein unterschriebenes Formular darf ein Neuladen (auch das automatische
  // nach einem App-Update) überstehen — der gesamte Zustand wird deshalb
  // gespeichert und beim Start wiederhergestellt.
  const base = migrateState(loadPersistedState() ?? createSeedState())
  try {
    const savedId = localStorage.getItem(USER_KEY)
    const exp = Number(localStorage.getItem(SESSION_EXP_KEY) ?? 0)
    if (savedId && exp > Date.now() && base.users.some((u) => u.id === savedId && u.active)) {
      return { ...base, currentUserId: savedId }
    }
    if (savedId) {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(SESSION_EXP_KEY)
    }
  } catch {
    /* ohne localStorage startet die App abgemeldet */
  }
  // Ohne gültige Sitzung wird der Inhalt behalten, aber abgemeldet gestartet.
  return { ...base, currentUserId: null }
}


function persistUser(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(USER_KEY, id)
      localStorage.setItem(SESSION_EXP_KEY, String(endOfDay()))
    } else {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(SESSION_EXP_KEY)
    }
  } catch {
    /* Anmeldung gilt dann nur für diese Sitzung */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState)
  // Für asynchrone Aktionen (Erreichbarkeitsprobe): immer der aktuelle Stand
  const stateRef = useRef(state)
  stateRef.current = state
  /** Laufende Ausgangskorb-Probe — verhindert mehrere gleichzeitig. */
  const flushRef = useRef<Promise<boolean> | null>(null)
  /**
   * Zaehler echter Aenderungen. Nur er loest das Sichern aus.
   *
   * Vorher hing der Sicherungs-Effekt am gesamten Zustand — und der
   * 5-Sekunden-Takt erzeugte alle fuenf Sekunden eine neue Referenz.
   * Die Folge war eine vollstaendige Serialisierung des Bestands samt
   * Unterschriftsbildern (gemessen bis 14 MB) alle fuenf Sekunden, nur um
   * per Volltextvergleich festzustellen, dass sich nichts geaendert hat —
   * mitten in eine laufende Unterschriftsgeste hinein. (Der Takt erzeugt
   * inzwischen gar keine neue Referenz mehr, TEC-10; der Zaehler bleibt die
   * Regel: gesichert wird, was sich geaendert HAT.)
   */
  const [rev, setRev] = useState(0)
  /**
   * Zeitpunkt der letzten EIGENEN Aenderung, als `at` im gesicherten Stand.
   * Beim Tab-Abgleich entscheidet er nichts mehr (TEC-13: zusammengefuehrt
   * statt verworfen) — ein waehrend eines Updates noch offener Tab der
   * Vorversion liest ihn aber weiterhin.
   */
  const lastChangeAt = useRef(0)

  /** Sitzung abgelaufen, aber Arbeit offen: Warnstreifen statt Abmeldung (TEC-04). */
  const [sessionExpired, setSessionExpired] = useState(false)

  /*
   * Zeitstand: zaehlt hoch, sobald die Zeit etwas am Bestand aendert — eine
   * Nachricht laeuft ab, eine Umfrage schliesst, der Tag wechselt
   * (naechsteZeitgrenze). Die zeitabhaengigen Sichten unten haengen daran.
   *
   * Vorher erledigte das der 5-Sekunden-Takt nebenbei: Er gab bei JEDEM
   * Schlag `{ ...s }` zurueck, der ganze Kontext bekam eine neue Referenz,
   * und jede Ansicht zeichnete neu — im Chat mit einem Jahr Nachrichten ein
   * Long Task von bis zu 270 ms alle fuenf Sekunden, mitten ins Tippen
   * (Audit 11/2026, TEC-10). Jetzt wird genau dann neu gerechnet, wenn sich
   * durch Zeitablauf etwas aendert, und sonst nie. Neue Nachrichten anderer
   * Tabs kommen ohnehin ueber den Tab-Abgleich (setState), in der
   * Produktivversion ueber eine Realtime-Subscription.
   */
  const [zeitStand, setZeitStand] = useState(0)
  useEffect(() => {
    const jetzt = Date.now() + state.timeOffsetMs
    const grenze = naechsteZeitgrenze(
      { messages: state.messages, polls: state.polls, groups: state.groups, defaultRetention: state.settings.defaultRetention },
      jetzt,
    )
    // +1 ms: Die Sichten pruefen „jetzt − createdAt < Frist" — genau AUF
    // der Grenze ist die Nachricht schon weg, eine Millisekunde davor nicht.
    const tm = setTimeout(() => setZeitStand((z) => z + 1), grenze - jetzt + 1)
    return () => clearTimeout(tm)
  }, [state.messages, state.polls, state.groups, state.settings.defaultRetention, state.timeOffsetMs, zeitStand])

  // Sitzungspruefung alle 5 Sekunden (Ablauf um Mitternacht, Deaktivierung,
  // Abmelden in einem anderen Tab). Sie aendert den Zustand NUR, wenn sie
  // abmeldet — sonst bleibt die Referenz, und niemand zeichnet neu (TEC-10).
  useEffect(() => {
    const iv = setInterval(() => {
      /*
       * Im selben Takt: Gilt die Anmeldung ueberhaupt noch?
       *
       * Ablauf der Sitzung und der Aktiv-Status wurden bisher NUR beim Start
       * geprueft. Zwei Folgen: Eine offene App blieb ueber Mitternacht hinaus
       * angemeldet, und wer im Admin-Panel (auch in einem anderen Tab)
       * deaktiviert wurde, arbeitete unbegrenzt weiter — bis er zufaellig
       * neu lud. Beides ist eine Zusage der Anmeldung, keine Kosmetik.
       *
       * Die Entscheidung trifft `sitzungsSchritt` (Audit 11/2026, TEC-04):
       * Mit offener Arbeit wird beim Ablauf erst gewarnt — vorher warf der
       * Takt um Mitternacht mitten aus einem Formular, und die geleisteten
       * Unterschriften waren weg. Entschieden wird VOR dem Zustandswechsel,
       * aus dem aktuellen Stand: hasUnsavedWork() fragt das DOM, und das
       * gehoert nicht in eine Aktualisierungsfunktion von React.
       */
      const s = stateRef.current
      const angemeldet = s.currentUserId
      let schritt: SitzungsSchritt = 'bleiben'
      let gesperrt = false
      if (angemeldet) {
        let ablauf = Infinity
        try {
          ablauf = Number(localStorage.getItem(SESSION_EXP_KEY) ?? 0)
        } catch {
          /* ohne localStorage bleibt es bei der Sitzung dieses Tabs */
        }
        gesperrt = !s.users.some((u) => u.id === angemeldet && u.active)
        schritt = sitzungsSchritt({ ablauf, jetzt: Date.now(), gesperrt, offeneArbeit: hasUnsavedWork() })
      }
      // Gleicher Wert → React zeichnet nicht neu.
      setSessionExpired(schritt === 'warnen')
      if (schritt !== 'abmelden') return
      // Beim Ablauf bleibt der (abgelaufene) Eintrag stehen: Ihn zu loeschen
      // hiesse fuer einen zweiten Tab „ausdruecklich abgemeldet" — und der
      // wuerde dort ein offenes Formular trotz Nachfrist schliessen. Beim
      // naechsten Start raeumt initialState ihn ohnehin weg.
      if (gesperrt) persistUser(null)
      setState((st) => (st.currentUserId === angemeldet ? { ...st, currentUserId: null } : st))
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  /*
   * Jedes Abmelden verwirft die DocCheck-Sitzung (Spez. DocCheck 5.4,
   * CLAUDE.md „Abmelden sendet ic-abmelden").
   *
   * Das Ereignis kam nur aus logout() — Sitzungsablauf, Deaktivierung und das
   * Abmelden in einem anderen Tab liessen Dokumente im Speicher und den
   * Worker am Leben (Audit 11/2026, TEC-14). Jetzt haengt es am Uebergang
   * selbst: angemeldet → abgemeldet, egal auf welchem Weg, genau einmal.
   */
  const zuletztAngemeldet = useRef(state.currentUserId)
  useEffect(() => {
    const vorher = zuletztAngemeldet.current
    zuletztAngemeldet.current = state.currentUserId
    // Ein Ereignis statt eines Imports: Der Store soll das nachgeladene
    // Modul nicht mitziehen.
    if (vorher && !state.currentUserId) window.dispatchEvent(new Event('ic-abmelden'))
  }, [state.currentUserId])

  /*
   * Abstammung fuer den Tab-Abgleich (Audit 11/2026, TEC-13, siehe
   * basisWaehlen in zusammenfuehren.ts): Jeder ausgerufene Stand nennt
   * seinen Tab, seine id und je Tab den zuletzt uebernommenen Stand.
   */
  const tabId = useRef(`tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).current
  /** Der Stand, mit dem dieser Tab begann — Basis, solange er keine bessere kennt. */
  const startStand = useRef(state)
  /** Je Tab die id des zuletzt uebernommenen Stands. Beim Start: was der
   *  geladene Stand von sich sagt — ein frisch geladener Tab baut darauf auf. */
  const uebernommen = useRef<Record<string, string> | null>(null)
  if (uebernommen.current === null) {
    const kopf = kopfLesen(readPreloadedState())
    uebernommen.current = { ...kopf.basen, ...(kopf.von && kopf.id ? { [kopf.von]: kopf.id } : {}) }
  }
  /** Die zuletzt selbst geschriebenen Staende (Basis-Kandidaten). */
  const geschrieben = useRef(new Map<string, Stammstand<AppState>>())
  /** Je Absender-Tab sein zuletzt empfangener Stand (Basis-Kandidat). */
  const vorherVon = useRef(new Map<string, Stammstand<AppState>>())

  // Zustand sichern — nur, wenn sich der serialisierte Stand tatsächlich
  // geändert hat (ein Tab-Abgleich etwa bringt denselben Stand zurück).
  const lastPersisted = useRef<string>('')
  /** Der Schreibvorgang für `lastPersisted` — wer auf denselben Stand
   *  wartet, bekommt dessen Ausgang statt eines zweiten Schreibens. */
  const letzterVorgang = useRef<Promise<boolean>>(Promise.resolve(true))
  const schreiben = useCallback((): Promise<boolean> => {
    const stand = stateRef.current
    const kern = JSON.stringify(stand)
    if (kern === lastPersisted.current) return letzterVorgang.current
    lastPersisted.current = kern
    const id = uid('stand')
    const basen = { ...uebernommen.current }
    geschrieben.current.set(id, { stand, basen })
    // Die juengsten acht genuegen: Ein anderer Tab baut auf einem der
    // letzten auf, sonst faellt die Wahl auf seinen vorigen Stand zurueck.
    if (geschrieben.current.size > 8) geschrieben.current.delete(geschrieben.current.keys().next().value!)
    const vorgang = persistState(standNachricht(STATE_VERSION, lastChangeAt.current, { von: tabId, id, basen }, kern)).then((ok) => {
      // Fehlgeschlagen (Ablage voll, Speicherfehler): Merker zuruecksetzen,
      // damit der naechste Lauf es erneut versucht. Vorher galt der Stand
      // als gesichert, lag aber nirgends — und niemand versuchte es wieder.
      if (!ok) {
        lastPersisted.current = ''
        geschrieben.current.delete(id)
      }
      return ok
    })
    letzterVorgang.current = vorgang
    return vorgang
  }, [tabId])
  /*
   * „Ist das eben Getane gespeichert?" — fuer Quittungen (quittung.ts).
   *
   * Der gruene Streifen kam sofort nach dem Klick, das Schreiben 400 ms
   * spaeter und konnte scheitern: „Gespeichert" stand dann neben dem roten
   * Speicherstreifen (Audit 11/2026, R3-SPEICHERQUITTUNG, TEC-12 Teil 2).
   * Geschrieben wird hier SOFORT statt nach dem Zeitgeber, damit die
   * Quittung nicht spuerbar wartet — aber erst nach dem naechsten Zeichnen:
   * Die Aktion davor hat nur `setState` gerufen, `stateRef` zeigt den neuen
   * Stand erst danach. Ein eigener Anstoss (`setAnstoss`) reiht sich HINTER
   * die Aenderung der Aktion; der Effekt laeuft also auf ihrem Stand — auch
   * nach einem `await` (Absenden des Formulars), wo ein blosser Zeitgeber
   * dem Zeichnen zuvorkommen koennte. Ist nichts Neues zu schreiben, zaehlt
   * der Ausgang des letzten Schreibens.
   */
  const [anstoss, setAnstoss] = useState(0)
  const wartende = useRef<((ok: boolean) => void)[]>([])
  useEffect(() => {
    if (wartende.current.length === 0) return
    const jetzt = wartende.current.splice(0)
    void schreiben().then((ok) => jetzt.forEach((fertig) => fertig(ok)))
  }, [anstoss, schreiben])
  const gesichert = useCallback(
    (): Promise<boolean> =>
      new Promise((resolve) => {
        wartende.current.push(resolve)
        setAnstoss((a) => a + 1)
      }),
    [],
  )
  useEffect(() => {
    const tm = setTimeout(() => void schreiben(), 400)
    return () => clearTimeout(tm)
  }, [rev, schreiben])

  /*
   * Vor dem Verschwinden der Seite sofort schreiben.
   *
   * Zwischen Eingabe und Sicherung liegen 400 ms. Auf dem iPad ist
   * „unterschreiben, Home-Taste" der Normalfall — iOS verwirft die Seite
   * danach, und die Aenderung lag noch im Zeitgeber. `pagehide` und
   * `visibilitychange` sind die einzigen Ereignisse, auf die dort Verlass
   * ist; `beforeunload` feuert am iPhone nicht.
   */
  useEffect(() => {
    const sofort = () => void schreiben()
    const beiVerdeckt = () => document.visibilityState === 'hidden' && void schreiben()
    window.addEventListener('pagehide', sofort)
    document.addEventListener('visibilitychange', beiVerdeckt)
    return () => {
      window.removeEventListener('pagehide', sofort)
      document.removeEventListener('visibilitychange', beiVerdeckt)
    }
  }, [schreiben])

  // Mehrere offene Tabs: Jeder hielt eine eigene vollständige Kopie, und wer
  // im zweiten Tab etwas tat, schrieb dessen älteren Stand über den ersten —
  // ein dort gerade unterschriebenes Formular war damit weg. Jetzt übernimmt
  // jeder Tab den Stand, den ein anderer gesichert hat.
  //
  // Die Anmeldung bleibt dabei tab-eigen (sie steht in localStorage, nicht im
  // Zustand): Wer in der Sandbox in zwei Tabs verschiedene Rollen ansieht,
  // wird nicht aus seiner Rolle geworfen.
  useEffect(
    () =>
      subscribeToOtherTabs((raw) => {
        try {
          const parsed = JSON.parse(raw) as { v?: number; state?: AppState }
          if (parsed.v !== STATE_VERSION || !parsed.state?.users?.length) return
          const fremd = parsed.state
          const kopf = kopfAus(parsed as Record<string, unknown>)
          const basis = basisWaehlen(tabId, kopf.basen, geschrieben.current, kopf.von ? vorherVon.current.get(kopf.von) : undefined, startStand.current)
          if (kopf.von) {
            vorherVon.current.set(kopf.von, { stand: fremd, basen: kopf.basen })
            if (kopf.id) uebernommen.current = { ...uebernommen.current, [kopf.von]: kopf.id }
          }
          /*
           * Zusammenführen statt ersetzen (Audit 11/2026, TEC-13).
           *
           * Erst ersetzte der Empfänger seinen ganzen Stand — eine eigene
           * Änderung, deren Sicherung noch im 400-ms-Zeitgeber stand, war
           * weg. Dann wurde ein fremder Stand verworfen, wenn er älter war
           * als die eigene letzte Änderung — damit verschwand die Änderung
           * des ANDEREN Tabs: Er übernahm kurz darauf den Stand dieses Tabs,
           * in dem sie fehlte. Jetzt bleiben beide (standZusammenfuehren),
           * und wer Eigenes beizutragen hat, schreibt den gemeinsamen Stand.
           */
          setState((s) => {
            const { stand, mitEigenem } = standZusammenfuehren(basis, s, fremd, ['currentUserId', 'timeOffsetMs'])
            if (mitEigenem) {
              // Wie bei einer eigenen Änderung: Sonst läge im Speicher der
              // fremde Stand ohne sie, und ein Neuladen verlöre sie doch.
              lastChangeAt.current = Date.now()
              setRev((r) => r + 1)
            }
            return stand
          })
        } catch {
          /* unlesbare Nachricht eines anderen Tabs wird ignoriert */
        }
      }),
    [],
  )

  const now = useCallback(() => Date.now() + state.timeOffsetMs, [state.timeOffsetMs])

  const currentUser = state.users.find((u) => u.id === state.currentUserId) ?? null

  const effectiveRetention = useCallback(
    (group: Group): RetentionKey => group.retention ?? state.settings.defaultRetention,
    [state.settings.defaultRetention],
  )

  // Aufbewahrungslogik: Nachricht + Anhang verschwinden gemeinsam nach Ablauf.
  const visibleMessages = useCallback(
    (groupId: string) => {
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return []
      const ttl = RETENTION_MS[effectiveRetention(group)]
      return state.messages
        .filter((m) => m.groupId === groupId && now() - m.createdAt < ttl)
        .sort((a, b) => a.createdAt - b.createdAt)
    },
    // zeitStand: neu rechnen, sobald eine Nachricht ablaeuft (TEC-10)
    [state, effectiveRetention, now, zeitStand],
  )

  const visiblePolls = useCallback(
    (groupId: string) => {
      const group = state.groups.find((g) => g.id === groupId)
      if (!group) return []
      const ttl = RETENTION_MS[effectiveRetention(group)]
      return state.polls
        .filter((p) => p.groupId === groupId && now() - p.createdAt < ttl)
        .sort((a, b) => a.createdAt - b.createdAt)
    },
    [state, effectiveRetention, now, zeitStand],
  )

  const myGroups = useMemo(
    () =>
      state.currentUserId
        ? state.groups
            .filter((g) => g.memberIds.includes(state.currentUserId!))
            // Mitgliedschaft allein reicht nicht mehr: Eine Gruppe mit Muster
            // erscheint nur bei denen, die dieses Muster fuehren. Gruppen ohne
            // Muster sind musteruebergreifend gemeint und bleiben fuer alle.
            .filter((g) => sichtbarFuer(currentUser, g.aircraftType))
            // nach Muster gruppiert, musterübergreifende Gruppen zuletzt
            .sort(
              (a, b) =>
                (a.aircraftType || 'zzz').localeCompare(b.aircraftType || 'zzz') || a.name.localeCompare(b.name),
            )
        : [],
    // currentUser gehoert in die Liste: Aendert ein Admin die Musterzuordnung,
    // muss die Chatliste sofort folgen — sonst zeigte sie bis zum naechsten
    // Neuladen Gruppen, fuer die niemand mehr zustaendig ist.
    [state.groups, state.currentUserId, currentUser],
  )

  /** Jüngster fremder Inhalt einer Gruppe — Referenzzeitpunkt für „gesehen“. */
  const latestForeignContent = useCallback(
    (groupId: string) => {
      const items = [
        ...visibleMessages(groupId).filter((m) => m.authorId !== state.currentUserId),
        ...visiblePolls(groupId).filter((p) => p.authorId !== state.currentUserId),
      ]
      return items.reduce((max, item) => Math.max(max, item.createdAt), 0)
    },
    [visibleMessages, visiblePolls, state.currentUserId],
  )

  const seenOfCurrent = (state.currentUserId && state.seen[state.currentUserId]) || EMPTY_SEEN

  const unreadGroups = useMemo(
    () => new Set(myGroups.filter((g) => latestForeignContent(g.id) > (seenOfCurrent.chat[g.id] ?? 0)).map((g) => g.id)),
    [myGroups, latestForeignContent, seenOfCurrent],
  )

  // Gruppen-Sichtbarkeit: Einträge ohne Gruppen sieht jeder; mit Gruppen nur
  // deren Mitglieder. Admins/Superadmin sehen alles (Pflege + Kontrolle).
  /* Zwei Bedingungen, die verschiedene Fragen beantworten: die Gruppe sagt
     WER gemeint ist, das Muster WOFUER der Eintrag gilt. Ein Eintrag ohne
     Musterangabe betrifft alle — das ist eine Aussage, kein fehlender Wert.
     Der Musterbereich gilt auch fuer Verwalter; nur die Veroeffentlichungs-
     frist bleibt ihnen erlassen, sonst koennten sie einen geplanten Eintrag
     nicht mehr sehen, den sie selbst angelegt haben. */
  const visibleInfoEntries = useMemo(() => {
    if (!currentUser) return []
    const darfVerwalten = userHasPerm(state.settings, currentUser, 'info_manage')
    return state.infoEntries.filter(
      (e) =>
        sichtbarFuer(currentUser, e.aircraftType) &&
        (darfVerwalten || (infoEntryAppliesTo(e, currentUser.id, state.groups) && infoIsPublished(e, now()))),
    )
    // zeitStand: ein geplanter Eintrag erscheint um Mitternacht seines
    // validFrom — vorher erst bei der naechsten zufaelligen Aenderung.
  }, [state.infoEntries, state.groups, state.settings, currentUser, now, zeitStand])

  /*
   * Rueckmeldungen, die diese Person im Panel sehen darf.
   *
   * Zwei Schranken, beide notwendig: die Gruppe (ein Gruppenadmin sieht nur
   * seine Leute) und das Muster (Feedback traegt einen Aircraft Type und
   * folgt seit 1.6.1 derselben Regel wie Lesson Plans, Info und Chats).
   *
   * Sie stehen hier und nicht in der Ansicht, weil die Statuszeile dieselbe
   * Zahl braucht: Sie meldet „N Rueckmeldungen offen" und springt in die
   * Liste. Rechnete sie mit dem ganzen Bestand, versprach sie einem
   * Gruppenadmin mehr, als hinter dem Sprung steht — derselbe Fehler, den
   * die Statuszeile beim Training Admin schon einmal hatte.
   */
  // Die Rechnung steht in storeRechte.ts (feedbackFuer): Dieselbe Antwort
  // gilt fuer das Erledigen und Loeschen — sonst erledigt jemand per
  // Kennung, was er gar nicht sieht (KERN-19).
  const visibleFeedback = useMemo(
    () => feedbackFuer(currentUser, state.feedbackEntries, state.groups),
    [state.feedbackEntries, state.groups, currentUser],
  )

  /* Nur VEROEFFENTLICHTE fremde Eintraege zaehlen (infoAcks.ts). Verwalter
     sehen in `visibleInfoEntries` auch Geplantes; dessen Veroeffentlichung
     liegt in der Zukunft, und markInfoSeen schrieb diesen Zeitpunkt als
     „gesehen" — bis zum Startdatum blieb jede Neu-Marke aus, auch fuer
     sofort gueltige Eintraege (Audit 11/2026, KERN-11). */
  const latestForeignInfo = neuesteFremdeVeroeffentlichung(visibleInfoEntries, state.currentUserId, now())
  const hasNewInfo = !!state.currentUserId && latestForeignInfo > infoGesehenBis(seenOfCurrent.info, now())
  /**
   * Offene Lese-Bestaetigungen des aktuellen Nutzers.
   *
   * Der „Neu"-Punkt auf der Info-Kachel haengt an GESEHEN und verschwand
   * deshalb drei Sekunden nach dem ersten Oeffnen — ausgerechnet die einzige
   * Pflicht des Moduls war danach unsichtbar. Diese Zahl haengt an
   * BESTAETIGT und bleibt stehen, bis sie erledigt ist.
   */
  const openAcks = useMemo(() => {
    if (!state.currentUserId) return 0
    const jetzt = now()
    return visibleInfoEntries.filter(
      (e) =>
        e.requiresAck &&
        infoIsPublished(e, jetzt) &&
        !infoIsExpired(e, jetzt) &&
        infoEntryAppliesTo(e, state.currentUserId!, state.groups) &&
        !state.infoAcks[e.id]?.[state.currentUserId!],
    ).length
  }, [visibleInfoEntries, state.infoAcks, state.currentUserId, state.groups, now, zeitStand])
  const hasNewContacts = !!state.currentUserId && state.contactsChangedAt > seenOfCurrent.contacts

  // Instruktoren sehen ihre eigenen Formulare eine Woche lang, Admins alles
  // unbegrenzt. Jede/r kann Formulare aus der EIGENEN Listenansicht
  // entfernen (hiddenFor je Nutzer) — im Admin-Panel bleibt alles erhalten
  // und für andere Nutzer ändert sich nichts. Neueste immer zuoberst.
  const visibleGradingRecords = useMemo(() => {
    if (!currentUser) return []
    const all = [...state.gradingRecords]
      .sort(gradingListComparator(state.gradingRecords))
      .filter((r) => !r.hiddenFor?.includes(currentUser.id))
    if (userHasPerm(state.settings, currentUser, 'grading_view_all')) return all
    // Die Wochenfrist gilt nur für erledigte Vorgänge. Was noch auf eine
    // Unterschrift, ein Pflicht-Folgeformular oder den Versand wartet, bleibt
    // beim Instruktor stehen — sonst verliert er sein eigenes unfertiges
    // Dokument aus den Augen.
    //
    // Und sie läuft ab dem ERLEDIGEN, nicht ab dem Anlegen: Vorher galt
    // createdAt — wer ein acht Tage altes Blatt fertig unterschrieb, sah es
    // im selben Augenblick aus der Liste verschwinden, samt PDF-Knopf.
    // Erledigt wird ein Blatt auch durch die Unterschrift eines
    // Folgeformulars der Familie, deshalb zählt die jüngste Unterschrift
    // der ganzen Familie.
    const weekMs = 7 * 24 * 3600_000
    const doneAt = (r: GradingRecord): number => {
      const family = new Set([r.id, ...(r.batchId ? state.gradingRecords.filter((x) => x.batchId === r.batchId).map((x) => x.id) : [])])
      const kids = state.gradingRecords.filter((c) => c.parentId !== undefined && family.has(c.parentId))
      return Math.max(r.signedAt ?? r.createdAt, ...kids.map((c) => c.signedAt ?? c.createdAt))
    }
    return all.filter(
      (r) =>
        r.instructorId === currentUser.id &&
        (!isComplete(r, state.gradingRecords) || now() - doneAt(r) < weekMs),
    )
    // zeitStand: Die Wochenfrist wird mindestens beim Tageswechsel neu
    // geprueft (TEC-10) — vorher gar nicht, solange sich nichts aenderte.
  }, [state.gradingRecords, state.settings, currentUser, now, zeitStand])

  // Instruktoren sehen nur Lesson Plans ihrer zugewiesenen Muster;
  // Admins und Superadmin sehen alle.
  /* Musterbezogen fuer Mitglied und Admin, nicht fuer Superadmin und
     Training Admin — welche Rolle die Schranke traegt, entscheidet
     src/aircraftScope.ts und nicht diese Ansicht. */
  const visibleLessonPlans = useMemo(() => {
    if (!currentUser) return []
    const all = [...state.lessonPlans].sort((a, b) => a.title.localeCompare(b.title))
    return nachMuster(currentUser, all, (p) => p.aircraftType)
  }, [state.lessonPlans, currentUser])

  /**
   * Notizen sind persoenlich: Die Sicht enthaelt ausschliesslich die eigenen.
   * Nicht ausgeblendet, sondern gar nicht erst gereicht — auch der Superadmin
   * bekommt hier nur seine eigenen. Eine Notiz, die mitgelesen wird, waere
   * keine, und niemand wuerde mehr offen etwas hineinschreiben.
   */
  const visibleNotes = useMemo(
    () => (currentUser ? (state.notes ?? []).filter((n) => n.authorId === currentUser.id) : []),
    [state.notes, currentUser],
  )

  const store = useMemo<Store>(() => {
    // patch: fn liefert die Änderung oder null für „nichts zu tun“ — dann
    // bleibt die State-Referenz identisch und React rendert nicht neu.
    // Das macht die mark*-Funktionen idempotent und effekt-sicher.
    const patch = (fn: (s: AppState) => Partial<AppState> | null) =>
      setState((s) => {
        const p = fn(s)
        if (!p) return s
        // Echte Aenderung: Sicherung anstossen und den Zeitpunkt merken.
        lastChangeAt.current = Date.now()
        setRev((r) => r + 1)
        return { ...s, ...p }
      })

    /**
     * Aendern und sagen, ob es gewirkt hat. Gefragt wird dieselbe Funktion
     * auf dem zuletzt gezeichneten Stand — wie bei addUser, nicht ueber eine
     * Variable, die der Updater setzt (React ruft ihn nicht zwingend sofort).
     * Vorher gaben die Speicheraktionen der Dialoge nichts zurueck: Ein
     * abgewiesener Eintrag schloss den Dialog und quittierte „gespeichert"
     * (Audit 11/2026, R3-DIALOGMELDUNG).
     */
    const patchMitAntwort = (fn: (s: AppState) => Partial<AppState> | null): boolean => {
      const ok = fn(stateRef.current) !== null
      patch(fn)
      return ok
    }

    const seenOf = (s: AppState) => (s.currentUserId && s.seen[s.currentUserId]) || EMPTY_SEEN

    /** Der Handelnde im Moment der Änderung — Rechte werden an der Aktion
     *  geprüft, nicht nur beim Rendern der Oberfläche. */
    const actorOf = (s: AppState) => s.users.find((u) => u.id === s.currentUserId) ?? null
    const isSuper = (s: AppState) => actorOf(s)?.role === 'superadmin'
    /** Darf der Handelnde diese Gruppe verwalten? Superadmin überall,
     *  Gruppenadmin nur dort, wo er als Admin eingetragen ist. */
    const maySeeGroup = (s: AppState, groupId: string) => {
      const actor = actorOf(s)
      if (!actor) return false
      if (actor.role === 'superadmin') return true
      const gruppe = s.groups.find((g) => g.id === groupId)
      if (!gruppe) return false
      // Die Leseschranke gilt auch fuer die Schreibseite. Sonst war sie mit
      // einem Auswahlknopf aufzuheben: Ein Gruppenadmin, der als Admin einer
      // Gruppe fremden Musters eingetragen war, konnte sie zwar nicht
      // betreten (mayAccessGroup), aber im Panel ihr Muster auf „Ohne
      // Muster" stellen — und stand danach mit der vollen Historie drin.
      // Umbenennen, Mitglieder tauschen und Loeschen hing an derselben
      // Pruefung.
      if (!sichtbarFuer(actor, gruppe.aircraftType)) return false
      return gruppe.adminIds.includes(actor.id)
    }
    /** E-Mail ist die einzige Anmeldekennung und muss eindeutig bleiben. */
    const emailTaken = (s: AppState, email: string, exceptId?: string) =>
      s.users.some((u) => u.id !== exceptId && u.email.trim().toLowerCase() === email.trim().toLowerCase())
    /** Verliert jemand mit dieser Gruppenliste seine letzte ERREICHBARE
     *  Gruppe? Gezaehlt wurde vorher jede Mitgliedschaft, auch in Gruppen
     *  fremden Musters, die der Nutzer nie betreten kann (KERN-07/VERW-16). */
    const verliertGruppe = (s: AppState, userId: string, nachher: Group[]) => {
      const u = s.users.find((x) => x.id === userId)
      return !!u && verliertLetzteGruppe(s.settings, u, s.groups, nachher)
    }
    /** Darf der Handelnde diese Rueckmeldung erledigen, oeffnen, loeschen?
     *  Nur, wenn er sie im Panel auch sieht (feedbackFuer). */
    const feedbackBearbeitbar = (s: AppState, id: string) => {
      const f = s.feedbackEntries.find((x) => x.id === id)
      return !!f && darfFeedbackBearbeiten(s.settings, actorOf(s), f, s.groups)
    }

    return {
      state,
      now,
      currentUser,
      sessionExpired,
      effectiveRetention,
      visibleMessages,
      visiblePolls,
      myGroups,
      unreadGroups,
      hasNewInfo,
      hasNewContacts,

      // Gesehen-Markierungen schreiben den Zeitstempel des jüngsten fremden
      // Inhalts (nicht „jetzt“) und tun nichts, wenn bereits alles gesehen
      // ist — dadurch dürfen die Effekte bei jedem Render laufen.
      markChatSeen: (groupId) =>
        patch((s) => {
          if (!s.currentUserId) return null
          const prev = seenOf(s)
          const latest = latestForeignContent(groupId)
          if (latest <= (prev.chat[groupId] ?? 0)) return null
          return {
            seen: { ...s.seen, [s.currentUserId]: { ...prev, chat: { ...prev.chat, [groupId]: latest } } },
          }
        }),
      markInfoSeen: () =>
        patch((s) => {
          if (!s.currentUserId) return null
          const prev = seenOf(s)
          // Ein Gesehen-Zeitpunkt in der Zukunft (Altfehler KERN-11) gilt
          // nicht und wird ersetzt, auch durch einen kleineren.
          const gueltig = infoGesehenBis(prev.info, Date.now() + s.timeOffsetMs)
          if (gueltig === prev.info && latestForeignInfo <= gueltig) return null
          return { seen: { ...s.seen, [s.currentUserId]: { ...prev, info: latestForeignInfo } } }
        }),
      markContactsSeen: () =>
        patch((s) => {
          if (!s.currentUserId) return null
          const prev = seenOf(s)
          if (s.contactsChangedAt <= prev.contacts) return null
          return { seen: { ...s.seen, [s.currentUserId]: { ...prev, contacts: s.contactsChangedAt } } }
        }),

      login: (identifier) => {
        // Anmeldung ohne Code gibt es NUR in der Sandbox. Der Weg im Betrieb
        // ist requestLoginCode + verifyLoginCode; ohne diesen Riegel liesse
        // sich die Code-Strecke mit einem einzigen Aufruf ueberspringen.
        if (!SANDBOX) return false
        // Anmeldung ausschließlich per E-Mail — die Adressen legt der
        // Admin/Superadmin im Admin Panel an
        const needle = identifier.trim().toLowerCase()
        // Eine Domainregel fuer alle Wege (domains.ts) — der Vergleich von
        // Hand scheiterte an einem gespeicherten „@Example.Test" (VERW-05).
        if (!domainErlaubt(needle, state.settings.allowedDomains)) return false
        const user = state.users.find((u) => u.active && u.email.toLowerCase() === needle)
        if (!user) return false
        persistUser(user.id)
        patch(() => ({ currentUserId: user.id, pendingLogin: null }))
        return true
      },
      // Code-Login: der Code gilt bis Mitternacht — genau wie die Sitzung.
      // In der Sandbox wird kein Mail versendet; der Code wird angezeigt.
      requestLoginCode: (email) => {
        const needle = email.trim().toLowerCase()
        const user = state.users.find((u) => u.active && u.email.toLowerCase() === needle)
        // Die erlaubten Domains aus den Einstellungen gelten hier tatsächlich —
        // vorher war die Liste im Admin-Panel ohne jede Wirkung.
        if (!domainErlaubt(needle, state.settings.allowedDomains)) return false
        if (!user) return false
        const code = String(Math.floor(100000 + Math.random() * 900000))
        patch(() => ({ pendingLogin: { email: user.email, code, expiresAt: endOfDay(), attempts: 0 } }))
        return true
      },
      verifyLoginCode: (code) => {
        const pending = state.pendingLogin
        if (!pending || pending.expiresAt < Date.now()) return false
        if (pending.code !== code.trim()) {
          // Fehlversuche zählen; nach fünf ist der Code verbraucht, damit sich
          // sechsstellige Codes nicht durchprobieren lassen.
          patch((s) =>
            s.pendingLogin
              ? { pendingLogin: s.pendingLogin.attempts + 1 >= 5 ? null : { ...s.pendingLogin, attempts: s.pendingLogin.attempts + 1 } }
              : null,
          )
          return false
        }
        const user = state.users.find((u) => u.active && u.email === pending.email)
        if (!user) return false
        persistUser(user.id)
        patch(() => ({ currentUserId: user.id, pendingLogin: null }))
        return true
      },
      can: (key) => userHasPerm(state.settings, currentUser, key),
      moduleAllowed: (module) => userMayModule(state.settings, currentUser, module),
      docCheckRolle: docCheckRolle(currentUser),
      docCheckSettings: docCheckEinstellungen(state.settings.docCheck),
      docCheckBadge: kachelZahl(
        docCheckRolle(currentUser),
        offeneEmpfehlungen(SANDBOX_EMPFEHLUNGEN).length,
        faelligeErinnerungen(SANDBOX_DOKUMENTE, (state.docCheck ?? DC_LEER).bestaetigt, now()).length,
      ),
      // Die Rechte vergibt AUSSCHLIESSLICH der Superadmin (Spez. 3.4) — die
      // Sperre steht hier im Store, nicht nur in der Ansicht. Und es gibt nur
      // diesen einen Weg: `updateUser` laesst die beiden Felder fallen, sonst
      // gaebe es eine Aenderung ohne Protokollzeile.
      setDocCheckRights: (userId, wunsch) =>
        patch((s) => {
          if (!isSuper(s)) return null
          const ziel = s.users.find((u) => u.id === userId)
          if (!ziel) return null
          const neu = rechteSetzen(ziel, wunsch)
          const zeilen = rechteAudit(ziel, neu, { von: s.currentUserId!, ziel: userId, at: Date.now() + s.timeOffsetMs, id: () => uid('dca') })
          if (!zeilen.length) return null
          const dc = s.docCheck ?? DC_LEER
          return {
            users: s.users.map((u) => (u.id === userId ? { ...u, ...neu } : u)),
            docCheck: { ...dc, audit: [...zeilen, ...dc.audit] },
          }
        }),
      updateDocCheckSettings: (p) =>
        patch((s) => {
          if (!isSuper(s)) return null
          const alt = docCheckEinstellungen(s.settings.docCheck)
          const at = Date.now() + s.timeOffsetMs
          const zeilen: DocCheckAuditEintrag[] = []
          for (const [k, v] of Object.entries(p) as [keyof DocCheckSettings, unknown][]) {
            if (k === 'features') {
              for (const [f, an] of Object.entries(v as Record<string, boolean>)) {
                const vorher = alt.features[f as keyof DocCheckSettings['features']]
                if (vorher !== an) zeilen.push({ id: uid('dca'), at, von: s.currentUserId!, aktion: 'feature', ziel: f, wert: `${vorher} → ${an}` })
              }
            } else if (JSON.stringify(alt[k]) !== JSON.stringify(v)) {
              zeilen.push({ id: uid('dca'), at, von: s.currentUserId!, aktion: 'einstellung', ziel: k, wert: `${JSON.stringify(alt[k])} → ${JSON.stringify(v)}` })
            }
          }
          if (!zeilen.length) return null
          const gespeichert = s.settings.docCheck ?? {}
          const features = p.features ? { ...(gespeichert.features ?? {}), ...p.features } : gespeichert.features
          const dc = s.docCheck ?? DC_LEER
          return {
            settings: { ...s.settings, docCheck: { ...gespeichert, ...p, ...(features ? { features } : {}) } },
            docCheck: { ...dc, audit: [...zeilen, ...dc.audit] },
          }
        }),
      docCheckConfirmRevision: (docId) =>
        patch((s) => {
          const rolle = docCheckRolle(actorOf(s))
          if (rolle !== 'admin' && rolle !== 'superadmin') return null
          if (!SANDBOX_DOKUMENTE.some((d) => d.id === docId)) return null
          const at = Date.now() + s.timeOffsetMs
          const dc = s.docCheck ?? DC_LEER
          return {
            docCheck: {
              bestaetigt: { ...dc.bestaetigt, [docId]: at },
              audit: [{ id: uid('dca'), at, von: s.currentUserId!, aktion: 'standBestaetigt', ziel: docId, wert: 'confirmed' }, ...dc.audit],
            },
          }
        }),
      // Dieselbe Regel wie doccheck.log_recheck (recheckAudit): Nummer und
      // Status, nie Befundtext — vorher stand hier die Nummernspalte
      // ungeprüft, bis 300 Zeichen (Audit 11/2026, SEC-06).
      docCheckRecheckConfirm: (liste, eintraege) =>
        patch((s) => {
          if (!darf(docCheckRolle(actorOf(s)), 'pruefen')) return null
          const zeilen = recheckAudit(liste, eintraege, { von: s.currentUserId!, at: Date.now() + s.timeOffsetMs, id: () => uid('dca') })
          if (!zeilen.length) return null
          const dc = s.docCheck ?? DC_LEER
          return { docCheck: { ...dc, audit: [...zeilen, ...dc.audit] } }
        }),
      // Die Rechtematrix aendert ausschliesslich der Superadmin. Die Sperre
      // lag bisher allein in der Oberflaeche (Reiterliste im Admin-Panel) —
      // die Vergabe ALLER Rechte haengt damit an einer Anzeigeliste.
      setPermission: (role, key, value) =>
        patch((s) => (!isSuper(s) ? null : {
          settings: {
            ...s.settings,
            permissions: { ...s.settings.permissions, [role]: { ...s.settings.permissions[role], [key]: value } },
          },
        })),
      logout: () => {
        persistUser(null)
        // Das Verwerfen der DocCheck-Sitzung („ic-abmelden") loest der
        // Effekt am Uebergang zu „abgemeldet" aus — fuer JEDEN Weg dorthin.
        patch(() => ({ currentUserId: null }))
      },
      // Die drei Sandbox-Werkzeuge greifen NUR im Sandbox-Betrieb. Bisher
      // hing das allein daran, dass die Leiste sie anbietet — wer sie über
      // die Konsole aufrief, wechselte die Identität ohne Anmeldung,
      // verschob die Unterschriftszeitpunkte (die im Fingerabdruck stecken)
      // oder löschte den gesamten Bestand.
      switchUser: (userId) => {
        if (!SANDBOX) return
        persistUser(userId)
        patch(() => ({ currentUserId: userId }))
      },
      advanceTime: (ms) => {
        if (!SANDBOX) return
        patch((s) => ({ timeOffsetMs: s.timeOffsetMs + ms }))
      },
      resetSandbox: () => {
        if (!SANDBOX) return
        clearPersistedState()
        setState(() => ({ ...createSeedState(), currentUserId: state.currentUserId }))
      },

      sendMessage: (groupId, text, attachment) => {
        const id = uid('m')
        const senden = (s: AppState): Partial<AppState> | null => {
          // Chat-Sperre, Mitgliedschaft, leere Nachricht und Upload-Limit —
          // dieselbe Regel, mit der die Ansicht den Grund nennt (chatRules.ts).
          const gruppe = s.groups.find((g) => g.id === groupId)
          if (nachrichtAbgewiesen(actorOf(s), gruppe, text, attachment, s.settings.maxUploadMB)) return null
          return {
            messages: [
              ...s.messages,
              { id, groupId, authorId: s.currentUserId!, text, createdAt: Date.now() + s.timeOffsetMs, attachment },
            ],
          }
        }
        // Antwort aus derselben Pruefung auf dem gezeichneten Stand — wie
        // addUser. Ohne Rueckgabe leerte die Ansicht die Eingabe auch bei
        // Ablehnung, und der Text war weg (Audit 11/2026, KERN-08).
        const gesendet = senden(stateRef.current) !== null
        patch(senden)
        return gesendet
      },
      deleteMessage: (id) =>
        patch((s) => {
          const msg = s.messages.find((m) => m.id === id)
          const actor = actorOf(s)
          if (!msg || !actor) return null
          // Löschen darf der Autor, der Admin der Gruppe und der Superadmin —
          // bisher konnte ein Gruppenadmin in seiner eigenen Gruppe nichts
          // entfernen.
          const isGroupAdmin = s.groups.find((g) => g.id === msg.groupId)?.adminIds.includes(actor.id) ?? false
          if (msg.authorId !== actor.id && !isGroupAdmin && actor.role !== 'superadmin') return null
          return { messages: s.messages.filter((m) => m.id !== id) }
        }),

      createPoll: (groupId, question, type, options, validUntil) => {
        const id = uid('p')
        const anlegen = (s: AppState): Partial<AppState> | null => {
          // Wie eine Nachricht: nur Mitglieder ohne Chat-Sperre. Vorher pruefte
          // die Aktion allein die Sperre — angelegt werden konnte in jeder
          // Gruppe (KERN-19).
          const gruppe = s.groups.find((g) => g.id === groupId)
          if (!gruppe || !darfSchreiben(actorOf(s), gruppe)) return null
          // Ablauf in der Zukunft UND innerhalb der Aufbewahrung der Gruppe:
          // Sonst loeschte die Aufbewahrung die Umfrage samt Stimmen, solange
          // sie laut Anzeige noch lief (Audit 11/2026, KERN-09).
          const jetzt = Date.now() + s.timeOffsetMs
          if (umfrageAbgewiesen({ question, type, options, validUntil }, jetzt, gruppe.retention ?? s.settings.defaultRetention)) return null
          return {
            polls: [
              ...s.polls,
              { id, groupId, authorId: s.currentUserId!, question, type, options, votes: {}, closed: false, validUntil, createdAt: jetzt },
            ],
          }
        }
        // Der Dialog bleibt bei Ablehnung offen — er schloss vorher immer,
        // und die Umfrage gab es nicht (KERN-08).
        const angelegt = anlegen(stateRef.current) !== null
        patch(anlegen)
        return angelegt
      },
      vote: (pollId, optionIndex) =>
        patch((s) => {
          const poll = s.polls.find((p) => p.id === pollId)
          const gruppe = poll && s.groups.find((g) => g.id === poll.groupId)
          // Abstimmen nur als Mitglied — ein Superadmin ohne Mitgliedschaft
          // stimmte vorher mit ab (KERN-19) — und nur solange offen und nicht
          // abgelaufen (Gültigkeit in UTC).
          if (!poll || !gruppe || !darfAbstimmen(actorOf(s), gruppe)) return null
          if (poll.closed || (poll.validUntil && poll.validUntil <= Date.now() + s.timeOffsetMs)) return null
          return { polls: s.polls.map((p) => (p.id === pollId ? { ...p, votes: { ...p.votes, [s.currentUserId!]: optionIndex } } : p)) }
        }),
      closePoll: (pollId) =>
        patch((s) => {
          // Autor oder Admin der Gruppe — die Regel, nach der die Karte den
          // Knopf zeigt, galt bisher nur dort.
          const poll = s.polls.find((p) => p.id === pollId)
          const gruppe = poll && s.groups.find((g) => g.id === poll.groupId)
          if (!poll || !gruppe || !darfUmfrageSchliessen(actorOf(s), poll, gruppe)) return null
          return { polls: s.polls.map((p) => (p.id === pollId ? { ...p, closed: true } : p)) }
        }),

      toggleMute: (groupId) =>
        patch((s) => {
          const gruppe = s.groups.find((g) => g.id === groupId)
          if (!gruppe || !s.currentUserId || !darfStummschalten(actorOf(s), gruppe)) return null
          // Nur fuer den Handelnden selbst: `muted` an der Gruppe schaltete
          // sie fuer ALLE Mitglieder stumm (Audit 11/2026, KERN-06).
          return { mutedGroups: schalteStumm(s.mutedGroups, s.currentUserId, groupId) }
        }),
      setGroupRetention: (groupId, retention) =>
        patch((s) =>
          maySeeGroup(s, groupId) ? { groups: s.groups.map((g) => (g.id === groupId ? { ...g, retention } : g)) } : null,
        ),
      setGroupMembers: (groupId, memberIds) => {
        const aendern = (s: AppState): Partial<AppState> | null => {
          if (!maySeeGroup(s, groupId)) return null
          const group = s.groups.find((g) => g.id === groupId)
          if (!group) return null
          // Neu hinein nur, wer die Gruppe auch betreten kann — sonst zaehlte
          // eine Mitgliedschaft, die nie zu einem Chat fuehrt, und die
          // Mitgliederliste zeigte Leute ohne Zugang (KERN-07).
          const added = memberIds.filter((m) => !group.memberIds.includes(m))
          if (added.some((m) => {
            const u = s.users.find((x) => x.id === m)
            return !u || !gruppenTauglich(s.settings, u, group)
          })) return null
          // Sich selbst herausnehmen kann ein Gruppenadmin nicht — dieselbe
          // Regel wie in der Oberflaeche (gruppen.ts). Im Admin-Panel genuegte
          // ein Fehlklick, und die Gruppe stand ohne Admin da (VERW-09).
          if (gruppenAenderungFehler(actorOf(s), group, memberIds, group.adminIds) === 'selbstEntfernt') return null
          const groups = s.groups.map((g) =>
            g.id === groupId
              ? // Wer die Gruppe verlässt, verliert auch seine Adminrechte
                // darin — sonst verwaltet ein Außenstehender weiter mit.
                { ...g, memberIds, adminIds: g.adminIds.filter((a) => memberIds.includes(a)) }
              : g,
          )
          // „Mindestens eine Gruppe" gilt auch hier — gezaehlt werden die
          // Gruppen, die der Nutzer betreten kann.
          const dropped = group.memberIds.filter((m) => !memberIds.includes(m))
          if (dropped.some((m) => verliertGruppe(s, m, groups))) return null
          return { groups }
        }
        // „Entfernen" in der Chat-Info tat bei Ablehnung nichts und meldete
        // nichts (KERN-08) — die Antwort sagt der Ansicht, ob es gewirkt hat.
        const geaendert = aendern(stateRef.current) !== null
        patch(aendern)
        return geaendert
      },

      // Info, Kontakte, Lesson Plans, Feedback, Gruppen, Nutzer, Einstellungen:
      // jede schreibende Aktion fragt den Handelnden (storeRechte.ts). Vorher
      // verliess sich die Haelfte allein auf die Oberflaeche (KERN-19/VERW-23).
      addInfoEntry: (entry) =>
        patchMitAntwort((s) => {
          if (!darfInfoVerwalten(s.settings, actorOf(s), entry.aircraftType)) return null
          // Dieselbe Regel wie im Dialog: „bis" vor „ab" erschiene nie (KERN-12).
          if (gueltigkeitFehler(entry.validFrom, entry.validUntil)) return null
          return {
            infoEntries: [
              ...s.infoEntries,
              { ...entry, id: uid('i'), authorId: s.currentUserId!, createdAt: Date.now() + s.timeOffsetMs },
            ],
          }
        }),
      deleteInfoEntry: (id) =>
        patch((s) => {
          const eintrag = s.infoEntries.find((e) => e.id === id)
          if (!eintrag || !darfInfoVerwalten(s.settings, actorOf(s), eintrag.aircraftType)) return null
          return { infoEntries: s.infoEntries.filter((e) => e.id !== id) }
        }),
      toggleStarInfo: (id) =>
        patch((s) => {
          if (!s.currentUserId) return null
          const mine = s.starredInfo[s.currentUserId] ?? []
          const next = mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]
          return { starredInfo: { ...s.starredInfo, [s.currentUserId]: next } }
        }),
      starredInfoIds: new Set(state.currentUserId ? state.starredInfo[state.currentUserId] ?? [] : []),
      visibleInfoEntries,
      openAcks,
      visibleFeedback,
      // Bestätigen erst möglich, wenn der Eintrag auch gilt
      acknowledgeInfo: (id) =>
        patch((s) => {
          if (!s.currentUserId) return null
          const entry = s.infoEntries.find((e) => e.id === id)
          const ts = Date.now() + s.timeOffsetMs
          if (!entry || !infoIsPublished(entry, ts) || infoIsExpired(entry, ts)) return null
          const forEntry = s.infoAcks[id] ?? {}
          if (forEntry[s.currentUserId]) return null // bereits bestätigt
          return { infoAcks: { ...s.infoAcks, [id]: { ...forEntry, [s.currentUserId]: Date.now() + s.timeOffsetMs } } }
        }),

      submitFeedback: (entry) =>
        patch((s) => {
          // Dieselben Pflichtfelder wie im Formular (feedbackPruefung.ts,
          // A11Y-16) — ein Musterbezug kommt hier als gesetztes Muster an.
          const fehlt = feedbackFehlt({
            recipient: entry.recipient,
            category: entry.category,
            scope: entry.aircraftType !== undefined ? 'aircraft' : 'general',
            aircraftType: entry.aircraftType ?? '',
            message: entry.message,
          })
          if (!s.currentUserId || fehlt.length > 0) return null
          return {
            feedbackEntries: [
              ...s.feedbackEntries,
              { ...entry, id: uid('fb'), authorId: s.currentUserId, createdAt: Date.now() + s.timeOffsetMs },
            ],
          }
        }),
      deleteFeedback: (id) =>
        patch((s) => {
          if (!feedbackBearbeitbar(s, id)) return null
          return { feedbackEntries: s.feedbackEntries.filter((f) => f.id !== id) }
        }),
      // Bearbeitet: wer und wann werden festgehalten; die Rückmeldung bleibt
      // erhalten und wandert in der Ansicht unter die offenen.
      resolveFeedback: (id, note) =>
        patch((s) => {
          if (!feedbackBearbeitbar(s, id)) return null
          return {
            feedbackEntries: s.feedbackEntries.map((f) =>
              f.id === id
                ? { ...f, resolvedBy: s.currentUserId!, resolvedAt: Date.now() + s.timeOffsetMs, resolutionNote: note.trim() || undefined }
                : f,
            ),
          }
        }),
      reopenFeedback: (id) =>
        patch((s) => {
          if (!feedbackBearbeitbar(s, id)) return null
          return {
            feedbackEntries: s.feedbackEntries.map((f) =>
              f.id === id ? { ...f, resolvedBy: undefined, resolvedAt: undefined, resolutionNote: undefined } : f,
            ),
          }
        }),

      saveContact: (eingabe) =>
        patchMitAntwort((s) => {
          if (!darfKontakteVerwalten(s.settings, actorOf(s))) return null
          // Getrimmt und grob geprueft wie im Dialog (contacts.ts): „Training "
          // ergab sonst eine zweite Abteilung (Audit 11/2026, KERN-16).
          const contact = kontaktNormalisieren(eingabe)
          if (kontaktFehler(contact).length > 0) return null
          return {
            contacts: contact.id
              ? s.contacts.map((c) => (c.id === contact.id ? { ...c, ...contact, id: contact.id } : c))
              : [...s.contacts, { ...contact, id: uid('c') }],
            contactsChangedAt: Date.now() + s.timeOffsetMs,
          }
        }),
      deleteContact: (id) =>
        patch((s) => {
          if (!darfKontakteVerwalten(s.settings, actorOf(s))) return null
          return {
            contacts: s.contacts.filter((c) => c.id !== id),
            contactsChangedAt: Date.now() + s.timeOffsetMs,
          }
        }),

      addUser: ({ groupIds, ...user }) => {
        const id = uid('u')
        const anlegen = (s: AppState): Partial<AppState> | null => {
          // Konten legt nur an, wer die Benutzerverwaltung hat. Die Rolle des
          // neuen Kontos reicht bis zum Superadmin — dieselbe Ausweitung, die
          // updateUser und importUsers schon sperrten (VERW-23).
          if (!darfVerwaltung(s.settings, actorOf(s), 'nutzerAnlegen')) return null
          /* Invarianten auch im Store, nicht nur im Dialog: ohne Gruppe, ohne
             Muster und ohne E-Mail kein neuer Nutzer. Die E-Mail ist die
             einzige Anmeldekennung; die Gruppe steuert Chat und Instructor
             Info; das Muster steuert, welche Lesson Plans jemand ueberhaupt
             sieht. Ein Konto ohne Muster ist fuer nichts zustaendig — und das
             gilt fuer den Admin genauso wie fuer den Instruktor. */
          if (!user.email.trim()) return null
          // Nur mit freigegebener Domain: Ein Konto, das sich nie anmelden
          // kann, entstand ueber diesen Weg, waehrend der Import es abwies
          // (Audit 11/2026, VERW-12).
          if (!domainErlaubt(user.email, s.settings.allowedDomains)) return null
          // Musterpflicht nur fuer die Rollen, deren Sicht daran haengt —
          // und ueber `musterFehlt`, nicht von Hand: Die Bedingung stand hier
          // ausgeschrieben, waehrend vier andere Schreibwege sie nicht kannten.
          if (musterFehlt(user)) return null
          // Doppelte Adresse hieße: zwei Konten, ein Login — der zweite
          // Nutzer könnte die Identität des ersten übernehmen.
          if (emailTaken(s, user.email)) return null
          const neu = { ...user, canEditDirectory: false, canGrade: false, isTrainee: false, active: true }
          // Pflicht-Gruppenzuweisung: nur Gruppen, die die Person betreten
          // kann, und mindestens eine davon — sofern sie den Chat hat. Der
          // Training Admin hat keinen; fuer ihn war die Pflicht unerfuellbar
          // (KERN-07/VERW-07, Widerspruch 11 in den Audit-Notizen).
          const ziele = s.groups.filter((g) => groupIds.includes(g.id))
          if (ziele.some((g) => !gruppenTauglich(s.settings, neu, g))) return null
          if (gruppenPflicht(s.settings, neu) && ziele.length === 0) return null
          // Ein neues Superadmin-Konto ist zugleich DocCheck-Superadmin — eine
          // Rechtevergabe wie der Rollenwechsel (VERW-15).
          const zeilen = rollenAudit(null, neu, { von: s.currentUserId ?? '', ziel: id, at: Date.now() + s.timeOffsetMs, id: () => uid('dca') })
          const dc = s.docCheck ?? DC_LEER
          return {
            users: [...s.users, { ...neu, id }],
            groups: s.groups.map((g) => (groupIds.includes(g.id) ? { ...g, memberIds: [...g.memberIds, id] } : g)),
            ...(zeilen.length ? { docCheck: { ...dc, audit: [...zeilen, ...dc.audit] } } : {}),
          }
        }
        // Die Antwort kommt aus derselben Pruefung, angewandt auf den zuletzt
        // gezeichneten Stand — nicht aus einer Variablen, die der Updater
        // setzt: React ruft ihn nicht zwingend sofort auf. Nachgemessen: Ein
        // zweites Anlegen kurz nach dem ersten meldete „nicht angelegt",
        // und das Konto stand trotzdem da (Audit 11/2026, Ebene-2-Test).
        const angelegt = anlegen(stateRef.current) !== null
        patch(anlegen)
        return angelegt
      },
      updateUser: (id, p) =>
        patch((s) => {
          const target = s.users.find((u) => u.id === id)
          if (!target) return null
          // Aendern darf nur, wer die Benutzerverwaltung oder die
          // Rechteseite hat. Eigene „harmlose" Felder gibt es heute keine —
          // kein Weg ausserhalb des Panels ruft updateUser; kommt einer
          // dazu, bekommt er seine eigene Aktion (VERW-23).
          if (!darfVerwaltung(s.settings, actorOf(s), 'nutzerAendern')) return null
          // Die Rolle vergibt ausschließlich der Superadmin. Sonst könnte sich
          // ein group_admin über eine offen gebliebene Ansicht selbst befördern.
          const safe: Partial<User> = isSuper(s) ? { ...p } : { ...p, role: undefined }
          // DocCheck-Rechte laufen ausschliesslich ueber setDocCheckRights —
          // dort wird protokolliert. Auch der Superadmin kommt hier nicht dran.
          delete safe.docCheckAccess
          delete safe.docCheckAdmin
          // E-Mail bleibt eindeutig — sie ist die einzige Anmeldekennung.
          if (safe.email !== undefined && (!safe.email.trim() || emailTaken(s, safe.email, id))) delete safe.email
          // Eigene Rolle, eigenes Konto, letzter Superadmin, letztes Muster,
          // letzte erreichbare Gruppe: dieselbe Funktion, die der
          // Nutzerzeile den Grund nennt (benutzerRegeln.ts). Vorher standen
          // die Regeln nur hier und verwarfen still — und die eigene Rolle
          // fehlte ganz, anders als in profiles_guard (VERW-01/VERW-10).
          const { patch: erlaubt } = einzelAenderung(s.users, target, safe, s.currentUserId, { groups: s.groups, settings: s.settings })
          if (Object.keys(erlaubt).length === 0) return null
          const users = s.users.map((u) => (u.id === id ? { ...u, ...erlaubt } : u))
          // Rolle oder Status koennen die DocCheck-Rolle aendern (Superadmin =
          // DocCheck-Superadmin, deaktiviert = keine). Das ist eine
          // Rechteaenderung und gehoert ins DocCheck-Protokoll — vorher stand
          // sie nirgends (Audit 11/2026, VERW-15).
          const zeilen = rollenAudit(target, { ...target, ...erlaubt }, { von: s.currentUserId ?? '', ziel: id, at: Date.now() + s.timeOffsetMs, id: () => uid('dca') })
          const dc = s.docCheck ?? DC_LEER
          const protokoll = zeilen.length ? { docCheck: { ...dc, audit: [...zeilen, ...dc.audit] } } : {}
          // Wer deaktiviert wird, verliert seine Sitzung — in der Sandbox ist
          // das die aktuell angemeldete Identität. (Das eigene Konto weist
          // einzelAenderung inzwischen ab; der Riegel bleibt fuer den Fall,
          // dass sich diese Regel einmal aendert.)
          if (erlaubt.active === false && s.currentUserId === id) {
            persistUser(null)
            return { users, currentUserId: null, ...protokoll }
          }
          return { users, ...protokoll }
        }),

      addGroup: (name, purpose, aircraftType) => {
        const id = uid('g')
        const anlegen = (s: AppState): Partial<AppState> | null => {
          // Superadmin und Gruppenadmin, und nur mit einem Muster, das der
          // Anleger selbst sieht — er wird Mitglied (KERN-19).
          if (!darfGruppeAnlegen(s.settings, actorOf(s), aircraftType)) return null
          // Leere oder doppelte Namen wären im Chat nicht unterscheidbar —
          // dieselbe Regel wie im Dialog und beim Umbenennen (gruppen.ts).
          if (gruppenNameFehler(s.groups, null, name)) return null
          // Wer die Gruppe anlegt (Admin/Superadmin), verwaltet sie auch
          // und ist sofort Mitglied.
          const creator = s.currentUserId ? [s.currentUserId] : []
          return {
            groups: [
              ...s.groups,
              { id, name: gruppenName(name), purpose, aircraftType, adminIds: creator, memberIds: creator, retention: null },
            ],
          }
        }
        // Der Dialog in der Chatliste schloss auch bei einem vergebenen Namen
        // und meldete nichts (KERN-08).
        const angelegt = anlegen(stateRef.current) !== null
        patch(anlegen)
        return angelegt
      },
      setGroupAircraft: (id, aircraftType) =>
        patch((s) => (maySeeGroup(s, id) ? { groups: s.groups.map((g) => (g.id === id ? { ...g, aircraftType } : g)) } : null)),
      renameGroup: (id, name) =>
        patch((s) => {
          // Leer oder doppelt geht nicht. Aufgerufen wird erst am Ende der
          // Eingabe (GroupNameField) — vorher lief das bei jedem Tastendruck,
          // und ein Leerzeichen am Wortende verschwand, bevor das naechste
          // Wort kam (Audit 11/2026, VERW-04).
          if (!maySeeGroup(s, id) || gruppenNameFehler(s.groups, id, name)) return null
          const neu = gruppenName(name)
          if (s.groups.find((g) => g.id === id)?.name === neu) return null
          return { groups: s.groups.map((g) => (g.id === id ? { ...g, name: neu } : g)) }
        }),
      // Gleiche Regel wie in deleteGroup — die Oberfläche muss den Grund
      // NENNEN können, statt den Klick wirkungslos verpuffen zu lassen.
      groupDeleteBlockers: (id) => {
        const group = state.groups.find((g) => g.id === id)
        if (!group) return []
        const ohne = state.groups.filter((g) => g.id !== id)
        return group.memberIds
          .filter((m) => verliertGruppe(state, m, ohne))
          .map((m) => state.users.find((u) => u.id === m))
          .filter((u): u is User => !!u)
      },
      deleteGroup: (id) =>
        patch((s) => {
          if (!maySeeGroup(s, id)) return null
          // Niemand darf ohne Gruppe zurückbleiben — sonst verliert er
          // Chat-Zugang und Instructor-Info-Sichtbarkeit.
          const ohne = s.groups.filter((g) => g.id !== id)
          const orphan = s.groups.find((g) => g.id === id)?.memberIds.some((m) => verliertGruppe(s, m, ohne))
          if (orphan) return null
          return {
          groups: s.groups.filter((g) => g.id !== id),
          messages: s.messages.filter((m) => m.groupId !== id),
          polls: s.polls.filter((p) => p.groupId !== id),
          // Zielgruppen-Verweise bereinigen: sonst würden Einträge, die nur
          // auf die gelöschte Gruppe zeigten, für alle unsichtbar
          infoEntries: s.infoEntries.map((e) =>
            e.groupIds?.includes(id) ? { ...e, groupIds: e.groupIds.filter((g) => g !== id) } : e,
          ),
          }
        }),
      setGroupAdmins: (id, adminIds) =>
        patch((s) => {
          const group = s.groups.find((g) => g.id === id)
          if (!group || !maySeeGroup(s, id)) return null
          // Adminrechte nur für Mitglieder der Gruppe — wer nicht drin ist,
          // kann sie auch nicht verwalten. Neu ernannt wird nur, wen auch die
          // Oberflaeche anbietet: aktive Mitglieder (VERW-11).
          const kandidaten = new Set(adminKandidaten(group, s.users).map((u) => u.id))
          const neu = adminIds.filter((a) => group.memberIds.includes(a) && (group.adminIds.includes(a) || kandidaten.has(a)))
          if (gruppenAenderungFehler(actorOf(s), group, group.memberIds, neu) === 'selbstEntfernt') return null
          return { groups: s.groups.map((g) => (g.id === id ? { ...g, adminIds: neu } : g)) }
        }),

      updateSettings: (p) =>
        patch((s) => {
          // Einstellungen und Impressum nur mit dem Bereich dazu (VERW-23).
          if (!darfVerwaltung(s.settings, actorOf(s), 'einstellungen')) return null
          const next = { ...p }
          // Login-Domains: gespeichert wird nur die normalisierte Form, und
          // nie eine Liste, mit der der Handelnde selbst oder kein aktiver
          // Superadmin mehr hineinkaeme — wer sollte sie dann zuruecknehmen?
          // Ein Tippfehler oder ein Klick aufs × sperrte vorher die ganze ATO
          // aus (Audit 11/2026, VERW-05).
          if (next.allowedDomains) {
            const liste = domainListe(next.allowedDomains)
            const unbrauchbar = next.allowedDomains.length > 0 && liste.length === 0
            if (unbrauchbar || domainSperre(s.users, liste, actorOf(s)?.email)) delete next.allowedDomains
            else next.allowedDomains = liste
          }
          // Ein Muster, das noch an Gruppen, Nutzern, Lesson Plans oder
          // Formularen hängt, darf nicht verschwinden — sonst zeigen diese
          // Verweise ins Leere. Es bleibt an SEINER Stelle: Angehaengt
          // sprang der Chip ans Listenende, als sei etwas geschehen
          // (VERW-18). Den Grund nennt die Oberflaeche vorher, mit derselben
          // Zaehlung (musterInVerwendung).
          if (next.aircraftTypes) {
            next.aircraftTypes = musterListeBehalten(s.settings.aircraftTypes, next.aircraftTypes, (a) =>
              musterBelegt(musterInVerwendung(s, a)),
            )
          }
          if (Object.keys(next).length === 0) return null
          return { settings: { ...s.settings, ...next } }
        }),

      visibleGradingRecords,
      // Objektbezogene Berechtigung: eigenes Formular oder Vollzugriff.
      // Ohne diese Prüfung liest (und unterschreibt) jeder Nutzer jedes
      // Formular, indem er die ID in die Adresszeile tippt.
      gradingRecordById: (id) => {
        if (!currentUser) return undefined
        const rec = state.gradingRecords.find((r) => r.id === id)
        if (!rec) return undefined
        if (userHasPerm(state.settings, currentUser, 'grading_view_all')) return rec
        return rec.instructorId === currentUser.id ? rec : undefined
      },
      saveGradingRecord: (record) =>
        patch((s) => {
          // Ein vollständig unterschriebenes Blatt ist der Nachweis selbst
          // und wird nicht mehr überschrieben. Bisher hing das allein daran,
          // dass die Oberfläche keinen Bearbeiten-Knopf mehr anbot — wer die
          // ID in die Adresszeile tippte, schrieb den Datensatz trotzdem neu.
          // Der Fingerabdruck hätte die Änderung zwar ausgewiesen, aber erst
          // im Nachhinein; hier wird sie gar nicht erst zugelassen.
          // Die Nachtragsunterschrift ist davon nicht betroffen: sie setzt an
          // einem Blatt an, das noch auf 'awaiting_signature' steht.
          const vorher = s.gradingRecords.find((r) => r.id === record.id)
          if (vorher?.status === 'signed') return null

          // parentId kommt letztlich aus der Adresszeile. Nur 306/310 sind
          // Folgeformulare, und nur ein vorhandenes Formular kann Elternteil
          // sein — alles andere wird verworfen, sonst hebelt ein erfundenes
          // parentId die Folgeformular-Pflicht aus und fällt zugleich aus
          // jeder Statistik (die Auswertungen überspringen Folgeformulare).
          //
          // Geprüft wird zusätzlich, ob der Anlegende dieses Blatt überhaupt
          // sehen darf. Vorher genügte die blosse EXISTENZ: Wer eine fremde ID
          // erriet, hängte sein 306 an das Blatt eines anderen Instruktors —
          // und hakte damit dessen offene Pflicht ab, ohne je Zugriff auf das
          // Blatt gehabt zu haben. Dieselbe Regel wie in gradingRecordById.
          const actor = s.users.find((u) => u.id === s.currentUserId)
          const parent = record.parentId !== undefined ? s.gradingRecords.find((r) => r.id === record.parentId) : undefined
          const darfElter =
            !!parent &&
            !!actor &&
            (userHasPerm(s.settings, actor, 'grading_view_all') || parent.instructorId === actor.id)
          const parentOk = record.parentId !== undefined && isFollowUpType(record.formTypeId) && darfElter
          const clean = parentOk || record.parentId === undefined ? record : { ...record, parentId: undefined }
          return {
            gradingRecords: s.gradingRecords.some((r) => r.id === clean.id)
              ? s.gradingRecords.map((r) => (r.id === clean.id ? clean : r))
              : [...s.gradingRecords, clean],
          }
        }),
      hideGradingRecord: (id) =>
        patch((s) => {
          // Nur Erledigtes darf aus dem Blick: Was noch auf Unterschrift,
          // Folgeformular oder Versand wartet, ist eine offene Pflicht — die
          // ließ sich vorher per Mülleimer aus der Sicht des Verantwortlichen
          // entfernen, obwohl genau diese Sicht sie anmahnen soll.
          const rec = s.gradingRecords.find((r) => r.id === id)
          if (!rec || !isComplete(rec, s.gradingRecords)) return null
          return {
            gradingRecords: s.gradingRecords.map((r) =>
              r.id === id && !r.hiddenFor?.includes(s.currentUserId!)
                ? { ...r, hiddenFor: [...(r.hiddenFor ?? []), s.currentUserId!] }
                : r,
            ),
          }
        }),
      // Ausblenden ist nicht mehr endgültig: Wer die ganze Ablage sieht,
      // kann ein Blatt für ALLE wieder sichtbar machen.
      unhideGradingRecord: (id) =>
        patch((s) => {
          const actor = s.users.find((u) => u.id === s.currentUserId)
          if (!actor || !userHasPerm(s.settings, actor, 'grading_view_all')) return null
          return {
            gradingRecords: s.gradingRecords.map((r) => (r.id === id ? { ...r, hiddenFor: undefined } : r)),
          }
        }),
      // Ausbildungsnachweise sind aufbewahrungspflichtig: endgültiges Löschen
      // bleibt dem Superadmin vorbehalten — der Training Admin ist nur-lesend.
      deleteGradingRecord: (id) =>
        patch((s) => {
          const actor = s.users.find((u) => u.id === s.currentUserId)
          if (actor?.role !== 'superadmin') return null
          const target = s.gradingRecords.find((r) => r.id === id)
          if (!target) return null
          // Die Folgeformulare gehen MIT. Vorher wurden alle Kinder auf ein
          // Geschwisterblatt desselben Durchgangs umgehängt — gedacht war das
          // für das damals durchgangsweite 310, umgehängt wurde aber ALLES,
          // also auch das 306, das die Defizite genau EINES Piloten
          // dokumentiert. Es stand danach unter dem Blatt eines anderen
          // Piloten und hakte dessen Pflicht ab. Seit 306 und 310 beide an
          // genau einem Blatt hängen (siehe gradingRules), gibt es dafür
          // keinen Anlass mehr: Wer das Ausgangsblatt endgültig löscht,
          // löscht den Vorgang, nicht nur ein Stück davon.
          return {
            gradingRecords: s.gradingRecords.filter((r) => r.id !== id && r.parentId !== id),
          }
        }),
      // Erneut senden: ohne Netz landet der Versuch im Ausgangskorb, statt
      // einen Erfolg zu behaupten, den es nicht gab.
      // Erneut senden: erst in den Ausgangskorb, dann entscheidet die echte
      // Erreichbarkeitsprobe — nicht navigator.onLine — über „sent".
      retryGradingMail: (id) => {
        patch((s) => ({
          gradingRecords: s.gradingRecords.map((r) =>
            r.id === id ? { ...r, mailStatus: 'queued' as const, mailError: undefined } : r,
          ),
        }))
        void networkReachable().then((ok) => {
          if (!ok) return
          patch((s) => ({
            gradingRecords: s.gradingRecords.map((r) =>
              r.id === id && r.mailStatus === 'queued' ? { ...r, mailStatus: 'sent' as const } : r,
            ),
          }))
        })
      },
      // Ohne Netz unterschriebene Formulare gehen raus, sobald wieder
      // Empfang da ist. In der Sandbox gelingt der Versand; mit echtem
      // Backend hängt hier der tatsächliche Sendeauftrag.
      //
      // Maßgeblich ist eine ECHTE Erreichbarkeitsprobe (net.ts), nicht
      // navigator.onLine: das meldet „online" auch im WLAN ohne Internet —
      // dort behauptete der Korb den Versand, ohne je gesendet zu haben.
      // Rückgabe: war der Origin erreichbar? (Für die Anzeige im Banner.)
      flushOutbox: () => {
        // Ein Lauf zur Zeit. Der Streifen ruft bei online, visibilitychange
        // und beim Start; ohne diese Sperre liefen mehrere Proben parallel,
        // und jede erklärte anschließend den GESAMTEN Korb für versendet.
        if (flushRef.current) return flushRef.current
        const offen = stateRef.current.gradingRecords.filter((r) => r.mailStatus === 'queued').map((r) => r.id)
        if (offen.length === 0) return Promise.resolve(navigator.onLine !== false)
        const lauf = (async () => {
          const reachable = await networkReachable()
          if (!reachable) return false
          // Nur die Blätter, die BEIM START der Probe im Korb lagen. Vorher
          // wurde pauschal alles auf „versendet" gesetzt — auch ein Blatt,
          // das erst während der laufenden Probe unterschrieben wurde und
          // für das folglich nie etwas geprüft worden war.
          const ids = new Set(offen)
          patch((s) =>
            s.gradingRecords.some((r) => ids.has(r.id) && r.mailStatus === 'queued')
              ? {
                  gradingRecords: s.gradingRecords.map((r) =>
                    ids.has(r.id) && r.mailStatus === 'queued'
                      ? { ...r, mailStatus: 'sent' as const, mailError: undefined }
                      : r,
                  ),
                }
              : null,
          )
          return true
        })()
        flushRef.current = lauf
        void lauf.finally(() => {
          flushRef.current = null
        })
        return lauf
      },
      updateGrading: (p) =>
        patch((s) => {
          const next = { ...p }
          // Ein Formulartyp, zu dem es Datensätze gibt, bleibt im Katalog —
          // sonst verliert ein unterschriebenes Dokument seine Struktur.
          if (next.formTypes) {
            const removed = s.settings.grading.formTypes.filter((f) => !next.formTypes!.some((n) => n.id === f.id))
            // Pflicht-Folgeformulare (306/310) und Typen mit Datensätzen
            // bleiben — dieselbe Regel, die den Löschknopf der Konfiguration
            // sperrt (gradingRules.formularTypInGebrauch, Audit 11/2026, GRD-18).
            const stillUsed = removed.filter((f) => formularTypInGebrauch(f.id, s.gradingRecords) !== null)
            // Behaltene Typen an ihrer Stelle, nicht angehaengt (VERW-18).
            if (stillUsed.length > 0) {
              const neu = next.formTypes
              next.formTypes = [
                ...s.settings.grading.formTypes.flatMap((f) => neu.find((n) => n.id === f.id) ?? (stillUsed.includes(f) ? f : [])),
                ...neu.filter((n) => !s.settings.grading.formTypes.some((f) => f.id === n.id)),
              ]
            }
          }
          return { settings: { ...s.settings, grading: { ...s.settings.grading, ...next } } }
        }),
      removeFormType: (id) => {
        const entfernen = (s: AppState) => formularTypEntfernen(s.settings.grading.formTypes, id, s.gradingRecords)
        // Der Ausgang kommt aus derselben Pruefung auf dem zuletzt
        // gezeichneten Stand — wie bei addUser, nicht aus dem Updater.
        const ausgang = entfernen(stateRef.current).ausgang
        patch((s) => {
          const e = entfernen(s)
          return e.ausgang === 'geloescht' ? { settings: { ...s.settings, grading: { ...s.settings.grading, formTypes: e.formTypes } } } : null
        })
        return ausgang
      },

      visibleLessonPlans,
      addLessonPlan: (plan) =>
        patchMitAntwort((s) => {
          if (!darfLessonPlansVerwalten(s.settings, actorOf(s), plan.aircraftType)) return null
          return {
            lessonPlans: [...s.lessonPlans, { ...plan, id: uid('lp'), uploadedBy: s.currentUserId!, createdAt: Date.now() + s.timeOffsetMs }],
          }
        }),
      deleteLessonPlan: (id) =>
        patch((s) => {
          const plan = s.lessonPlans.find((p) => p.id === id)
          if (!plan || !darfLessonPlansVerwalten(s.settings, actorOf(s), plan.aircraftType)) return null
          return { lessonPlans: s.lessonPlans.filter((p) => p.id !== id) }
        }),
      importUsers: (rows, groupIds) => {
        // Doppelte Adressen, Domain, Muster und Gruppe werden hier NOCH
        // einmal geprueft (importPlanen): Die Vorschau prueft gegen den
        // Bestand, aber zwischen Vorschau und Klick kann in einem zweiten Tab
        // jemand denselben Nutzer angelegt haben.
        const planen = (s: AppState) => {
          // Der Import vergibt Rollen — bis hin zum Superadmin. `updateUser`
          // schuetzt die Rolle ausdruecklich („sonst koennte sich ein
          // group_admin selbst befoerdern"); derselbe Riegel gehoert hierher,
          // sonst fuehrt die Tabelle am Schutz vorbei.
          if (!isSuper(s)) return null
          // Gruppen wie beim Anlegen im Dialog: Der Import legte Konten ganz
          // ohne Gruppe an, in einem Zustand, den jeder andere Schreibweg
          // verbietet (Audit 11/2026, VERW-07).
          return importPlanen(s, rows, groupIds, () => uid('u'))
        }
        // Gemeldet wird, was dieselbe Rechnung am zuletzt gezeichneten Stand
        // ergibt — der Updater laeuft nicht zwingend sofort (siehe addUser).
        const angelegt = planen(stateRef.current)?.neue.length ?? 0
        patch((s) => {
          const plan = planen(s)
          if (!plan || plan.neue.length === 0) return null
          // Wie beim Anlegen im Dialog: Ein importierter Superadmin ist
          // zugleich DocCheck-Superadmin und steht im Protokoll (VERW-15).
          const at = Date.now() + s.timeOffsetMs
          const zeilen = plan.neue.flatMap((u) => rollenAudit(null, u, { von: s.currentUserId ?? '', ziel: u.id, at, id: () => uid('dca') }))
          const dc = s.docCheck ?? DC_LEER
          return {
            users: [...s.users, ...plan.neue],
            groups: plan.groups,
            ...(zeilen.length ? { docCheck: { ...dc, audit: [...zeilen, ...dc.audit] } } : {}),
          }
        })
        return angelegt
      },
      visibleNotes,
      saveNote: (n) =>
        patchMitAntwort((s) => {
          const jetzt = Date.now() + s.timeOffsetMs
          const alle = s.notes ?? []
          // Aendern nur an EIGENEN Notizen: Die ID kommt aus der Oberflaeche,
          // aber verlassen darf man sich darauf nicht.
          const vorher = n.id ? alle.find((x) => x.id === n.id && x.authorId === s.currentUserId) : undefined
          if (n.id && !vorher) return null
          const gesaeubert = { title: n.title.trim(), body: n.body.trim() }
          if (!gesaeubert.title) return null
          return {
            notes: vorher
              ? alle.map((x) => (x.id === vorher.id ? { ...x, ...gesaeubert, updatedAt: jetzt } : x))
              : [
                  ...alle,
                  {
                    id: uid('note'),
                    authorId: s.currentUserId!,
                    ...gesaeubert,
                    pinned: false,
                    createdAt: jetzt,
                    updatedAt: jetzt,
                  },
                ],
          }
        }),
      deleteNote: (id) =>
        patch((s) => ({ notes: (s.notes ?? []).filter((n) => !(n.id === id && n.authorId === s.currentUserId)) })),
      /* Logbuch-Korrekturen: IMMER nur am eigenen Logbuch. Fremde Logbuecher
         sind je nach Rolle sichtbar, aber nie schreibbar — ein
         Taetigkeitsnachweis, den ein anderer nachbessern kann, ist keiner. */
      logbookOverride: (eintrag, ov) =>
        patchMitAntwort((s) => {
          if (!s.currentUserId) return null
          const alle = s.logbook ?? {}
          const eigenes: LogbookStand = alle[s.currentUserId] ?? { overrides: {}, manuell: [] }
          // Je Durchgang, nicht je Blatt (Audit 11/2026, LOG-01): Eine
          // Altkorrektur eines anderen Blatts tauchte sonst nach dem
          // Zurücksetzen wieder auf.
          const overrides = overrideSetzen(eigenes.overrides, eintrag, ov)
          return { logbook: { ...alle, [s.currentUserId]: { ...eigenes, overrides } } }
        }),
      logbookAddManual: (e) =>
        patchMitAntwort((s) => {
          if (!s.currentUserId) return null
          const alle = s.logbook ?? {}
          const eigenes: LogbookStand = alle[s.currentUserId] ?? { overrides: {}, manuell: [] }
          return { logbook: { ...alle, [s.currentUserId]: { ...eigenes, manuell: [...eigenes.manuell, { ...e, id: uid('lb') }] } } }
        }),
      logbookUpdateManual: (id, p) =>
        patchMitAntwort((s) => {
          if (!s.currentUserId) return null
          const alle = s.logbook ?? {}
          const eigenes = alle[s.currentUserId]
          if (!eigenes?.manuell.some((m) => m.id === id)) return null
          return {
            logbook: {
              ...alle,
              [s.currentUserId]: { ...eigenes, manuell: eigenes.manuell.map((m) => (m.id === id ? { ...m, ...p } : m)) },
            },
          }
        }),
      logbookDeleteManual: (id) =>
        patch((s) => {
          if (!s.currentUserId) return null
          const alle = s.logbook ?? {}
          const eigenes = alle[s.currentUserId]
          if (!eigenes) return null
          return { logbook: { ...alle, [s.currentUserId]: { ...eigenes, manuell: eigenes.manuell.filter((m) => m.id !== id) } } }
        }),
      toggleNotePin: (id) =>
        patch((s) => {
          const jetzt = Date.now() + s.timeOffsetMs
          return {
            notes: (s.notes ?? []).map((n) =>
              // `updatedAt` bleibt beim Anheften unberuehrt: Anheften ist eine
              // Einordnung, keine inhaltliche Aenderung — sonst sprang eine
              // alte Notiz allein durchs Anheften an die Spitze der Liste.
              n.id === id && n.authorId === s.currentUserId ? { ...n, pinned: !n.pinned, updatedAt: n.updatedAt || jetzt } : n,
            ),
          }
        }),
      gesichert,
    }
  }, [gesichert, state, now, currentUser, sessionExpired, effectiveRetention, visibleMessages, visiblePolls, myGroups, unreadGroups, hasNewInfo, hasNewContacts, latestForeignContent, latestForeignInfo, visibleGradingRecords, visibleLessonPlans, visibleInfoEntries])

  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}

/* Rechtefragen (userHasPerm, userMayModule, isAdminUser, isGroupAdmin) liegen
   in src/adminAccess.ts — dort erreichen sie beide Testwachen. Sie standen
   hier, in einer .tsx-Datei, und jede Rechtefrage der App war ungetestet
   (Audit 11/2026, VERW-02). */

/* `infoIsPublished`, `infoIsExpired` und `infoPublishedAt` liegen in
   src/infoAcks.ts — hier, in einer .tsx-Datei, erreichte sie keine der
   beiden Testwachen, und die Neu-Marke rechnete an zwei Stellen mit ihnen
   verschieden (Audit 11/2026, KERN-11). */

/* `infoEntryAppliesTo` liegt jetzt in src/infoAcks.ts — zusammen mit der
   Frage, wer bestaetigen muss, und damit dort, wo beide Testwachen sie
   erreichen. Hier nur durchgereicht, damit die Aufrufstellen unveraendert
   bleiben und es nicht zwei Fassungen gibt. */
export { infoEntryAppliesTo } from './infoAcks'

/* `mayAccessGroup` liegt in src/gruppen.ts — dort erreichen sie beide
   Testwachen, und die Rechteregeln des Stores (storeRechte.ts) bauen darauf
   auf (Audit 11/2026, KERN-19). Hier nur durchgereicht. */
export { mayAccessGroup } from './gruppen'
