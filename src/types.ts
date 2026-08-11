export type Role = 'superadmin' | 'group_admin' | 'training_admin' | 'member'

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
  /** vom Admin für den Chat gesperrt: kann lesen, aber nichts senden */
  chatBlocked?: boolean
  active: boolean
}

export interface Group {
  id: string
  name: string
  purpose: string
  /** Muster, zu dem die Gruppe gehört — leer = musterübergreifend.
   *  Die Chat-Themen unterscheiden sich je Aircraft Type. */
  aircraftType?: string
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
  /** Ablaufzeitpunkt (ms epoch, UTC) — danach ist die Umfrage automatisch geschlossen */
  validUntil?: number
  createdAt: number
}

export interface InfoEntry {
  id: string
  type: 'pdf' | 'text'
  title: string
  description: string
  body?: string
  fileName?: string
  /** Kategorie aus settings.infoCategories */
  category: string
  /** Gültig ab (YYYY-MM-DD); leer = ab Veröffentlichung */
  validFrom?: string
  /** Gültig bis (YYYY-MM-DD); leer = UFN (until further notice) */
  validUntil?: string
  /** Lese-Bestätigung erforderlich — Admin sieht, wer bestätigt hat */
  requiresAck?: boolean
  /** Zielgruppen des Eintrags (Sichtbarkeit UND Bestätigungspflicht);
   *  leer = alle Gruppen/alle Nutzer */
  groupIds?: string[]
  /** Muster des Eintrags — bestimmt den Abschnitt in der Liste. Leer:
   *  wird aus den Zielgruppen abgeleitet, sonst musterübergreifend. */
  aircraftType?: string
  authorId: string
  createdAt: number
}

/** Feedback-Eintrag — bleibt im Admin-Panel gespeichert, dort löschbar */
export interface FeedbackEntry {
  id: string
  authorId: string
  category: string
  /** gewählter Empfänger aus settings.feedbackRecipients */
  recipient: string
  urgent: boolean
  message: string
  attachment?: Attachment
  /** Musterbezug: gesetzt = betrifft genau diesen Aircraft Type; leer/fehlt
   *  = allgemeine Rückmeldung ohne Musterbezug (General). */
  aircraftType?: string
  createdAt: number
  /** Als bearbeitet markiert von (User-ID) — leer = noch offen */
  resolvedBy?: string
  /** Zeitpunkt der Bearbeitung */
  resolvedAt?: number
  /** Optionale Notiz: was wurde gemacht */
  resolutionNote?: string
}

/**
 * Startwerte der Schulungsarten, nach denen die Lesson Plans innerhalb eines
 * Musters gegliedert werden. Sie liegen wie die Feedback- und
 * Info-Kategorien in den Einstellungen und sind im Admin-Panel pflegbar —
 * diese Liste ist nur der Erststand.
 *
 * Angezeigt wird immer alphabetisch (Auswahlfeld wie Gliederung), mit
 * leerer erster Zelle: Ein Plan ohne Zuordnung verschwindet nicht, er steht
 * unter „Ohne Zuordnung".
 */
export const LESSON_CATEGORIES = [
  'Command Course',
  'Conversion',
  'Difference Training',
  'Other Training',
  'Recurrent',
  'Renewal',
  'Type Rating',
]

export interface LessonPlan {
  id: string
  title: string
  description: string
  /** Muster, für das der Lesson Plan gilt */
  aircraftType: string
  /** Schulungsart innerhalb des Musters. Optional — Altbestand hat sie
   *  nicht, und ein Plan ohne Zuordnung bleibt sichtbar. */
  category?: string
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
  /** Zeitpunkt der Version — als Zeitstempel, in der Anzeige mit Datum UND Uhrzeit */
  at: number
  changes: string
}

/** Im Berechtigungs-Tab des Superadmin-Panels schaltbare Fähigkeiten */
export type PermKey = 'grading_create' | 'grading_view_all' | 'info_manage' | 'lessons_manage' | 'contacts_manage'

export const PERM_KEYS: PermKey[] = ['grading_create', 'grading_view_all', 'info_manage', 'lessons_manage', 'contacts_manage']

/** Module der App — steuert Kacheln UND Routen, damit ein gesperrtes Modul
 *  nicht über die Adresszeile erreichbar bleibt. */
export type ModuleKey = 'grading' | 'lessons' | 'chat' | 'info' | 'feedback' | 'contacts'

