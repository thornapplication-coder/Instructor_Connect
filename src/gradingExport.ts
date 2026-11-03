import { csvNum, csvRow } from './csv'
import { formatDate, lokalerTag } from './datum'
import { kopfText, kopfZeilen, type ZusatzSchluessel } from './gradingKopf'
import { teilnehmerOf } from './gradingRules'
import { authorityOf, berichtsKennung, periodLabel, periodStart, trainingDate, type Flag, type PeriodKey, type SetStats } from './gradingStats'
import type { FormType, Grade, GradingRecord, Settings, TraineeGrading } from './types'

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
  /** Formularkatalog — Beschriftung und Art der Kopffelder (GTY-04). */
  formTypes: Pick<FormType, 'id' | 'competencySet' | 'fields'>[]
  /** Beschriftung der Angaben ohne Katalogfeld (Namensraum `forms`, nur
   *  Englisch) — dieselben Woerter wie auf dem Dokument. */
  beschriftung: (schluessel: ZusatzSchluessel) => string
  /** Kalibrierungszeilen fuer den Personen-Auszug (`kalibrierungsZeilen`); sonst leer. */
  kalibrierung?: KalibrierungsZeile[]
}

/** Eine Zeile des Personen-Auszugs: ein Instruktor in einem Kompetenzsatz. */
export type KalibrierungsZeile = {
  satz: string
  personId: string
  sessions: number
  avg: number | null
  /** Abweichung vom Mittel des Satzes; null, wenn es keinen Mittelwert gibt */
  abweichung: number | null
  /** Einstufung wie im Standardisierungsbericht (Within range, Discuss …) */
  einstufung: string
}

/**
 * Zeilen des Personen-Auszugs — uebernommen aus der Kalibrierung
 * (gradingStats.statsBySet), nicht nachgerechnet.
 *
 * Audit 11/2026, EXP-02: Die Ansicht rechnete die Abweichung fuer die Datei
 * selbst nach, als `(avg ?? 0) - (overall ?? 0)`. Wer im Zeitraum nur „NO"
 * vergeben hatte, stand damit als extrem strenger Bewerter (−3,10) im
 * Auszug fuer den Head of Training — waehrend Kachel und
 * Standardisierungsbericht fuer dieselbe Person ehrlich „keine Abweichung"
 * zeigten. Wer einen Wert in einem Format selbst ausrechnet, baut die
 * zweite Wahrheit. Die Einstufung kommt mit, damit die Datei dieselbe
 * Aussage traegt wie der Bericht.
 */
