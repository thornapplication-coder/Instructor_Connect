import { describe, expect, it } from 'vitest'
import { avgOf, buildGradingCsv, gradingCsvName, kalibrierungsZeilen, statistikKopf, statistikRohdaten, type ExportContext } from './gradingExport'
import { statsBySet } from './gradingStats'
import { formatDateTime } from './datum'
import { traineesOf } from './gradingRules'
import { FORM_TYPES } from './sandbox/gradingDefaults'
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
 *  - JEDER Datensatz der Auswahl hat mindestens eine Datenzeile — auch die
 *    Anwesenheitslisten 307A/307B (Audit 11/2026, GRD-02/EXP-01). Sie
 *    fehlten vollstaendig, waehrend der Dateikopf sie mitzaehlte.
 *  - Event und die uebrigen Kopffelder stehen im Forms-Export (GTY-04),
 *    das Datum im selben Format wie SignedAt (EXP-04).
 *  - Jede Zeile des Competencies-Exports laesst sich ihrem Dokument
 *    zuordnen: Datum, Event, SignedAt und Fingerprint wie im Forms-Export
 *    (Nachtrag zum Audit 11/2026, Formtypen Punkt 1).
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
    instructorId: 'u-mika',
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
    exportiertVon: 'Alex Beispiel',
    userName: (id) => (id === 'u-mika' ? 'Mika Beispiel' : id),
    traineeLabel: (tr) => tr.traineeName || tr.traineeId || '—',
    traineesOf: (r) => r.trainees,
    parentLabel: () => '308A · 08.08.2026',
    formatDateTime: (ms) => `T${ms}`,
    // Der echte Katalog: Ob 308H „Event" als Mehrfachauswahl fuehrt und
    // 310 ein Due Date hat, entscheidet er — nicht der Test.
    formTypes: FORM_TYPES,
    beschriftung: (k) => ({ 'forms:instructorQual': 'Instructor qualification', 'forms:instructorSeat': 'Instructor seat' })[k],
    ...u,
  }
}

const zeilen = (csv: string) => csv.trimEnd().split('\n')
const letzte = (z: string[]) => z[z.length - 1]

/**
 * Felder nach RFC 4180 lesen — Textfelder (Topics Covered) bringen
 * Zeilenumbrueche und Semikolons mit, ein `split('\n')` zaehlte dann
 * falsch.
 */
function zerlegen(csv: string): string[][] {
  const out: string[][] = []
  let zeile: string[] = []
  let feld = ''
  let zitat = false
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]
    if (zitat) {
      if (ch === '"' && csv[i + 1] === '"') (feld += '"'), i++
      else if (ch === '"') zitat = false
      else feld += ch
    } else if (ch === '"') zitat = true
    else if (ch === ';') zeile.push(feld), (feld = '')
    else if (ch === '\n') zeile.push(feld), out.push(zeile), (zeile = []), (feld = '')
    else feld += ch
  }
  return out
}

/** Datenzeilen unter der Spaltenzeile „Form;…" als Objekte nach Spaltenname. */
function tabelle(csv: string): { kopf: string[]; daten: Record<string, string>[]; breiten: number[] } {
  const alle = zerlegen(csv)
  const k = alle.findIndex((z) => z[0] === 'Form')
  const kopf = alle[k]
  const roh = alle.slice(k + 1)
  return {
    kopf,
    daten: roh.map((z) => Object.fromEntries(kopf.map((name, i) => [name, z[i]]))),
    breiten: roh.map((z) => z.length),
  }
}
const letzteZeile = (csv: string) => tabelle(csv).daten.at(-1)!

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
    const csv = buildGradingCsv('records', ctx([blatt()], { filter: [['Rows', '1 of 3'], ['Instructor', 'Mika Beispiel']] }))
    const z = zeilen(csv)
    expect(z[0]).toBe('Instructor Connect — Grading Export')
    expect(z[1]).toContain('T1700000000000')
    expect(z[1]).toContain('Alex Beispiel')
    // Der Ausschnitt steht in der Datei, nicht nur im Kopf des Bedieners.
    expect(csv).toContain('Rows;1 of 3')
    expect(csv).toContain('Instructor;Mika Beispiel')
  })
})

