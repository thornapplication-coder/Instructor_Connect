import type { CompetencySet, FormField, FormType, GradingSettings } from '../types'

/*
 * Voreinstellungen des Grading Tools nach OM Appendix 5.
 * Kompetenz-Sets, Observable Behaviours und Formularfelder sind im
 * Admin Panel pflegbar — diese Fassung ist nur der Startwert.
 */

export const PILOT_SET: CompetencySet = {
  key: 'pilot',
  name: 'Pilot competencies (308A–F, H)',
  // Observable Behaviours wörtlich aus dem OM (Rev. 3.0, 1.20.3)
  competencies: [
    {
      code: 'KNO',
      title: 'Application of knowledge',
      behaviours: [
        'OB 0.1 Demonstrates practical and applicable knowledge of limitations and systems and their interaction',
        'OB 0.2 Demonstrates required knowledge of published operating instructions',
        'OB 0.3 Demonstrates knowledge of the physical environment, the air traffic environment and the operational infrastructure (including air traffic routings, weather, airports)',
        'OB 0.4 Demonstrates appropriate knowledge of applicable legislation',
        'OB 0.5 Knows where to source required information',
        'OB 0.6 Demonstrates a positive interest in acquiring knowledge',
        'OB 0.7 Is able to apply knowledge effectively',
      ],
    },
    {
      code: 'PRO',
      title: 'Application of procedures and compliance with regulations',
      behaviours: [
        'OB 1.1 Identifies where to find procedures and regulations',
        'OB 1.2 Applies relevant operating instructions, procedures and techniques in a timely manner',
        'OB 1.3 Follows SOPs unless a higher degree of safety dictates an appropriate deviation',
        'OB 1.4 Operates aircraft systems and associated equipment correctly',
        'OB 1.5 Monitors aircraft systems status',
        'OB 1.6 Complies with applicable regulations',
        'OB 1.7 Applies relevant procedural knowledge',
      ],
    },
    {
      code: 'COM',
      title: 'Communication',
      behaviours: [
        'OB 2.1 Determines that the recipient is ready and able to receive information',
        'OB 2.2 Selects appropriately what, when, how and with whom to communicate',
        'OB 2.3 Conveys messages clearly, accurately and concisely',
        'OB 2.4 Confirms that the recipient demonstrates understanding of important information',
        'OB 2.5 Listens actively and demonstrates understanding when receiving information',
        'OB 2.6 Asks relevant and effective questions',
        'OB 2.7 Uses appropriate escalation in communication to resolve identified deviations',
        'OB 2.8 Uses and interprets non-verbal communication in a manner appropriate to the organisational and social culture',
        'OB 2.9 Adheres to standard radiotelephone phraseology and procedures',
        'OB 2.10 Accurately reads, interprets, constructs and responds to datalink messages in English',
      ],
    },
    {
      code: 'FPA',
      title: 'Aeroplane flight path management — automation',
      behaviours: [
        'OB 3.1 Uses appropriate flight management, guidance systems and automation, as installed and applicable to the conditions',
        'OB 3.2 Monitors and detects deviations from the intended flight path and takes appropriate action',
        'OB 3.3 Manages the flight path to achieve optimum operational performance',
        'OB 3.4 Maintains the intended flight path during flight using automation whilst managing other tasks and distractions',
        'OB 3.5 Selects appropriate level and mode of automation in a timely manner considering phase of flight and workload',
        'OB 3.6 Effectively monitors automation, including engagement and automatic mode transitions',
      ],
    },
    {
      code: 'FPM',
      title: 'Aeroplane flight path management — manual control',
      behaviours: [
        'OB 4.1 Controls the aircraft manually with accuracy and smoothness as appropriate to the situation',
        'OB 4.2 Monitors and detects deviations from the intended flight path and takes appropriate action',
        'OB 4.3 Manually controls the aeroplane using the relationship between aeroplane attitude, speed and thrust, and navigation signals or visual information',
        'OB 4.4 Manages the flight path to achieve optimum operational performance',
        'OB 4.5 Maintains the intended flight path during manual flight whilst managing other tasks and distractions',
        'OB 4.6 Uses appropriate flight management and guidance systems, as installed and applicable to the conditions',
        'OB 4.7 Effectively monitors flight guidance systems including engagement and automatic mode transitions',
      ],
    },
    {
      code: 'LTW',
      title: 'Leadership & teamwork',
      behaviours: [
        'OB 5.1 Encourages team participation and open communication',
        'OB 5.2 Demonstrates initiative and provides direction when required',
        'OB 5.3 Engages others in planning',
        'OB 5.4 Considers inputs from others',
        'OB 5.5 Gives and receives feedback constructively',
        'OB 5.6 Addresses and resolves conflicts and disagreements in a constructive manner',
        'OB 5.7 Exercises decisive leadership when required',
        'OB 5.8 Accepts responsibility for decisions and actions',
        'OB 5.9 Carries out instructions when directed',
        'OB 5.10 Applies effective intervention strategies to resolve identified deviations',
        'OB 5.11 Manages cultural and language challenges, as applicable',
      ],
    },
    {
      code: 'PSD',
      title: 'Problem-solving — decision-making',
      behaviours: [
        'OB 6.1 Identifies, assesses and manages threats and errors in a timely manner',
        'OB 6.2 Seeks accurate and adequate information from appropriate sources',
        'OB 6.3 Identifies and verifies what and why things have gone wrong, if appropriate',
        'OB 6.4 Perseveres in working through problems whilst prioritising safety',
        'OB 6.5 Identifies and considers appropriate options',
        'OB 6.6 Applies appropriate and timely decision-making techniques',
        'OB 6.7 Monitors, reviews and adapts decisions as required',
        'OB 6.8 Adapts when faced with situations where no guidance or procedure exists',
        'OB 6.9 Demonstrates resilience when encountering an unexpected event',
      ],
    },
    {
      code: 'SAW',
      title: 'Situation awareness and management of information',
      behaviours: [
        'OB 7.1 Monitors and assesses the state of the aeroplane and its systems',
        'OB 7.2 Monitors and assesses the aeroplane’s energy state, and its anticipated flight path',
        'OB 7.3 Monitors and assesses the general environment as it may affect the operation',
        'OB 7.4 Validates the accuracy of information and checks for gross errors',
        'OB 7.5 Maintains awareness of the people involved in or affected by the operation and their capacity to perform as expected',
        'OB 7.6 Develops effective contingency plans based upon potential risks associated with threats and errors',
        'OB 7.7 Responds to indications of reduced situation awareness',
      ],
    },
    {
      code: 'WLM',
      title: 'Workload management',
      behaviours: [
        'OB 8.1 Exercises self-control in all situations',
        'OB 8.2 Plans, prioritises and schedules appropriate tasks effectively',
        'OB 8.3 Manages time efficiently when carrying out tasks',
        'OB 8.4 Offers and gives assistance',
        'OB 8.5 Delegates tasks',
        'OB 8.6 Seeks and accepts assistance, when appropriate',
        'OB 8.7 Monitors, reviews and cross-checks actions conscientiously',
        'OB 8.8 Verifies that tasks are completed to the expected outcome',
        'OB 8.9 Manages and recovers from interruptions, distractions, variations and failures effectively while performing tasks',
      ],
    },
  ],
}

