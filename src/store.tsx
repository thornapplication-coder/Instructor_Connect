import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createSeedState } from './sandbox/seed'
import { RETENTION_MS, type AppState, type Attachment, type ConfigurableRole, type GradingRecord, type GradingSettings, type Group, type LessonPlan, type PermKey, type PollType, type RetentionKey, type Role, type SeenState, type Settings, type User } from './types'
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
  submitFeedback: (entry: { category: string; recipient: string; urgent: boolean; message: string; attachment?: Attachment }) => void
  deleteFeedback: (id: string) => void
  saveContact: (contact: { id?: string; department: string; position: string; name: string; phone: string; email: string }) => void
  deleteContact: (id: string) => void
  /** Nutzer anlegen — die Zuweisung zu mindestens einer Gruppe ist Pflicht */
  addUser: (user: { name: string; email: string; phone: string; role: Role; groupIds: string[] }) => void
  /** Info-Einträge, die der aktuelle Nutzer sehen darf (Gruppen-Sichtbarkeit) */
  visibleInfoEntries: AppState['infoEntries']
  updateUser: (id: string, patch: Partial<User>) => void
  deleteUser: (id: string) => void
  addGroup: (name: string, purpose: string) => void
  renameGroup: (id: string, name: string) => void
  deleteGroup: (id: string) => void
  setGroupAdmins: (id: string, adminIds: string[]) => void
  updateSettings: (patch: Partial<AppState['settings']>) => void
  /** Formulare, die der aktuelle Nutzer sehen darf (eigene; Admins alle) */
  visibleGradingRecords: GradingRecord[]
  saveGradingRecord: (record: GradingRecord) => void
  /** entfernt ein Formular nur aus der Instruktor-Ansicht — Admin behält es */
  hideGradingRecord: (id: string) => void
  retryGradingMail: (id: string) => void
  updateGrading: (patch: Partial<GradingSettings>) => void
  /** Lesson Plans, die der aktuelle Nutzer sehen darf */
  visibleLessonPlans: LessonPlan[]
  addLessonPlan: (plan: { title: string; description: string; aircraftType: string; fileName: string }) => void
  deleteLessonPlan: (id: string) => void
  /** Rechte-Matrix: darf der aktuelle Nutzer diese Fähigkeit nutzen? */
  can: (key: PermKey) => boolean
  setPermission: (role: ConfigurableRole, key: PermKey, value: boolean) => void
  /** Code-Login: Code an die E-Mail „senden“ bzw. prüfen */
  requestLoginCode: (email: string) => boolean
  verifyLoginCode: (code: string) => boolean
}

const StoreCtx = createContext<Store | null>(null)

const USER_KEY = 'aaa-user'
const SESSION_EXP_KEY = 'aaa-session-exp'

