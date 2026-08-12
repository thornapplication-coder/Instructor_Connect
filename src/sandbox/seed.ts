import { LESSON_CATEGORIES, type AppState } from '../types'
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
 * CL30 und C560 XLS+. Drei Rollen: Patrick Thorn (Superadmin),
 * Christian Terler (Admin), Michael Holy (Mitglied/Instruktor).
 */
export function createSeedState(): AppState {
  const now = Date.now()
  const seed = seedState(now)
  // Die Seed-Formulare wurden gegen den ausgelieferten Katalog geschrieben —
  // ihr Wortlaut wird beim Aufbau eingefroren, damit spätere Katalogpflege
  // die bereits unterschriebenen Dokumente nicht rückwirkend umschreibt.
  return {
    ...seed,
    gradingRecords: seed.gradingRecords.map((r) => {
      if (r.competencies || r.trainees.length === 0) return r
      const setKey = GRADING_DEFAULTS.formTypes.find((f) => f.id === r.formTypeId)?.competencySet
      const set = setKey ? GRADING_DEFAULTS.competencySets.find((c) => c.key === setKey) : undefined
      return set ? { ...r, competencies: set.competencies.map((c) => ({ code: c.code, title: c.title })) } : r
    }),
  }
}

function seedState(now: number): AppState {
  return {
    users: [
      { id: 'u-patrick', name: 'Patrick Thorn', email: 'patrick.thorn@aviationacademy.at', phone: '+43 664 1000001', role: 'superadmin', canEditDirectory: true, canGrade: true, isTrainee: false, aircraftTypes: ['CL30', 'C560 XLS+'], active: true },
      { id: 'u-christian', name: 'Christian Terler', email: 'christian.terler@aviationacademy.at', phone: '+43 664 1000002', role: 'group_admin', canEditDirectory: true, canGrade: true, isTrainee: false, aircraftTypes: ['CL30'], active: true },
      { id: 'u-michael', name: 'Michael Holy', email: 'michael.holy@aviationacademy.at', phone: '+43 664 1000003', role: 'member', canEditDirectory: false, canGrade: true, isTrainee: false, aircraftTypes: ['C560 XLS+'], active: true },
      { id: 'u-max', name: 'Steven Fermie', email: 'training.admin@aviationacademy.at', phone: '+43 1 5550 300', role: 'training_admin', canEditDirectory: false, canGrade: false, isTrainee: false, aircraftTypes: [], active: true },
    ],
    groups: [
      {
        id: 'g-auto',
        name: 'Autothrottle',
        aircraftType: 'CL30',
        purpose: 'Austausch zum Autothrottle-Verhalten der CL30 im Simulator: Trainingsszenarien, Besonderheiten, Standardisierung.',
        adminIds: ['u-christian'],
        memberIds: ['u-patrick', 'u-christian', 'u-michael'],
        retention: '30d',
        muted: false,
      },
      {
        id: 'g-defects',
        name: 'SIM Defects',
        aircraftType: 'C560 XLS+',
        purpose: 'Kurzfristige Meldungen zu Defekten und Einschränkungen der Simulatoren — Workarounds und Reparaturstatus.',
        adminIds: ['u-patrick'],
        memberIds: ['u-patrick', 'u-christian', 'u-michael'],
        retention: '7d',
        muted: false,
      },
      {
        id: 'g-ground',
        name: 'Ground Training',
        aircraftType: '',
        purpose: 'Organisation des Ground Trainings: Termine, Unterlagen, Räume.',
        adminIds: ['u-christian'],
        memberIds: ['u-patrick', 'u-christian'],
        retention: '30d',
        muted: false,
      },
    ],
    messages: [
      { id: 'm1', groupId: 'g-auto', authorId: 'u-christian', text: 'Beim Go-Around-Szenario in Session 3 bitte auf das Autothrottle-Verhalten nach TOGA achten — im Debriefing gestern gab es dazu mehrere Fragen.', createdAt: now - 2 * d },
      { id: 'm2', groupId: 'g-auto', authorId: 'u-michael', text: 'Gibt es dazu eine Kurzreferenz? Auf der C560 XLS+ ist das Verfahren ja anders.', createdAt: now - 2 * d + 25 * 60_000 },
      { id: 'm3', groupId: 'g-auto', authorId: 'u-patrick', text: 'Ja — in der Instructor Info liegt das Standard Briefing, dort ist der Unterschied beschrieben.', createdAt: now - 2 * d + 40 * 60_000 },
      { id: 'm4', groupId: 'g-defects', authorId: 'u-patrick', text: 'Challenger-350-Sim: Ruderpedale links melden sporadisch Force-Feedback-Aussetzer. Technik ist informiert, Workaround siehe Instructor Info.', createdAt: now - 26 * h },
      { id: 'm5', groupId: 'g-defects', authorId: 'u-michael', text: 'Im Citation-Sim ist der IOS-Touchscreen rechts träge — Neustart hilft kurzfristig.', createdAt: now - 5 * h, attachment: { name: 'ios-touchscreen.jpg', kind: 'image', sizeMB: 1.4 } },
      { id: 'm6', groupId: 'g-ground', authorId: 'u-christian', text: 'Ground Training „Performance & Limitations CL30“ am Donnerstag 09:00, Schulungsraum 1. Unterlagen liegen in der Instructor Info.', createdAt: now - 24 * h },
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
        // Gültigkeit ist Pflicht, seit Umfragen ein Ablaufdatum tragen —
        // die Seed-Umfragen führen sie deshalb ebenfalls.
        validUntil: now + 3 * d,
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
        validUntil: now + 5 * d,
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
        authorId: 'u-patrick',
        createdAt: now - 2 * d,
      },
      {
        id: 'i2',
        type: 'text',
        title: 'Noise Abatement Procedures',
        description: 'Aktualisierte Verfahren für die Trainingsszenarien beider Muster.',
        body: 'Für die Simulator-Szenarien gelten ab sofort die aktualisierten Noise Abatement Procedures: 1) NADP 1 als Standard für die CL30, 2) NADP 2 für die C560 XLS+, 3) Abweichungen nur, wenn das Szenario es ausdrücklich vorsieht, 4) im Debriefing kurz auf die Unterschiede eingehen. Details siehe genehmigtes Training Manual.',
        category: 'Simulator Training',
        validFrom: iso(now - 5 * d),
        validUntil: iso(now + 60 * d),
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
      { id: 'c2', department: 'Training', position: 'Training Admin', name: 'Steven Fermie', phone: '+43 1 5550 300', email: 'training.admin@aviationacademy.at' },
      { id: 'c3', department: 'Administration', position: 'Office / Dispo Sim-Planung', name: 'James Bond', phone: '+43 1 5550 100', email: 'james.bond@aviationacademy.at' },
    ],
    changelog: [{ version: '1.0.0', at: now, changes: 'Erststand.' }],
    settings: {
      defaultRetention: '30d',
      maxUploadMB: 25,
      feedbackCategories: ['General', 'Instructor / Training', 'IT / Technik', 'Kursinhalt', 'Organisation / Ablauf', 'Safety', 'Sonstiges'],
      feedbackCC: ['admin@aviationacademy.at'],
      feedbackRecipients: [
        'Training Admin (training.admin@aviationacademy.at)',
        'Office (james.bond@aviationacademy.at)',
        'SIM Technik (daniel.duesentrieb@aviationacademy.at)',
        'HR (hr@aviationacademy.at)',
      ],
      infoCategories: ['General', 'Ground Training', 'Simulator Training', 'HR', 'Operator Info', 'SIM Defects', 'AAA intern', 'Approved Manuals'],
      // Schulungsarten der Lesson Plans — im Admin-Panel pflegbar.
      lessonCategories: [...LESSON_CATEGORIES],
      documentHeader: {
        atoName: 'Aviation Academy Austria',
        approvalNumber: 'AT.ATO.106',
        approvalNumberUK: 'GBR.ATO.0541',
        formRevision: 'OM Appendix 5, Rev. 0.2',
      },
      allowedDomains: ['aviationacademy.at'],
      imprint: { de: IMPRINT_DE, en: IMPRINT_EN },
      grading: GRADING_DEFAULTS,
      aircraftTypes: ['ATR 42/72', 'C525 CJ1+', 'C525 M2', 'C560 XLS', 'C560 XLS+', 'CL30', 'CL604/605', 'EMB505'],
      // Startwerte der Rechte-Matrix: Admin darf alles, Training Admin
      // sieht nur die Formularablage (lesen + herunterladen)
      permissions: {
        group_admin: { grading_create: true, grading_view_all: true, info_manage: true, lessons_manage: true, contacts_manage: true },
        training_admin: { grading_create: false, grading_view_all: true, info_manage: false, lessons_manage: false, contacts_manage: false },
      },
    },
    currentUserId: null,
    pendingLogin: null,
    // Der Seed bringt die drei historischen Sessions selbst mit — der
    // Nachtrag in migrateState ist damit von Anfang an erledigt. Ohne diese
    // Marke käme er zum Zug, sobald ein Superadmin die Blätter löscht, und
    // stellte sie beim nächsten Laden wieder her.
    seedHistoryMigrated: true,
    timeOffsetMs: 0,
    seen: {},
    contactsChangedAt: now - 2 * d,
    // Zwei Demo-Notizen je Instruktor — sie zeigen beide Ebenen der Liste
    // (angeheftet, nach Muster) und wofuer Notizen gedacht sind: Merkposten
    // fuer die naechste Session, nicht Dokumentation.
    notes: [
      {
        id: 'n1',
        authorId: 'u-michael',
        title: 'Sophie Berger — Engine-out wiederholen',
        body: 'PRO bleibt über drei Sessions schwach (Checklisten spät initiiert). Nächstes Mal früher briefen und die Sequenz vor dem Start durchsprechen.',
        aircraftType: 'C560 XLS+',
        pinned: true,
        createdAt: now - 3 * d,
        updatedAt: now - 5 * h,
      },
      {
        id: 'n2',
        authorId: 'u-michael',
        title: 'IOS-Touchscreen rechts',
        body: 'Träger Touchscreen im Citation-Sim: Neustart hilft kurzfristig. Vor der Session prüfen, sonst kostet es zehn Minuten.',
        aircraftType: 'C560 XLS+',
        pinned: false,
        createdAt: now - 6 * d,
        updatedAt: now - 2 * d,
      },
      {
        id: 'n3',
        authorId: 'u-michael',
        title: 'Standardisierungsbriefing vorbereiten',
        body: 'Autothrottle-Verhalten nach TOGA: Unterschied CL30 / C560 XLS+ zusammenstellen. Unterlagen liegen in der Instructor Info.',
        aircraftType: '',
        pinned: false,
        createdAt: now - 9 * d,
        updatedAt: now - 9 * d,
      },
      {
        id: 'n4',
        authorId: 'u-patrick',
        title: 'Formularstand Rev. 5 durchsehen',
        body: 'Neue Fassung des Training Manuals gegen die Grading-Formulare prüfen — vor allem 308A und 306.',
        aircraftType: 'CL30',
        pinned: false,
        createdAt: now - 4 * d,
        updatedAt: now - 4 * d,
      },
    ],
    lessonPlans: [
      { id: 'lp1', title: 'CL30 — Lesson Plan TR Session 1-4', description: 'Grundlagen Type Rating: Systeme, Normalverfahren, erste FFS-Sessions.', aircraftType: 'CL30', category: 'Type Rating', fileName: 'cl350-tr-session-1-4.pdf', uploadedBy: 'u-patrick', createdAt: now - 20 * d },
      { id: 'lp2', title: 'CL30 — Lesson Plan Recurrent OPC', description: 'Ablauf und Schwerpunkte der jährlichen OPC-Session im Simulator.', aircraftType: 'CL30', category: 'Recurrent', fileName: 'cl350-recurrent-opc.pdf', uploadedBy: 'u-christian', createdAt: now - 12 * d },
      { id: 'lp3', title: 'C560 XLS+ — Lesson Plan TR Session 1-4', description: 'Type Rating C560 XLS+: Systeme, SOPs, FFS-Einführung.', aircraftType: 'C560 XLS+', category: 'Type Rating', fileName: 'xls-tr-session-1-4.pdf', uploadedBy: 'u-patrick', createdAt: now - 18 * d },
      { id: 'lp4', title: 'C560 XLS+ — Lesson Plan LVO / CAT II', description: 'Schulung für Allwetterflugbetrieb im Simulator.', aircraftType: 'C560 XLS+', category: 'Difference Training', fileName: 'xls-lvo.pdf', uploadedBy: 'u-christian', createdAt: now - 6 * d },
    ],
    gradingRecords: [
      /* Drei frühere Sessions von Sophie Berger — sie machen den Verlauf je
         Pilot überhaupt erst ablesbar: PRO bleibt über den Kurs schwach
         (wiederkehrende Schwäche), FPM verbessert sich sichtbar von 2 auf 4.
         Ein einzelnes Blatt zeigt so etwas nie.

         Wichtig: je Session höchstens EINE Zwei. Zwei Zweien machen einen
         Piloten nach autoNotCompetent zwingend „Not Competent" samt
         Pflicht-306 — ein Demo-Datensatz mit zwei Zweien und
         overall: 'competent' behauptet einen Zustand, den die App bei
         Neueingabe gar nicht zuließe, und hebelt die Pflichtkette aus. */
      {
        id: 'gr-hist1',
        formTypeId: '308A',
        instructorId: 'u-christian',
        header: { aircraftType: 'C560 XLS+', trainingDevice: 'FFS', event: 'FFS 1', date: iso(now - 40 * d), flightTimePF: '02:00', flightTimePM: '02:00', instructorQual: 'TRI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: '', traineeName: 'Sophie Berger', position: 'FO', seat: 'Right',
            grades: [
              { code: 'KNO', grade: 3, comment: '' }, { code: 'PRO', grade: 3, comment: '' },
              { code: 'COM', grade: 3, comment: '' }, { code: 'FPA', grade: 3, comment: '' },
              { code: 'FPM', grade: 2, comment: 'Manual handling still coarse.' }, { code: 'LTW', grade: 3, comment: '' },
              { code: 'PSD', grade: 3, comment: '' }, { code: 'SAW', grade: 3, comment: '' }, { code: 'WLM', grade: 3, comment: '' },
            ],
            positiveComment: 'Good preparation, asks precise questions.',
            developmentComment: 'Practise flows until they run without prompting.',
            summaryComment: 'Continue to next session.',
            overall: 'competent',
          },
        ],
        sessionStatus: 'completed', freeText: {},
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'sent',
        createdAt: now - 40 * d, signedAt: now - 40 * d + 2 * h,
      },
      {
        id: 'gr-hist2',
        formTypeId: '308A',
        instructorId: 'u-michael',
        header: { aircraftType: 'C560 XLS+', trainingDevice: 'FFS', event: 'FFS 2', date: iso(now - 26 * d), flightTimePF: '02:00', flightTimePM: '02:00', instructorQual: 'TKI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: '', traineeName: 'Sophie Berger', position: 'FO', seat: 'Right',
            grades: [
              { code: 'KNO', grade: 3, comment: '' }, { code: 'PRO', grade: 2, comment: 'Checklist timing still late.' },
              { code: 'COM', grade: 3, comment: '' }, { code: 'FPA', grade: 3, comment: '' },
              { code: 'FPM', grade: 3, comment: 'Noticeably steadier than last session.' }, { code: 'LTW', grade: 3, comment: '' },
              { code: 'PSD', grade: 3, comment: '' }, { code: 'SAW', grade: 3, comment: '' }, { code: 'WLM', grade: 3, comment: '' },
            ],
            positiveComment: 'Manual flying clearly improved.',
            developmentComment: 'Keep working on checklist discipline and workload management.',
            summaryComment: 'Continue to next session.',
            overall: 'competent',
          },
        ],
        sessionStatus: 'completed', freeText: {},
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'sent',
        createdAt: now - 26 * d, signedAt: now - 26 * d + 2 * h,
      },
      {
        id: 'gr-hist3',
        formTypeId: '308A',
        instructorId: 'u-michael',
        header: { aircraftType: 'C560 XLS+', trainingDevice: 'FFS', event: 'FFS 3', date: iso(now - 13 * d), flightTimePF: '02:00', flightTimePM: '02:00', instructorQual: 'TKI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: '', traineeName: 'Sophie Berger', position: 'FO', seat: 'Right',
            grades: [
              { code: 'KNO', grade: 4, comment: '' }, { code: 'PRO', grade: 2, comment: 'Checklists again initiated late.' },
              { code: 'COM', grade: 3, comment: '' }, { code: 'FPA', grade: 4, comment: '' },
              { code: 'FPM', grade: 4, comment: 'Manual handling now stable.' }, { code: 'LTW', grade: 3, comment: '' },
              { code: 'PSD', grade: 3, comment: '' }, { code: 'SAW', grade: 3, comment: '' }, { code: 'WLM', grade: 3, comment: '' },
            ],
            positiveComment: 'Handling and automation clearly on standard.',
            developmentComment: 'Checklist discipline and workload management remain open.',
            summaryComment: 'Continue to next session.',
            overall: 'competent',
          },
        ],
        sessionStatus: 'completed', freeText: {},
        signatureInstructor: SIG, signatureTrainee: SIG,
        status: 'signed', mailStatus: 'sent',
        createdAt: now - 13 * d, signedAt: now - 13 * d + 2 * h,
      },
      {
        id: 'gr1',
        formTypeId: '308F',
        instructorId: 'u-christian',
        header: { aircraftType: 'CL30', trainingDevice: 'FFS', event: 'OPC Recurrent', ataChapters: 'ATA22 Autoflight, ATA27 Flight Controls, ATA71 Powerplant', date: iso(now - 9 * d), flightTimePF: '01:30', flightTimePM: '01:30', instructorQual: 'TRI', instructorSeat: 'Right' },
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
        header: { aircraftType: 'C560 XLS+', trainingDevice: 'FFS', event: 'FFS 4', date: iso(now - 5 * d), flightTimePF: '02:00', flightTimePM: '02:00', instructorQual: 'TKI', instructorSeat: 'Right' },
        trainees: [
          {
            traineeId: '', traineeName: 'Sophie Berger', position: 'FO', seat: 'Right',
            grades: [
              { code: 'KNO', grade: 3, comment: '' }, { code: 'PRO', grade: 2, comment: 'Checklists repeatedly initiated late.' },
              { code: 'COM', grade: 3, comment: '' }, { code: 'FPA', grade: 3, comment: '' },
              { code: 'FPM', grade: 2, comment: 'Engine-out handling not stabilised.' }, { code: 'LTW', grade: 3, comment: '' },
              { code: 'PSD', grade: 2, comment: 'Decision making slow once the failure was recognised.' }, { code: 'SAW', grade: 3, comment: '' }, { code: 'WLM', grade: 2, comment: 'Lost prioritisation under high workload.' },
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
        header: { traineeName: 'Sophie Berger', aircraftType: 'C560 XLS+', location: 'AAA Neusiedl', event: 'FFS 4 — Additional Training', date: iso(now - 4 * d) },
        trainees: [],
        sessionStatus: null,
        freeText: {
          'State exercises marked with grade "2" or below': 'PRO (2), FPM (2), PSD (2), WLM (2) — FFS 4 of the previous day.',
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
        header: { aircraftType: 'CL30', trainingDevice: 'FFS', event: 'TRI Standardisierung', date: iso(now - 2 * d), operation: 'MPO', program: 'PRG 1*', candidateQual: 'TRI Candidate', candidateSeat: 'RH Seat', coiSeat: 'IOS' },
        trainees: [
          {
            traineeId: '', traineeName: 'Christian Terler', position: '', seat: '',
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
        header: { aircraftType: 'CL30', trainingDevice: 'FFS', event: 'OPC Recurrent', recurrentCycle: 'AAA Year 2', date: iso(now - 30 * d), flightTimePF: '01:30', flightTimePM: '01:30', instructorQual: 'TRI', instructorSeat: 'Right' },
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
