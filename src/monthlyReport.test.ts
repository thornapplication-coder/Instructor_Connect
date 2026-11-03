import { describe, expect, it } from 'vitest'
import { formatDateTime } from './datum'
import forms from './i18n/forms.json'
import {
  monatsBeschriftung,
  monatsKennung,
  monthlyCsv,
  monthlyCsvName,
  monthOf,
  monthRange,
  monthlyReport,
  monthsWithData,
  sameMonth,
  type MonatsCsvKontext,
  type MonatsSchluessel,
} from './monthlyReport'
import type { CompetencyGrade, Grade, GradingRecord, OverallResult, TraineeGrading } from './types'

/**
 * Der Bericht sagt einem Instruktor, wo er steht. Er darf deshalb weder
 * fremde Blaetter einrechnen noch eine Aussage vortaeuschen, die die
 * Datenbasis nicht hergibt.
 */

const g = (code: string, grade: Grade | null): CompetencyGrade => ({ code, grade, comment: '' })

const trainee = (grades: CompetencyGrade[], overall: OverallResult | null = 'competent'): TraineeGrading => ({
  traineeId: '', traineeName: 'Sophie Berger', position: 'CDR',
  grades, positiveComment: '', developmentComment: '', summaryComment: '', overall,
})

const rec = (over: Partial<GradingRecord> & { id: string; date: string }): GradingRecord => ({
  formTypeId: '308A',
  instructorId: 'u1',
  header: { date: over.date, aircraftType: 'C560 XLS+' },
  trainees: [trainee([g('KNO', 3)])],
  sessionStatus: 'completed',
  freeText: {},
  competencies: [{ code: 'KNO', title: 'Application of knowledge' }],
  signatureInstructor: 'sig', signatureTrainee: 'sig',
  status: 'signed', mailStatus: 'sent',
  createdAt: Date.UTC(2026, 6, 1), signedAt: Date.UTC(2026, 6, 1),
  ...over,
})

const AUG = { year: 2026, month: 7 }

describe('Monatsrechnung', () => {
  it('spannt den Monat von der ersten bis zur letzten Millisekunde', () => {
    const { from, to } = monthRange(AUG)
    expect(new Date(from).getMonth()).toBe(7)
    expect(new Date(from).getDate()).toBe(1)
    expect(new Date(to).getMonth()).toBe(8)
  })

  it('erkennt den Monat eines Zeitpunkts und vergleicht Monate', () => {
    expect(monthOf(new Date(2026, 7, 15).getTime())).toEqual(AUG)
    expect(sameMonth(AUG, { year: 2026, month: 7 })).toBe(true)
    expect(sameMonth(AUG, { year: 2025, month: 7 })).toBe(false)
  })
})

describe('monthsWithData', () => {
  it('liefert Monate mit auswertbaren Blaettern, neueste zuerst', () => {
    const rs = [rec({ id: 'a', date: '2026-06-10' }), rec({ id: 'b', date: '2026-08-03' })]
    expect(monthsWithData(rs)).toEqual([{ year: 2026, month: 7 }, { year: 2026, month: 5 }])
  })

  it('kann auf einen Instruktor eingegrenzt werden', () => {
    const rs = [rec({ id: 'a', date: '2026-06-10' }), rec({ id: 'b', date: '2026-08-03', instructorId: 'u2' })]
    expect(monthsWithData(rs, 'u1')).toEqual([{ year: 2026, month: 5 }])
  })

  it('zaehlt offene Blaetter und Folgeformulare nicht als Monat', () => {
    const offen = rec({ id: 'a', date: '2026-08-03', status: 'awaiting_signature' })
    const folge = rec({ id: 'b', date: '2026-08-04', parentId: 'a' })
    expect(monthsWithData([offen, folge])).toEqual([])
  })
})