/** Sitzungen gelten bis Mitternacht (lokal) — außer man meldet sich ab. */
function endOfDay(): number {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** Angemeldet bleiben bis Mitternacht: gespeicherte Anmeldung wiederherstellen,
 *  solange der Nutzer existiert, aktiv ist und die Sitzung nicht abgelaufen ist. */
function initialState(): AppState {
  const seed = createSeedState()
  try {
    const savedId = localStorage.getItem(USER_KEY)
    const exp = Number(localStorage.getItem(SESSION_EXP_KEY) ?? 0)
    if (savedId && exp > Date.now() && seed.users.some((u) => u.id === savedId && u.active)) {
      return { ...seed, currentUserId: savedId }
    }
    if (savedId) {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(SESSION_EXP_KEY)
    }
  } catch {
    /* ohne localStorage startet die App abgemeldet */
  }
  return seed
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

  // Automatische Aktualisierung alle 5 Sekunden: neue Nachrichten erscheinen
  // ohne manuelles Neuladen, abgelaufene werden ausgeblendet. In der
  // Produktivversion übernimmt das eine Supabase-Realtime-Subscription.
  useEffect(() => {
    const iv = setInterval(() => setState((s) => ({ ...s })), 5000)
    return () => clearInterval(iv)
  }, [])

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
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [state.groups, state.currentUserId],
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
  const visibleInfoEntries = useMemo(() => {
    if (!currentUser) return []
    if (userHasPerm(state.settings, currentUser, 'info_manage')) return state.infoEntries
    return state.infoEntries.filter(
      (e) => infoEntryAppliesTo(e, currentUser.id, state.groups) && infoIsPublished(e, now()),
    )
  }, [state.infoEntries, state.groups, state.settings, currentUser, now])

  const latestForeignInfo = visibleInfoEntries.reduce(
    (max, e) => (e.authorId !== state.currentUserId ? Math.max(max, e.createdAt) : max),
    0,
  )
  const hasNewInfo = !!state.currentUserId && latestForeignInfo > seenOfCurrent.info
  const hasNewContacts = !!state.currentUserId && state.contactsChangedAt > seenOfCurrent.contacts

  // Instruktoren sehen ihre eigenen Formulare eine Woche lang, Admins alles
  // unbegrenzt. Jede/r kann Formulare aus der EIGENEN Listenansicht
  // entfernen (hiddenFor je Nutzer) — im Admin-Panel bleibt alles erhalten
  // und für andere Nutzer ändert sich nichts. Neueste immer zuoberst.
  const visibleGradingRecords = useMemo(() => {
    if (!currentUser) return []
    const all = [...state.gradingRecords]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((r) => !r.hiddenFor?.includes(currentUser.id))
    if (userHasPerm(state.settings, currentUser, 'grading_view_all')) return all
    const weekMs = 7 * 24 * 3600_000
    return all.filter((r) => r.instructorId === currentUser.id && now() - r.createdAt < weekMs)
  }, [state.gradingRecords, state.settings, currentUser, now])

  // Instruktoren sehen nur Lesson Plans ihrer zugewiesenen Muster;
  // Admins und Superadmin sehen alle.
  const visibleLessonPlans = useMemo(() => {
    if (!currentUser) return []
    const all = [...state.lessonPlans].sort((a, b) => a.title.localeCompare(b.title))
    if (userHasPerm(state.settings, currentUser, 'lessons_manage')) return all
    return all.filter((p) => currentUser.aircraftTypes.includes(p.aircraftType))
  }, [state.lessonPlans, state.settings, currentUser])

  const store = useMemo<Store>(() => {
    // patch: fn liefert die Änderung oder null für „nichts zu tun“ — dann
    // bleibt die State-Referenz identisch und React rendert nicht neu.
    // Das macht die mark*-Funktionen idempotent und effekt-sicher.
    const patch = (fn: (s: AppState) => Partial<AppState> | null) =>
      setState((s) => {
        const p = fn(s)
        return p ? { ...s, ...p } : s
      })

    const seenOf = (s: AppState) => (s.currentUserId && s.seen[s.currentUserId]) || EMPTY_SEEN

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
        // Anmeldung ausschließlich per E-Mail — die Adressen legt der
        // Admin/Superadmin im Admin Panel an
        const needle = identifier.trim().toLowerCase()
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
        if (!user) return false
        const code = String(Math.floor(100000 + Math.random() * 900000))
        patch(() => ({ pendingLogin: { email: user.email, code, expiresAt: endOfDay() } }))
        return true
      },
      verifyLoginCode: (code) => {
        const pending = state.pendingLogin
        if (!pending || pending.expiresAt < Date.now() || pending.code !== code.trim()) return false
        const user = state.users.find((u) => u.active && u.email === pending.email)
        if (!user) return false
        persistUser(user.id)
        patch(() => ({ currentUserId: user.id, pendingLogin: null }))
        return true
      },
      can: (key) => userHasPerm(state.settings, currentUser, key),
      setPermission: (role, key, value) =>
        patch((s) => ({
          settings: {
            ...s.settings,
            permissions: { ...s.settings.permissions, [role]: { ...s.settings.permissions[role], [key]: value } },
          },
        })),
      logout: () => {
        persistUser(null)
        patch(() => ({ currentUserId: null }))
      },
      switchUser: (userId) => {
        persistUser(userId)
        patch(() => ({ currentUserId: userId }))
      },
      advanceTime: (ms) => patch((s) => ({ timeOffsetMs: s.timeOffsetMs + ms })),
      resetSandbox: () => setState(() => ({ ...createSeedState(), currentUserId: state.currentUserId })),

      sendMessage: (groupId, text, attachment) =>
        patch((s) => {
          // Chat-Sperre greift auch hier, nicht nur in der Oberfläche
          if (s.users.find((u) => u.id === s.currentUserId)?.chatBlocked) return null
          return {
            messages: [
              ...s.messages,
              { id: uid('m'), groupId, authorId: s.currentUserId!, text, createdAt: Date.now() + s.timeOffsetMs, attachment },
            ],
          }
        }),
      deleteMessage: (id) => patch((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

      createPoll: (groupId, question, type, options, validUntil) =>
        patch((s) => {
          if (s.users.find((u) => u.id === s.currentUserId)?.chatBlocked) return null
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
        patch((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, retention } : g)) })),
      setGroupMembers: (groupId, memberIds) =>
        patch((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, memberIds } : g)) })),

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
      // Bestätigen erst möglich, wenn der Eintrag auch gilt
      acknowledgeInfo: (id) =>
        patch((s) => {
          if (!s.currentUserId) return null
          const entry = s.infoEntries.find((e) => e.id === id)
          if (!entry || !infoIsPublished(entry, Date.now() + s.timeOffsetMs)) return null
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
          // Invarianten auch im Store: ohne Gruppe und ohne E-Mail kein
          // neuer Nutzer — die E-Mail ist die einzige Anmeldekennung
          if (groupIds.length === 0 || !user.email.trim()) return null
          const id = uid('u')
          return {
            users: [...s.users, { ...user, id, canEditDirectory: false, canGrade: false, isTrainee: false, aircraftTypes: [], active: true }],
            // Pflicht-Gruppenzuweisung: neue Nutzer landen sofort in ihren Gruppen
            groups: s.groups.map((g) => (groupIds.includes(g.id) ? { ...g, memberIds: [...g.memberIds, id] } : g)),
          }
        }),
      updateUser: (id, p) =>
        patch((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...p } : u)) })),
      deleteUser: (id) =>
        patch((s) => ({
          users: s.users.filter((u) => u.id !== id),
          groups: s.groups.map((g) => ({
            ...g,
            memberIds: g.memberIds.filter((m) => m !== id),
            adminIds: g.adminIds.filter((m) => m !== id),
          })),
        })),

      addGroup: (name, purpose) =>
        patch((s) => ({
          groups: [
            ...s.groups,
            { id: uid('g'), name, purpose, adminIds: [], memberIds: [], retention: null, muted: false },
          ],
        })),
      renameGroup: (id, name) =>
        patch((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, name } : g)) })),
      deleteGroup: (id) =>
        patch((s) => ({
          groups: s.groups.filter((g) => g.id !== id),
          messages: s.messages.filter((m) => m.groupId !== id),
          polls: s.polls.filter((p) => p.groupId !== id),
          // Zielgruppen-Verweise bereinigen: sonst würden Einträge, die nur
          // auf die gelöschte Gruppe zeigten, für alle unsichtbar
          infoEntries: s.infoEntries.map((e) =>
            e.groupIds?.includes(id) ? { ...e, groupIds: e.groupIds.filter((g) => g !== id) } : e,
          ),
        })),
      setGroupAdmins: (id, adminIds) =>
        patch((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, adminIds } : g)) })),

      updateSettings: (p) => patch((s) => ({ settings: { ...s.settings, ...p } })),

      visibleGradingRecords,
      saveGradingRecord: (record) =>
        patch((s) => ({
          gradingRecords: s.gradingRecords.some((r) => r.id === record.id)
            ? s.gradingRecords.map((r) => (r.id === record.id ? record : r))
            : [...s.gradingRecords, record],
        })),
      hideGradingRecord: (id) =>
        patch((s) => ({
          gradingRecords: s.gradingRecords.map((r) =>
            r.id === id && !r.hiddenFor?.includes(s.currentUserId!)
              ? { ...r, hiddenFor: [...(r.hiddenFor ?? []), s.currentUserId!] }
              : r,
          ),
        })),
      retryGradingMail: (id) =>
        patch((s) => ({
          gradingRecords: s.gradingRecords.map((r) =>
            r.id === id ? { ...r, mailStatus: 'sent' as const, mailError: undefined } : r,
          ),
        })),
      updateGrading: (p) => patch((s) => ({ settings: { ...s.settings, grading: { ...s.settings.grading, ...p } } })),

      visibleLessonPlans,
      addLessonPlan: (plan) =>
        patch((s) => ({
          lessonPlans: [...s.lessonPlans, { ...plan, id: uid('lp'), uploadedBy: s.currentUserId!, createdAt: Date.now() + s.timeOffsetMs }],
        })),
      deleteLessonPlan: (id) => patch((s) => ({ lessonPlans: s.lessonPlans.filter((p) => p.id !== id) })),
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
  return group.memberIds.includes(user.id) || isGroupAdmin(user, group)
}