export function kalibrierungsZeilen(
  saetze: readonly SetStats[],
  satzName: (key: SetStats['key']) => string,
  einstufung: (flag: Flag) => string,
): KalibrierungsZeile[] {
  return saetze.flatMap((st) =>
    st.rows.map((r) => ({
      satz: satzName(st.key),
      personId: r.id,
      sessions: r.sessions,
      avg: r.mean,
      abweichung: r.delta,
      einstufung: einstufung(r.flag),
    })),
  )
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

/** Schluessel, die im Forms-Export eine eigene Spalte haben — sie stehen
 *  nicht noch einmal in „HeaderFields". */
const EIGENE_SPALTEN = ['aircraftType', 'trainingDevice', 'date', 'event', 'traineeName'] as const

/** Kopfdaten eines Datensatzes so, wie das Dokument sie zeigt. */
function kopfVon(c: ExportContext, r: GradingRecord) {
  return kopfZeilen(
    c.formTypes.find((f) => f.id === r.formTypeId),
    r,
    c.beschriftung,
  )
}

/**
 * Was eine Zeile ihrem Dokument zuordnet — in Forms- und Competencies-Export
 * aus DERSELBEN Funktion, sonst stuende dasselbe Blatt in zwei Formaten da.
 */
function beleg(c: ExportContext, r: GradingRecord) {
  return {
    datum: r.header.date ? formatDate(r.header.date) : '',
    event: r.header.event ?? '',
    unterschrieben: r.signedAt ? c.formatDateTime(r.signedAt) : '',
    fingerabdruck: r.contentHash ?? '',
  }
}

/**
 * Ein Blatt je Pilot.
 *
 * Behoerde, Unterschriftszeitpunkt und Fingerabdruck gehoeren in einen
 * Auszug fuer die Behoerde: AT- und UK-Vorgaenge liegen im selben Bestand,
 * und ohne `SignedAt`/`Fingerprint` laesst sich eine Zeile keinem geprueften
 * Dokument zuordnen.
 *
 * Audit 11/2026, GTY-04: Event und die typspezifischen Kopffelder fehlten —
 * zwei 308H desselben Tages belegten damit nicht, WELCHES Training
 * stattfand. „Event" steht jetzt neben dem Datum, alle uebrigen Kopffelder
 * (Due Date, Topics Covered, Qualifikation und Sitz des Instruktors …) als
 * „Label=Wert" in der letzten Spalte. Eine Spalte je Katalogfeld haette je
 * Formulartyp eine andere Spaltenfolge ergeben.
 *
 * Audit 11/2026, EXP-04: Das Datum stand als ISO-Rohwert (2026-11-01) neben
 * SignedAt im Format DD.MM.YYYY — zwei Datumsformate in derselben Zeile.
 * Bewusst unveraendert bleiben die Programmwerte (not_competent,
 * awaiting_signature): Der Auszug ist als Rohdaten beschriftet.
 */
function recordsCsv(c: ExportContext): string {
  let csv = csvRow([
    'Form', 'Instructor', 'Trainee', 'AircraftType', 'Device', 'Date', 'Event', 'Overall', 'Session', 'Status',
    'Authority', 'SignedAt', 'Fingerprint', 'FollowUpTo', 'Avg', 'HeaderFields',
  ])
  c.records.forEach((r) => {
    const kopffelder = kopfText(kopfVon(c, r), EIGENE_SPALTEN)
    const b = beleg(c, r)
    const zeile = (trainee: string, overall: string, session: string, avg: string) =>
      csvRow([
        r.formTypeId, c.userName(r.instructorId), trainee, r.header.aircraftType ?? '', r.header.trainingDevice ?? '',
        b.datum, b.event, overall, session, r.status,
        r.authority ?? 'AT', b.unterschrieben, b.fingerabdruck,
        r.parentId ? c.parentLabel(r) : '', avg, kopffelder,
      ])
    if (r.trainees.length > 0) {
      r.trainees.forEach((tr) => {
        // Durchschnitt je Pilot, nicht des gesamten Formulars
        const avg = avgOf(tr.grades.map((g) => g.grade))
        csv += zeile(c.traineeLabel(tr), tr.overall ?? '', r.sessionStatus ?? '', csvNum(avg))
      })
      return
    }
    /*
     * Anwesenheitslisten 307A/307B: eine Zeile je Teilnehmer.
     *
     * Audit 11/2026, GRD-02/EXP-01: Dieser Zweig fehlte. Ohne `trainees`
     * und ohne Kopffeld lieferte `traineesOf` nichts, und JEDER
     * Anwesenheitsnachweis fiel aus der Datei — waehrend der Dateikopf
     * „Rows;1 of 14" behauptete. Fuer die ORA.GEN.220-Ablage fehlte damit
     * eine ganze Formularart.
     */
    const teilnehmer = teilnehmerOf(r)
    if (teilnehmer.length > 0) {
      teilnehmer.forEach((name) => (csv += zeile(name, '', '', '')))
      return
    }
    // Folgeformulare (306/310) fuehren keine Bewertung, gehoeren aber in die
    // Ablage — sie belegen die Nachschulung.
    const personen = c.traineesOf(r, c.alle)
    personen.forEach((tr) => (csv += zeile(c.traineeLabel(tr), '', '', '')))
    // Rueckfall: Ein Datensatz ohne jede Person (leere Teilnehmerliste,
    // Folgeformular ohne Namen und ohne Ausgangsblatt) steht trotzdem in der
    // Datei. „Rows" im Dateikopf zaehlt Datensaetze — ein Datensatz ohne
    // Zeile ist genau die Luecke, die GRD-02 war.
    if (personen.length === 0) csv += zeile('', '', '', '')
  })
  return csv
}

/**
 * Eine Zeile je Kompetenz, dazu die Freitexte — sie sind der eigentliche
 * Nachweis und fehlten frueher in jedem Export.
 *
 * Nachtrag zum Audit 11/2026 (Formtypen, Punkt 1): Die Zeilen trugen nur
 * Form und Person. Vier 308A desselben Piloten (FFS 1–4) ergaben 36
 * Kompetenzzeilen, die keiner Session zuzuordnen waren. Datum und Event
 * stehen jetzt neben der Person, Unterschriftszeitpunkt und Fingerabdruck
 * am Ende — dieselben Werte wie im Forms-Export (`beleg`), ueber den
 * Fingerabdruck lassen sich beide Dateien verbinden.
 */
function competenciesCsv(c: ExportContext): string {
  let csv = csvRow(['Form', 'Trainee', 'Date', 'Event', 'Competency', 'Title', 'Grade', 'Comment', 'SignedAt', 'Fingerprint'])
  const zeile = (r: GradingRecord, person: string, code: string, titel: string, note: Grade | null | '', kommentar: string) => {
    const b = beleg(c, r)
    return csvRow([r.formTypeId, person, b.datum, b.event, code, titel, note, kommentar, b.unterschrieben, b.fingerabdruck])
  }
  c.records.forEach((r) =>
    r.trainees.forEach((tr) => {
      tr.grades.forEach((gr) => {
        const title = r.competencies?.find((x) => x.code === gr.code)?.title ?? ''
        csv += zeile(r, c.traineeLabel(tr), gr.code, title, gr.grade, gr.comment)
      })
      // Als eigene Zeilen je Pilot, damit die Spalten der Kompetenzzeilen
      // unveraendert bleiben.
      const zusammenfassung: [string, string | undefined][] = [
        ['Positive aspects', tr.positiveComment],
        ['Areas for development', tr.developmentComment],
        ['Summary', tr.summaryComment],
      ]
      zusammenfassung.forEach(([abschnitt, text]) => {
        if (text?.trim()) csv += zeile(r, c.traineeLabel(tr), '', abschnitt, '', text)
      })
      if (tr.overall) csv += zeile(r, c.traineeLabel(tr), '', 'Overall result', '', tr.overall)
    }),
  )
  c.records
    .filter((r) => r.trainees.length === 0)
    .forEach((r) => {
      // Audit 11/2026, GRD-02/EXP-01: Anwesenheit je Teilnehmer — mit den
      // uebrigen Kopfdaten (Dauer, Muster, Ort) als Kommentar, denn eine
      // Kompetenz gibt es auf diesen Blaettern nicht. Datum und Event haben
      // eigene Spalten und stehen dort nicht noch einmal.
      const teilnehmer = teilnehmerOf(r)
      if (teilnehmer.length > 0) {
        const kopf = kopfText(kopfVon(c, r), ['traineeName', 'date', 'event'])
        teilnehmer.forEach((name) => (csv += zeile(r, name, '', 'Attendance', '', kopf)))
      }
      // Ohne Namen (Altbestand ohne Pflichtfeld und ohne Ausgangsblatt)
      // gehen die Freitexte nicht verloren — sie stehen dann ohne Person da.
      const personen = c.traineesOf(r, c.alle).map(c.traineeLabel)
      Object.entries(r.freeText).forEach(([section, text]) => {
        ;(personen.length > 0 ? personen : ['']).forEach((person) => {
          csv += zeile(r, person, '', section, '', text)
        })
      })
    })
  return csv
}

/** Kalibrierung getrennt je Kompetenzsatz — Piloten- und
 *  Instruktorenbewertungen werden nie miteinander verglichen. */
function peopleCsv(c: ExportContext): string {
  let csv = csvRow(['CompetencySet', 'Person', 'Role', 'Sessions', 'AvgGrade', 'DeviationFromSetAvg', 'Assessment'])
  ;(c.kalibrierung ?? []).forEach((z) => {
    csv += csvRow([z.satz, c.userName(z.personId), 'Instructor', z.sessions, csvNum(z.avg), csvNum(z.abweichung), z.einstufung])
  })
  return csv
}

export function buildGradingCsv(scope: ExportScope, c: ExportContext): string {
  const koerper = scope === 'records' ? recordsCsv(c) : scope === 'competencies' ? competenciesCsv(c) : peopleCsv(c)
  return kopf(c) + koerper
}

/** Ausschnitt der Statistikseite: Flotte, Behoerde, Zeitraum. */
export type StatistikAusschnitt = {
  fleet: string
  authority: '' | 'AT' | 'UK'
  period: PeriodKey
  doc?: Partial<Pick<Settings['documentHeader'], 'approvalNumber' | 'approvalNumberUK'>>
}

/**
 * Dateikopf der drei Auszuege der Statistikseite.
 *
 * Audit 11/2026, EXP-03 (mit GRD-07): Der Kopf nannte nur Flotte und
 * Behoerde. Der Zeitraum der Kalibrierung stand nirgends in der Datei, und
 * dass Forms/Competencies Rohdaten sind, People dagegen nur unterschriebene
 * Blaetter ohne Folgeformulare zaehlt, sagte nur der Hinweis auf dem
 * Bildschirm. Die Datei muss selbst sagen, welcher Ausschnitt sie ist.
 *
 * Die Basis der Rohdaten bleibt bewusst ungefiltert (Hinweis „Unprocessed
 * raw data"), steht aber jetzt im Kopf — samt Zeitraum, der fuer alle drei
 * Auszuege gleich gilt (statistikRohdaten).
 */
export function statistikKopf(scope: ExportScope, a: StatistikAusschnitt): [string, string][] {
  return [
    ['Fleet', a.fleet || 'All fleets'],
    ['Authority', berichtsKennung(a.authority, a.doc)],
    ['Period', `${periodLabel(a.period)} (by training date)`],
    [
      'Basis',
      scope === 'people'
        ? 'Signed forms only, follow-up forms excluded'
        : 'All forms (raw data), including unsigned and follow-up forms',
    ],
  ]
}

/**
 * Datensaetze der Rohdaten-Auszuege der Statistikseite: Flotte, Behoerde
 * und Zeitraum (ueber den Schulungstag) wie auf der Seite, aber ohne die
 * Regeln der Kennzahlen — unterschrieben oder nicht, Folgeformular oder
 * nicht. Vorher galt der Zeitraum nur fuer den People-Auszug; drei Knoepfe
 * nebeneinander lieferten drei verschiedene Ausschnitte (EXP-03).
 */
export function statistikRohdaten(records: GradingRecord[], a: StatistikAusschnitt & { now: number }): GradingRecord[] {
  const ab = periodStart(a.period, a.now)
  return records.filter(
    (r) =>
      (!a.fleet || r.header.aircraftType === a.fleet) &&
      (!a.authority || authorityOf(r) === a.authority) &&
      trainingDate(r) >= ab,
  )
}

/** Exportzeitpunkt auch im Dateinamen — zwei Auszuege desselben Tages sind
 *  sonst im Downloadordner nicht auseinanderzuhalten. */
export function gradingCsvName(scope: ExportScope, ms: number): string {
  const d = new Date(ms)
  const zwei = (n: number) => String(n).padStart(2, '0')
  // Der Tag in Ortszeit aus datum.ts (GRD-16) — die dritte lokale Kopie
  // dieser Regel ist damit weg (EXP-04).
  return `grading-${scope}_${lokalerTag(ms)}_${zwei(d.getHours())}-${zwei(d.getMinutes())}.csv`
}