describe('monthlyReport — Abgrenzung', () => {
  it('rechnet nur den gewaehlten Monat, ueber den Schulungstag', () => {
    const drin = rec({ id: 'a', date: '2026-08-03' })
    // Im Juli geschult, im August nachgetragen — gehoert in den Juli.
    const drauss = rec({ id: 'b', date: '2026-07-30', createdAt: new Date(2026, 7, 5).getTime() })
    const r = monthlyReport([drin, drauss], 'u1', AUG)
    expect(r.own.sessions).toBe(1)
  })

  it('trennt eigene Blaetter von denen der Kollegen', () => {
    const eigen = rec({ id: 'a', date: '2026-08-03' })
    const fremd = rec({ id: 'b', date: '2026-08-04', instructorId: 'u2' })
    const r = monthlyReport([eigen, fremd], 'u1', AUG)
    expect(r.own.sessions).toBe(1)
    // ... rechnet sie aber in die Vergleichswerte ein
    expect(r.fleet.sessions).toBe(2)
    expect(r.all.sessions).toBe(2)
  })

  it('nennt die Muster, auf denen im Monat geschult wurde', () => {
    const a = rec({ id: 'a', date: '2026-08-03' })
    const b = rec({ id: 'b', date: '2026-08-04', header: { date: '2026-08-04', aircraftType: 'CL30' } })
    expect(monthlyReport([a, b], 'u1', AUG).fleets).toEqual(['C560 XLS+', 'CL30'])
  })

  it('grenzt den Flottenvergleich auf die eigenen Muster ein, das Gesamtbild nicht', () => {
    const eigen = rec({ id: 'a', date: '2026-08-03' })
    const andereFlotte = rec({ id: 'b', date: '2026-08-04', instructorId: 'u2', header: { date: '2026-08-04', aircraftType: 'ATR 42/72' } })
    const r = monthlyReport([eigen, andereFlotte], 'u1', AUG)
    expect(r.fleet.sessions).toBe(1) // nur C560
    expect(r.all.sessions).toBe(2) // beide Muster
  })

  it('zaehlt den Durchgang, nicht das einzelne Blatt', () => {
    const a = rec({ id: 'a', date: '2026-08-03', batchId: 'b1' })
    const b = rec({ id: 'b', date: '2026-08-03', batchId: 'b1' })
    expect(monthlyReport([a, b], 'u1', AUG).own.sessions).toBe(1)
  })
})

describe('monthlyReport — Kennzahlen', () => {
  const withGrades = (id: string, grades: (Grade | null)[], instructorId = 'u1', overall: OverallResult = 'competent') =>
    rec({ id, date: '2026-08-03', instructorId, batchId: id, trainees: [trainee(grades.map((v, i) => g(`C${i}`, v)), overall)] })

  it('laesst „NO" aus dem Schnitt heraus und zaehlt es in der Verteilung', () => {
    const r = monthlyReport([withGrades('a', [4, 'NO', 2])], 'u1', AUG)
    expect(r.own.mean).toBe(3)
    expect(r.own.dist.NO).toBe(1)
    expect(r.own.gradesN).toBe(2)
  })

  it('rechnet Anteile und die Not-Competent-Quote', () => {
    const r = monthlyReport([withGrades('a', [1, 2, 4, 5], 'u1', 'not_competent')], 'u1', AUG)
    expect(r.own.lowShare).toBe(50)
    expect(r.own.highShare).toBe(50)
    expect(r.own.ncRate).toBe(100)
  })

  it('stellt die Abweichung zu Flotte und Gesamt gegenueber', () => {
    // Eigener Schnitt 4, Kollege im selben Muster 2 -> Flottenschnitt 3.
    const eigen = withGrades('a', [4, 4, 4, 4])
    const kollege = withGrades('b', [2, 2, 2, 2], 'u2')
    const r = monthlyReport([eigen, kollege], 'u1', AUG)
    expect(r.own.mean).toBe(4)
    expect(r.fleet.mean).toBe(3)
    expect(r.deltaFleet).toBe(1)
    expect(r.deltaAll).toBe(1)
  })

  it('erkennt, wenn die Vergleichsgruppe nur aus eigenen Formularen besteht', () => {
    // Sonst zeigt der Bericht eine 0,00 und taeuscht damit eine Aussage vor,
    // die die Datenlage nicht hergibt.
    const allein = monthlyReport([withGrades('a', [3, 3])], 'u1', AUG)
    expect(allein.fleetHasOthers).toBe(false)
    expect(allein.allHasOthers).toBe(false)
    expect(allein.deltaFleet).toBe(0)

    const mitKollege = monthlyReport([withGrades('a', [3, 3]), withGrades('b', [4, 4], 'u2')], 'u1', AUG)
    expect(mitKollege.fleetHasOthers).toBe(true)
    expect(mitKollege.allHasOthers).toBe(true)
  })

  it('meldet „insufficient", solange die Datenbasis zu duenn ist', () => {
    const r = monthlyReport([withGrades('a', [3, 3])], 'u1', AUG)
    expect(r.flagFleet).toBe('insufficient')
    expect(r.flagAll).toBe('insufficient')
  })

  it('meldet bei ausreichender Basis und klarer Abweichung „review"', () => {
    // 3 Durchgaenge, je 4 Noten = 12 Werte; eigener Schnitt 5 gegen Kollegen 1.
    const eigen = [1, 2, 3].map((i) => withGrades(`e${i}`, [5, 5, 5, 5]))
    const kollegen = [1, 2, 3].map((i) => withGrades(`k${i}`, [1, 1, 1, 1], 'u2'))
    const r = monthlyReport([...eigen, ...kollegen], 'u1', AUG)
    expect(r.own.gradesN).toBe(12)
    expect(r.own.sessions).toBe(3)
    expect(r.flagFleet).toBe('review')
  })
})

