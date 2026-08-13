import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { gradingListComparator, isComplete, isFollowUpType } from './gradingRules'
import { networkReachable } from './net'
import { createSeedState } from './sandbox/seed'
import { migrateState } from './migrateState'
import { SANDBOX } from './sandbox/flag'
import { musterPflicht, nachMuster, sichtbarFuer } from './aircraftScope'
import { RETENTION_MS, type AppState, type Attachment, type ConfigurableRole, type GradingRecord, type GradingSettings, type Group, type LessonPlan, type ModuleKey, type Note, type PermKey, type PollType, type RetentionKey, type Role, type SeenState, type Settings, type User } from './types'
import { backupPersistedState, clearPersistedState, persistState, readPreloadedState, storageReadFailed, subscribeToOtherTabs } from './persist'
import type { InfoEntry } from './types'

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
  switchUser: (userId: string) => void
  advanceTime: (ms: number) => void
  resetSandbox: () => void
  sendMessage: (groupId: string, text: string, attachment?: Attachment) => void
  deleteMessage: (id: string) => void
  createPoll: (groupId: string, question: string, type: PollType, options: string[], validUntil?: number) => void
  vote: (pollId: string, optionIndex: number) => void
  closePoll: (pollId: string) => void
  toggleMute: (groupId: string) => void
  setGroupRetention: (groupId: string, retention: RetentionKey | null) => void
  setGroupMembers: (groupId: string, memberIds: string[]) => void
  addInfoEntry: (entry: Omit<InfoEntry, 'id' | 'authorId' | 'createdAt'>) => void
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
  saveContact: (contact: { id?: string; department: string; position: string; name: string; phone: string; email: string }) => void
  deleteContact: (id: string) => void
  /** Nutzer anlegen — die Zuweisung zu mindestens einer Gruppe ist Pflicht */
  addUser: (user: { name: string; email: string; phone: string; role: Role; groupIds: string[]; aircraftTypes: string[] }) => void
  /** Info-Einträge, die der aktuelle Nutzer sehen darf (Gruppen-Sichtbarkeit) */
  visibleInfoEntries: AppState['infoEntries']
  /** Wie viele gueltige Eintraege wartet der aktuelle Nutzer noch zu bestaetigen? */
  openAcks: number
  updateUser: (id: string, patch: Partial<User>) => void
  addGroup: (name: string, purpose: string, aircraftType?: string) => void
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
  /** Lesson Plans, die der aktuelle Nutzer sehen darf */
  visibleLessonPlans: LessonPlan[]
  /** Nutzer aus einer Tabelle anlegen. Liefert die Anzahl der angelegten. */
  importUsers: (rows: { name: string; email: string; phone: string; role: Role; aircraftTypes: string[]; canGrade: boolean; isTrainee: boolean; canEditDirectory: boolean; active: boolean }[]) => number
  /** Eigene Notizen — fremde sind in dieser Liste gar nicht erst enthalten. */
  visibleNotes: Note[]
  /** Anlegen ODER aendern: ohne `id` entsteht eine neue Notiz. */
  saveNote: (n: { id?: string; title: string; body: string }) => void
  deleteNote: (id: string) => void
  toggleNotePin: (id: string) => void
  addLessonPlan: (plan: { title: string; description: string; aircraftType: string; category: string; fileName: string }) => void
  deleteLessonPlan: (id: string) => void
  /** Rechte-Matrix: darf der aktuelle Nutzer diese Fähigkeit nutzen? */
  can: (key: PermKey) => boolean
  /** Darf der aktuelle Nutzer dieses Modul betreten? (Kachel und Route) */
  moduleAllowed: (module: ModuleKey) => boolean
  setPermission: (role: ConfigurableRole, key: PermKey, value: boolean) => void
  /** Code-Login: Code an die E-Mail „senden“ bzw. prüfen */
  requestLoginCode: (email: string) => boolean
  verifyLoginCode: (code: string) => boolean
}

