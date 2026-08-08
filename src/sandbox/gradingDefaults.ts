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
      title: 'Flight path management — automation',
      behaviours: [
        'Steuert den Flugweg mit Automation innerhalb der Toleranzen.',
        'Überwacht Modus- und Zustandswechsel der Automation.',
        'Wählt die passende Automationsstufe rechtzeitig.',
        'Erkennt Abweichungen und greift zeitgerecht ein.',
      ],
    },
    {
      code: 'FPM',
      title: 'Flight path management — manual control',
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
      title: 'Problem-solving and decision-making',
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

/** Kopfdatenfelder, die alle Grading Sheets teilen */
const commonFields = (positions: string[]): FormField[] => [
  { key: 'aircraftType', label: 'Aircraft Type', type: 'select', options: ['A320', 'B737', 'DA42', 'Generic FNPT II'], required: true },
  { key: 'trainingDevice', label: 'Training Device', type: 'select', options: ['FFS Sim A', 'FFS Sim B', 'FNPT II', 'FTD 1'], required: true },
  { key: 'event', label: 'Event', type: 'text', required: true },
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'position', label: 'Position', type: 'select', options: positions, required: true },
  { key: 'flightTimePF', label: 'Flight Time PF', type: 'text', required: false },
  { key: 'flightTimePM', label: 'Flight Time PM', type: 'text', required: false },
]

const sheet = (id: FormType['id'], title: string, set: FormType['competencySet']): FormType => ({
  id,
  title,
  competencySet: set,
  fields: commonFields(set === 'instructor' ? ['Left', 'Right', 'Rear'] : ['CDR', 'FO']),
  freeTextSections: [],
})

export const FORM_TYPES: FormType[] = [
  {
    id: '306',
    title: 'Additional Training',
    competencySet: null,
    fields: [
      { key: 'aircraftType', label: 'Aircraft Type', type: 'select', options: ['A320', 'B737', 'DA42', 'Generic FNPT II'], required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'trainingDevice', label: 'Training Device', type: 'select', options: ['FFS Sim A', 'FFS Sim B', 'FNPT II', 'FTD 1'], required: false },
    ],
    freeTextSections: ['Deficiency', 'Additional training conducted', 'Result'],
  },
  sheet('308A', 'Grading Sheet TR', 'pilot'),
  sheet('308B', 'Grading Sheet CCQ', 'pilot'),
  sheet('308C', 'Grading Sheet Difference Training', 'pilot'),
  sheet('308D', 'Grading Sheet Conversion', 'pilot'),
  sheet('308E', 'Grading Sheet Renewal', 'pilot'),
  sheet('308F', 'Grading Sheet Recurrent', 'pilot'),
  sheet('308G', 'Grading Sheet TRI / SFI / MCCI', 'instructor'),
  sheet('308H', 'Grading Sheet Other Trainings', 'pilot'),
  {
    id: '310',
    title: 'Deferred Item List',
    competencySet: null,
    fields: [
      { key: 'aircraftType', label: 'Aircraft Type', type: 'select', options: ['A320', 'B737', 'DA42', 'Generic FNPT II'], required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'dueDate', label: 'Due Date', type: 'date', required: false },
    ],
    freeTextSections: ['Deferred items', 'Planned completion'],
  },
]

export const GRADING_DEFAULTS: GradingSettings = {
  defaultRecipients: ['training-records@instructorconnect.at'],
  escalationRecipients: ['admin@instructorconnect.at', 'head-of-training@instructorconnect.at'],
  competencySets: [PILOT_SET, INSTRUCTOR_SET],
  formTypes: FORM_TYPES,
}