describe('monthlyReport — Kompetenzzeilen', () => {
  it('stellt je Kompetenz eigenen Wert, Flotte und Gesamt gegenueber', () => {
    const eigen = rec({ id: 'a', date: '2026-08-03', trainees: [trainee([g('KNO', 4)])] })
    const kollege = rec({ id: 'b', date: '2026-08-04', instructorId: 'u2', trainees: [trainee([g('KNO', 2)])] })
    const line = monthlyReport([eigen, kollege], 'u1', AUG).competencies.find((c) => c.code === 'KNO')!
    expect(line.title).toBe('Application of knowledge')
    expect(line.own).toBe(4)
    expect(line.fleet).toBe(3)
    expect(line.deltaFleet).toBe(1)
    expect(line.ownN).toBe(1)
  })

  it('fuehrt nur Kompetenzen, die man selbst bewertet hat', () => {
    const eigen = rec({ id: 'a', date: '2026-08-03', trainees: [trainee([g('KNO', 3)])] })
    const kollege = rec({ id: 'b', date: '2026-08-04', instructorId: 'u2', trainees: [trainee([g('WLM', 3)])] })
    const codes = monthlyReport([eigen, kollege], 'u1', AUG).competencies.map((c) => c.code)
    expect(codes).toEqual(['KNO'])
  })

  it('liefert leere Kennzahlen statt zu stolpern, wenn im Monat nichts vorliegt', () => {
    const r = monthlyReport([], 'u1', AUG)
    expect(r.own.sessions).toBe(0)
    expect(r.own.mean).toBeNull()
    expect(r.competencies).toEqual([])
    expect(r.deltaFleet).toBeNull()
    expect(r.flagFleet).toBe('insufficient')
  })
})

/**
 * Piloten- und Instruktorenbewertungen folgen unterschiedlichen Maßstäben
 * und dürfen nie gegeneinander gerechnet werden — dieselbe Zusage, die
 * `statsBySet` im Standardisierungsbericht einhält. Der Monatsbericht tat
 * es zunächst nicht: Ein TRI mit vielen 308G stand gegen Piloten-
 * Durchschnitte und bekam eine Abweichung ausgewiesen, die nur aus der
 * Vermischung stammte.
 */
