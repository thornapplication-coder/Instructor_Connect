import { csvNum, csvRow } from './csv'
import type { GradingRecord, TraineeGrading } from './types'

/**
 * Der Behoerdenexport als reine Funktion — eine Quelle fuer zwei Ansichten.
 *
 * Der Export hing bisher als Closure im Superadmin-Panel: Er las `state`,
 * `currentUser` und die Filter der dortigen Liste direkt aus dem Umfeld.
 * Damit war er dort und nur dort verfuegbar. Der Training Admin, dessen
 * Aufgabe genau diese Ablage ist (ORA.GEN.220), musste jedes Blatt einzeln
 * als PDF ziehen — eine Jahresauswertung war Handarbeit.
 *
 * Hier steht dieselbe Logik als Funktion ohne React und ohne Store: Sie
 * bekommt die bereits gefilterten Datensaetze, den Bestand (fuer
 * Folgeformulare und Namen) und die Beschriftungen, und gibt Text zurueck.
 * Damit kann sie geprueft werden — der Inhalt eines Behoerdenauszugs ist
 * nichts, was man beim Klicken bemerkt, wenn er falsch ist.
 *
 * Der Dateikopf traegt Zeitpunkt, ausfuehrende Person UND die aktiven Filter:
 * Die Datei muss selbst sagen, welcher Ausschnitt sie ist. Vorher exportierte
 * der Knopf neben der gefilterten Liste stillschweigend den Gesamtbestand —
 * gemessen: Liste auf einen Instruktor gefiltert, Datei mit dreien.
 */

export type ExportScope = 'records' | 'competencies' | 'people'

/** Was der Export ueber die Umgebung wissen muss — bewusst als einfache
 *  Werte und Funktionen, damit nichts vom Store hereinreicht. */
export type ExportContext = {
  /** Die Auswahl, die in der Liste steht — genau sie wird exportiert. */
  records: GradingRecord[]
  /** Der Gesamtbestand: Folgeformulare tragen ihren Piloten in den
   *  Kopfdaten und finden ihn nur ueber den Bestand. */
  alle: GradingRecord[]
  /** Aktive Listenfilter fuer den Dateikopf, als Paare. */
  filter: [string, string][]
  /** Zeitpunkt des Exports (mit Zeitversatz der Sandbox). */
  exportiertAm: number
  exportiertVon: string
  userName: (id: string) => string
  traineeLabel: (tr: { traineeName?: string; traineeId: string }) => string
  /** Piloten eines Blattes inklusive der aus den Kopfdaten abgeleiteten. */
  traineesOf: (r: GradingRecord, alle: GradingRecord[]) => TraineeGrading[]
  /** Kurzbezeichnung des Ausgangsformulars eines Folgeformulars. */
  parentLabel: (r: GradingRecord) => string
  formatDateTime: (ms: number) => string
  /** Kalibrierungszeilen fuer den Personen-Auszug; sonst leer. */
  kalibrierung?: { satz: string; personId: string; sessions: number; avg: number | null; abweichung: number | null }[]
}

