import type { CompetencySet, FormField, FormType, GradingSettings } from '../types'

/*
 * Voreinstellungen des Grading Tools nach OM Appendix 5.
 * Kompetenz-Sets, Observable Behaviours und Formularfelder sind im
 * Admin Panel pflegbar — diese Fassung ist nur der Startwert.
 */

export const PILOT_SET: CompetencySet = {
  key: 'pilot',
  name: 'Piloten-Set (308A–F, H)',
  competencies: [
    {
      code: 'KNO',
      title: 'Application of knowledge',
      behaviours: [
        'Demonstriert praxisgerechtes Wissen über Limitations und Systeme.',
        'Kennt die betrieblichen Anweisungen und Verfahren.',
        'Wendet Wissen auf die konkrete Situation an.',
        'Erkennt eigene Wissenslücken und fragt nach.',
      ],
    },
    {
      code: 'PRO',
      title: 'Application of procedures and compliance with regulations',
      behaviours: [
        'Identifiziert und wendet Verfahren gemäß veröffentlichter Vorgaben an.',
        'Führt Checklisten korrekt und zum richtigen Zeitpunkt aus.',
        'Bedient Systeme und Steuerung sachgerecht.',
        'Erkennt Abweichungen von SOPs und begründet sie nachvollziehbar.',
      ],
    },
    {
      code: 'COM',
      title: 'Communication',
      behaviours: [
        'Stellt sicher, dass der Empfänger bereit und aufnahmefähig ist.',
        'Wählt Inhalt, Zeitpunkt und Form der Mitteilung angemessen.',
        'Vergewissert sich, dass Informationen verstanden wurden.',
        'Hört aktiv zu und stellt gezielte Rückfragen.',
      ],
    },
    {
      code: 'FPA',
      title: 'Aeroplane flight path management — automation',
      behaviours: [
        'Steuert den Flugweg mit Automation innerhalb der Toleranzen.',
        'Überwacht Modus- und Zustandswechsel der Automation.',
        'Wählt die passende Automationsstufe rechtzeitig.',
        'Erkennt Abweichungen und greift zeitgerecht ein.',
      ],
    },
    {
      code: 'FPM',
      title: 'Aeroplane flight path management — manual control',
      behaviours: [
        'Steuert den Flugweg manuell innerhalb der Toleranzen.',
        'Hält die Fluglage sicher und mit angemessener Steuerpräzision.',
        'Kompensiert Störungen ruhig und vorausschauend.',
        'Behält bei manueller Steuerung ausreichend Kapazität für Überwachung.',
      ],
    },
    {
      code: 'LTW',
      title: 'Leadership and teamwork',
      behaviours: [
        'Fördert eine offene Atmosphäre und ermutigt zur Beteiligung.',
        'Übernimmt Verantwortung und trifft Entscheidungen nachvollziehbar.',
        'Delegiert Aufgaben angemessen und unterstützt andere.',
        'Spricht Abweichungen respektvoll, aber deutlich an.',
      ],
    },
    {
      code: 'PSD',
      title: 'Problem-solving — decision-making',
      behaviours: [
        'Erkennt Abweichungen und benennt das Problem klar.',
        'Sammelt Informationen und bewertet Handlungsoptionen.',
        'Entscheidet zeitgerecht und begründet die Wahl.',
        'Überprüft das Ergebnis der Entscheidung und passt an.',
      ],
    },
    {
      code: 'SAW',
      title: 'Situation awareness and management of information',
      behaviours: [
        'Überwacht Zustand von Luftfahrzeug, Umgebung und Besatzung.',
        'Erkennt Bedrohungen frühzeitig und antizipiert Entwicklungen.',
        'Hält ein realistisches Lagebild aufrecht.',
        'Erkennt Verlust der Situationswahrnehmung und stellt sie wieder her.',
      ],
    },
    {
      code: 'WLM',
      title: 'Workload management',
      behaviours: [
        'Plant und priorisiert Aufgaben vorausschauend.',
        'Behält auch unter Belastung Kapazitätsreserven.',
        'Nutzt verfügbare Ressourcen sinnvoll.',
        'Erkennt Überlastung und ergreift Gegenmaßnahmen.',
      ],
    },
  ],
}