describe('Kompetenzsätze werden nicht vermischt', () => {
  const setOf = (r: GradingRecord) => (r.formTypeId === '308G' ? ('instructor' as const) : ('pilot' as const))

  it('vergleicht nur innerhalb des Satzes, in dem man selbst gewertet hat', () => {
    const eigen = rec({ id: 'a', date: '2026-08-05', trainees: [trainee([g('KNO', 3)])] })
    // Ein fremdes Instruktoren-Blatt mit deutlich anderem Niveau ...
    const fremdInstr = rec({ id: 'b', date: '2026-08-06', instructorId: 'u2', formTypeId: '308G', trainees: [trainee([g('KNO', 5)])] })
    const fremdPilot = rec({ id: 'c', date: '2026-08-07', instructorId: 'u2', trainees: [trainee([g('KNO', 3)])] })
    const r = monthlyReport([eigen, fremdInstr, fremdPilot], 'u1', AUG, setOf)
    expect(r.competencySet).toBe('pilot')
    // ... zieht den Vergleichswert NICHT: 3 gegen 3 ist kein Unterschied.
    expect(r.all.mean).toBe(3)
    expect(r.deltaAll).toBe(0)
  })

  it('nimmt den Satz, in dem der Instruktor die meisten Noten vergeben hat', () => {
    const instr1 = rec({ id: 'a', date: '2026-08-05', formTypeId: '308G', trainees: [trainee([g('KNO', 4), g('COM', 4)])] })
    const pilot1 = rec({ id: 'b', date: '2026-08-06', trainees: [trainee([g('KNO', 2)])] })
    const r = monthlyReport([instr1, pilot1], 'u1', AUG, setOf)
    expect(r.competencySet).toBe('instructor')
    expect(r.own.mean).toBe(4)
  })

  it('zaehlt Folgeformulare nicht als eigene Session', () => {
    const blatt = rec({ id: 'a', date: '2026-08-05' })
    const folge = rec({ id: 'b', date: '2026-08-06', formTypeId: '306', parentId: 'a', trainees: [] })
    expect(monthlyReport([blatt, folge], 'u1', AUG, setOf).own.sessions).toBe(1)
  })

  it('faellt ohne Angabe auf den Pilotensatz zurueck', () => {
    const r = monthlyReport([rec({ id: 'a', date: '2026-08-05' })], 'u1', AUG)
    expect(r.competencySet).toBe('pilot')
    expect(r.own.sessions).toBe(1)
  })
})

/**
 * Audit 11/2026, GRD-12 und GTY-02 (Teil Monatsbericht): Die Kachel sagte
 * „Only your own sheets in this group — no comparison possible", die
 * Kompetenztabelle darunter neunmal „0.00 vs your types". Und ein eigenes
 * Blatt ohne Muster (308C/308D) fiel aus der Vergleichsgruppe — der Bericht
 * wies bei lauter eigenen Blaettern „+0.25 vs your types" aus.
 */
describe('Vergleich nur, wo jemand anderes verglichen werden kann', () => {
  const blatt = (id: string, note: Grade, over: Partial<GradingRecord> = {}) =>
    rec({ id, date: '2026-08-05', batchId: id, trainees: [trainee([g('KNO', note), g('PRO', note)])], ...over })

  it('nur eigene Blaetter in der Flotte: deltaFleet je Zeile null, deltaAll eine Zahl bei fremder Flotte', () => {
    const eigen = blatt('a', 4)
    const fremdeFlotte = blatt('b', 2, { instructorId: 'u2', header: { date: '2026-08-05', aircraftType: 'CL30' } })
    const r = monthlyReport([eigen, fremdeFlotte], 'u1', AUG)
    expect(r.fleetHasOthers).toBe(false)
    expect(r.competencies.map((c) => c.deltaFleet)).toEqual([null, null])
    expect(r.competencies.map((c) => c.deltaAll)).toEqual([1, 1])
  })

  it('ein eigenes Blatt ohne Muster gehoert zur eigenen Vergleichsgruppe', () => {
    const mitMuster = blatt('a', 4)
    const ohneMuster = blatt('b', 2, { formTypeId: '308C', header: { date: '2026-08-06' } })
    const r = monthlyReport([mitMuster, ohneMuster], 'u1', AUG)
    expect(r.fleet.sessions).toBe(r.own.sessions)
    expect(r.fleet.mean).toBe(r.own.mean)
    expect(r.deltaFleet).toBe(0)
    expect(r.competencies.every((c) => c.deltaFleet === null && c.deltaAll === null)).toBe(true)
  })

  it('ohne jedes Muster vergleicht die Flottengruppe mit den eigenen Blaettern, nicht mit nichts', () => {
    const r = monthlyReport([blatt('a', 3, { header: { date: '2026-08-05' } })], 'u1', AUG)
    expect(r.fleets).toEqual([])
    expect(r.fleet.sessions).toBe(1)
  })

  it('je Kompetenz: ein Kollege, der sie nicht (oder nur mit „NO") bewertet hat, liefert keinen Vergleich', () => {
    const eigen = blatt('a', 4)
    const kollege = rec({
      id: 'k', date: '2026-08-06', instructorId: 'u2', batchId: 'k',
      trainees: [trainee([g('KNO', 2), g('PRO', 'NO')])],
    })
    const r = monthlyReport([eigen, kollege], 'u1', AUG)
    expect(r.fleetHasOthers).toBe(true)
    const zeile = (code: string) => r.competencies.find((c) => c.code === code)!
    expect(zeile('KNO').deltaFleet).toBe(1)
    expect(zeile('PRO').deltaFleet).toBeNull()
    expect(zeile('PRO').deltaAll).toBeNull()
  })
})