/** Mittelwert der gesetzten Noten; „NO" (not observed) zaehlt nicht mit. */
export function avgOf(values: (number | 'NO' | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number')
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

/** Kopf jeder Exportdatei: wer, wann, welcher Ausschnitt. */
function kopf(c: ExportContext): string {
  let csv = csvRow(['Instructor Connect — Grading Export'])
  csv += csvRow(['Exported (date/time)', c.formatDateTime(c.exportiertAm), 'Exported by', c.exportiertVon])
  csv += csvRow([])
  c.filter.forEach(([k, v]) => (csv += csvRow([k, v])))
  csv += csvRow([])
  return csv
}

/**
 * Ein Blatt je Pilot.
 *
 * Behoerde, Unterschriftszeitpunkt und Fingerabdruck gehoeren in einen
 * Auszug fuer die Behoerde: AT- und UK-Vorgaenge liegen im selben Bestand,
 * und ohne `SignedAt`/`Fingerprint` laesst sich eine Zeile keinem geprueften
 * Dokument zuordnen.
 */
function recordsCsv(c: ExportContext): string {
  let csv = csvRow([
    'Form', 'Instructor', 'Trainee', 'AircraftType', 'Device', 'Date', 'Overall', 'Session', 'Status',
    'Authority', 'SignedAt', 'Fingerprint', 'FollowUpTo', 'Avg',
  ])
  c.records.forEach((r) => {
    if (r.trainees.length > 0) {
      r.trainees.forEach((tr) => {
        // Durchschnitt je Pilot, nicht des gesamten Formulars
        const avg = avgOf(tr.grades.map((g) => g.grade))
        csv += csvRow([
          r.formTypeId, c.userName(r.instructorId), c.traineeLabel(tr), r.header.aircraftType, r.header.trainingDevice,
          r.header.date, tr.overall, r.sessionStatus, r.status,
          r.authority ?? 'AT', r.signedAt ? c.formatDateTime(r.signedAt) : '', r.contentHash ?? '',
          r.parentId ? c.parentLabel(r) : '', csvNum(avg),
        ])
      })
      return
    }
    // Folgeformulare (306/310) fuehren keine Bewertung, gehoeren aber in die
    // Ablage — sie belegen die Nachschulung.
    c.traineesOf(r, c.alle).forEach((tr) => {
      csv += csvRow([
        r.formTypeId, c.userName(r.instructorId), c.traineeLabel(tr), r.header.aircraftType, r.header.trainingDevice ?? '',
        r.header.date, '', '', r.status,
        r.authority ?? 'AT', r.signedAt ? c.formatDateTime(r.signedAt) : '', r.contentHash ?? '',
        r.parentId ? c.parentLabel(r) : '', '',
      ])
    })
  })
  return csv
}

/** Eine Zeile je Kompetenz, dazu die Freitexte — sie sind der eigentliche
 *  Nachweis und fehlten frueher in jedem Export. */
function competenciesCsv(c: ExportContext): string {
  let csv = csvRow(['Form', 'Trainee', 'Competency', 'Title', 'Grade', 'Comment'])
  c.records.forEach((r) =>
    r.trainees.forEach((tr) => {
      tr.grades.forEach((gr) => {
        const title = r.competencies?.find((x) => x.code === gr.code)?.title ?? ''
        csv += csvRow([r.formTypeId, c.traineeLabel(tr), gr.code, title, gr.grade, gr.comment])
      })
      // Als eigene Zeilen je Pilot, damit die Spalten der Kompetenzzeilen
      // unveraendert bleiben.
      const zusammenfassung: [string, string | undefined][] = [
        ['Positive aspects', tr.positiveComment],
        ['Areas for development', tr.developmentComment],
        ['Summary', tr.summaryComment],
      ]
      zusammenfassung.forEach(([abschnitt, text]) => {
        if (text?.trim()) csv += csvRow([r.formTypeId, c.traineeLabel(tr), '', abschnitt, '', text])
      })
      if (tr.overall) csv += csvRow([r.formTypeId, c.traineeLabel(tr), '', 'Overall result', '', tr.overall])
    }),
  )
  c.records
    .filter((r) => r.trainees.length === 0)
    .forEach((r) =>
      Object.entries(r.freeText).forEach(([section, text]) => {
        c.traineesOf(r, c.alle).forEach((tr) => {
          csv += csvRow([r.formTypeId, c.traineeLabel(tr), '', section, '', text])
        })
      }),
    )
  return csv
}

/** Kalibrierung getrennt je Kompetenzsatz — Piloten- und
 *  Instruktorenbewertungen werden nie miteinander verglichen. */
function peopleCsv(c: ExportContext): string {
  let csv = csvRow(['CompetencySet', 'Person', 'Role', 'Sessions', 'AvgGrade', 'DeviationFromSetAvg'])
  ;(c.kalibrierung ?? []).forEach((z) => {
    csv += csvRow([z.satz, c.userName(z.personId), 'Instructor', z.sessions, csvNum(z.avg), csvNum(z.abweichung)])
  })
  return csv
}

export function buildGradingCsv(scope: ExportScope, c: ExportContext): string {
  const koerper = scope === 'records' ? recordsCsv(c) : scope === 'competencies' ? competenciesCsv(c) : peopleCsv(c)
  return kopf(c) + koerper
}

/** Exportzeitpunkt auch im Dateinamen — zwei Auszuege desselben Tages sind
 *  sonst im Downloadordner nicht auseinanderzuhalten. */
export function gradingCsvName(scope: ExportScope, ms: number): string {
  const d = new Date(ms)
  const zwei = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}_${zwei(d.getHours())}-${zwei(d.getMinutes())}`
  return `grading-${scope}_${stamp}.csv`
}
