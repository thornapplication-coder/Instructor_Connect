import { describe, expect, it } from 'vitest'
import { avgOf, buildGradingCsv, gradingCsvName, type ExportContext } from './gradingExport'
import type { GradingRecord, TraineeGrading } from './types'

/**
 * Der Behoerdenexport ist der einzige Teil der App, dessen Fehler niemand
 * beim Bedienen bemerkt: Die Datei landet bei der Behoerde, nicht auf dem
 * Bildschirm. Deshalb steht sie hier auf dem Pruefstand.
 *
 * Bewacht werden die Zusagen, die in den Audits schon einmal gebrochen
 * waren:
 *  - Der Dateikopf nennt Zeitpunkt, Person UND die aktiven Filter. Ohne den
 *    letzten Teil sagt eine gefilterte Datei nicht, welcher Ausschnitt sie
 *    ist — und der Knopf neben der gefilterten Liste exportierte frueher
 *    stillschweigend den Gesamtbestand.
 *  - Behoerde, Unterschriftszeitpunkt und Fingerabdruck stehen in jeder
 *    Zeile: AT- und UK-Vorgaenge liegen im selben Bestand.
 *  - Ein Blatt mit zwei Piloten ergibt ZWEI Zeilen mit je eigenem
 *    Durchschnitt — nicht eine mit dem Mittel ueber beide.
 *  - Folgeformulare (306/310) fuehren keine Bewertung, gehoeren aber in die
 *    Ablage. Sie finden ihren Piloten nur ueber den Gesamtbestand.
 *  - Die Freitexte sind der eigentliche Nachweis und fehlten frueher.
 */

const pilot = (u: Partial<TraineeGrading> = {}): TraineeGrading => ({
  traineeName: 'Sophie Berger',
  traineeId: '',
  position: 'FO',
  seat: 'Right',
  grades: [
    { code: 'KNO', grade: 3, comment: '' },
    { code: 'PRO', grade: 2, comment: 'Checklists late.' },
    { code: 'COM', grade: 'NO', comment: '' },
  ],
  positiveComment: 'Well prepared.',
  developmentComment: '',
  summaryComment: '',
  overall: 'not_competent',
  ...u,
})

const blatt = (u: Partial<GradingRecord> = {}): GradingRecord =>
  ({
    id: 'r1',
    formTypeId: '308A',
    instructorId: 'u-holy',
    header: { aircraftType: 'C560 XLS+', trainingDevice: 'FFS', date: '2026-08-08' },
    trainees: [pilot()],
    competencies: [{ code: 'KNO', title: 'Application of knowledge', behaviours: [] }],
    sessionStatus: 'completed',
    freeText: {},
    signatureInstructor: null,
    signatureTrainee: null,
    status: 'signed',
    mailStatus: 'sent',
    createdAt: 0,
    signedAt: 1_000_000,
    authority: 'AT',
    contentHash: 'abc123',
    ...u,
  }) as GradingRecord

function ctx(records: GradingRecord[], u: Partial<ExportContext> = {}): ExportContext {
  return {
    records,
    alle: records,
    filter: [['Rows', `${records.length} of ${records.length}`]],
    exportiertAm: 1_700_000_000_000,
    exportiertVon: 'Patrick Thorn',
    userName: (id) => (id === 'u-holy' ? 'Michael Holy' : id),
    traineeLabel: (tr) => tr.traineeName || tr.traineeId || '—',
    traineesOf: (r) => r.trainees,
    parentLabel: () => '308A · 08.08.2026',
    formatDateTime: (ms) => `T${ms}`,
    ...u,
  }
}

const zeilen = (csv: string) => csv.trimEnd().split('\n')
const letzte = (z: string[]) => z[z.length - 1]

describe('avgOf', () => {
  it('mittelt nur die gesetzten Noten', () => {
    expect(avgOf([3, 2, 'NO', null])).toBe(2.5)
  })

  it('gibt ohne Note null zurueck — nicht 0', () => {
    // Eine 0 waere eine Aussage („sehr schlecht"), null ist keine.
    expect(avgOf(['NO', null])).toBeNull()
    expect(avgOf([])).toBeNull()
  })
})