/**
 * Audit 11/2026, GRD-21/GTY-08: Der Bericht zeigt einen Kompetenzsatz und
 * liess die eigenen Blaetter des anderen ohne Hinweis weg.
 */
describe('Der Bericht nennt, was er weglaesst', () => {
  const setOf = (r: GradingRecord) => (r.formTypeId === '308G' ? ('instructor' as const) : ('pilot' as const))

  it('2 Pilotenblaetter und 1 Instruktorblatt: Satz „pilot", ein Durchgang ausgelassen', () => {
    const p1 = rec({ id: 'p1', date: '2026-08-04', batchId: 'p1', trainees: [trainee([g('KNO', 3), g('PRO', 3)])] })
    const p2 = rec({ id: 'p2', date: '2026-08-05', batchId: 'p2', trainees: [trainee([g('KNO', 3), g('PRO', 3)])] })
    const instr = rec({ id: 'i1', date: '2026-08-06', formTypeId: '308G', trainees: [trainee([g('PRE', 4), g('CLI', 'NO'), g('PRK', 5)])] })
    // Ein fremdes 308G zaehlt nicht als eigene ausgelassene Arbeit.
    const fremd = rec({ id: 'i2', date: '2026-08-06', instructorId: 'u2', formTypeId: '308G' })
    const r = monthlyReport([p1, p2, instr, fremd], 'u1', AUG, setOf)
    expect(r.competencySet).toBe('pilot')
    expect(r.own.sessions).toBe(2)
    expect(r.ausgelassen).toEqual({ set: 'instructor', sessions: 1, grades: 2 })
  })

  it('meldet umgekehrt die Pilotenblaetter, wenn der Instruktorensatz ueberwiegt', () => {
    const instr = rec({ id: 'i1', date: '2026-08-06', formTypeId: '308G', trainees: [trainee([g('PRE', 4), g('CLI', 4)])] })
    const pilot = rec({ id: 'p1', date: '2026-08-04' })
    const r = monthlyReport([instr, pilot], 'u1', AUG, setOf)
    expect(r.competencySet).toBe('instructor')
    expect(r.ausgelassen).toEqual({ set: 'pilot', sessions: 1, grades: 1 })
  })

  it('ohne Blaetter des anderen Satzes ist nichts ausgelassen', () => {
    expect(monthlyReport([rec({ id: 'a', date: '2026-08-05' })], 'u1', AUG, setOf).ausgelassen).toEqual({
      set: 'instructor',
      sessions: 0,
      grades: 0,
    })
  })
})

/**
 * Audit 11/2026, RPT-01: Die Monats-CSV trug nur Zahlen — keine ATO, kein
 * „Generated/By", keine Abweichung samt Einstufung, Prozentspalten ohne
 * Einheit, und „You" auch, wenn jemand anderes exportierte.
 */
