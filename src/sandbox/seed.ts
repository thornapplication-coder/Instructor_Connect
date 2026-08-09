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
 * Sandbox-Seed-Daten (Spez. §14) — reiner Simulatorbetrieb mit den Mustern
 * Challenger 350 und Citation XLS+. Drei Rollen: Patrick Thorn (Superadmin),
 * Christian Terler (Admin), Michael Holy (Mitglied/Instruktor).
 */
export function createSeedState(): AppState {
  const now = Date.now()
  return {
    users: [
      { id: 'u-patrick', name: 'Patrick Thorn', email: 'patrick.thorn@aviationacademy.at', phone: '+43 664 1000001', role: 'superadmin', canEditDirectory: true, canGrade: true, isTrainee: false, aircraftTypes: ['Challenger 350', 'Citation XLS+'], active: true },
      { id: 'u-christian', name: 'Christian Terler', email: 'christian.terler@aviationacademy.at', phone: '+43 664 1000002', role: 'group_admin', canEditDirectory: true, canGrade: true, isTrainee: false, aircraftTypes: ['Challenger 350'], active: true },
      { id: 'u-michael', name: 'Michael Holy', email: 'michael.holy@aviationacademy.at', phone: '+43 664 1000003', role: 'member', canEditDirectory: false, canGrade: true, isTrainee: false, aircraftTypes: ['Citation XLS+'], active: true },
      { id: 'u-max', name: 'Max Mustermann', email: 'training.admin@aviationacademy.at', phone: '+43 1 5550 300', role: 'training_admin', canEditDirectory: false, canGrade: false, isTrainee: false, aircraftTypes: [], active: true },
    ],
    groups: [
      {
        id: 'g-auto',
        name: 'Autothrottle',
        purpose: 'Austausch zum Autothrottle-Verhalten der Challenger 350 im Simulator: Trainingsszenarien, Besonderheiten, Standardisierung.',
        adminIds: ['u-christian'],
        memberIds: ['u-patrick', 'u-christian', 'u-michael'],
        retention: '30d',
        muted: false,
      },
      {
        id: 'g-defects',
        name: 'SIM Defects',
        purpose: 'Kurzfristige Meldungen zu Defekten und Einschränkungen der Simulatoren — Workarounds und Reparaturstatus.',
        adminIds: ['u-patrick'],
        memberIds: ['u-patrick', 'u-christian', 'u-michael'],
        retention: '7d',
        muted: false,
      },
      {
        id: 'g-ground',
        name: 'Ground Training',
        purpose: 'Organisation des Ground Trainings: Termine, Unterlagen, Räume.',
        adminIds: ['u-christian'],
        memberIds: ['u-patrick', 'u-christian'],
        retention: '30d',
        muted: false,
      },
    ],
    messages: [
      { id: 'm1', groupId: 'g-auto', authorId: 'u-christian', text: 'Beim Go-Around-Szenario in Session 3 bitte auf das Autothrottle-Verhalten nach TOGA achten — im Debriefing gestern gab es dazu mehrere Fragen.', createdAt: now - 2 * d },
      { id: 'm2', groupId: 'g-auto', authorId: 'u-michael', text: 'Gibt es dazu eine Kurzreferenz? Auf der Citation XLS+ ist das Verfahren ja anders.', createdAt: now - 2 * d + 25 * 60_000 },
      { id: 'm3', groupId: 'g-auto', authorId: 'u-patrick', text: 'Ja — in der Instructor Info liegt das Standard Briefing, dort ist der Unterschied beschrieben.', createdAt: now - 2 * d + 40 * 60_000 },
      { id: 'm4', groupId: 'g-defects', authorId: 'u-patrick', text: 'Challenger-350-Sim: Ruderpedale links melden sporadisch Force-Feedback-Aussetzer. Technik ist informiert, Workaround siehe Instructor Info.', createdAt: now - 26 * h },
      { id: 'm5', groupId: 'g-defects', authorId: 'u-michael', text: 'Im Citation-Sim ist der IOS-Touchscreen rechts träge — Neustart hilft kurzfristig.', createdAt: now - 5 * h, attachment: { name: 'ios-touchscreen.jpg', kind: 'image', sizeMB: 1.4 } },
      { id: 'm6', groupId: 'g-ground', authorId: 'u-christian', text: 'Ground Training „Performance & Limitations Challenger 350“ am Donnerstag 09:00, Schulungsraum 1. Unterlagen liegen in der Instructor Info.', createdAt: now - 24 * h },
      { id: 'm7', groupId: 'g-ground', authorId: 'u-patrick', text: 'Beamer im Schulungsraum 1 ist repariert.', createdAt: now - 3 * h },
    ],
    polls: [
      {
        id: 'p1',
        groupId: 'g-auto',
        authorId: 'u-christian',
        question: 'Passt Mittwoch 17:00 für das Standardisierungsbriefing Autothrottle?',
        type: 'yesno',
        options: [],
        votes: { 'u-patrick': 0, 'u-michael': 0 },
        closed: false,
        createdAt: now - 23 * h,
      },
      {
        id: 'p2',
        groupId: 'g-defects',
        authorId: 'u-patrick',
        question: 'Welcher Slot passt für den Technik-Check des Challenger-Sims?',
        type: 'multi',
        options: ['Montag früh', 'Mittwoch Abend', 'Samstag'],
        votes: { 'u-christian': 1, 'u-michael': 1 },
        closed: false,
        createdAt: now - 4 * h,
      },
    ],
    infoEntries: [
      {
        id: 'i1',
        type: 'pdf',
        title: 'NEW TM — Training Manual Revision 5',
        description: 'Neue genehmigte Fassung des Training Manuals — bitte Kenntnisnahme bestätigen.',
        fileName: 'sample.pdf',
        category: 'Approved Manuals',
        validFrom: iso(now - 2 * d),
        validUntil: '', // UFN
        requiresAck: true,
        groupIds: [], // alle Gruppen
        authorId: 'u-patrick',
        createdAt: now - 2 * d,
      },
      {
        id: 'i2',
        type: 'text',
        title: 'Noise Abatement Procedures',
        description: 'Aktualisierte Verfahren für die Trainingsszenarien beider Muster.',
        body: 'Für die Simulator-Szenarien gelten ab sofort die aktualisierten Noise Abatement Procedures: 1) NADP 1 als Standard für die Challenger 350, 2) NADP 2 für die Citation XLS+, 3) Abweichungen nur, wenn das Szenario es ausdrücklich vorsieht, 4) im Debriefing kurz auf die Unterschiede eingehen. Details siehe genehmigtes Training Manual.',
        category: 'Simulator Training',
        validFrom: iso(now - 5 * d),
        validUntil: iso(now + 60 * d),
        groupIds: ['g-auto'],
        authorId: 'u-christian',
        createdAt: now - 5 * d,
      },
      {
        id: 'i3',
        type: 'text',
        title: 'HR Nice to know',
        description: 'Kurzinfos aus HR: Zeiterfassung, Parkkarten, Instruktoren-Stammtisch.',
        body: '1) Die Zeiterfassung für Simulator-Sessions bitte ab sofort taggleich eintragen. 2) Neue Parkkarten liegen im Office bereit. 3) Der nächste Instruktoren-Stammtisch findet am ersten Freitag im Monat statt — Anmeldung nicht nötig.',
        category: 'HR',
        validFrom: iso(now - 20 * d),
        validUntil: '',
        groupIds: [],
        authorId: 'u-patrick',
        createdAt: now - 20 * d,
      },
      {
        id: 'i4',
        type: 'text',
        title: 'Standard Briefing',
        description: 'Verbindliche Struktur für das Briefing vor jeder Simulator-Session.',
        body: 'Vor jeder Simulator-Session gilt: 1) Lesson Plan und Ziele der Session prüfen, 2) Simulator-Setup vorbereiten (Position, Wetter, Beladung), 3) Tech-Log des Simulators auf offene Defekte prüfen (siehe SIM Defects), 4) Student Briefing nach Standardschema (Ziel, Ablauf, Abbruchkriterien), 5) Grading unmittelbar nach der Session abschließen.',
        category: 'Ground Training',
        validFrom: iso(now - 10 * d),
        validUntil: '',
        requiresAck: true,
        groupIds: ['g-ground'],
        authorId: 'u-christian',
        createdAt: now - 10 * d,
      },
    ],
    infoAcks: {
      i1: { 'u-christian': now - 1 * d },
      i4: { 'u-christian': now - 9 * d },
    },
    feedbackEntries: [
      {
        id: 'fb1',
        authorId: 'u-michael',
        category: 'IT / Technik',
        recipient: 'SIM Technik (daniel.duesentrieb@aviationacademy.at)',
        urgent: true,
        message: 'Der IOS-Touchscreen rechts im Citation-XLS+-Sim reagiert immer träger — heute Nachmittag sind zwei Sessions geplant.',
        attachment: { name: 'ios-touchscreen.jpg', kind: 'image', sizeMB: 1.4 },
        createdAt: now - 5 * h,
      },
      {
        id: 'fb2',
        authorId: 'u-christian',
        category: 'Organisation / Ablauf',
        recipient: 'Training Admin (training.admin@aviationacademy.at)',
        urgent: false,
        message: 'Vorschlag: Die Sim-Slots für die Folgewoche schon donnerstags veröffentlichen, dann lassen sich die Ground-Training-Termine besser planen.',
        createdAt: now - 2 * d,
      },
    ],
    starredInfo: { 'u-michael': ['i2'] },
    contacts: [
      { id: 'c1', department: 'Simulator-Technik', position: 'FSTD-Technik', name: 'Daniel Düsentrieb', phone: '+43 1 5550 200', email: 'daniel.duesentrieb@aviationacademy.at' },
      { id: 'c2', department: 'Training', position: 'Training Admin', name: 'Max Mustermann', phone: '+43 1 5550 300', email: 'training.admin@aviationacademy.at' },
      { id: 'c3', department: 'Administration', position: 'Office / Dispo Sim-Planung', name: 'James Bond', phone: '+43 1 5550 100', email: 'james.bond@aviationacademy.at' },
    ],
    changelog: [
      { version: '1.0.0', date: '2026-08-04', changes: 'Erstversion: Chat mit Gruppen und Umfragen, Instructor Info, Who to call, Feedback, Admin-Panel, Sandbox-Modus.' },
      { version: '1.1.0', date: '2026-08-09', changes: 'Grading Tool und Lesson Plans, Lese-Bestätigungen mit Kontrollliste, Gruppen-Sichtbarkeit, Feedback-Empfänger und Urgent, Offline-Modus (PWA) mit Update-Banner, Druck-Layout.' },
    ],
    settings: {
      defaultRetention: '30d',
      maxUploadMB: 25,
      feedbackCategories: ['Instructor / Training', 'IT / Technik', 'Kursinhalt', 'Organisation / Ablauf', 'Safety', 'Sonstiges'],
      feedbackCC: ['admin@aviationacademy.at'],
      feedbackRecipients: [
        'Training Admin (training.admin@aviationacademy.at)',
        'Office (james.bond@aviationacademy.at)',
        'SIM Technik (daniel.duesentrieb@aviationacademy.at)',
        'HR (hr@aviationacademy.at)',
      ],
      infoCategories: ['Ground Training', 'Simulator Training', 'HR', 'Operator Info', 'SIM Defects', 'AAA intern', 'Approved Manuals'],
      allowedDomains: ['aviationacademy.at'],
      imprint: { de: IMPRINT_DE, en: IMPRINT_EN },
      grading: GRADING_DEFAULTS,
      aircraftTypes: ['Challenger 350', 'Citation XLS+'],
      // Startwerte der Rechte-Matrix: Admin darf alles, Training Admin
      // sieht nur die Formularablage (lesen + herunterladen)
      permissions: {
        group_admin: { grading_create: true, grading_view_all: true, info_manage: true, lessons_manage: true, contacts_manage: true },
        training_admin: { grading_create: false, grading_view_all: true, info_manage: false, lessons_manage: false, contacts_manage: false },
      },
    },
    currentUserId: null,
    pendingLogin: null,
    timeOffsetMs: 0,
    seen: {},
    contactsChangedAt: now - 2 * d,
    lessonPlans: [
      { id: 'lp1', title: 'Challenger 350 — Lesson Plan TR Session 1-4', description: 'Grundlagen Type Rating: Systeme, Normalverfahren, erste FFS-Sessions.', aircraftType: 'Challenger 350', fileName: 'cl350-tr-session-1-4.pdf', uploadedBy: 'u-patrick', createdAt: now - 20 * d },
      { id: 'lp2', title: 'Challenger 350 — Lesson Plan Recurrent OPC', description: 'Ablauf und Schwerpunkte der jährlichen OPC-Session im Simulator.', aircraftType: 'Challenger 350', fileName: 'cl350-recurrent-opc.pdf', uploadedBy: 'u-christian', createdAt: now - 12 * d },
      { id: 'lp3', title: 'Citation XLS+ — Lesson Plan TR Session 1-4', description: 'Type Rating Citation XLS+: Systeme, SOPs, FFS-Einführung.', aircraftType: 'Citation XLS+', fileName: 'xls-tr-session-1-4.pdf', uploadedBy: 'u-patrick', createdAt: now - 18 * d },
      { id: 'lp4', title: 'Citation XLS+ — Lesson Plan LVO / CAT II', description: 'Schulung für Allwetterflugbetrieb im Simulator.', aircraftType: 'Citation XLS+', fileName: 'xls-lvo.pdf', uploadedBy: 'u-christian', createdAt: now - 6 * d },
    ],
    gradingRecords: [
      {
        id: 'gr1',
        formTypeId: '308F',
        instructorId: 'u-christian',
        header: { aircraftType: 'Challenger 350', trainingDevice: 'FFS', event: 'OPC Recurrent', ataChapters: 'ATA 22 Autoflight, ATA 27 Flight Controls, ATA 70-80 Power Plant', date: iso(now - 9 * d), flightTimePF: '01:30', flightTimePM: '01:30', instructorQual: 'TRI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: '', traineeName: 'Lukas Steiner', position: 'CDR', seat: 'Left',
            grades: [
              { code: 'KNO', grade: 4, comment: '' }, { code: 'PRO', grade: 4, comment: '' },
              { code: 'COM', grade: 5, comment: 'Very clear and concise briefings.' }, { code: 'FPA', grade: 4, comment: '' },
              { code: 'FPM', grade: 3, comment: 'Manual flying slightly unsteady on approach.' }, { code: 'LTW', grade: 4, comment: '' },
              { code: 'PSD', grade: 4, comment: '' }, { code: 'SAW', grade: 4, comment: '' }, { code: 'WLM', grade: 4, comment: '' },
            ],
            positiveComment: 'Calm, well-structured performance and good communication.',
            developmentComment: 'Continue practising manual flying without flight director.',
            summaryComment: 'Requirements met.',
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
        instructorId: 'u-michael',
        header: { aircraftType: 'Citation XLS+', trainingDevice: 'FFS', event: 'TR Session 4', date: iso(now - 5 * d), flightTimePF: '02:00', flightTimePM: '02:00', instructorQual: 'TKI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: '', traineeName: 'Sophie Berger', position: 'FO', seat: 'Right',
            grades: [
              { code: 'KNO', grade: 3, comment: '' }, { code: 'PRO', grade: 2, comment: 'Checklists repeatedly initiated late.' },
              { code: 'COM', grade: 3, comment: '' }, { code: 'FPA', grade: 3, comment: '' },
              { code: 'FPM', grade: 2, comment: 'Engine-out handling not stabilised.' }, { code: 'LTW', grade: 3, comment: '' },
              { code: 'PSD', grade: 2, comment: '' }, { code: 'SAW', grade: 3, comment: '' }, { code: 'WLM', grade: 2, comment: 'Lost prioritisation under high workload.' },
            ],
            positiveComment: 'Well prepared; actively raised open questions.',
            developmentComment: 'Repeat engine-out procedures and workload prioritisation.',
            summaryComment: 'Additional training required.',
            overall: 'not_competent',
          },
        ],
        sessionStatus: 'not_completed', freeText: {},
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'failed', mailError: 'SMTP timeout at escalation recipient',
        createdAt: now - 5 * d, signedAt: now - 5 * d + 90 * 60_000,
      },
      {
        id: 'gr3',
        formTypeId: '306',
        instructorId: 'u-michael',
        header: { aircraftType: 'Citation XLS+', location: 'Sim Center', event: 'TR Session 4 — Additional Training', date: iso(now - 4 * d) },
        trainees: [],
        sessionStatus: null,
        freeText: {
          'State exercises marked with grade "2" or below': 'PRO (2), FPM (2), WLM (2) — TR Session 4 of the previous day.',
          'Description of deficiency': 'Engine-out handling and workload prioritisation not stabilised under high workload.',
          'Description of agreed retraining': 'Additional 90-minute session focusing on EFATO and checklist timing.',
        },
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'sent', parentId: 'gr2',
        createdAt: now - 4 * d, signedAt: now - 4 * d + h,
      },
      {
        id: 'gr4',
        formTypeId: '308G',
        instructorId: 'u-patrick',
        header: { aircraftType: 'Challenger 350', trainingDevice: 'FFS', event: 'TRI Standardisierung', date: iso(now - 2 * d), operation: 'MPO', program: 'PRG 1', candidateRole: 'TRI Candidate', coiSeat: 'IOS' },
        trainees: [
          {
            traineeId: '', traineeName: 'Christian Terler', position: 'CDR', seat: 'Left',
            grades: [
              { code: 'PRE', grade: 5, comment: '' }, { code: 'CLI', grade: 5, comment: 'Created a very positive learning atmosphere.' },
              { code: 'PRK', grade: 4, comment: '' }, { code: 'TEM', grade: 4, comment: '' },
              { code: 'TIM', grade: 3, comment: 'Debriefing time was tight.' }, { code: 'FAC', grade: 5, comment: '' },
              { code: 'ASS', grade: 4, comment: '' }, { code: 'MON', grade: 4, comment: '' },
              { code: 'EVA', grade: 4, comment: '' }, { code: 'REP', grade: 4, comment: '' },
            ],
            positiveComment: 'Excellent facilitation; the trainee arrived at the solutions independently.',
            developmentComment: 'Tighten time management during the debriefing.',
            summaryComment: 'Standard achieved.',
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
        instructorId: 'u-christian',
        header: { aircraftType: 'Challenger 350', trainingDevice: 'FFS', event: 'OPC Recurrent', ataChapters: 'ATA 22 Autoflight, ATA 34 Navigation', date: iso(now - 30 * d), flightTimePF: '01:30', flightTimePM: '01:30', instructorQual: 'TRI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: '', traineeName: 'Lukas Steiner', position: 'CDR', seat: 'Left',
            grades: [
              { code: 'KNO', grade: 3, comment: '' }, { code: 'PRO', grade: 3, comment: '' },
              { code: 'COM', grade: 4, comment: '' }, { code: 'FPA', grade: 3, comment: '' },
              { code: 'FPM', grade: 2, comment: 'Manual control imprecise.' }, { code: 'LTW', grade: 3, comment: '' },
              { code: 'PSD', grade: 3, comment: '' }, { code: 'SAW', grade: 3, comment: '' }, { code: 'WLM', grade: 3, comment: '' },
            ],
            positiveComment: 'Solid fundamentals.',
            developmentComment: 'Considerably more manual flying practice required.',
            summaryComment: 'Marginal pass.',
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