export const INSTRUCTOR_SET: CompetencySet = {
  key: 'instructor',
  name: 'Instruktoren-Set (308G)',
  competencies: [
    { code: 'PRE', title: 'Prepare resources', behaviours: ['Bereitet Unterlagen, Gerät und Szenarien vollständig vor.', 'Prüft Verfügbarkeit und Funktion des Trainingsgeräts.'] },
    { code: 'CLI', title: 'Create a climate conducive to learning', behaviours: ['Schafft eine offene, wertschätzende Lernatmosphäre.', 'Baut Hemmschwellen ab und ermutigt zu Fragen.'] },
    { code: 'PRK', title: 'Present knowledge', behaviours: ['Vermittelt Inhalte strukturiert und verständlich.', 'Passt Tiefe und Tempo an den Wissensstand an.'] },
    { code: 'TEM', title: 'Integrate TEM or CRM', behaviours: ['Verknüpft technische Inhalte mit TEM/CRM-Aspekten.', 'Nutzt reale Beispiele zur Veranschaulichung.'] },
    { code: 'TIM', title: 'Manage time to achieve training objectives', behaviours: ['Hält den Zeitplan ein und priorisiert Lernziele.', 'Reagiert flexibel auf Zeitverzug ohne Qualitätsverlust.'] },
    { code: 'FAC', title: 'Facilitate learning', behaviours: ['Führt durch Fragen zur eigenständigen Erkenntnis.', 'Lässt Lösungswege erarbeiten statt vorzugeben.'] },
    { code: 'ASS', title: 'Assesses trainee performance', behaviours: ['Bewertet nachvollziehbar anhand definierter Kriterien.', 'Trennt Beobachtung von Interpretation.'] },
    { code: 'MON', title: 'Monitor and review progress', behaviours: ['Verfolgt den Lernfortschritt über die Session hinweg.', 'Passt das Training an den beobachteten Fortschritt an.'] },
    { code: 'EVA', title: 'Evaluate training sessions', behaviours: ['Reflektiert die eigene Session kritisch.', 'Leitet konkrete Verbesserungen ab.'] },
    { code: 'REP', title: 'Report outcome', behaviours: ['Dokumentiert Ergebnis vollständig und zeitgerecht.', 'Meldet auffällige Befunde an die zuständige Stelle.'] },
  ],
}

const AIRCRAFT = ['Challenger 350', 'Citation XLS+']

/** Uhrzeit-/Dauerwerte: 00:30 bis 14:30 in 30-Minuten-Schritten */
export const DURATION_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const mins = (i + 1) * 30
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
})

/** ATA-Kapitel für das Recurrent Training (Mehrfachauswahl) */
export const ATA_CHAPTERS = [
  'ATA 21 Air Conditioning', 'ATA 22 Autoflight', 'ATA 23 Communications',
  'ATA 24 Electrical Power', 'ATA 26 Fire Protection', 'ATA 27 Flight Controls',
  'ATA 28 Fuel', 'ATA 29 Hydraulic Power', 'ATA 30 Ice & Rain Protection',
  'ATA 31 Indicating / Recording', 'ATA 32 Landing Gear', 'ATA 33 Lights',
  'ATA 34 Navigation', 'ATA 35 Oxygen', 'ATA 36 Pneumatic', 'ATA 49 APU',
  'ATA 52 Doors', 'ATA 70-80 Power Plant',
]
const DEVICES = ['OTD / Mock-Up', 'FTD / FNPT', 'FFS']

const f = (key: string, label: string, type: FormField['type'] = 'text', opts?: { options?: string[]; required?: boolean; wide?: boolean; postGrading?: boolean }): FormField => ({
  key,
  label,
  type,
  options: opts?.options,
  required: opts?.required ?? false,
  wide: opts?.wide,
  postGrading: opts?.postGrading,
})