export const INSTRUCTOR_SET: CompetencySet = {
  key: 'instructor',
  name: 'Instructor competencies (308G)',
  // Kompetenzen und Observable Behaviours wörtlich nach der Originaltabelle
  // des Formulars 308G. Die Aufzählungsmarken (a), (b), … des Papierformulars
  // entfallen — die Liste wird in der App ohnehin als Aufzählung dargestellt.
  competencies: [
    {
      code: 'PRE',
      title: 'Prepare resources',
      behaviours: [
        'ensures adequate facilities',
        'prepares briefing material',
        'manages available tools',
        'plans training within the training envelope of the training platform',
      ],
    },
    {
      code: 'CLI',
      title: 'Create a climate conducive to learning',
      behaviours: [
        'establishes credentials, role models appropriate behaviour',
        'clarifies roles',
        'states objectives',
        'ascertains and supports trainees needs',
      ],
    },
    {
      code: 'PRK',
      title: 'Present knowledge',
      behaviours: ['communicates clearly', 'creates and sustains realism', 'looks for training opportunities'],
    },
    {
      code: 'TEM',
      title: 'Integrate TEM or CRM',
      behaviours: [
        'makes TEM and CRM links with technical training',
        'for aeroplanes: makes upset prevention links with technical training',
      ],
    },
    {
      code: 'TIM',
      title: 'Manage time to achieve training objectives',
      behaviours: ['allocates time appropriate to achieving competency objective'],
    },
    {
      code: 'FAC',
      title: 'Facilitate learning',
      behaviours: [
        'encourages trainee participation',
        'shows motivating, patient, confident and assertive manner',
        'conducts one-to-one coaching',
        'encourages mutual support',
      ],
    },
    {
      code: 'ASS',
      title: 'Assesses trainee performance',
      behaviours: [
        'assesses and encourages trainee self-assessment of performance against competency standards',
        'makes assessment decision and provides clear feedback',
        'observes CRM behaviour',
      ],
    },
    {
      code: 'MON',
      title: 'Monitor and review progress',
      behaviours: [
        'compares individual outcomes to defined objectives',
        'identifies individual differences in learning rates',
        'applies appropriate corrective action',
      ],
    },
    {
      code: 'EVA',
      title: 'Evaluate training sessions',
      behaviours: [
        'elicits feedback from trainees',
        'tracks training session processes against competence criteria',
        'keeps appropriate records',
      ],
    },
    {
      code: 'REP',
      title: 'Report outcome',
      behaviours: ['reports accurately using only observed actions and events'],
    },
  ],
}