describe('Auszug „records"', () => {
  it('fuehrt Behoerde, Unterschriftszeitpunkt und Fingerabdruck je Zeile', () => {
    const csv = buildGradingCsv('records', ctx([blatt()]))
    // Bewusst geaendert (Audit 11/2026, GTY-04): „Event" neben dem Datum und
    // „HeaderFields" am Ende. Die uebrigen Pruefungen lesen nach Spaltennamen,
    // damit eine neue Spalte nicht jede Erwartung verschiebt.
    expect(tabelle(csv).kopf).toEqual([
      'Form', 'Instructor', 'Trainee', 'AircraftType', 'Device', 'Date', 'Event', 'Overall', 'Session', 'Status',
      'Authority', 'SignedAt', 'Fingerprint', 'FollowUpTo', 'Avg', 'HeaderFields',
    ])
    const daten = letzteZeile(csv)
    expect(daten.Form).toBe('308A')
    expect(daten.Trainee).toBe('Sophie Berger')
    expect(daten.Authority).toBe('AT')
    expect(daten.SignedAt).toBe('T1000000')
    expect(daten.Fingerprint).toBe('abc123')
    // Durchschnitt aus 3 und 2; NO zaehlt nicht mit. Dezimalkomma fuers
    // deutsche Excel (siehe csv.ts).
    expect(daten.Avg).toBe('2,50')
  })

  it('gibt je Pilot eine eigene Zeile mit eigenem Durchschnitt', () => {
    const zwei = blatt({
      trainees: [
        pilot({ traineeName: 'Sophie Berger', grades: [{ code: 'KNO', grade: 2, comment: '' }] }),
        pilot({ traineeName: 'Lukas Steiner', grades: [{ code: 'KNO', grade: 4, comment: '' }], overall: 'competent' }),
      ],
    })
    const daten = tabelle(buildGradingCsv('records', ctx([zwei]))).daten.filter((z) => z.Form === '308A')
    expect(daten).toHaveLength(2)
    expect(daten[0].Avg).toBe('2,00')
    expect(daten[1].Avg).toBe('4,00')
  })

  it('nimmt Folgeformulare ohne Bewertung mit und nennt ihr Ausgangsblatt', () => {
    // 306 belegt die Nachschulung — ohne diese Zeile fehlt der Beleg im
    // Auszug, obwohl er der Grund fuer das Blatt ist.
    const folge = blatt({ id: 'r2', formTypeId: '306', trainees: [], parentId: 'r1', contentHash: 'def456' })
    const csv = buildGradingCsv(
      'records',
      ctx([folge], { traineesOf: () => [pilot({ traineeName: 'Sophie Berger' })] }),
    )
    const daten = letzteZeile(csv)
    expect(daten.Form).toBe('306')
    expect(daten.Trainee).toBe('Sophie Berger')
    expect(daten.Overall).toBe('') // kein Ergebnis
    expect(daten.FollowUpTo).toBe('308A · 08.08.2026')
  })
})

/** Anwesenheitsliste, wie GradingForm sie speichert: keine `trainees`,
 *  leerer Namens-Vorgabewert, Personen nur in `attendance`. */
const anwesenheit = (u: Partial<GradingRecord> = {}): GradingRecord =>
  blatt({
    id: 'a1',
    formTypeId: '307A',
    header: { event: 'CRM Refresher', date: '2026-10-29', duration: '04:00', aircraftType: 'CL30', location: 'AAA Neusiedl', traineeName: '' },
    trainees: [],
    competencies: undefined,
    sessionStatus: null,
    attendance: [
      { name: 'Jürgen Müller', signature: 'data:image/png;base64,AAAA' },
      { name: 'Zoë Ångström', signature: 'data:image/png;base64,BBBB' },
    ],
    contentHash: 'a1',
    ...u,
  })

