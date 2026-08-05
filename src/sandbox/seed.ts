import type { AppState } from '../types'
import { IMPRINT_DE, IMPRINT_EN } from './imprintDefaults'

const h = 3600_000
const d = 24 * h

/**
 * Sandbox-Seed-Daten (Spez. §14): alle drei Rollen, drei Gruppen mit
 * unterschiedlicher Aufbewahrung, Nachrichten inkl. Admin-Nachricht,
 * beide Umfragetypen, Instructor-Info- und Who-to-call-Einträge.
 */
export function createSeedState(): AppState {
  const now = Date.now()
  return {
    users: [
      { id: 'u-patrick', name: 'Patrick Thorn', email: 'p.thorn@instructorconnect.at', phone: '+43 664 1000001', role: 'superadmin', canEditDirectory: true, active: true },
      { id: 'u-maria', name: 'Maria Huber', email: 'm.huber@instructorconnect.at', phone: '+43 664 1000002', role: 'group_admin', canEditDirectory: false, active: true },
      { id: 'u-stefan', name: 'Stefan Wagner', email: 's.wagner@instructorconnect.at', phone: '+43 664 1000003', role: 'group_admin', canEditDirectory: true, active: true },
      { id: 'u-anna', name: 'Anna Leitner', email: 'a.leitner@instructorconnect.at', phone: '+43 664 1000004', role: 'member', canEditDirectory: false, active: true },
      { id: 'u-lukas', name: 'Lukas Steiner', email: 'l.steiner@instructorconnect.at', phone: '+43 664 1000005', role: 'member', canEditDirectory: false, active: true },
      { id: 'u-sophie', name: 'Sophie Berger', email: 's.berger@instructorconnect.at', phone: '+43 664 1000006', role: 'member', canEditDirectory: false, active: true },
      { id: 'u-david', name: 'David Moser', email: 'd.moser@instructorconnect.at', phone: '+43 664 1000007', role: 'member', canEditDirectory: false, active: false },
    ],
    groups: [
      {
        id: 'g-atpl',
        name: 'ATPL Theory 2026',
        purpose: 'Organisation und Fragen rund um den ATPL-Theoriekurs 2026.',
        adminIds: ['u-maria'],
        memberIds: ['u-maria', 'u-anna', 'u-lukas', 'u-sophie', 'u-patrick'],
        retention: '7d',
        muted: false,
      },
      {
        id: 'g-fi',
        name: 'Instructors',
        purpose: 'Austausch aller Instruktoren: Standardisierung, Termine, Briefings.',
        adminIds: ['u-stefan'],
        memberIds: ['u-stefan', 'u-maria', 'u-patrick', 'u-anna'],
        retention: '30d',
        muted: false,
      },
      {
        id: 'g-ops',
        name: 'Operations',
        purpose: 'Kurzfristige operative Informationen: Slots, Technik, Simulatoren.',
        adminIds: ['u-patrick'],
        memberIds: ['u-patrick', 'u-stefan', 'u-lukas', 'u-sophie'],
        retention: '24h',
        muted: true,
      },
    ],
    messages: [
      { id: 'm1', groupId: 'g-atpl', authorId: 'u-maria', text: 'Reminder: Das Air-Law-Progress-Assessment findet am Freitag um 09:00 in Raum 2 statt. Bitte pünktlich sein.', createdAt: now - 2 * d },
      { id: 'm2', groupId: 'g-atpl', authorId: 'u-lukas', text: 'Gibt es dafür einen Altfragen-Pool zum Üben?', createdAt: now - 2 * d + 20 * 60_000 },
      { id: 'm3', groupId: 'g-atpl', authorId: 'u-anna', text: 'Ja, im Instructor Info Bereich liegt ein PDF mit Übungsfragen.', createdAt: now - 2 * d + 35 * 60_000 },
      { id: 'm4', groupId: 'g-atpl', authorId: 'u-sophie', text: 'Ich habe meine Notizen zu Meteorology hochgeladen – vielleicht hilft es jemandem.', createdAt: now - 5 * h, attachment: { name: 'met-notes.pdf', kind: 'file', sizeMB: 2.4 } },
      { id: 'm5', groupId: 'g-fi', authorId: 'u-stefan', text: 'Standardisierungsbriefing für alle Instruktoren am Mittwoch 17:00, Briefingraum 1. Anwesenheit bitte eintragen.', createdAt: now - 26 * h },
      { id: 'm6', groupId: 'g-fi', authorId: 'u-maria', text: 'Passt bei mir. Ich bringe die neuen Grading-Sheets mit.', createdAt: now - 25 * h },
      { id: 'm7', groupId: 'g-fi', authorId: 'u-anna', text: 'Foto vom Whiteboard nach dem letzten Briefing.', createdAt: now - 24 * h, attachment: { name: 'briefing-board.jpg', kind: 'image', sizeMB: 1.1 } },
      { id: 'm8', groupId: 'g-ops', authorId: 'u-patrick', text: 'Simulator A ist heute ab 14:00 wieder verfügbar, Wartung abgeschlossen.', createdAt: now - 3 * h },
      { id: 'm9', groupId: 'g-ops', authorId: 'u-lukas', text: 'Danke, dann plane ich die Nachmittags-Session ein.', createdAt: now - 2 * h },
    ],
    polls: [
      {
        id: 'p1',
        groupId: 'g-fi',
        authorId: 'u-stefan',
        question: 'Passt der Termin Mittwoch 17:00 für das Standardisierungsbriefing?',
        type: 'yesno',
        options: [],
        votes: { 'u-maria': 0, 'u-anna': 0, 'u-patrick': 1 },
        closed: false,
        createdAt: now - 23 * h,
      },
      {
        id: 'p2',
        groupId: 'g-atpl',
        authorId: 'u-lukas',
        question: 'Welcher Tag passt euch für die gemeinsame Lernsession?',
        type: 'multi',
        options: ['Montag', 'Mittwoch', 'Samstag', 'Sonntag'],
        votes: { 'u-anna': 2, 'u-sophie': 2, 'u-maria': 1 },
        closed: false,
        createdAt: now - 4 * h,
      },
    ],
    infoEntries: [
      {
        id: 'i1',
        type: 'pdf',
        title: 'Air Law – Übungsfragen Progress Check',
        description: 'Fragenkatalog zur Vorbereitung auf das Progress-Assessment.',
        fileName: 'sample.pdf',
        authorId: 'u-maria',
        createdAt: now - 6 * d,
      },
      {
        id: 'i2',
        type: 'text',
        title: 'Briefing-Standard: Simulator-Session',
        description: 'Kurzreferenz für alle Instruktoren.',
        body: 'Vor jeder Simulator-Session gilt: 1) Lesson-Plan und Ziele der Session prüfen, 2) Simulator-Setup vorbereiten (Position, Wetter, Beladung), 3) Einträge im Tech-Log des Simulators prüfen, 4) Student Briefing nach Standardschema (Ziel der Übung, Ablauf, Abbruchkriterien), 5) Eintrag im Ausbildungsnachweis unmittelbar nach der Session.',
        authorId: 'u-stefan',
        createdAt: now - 3 * d,
      },
    ],
    contacts: [
      { id: 'c1', department: 'Administration', position: 'Office Management', name: 'Julia Brandstätter', phone: '+43 1 5550 100', email: 'office@instructorconnect.at' },
      { id: 'c2', department: 'Administration', position: 'Buchhaltung', name: 'Markus Auer', phone: '+43 1 5550 110', email: 'accounting@instructorconnect.at' },
      { id: 'c3', department: 'Simulator-Technik', position: 'FSTD-Technik', name: 'Herbert Klausner', phone: '+43 1 5550 200', email: 'technik@instructorconnect.at' },
      { id: 'c4', department: 'Training', position: 'Admin', name: 'Patrick Thorn', phone: '+43 664 1000001', email: 'p.thorn@instructorconnect.at' },
      { id: 'c5', department: 'Training', position: 'Dispo / Sim-Planung', name: 'Sabine Koller', phone: '+43 1 5550 300', email: 'dispo@instructorconnect.at' },
    ],
    changelog: [
      { version: '1.0.0', date: '2026-08-04', changes: 'Erstversion: Chat mit Gruppen und Umfragen, Instructor Info, Who to call, Feedback, Admin-Panel, Sandbox-Modus.' },
    ],
    settings: {
      defaultRetention: '30d',
      maxUploadMB: 25,
      feedbackCategories: ['Instructor / Training', 'IT / Technik', 'Kursinhalt', 'Organisation / Ablauf', 'Safety', 'Sonstiges'],
      feedbackCC: ['admin@instructorconnect.at'],
      allowedDomains: ['instructorconnect.at'],
      imprint: { de: IMPRINT_DE, en: IMPRINT_EN },
    },
    currentUserId: null,
    timeOffsetMs: 0,
    seen: {},
    contactsChangedAt: now - 2 * d,
  }
}