const AIRCRAFT = ['ATR 42/72', 'C525 CJ1+', 'C525 M2', 'C560 XLS', 'C560 XLS+', 'CL30', 'CL604/605', 'EMB505']

/** Zeitangaben in Halbstundenschritten von 00:00 bis 14:30 — beginnend bei
 *  00:00, weil eine Position auch ohne Flugzeit besetzt sein kann
 *  (z. B. reine Beobachtung). */
export const DURATION_OPTIONS = Array.from({ length: 30 }, (_, i) => {
  const mins = i * 30
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
})

/** ATA-Kapitel des Recurrent-Formulars (Mehrfachauswahl, Reihenfolge wie im Original).
 *  Bewusst ohne Kommas in den Bezeichnungen — die Auswahl wird mit ", " gespeichert. */
export const ATA_CHAPTERS = [
  'ATA21 Air Conditioning / Environmental / Pressurization',
  'ATA22 Autoflight',
  'ATA23 Communication',
  'ATA24 Electrical Power',
  'ATA26 Fire Protection',
  'ATA27 Flight Controls',
  'ATA28 Fuel',
  'ATA29 Hydraulics',
  'ATA30 Ice & Rain Protection',
  'ATA31 Indication & Recording',
  'ATA32 Landing Gear',
  'ATA34 Navigation',
  'ATA35 Oxygen',
  'ATA36 Pneumatics',
  'ATA38 Water & Waste',
  'ATA49 APU',
  'ATA52 Doors',
  'ATA71 Powerplant',
]

/** Recurrent-Zyklus nach AAA-Syllabus — Alternative zur ATA-Auswahl */
export const RECURRENT_YEARS = ['AAA Year 1', 'AAA Year 2', 'AAA Year 3']
const DEVICES = ['OTD / Mock-Up', 'FTD / FNPT', 'FFS']

/** Muster-Varianten für den Difference-/Familiarisation-Nachweis (308C) */
export const VARIANTS = [
  'ATR PEC',
  'ATR NON PEC',
  'ATR GLASS',
  'C525 Citation Jet',
  'C525 CJ1+/CJ2+/CJ3',
  'C525 CJ1/CJ2',
  'C525 M2/CJ3+',
  'C525 CJ4',
  'C560 XL/XLS',
  'C560 XLS+',
  'CL 300',
  'CL 350',
  'CL 350 ATS',
  'CL 604',
  'CL 605',
  'CL 650',
]

/** Betriebsarten für die Umschulung (308D) */
export const OPS_TYPES = ['Single Pilot Ops', 'Multi Pilot Ops']

/** Trainingsstandorte — leere Auswahl bleibt zulässig */
export const LOCATIONS = ['AAA Neusiedl', 'LAT/AAA Zurich']

/** Trainingsereignisse des Type-Rating-Kurses (Formular 308A, Feld „Event") */
export const TR_EVENTS = [
  'Additional Training',
  'DT',
  'FAM 1',
  'FAM 2',
  'FBS',
  'FBS 1',
  'FBS 2',
  'FFS 1',
  'FFS 2',
  'FFS 3',
  'FFS 4',
  'FFS 5',
  'FFS 6',
  'FFS 7',
  'FFS 8',
  'System Integration 1',
  'System Integration 2',
  'System Integration 3',
  'System Integration 4',
  'System Integration 5',
  'System Integration 6',
  'System Integration 7',
  'System Integration 8',
]

const f = (
  key: string,
  label: string,
  type: FormField['type'] = 'text',
  opts?: { options?: string[]; required?: boolean; wide?: boolean; postGrading?: boolean; exclusiveWith?: string; hint?: string },
): FormField => ({
  key,
  label,
  type,
  options: opts?.options,
  required: opts?.required ?? false,
  wide: opts?.wide,
  postGrading: opts?.postGrading,
  exclusiveWith: opts?.exclusiveWith,
  hint: opts?.hint,
})

/* Kopffelder gemäß Original-Formularen (OM Appendix 5, Rev. 0.2) —
   exportiert, damit neu angelegte Formulartypen dieselbe Struktur bekommen */