const StoreCtx = createContext<Store | null>(null)

const USER_KEY = 'aaa-user'
const SESSION_EXP_KEY = 'aaa-session-exp'
/** Bei jeder Änderung an der Form von AppState hochzählen — ein alter
 *  gespeicherter Stand wird dann verworfen statt halb geladen. */
const STATE_VERSION = 2

/** Gespeicherten Anwendungszustand lesen (aus IndexedDB vorgeladen, siehe
 *  persist.ts). Ein unlesbarer oder veralteter Stand wird verworfen, die
 *  App startet dann auf den Seed-Daten. */
function loadPersistedState(): AppState | null {
  try {
    const raw = readPreloadedState()
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: number; state?: AppState }
    if (parsed.v !== STATE_VERSION || !parsed.state?.users?.length) {
      // NICHT mehr löschen: Ein Sprung der STATE_VERSION verwarf bisher den
      // gesamten Bestand — unterschriebene Formulare eingeschlossen — und
      // zwar wortlos. Der alte Stand wird jetzt beiseitegelegt und bleibt
      // auslesbar; die App startet daneben auf den Seed-Daten.
      backupPersistedState(raw, parsed.v)
      return null
    }
    return parsed.state
  } catch {
    return null
  }
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
   * 5-Sekunden-Takt unten erzeugt alle fuenf Sekunden eine neue Referenz.
   * Die Folge war eine vollstaendige Serialisierung des Bestands samt
   * Unterschriftsbildern (gemessen bis 14 MB) alle fuenf Sekunden, nur um
   * per Volltextvergleich festzustellen, dass sich nichts geaendert hat —
   * mitten in eine laufende Unterschriftsgeste hinein.
   */
  const [rev, setRev] = useState(0)
  /** Zeitpunkt der letzten EIGENEN Aenderung — entscheidet beim Tab-Abgleich. */
  const lastChangeAt = useRef(0)

  // Automatische Aktualisierung alle 5 Sekunden: neue Nachrichten erscheinen
  // ohne manuelles Neuladen, abgelaufene werden ausgeblendet. In der
  // Produktivversion übernimmt das eine Supabase-Realtime-Subscription.
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
       */
      setState((s) => {
        if (!s.currentUserId) return { ...s }
        let abgelaufen = false
        try {
          abgelaufen = Number(localStorage.getItem(SESSION_EXP_KEY) ?? 0) <= Date.now()
        } catch {
          /* ohne localStorage bleibt es bei der Sitzung dieses Tabs */
        }
        const gesperrt = !s.users.some((u) => u.id === s.currentUserId && u.active)
        if (!abgelaufen && !gesperrt) return { ...s }
        persistUser(null)
        return { ...s, currentUserId: null }
      })
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  // Zustand sichern. Der 5-Sekunden-Takt oben erzeugt bei gleichem Inhalt eine
  // neue Referenz — deshalb wird nur geschrieben, wenn sich der serialisierte
  // Stand tatsächlich geändert hat.
  const lastPersisted = useRef<string>('')
  const schreiben = useCallback(() => {
    const json = JSON.stringify({ v: STATE_VERSION, state: stateRef.current, at: lastChangeAt.current })
    if (json === lastPersisted.current) return
    lastPersisted.current = json
    void persistState(json).then((ok) => {
      // Fehlgeschlagen (Ablage voll, Speicherfehler): Merker zuruecksetzen,
      // damit der naechste Lauf es erneut versucht. Vorher galt der Stand
      // als gesichert, lag aber nirgends — und niemand versuchte es wieder.
      if (!ok) lastPersisted.current = ''
    })
  }, [])
  useEffect(() => {
    const tm = setTimeout(schreiben, 400)
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
    const sofort = () => schreiben()
    const beiVerdeckt = () => document.visibilityState === 'hidden' && schreiben()
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
          const parsed = JSON.parse(raw) as { v?: number; at?: number; state?: AppState }
          if (parsed.v !== STATE_VERSION || !parsed.state?.users?.length) return
          /*
           * Nur einen JUENGEREN Stand uebernehmen.
           *
           * Bisher ersetzte der Empfaenger seinen gesamten Zustand, ohne zu
           * fragen, wie alt der fremde ist. Ablauf: Tab A ruft seinen Stand
           * aus; unmittelbar danach unterschreibt jemand in Tab B (die
           * Sicherung steht noch im 400-ms-Zeitgeber); dann trifft A's Ruf
           * ein — und B's Unterschrift ist aus dem Speicher UND aus dem
           * Schreibpfad verschwunden, lautlos. Ein fremder Stand, der aelter
           * ist als die eigene letzte Aenderung, wird deshalb verworfen; die
           * eigene Sicherung laeuft ohnehin gleich und ruft ihn dann aus.
           */
          if ((parsed.at ?? 0) < lastChangeAt.current) return
          lastPersisted.current = raw
          setState((s) => ({ ...parsed.state!, currentUserId: s.currentUserId, timeOffsetMs: s.timeOffsetMs }))
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
    [state, effectiveRetention, now],
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
    [state, effectiveRetention, now],
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
  }, [state.infoEntries, state.groups, state.settings, currentUser, now])

  const latestForeignInfo = visibleInfoEntries.reduce(
    (max, e) => (e.authorId !== state.currentUserId ? Math.max(max, infoPublishedAt(e)) : max),
    0,
  )
  const hasNewInfo = !!state.currentUserId && latestForeignInfo > seenOfCurrent.info
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
  }, [visibleInfoEntries, state.infoAcks, state.currentUserId, state.groups, now])
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
  }, [state.gradingRecords, state.settings, currentUser, now])

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
        // Der Zeitpunkt entscheidet, ob der Stand eines anderen Tabs
        // uebernommen werden darf (siehe Abgleich unten).
        lastChangeAt.current = Date.now()
        setRev((r) => r + 1)
        return { ...s, ...p }
      })

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
      return s.groups.find((g) => g.id === groupId)?.adminIds.includes(actor.id) ?? false
    }
    /** E-Mail ist die einzige Anmeldekennung und muss eindeutig bleiben. */
    const emailTaken = (s: AppState, email: string, exceptId?: string) =>
      s.users.some((u) => u.id !== exceptId && u.email.trim().toLowerCase() === email.trim().toLowerCase())
    /** Gruppen eines Nutzers — für die Pflicht „mindestens eine Gruppe" */
    const groupsOf = (s: AppState, userId: string) => s.groups.filter((g) => g.memberIds.includes(userId))

    return {
      state,
      now,
      currentUser,
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
          if (latestForeignInfo <= prev.info) return null
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
        const domains = state.settings.allowedDomains
        if (domains.length > 0 && !domains.some((d) => needle.endsWith(`@${d.toLowerCase()}`))) return false
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
        const domains = state.settings.allowedDomains
        if (domains.length > 0 && !domains.some((d) => needle.endsWith(`@${d.toLowerCase()}`))) return false
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

      sendMessage: (groupId, text, attachment) =>
        patch((s) => {
          // Chat-Sperre greift auch hier, nicht nur in der Oberfläche
          if (s.users.find((u) => u.id === s.currentUserId)?.chatBlocked) return null
          // Nur Mitglieder der Gruppe dürfen darin schreiben.
          if (!s.groups.find((g) => g.id === groupId)?.memberIds.includes(s.currentUserId ?? '')) return null
          // Das Upload-Limit aus den Einstellungen gilt auch für Anhänge.
          if (attachment && attachment.sizeMB > s.settings.maxUploadMB) return null
          return {
            messages: [
              ...s.messages,
              { id: uid('m'), groupId, authorId: s.currentUserId!, text, createdAt: Date.now() + s.timeOffsetMs, attachment },
            ],
          }
        }),
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

      createPoll: (groupId, question, type, options, validUntil) =>
        patch((s) => {
          if (s.users.find((u) => u.id === s.currentUserId)?.chatBlocked) return null
          // Eine Umfrage, deren Gültigkeit schon abgelaufen ist, käme
          // geschlossen zur Welt — niemand könnte je abstimmen.
          if (validUntil !== undefined && validUntil <= Date.now() + s.timeOffsetMs) return null
          return {
            polls: [
              ...s.polls,
              { id: uid('p'), groupId, authorId: s.currentUserId!, question, type, options, votes: {}, closed: false, validUntil, createdAt: Date.now() + s.timeOffsetMs },
            ],
          }
        }),
      vote: (pollId, optionIndex) =>
        patch((s) => ({
          polls: s.polls.map((p) =>
            // Abstimmen nur solange offen und nicht abgelaufen (Gültigkeit in UTC)
            p.id === pollId && !p.closed && !(p.validUntil && p.validUntil <= Date.now() + s.timeOffsetMs)
              ? { ...p, votes: { ...p.votes, [s.currentUserId!]: optionIndex } }
              : p,
          ),
        })),
      closePoll: (pollId) =>
        patch((s) => ({ polls: s.polls.map((p) => (p.id === pollId ? { ...p, closed: true } : p)) })),

      toggleMute: (groupId) =>
        patch((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, muted: !g.muted } : g)) })),
      setGroupRetention: (groupId, retention) =>
        patch((s) =>
          maySeeGroup(s, groupId) ? { groups: s.groups.map((g) => (g.id === groupId ? { ...g, retention } : g)) } : null,
        ),
      setGroupMembers: (groupId, memberIds) =>
        patch((s) => {
          if (!maySeeGroup(s, groupId)) return null
          const group = s.groups.find((g) => g.id === groupId)
          if (!group) return null
          // „Mindestens eine Gruppe" gilt auch hier: wer sonst nirgends
          // Mitglied ist, kann nicht aus seiner letzten Gruppe fallen.
          const dropped = group.memberIds.filter((m) => !memberIds.includes(m))
          if (dropped.some((m) => groupsOf(s, m).length <= 1)) return null
          return {
            groups: s.groups.map((g) =>
              g.id === groupId
                ? // Wer die Gruppe verlässt, verliert auch seine Adminrechte
                  // darin — sonst verwaltet ein Außenstehender weiter mit.
                  { ...g, memberIds, adminIds: g.adminIds.filter((a) => memberIds.includes(a)) }
                : g,
            ),
          }
        }),

      addInfoEntry: (entry) =>
        patch((s) => ({
          infoEntries: [
            ...s.infoEntries,
            { ...entry, id: uid('i'), authorId: s.currentUserId!, createdAt: Date.now() + s.timeOffsetMs },
          ],
        })),
      deleteInfoEntry: (id) => patch((s) => ({ infoEntries: s.infoEntries.filter((e) => e.id !== id) })),
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
        patch((s) => ({
          feedbackEntries: [
            ...s.feedbackEntries,
            { ...entry, id: uid('fb'), authorId: s.currentUserId!, createdAt: Date.now() + s.timeOffsetMs },
          ],
        })),
      deleteFeedback: (id) => patch((s) => ({ feedbackEntries: s.feedbackEntries.filter((f) => f.id !== id) })),
      // Bearbeitet: wer und wann werden festgehalten; die Rückmeldung bleibt
      // erhalten und wandert in der Ansicht unter die offenen.
      resolveFeedback: (id, note) =>
        patch((s) => ({
          feedbackEntries: s.feedbackEntries.map((f) =>
            f.id === id
              ? { ...f, resolvedBy: s.currentUserId!, resolvedAt: Date.now() + s.timeOffsetMs, resolutionNote: note.trim() || undefined }
              : f,
          ),
        })),
      reopenFeedback: (id) =>
        patch((s) => ({
          feedbackEntries: s.feedbackEntries.map((f) =>
            f.id === id ? { ...f, resolvedBy: undefined, resolvedAt: undefined, resolutionNote: undefined } : f,
          ),
        })),

      saveContact: (contact) =>
        patch((s) => ({
          contacts: contact.id
            ? s.contacts.map((c) => (c.id === contact.id ? { ...c, ...contact, id: contact.id } : c))
            : [...s.contacts, { ...contact, id: uid('c') }],
          contactsChangedAt: Date.now() + s.timeOffsetMs,
        })),
      deleteContact: (id) =>
        patch((s) => ({
          contacts: s.contacts.filter((c) => c.id !== id),
          contactsChangedAt: Date.now() + s.timeOffsetMs,
        })),

      addUser: ({ groupIds, ...user }) =>
        patch((s) => {
          /* Invarianten auch im Store, nicht nur im Dialog: ohne Gruppe, ohne
             Muster und ohne E-Mail kein neuer Nutzer. Die E-Mail ist die
             einzige Anmeldekennung; die Gruppe steuert Chat und Instructor
             Info; das Muster steuert, welche Lesson Plans jemand ueberhaupt
             sieht. Ein Konto ohne Muster ist fuer nichts zustaendig — und das
             gilt fuer den Admin genauso wie fuer den Instruktor. */
          if (groupIds.length === 0 || !user.email.trim()) return null
          // Musterpflicht nur fuer die Rollen, deren Sicht daran haengt.
          if (musterPflicht(user.role) && (user.aircraftTypes ?? []).length === 0) return null
          // Doppelte Adresse hieße: zwei Konten, ein Login — der zweite
          // Nutzer könnte die Identität des ersten übernehmen.
          if (emailTaken(s, user.email)) return null
          const id = uid('u')
          return {
            users: [...s.users, { ...user, id, canEditDirectory: false, canGrade: false, isTrainee: false, active: true }],
            // Pflicht-Gruppenzuweisung: neue Nutzer landen sofort in ihren Gruppen
            groups: s.groups.map((g) => (groupIds.includes(g.id) ? { ...g, memberIds: [...g.memberIds, id] } : g)),
          }
        }),
      updateUser: (id, p) =>
        patch((s) => {
          const target = s.users.find((u) => u.id === id)
          if (!target) return null
          // Die Rolle vergibt ausschließlich der Superadmin. Sonst könnte sich
          // ein group_admin über eine offen gebliebene Ansicht selbst befördern.
          const safe: Partial<User> = isSuper(s) ? { ...p } : { ...p, role: undefined }
          // E-Mail bleibt eindeutig — sie ist die einzige Anmeldekennung.
          if (safe.email !== undefined && (!safe.email.trim() || emailTaken(s, safe.email, id))) delete safe.email
          // Die Organisation braucht immer mindestens einen Superadmin.
          const lastSuper =
            target.role === 'superadmin' && s.users.filter((u) => u.role === 'superadmin' && u.active).length <= 1
          if (lastSuper && (safe.role !== undefined && safe.role !== 'superadmin')) delete safe.role
          if (lastSuper && safe.active === false) delete safe.active
          // Sich selbst stillzulegen sperrt einen aus der laufenden Sitzung aus.
          if (id === s.currentUserId && safe.active === false) delete safe.active
          const users = s.users.map((u) => (u.id === id ? { ...u, ...safe } : u))
          // Wer deaktiviert wird, verliert seine Sitzung — in der Sandbox ist
          // das die aktuell angemeldete Identität.
          if (safe.active === false && s.currentUserId === id) {
            persistUser(null)
            return { users, currentUserId: null }
          }
          return { users }
        }),

      addGroup: (name, purpose, aircraftType) =>
        patch((s) => {
          // Leere oder doppelte Namen wären im Chat nicht unterscheidbar.
          if (!name.trim() || s.groups.some((g) => g.name.trim().toLowerCase() === name.trim().toLowerCase())) return null
          // Wer die Gruppe anlegt (Admin/Superadmin), verwaltet sie auch
          // und ist sofort Mitglied.
          const creator = s.currentUserId ? [s.currentUserId] : []
          return {
            groups: [
              ...s.groups,
              { id: uid('g'), name, purpose, aircraftType, adminIds: creator, memberIds: creator, retention: null, muted: false },
            ],
          }
        }),
      setGroupAircraft: (id, aircraftType) =>
        patch((s) => (maySeeGroup(s, id) ? { groups: s.groups.map((g) => (g.id === id ? { ...g, aircraftType } : g)) } : null)),
      renameGroup: (id, name) =>
        patch((s) => {
          if (!maySeeGroup(s, id) || !name.trim()) return null
          // Doppelte Gruppennamen sind im Chat nicht auseinanderzuhalten.
          if (s.groups.some((g) => g.id !== id && g.name.trim().toLowerCase() === name.trim().toLowerCase())) return null
          return { groups: s.groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)) }
        }),
      // Gleiche Regel wie in deleteGroup — die Oberfläche muss den Grund
      // NENNEN können, statt den Klick wirkungslos verpuffen zu lassen.
      groupDeleteBlockers: (id) => {
        const group = state.groups.find((g) => g.id === id)
        if (!group) return []
        return group.memberIds
          .filter((m) => groupsOf(state, m).length <= 1)
          .map((m) => state.users.find((u) => u.id === m))
          .filter((u): u is User => !!u)
      },
      deleteGroup: (id) =>
        patch((s) => {
          if (!maySeeGroup(s, id)) return null
          // Niemand darf ohne Gruppe zurückbleiben — sonst verliert er
          // Chat-Zugang und Instructor-Info-Sichtbarkeit.
          const orphan = s.groups.find((g) => g.id === id)?.memberIds.some((m) => groupsOf(s, m).length <= 1)
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
        patch((s) =>
          maySeeGroup(s, id)
            ? // Adminrechte nur für Mitglieder der Gruppe — wer nicht drin ist,
              // kann sie auch nicht verwalten.
              { groups: s.groups.map((g) => (g.id === id ? { ...g, adminIds: adminIds.filter((a) => g.memberIds.includes(a)) } : g)) }
            : null,
        ),

      updateSettings: (p) =>
        patch((s) => {
          const next = { ...p }
          // Ein Muster, das noch an Gruppen, Nutzern, Lesson Plans oder
          // Formularen hängt, darf nicht verschwinden — sonst zeigen diese
          // Verweise ins Leere.
          if (next.aircraftTypes) {
            const removed = s.settings.aircraftTypes.filter((a) => !next.aircraftTypes!.includes(a))
            const stillUsed = removed.filter(
              (a) =>
                s.groups.some((g) => g.aircraftType === a) ||
                s.users.some((u) => u.aircraftTypes.includes(a)) ||
                s.lessonPlans.some((l) => l.aircraftType === a) ||
                s.gradingRecords.some((r) => r.header.aircraftType === a) ||
                s.infoEntries.some((e) => e.aircraftType === a),
            )
            if (stillUsed.length > 0) next.aircraftTypes = [...next.aircraftTypes!, ...stillUsed]
          }
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
            // 306 und 310 sind Pflicht-Folgeformulare: Die Regeln verlangen sie
            // bei „Not Competent" bzw. „Session not completed". Ohne sie im
            // Katalog ließe sich ein solcher Durchgang gar nicht abschließen —
            // sie bleiben deshalb unabhängig davon, ob schon Datensätze
            // existieren.
            const stillUsed = removed.filter(
              (f) => f.id === '306' || f.id === '310' || s.gradingRecords.some((r) => r.formTypeId === f.id),
            )
            if (stillUsed.length > 0) next.formTypes = [...next.formTypes!, ...stillUsed]
          }
          return { settings: { ...s.settings, grading: { ...s.settings.grading, ...next } } }
        }),

      visibleLessonPlans,
      addLessonPlan: (plan) =>
        patch((s) => ({
          lessonPlans: [...s.lessonPlans, { ...plan, id: uid('lp'), uploadedBy: s.currentUserId!, createdAt: Date.now() + s.timeOffsetMs }],
        })),
      deleteLessonPlan: (id) => patch((s) => ({ lessonPlans: s.lessonPlans.filter((p) => p.id !== id) })),
      importUsers: (rows) => {
        // Doppelte Adressen werden hier NOCH einmal abgewiesen: Die Vorschau
        // prueft gegen den Bestand, aber zwischen Vorschau und Klick kann in
        // einem zweiten Tab jemand denselben Nutzer angelegt haben.
        let angelegt = 0
        patch((s) => {
          // Der Import vergibt Rollen — bis hin zum Superadmin. `updateUser`
          // schuetzt die Rolle ausdruecklich („sonst koennte sich ein
          // group_admin selbst befoerdern"); derselbe Riegel gehoert hierher,
          // sonst fuehrt die Tabelle am Schutz vorbei.
          if (!isSuper(s)) return null
          const vergeben = new Set(s.users.map((u) => u.email.trim().toLowerCase()))
          const erlaubt = s.settings.allowedDomains.map((d) => d.toLowerCase())
          const neue = rows
            .filter((r) => {
              const mail = r.email.trim().toLowerCase()
              if (!mail || vergeben.has(mail)) return false
              // Auch im Store gegen die Domainliste pruefen, nicht nur in der
              // Vorschau: Wer sich nie anmelden kann, soll gar nicht erst
              // entstehen — die Liste kann sich zwischen Vorschau und Klick
              // geaendert haben.
              if (erlaubt.length > 0 && !erlaubt.some((d) => mail.endsWith(`@${d}`))) return false
              vergeben.add(mail)
              return true
            })
            .map((r) => ({
              id: uid('u'),
              name: r.name.trim(),
              email: r.email.trim().toLowerCase(),
              phone: r.phone.trim(),
              role: r.role,
              canEditDirectory: r.canEditDirectory,
              canGrade: r.canGrade,
              isTrainee: r.isTrainee,
              aircraftTypes: r.aircraftTypes,
              active: r.active,
            }))
          angelegt = neue.length
          return neue.length > 0 ? { users: [...s.users, ...neue] } : null
        })
        return angelegt
      },
      visibleNotes,
      saveNote: (n) =>
        patch((s) => {
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
    }
  }, [state, now, currentUser, effectiveRetention, visibleMessages, visiblePolls, myGroups, unreadGroups, hasNewInfo, hasNewContacts, latestForeignContent, latestForeignInfo, visibleGradingRecords, visibleLessonPlans, visibleInfoEntries])

  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}