describe('monthlyCsv — die Datei trägt die Aussage', () => {
  /** Die echten Wörter aus forms.json — die Datei soll sagen, was der
   *  Bildschirm sagt, und ein fehlender Schlüssel fiele hier auf. */
  const beschriftung = (k: MonatsSchluessel, werte?: { name: string }): string => {
    const wert = k
      .replace(/^forms:/, '')
      .split('.')
      .reduce<unknown>((o, teil) => (o as Record<string, unknown>)[teil], forms)
    if (typeof wert !== 'string') throw new Error(`fehlt: ${k}`)
    // Platzhalter wie i18next — ein Text mit „{{name}}" ohne Wert fiele auf.
    return wert.replace(/\{\{name\}\}/g, () => {
      if (!werte) throw new Error(`Platzhalter ohne Wert: ${k}`)
      return werte.name
    })
  }
  const JETZT = new Date(2026, 8, 2, 14, 5).getTime()
  const ctx = (u: Partial<MonatsCsvKontext> = {}): MonatsCsvKontext => ({
    atoName: 'Aviation Academy Austria',
    zulassung: 'AT.ATO.106',
    instruktor: 'Mika Beispiel',
    satzName: (k) => (k === 'pilot' ? 'Pilot competencies' : 'Instructor competencies'),
    exportiertAm: JETZT,
    exportiertVon: 'Mika Beispiel',
    fremd: false,
    beschriftung,
    ...u,
  })
  const setOf = (r: GradingRecord) => (r.formTypeId === '308G' ? ('instructor' as const) : ('pilot' as const))
  const blatt = (id: string, note: Grade, over: Partial<GradingRecord> = {}) =>
    rec({ id, date: '2026-08-05', batchId: id, trainees: [trainee([g('KNO', note), g('PRO', note)])], ...over })
  const zeilen = (csv: string) => csv.trimEnd().split('\n')

  const bericht = () =>
    monthlyReport(
      [
        blatt('a', 4),
        blatt('b', 2, { instructorId: 'u2' }),
        rec({ id: 'i1', date: '2026-08-06', formTypeId: '308G', trainees: [trainee([g('PRE', 4)])] }),
      ],
      'u1',
      AUG,
      setOf,
    )

  it('Kopf: Bericht, ATO und Zulassung, Monat, Instruktor, Satz, Ausgelassenes, Stempel', () => {
    const z = zeilen(monthlyCsv(bericht(), ctx()))
    expect(z.slice(0, 7)).toEqual([
      'Instructor Connect — Monthly report',
      'Aviation Academy Austria;AT.ATO.106',
      'Month;August 2026',
      'Instructor;Mika Beispiel',
      'Competency set;Pilot competencies',
      'Not included;Instructor competencies;Sessions;1;Grades given;1',
      `Generated;${formatDateTime(JETZT)};Generated by;Mika Beispiel`,
    ])
  })

  it('nennt die Abweichung samt Einstufung — die Aussage, nicht nur die Zahlen', () => {
    const csv = monthlyCsv(bericht(), ctx())
    expect(csv).toContain('Comparison;Deviation;Assessment')
    // eigenes Mittel 4, Gruppe 3 → +1,00 bei zu wenig Daten: „insufficient"
    expect(csv).toContain('vs your types;1,00;Too little data for a statement')
    expect(csv).toContain('vs all;1,00;Too little data for a statement')
    expect(csv).toContain('A positive value means you grade more leniently')
  })

  it('ohne fremde Blätter in der Gruppe steht der Grund, keine Zahl', () => {
    const r = monthlyReport([blatt('a', 4)], 'u1', AUG, setOf)
    const csv = monthlyCsv(r, ctx())
    expect(csv).toContain('vs your types;;Only your own sheets in this group — no comparison possible.')
    expect(csv).toContain('vs all;;Only your own sheets')
  })

  it('Anteile tragen ihre Einheit', () => {
    const csv = monthlyCsv(bericht(), ctx())
    expect(csv).toContain('Share 1–2 (%);0;50;50')
    expect(csv).toContain('Share 4–5 (%);100;50;50')
    expect(csv).toContain('Not competent (%);0;0;0')
    expect(csv).not.toMatch(/^Share 1–2;/m)
  })

  /*
   * Erwartung bewusst geändert (Audit 11/2026, R3-MONATSBERICHT): Statt
   * „Instructor" steht der Name — dieselbe Regel wie auf dem Bildschirm
   * (monatsBeschriftung). Die Zusage aus RPT-01 bleibt: Beim fremden Bericht
   * steht nirgends „You" oder „your".
   */
  it('aus Sicht des Lesers: der Name statt „You", wenn jemand anderes exportiert', () => {
    const eigen = monthlyCsv(bericht(), ctx())
    expect(eigen).toContain(';You;Your aircraft types;All gradings')
    const fremd = monthlyCsv(bericht(), ctx({ fremd: true, exportiertVon: 'Tom Admin' }))
    expect(fremd).toContain(";Mika Beispiel;Mika Beispiel's aircraft types;All gradings")
    expect(fremd).toContain("Per competency;Mika Beispiel;Mika Beispiel's aircraft types;All gradings;vs Mika Beispiel's types;vs all")
    expect(fremd).toContain("vs Mika Beispiel's types;1,00;")
    expect(fremd).toContain('A positive value means Mika Beispiel is more lenient')
    expect(fremd).not.toMatch(/;You;|vs your types|you grade|\byour\b/i)
    expect(fremd).toContain('Generated by;Tom Admin')
    const ohneAndere = monthlyCsv(monthlyReport([blatt('a', 4)], 'u1', AUG, setOf), ctx({ fremd: true }))
    expect(ohneAndere).toContain("Only Mika Beispiel's own sheets in this group")
  })

  it('ohne ausgelassene Blätter keine „Not included"-Zeile; Kompetenzzeilen mit Code und Wortlaut', () => {
    const r = monthlyReport([blatt('a', 4), blatt('b', 2, { instructorId: 'u2' })], 'u1', AUG, setOf)
    const csv = monthlyCsv(r, ctx())
    expect(csv).not.toContain('Not included')
    expect(csv).toContain('KNO Application of knowledge;4,00;3,00;3,00;1,00;1,00')
  })

  it('Dateiname nach dem gemeinsamen Schema: Bericht, Instruktor, Monat, Exporttag', () => {
    expect(monatsKennung({ year: 2026, month: 9 })).toBe('2026-10')
    expect(monthlyCsvName({ month: AUG }, 'Jürgen Müller', JETZT)).toBe('monthly-report_Jürgen-Müller_2026-08_2026-09-02.csv')
  })

  it('Zeichen, die ein Dateiname nicht tragen darf, fallen aus dem Instruktornamen (Nachtrag Exporte Kern-App #5)', () => {
    // Vorher ersetzte die Ansicht nur Leerraum — „Ops/Training: Lead" ergab
    // einen Namen mit „/" und „:", den der Browser kürzt oder verwirft.
    const name = monthlyCsvName({ month: AUG }, 'Ops/Training: Lead*', JETZT)
    expect(name).toBe('monthly-report_Ops-Training-Lead_2026-08_2026-09-02.csv')
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
  })
})