describe('Dateikopf', () => {
  it('nennt Zeitpunkt, ausfuehrende Person und die aktiven Filter', () => {
    const csv = buildGradingCsv('records', ctx([blatt()], { filter: [['Rows', '1 of 3'], ['Instructor', 'Michael Holy']] }))
    const z = zeilen(csv)
    expect(z[0]).toBe('Instructor Connect — Grading Export')
    expect(z[1]).toContain('T1700000000000')
    expect(z[1]).toContain('Patrick Thorn')
    // Der Ausschnitt steht in der Datei, nicht nur im Kopf des Bedieners.
    expect(csv).toContain('Rows;1 of 3')
    expect(csv).toContain('Instructor;Michael Holy')
  })
})

describe('Auszug „records"', () => {
  it('fuehrt Behoerde, Unterschriftszeitpunkt und Fingerabdruck je Zeile', () => {
    const csv = buildGradingCsv('records', ctx([blatt()]))
    const kopf = zeilen(csv).find((l) => l.startsWith('Form;'))!
    expect(kopf.split(';')).toEqual([
      'Form', 'Instructor', 'Trainee', 'AircraftType', 'Device', 'Date', 'Overall', 'Session', 'Status',
      'Authority', 'SignedAt', 'Fingerprint', 'FollowUpTo', 'Avg',
    ])
    const daten = letzte(zeilen(csv)).split(';')
    expect(daten[0]).toBe('308A')
    expect(daten[2]).toBe('Sophie Berger')
    expect(daten[9]).toBe('AT')
    expect(daten[10]).toBe('T1000000')
    expect(daten[11]).toBe('abc123')
    // Durchschnitt aus 3 und 2; NO zaehlt nicht mit. Dezimalkomma fuers
    // deutsche Excel (siehe csv.ts).
    expect(daten[13]).toBe('2,50')
  })

  it('gibt je Pilot eine eigene Zeile mit eigenem Durchschnitt', () => {
    const zwei = blatt({
      trainees: [
        pilot({ traineeName: 'Sophie Berger', grades: [{ code: 'KNO', grade: 2, comment: '' }] }),
        pilot({ traineeName: 'Lukas Steiner', grades: [{ code: 'KNO', grade: 4, comment: '' }], overall: 'competent' }),
      ],
    })
    const daten = zeilen(buildGradingCsv('records', ctx([zwei]))).filter((l) => l.startsWith('308A;'))
    expect(daten).toHaveLength(2)
    expect(daten[0].split(';')[13]).toBe('2,00')
    expect(daten[1].split(';')[13]).toBe('4,00')
  })

  it('nimmt Folgeformulare ohne Bewertung mit und nennt ihr Ausgangsblatt', () => {
    // 306 belegt die Nachschulung — ohne diese Zeile fehlt der Beleg im
    // Auszug, obwohl er der Grund fuer das Blatt ist.
    const folge = blatt({ id: 'r2', formTypeId: '306', trainees: [], parentId: 'r1', contentHash: 'def456' })
    const csv = buildGradingCsv(
      'records',
      ctx([folge], { traineesOf: () => [pilot({ traineeName: 'Sophie Berger' })] }),
    )
    const daten = letzte(zeilen(csv)).split(';')
    expect(daten[0]).toBe('306')
    expect(daten[2]).toBe('Sophie Berger')
    expect(daten[6]).toBe('') // kein Ergebnis
    expect(daten[12]).toBe('308A · 08.08.2026')
  })
})