/** Darf der Nutzer in dieser Gruppe administrieren? */
/** Admin-Rechte: Superadmin und Admin — NICHT der nur-lesende Training Admin */
export function isAdminUser(user: { role: Role } | null | undefined): boolean {
  return user?.role === 'superadmin' || user?.role === 'group_admin'
}

/**
 * Rechte-Matrix: Superadmin darf immer alles; Mitglieder werden über die
 * Flags am Nutzer gesteuert (canGrade, canEditDirectory); Admin und
 * Training Admin folgen der im Superadmin-Panel gepflegten Matrix.
 */
/**
 * Darf dieser Nutzer das Modul überhaupt betreten? Der Training Admin ist auf
 * die Formularablage begrenzt; weitere Module öffnen sich nur, wenn die
 * Rechte-Matrix sie ihm freischaltet. Alle anderen Rollen sehen alles —
 * die Feinsteuerung passiert innerhalb der Module.
 */
export function userMayModule(settings: Settings, user: User | null | undefined, module: ModuleKey): boolean {
  if (!user) return false
  if (module === 'grading') return userHasPerm(settings, user, 'grading_create') || userHasPerm(settings, user, 'grading_view_all')
  if (user.role !== 'training_admin') return true
  if (module === 'info') return userHasPerm(settings, user, 'info_manage')
  if (module === 'lessons') return userHasPerm(settings, user, 'lessons_manage')
  if (module === 'contacts') return userHasPerm(settings, user, 'contacts_manage')
  // Notizen bekommt der Training Admin bewusst nicht: Seine Rolle ist die
  // lesende Sicht auf die Formularablage, keine Instruktorentaetigkeit — er
  // hat nichts, wofuer er sich etwas fuer die naechste Session merken muesste.
  return false
}