/** Rollen, deren Rechte der Superadmin konfiguriert (er selbst darf immer alles) */
export type ConfigurableRole = 'group_admin' | 'training_admin'

export interface Settings {
  defaultRetention: RetentionKey
  maxUploadMB: number
  feedbackCategories: string[]
  feedbackCC: string[]
  /** wählbare Empfänger für Feedback */
  feedbackRecipients: string[]
  /** Kategorien der Instructor-Info-Einträge, im Admin Panel pflegbar */
  infoCategories: string[]
  /** Schulungsarten der Lesson Plans (Type Rating, Recurrent …), im Admin
   *  Panel pflegbar. Optional, damit ein gespeicherter Altbestand ohne diese
   *  Liste gültig bleibt — migrateState trägt sie nach. */
  lessonCategories?: string[]
  allowedDomains: string[]
  /** Kopf-/Fußzeile jedes ausgedruckten Formulars — ein Ausdruck ohne
   *  Organisation und Formularstand ist keinem Nachweis zuzuordnen. */
  documentHeader: { atoName: string; approvalNumber: string; approvalNumberUK?: string; formRevision: string }
  /** Impressumstext je Sprache, im Admin Panel bearbeitbar */
  imprint: { de: string; en: string }
  grading: GradingSettings
  /** zentrale Musterliste für Lesson Plans und Grading */
  aircraftTypes: string[]
  /** Rechte-Matrix je konfigurierbarer Rolle — Superadmin darf immer alles,
   *  Mitglieder werden über die Flags am Nutzer gesteuert */
  permissions: Record<ConfigurableRole, Record<PermKey, boolean>>
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
  feedbackEntries: FeedbackEntry[]
  /** je Nutzer: mit Stern markierte Instructor-Info-Einträge */
  starredInfo: Record<string, string[]>
  /** Lese-Bestätigungen: Eintrag-ID -> Nutzer-ID -> Zeitstempel */
  infoAcks: Record<string, Record<string, number>>
  /** laufender Code-Login: an diese E-Mail wurde ein Code „gesendet“.
   *  attempts begrenzt das Durchprobieren — nach fünf Fehlversuchen ist der
   *  Code verbraucht und muss neu angefordert werden. */
  pendingLogin: { email: string; code: string; expiresAt: number; attempts: number } | null
  /** Marke der Nachtrags-Migration für die drei Demo-Sessions: einmal
   *  gesetzt, werden sie nie wieder ergänzt. Ohne diese Marke kamen sie
   *  nach dem Löschen bei jedem Start zurück — jedes Mal mit frisch
   *  gerechneten Zeitstempeln, also als NEUE Daten. */
  seedHistoryMigrated?: boolean
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

export type FieldType = 'text' | 'date' | 'select' | 'number' | 'textarea' | 'checkgroup' | 'radiogroup' | 'duration'

export interface FormField {
  key: string
  label: string
  type: FieldType
  options?: string[]
  required: boolean
  /** Feld über die volle Breite darstellen (langes Textfeld) */
  wide?: boolean
  /** wird erst NACH dem Grading erfasst (z. B. Flight Time, Landings) */
  postGrading?: boolean
  /** kleiner erklärender Hinweis unter dem Feld (z. B. Fußnoten des Originals) */
  hint?: string
  /** Entweder-oder-Feldpaar: füllt man dieses Feld, wird das andere geleert;
   *  genau eines der beiden muss ausgefüllt sein (z. B. Recurrent-Zyklus
   *  ODER ATA-Kapitel auf Formular 308F). */
  exclusiveWith?: string
}

/** Teilnehmerzeile der Anwesenheitslisten 307A/307B */
export interface AttendanceEntry {
  name: string
  signature: string | null
}

/**
 * Formularnummer. Standard laut OM Appendix 5: 306, 307A/B, 308A–H, 310 —
 * Admins können im Admin-Panel weitere Formulartypen mit freier Nummer
 * anlegen, daher bewusst string. Sonderverhalten bleibt an die
 * Standard-Nummern geknüpft (306/310 Folgeformulare, 307 Anwesenheit,
 * 308G COI/CAI, 310 Training-Admin-Versand).
 */
export type FormTypeId = string

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

/** Eingefrorener Kompetenz-Wortlaut eines Formulars. Ein unterschriebenes
 *  Dokument muss über die gesamte Aufbewahrungsfrist unverändert
 *  reproduzierbar sein — auch wenn der Katalog später umgebaut wird. */
export interface RecordedCompetency {
  code: string
  title: string
}

export type OverallResult = 'competent' | 'not_competent'
export type SessionStatus = 'completed' | 'not_completed'

/** Bewertung eines einzelnen Piloten innerhalb eines Formulars */
export interface TraineeGrading {
  /** frei eingetippter Studentenname (kein Dropdown) */
  traineeName?: string
  /** Alt-/Seed-Daten: Verweis auf einen Nutzer; Anzeige fällt darauf zurück */
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
/** 'queued' = unterschrieben, aber ohne Netz erfasst. Der Versand liegt im
 *  Ausgangskorb und läuft automatisch, sobald wieder Empfang da ist —
 *  deshalb ist das kein Fehler, der den Instruktor zum Handeln zwingt. */
export type MailStatus = 'pending' | 'queued' | 'sent' | 'failed'

export interface GradingRecord {
  id: string
  formTypeId: FormTypeId
  instructorId: string
  /** Kopfdaten laut Formularkonfiguration */
  header: Record<string, string>
  trainees: TraineeGrading[]
  /** Kompetenz-Wortlaut zum Zeitpunkt der Erstellung. Fehlt er (Altbestand),
   *  fällt die Anzeige auf den aktuellen Katalog zurück. */
  competencies?: RecordedCompetency[]
  sessionStatus: SessionStatus | null
  freeText: Record<string, string>
  /** Wer die Unterschrift des Piloten nachgetragen hat, falls nicht der
   *  führende Instruktor. Steht auf dem Dokument und im Ausdruck — eine
   *  Vertretung ist zulässig, muss aber sichtbar sein. Optional, damit
   *  bestehende Datensätze unverändert gültig bleiben. */
  lateSignatureBy?: string
  /** Signaturen als Data-URL (Canvas) */
  signatureInstructor: string | null
  signatureTrainee: string | null
  status: RecordStatus
  mailStatus: MailStatus
  mailError?: string
  /** vom Instruktor zusätzlich angegebene Empfänger */
  extraRecipients?: string[]
  /** Teilnehmerliste der Formulare 307A/307B */
  attendance?: AttendanceEntry[]
  /** Nutzer, die das Formular aus ihrer Listenansicht entfernt haben —
   *  im Admin-Panel bleibt es für alle erhalten */
  hiddenFor?: string[]
  /** Formulare, die in EINEM Durchgang entstanden sind (ein Formular je
   *  Student), teilen sich diese ID — ein Pflicht-Folgeformular gilt damit
   *  für alle Geschwister-Formulare des Durchgangs. */
  batchId?: string
  /** Verweis auf ein zugehöriges Formular (306/310 an ein Grading Sheet) */
  parentId?: string
  createdAt: number
  /** Zeitpunkt, zu dem das Formular VOLLSTÄNDIG unterschrieben (gesperrt) wurde */
  signedAt?: number
  /** Zeitpunkt der Instruktorunterschrift — bleibt bei einer
   *  Nachtragsunterschrift des Piloten erhalten (Chronologie ist bei
   *  306-Vorgängen prüfrelevant) */
  instructorSignedAt?: number
  /** Zeitpunkt einer nachgetragenen Piloten-/Gegenunterschrift */
  countersignedAt?: number
  /** SHA-256 über die prüfrelevanten Felder samt Unterschriftsbildern,
   *  gebildet im Moment des Unterschreibens (siehe docHash.ts) */
  contentHash?: string
  /** Fassung des Abdruck-Verfahrens, unter der `contentHash` entstand.
   *  Fehlt sie, ist es ein Altbestand aus Fassung 1 — er wird auch mit
   *  Fassung 1 nachgerechnet, damit die Erweiterung der Feldliste nicht
   *  jedes bereits unterschriebene Dokument als geändert meldet. */
  hashVersion?: number
  /** Zuständige Behörde des Trainings: AT (AT.ATO.106) oder UK
   *  (GBR.ATO.0541) — bestimmt die Kennung im Dokumentkopf. Fehlt der
   *  Wert (Altbestand), gilt AT. */
  authority?: 'AT' | 'UK'
}

export interface GradingSettings {
  /** Standard-Empfänger bei bestandener Session */
  defaultRecipients: string[]
  /** zusätzliche Empfänger bei Not Competent / Additional Training / Deferred */
  escalationRecipients: string[]
  /** Empfänger für Form 310 (Deferred Item List) — geht IMMER an den Training Admin */
  deferredRecipients: string[]
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