describe('Anwesenheitslisten 307A/307B (Audit 11/2026, GRD-02/EXP-01)', () => {
  // Mit dem ECHTEN traineesOf: Der Fehler entstand genau dort — es liefert
  // fuer Anwesenheitslisten [] und die Zeilen fielen weg.
  const echt = (records: GradingRecord[]) => ctx(records, { traineesOf })

  it('schreibt im Forms-Export je Teilnehmer eine Zeile', () => {
    const { daten } = tabelle(buildGradingCsv('records', echt([anwesenheit()])))
    expect(daten).toHaveLength(2)
    expect(daten.map((z) => z.Trainee)).toEqual(['Jürgen Müller', 'Zoë Ångström'])
    for (const z of daten) {
      expect(z.Form).toBe('307A')
      expect(z.Instructor).toBe('Mika Beispiel')
      expect(z.Status).toBe('signed')
      expect(z.Event).toBe('CRM Refresher')
      expect(z.Device).toBe('')
      expect(z.Fingerprint).toBe('a1')
      expect(z.HeaderFields).toBe('Duration=04:00 | Location=AAA Neusiedl')
    }
  })

  it('nimmt auch 307B mit', () => {
    const b = anwesenheit({ id: 'b1', formTypeId: '307B', attendance: [{ name: 'Lukas Steiner', signature: null }] })
    const { daten } = tabelle(buildGradingCsv('records', echt([b])))
    expect(daten.map((z) => [z.Form, z.Trainee])).toEqual([['307B', 'Lukas Steiner']])
  })

  it('laesst leere Teilnehmerzeilen weg — eine leere Zeile ist kein Teilnehmer', () => {
    const r = anwesenheit({ attendance: [{ name: 'Jürgen Müller', signature: null }, { name: '   ', signature: null }, { name: '', signature: null }] })
    const { daten } = tabelle(buildGradingCsv('records', echt([r])))
    expect(daten.map((z) => z.Trainee)).toEqual(['Jürgen Müller'])
  })

  it('schreibt im Competencies-Export je Teilnehmer eine Zeile „Attendance"', () => {
    const { daten } = tabelle(buildGradingCsv('competencies', echt([anwesenheit()])))
    expect(daten.map((z) => z.Trainee)).toEqual(['Jürgen Müller', 'Zoë Ångström'])
    for (const z of daten) {
      expect([z.Form, z.Competency, z.Title, z.Grade]).toEqual(['307A', '', 'Attendance', ''])
      // Bewusst geaendert (Nachtrag Formtypen, Punkt 1): Datum und Event
      // haben jetzt eigene Spalten und stehen nicht noch einmal im Kommentar.
      expect([z.Date, z.Event]).toEqual(['29.10.2026', 'CRM Refresher'])
      expect(z.Comment).toBe('Duration=04:00 | Aircraft Type=CL30 | Location=AAA Neusiedl')
      expect([z.SignedAt, z.Fingerprint]).toEqual(['T1000000', 'a1'])
    }
  })

  it('jeder Datensatz der Auswahl hat mindestens eine Datenzeile, und „Rows" stimmt', () => {
    // Die Zusage, die GRD-02 gebrochen hat: Der Dateikopf zaehlt Datensaetze.
    // Der Fingerabdruck steht in jeder Zeile und ist hier gleich der ID.
    const bestand = [
      blatt({ id: 'g1', contentHash: 'g1', trainees: [pilot(), pilot({ traineeName: 'Lukas Steiner' })] }),
      blatt({ id: 'f1', contentHash: 'f1', formTypeId: '306', trainees: [], parentId: 'g1', header: { date: '2026-08-09' } }),
      blatt({ id: 'd1', contentHash: 'd1', formTypeId: '310', trainees: [], header: { traineeName: 'Sophie Berger', date: '2026-08-09' } }),
      anwesenheit({ id: 'a1', contentHash: 'a1' }),
      anwesenheit({ id: 'b1', contentHash: 'b1', formTypeId: '307B' }),
      // Ohne jede Person: Teilnehmerliste nur aus Leerzeilen, Folgeformular
      // ohne Namen und ohne Ausgangsblatt — beide gehoeren trotzdem hinein.
      anwesenheit({ id: 'a2', contentHash: 'a2', attendance: [{ name: ' ', signature: null }] }),
      blatt({ id: 'f2', contentHash: 'f2', formTypeId: '306', trainees: [], parentId: undefined, header: { date: '2026-08-09' } }),
    ]
    const csv = buildGradingCsv('records', echt(bestand))
    expect(csv).toContain(`Rows;${bestand.length} of ${bestand.length}`)
    const { kopf, daten, breiten } = tabelle(csv)
    expect(new Set(daten.map((z) => z.Fingerprint))).toEqual(new Set(bestand.map((r) => r.id)))
    // 2 Piloten + 306 (erbt beide Piloten des Ausgangsblatts) + 310
    // + 2 Teilnehmer 307A + 2 Teilnehmer 307B + 2 Rueckfallzeilen
    expect(daten).toHaveLength(11)
    expect(breiten.every((n) => n === kopf.length)).toBe(true)
    // Die Rueckfallzeile nennt keine erfundene Person.
    expect(daten.filter((z) => z.Fingerprint === 'a2' || z.Fingerprint === 'f2').map((z) => z.Trainee)).toEqual(['', ''])
  })

  it('verliert die Freitexte eines Folgeformulars ohne Namen nicht', () => {
    const folge = blatt({ id: 'f2', formTypeId: '306', trainees: [], parentId: undefined, freeText: { 'Description of deficiency': 'Late flare' } })
    const z = letzteZeile(buildGradingCsv('competencies', echt([folge])))
    expect([z.Form, z.Trainee, z.Title, z.Comment]).toEqual(['306', '', 'Description of deficiency', 'Late flare'])
  })
})