export function userHasPerm(settings: Settings, user: User | null | undefined, key: PermKey): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  if (user.role === 'member') {
    if (key === 'grading_create') return user.canGrade
    if (key === 'contacts_manage') return user.canEditDirectory
    return false
  }
  return settings.permissions[user.role]?.[key] ?? false
}

export function isGroupAdmin(user: User | null, group: Group): boolean {
  if (!user) return false
  return user.role === 'superadmin' || group.adminIds.includes(user.id)
}

/** Ist der Eintrag schon veröffentlicht? „Gültig ab“ in der Zukunft heißt:
 *  noch nicht sichtbar und nicht bestätigbar (nur Verwalter sehen ihn). */
export function infoIsPublished(entry: { validFrom?: string }, ts: number): boolean {
  if (!entry.validFrom) return true
  const from = new Date(`${entry.validFrom}T00:00:00`).getTime()
  return Number.isNaN(from) || from <= ts
}

/** Abgelaufen? Nach dem Gültigkeitsende ist der Eintrag nicht mehr
 *  bestätigungspflichtig — eine Bestätigung auf ein überholtes Dokument
 *  landete sonst als „gelesen" in der Kontrollliste. */
export function infoIsExpired(entry: { validUntil?: string }, ts: number): boolean {
  if (!entry.validUntil) return false
  const until = new Date(`${entry.validUntil}T23:59:59`).getTime()
  return !Number.isNaN(until) && until < ts
}

