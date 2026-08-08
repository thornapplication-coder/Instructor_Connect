export type Role = 'superadmin' | 'group_admin' | 'member'

export type RetentionKey = '24h' | '7d' | '30d' | '90d' | 'never'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  canEditDirectory: boolean
  /** darf Grading-Formulare ausfüllen (Instruktor/Examiner) */
  canGrade: boolean
  /** erscheint in der Trainee-Auswahl des Grading Tools */
  isTrainee: boolean
  /** zugewiesene Aircraft Types — steuert die Sicht auf Lesson Plans */
  aircraftTypes: string[]
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

export interface LessonPlan {
  id: string
  title: string
  description: string
  /** Muster, für das der Lesson Plan gilt */
  aircraftType: string
  fileName: string
  uploadedBy: string
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
  grading: GradingSettings
  /** zentrale Musterliste für Lesson Plans und Grading */
  aircraftTypes: string[]
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
  gradingRecords: GradingRecord[]
  lessonPlans: LessonPlan[]
}


/* ===================== Grading Tool ===================== */

/** Note je Kompetenz: 1–5 plus NO (Not Observed) */
export type Grade = 1 | 2 | 3 | 4 | 5 | 'NO'

export const GRADES: Grade[] = [1, 2, 3, 4, 5, 'NO']

export interface Competency {
  /** Kurzcode, z. B. KNO */
  code: string
  title: string
  /** EASA Observable Behaviours als Aufklapp-Hilfe */
  behaviours: string[]
}

export type CompetencySetKey = 'pilot' | 'instructor'

export interface CompetencySet {
  key: CompetencySetKey
  name: string
  competencies: Competency[]
}

export type FieldType = 'text' | 'date' | 'select' | 'number' | 'textarea' | 'checkgroup' | 'radiogroup'

export interface FormField {
  key: string
  label: string
  type: FieldType
  options?: string[]
  required: boolean
  /** Feld über die volle Breite darstellen (langes Textfeld) */
  wide?: boolean
}

/** Teilnehmerzeile der Anwesenheitslisten 307A/307B */
export interface AttendanceEntry {
  name: string
  signature: string | null
}

/** Formulartypen laut OM Appendix 5 */
export type FormTypeId =
  | '306' | '307A' | '307B'
  | '308A' | '308B' | '308C' | '308D' | '308E'
  | '308F' | '308G' | '308H' | '310'

export interface FormType {
  id: FormTypeId
  title: string
  /** null = Formular ohne Kompetenzbewertung (306, 310) */
  competencySet: CompetencySetKey | null
  /** Kopfdatenfelder, im Admin Panel pflegbar */
  fields: FormField[]
  /** Freitextabschnitte (z. B. Deficiency bei 306, Items bei 310) */
  freeTextSections: string[]
}

export interface CompetencyGrade {
  code: string
  grade: Grade | null
  comment: string
}

export type OverallResult = 'competent' | 'not_competent'
export type SessionStatus = 'completed' | 'not_completed'

/** Bewertung eines einzelnen Piloten innerhalb eines Formulars */
export interface TraineeGrading {
  traineeId: string
  /** CDR oder FO */
  position: string
  /** Sitzposition: Left / Right */
  seat?: string
  grades: CompetencyGrade[]
  positiveComment: string
  developmentComment: string
  summaryComment: string
  overall: OverallResult | null
}

export type RecordStatus = 'draft' | 'awaiting_signature' | 'signed'
export type MailStatus = 'pending' | 'sent' | 'failed'

export interface GradingRecord {
  id: string
  formTypeId: FormTypeId
  instructorId: string
  /** Kopfdaten laut Formularkonfiguration */
  header: Record<string, string>
  trainees: TraineeGrading[]
  sessionStatus: SessionStatus | null
  freeText: Record<string, string>
  /** Signaturen als Data-URL (Canvas) */
  signatureInstructor: string | null
  signatureTrainee: string | null
  status: RecordStatus
  mailStatus: MailStatus
  mailError?: string
  /** Teilnehmerliste der Formulare 307A/307B */
  attendance?: AttendanceEntry[]
  /** Verweis auf ein zugehöriges Formular (306/310 an ein Grading Sheet) */
  parentId?: string
  createdAt: number
  signedAt?: number
}

export interface GradingSettings {
  /** Standard-Empfänger bei bestandener Session */
  defaultRecipients: string[]
  /** zusätzliche Empfänger bei Not Competent / Additional Training / Deferred */
  escalationRecipients: string[]
  competencySets: CompetencySet[]
  formTypes: FormType[]
}

export const RETENTION_MS: Record<RetentionKey, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
  '90d': 90 * 24 * 3600_000,
  never: Infinity,
}

export const APP_VERSION = '1.0.0'
