import type { CompetencySet, FormField, FormType, GradingSettings } from '../types'

/*
 * Voreinstellungen des Grading Tools nach OM Appendix 5.
 * Kompetenz-Sets, Observable Behaviours und Formularfelder sind im
 * Admin Panel pflegbar — diese Fassung ist nur der Startwert.
 */

export const PILOT_SET: CompetencySet = {
  key: 'pilot',
  name: 'Pilot competencies (308A–F, H)',
  competencies: [
    {
      code: 'KNO',
      title: 'Application of knowledge',
      behaviours: [
        'Demonstrates practical and applicable knowledge of limitations and systems.',
        'Demonstrates required knowledge of published operating instructions and procedures.',
        'Applies knowledge effectively to the situation at hand.',
        'Identifies own knowledge gaps and seeks clarification.',
      ],
    },
    {
      code: 'PRO',
      title: 'Application of procedures and compliance with regulations',
      behaviours: [
        'Identifies and applies procedures in accordance with published operating instructions.',
        'Executes checklists correctly and at the appropriate time.',
        'Operates aircraft systems and associated equipment correctly.',
        'Identifies deviations from SOPs and justifies them where warranted.',
      ],
    },
    {
      code: 'COM',
      title: 'Communication',
      behaviours: [
        'Ensures the recipient is ready and able to receive information.',
        'Selects appropriate content, timing and means of communication.',
        'Confirms that information has been correctly understood.',
        'Listens actively and asks relevant questions.',
      ],
    },
    {
      code: 'FPA',
      title: 'Aeroplane flight path management — automation',
      behaviours: [
        'Controls the flight path through automation within tolerances.',
        'Monitors automation modes and state transitions.',
        'Selects the appropriate level of automation in a timely manner.',
        'Detects deviations and intervenes in time.',
      ],
    },
    {
      code: 'FPM',
      title: 'Aeroplane flight path management — manual control',
      behaviours: [
        'Controls the flight path manually within tolerances.',
        'Maintains a safe attitude with appropriate control precision.',
        'Compensates for disturbances calmly and with anticipation.',
        'Retains sufficient capacity for monitoring during manual flight.',
      ],
    },
    {
      code: 'LTW',
      title: 'Leadership and teamwork',
      behaviours: [
        'Encourages an open atmosphere and active team participation.',
        'Takes responsibility and makes decisions transparently.',
        'Delegates tasks appropriately and supports others.',
        'Addresses deviations respectfully but clearly.',
      ],
    },
    {
      code: 'PSD',
      title: 'Problem-solving — decision-making',
      behaviours: [
        'Identifies deviations and states the problem clearly.',
        'Gathers information and evaluates the available options.',
        'Decides in a timely manner and justifies the choice.',
        'Reviews the outcome of the decision and adjusts as required.',
      ],
    },
    {
      code: 'SAW',
      title: 'Situation awareness and management of information',
      behaviours: [
        'Monitors the state of the aircraft, its environment and the crew.',
        'Identifies threats early and anticipates developments.',
        'Maintains a realistic mental model of the situation.',
        'Recognises loss of situation awareness and re-establishes it.',
      ],
    },
    {
      code: 'WLM',
      title: 'Workload management',
      behaviours: [
        'Plans and prioritises tasks with foresight.',
        'Retains spare capacity even under high workload.',
        'Makes effective use of available resources.',
        'Recognises overload and takes countermeasures.',
      ],
    },
  ],
}

export const INSTRUCTOR_SET: CompetencySet = {
  key: 'instructor',
  name: 'Instructor competencies (308G)',
  competencies: [
    { code: 'PRE', title: 'Prepare resources', behaviours: ['Prepares documentation, equipment and scenarios completely.', 'Verifies availability and serviceability of the training device.'] },
    { code: 'CLI', title: 'Create a climate conducive to learning', behaviours: ['Creates an open and respectful learning atmosphere.', 'Lowers barriers and encourages questions.'] },
    { code: 'PRK', title: 'Present knowledge', behaviours: ['Presents content in a structured and comprehensible manner.', 'Adapts depth and pace to the trainee’s level of knowledge.'] },
    { code: 'TEM', title: 'Integrate TEM or CRM', behaviours: ['Integrates technical content with TEM/CRM principles.', 'Uses real-world examples for illustration.'] },
    { code: 'TIM', title: 'Manage time to achieve training objectives', behaviours: ['Keeps to the schedule and prioritises training objectives.', 'Responds flexibly to delays without loss of quality.'] },
    { code: 'FAC', title: 'Facilitate learning', behaviours: ['Guides trainees to their own conclusions through questioning.', 'Has solutions worked out rather than prescribed.'] },
    { code: 'ASS', title: 'Assess trainee performance', behaviours: ['Assesses transparently against defined criteria.', 'Separates observation from interpretation.'] },
    { code: 'MON', title: 'Monitor and review progress', behaviours: ['Tracks learning progress throughout the session.', 'Adapts the training to the observed progress.'] },
    { code: 'EVA', title: 'Evaluate training sessions', behaviours: ['Critically reflects on the conducted session.', 'Derives concrete improvements from the review.'] },
    { code: 'REP', title: 'Report outcome', behaviours: ['Documents the outcome completely and in a timely manner.', 'Reports significant findings to the responsible office.'] },
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