/** Ab wann der Eintrag für die Leser sichtbar wurde — maßgeblich für die
 *  „Neu"-Markierung. Ein vorbereiteter Eintrag ging bisher ohne Markierung
 *  online, weil ab seiner Erstellung gerechnet wurde. */
export function infoPublishedAt(entry: { validFrom?: string; createdAt: number }): number {
  if (!entry.validFrom) return entry.createdAt
  const from = new Date(`${entry.validFrom}T00:00:00`).getTime()
  return Number.isNaN(from) ? entry.createdAt : Math.max(entry.createdAt, from)
}

/** Gilt ein Info-Eintrag für diesen Nutzer? (leer = alle Gruppen) — eine
 *  einzige Quelle für Sichtbarkeit UND Bestätigungsziele. */
export function infoEntryAppliesTo(entry: { groupIds?: string[] }, userId: string, groups: Group[]): boolean {
  return (
    !entry.groupIds?.length ||
    entry.groupIds.some((gid) => groups.find((g) => g.id === gid)?.memberIds.includes(userId))
  )
}

/** Darf der Nutzer diesen Chat betreten? Mitglieder, Gruppen-Admins, Superadmin. */
export function mayAccessGroup(user: User | null, group: Group): boolean {
  if (!user) return false
  /* Der Musterbereich gilt auch hier, nicht nur in der Liste. Sonst waere die
     Filterung reine Kosmetik: Die Chatliste zeigte die Gruppe nicht, wer die
     Adresse kannte, war trotzdem drin. Dieselbe Luecke gab es schon einmal
     bei den Formularen (#29). */
  if (!sichtbarFuer(user, group.aircraftType)) return false
  return group.memberIds.includes(user.id) || isGroupAdmin(user, group)
}
