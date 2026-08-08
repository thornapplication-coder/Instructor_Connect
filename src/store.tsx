import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createSeedState } from './sandbox/seed'
import { RETENTION_MS, type AppState, type Attachment, type GradingRecord, type GradingSettings, type Group, type LessonPlan, type PollType, type RetentionKey, type Role, type SeenState, type User } from './types'

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
  createPoll: (groupId: string, question: string, type: PollType, options: string[]) => void
  vote: (pollId: string, optionIndex: number) => void
  closePoll: (pollId: string) => void
  toggleMute: (groupId: string) => void
  setGroupRetention: (groupId: string, retention: RetentionKey | null) => void
  setGroupMembers: (groupId: string, memberIds: string[]) => void
  addInfoEntry: (entry: { type: 'pdf' | 'text'; title: string; description: string; body?: string; fileName?: string }) => void
  deleteInfoEntry: (id: string) => void
  saveContact: (contact: { id?: string; department: string; position: string; name: string; phone: string; email: string }) => void
  deleteContact: (id: string) => void
  addUser: (user: { name: string; email: string; phone: string; role: Role }) => void
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
  retryGradingMail: (id: string) => void
  updateGrading: (patch: Partial<GradingSettings>) => void
  /** Lesson Plans, die der aktuelle Nutzer sehen darf */
  visibleLessonPlans: LessonPlan[]
  addLessonPlan: (plan: { title: string; description: string; aircraftType: string; fileName: string }) => void
  deleteLessonPlan: (id: string) => void
}

const StoreCtx = createContext<Store | null>(null)

const USER_KEY = 'aaa-user'

/** Angemeldet bleiben: gespeicherte Anmeldung wiederherstellen, solange der Nutzer existiert und aktiv ist. */
function initialState(): AppState {
  const seed = createSeedState()
  try {
    const savedId = localStorage.getItem(USER_KEY)
    if (savedId && seed.users.some((u) => u.id === savedId && u.active)) {
      return { ...seed, currentUserId: savedId }
    }
  } catch {
    /* ohne localStorage startet die App abgemeldet */
  }
  return seed
}

function persistUser(id: string | null) {
  try {
    if (id) localStorage.setItem(USER_KEY, id)
    else localStorage.removeItem(USER_KEY)
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

  const latestForeignInfo = state.infoEntries.reduce(
    (max, e) => (e.authorId !== state.currentUserId ? Math.max(max, e.createdAt) : max),
    0,
  )
  const hasNewInfo = !!state.currentUserId && latestForeignInfo > seenOfCurrent.info
  const hasNewContacts = !!state.currentUserId && state.contactsChangedAt > seenOfCurrent.contacts

  // Instruktoren sehen ihre eigenen Formulare, Admins und Superadmin alle.
  const visibleGradingRecords = useMemo(() => {
    if (!currentUser) return []
    const all = [...state.gradingRecords].sort((a, b) => b.createdAt - a.createdAt)
    return currentUser.role === 'member' ? all.filter((r) => r.instructorId === currentUser.id) : all
  }, [state.gradingRecords, currentUser])

  // Instruktoren sehen nur Lesson Plans ihrer zugewiesenen Muster;
  // Admins und Superadmin sehen alle.
  const visibleLessonPlans = useMemo(() => {
    if (!currentUser) return []
    const all = [...state.lessonPlans].sort((a, b) => a.title.localeCompare(b.title))
    if (currentUser.role !== 'member') return all
    return all.filter((p) => currentUser.aircraftTypes.includes(p.aircraftType))
  }, [state.lessonPlans, currentUser])

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
        const needle = identifier.trim().toLowerCase().replace(/\s+/g, '')
        const user = state.users.find(
          (u) =>
            u.active &&
            (u.email.toLowerCase() === identifier.trim().toLowerCase() ||
              u.phone.replace(/\s+/g, '') === needle),
        )
        if (!user) return false
        persistUser(user.id)
        patch(() => ({ currentUserId: user.id }))
        return true
      },
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
        patch((s) => ({
          messages: [
            ...s.messages,
            { id: uid('m'), groupId, authorId: s.currentUserId!, text, createdAt: Date.now() + s.timeOffsetMs, attachment },
          ],
        })),
      deleteMessage: (id) => patch((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

      createPoll: (groupId, question, type, options) =>
        patch((s) => ({
          polls: [
            ...s.polls,
            { id: uid('p'), groupId, authorId: s.currentUserId!, question, type, options, votes: {}, closed: false, createdAt: Date.now() + s.timeOffsetMs },
          ],
        })),
      vote: (pollId, optionIndex) =>
        patch((s) => ({
          polls: s.polls.map((p) =>
            p.id === pollId && !p.closed ? { ...p, votes: { ...p.votes, [s.currentUserId!]: optionIndex } } : p,
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

      addUser: (user) =>
        patch((s) => ({
          users: [...s.users, { ...user, id: uid('u'), canEditDirectory: false, canGrade: false, isTrainee: false, aircraftTypes: [], active: true }],
        })),
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
  }, [state, now, currentUser, effectiveRetention, visibleMessages, visiblePolls, myGroups, unreadGroups, hasNewInfo, hasNewContacts, latestForeignContent, latestForeignInfo, visibleGradingRecords, visibleLessonPlans])

  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}

/** Darf der Nutzer in dieser Gruppe administrieren? */
export function isGroupAdmin(user: User | null, group: Group): boolean {
  if (!user) return false
  return user.role === 'superadmin' || group.adminIds.includes(user.id)
}
