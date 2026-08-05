export type Role = 'superadmin' | 'group_admin' | 'member'

export type RetentionKey = '24h' | '7d' | '30d' | '90d' | 'never'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  canEditDirectory: boolean
  active: boolean
}

export interface Group {
  id: string
  name: string
  purpose: string
  adminIds: string[]
  memberIds: string[]
  /** null = globale Voreinstellung gilt */
  retention: RetentionKey | null
  muted: boolean
}

export interface Attachment {
  name: string
  kind: 'image' | 'video' | 'file'
  sizeMB: number
}

export interface Message {
  id: string
  groupId: string
  authorId: string
  text: string
  createdAt: number
  attachment?: Attachment
}

export type PollType = 'yesno' | 'multi'

export interface Poll {
  id: string
  groupId: string
  authorId: string
  question: string
  type: PollType
  options: string[]
  /** userId -> Index der gewählten Option */
  votes: Record<string, number>
  closed: boolean
  createdAt: number
}

export interface InfoEntry {
  id: string
  type: 'pdf' | 'text'
  title: string
  description: string
  body?: string
  fileName?: string
  authorId: string
  createdAt: number
}

export interface Contact {
  id: string
  department: string
  position: string
  name: string
  phone: string
  email: string
}

export interface ChangelogEntry {
  version: string
  date: string
  changes: string
}

export interface Settings {
  defaultRetention: RetentionKey
  maxUploadMB: number
  feedbackCategories: string[]
  feedbackCC: string[]
  allowedDomains: string[]
  /** Impressumstext je Sprache, im Admin Panel bearbeitbar */
  imprint: { de: string; en: string }
}

/** Zuletzt-gesehen-Zeitstempel eines Nutzers für die „Neu“-Markierungen */
export interface SeenState {
  chat: Record<string, number>
  info: number
  contacts: number
}

export interface AppState {
  users: User[]
  groups: Group[]
  messages: Message[]
  polls: Poll[]
  infoEntries: InfoEntry[]
  contacts: Contact[]
  changelog: ChangelogEntry[]
  settings: Settings
  currentUserId: string | null
  /** Simulierte Zeitverschiebung (Sandbox) in Millisekunden */
  timeOffsetMs: number
  /** je Nutzer: was wurde wann zuletzt angesehen */
  seen: Record<string, SeenState>
  /** letzte Änderung im Who-to-call-Verzeichnis */
  contactsChangedAt: number
}

export const RETENTION_MS: Record<RetentionKey, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
  '90d': 90 * 24 * 3600_000,
  never: Infinity,
}

export const APP_VERSION = '1.0.0'