/* Kopffelder gemäß Original-Formularen (OM Appendix 5, Rev. 0.2) */
const HEAD_STANDARD: FormField[] = [
  f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
  f('date', 'Date', 'date', { required: true }),
  f('event', 'Event', 'text', { required: true }),
  f('trainingDevice', 'Training Device', 'radiogroup', { options: DEVICES, required: true }),
  f('flightTimePF', 'Flight Time PF', 'duration', { required: true, postGrading: true }),
  f('flightTimePM', 'Flight Time PM', 'duration', { required: true, postGrading: true }),
  f('other', 'Other', 'text', { wide: true }),
]

export const FORM_TYPES: FormType[] = [
  {
    id: '306',
    title: 'Additional Training',
    competencySet: null,
    fields: [
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('location', 'Location', 'text', { required: true }),
      f('event', 'Subject / Event', 'text', { required: true }),
      f('date', 'Date', 'date', { required: true }),
    ],
    freeTextSections: [
      'State exercises marked with grade "2" or below',
      'Description of deficiency',
      'Description of agreed retraining',
    ],
  },
  {
    id: '307A',
    title: 'Record of Attendance',
    competencySet: null,
    fields: [
      f('event', 'Subject / Event', 'text', { required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('duration', 'Duration', 'duration', { required: true }),
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT }),
      f('location', 'Location', 'text', { required: true }),
    ],
    freeTextSections: [],
  },
  {
    id: '307B',
    title: 'Record of Attendance CBT, WBT or VCR',
    competencySet: null,
    fields: [
      f('event', 'Subject / Event', 'text', { required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('duration', 'Duration', 'duration', { required: true }),
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT }),
      f('location', 'Location', 'text', { required: true }),
    ],
    freeTextSections: [],
  },
  { id: '308A', title: 'Grading Sheet TR', competencySet: 'pilot', fields: HEAD_STANDARD, freeTextSections: [] },
  { id: '308B', title: 'Grading Sheet CCQ', competencySet: 'pilot', fields: HEAD_STANDARD, freeTextSections: [] },
  {
    id: '308C',
    title: 'Grading Sheet Difference Training',
    competencySet: 'pilot',
    fields: [
      f('variantFrom', 'From "Variant"', 'text', { required: true }),
      f('variantTo', 'To "Variant"', 'text', { required: true }),
      f('event', 'Event', 'text', { required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('trainingDevice', 'Training Device', 'radiogroup', { options: ['OTD / Mock-Up', 'FTD / FNPT', 'FFS'], required: true }),
      f('flightTimePF', 'Flight Time PF', 'duration', { required: true, postGrading: true }),
      f('flightTimePM', 'Flight Time PM', 'duration', { required: true, postGrading: true }),
        ],
    freeTextSections: [],
  },
  {
    id: '308D',
    title: 'Grading Sheet Conversion',
    competencySet: 'pilot',
    fields: [
      f('convFrom', 'Conv. From', 'text', { required: true }),
      f('convTo', 'Conv. To', 'text', { required: true }),
      f('event', 'Event', 'text', { required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('trainingDevice', 'Training Device', 'radiogroup', { options: ['FFS'], required: true }),
      f('flightTimePF', 'Flight Time PF', 'duration', { required: true, postGrading: true }),
      f('flightTimePM', 'Flight Time PM', 'duration', { required: true, postGrading: true }),
        ],
    freeTextSections: [],
  },
  {
    id: '308E',
    title: 'Grading Sheet Renewal',
    competencySet: 'pilot',
    fields: [
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('location', 'Location', 'text'),
      f('date', 'Date', 'date', { required: true }),
      f('event', 'Event', 'text', { required: true }),
      f('trainingDevice', 'Training Device', 'radiogroup', { options: DEVICES, required: true }),
      f('topicsCovered', 'Topics Covered', 'textarea', { wide: true }),
      f('airportsUsed', 'Airports Used', 'text', { postGrading: true }),
      f('takeoffs', 'Takeoffs', 'number', { postGrading: true }),
      f('landings', 'Landings', 'number', { postGrading: true }),
      f('flightTimePF', 'Flight Time PF', 'duration', { required: true, postGrading: true }),
      f('flightTimePM', 'Flight Time PM', 'duration', { required: true, postGrading: true }),
      f('approaches', 'Type and number of approaches', 'text', { wide: true, postGrading: true }),
        ],
    freeTextSections: [],
  },
  {
    id: '308F',
    title: 'Grading Sheet Recurrent',
    competencySet: 'pilot',
    fields: [
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('event', 'Event', 'text', { required: true }),
      f('trainingDevice', 'Training Device', 'radiogroup', { options: DEVICES, required: true }),
      f('recurrentCycle', 'Recurrent Cycle', 'select', { options: ['Year 1', 'Year 2', 'Year 3'] }),
      f('ataChapters', 'ATA Chapters trained', 'checkgroup', { options: ATA_CHAPTERS, required: true, wide: true }),
      f('flightTimePF', 'Flight Time PF', 'duration', { required: true, postGrading: true }),
      f('flightTimePM', 'Flight Time PM', 'duration', { required: true, postGrading: true }),
      f('other', 'Other', 'text', { wide: true }),
        ],
    freeTextSections: [],
  },
  {
    id: '308G',
    title: 'Grading Sheet TRI / SFI / MCCI',
    competencySet: 'instructor',
    fields: [
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('operation', 'Operation', 'select', { options: ['SPO', 'MPO', 'SPO + MPO', 'Other'], required: true }),
      f('program', 'Program (PRG)', 'select', { options: ['PRG 1', 'PRG 2', 'PRG 3'] }),
      f('candidateRole', 'Candidate Instructor', 'radiogroup', { options: ['TRI Candidate', 'IOS'] }),
      f('coiSeat', 'Course Instructor', 'radiogroup', { options: ['Either Pilot Seat (EPS)', 'IOS', 'Observer'] }),
    ],
    freeTextSections: [],
  },
  {
    id: '308H',
    title: 'Grading Sheet Other Trainings',
    competencySet: 'pilot',
    fields: [
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('trainingDevice', 'Training Device', 'radiogroup', { options: ['FFS', 'FNPT', 'FTD'], required: true }),
      f('trainingKind', 'Training', 'select', { options: ['Initial Training', 'Recurrent Training'] }),
      f('event', 'Event', 'checkgroup', {
        required: true,
        wide: true,
        options: [
          'Adverse Weather', 'Command Course', 'CPDLC', 'EPSQ', 'ETOPS', 'HUD',
          'Intervention Training', 'LOFT', 'LVO / CAT II / CAT III', 'PBN',
          'RNP AR', 'Steep Approach', 'TO / LDG Currency', 'UPRT', 'ZFTT',
        ],
      }),
      f('specialAirports', 'Special Airport(s)', 'text', { wide: true }),
      f('otherTraining', 'Other Training', 'text', { wide: true }),
      f('airportsUsed', 'Airports Used', 'text', { postGrading: true }),
      f('takeoffs', 'Takeoffs', 'number', { postGrading: true }),
      f('landings', 'Landings', 'number', { postGrading: true }),
      f('flightTimePF', 'Flight Time PF', 'duration', { required: true, postGrading: true }),
      f('flightTimePM', 'Flight Time PM', 'duration', { required: true, postGrading: true }),
      f('approaches', 'Type and Number of Approaches', 'text', { wide: true, postGrading: true }),
        ],
    freeTextSections: [],
  },
  {
    id: '310',
    title: 'Deferred Item List',
    competencySet: null,
    fields: [
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('dueDate', 'Due Date', 'date'),
    ],
    freeTextSections: ['Deferred items', 'Planned completion'],
  },
]

export const GRADING_DEFAULTS: GradingSettings = {
  defaultRecipients: ['training-records@aviationacademy.at'],
  escalationRecipients: ['admin@aviationacademy.at', 'head-of-training@aviationacademy.at'],
  // Form 310 (Deferred Item List) geht IMMER zusätzlich an den Training Admin
  deferredRecipients: ['trainingadmin@aviationacademy.at'],
  competencySets: [PILOT_SET, INSTRUCTOR_SET],
  formTypes: FORM_TYPES,
}