describe('Event und typspezifische Kopffelder (Audit 11/2026, GTY-04)', () => {
  it('fuehrt die Event-Mehrfachauswahl des 308H und seine uebrigen Kopffelder', () => {
    const h = blatt({
      formTypeId: '308H',
      header: {
        aircraftType: 'C560 XLS+', date: '2026-11-01', trainingDevice: 'FFS', trainingKind: 'Recurrent Training',
        event: 'Adverse Weather, LOFT, UPRT', specialAirports: 'LOWI', instructorQual: 'TRI', instructorSeat: 'Right',
      },
    })
    const z = letzteZeile(buildGradingCsv('records', ctx([h])))
    expect(z.Event).toBe('Adverse Weather, LOFT, UPRT')
    // Qualifikation und Sitz stehen auf dem Dokument (GRD-06) — also auch hier.
    expect(z.HeaderFields).toBe('Training=Recurrent Training | Special Airport(s)=LOWI | Instructor qualification=TRI | Instructor seat=Right')
    // Was eine eigene Spalte hat, steht nicht doppelt.
    expect(z.HeaderFields).not.toContain('Event=')
    expect(z.HeaderFields).not.toContain('Date=')
  })

  it('nennt das Due Date des 310 im Datumsformat der App, ohne den Namen zu doppeln', () => {
    const d = blatt({ formTypeId: '310', trainees: [], header: { traineeName: 'Sophie Berger', aircraftType: 'CL30', date: '2026-11-01', dueDate: '2026-12-15' } })
    const z = letzteZeile(buildGradingCsv('records', ctx([d], { traineesOf })))
    expect(z.Trainee).toBe('Sophie Berger')
    expect(z.HeaderFields).toBe('Due Date=15.12.2026')
  })

  it('haelt die Spaltenzahl je Zeile gleich — auch mit Umbruechen und Semikolons im Wert', () => {
    const e = blatt({
      formTypeId: '308E',
      header: { aircraftType: 'CL30', date: '2026-11-01', event: 'Renewal', topicsCovered: 'Steep turns\nApproach to stall; recovery', airportsUsed: 'LOWW' },
    })
    const { kopf, daten, breiten } = tabelle(buildGradingCsv('records', ctx([e, blatt({ id: 'r2' })])))
    expect(breiten).toEqual([kopf.length, kopf.length])
    expect(daten[0].HeaderFields).toBe('Topics Covered=Steep turns\nApproach to stall; recovery | Airports Used=LOWW')
  })

  it('verliert die Kopfdaten nicht, wenn der Formulartyp aus dem Katalog geloescht wurde', () => {
    const x = blatt({ formTypeId: 'X9', header: { date: '2026-11-01', custom: 'abc' } })
    expect(letzteZeile(buildGradingCsv('records', ctx([x]))).HeaderFields).toBe('custom=abc')
  })
})