describe('Altbestand ohne die spaeteren Felder', () => {
  // Formulare aus der Zeit vor Behoerdenkennung, Fingerabdruck und
  // eingefrorenem Kompetenz-Wortlaut duerfen den Auszug nicht sprengen —
  // sie sind aufbewahrungspflichtig wie alle anderen.
  const alt = () =>
    blatt({
      header: { aircraftType: 'CL30', date: '2025-03-02' },
      trainees: [pilot({ grades: [{ code: 'KNO', grade: 'NO', comment: '' }], overall: null, positiveComment: '', summaryComment: '' })],
      competencies: undefined,
      authority: undefined,
      signedAt: undefined,
      contentHash: undefined,
      parentId: undefined,
      sessionStatus: null,
    })

  it('setzt AT als Behoerde und laesst die uebrigen Felder leer', () => {
    const daten = letzte(zeilen(buildGradingCsv('records', ctx([alt()])))).split(';')
    expect(daten[4]).toBe('') // kein Training Device
    expect(daten[9]).toBe('AT') // Vorgabe, kein leeres Feld
    expect(daten[10]).toBe('') // nie unterschrieben
    expect(daten[11]).toBe('') // kein Fingerabdruck
    expect(daten[12]).toBe('') // kein Ausgangsblatt
    expect(daten[13]).toBe('') // keine gesetzte Note
  })

  it('faellt beim Kompetenz-Wortlaut auf leer zurueck und laesst leere Abschnitte weg', () => {
    const csv = buildGradingCsv('competencies', ctx([alt()]))
    expect(csv).toContain('308A;Sophie Berger;KNO;;NO;')
    expect(csv).not.toContain('Positive aspects')
    expect(csv).not.toContain('Overall result')
  })

  it('nennt ein Folgeformular ohne Ausgangsblatt ohne Verweis', () => {
    const folge = blatt({ id: 'r3', formTypeId: '306', trainees: [], parentId: undefined, header: { aircraftType: 'CL30', date: '2025-03-02' } })
    const daten = letzte(zeilen(buildGradingCsv('records', ctx([folge], { traineesOf: () => [pilot()] })))).split(';')
    expect(daten[4]).toBe('')
    expect(daten[12]).toBe('')
  })

  it('faellt beim Namen auf die Nutzerkennung und dann auf einen Strich zurueck', () => {
    const ohneNamen = blatt({ trainees: [pilot({ traineeName: undefined, traineeId: 'u-berger' })] })
    const leer = blatt({ id: 'r4', trainees: [pilot({ traineeName: undefined, traineeId: '' })] })
    const csv = buildGradingCsv('records', ctx([ohneNamen, leer]))
    expect(csv).toContain(';u-berger;')
    expect(csv).toContain(';—;')
  })
})

describe('Auszug „competencies"', () => {
  it('schreibt Note, Wortlaut und Kommentar je Kompetenz', () => {
    const csv = buildGradingCsv('competencies', ctx([blatt()]))
    expect(csv).toContain('308A;Sophie Berger;KNO;Application of knowledge;3;')
    expect(csv).toContain('308A;Sophie Berger;PRO;;2;Checklists late.')
  })

  it('nimmt die Freitexte und das Gesamtergebnis mit', () => {
    // Genau der Teil, den ein Pruefer liest — er fehlte in jedem Export.
    const csv = buildGradingCsv('competencies', ctx([blatt()]))
    expect(csv).toContain('308A;Sophie Berger;;Positive aspects;;Well prepared.')
    expect(csv).toContain('308A;Sophie Berger;;Overall result;;not_competent')
    // Leere Abschnitte erzeugen keine Leerzeilen
    expect(csv).not.toContain('Areas for development')
  })

  it('gibt die Freitexte eines Folgeformulars je Pilot aus', () => {
    const folge = blatt({ id: 'r2', formTypeId: '310', trainees: [], freeText: { 'Deferred item': 'Engine-out repeat' } })
    const csv = buildGradingCsv('competencies', ctx([folge], { traineesOf: () => [pilot({ traineeName: 'Lukas Steiner' })] }))
    expect(csv).toContain('310;Lukas Steiner;;Deferred item;;Engine-out repeat')
  })
})

describe('Auszug „people"', () => {
  it('listet die Kalibrierung je Kompetenzsatz', () => {
    const csv = buildGradingCsv(
      'people',
      ctx([], { kalibrierung: [{ satz: 'Pilot', personId: 'u-holy', sessions: 7, avg: 3.4, abweichung: -0.63 }] }),
    )
    expect(csv).toContain('CompetencySet;Person;Role;Sessions;AvgGrade;DeviationFromSetAvg')
    expect(csv).toContain('Pilot;Michael Holy;Instructor;7;3,40;-0,63')
  })

  it('bleibt ohne Kalibrierungsdaten bei der Kopfzeile', () => {
    const csv = buildGradingCsv('people', ctx([]))
    expect(letzte(zeilen(csv))).toBe('CompetencySet;Person;Role;Sessions;AvgGrade;DeviationFromSetAvg')
  })
})

describe('Dateiname', () => {
  it('traegt Bereich, Tag und Uhrzeit', () => {
    // Ortszeit: der Name soll zu dem passen, was die Person auf der Uhr sah.
    const d = new Date(2026, 7, 13, 5, 9)
    expect(gradingCsvName('records', d.getTime())).toBe('grading-records_2026-08-13_05-09.csv')
  })
})