/**
 * Audit 11/2026, R3-MONATSBERICHT: Der Bildschirm zeigte beim Bericht eines
 * anderen Instruktors „You" und „vs your types" — behoben war nur die CSV.
 * Bildschirm, Ausdruck und CSV fragen jetzt dieselbe Funktion; hier steht,
 * was sie für beide Leser liefert. Gegenprobe: MonthlyReport.tsx wieder mit
 * `t('forms:admin.yours')` statt `wort.eigen` → die Ansicht zeigt „You";
 * die Funktion selbst mit fester „You"-Spalte → dieser Test rot.
 */
describe('monatsBeschriftung — eine Regel für Bildschirm und CSV', () => {
  const b = (k: MonatsSchluessel, werte?: { name: string }): string => {
    const wert = (forms.admin as Record<string, string>)[k.replace(/^forms:admin\./, '')]
    if (typeof wert !== 'string') throw new Error(`fehlt: ${k}`)
    return wert.replace(/\{\{name\}\}/g, () => werte?.name ?? '{{name}}')
  }

  it('eigener Bericht: „You" und „your", wie bisher', () => {
    const w = monatsBeschriftung({ fremd: false, instruktor: 'Mika Beispiel' }, b)
    expect(w.eigen).toBe('You')
    expect(w.flotte).toBe('Your aircraft types')
    expect(w.gegenFlotte).toBe('vs your types')
    expect(w.nurEigene).toMatch(/^Only your own sheets/)
    expect(w.deltaHinweis).toMatch(/means you grade/)
    expect(w.hinweis).toMatch(/^Your own gradings/)
    expect(Object.values(w).join(' ')).not.toContain('Mika')
  })

  it('Bericht eines anderen: überall sein Name, nirgends „you/your", kein offener Platzhalter', () => {
    const w = monatsBeschriftung({ fremd: true, instruktor: 'Chris Beispiel' }, b)
    expect(w.eigen).toBe('Chris Beispiel')
    expect(w.flotte).toBe("Chris Beispiel's aircraft types")
    expect(w.gegenFlotte).toBe("vs Chris Beispiel's types")
    expect(w.nurEigene).toBe("Only Chris Beispiel's own sheets in this group — no comparison possible.")
    expect(w.deltaHinweis).toMatch(/^A positive value means Chris Beispiel is more lenient/)
    expect(w.hinweis).toMatch(/^Chris Beispiel's gradings for the month/)
    expect(w.zahlenTitel).toMatch(/^Chris Beispiel's figures/)
    expect(w.herkunft).toMatch(/^Chris Beispiel's figures come from their own sheets/)
    const alles = Object.values(w).join(' ')
    expect(alles).not.toMatch(/\byou(r)?\b/i)
    expect(alles).not.toContain('{{')
  })
})
