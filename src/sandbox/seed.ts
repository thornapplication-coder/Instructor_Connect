import type { AppState } from '../types'
import { GRADING_DEFAULTS } from './gradingDefaults'
import { IMPRINT_DE, IMPRINT_EN } from './imprintDefaults'

const h = 3600_000
const d = 24 * h

/** Datum als YYYY-MM-DD für date-Felder */
const iso = (ts: number) => new Date(ts).toISOString().slice(0, 10)

/** Platzhalter-Signatur (kleines gezeichnetes Kürzel) für die Seed-Daten */
const SIG =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80">' +
      '<path d="M12 58 C 40 18, 62 66, 88 34 S 140 20, 168 50 S 210 36, 228 24" ' +
      'fill="none" stroke="#1c2b3d" stroke-width="3" stroke-linecap="round"/></svg>',
  )

/**
 * Sandbox-Seed-Daten (Spez. §14): alle drei Rollen, drei Gruppen mit
 * unterschiedlicher Aufbewahrung, Nachrichten inkl. Admin-Nachricht,
 * beide Umfragetypen, Instructor-Info- und Who-to-call-Einträge.
 */
export function createSeedState(): AppState {
  const now = Date.now()
  return {
    users: [
      { id: 'u-patrick', name: 'Patrick Thorn', email: 'p.thorn@instructorconnect.at', phone: '+43 664 1000001', role: 'superadmin', canEditDirectory: true, canGrade: true, isTrainee: false, aircraftTypes: ['A320', 'B737', 'DA42', 'Generic FNPT II'], active: true },
      { id: 'u-maria', name: 'Maria Huber', email: 'm.huber@instructorconnect.at', phone: '+43 664 1000002', role: 'group_admin', canEditDirectory: false, canGrade: true, isTrainee: false, aircraftTypes: ['A320'], active: true },
      { id: 'u-stefan', name: 'Stefan Wagner', email: 's.wagner@instructorconnect.at', phone: '+43 664 1000003', role: 'group_admin', canEditDirectory: true, canGrade: true, isTrainee: false, aircraftTypes: ['B737', 'DA42'], active: true },
      { id: 'u-anna', name: 'Anna Leitner', email: 'a.leitner@instructorconnect.at', phone: '+43 664 1000004', role: 'member', canEditDirectory: false, canGrade: true, isTrainee: true, aircraftTypes: ['A320'], active: true },
      { id: 'u-lukas', name: 'Lukas Steiner', email: 'l.steiner@instructorconnect.at', phone: '+43 664 1000005', role: 'member', canEditDirectory: false, canGrade: false, isTrainee: true, aircraftTypes: ['A320'], active: true },
      { id: 'u-sophie', name: 'Sophie Berger', email: 's.berger@instructorconnect.at', phone: '+43 664 1000006', role: 'member', canEditDirectory: false, canGrade: false, isTrainee: true, aircraftTypes: ['B737'], active: true },
      { id: 'u-david', name: 'David Moser', email: 'd.moser@instructorconnect.at', phone: '+43 664 1000007', role: 'member', canEditDirectory: false, canGrade: false, isTrainee: true, aircraftTypes: [], active: false },
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
      grading: GRADING_DEFAULTS,
      aircraftTypes: ['A320', 'B737', 'DA42', 'Generic FNPT II'],
    },
    currentUserId: null,
    timeOffsetMs: 0,
    seen: {},
    contactsChangedAt: now - 2 * d,
    lessonPlans: [
      { id: 'lp1', title: 'A320 — Lesson Plan TR Session 1-4', description: 'Grundlagen Type Rating: Systeme, Normalverfahren, erste FFS-Sessions.', aircraftType: 'A320', fileName: 'a320-tr-session-1-4.pdf', uploadedBy: 'u-patrick', createdAt: now - 20 * d },
      { id: 'lp2', title: 'A320 — Lesson Plan Recurrent OPC', description: 'Ablauf und Schwerpunkte der jährlichen OPC-Session.', aircraftType: 'A320', fileName: 'a320-recurrent-opc.pdf', uploadedBy: 'u-maria', createdAt: now - 12 * d },
      { id: 'lp3', title: 'B737 — Lesson Plan TR Session 1-4', description: 'Type Rating B737: Systeme, SOPs, FFS-Einführung.', aircraftType: 'B737', fileName: 'b737-tr-session-1-4.pdf', uploadedBy: 'u-stefan', createdAt: now - 18 * d },
      { id: 'lp4', title: 'B737 — Lesson Plan LVO / CAT II-III', description: 'Schulung für Allwetterflugbetrieb im Simulator.', aircraftType: 'B737', fileName: 'b737-lvo.pdf', uploadedBy: 'u-stefan', createdAt: now - 6 * d },
      { id: 'lp5', title: 'DA42 — Lesson Plan MEP Grundausbildung', description: 'Mehrmotorige Grundschulung im FNPT II.', aircraftType: 'DA42', fileName: 'da42-mep.pdf', uploadedBy: 'u-stefan', createdAt: now - 3 * d },
      { id: 'lp6', title: 'Generic FNPT II — Lesson Plan IR Training', description: 'Instrumentenflug-Grundlagen im generischen Trainer.', aircraftType: 'Generic FNPT II', fileName: 'fnpt-ir.pdf', uploadedBy: 'u-patrick', createdAt: now - 9 * d },
    ],
    gradingRecords: [
      {
        id: 'gr1',
        formTypeId: '308F',
        instructorId: 'u-maria',
        header: { aircraftType: 'A320', trainingDevice: 'FFS', event: 'OPC Recurrent', date: iso(now - 9 * d), flightTimePF: '1:30', flightTimePM: '1:30', instructorQual: 'TRI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: 'u-lukas', position: 'CDR', seat: 'Left',
            grades: [
              { code: 'KNO', grade: 4, comment: '' }, { code: 'PRO', grade: 4, comment: '' },
              { code: 'COM', grade: 5, comment: 'Sehr klare Briefings.' }, { code: 'FPA', grade: 4, comment: '' },
              { code: 'FPM', grade: 3, comment: 'Manuelles Fliegen im Anflug etwas unruhig.' }, { code: 'LTW', grade: 4, comment: '' },
              { code: 'PSD', grade: 4, comment: '' }, { code: 'SAW', grade: 4, comment: '' }, { code: 'WLM', grade: 4, comment: '' },
            ],
            positiveComment: 'Ruhige, strukturierte Arbeitsweise, gute Kommunikation.',
            developmentComment: 'Manuelles Fliegen ohne Flight Director weiter üben.',
            summaryComment: 'Anforderungen erfüllt.',
            overall: 'competent',
          },
        ],
        sessionStatus: 'completed', freeText: {},
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'sent',
        createdAt: now - 9 * d, signedAt: now - 9 * d + 2 * h,
      },
      {
        id: 'gr2',
        formTypeId: '308A',
        instructorId: 'u-stefan',
        header: { aircraftType: 'B737', trainingDevice: 'FFS', event: 'TR Session 4', date: iso(now - 5 * d), flightTimePF: '2:00', flightTimePM: '2:00', instructorQual: 'TKI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: 'u-sophie', position: 'FO', seat: 'Right',
            grades: [
              { code: 'KNO', grade: 3, comment: '' }, { code: 'PRO', grade: 2, comment: 'Checklisten mehrfach zu spät.' },
              { code: 'COM', grade: 3, comment: '' }, { code: 'FPA', grade: 3, comment: '' },
              { code: 'FPM', grade: 2, comment: 'Engine-out-Handling nicht stabil.' }, { code: 'LTW', grade: 3, comment: '' },
              { code: 'PSD', grade: 2, comment: '' }, { code: 'SAW', grade: 3, comment: '' }, { code: 'WLM', grade: 2, comment: 'Unter Belastung Priorisierung verloren.' },
            ],
            positiveComment: 'Gute Vorbereitung, offene Fragen aktiv angesprochen.',
            developmentComment: 'Engine-out-Verfahren und Workload-Priorisierung wiederholen.',
            summaryComment: 'Zusatztraining erforderlich.',
            overall: 'not_competent',
          },
        ],
        sessionStatus: 'not_completed', freeText: {},
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'failed', mailError: 'SMTP-Zeitüberschreitung beim Eskalationsempfänger',
        createdAt: now - 5 * d, signedAt: now - 5 * d + 90 * 60_000,
      },
      {
        id: 'gr3',
        formTypeId: '306',
        instructorId: 'u-stefan',
        header: { aircraftType: 'B737', date: iso(now - 4 * d), trainingDevice: 'FFS' },
        trainees: [],
        sessionStatus: null,
        freeText: {
          'Deficiency': 'Engine-out-Handling und Workload-Priorisierung unter Belastung.',
          'Additional training conducted': 'Zusatzsession 90 Minuten mit Fokus auf EFATO und Checklisten-Timing.',
          'Result': 'Anforderungen nach Zusatztraining erfüllt.',
        },
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'sent', parentId: 'gr2',
        createdAt: now - 4 * d, signedAt: now - 4 * d + h,
      },
      {
        id: 'gr4',
        formTypeId: '308G',
        instructorId: 'u-patrick',
        header: { aircraftType: 'A320', trainingDevice: 'FFS', event: 'TRI Standardisierung', date: iso(now - 2 * d), operation: 'MPO', program: 'PRG 1', candidateRole: 'TRI Candidate', coiSeat: 'IOS' },
        trainees: [
          {
            traineeId: 'u-anna', position: 'CDR', seat: 'Left',
            grades: [
              { code: 'PRE', grade: 5, comment: '' }, { code: 'CLI', grade: 5, comment: 'Sehr angenehme Lernatmosphäre.' },
              { code: 'PRK', grade: 4, comment: '' }, { code: 'TEM', grade: 4, comment: '' },
              { code: 'TIM', grade: 3, comment: 'Debriefing zeitlich knapp.' }, { code: 'FAC', grade: 5, comment: '' },
              { code: 'ASS', grade: 4, comment: '' }, { code: 'MON', grade: 4, comment: '' },
              { code: 'EVA', grade: 4, comment: '' }, { code: 'REP', grade: 4, comment: '' },
            ],
            positiveComment: 'Exzellente Gesprächsführung, Trainee kam selbst auf die Lösungen.',
            developmentComment: 'Zeitmanagement im Debriefing straffen.',
            summaryComment: 'Standard erfüllt.',
            overall: 'competent',
          },
        ],
        sessionStatus: 'completed', freeText: {},
        signatureInstructor: SIG, signatureTrainee: null,
        status: 'awaiting_signature', mailStatus: 'pending',
        createdAt: now - 2 * d,
      },
      {
        id: 'gr5',
        formTypeId: '308F',
        instructorId: 'u-maria',
        header: { aircraftType: 'A320', trainingDevice: 'FFS', event: 'OPC Recurrent', date: iso(now - 30 * d), flightTimePF: '1:30', flightTimePM: '1:30', instructorQual: 'TRI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: 'u-lukas', position: 'CDR', seat: 'Left',
            grades: [
              { code: 'KNO', grade: 3, comment: '' }, { code: 'PRO', grade: 3, comment: '' },
              { code: 'COM', grade: 4, comment: '' }, { code: 'FPA', grade: 3, comment: '' },
              { code: 'FPM', grade: 2, comment: 'Manuelle Steuerung unpräzise.' }, { code: 'LTW', grade: 3, comment: '' },
              { code: 'PSD', grade: 3, comment: '' }, { code: 'SAW', grade: 3, comment: '' }, { code: 'WLM', grade: 3, comment: '' },
            ],
            positiveComment: 'Solide Grundlagen.',
            developmentComment: 'Manuelles Fliegen deutlich mehr üben.',
            summaryComment: 'Knapp bestanden.',
            overall: 'competent',
          },
        ],
        sessionStatus: 'completed', freeText: {},
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'sent',
        createdAt: now - 30 * d, signedAt: now - 30 * d + h,
      },
    ],
  }
}