describe('Ein Datumsformat je Datei (Audit 11/2026, EXP-04)', () => {
  it('Date und SignedAt stehen beide als DD.MM.YYYY', () => {
    // Vorher: „2026-08-08" neben „08.08.2026 …" in derselben Zeile.
    const z = letzteZeile(buildGradingCsv('records', ctx([blatt({ signedAt: new Date(2026, 7, 8, 14, 5).getTime() })], { formatDateTime })))
    expect(z.Date).toBe('08.08.2026')
    expect(z.SignedAt).toBe('08.08.2026 14:05')
  })

  it('laesst ein fehlendes Datum leer, statt „undefined" zu schreiben', () => {
    const z = letzteZeile(buildGradingCsv('records', ctx([blatt({ header: { aircraftType: 'CL30' } })])))
    expect(z.Date).toBe('')
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
    const daten = letzteZeile(buildGradingCsv('records', ctx([alt()])))
    expect(daten.Device).toBe('') // kein Training Device
    expect(daten.Event).toBe('') // kein Event
    expect(daten.Authority).toBe('AT') // Vorgabe, kein leeres Feld
    expect(daten.SignedAt).toBe('') // nie unterschrieben
    expect(daten.Fingerprint).toBe('') // kein Fingerabdruck
    expect(daten.FollowUpTo).toBe('') // kein Ausgangsblatt
    expect(daten.Avg).toBe('') // keine gesetzte Note
  })

  it('faellt beim Kompetenz-Wortlaut auf leer zurueck und laesst leere Abschnitte weg', () => {
    const csv = buildGradingCsv('competencies', ctx([alt()]))
    const z = letzteZeile(csv)
    expect([z.Form, z.Trainee, z.Competency, z.Title, z.Grade, z.Comment]).toEqual(['308A', 'Sophie Berger', 'KNO', '', 'NO', ''])
    // Nie unterschrieben, kein Fingerabdruck: leer statt „undefined".
    expect([z.Date, z.Event, z.SignedAt, z.Fingerprint]).toEqual(['02.03.2025', '', '', ''])
    expect(csv).not.toContain('Positive aspects')
    expect(csv).not.toContain('Overall result')
  })

  it('nennt ein Folgeformular ohne Ausgangsblatt ohne Verweis', () => {
    const folge = blatt({ id: 'r3', formTypeId: '306', trainees: [], parentId: undefined, header: { aircraftType: 'CL30', date: '2025-03-02' } })
    const daten = letzteZeile(buildGradingCsv('records', ctx([folge], { traineesOf: () => [pilot()] })))
    expect(daten.Device).toBe('')
    expect(daten.FollowUpTo).toBe('')
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
  /** Spalten, die den Inhalt einer Kompetenzzeile tragen. */
  const inhalt = (z: Record<string, string>) => [z.Form, z.Trainee, z.Competency, z.Title, z.Grade, z.Comment]

  it('schreibt Note, Wortlaut und Kommentar je Kompetenz', () => {
    const { daten } = tabelle(buildGradingCsv('competencies', ctx([blatt()])))
    expect(daten.map(inhalt)).toContainEqual(['308A', 'Sophie Berger', 'KNO', 'Application of knowledge', '3', ''])
    expect(daten.map(inhalt)).toContainEqual(['308A', 'Sophie Berger', 'PRO', '', '2', 'Checklists late.'])
  })

  it('nimmt die Freitexte und das Gesamtergebnis mit', () => {
    // Genau der Teil, den ein Pruefer liest — er fehlte in jedem Export.
    const csv = buildGradingCsv('competencies', ctx([blatt()]))
    const { daten } = tabelle(csv)
    expect(daten.map(inhalt)).toContainEqual(['308A', 'Sophie Berger', '', 'Positive aspects', '', 'Well prepared.'])
    expect(daten.map(inhalt)).toContainEqual(['308A', 'Sophie Berger', '', 'Overall result', '', 'not_competent'])
    // Leere Abschnitte erzeugen keine Leerzeilen
    expect(csv).not.toContain('Areas for development')
  })

  it('gibt die Freitexte eines Folgeformulars je Pilot aus', () => {
    const folge = blatt({ id: 'r2', formTypeId: '310', trainees: [], freeText: { 'Deferred item': 'Engine-out repeat' } })
    const z = letzteZeile(buildGradingCsv('competencies', ctx([folge], { traineesOf: () => [pilot({ traineeName: 'Lukas Steiner' })] })))
    expect(inhalt(z)).toEqual(['310', 'Lukas Steiner', '', 'Deferred item', '', 'Engine-out repeat'])
  })
})

describe('Competencies-Zeilen sind ihrem Dokument zuzuordnen (Nachtrag Formtypen, Punkt 1)', () => {
  // Vier 308A desselben Piloten (FFS 1–4): Vorher 36 Zeilen nur mit Form und
  // Person — welche Note aus welcher Session stammte, sagte die Datei nicht.
  const sessions = [1, 2, 3, 4].map((n) =>
    blatt({
      id: `s${n}`,
      contentHash: `hash-${n}`,
      signedAt: new Date(2026, 7, n, 16, 30).getTime(),
      header: { aircraftType: 'C560 XLS+', trainingDevice: 'FFS', date: `2026-08-0${n}`, event: `FFS ${n}` },
    }),
  )

  it('fuehrt Datum, Event, Unterschriftszeitpunkt und Fingerabdruck in jeder Zeile', () => {
    const csv = buildGradingCsv('competencies', ctx(sessions, { formatDateTime }))
    const { kopf, daten, breiten } = tabelle(csv)
    // Bewusst geaendert: Datum und Event neben der Person, die Belegspalten
    // am Ende — wie im Forms-Export.
    expect(kopf).toEqual(['Form', 'Trainee', 'Date', 'Event', 'Competency', 'Title', 'Grade', 'Comment', 'SignedAt', 'Fingerprint'])
    expect(breiten.every((n) => n === kopf.length)).toBe(true)
    // 3 Noten + Positive aspects + Overall result je Session
    expect(daten).toHaveLength(4 * 5)
    for (const [i, r] of sessions.entries()) {
      const eigene = daten.filter((z) => z.Fingerprint === r.contentHash)
      expect(eigene).toHaveLength(5)
      for (const z of eigene) {
        expect(z.Date).toBe(`0${i + 1}.08.2026`)
        expect(z.Event).toBe(`FFS ${i + 1}`)
        expect(z.SignedAt).toBe(`0${i + 1}.08.2026 16:30`)
      }
    }
  })

  it('nennt dasselbe Dokument mit denselben Werten wie der Forms-Export', () => {
    // Ueber den Fingerabdruck werden beide Dateien verbunden — dann muessen
    // Datum und Unterschriftszeitpunkt auch gleich geschrieben sein.
    const c = ctx(sessions, { formatDateTime })
    const forms = tabelle(buildGradingCsv('records', c)).daten
    const kompetenzen = tabelle(buildGradingCsv('competencies', c)).daten
    for (const k of kompetenzen) {
      const f = forms.find((z) => z.Fingerprint === k.Fingerprint)!
      expect([k.Date, k.Event, k.SignedAt]).toEqual([f.Date, f.Event, f.SignedAt])
    }
  })
})

describe('Auszug „people"', () => {
  it('listet die Kalibrierung je Kompetenzsatz', () => {
    const csv = buildGradingCsv(
      'people',
      ctx([], { kalibrierung: [{ satz: 'Pilot', personId: 'u-mika', sessions: 7, avg: 3.4, abweichung: -0.63, einstufung: 'Discuss' }] }),
    )
    expect(csv).toContain('CompetencySet;Person;Role;Sessions;AvgGrade;DeviationFromSetAvg;Assessment')
    expect(csv).toContain('Pilot;Mika Beispiel;Instructor;7;3,40;-0,63;Discuss')
  })

  it('bleibt ohne Kalibrierungsdaten bei der Kopfzeile', () => {
    const csv = buildGradingCsv('people', ctx([]))
    expect(letzte(zeilen(csv))).toBe('CompetencySet;Person;Role;Sessions;AvgGrade;DeviationFromSetAvg;Assessment')
  })

  /*
   * Audit 11/2026, EXP-02: Die Abweichung wurde fuer die Datei als
   * (avg ?? 0) - (overall ?? 0) nachgerechnet. Ein Instruktor, der im
   * Zeitraum nur „NO" vergeben hatte, stand damit als −Gesamtmittel im
   * Auszug („Sam Beispiel;Instructor;1;;-3,10"), waehrend Kachel und
   * Standardisierungsbericht fuer ihn keine Abweichung zeigten.
   */
  it('Instruktor nur mit „NO": Abweichung leer, nicht −Gesamtmittel — dieselbe Zahl wie im Bericht', () => {
    const mitNoten = blatt({ id: 'a', instructorId: 'u-mika' })
    const nurNO = blatt({
      id: 'b',
      instructorId: 'u-sam',
      trainees: [pilot({ grades: [{ code: 'KNO', grade: 'NO', comment: '' }] })],
    })
    const saetze = statsBySet([mitNoten, nurNO], () => 'pilot')
    const zeilenK = kalibrierungsZeilen(saetze, () => 'Pilot competencies', (f) => `flag:${f}`)
    const sam = zeilenK.find((z) => z.personId === 'u-sam')!
    expect(sam.avg).toBeNull()
    expect(sam.abweichung).toBeNull()
    expect(sam.einstufung).toBe('flag:insufficient')
    // Die vorhandene Abweichung ist DIESELBE Zahl wie in statsBySet (Bericht, Kachel).
    const mika = zeilenK.find((z) => z.personId === 'u-mika')!
    expect(mika.abweichung).toBe(saetze[0].rows.find((r) => r.id === 'u-mika')!.delta)
    expect(mika.satz).toBe('Pilot competencies')

    const csv = buildGradingCsv('people', ctx([], { userName: (id) => (id === 'u-sam' ? 'Sam Beispiel' : 'Mika Beispiel'), kalibrierung: zeilenK }))
    expect(csv).toContain('Pilot competencies;Sam Beispiel;Instructor;1;;;flag:insufficient')
    expect(csv).not.toMatch(/Sam Beispiel;Instructor;1;;-/)
  })
})

describe('Dateiname', () => {
  it('traegt Bereich, Tag und Uhrzeit', () => {
    // Ortszeit: der Name soll zu dem passen, was die Person auf der Uhr sah.
    const d = new Date(2026, 7, 13, 5, 9)
    expect(gradingCsvName('records', d.getTime())).toBe('grading-records_2026-08-13_05-09.csv')
  })
})

/**
 * Audit 11/2026, EXP-03 (mit GRD-07): Die drei Auszuege der Statistik
 * nannten weder Zeitraum noch Basis, und nur People folgte dem Zeitraum.
 */
describe('Statistik-Auszuege nennen ihren Ausschnitt', () => {
  const doc = { approvalNumber: 'AT.ATO.106', approvalNumberUK: 'GBR.ATO.0541' }
  const a = { fleet: '', authority: '' as const, period: '12m' as const, doc }

  it('nennt Flotte, Behoerde, Zeitraum und Basis — je Auszug die richtige', () => {
    const forms = Object.fromEntries(statistikKopf('records', a))
    expect(forms).toEqual({
      Fleet: 'All fleets',
      Authority: 'All authorities',
      Period: 'Last 12 months (by training date)',
      Basis: 'All forms (raw data), including unsigned and follow-up forms',
    })
    expect(Object.fromEntries(statistikKopf('competencies', a)).Basis).toBe(forms.Basis)
    const people = Object.fromEntries(statistikKopf('people', { ...a, fleet: 'CL30', authority: 'UK', period: 'all' }))
    expect(people).toEqual({
      Fleet: 'CL30',
      Authority: 'GBR.ATO.0541',
      Period: 'All records (by training date)',
      Basis: 'Signed forms only, follow-up forms excluded',
    })
  })

  it('steht im Dateikopf der Exportdatei', () => {
    const csv = buildGradingCsv('records', ctx([blatt()], { filter: statistikKopf('records', a) }))
    expect(csv).toContain('Period;Last 12 months (by training date)')
    expect(csv).toContain('Basis;All forms (raw data), including unsigned and follow-up forms')
  })

  it('Rohdaten folgen Flotte, Behoerde und Zeitraum (Schulungstag), nicht der Unterschrift', () => {
    const now = new Date(2026, 7, 20).getTime()
    const offen = blatt({ id: 'offen', status: 'awaiting_signature' })
    const alt = blatt({ id: 'alt', header: { aircraftType: 'C560 XLS+', date: '2024-02-01' }, createdAt: now })
    const uk = blatt({ id: 'uk', authority: 'UK' })
    const cl = blatt({ id: 'cl', header: { aircraftType: 'CL30', date: '2026-08-08' } })
    const alle = [blatt(), offen, alt, uk, cl]
    const ids = (x: GradingRecord[]) => x.map((r) => r.id)
    expect(ids(statistikRohdaten(alle, { ...a, now }))).toEqual(['r1', 'offen', 'uk', 'cl'])
    expect(ids(statistikRohdaten(alle, { ...a, period: 'all', now }))).toEqual(['r1', 'offen', 'alt', 'uk', 'cl'])
    expect(ids(statistikRohdaten(alle, { ...a, authority: 'AT', now }))).toEqual(['r1', 'offen', 'cl'])
    expect(ids(statistikRohdaten(alle, { ...a, fleet: 'CL30', now }))).toEqual(['cl'])
  })
})