export const HEAD_STANDARD: FormField[] = [
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
      // Ohne Namen ist ein Nachschulungsnachweis keinem Piloten zuzuordnen.
      f('traineeName', 'Pilot / Student Name', 'text', { required: true }),
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('location', 'Location', 'select', { options: LOCATIONS, required: true }),
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
      f('location', 'Location', 'select', { options: LOCATIONS, required: true }),
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
      f('location', 'Location', 'select', { options: LOCATIONS, required: true }),
    ],
    freeTextSections: [],
  },
  {
    id: '308A',
    title: 'Grading Sheet TR',
    competencySet: 'pilot',
    // wie HEAD_STANDARD, aber „Event" als Auswahlliste der Trainingsereignisse
    fields: HEAD_STANDARD.map((fld) =>
      fld.key === 'event' ? { ...fld, type: 'select' as const, options: TR_EVENTS } : fld,
    ),
    freeTextSections: [],
  },
  { id: '308B', title: 'Grading Sheet CCQ', competencySet: 'pilot', fields: HEAD_STANDARD, freeTextSections: [] },
  {
    id: '308C',
    title: 'Grading Sheet Difference Training',
    competencySet: 'pilot',
    fields: [
      f('variantFrom', 'From "Variant"', 'select', { options: VARIANTS, required: true }),
      f('variantTo', 'To "Variant"', 'select', { options: VARIANTS, required: true }),
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
      f('convFrom', 'Conv. From', 'select', { options: OPS_TYPES, required: true }),
      f('convTo', 'Conv. To', 'select', { options: OPS_TYPES, required: true }),
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
      f('location', 'Location', 'select', { options: LOCATIONS }),
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
      // Entweder der Zyklus nach AAA-Syllabus ODER die ATA-Kapitel — eines von
      // beiden ist Pflicht, die Auswahl schließt sich gegenseitig aus.
      f('recurrentCycle', 'Recurrent Cycle — according Aviation Academy Austria Syllabus', 'radiogroup', {
        options: RECURRENT_YEARS,
        wide: true,
        exclusiveWith: 'ataChapters',
      }),
      f('ataChapters', 'Recurrent Training — Recurrent by ATA', 'checkgroup', {
        options: ATA_CHAPTERS,
        wide: true,
        exclusiveWith: 'recurrentCycle',
      }),
      f('ataAdditional', 'Additional', 'text', { wide: true }),
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
      // Kopf exakt nach Original-Formular 308G (Seite 1)
      f('candidateQual', 'Candidate Instructor', 'radiogroup', {
        options: ['TRI Candidate', 'SFI Candidate', 'MCCI Candidate'],
        required: true,
        wide: true,
      }),
      f('candidateSeat', 'Candidate Instructor — position', 'checkgroup', {
        options: ['IOS', 'RH Seat', 'LH Seat'],
        required: true,
        wide: true,
      }),
      f('coiSeat', 'Course Instructor', 'checkgroup', {
        options: ['Either Pilot Seat (EPS)', 'IOS', 'Observer'],
        required: true,
        wide: true,
      }),
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('operation', 'Operation', 'radiogroup', { options: ['SPO', 'MPO', 'SPO + MPO'], required: true }),
      f('other', 'Other', 'text'),
      f('program', 'Program (PRG)', 'checkgroup', {
        options: ['PRG 1*', 'PRG 2**', 'PRG 3', 'PRG 4', 'PRG 5', 'PRG 6', 'PRG 7', 'PRG 8'],
        required: true,
        wide: true,
        hint: '* incl. Either Pilot Seat Training, ** incl. Intervention Training',
      }),
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
    title: 'Deferred Item',
    competencySet: null,
    fields: [
      f('traineeName', 'Pilot / Student Name', 'text', { required: true }),
      f('aircraftType', 'Aircraft Type', 'select', { options: AIRCRAFT, required: true }),
      f('date', 'Date', 'date', { required: true }),
      f('dueDate', 'Due Date', 'date'),
    ],
    freeTextSections: ['Deferred items', 'Planned completion'],
  },
]

export const GRADING_DEFAULTS: GradingSettings = {
  defaultRecipients: ['training.records@aviationacademy.at'],
  escalationRecipients: ['admin@aviationacademy.at', 'head.of.training@aviationacademy.at'],
  // Form 310 (Deferred Item) geht IMMER zusätzlich an den Training Admin
  deferredRecipients: ['training.admin@aviationacademy.at'],
  competencySets: [PILOT_SET, INSTRUCTOR_SET],
  formTypes: FORM_TYPES,
}
