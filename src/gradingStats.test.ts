import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  auswertungDruckTeile,
  authorityOf,
  berichtsKennung,
  briefkopfZulassung,
  flottenMatrix,
  formatDelta,
  formatPct,
  imZeitraum,
  LISTEN_ZEITRAEUME,
  matrixTon,
  mean,
  MIN_GRADES,
  MIN_SESSIONS,
  numbersOf,
  pct,
  periodLabel,
  periodStart,
  scopeRecords,
  statsBySet,
  trainingDate,
  zeitraumTage,
} from './gradingStats'
import { druckTitel } from './dateiName'
import type { CompetencyGrade, Grade, GradingRecord, TraineeGrading } from './types'

/**
 * Kennzahlen entscheiden mit darüber, ob ein Instruktor auffällt. Sie müssen
 * deshalb sowohl richtig rechnen als auch dieselbe Rechnung liefern wie die
 * Kachel auf der Startseite (#43) — beide benutzen genau diese Funktionen.
 */

const grades = (...vals: (Grade | null)[]): CompetencyGrade[] =>
  vals.map((grade, i) => ({ code: `C${i}`, grade, comment: '' }))

const trainee = (g: CompetencyGrade[], overall: TraineeGrading['overall'] = 'competent'): TraineeGrading => ({
  traineeId: '',
  traineeName: 'Sophie Berger',
  position: 'CDR',
  grades: g,
  positiveComment: '',
  developmentComment: '',
  summaryComment: '',
  overall,
})

const rec = (over: Partial<GradingRecord> = {}): GradingRecord => ({
  id: 'r1',
  formTypeId: '308A',
  instructorId: 'u1',
  header: { date: '2026-08-05', aircraftType: 'C560 XLS+' },
  trainees: [trainee(grades(3, 3, 3))],
  sessionStatus: 'completed',
  freeText: {},
  signatureInstructor: 'sig',
  signatureTrainee: 'sig',
  status: 'signed',
  mailStatus: 'sent',
  createdAt: Date.UTC(2026, 7, 5),
  signedAt: Date.UTC(2026, 7, 5),
  ...over,
})

describe('mean / numbersOf — „NO" ist keine schlechte Note, sondern gar keine', () => {
  it('laesst NO aus dem Schnitt heraus, statt es als 0 zu werten', () => {
    expect(mean([4, 'NO', 2])).toBe(3)
    expect(numbersOf([4, 'NO', 2, null])).toEqual([4, 2])
  })

  it('liefert null statt NaN, wenn gar keine Zahl vorliegt', () => {
    expect(mean(['NO', null])).toBeNull()
    expect(mean([])).toBeNull()
  })
})

describe('pct', () => {
  it('rechnet Anteile in Prozent', () => {
    expect(pct(1, 4)).toBe(25)
  })

  it('teilt nicht durch null, sondern liefert null', () => {
    expect(pct(0, 0)).toBeNull()
  })
})

describe('trainingDate — der Schulungstag zaehlt, nicht die Erfassung (#51)', () => {
  it('nimmt das Kopfdatum', () => {
    expect(trainingDate(rec())).toBe(new Date('2026-08-05T00:00:00').getTime())
  })

  it('faellt ohne Datum auf den Erfassungszeitpunkt zurueck', () => {
    const created = Date.UTC(2026, 7, 9)
    expect(trainingDate(rec({ header: {}, createdAt: created }))).toBe(created)
  })

  it('faellt auch bei unbrauchbarem Datum zurueck, statt NaN zu liefern', () => {
    const created = Date.UTC(2026, 7, 9)
    expect(trainingDate(rec({ header: { date: 'kein-datum' }, createdAt: created }))).toBe(created)
  })
})

describe('periodStart / periodLabel', () => {
  it('bedeutet „alle Daten" ohne Untergrenze', () => {
    expect(periodStart('all', Date.UTC(2026, 7, 10))).toBe(0)
    expect(periodLabel('all')).toBe('All records')
  })

  it('rechnet Monatsfenster zurueck', () => {
    const now = Date.UTC(2026, 7, 10)
    expect(periodStart('12m', now)).toBeLessThan(now)
    expect(periodLabel('12m')).toBe('Last 12 months')
  })
})

/**
 * Audit 11/2026, TEC-15: `setMonth` lief am Monatsende ueber (31.05. − 3 →
 * 03.03.), und der Beginn behielt die Uhrzeit von „jetzt" — ein Blatt vom
 * Randtag fiel heraus. Die Faelle setzen die Zeitzone selbst: Die CI laeuft
 * in UTC, der Fehler liegt aber im Kalender der Ortszeit (vgl. datum.test.ts).
 */
describe('periodStart — Tagesbeginn desselben Kalendertags, am Monatsende geklemmt', () => {
  let vorher: string | undefined
  beforeEach(() => {
    vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
  })
  afterEach(() => {
    if (vorher === undefined) delete process.env.TZ
    else process.env.TZ = vorher
  })
  const ort = (j: number, m: number, t: number, h = 0, min = 0) => new Date(j, m - 1, t, h, min).getTime()

  it('31.05. − 3 Monate ist der 28.02., nicht der 03.03. — der 1. und 2. März gehören dazu', () => {
    expect(periodStart('3m', ort(2026, 5, 31, 14, 30))).toBe(ort(2026, 2, 28))
  })

  it('31.12. − 6 Monate ist der 30.06.', () => {
    expect(periodStart('6m', ort(2026, 12, 31, 9))).toBe(ort(2026, 6, 30))
  })

  it('29.02.2028 − 12 Monate ist der 28.02.2027 (kein Schalttag im Zieljahr)', () => {
    expect(periodStart('12m', ort(2028, 2, 29, 23, 59))).toBe(ort(2027, 2, 28))
  })

  it('rechnet über den Jahreswechsel und beginnt um Mitternacht Ortszeit', () => {
    expect(periodStart('3m', ort(2026, 1, 15, 8))).toBe(ort(2025, 10, 15))
    // Sommerzeit am Ziel, Winterzeit „jetzt": trotzdem 00:00 Ortszeit
    expect(new Date(periodStart('3m', ort(2026, 11, 2, 10))).getHours()).toBe(0)
  })

  it('ein Blatt vom Randtag zählt — vorher fehlte es, weil der Beginn 10:00 Uhr war', () => {
    const now = ort(2026, 8, 10, 10)
    const randtag = rec({ id: 'rand', header: { date: '2026-05-10', aircraftType: 'C560 XLS+' } })
    const davor = rec({ id: 'davor', header: { date: '2026-05-09', aircraftType: 'C560 XLS+' } })
    expect(scopeRecords([randtag, davor], { period: '3m', now }).map((r) => r.id)).toEqual(['rand'])
  })

  it('Monatsende: Schulungen vom 1. und 2. März sind im 3-Monats-Fenster vom 31. Mai', () => {
    const now = ort(2026, 5, 31, 14, 30)
    const ids = ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'].map((d) => rec({ id: d, header: { date: d } }))
    expect(scopeRecords(ids, { period: '3m', now }).map((r) => r.id)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
  })
})

describe('authorityOf — Altbestand ohne Angabe zaehlt als AT (#64)', () => {
  it('erkennt UK', () => expect(authorityOf(rec({ authority: 'UK' }))).toBe('UK'))
  it('erkennt AT', () => expect(authorityOf(rec({ authority: 'AT' }))).toBe('AT'))
  it('nimmt AT, wenn nichts angegeben ist', () => expect(authorityOf(rec({}))).toBe('AT'))
})

describe('scopeRecords — die vier Regeln der Datenbasis', () => {
  const now = Date.UTC(2026, 7, 10)
  const base = { period: 'all' as const, now }

  it('zaehlt nur unterschriebene Blaetter', () => {
    const offen = rec({ id: 'x', status: 'awaiting_signature' })
    expect(scopeRecords([rec(), offen], base).map((r) => r.id)).toEqual(['r1'])
  })

  it('zaehlt Folgeformulare nicht ein zweites Mal', () => {
    const child = rec({ id: 'c', parentId: 'r1' })
    expect(scopeRecords([rec(), child], base).map((r) => r.id)).toEqual(['r1'])
  })

  it('laesst Anwesenheitslisten ohne Piloten aussen vor', () => {
    const liste = rec({ id: 'a', trainees: [] })
    expect(scopeRecords([rec(), liste], base).map((r) => r.id)).toEqual(['r1'])
  })

  it('filtert nach Flotte und Behoerde', () => {
    const uk = rec({ id: 'uk', authority: 'UK', header: { date: '2026-08-05', aircraftType: 'CL30' } })
    expect(scopeRecords([rec(), uk], { ...base, authority: 'UK' }).map((r) => r.id)).toEqual(['uk'])
    expect(scopeRecords([rec(), uk], { ...base, fleet: 'CL30' }).map((r) => r.id)).toEqual(['uk'])
  })

  it('schneidet ueber den Schulungstag ab, nicht ueber die Erfassung (#51)', () => {
    // Vor zwei Jahren geschult, gestern nachgetragen — gehoert NICHT ins 12-Monats-Fenster.
    const nachtrag = rec({ id: 'alt', header: { date: '2024-01-15' }, createdAt: now })
    expect(scopeRecords([nachtrag], { period: '12m', now }).map((r) => r.id)).toEqual([])
  })
})

describe('statsBySet', () => {
  const setOf = () => 'pilot' as const

  it('trennt Piloten- und Instruktorensaetze und laesst leere Saetze ganz weg', () => {
    // Piloten- und Instruktorenbewertungen duerfen nie gegeneinander gerechnet
    // werden; ein Satz ohne Daten erscheint gar nicht erst als leere Zeile.
    const out = statsBySet([rec()], setOf)
    expect(out.map((s) => s.key)).toEqual(['pilot'])
    expect(out.every((s) => s.rows.length > 0)).toBe(true)
  })

  it('zaehlt den Durchgang, nicht das einzelne Blatt', () => {
    const a = rec({ id: 'a', batchId: 'b1' })
    const b = rec({ id: 'b', batchId: 'b1' })
    const row = statsBySet([a, b], setOf).find((s) => s.key === 'pilot')!.rows[0]
    expect(row.sessions).toBe(1)
  })

  it('meldet „insufficient", solange die Datenbasis zu duenn ist', () => {
    const row = statsBySet([rec()], setOf).find((s) => s.key === 'pilot')!.rows[0]
    expect(row.flag).toBe('insufficient')
    expect(MIN_GRADES).toBeGreaterThan(0)
    expect(MIN_SESSIONS).toBeGreaterThan(0)
  })

  it('rechnet Anteile und Not-Competent-Quote je Instruktor', () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      rec({ id: `r${i}`, batchId: `b${i}`, trainees: [trainee(grades(1, 2, 5, 4), i === 0 ? 'not_competent' : 'competent')] }),
    )
    const row = statsBySet(many, setOf).find((s) => s.key === 'pilot')!.rows[0]
    expect(row.n).toBe(16)
    expect(row.sessions).toBe(4)
    expect(row.lowShare).toBe(50)
    expect(row.highShare).toBe(50)
    expect(row.ncRate).toBe(25)
    expect(row.flag).not.toBe('insufficient')
  })
})

describe('statsBySet — Sortierung bei fehlendem Delta', () => {
  it('sortiert Zeilen ohne Delta nicht als „unauffaellig" mitten ins Feld', () => {
    // Wer nur „NO" vergeben hat, hat kein Delta. Heute rutscht er ueber
    // `?? 0` zwischen die auffaelligen Instruktoren — dieser Test haelt das
    // aktuelle Verhalten fest, damit eine Korrektur sichtbar wird.
    const setOf = () => 'pilot' as const
    const mk = (id: string, instr: string, vals: (Grade | null)[]) =>
      rec({ id, batchId: id, instructorId: instr, trainees: [trainee(grades(...vals))] })
    const rs = [
      ...[1, 2, 3].map((i) => mk(`hoch${i}`, 'u-hoch', [5, 5, 5, 5])),
      ...[1, 2, 3].map((i) => mk(`no${i}`, 'u-no', ['NO', 'NO', 'NO', 'NO'])),
      ...[1, 2, 3].map((i) => mk(`tief${i}`, 'u-tief', [1, 1, 1, 1])),
    ]
    const rows = statsBySet(rs, setOf).find((s) => s.key === 'pilot')!.rows
    expect(rows.map((r) => r.id)).toEqual(['u-hoch', 'u-no', 'u-tief'])
    expect(rows.find((r) => r.id === 'u-no')!.mean).toBeNull()
    expect(rows.find((r) => r.id === 'u-no')!.flag).toBe('insufficient')
  })
})

/**
 * Audit 11/2026, GRD-07/STAT-01/UID-01/TXT-06: Die Flottenmatrix rechnete
 * aus ALLEN Blaettern des Satzes. Unter „Instructor competencies (308G) ·
 * 0 sessions" stand CL30 5.0/5.0/4.0 aus einem Blatt, das noch auf die
 * Unterschrift wartete. Sie folgt jetzt derselben Basis wie Trend und
 * Kalibrierung — nur ohne Flottenfilter, weil sie die Flotten vergleicht.
 */
describe('flottenMatrix — dieselbe Datenbasis wie Trend und Kalibrierung', () => {
  const now = Date.UTC(2026, 7, 10)
  const setOf = (r: GradingRecord) => (r.formTypeId === '308G' ? ('instructor' as const) : ('pilot' as const))
  const opts = { authority: '' as const, period: '12m' as const, now }
  const g308 = (over: Partial<GradingRecord>) =>
    rec({ formTypeId: '308G', header: { date: '2026-08-05', aircraftType: 'CL30' }, trainees: [trainee(grades(5, 5, 4))], ...over })

  it('rechnet Mittel je Muster und Kompetenz und laesst leere Zellen null', () => {
    const a = rec({ id: 'a', trainees: [trainee(grades(2, 4))] })
    const b = rec({ id: 'b', trainees: [trainee(grades(4, 'NO'))] })
    const m = flottenMatrix([a, b], setOf, 'pilot', opts)
    expect(m.fleets).toEqual(['C560 XLS+'])
    expect(m.codes).toEqual(['C0', 'C1'])
    expect(m.cell['C560 XLS+']).toEqual({ C0: 3, C1: 4 })
    const nurNo = flottenMatrix([rec({ trainees: [trainee(grades('NO'))] })], setOf, 'pilot', opts)
    expect(nurNo.cell['C560 XLS+'].C0).toBeNull()
  })

  it('zaehlt ein unsigniertes 308G nicht — der Satz bleibt leer', () => {
    const offen = g308({ id: 'gr4', status: 'awaiting_signature', signatureTrainee: null })
    expect(flottenMatrix([offen], setOf, 'instructor', opts)).toEqual({ fleets: [], codes: [], cell: {} })
  })

  it('zaehlt Folgeformulare nicht', () => {
    const folge = rec({ id: 'f', parentId: 'r1', header: { date: '2026-08-05', aircraftType: 'CL30' } })
    expect(flottenMatrix([rec(), folge], setOf, 'pilot', opts).fleets).toEqual(['C560 XLS+'])
  })

  it('laesst Blaetter ausserhalb des Zeitraums weg — ueber den Schulungstag', () => {
    const alt = rec({ id: 'alt', header: { date: '2024-01-15', aircraftType: 'CL30' }, createdAt: now })
    expect(flottenMatrix([rec(), alt], setOf, 'pilot', opts).fleets).toEqual(['C560 XLS+'])
    expect(flottenMatrix([rec(), alt], setOf, 'pilot', { ...opts, period: 'all' }).fleets).toEqual(['C560 XLS+', 'CL30'])
  })

  it('zaehlt ein UK-Blatt bei Behoerde AT nicht', () => {
    const uk = rec({ id: 'uk', authority: 'UK', header: { date: '2026-08-05', aircraftType: 'CL30' } })
    expect(flottenMatrix([rec(), uk], setOf, 'pilot', { ...opts, authority: 'AT' }).fleets).toEqual(['C560 XLS+'])
    expect(flottenMatrix([rec(), uk], setOf, 'pilot', { ...opts, authority: 'UK' }).fleets).toEqual(['CL30'])
  })

  it('zeigt alle Flotten — sie ist der Vergleich der Flotten untereinander', () => {
    const cl = rec({ id: 'cl', header: { date: '2026-08-05', aircraftType: 'CL30' } })
    expect(flottenMatrix([rec(), cl], setOf, 'pilot', opts).fleets).toEqual(['C560 XLS+', 'CL30'])
  })

  it('rechnet die Saetze getrennt und gibt Blaettern ohne Muster keine Zeile', () => {
    const instr = g308({ id: 'g' })
    const ohneMuster = rec({ id: 'o', header: { date: '2026-08-05' } })
    expect(flottenMatrix([rec(), instr, ohneMuster], setOf, 'pilot', opts).fleets).toEqual(['C560 XLS+'])
    expect(flottenMatrix([rec(), instr, ohneMuster], setOf, 'instructor', opts).fleets).toEqual(['CL30'])
  })
})

/**
 * Audit 11/2026, GRD-05/STD-01/UID-06: Bei „All authorities" stand in der
 * Bereichszeile des Standardisierungsberichts „Authority: AT.ATO.106" — der
 * Rueckfall auf „All authorities" griff nie.
 */
describe('berichtsKennung — Bereichszeile von Bericht und Exportkopf', () => {
  const doc = { approvalNumber: 'AT.ATO.106', approvalNumberUK: 'GBR.ATO.0541' }

  it('nennt ohne Behoerdenauswahl keine einzelne Zulassung', () => {
    expect(berichtsKennung('', doc)).toBe('All authorities')
  })

  it('nennt die Kennung der gewaehlten Behoerde', () => {
    expect(berichtsKennung('AT', { approvalNumber: 'AT.ATO.999', approvalNumberUK: 'GBR.ATO.9' })).toBe('AT.ATO.999')
    expect(berichtsKennung('UK', { approvalNumber: 'AT.ATO.999', approvalNumberUK: 'GBR.ATO.9' })).toBe('GBR.ATO.9')
  })

  it('faellt bei leeren Einstellungen auf die Standardkennungen zurueck', () => {
    expect(berichtsKennung('AT', { approvalNumber: '', approvalNumberUK: '' })).toBe('AT.ATO.106')
    expect(berichtsKennung('UK', undefined)).toBe('GBR.ATO.0541')
    expect(berichtsKennung('', undefined)).toBe('All authorities')
  })
})

/**
 * Audit 11/2026, RPT-01: Standardisierungsbericht und Statistik drucken
 * denselben Briefkopf. Der Absender ist die ATO — auch bei „All
 * authorities" eine Zulassung (die Hauptzulassung), während die
 * Bereichszeile „All authorities" sagt.
 */
describe('briefkopfZulassung — Absender im Kopf gedruckter Berichte', () => {
  const doc = { approvalNumber: 'AT.ATO.999', approvalNumberUK: 'GBR.ATO.9' }

  it('ohne Behoerdenauswahl die Hauptzulassung, sonst die der Behoerde', () => {
    expect(briefkopfZulassung('', doc)).toBe('AT.ATO.999')
    expect(briefkopfZulassung('AT', doc)).toBe('AT.ATO.999')
    expect(briefkopfZulassung('UK', doc)).toBe('GBR.ATO.9')
  })

  it('faellt bei leeren Einstellungen auf die Standardkennungen zurueck', () => {
    expect(briefkopfZulassung('', undefined)).toBe('AT.ATO.106')
    expect(briefkopfZulassung('UK', { approvalNumber: '', approvalNumberUK: '' })).toBe('GBR.ATO.0541')
  })
})

/**
 * Audit 11/2026, GRD-09: Die Ablage filterte „Last 7 days" nach der
 * Erfassung, die Liste des Training Admins nach dem Schulungstag — gleiche
 * Beschriftung, verschiedene Zeilen.
 */
describe('imZeitraum — Listenfilter ueber den Schulungstag', () => {
  const jetzt = new Date(2026, 7, 25, 15, 0).getTime()

  it('heute erfasst, vor 20 Tagen geschult: nicht in 7 Tagen, aber in 31', () => {
    const nachtrag = rec({ header: { date: '2026-08-05' }, createdAt: jetzt })
    expect(imZeitraum(nachtrag, 7, jetzt)).toBe(false)
    expect(imZeitraum(nachtrag, 31, jetzt)).toBe(true)
  })

  it('ohne Kopfdatum zaehlt der Erfassungszeitpunkt', () => {
    const vorZweiTagen = jetzt - 2 * 24 * 3600_000
    expect(imZeitraum(rec({ header: {}, createdAt: vorZweiTagen }), 7, jetzt)).toBe(true)
    expect(imZeitraum(rec({ header: {}, createdAt: vorZweiTagen }), 1, jetzt)).toBe(false)
  })

  it('„7 Tage" sind die sieben Kalendertage bis heute', () => {
    expect(imZeitraum(rec({ header: { date: '2026-08-19' } }), 7, jetzt)).toBe(true)
    expect(imZeitraum(rec({ header: { date: '2026-08-18' } }), 7, jetzt)).toBe(false)
  })

  it('ohne Fenster gilt alles; unbekannte Schluessel filtern nicht', () => {
    expect(imZeitraum(rec({ header: { date: '2001-01-01' } }), null, jetzt)).toBe(true)
    expect(zeitraumTage('all')).toBeNull()
    expect(zeitraumTage('week')).toBe(7)
    expect(zeitraumTage('gibt-es-nicht')).toBeNull()
    expect(LISTEN_ZEITRAEUME.map((p) => p.key)).toEqual(['all', 'day', 'week', 'month', 'year'])
  })
})

/**
 * Audit 11/2026, GRD-13/MOB-06: „50 %" brach am Telefon zwischen Zahl und
 * Zeichen — das Leerzeichen war ein normales.
 */
describe('formatPct — ein Wert ist eine Einheit', () => {
  it('ganze Prozent mit geschütztem Leerzeichen', () => {
    expect(formatPct(50)).toBe('50\u00a0%')
    expect(formatPct(33.3)).toBe('33\u00a0%')
    expect(formatPct(0)).toBe('0\u00a0%')
    expect(formatPct(50)).not.toContain(' ')
  })

  it('ohne Wert ein Strich, keine „0 %"', () => {
    expect(formatPct(null)).toBe('–')
  })
})

/**
 * Audit 11/2026, Nachtrag Exporte Kern-App #2: Die Kalibrierungs-Kachel
 * zeigte bei einem Instruktor ohne Zahlnote „+0.00" neben einer leeren
 * Durchschnittszelle; die Berichte schrieben „–". Eine Regel für alle drei.
 */
describe('formatDelta — Abweichung ohne Mittelwert ist „–", nicht „+0.00"', () => {
  it('ohne Wert ein Strich', () => {
    expect(formatDelta(null)).toBe('–')
  })

  it('Vorzeichen nur über null, zwei Nachkommastellen', () => {
    expect(formatDelta(0.25)).toBe('+0.25')
    expect(formatDelta(-0.4)).toBe('-0.40')
    expect(formatDelta(1)).toBe('+1.00')
  })

  it('genau null und was auf null rundet ohne Vorzeichen — kein „+0.00", kein „-0.00"', () => {
    expect(formatDelta(0)).toBe('0.00')
    expect(formatDelta(-0.001)).toBe('0.00')
    expect(formatDelta(0.004)).toBe('0.00')
  })

  it('der Instruktor mit nur „NO" bekommt in der Kachel „–"', () => {
    // Derselbe Weg wie die Kachel: statsBySet → row.delta → formatDelta.
    const setOf = () => 'pilot' as const
    const rs = [
      rec({ id: 'z', batchId: 'z', instructorId: 'u-zahl', trainees: [trainee(grades(4, 3))] }),
      rec({ id: 'n', batchId: 'n', instructorId: 'u-no', trainees: [trainee(grades('NO', 'NO'))] }),
    ]
    const rows = statsBySet(rs, setOf).find((s) => s.key === 'pilot')!.rows
    expect(formatDelta(rows.find((r) => r.id === 'u-no')!.delta)).toBe('–')
    expect(formatDelta(rows.find((r) => r.id === 'u-zahl')!.delta)).toBe('0.00')
  })
})

/**
 * Audit 11/2026, UID-19: Die Stufen der Flottenmatrix standen als rohe
 * Palettenfarben in der Ansicht und verloren im Dunkelmodus ihre Bedeutung.
 * Schwellen 4/3/2, gemessen am angezeigten Wert.
 */
describe('matrixTon — Stufen der Flottenmatrix', () => {
  it('Schwellen 4 / 3 / 2', () => {
    expect(matrixTon(5)).toBe('hoch')
    expect(matrixTon(4)).toBe('hoch')
    expect(matrixTon(3.9)).toBe('gut')
    expect(matrixTon(3)).toBe('gut')
    expect(matrixTon(2.9)).toBe('niedrig')
    expect(matrixTon(2)).toBe('niedrig')
    expect(matrixTon(1.9)).toBe('schwach')
    expect(matrixTon(1)).toBe('schwach')
  })

  it('stuft nach dem angezeigten Wert: „4.0" aus 3.96 ist keine 3er-Zelle', () => {
    expect((3.96).toFixed(1)).toBe('4.0')
    expect(matrixTon(3.96)).toBe('hoch')
    expect(matrixTon(2.94)).toBe('niedrig')
    expect(matrixTon(1.96)).toBe('niedrig')
  })

  it('keine Zahlnote, keine Fläche', () => {
    expect(matrixTon(null)).toBeNull()
  })
})

/**
 * Audit 11/2026, EXM-04: Standardisierungsbericht und Statistik druckten als
 * „Instructor Connect.pdf". Der Titel nennt jetzt denselben Ausschnitt wie
 * der Kopf des Ausdrucks.
 */
describe('auswertungDruckTeile — Name des gedruckten Berichts', () => {
  const doc = { approvalNumber: 'AT.ATO.106', approvalNumberUK: 'GBR.ATO.0541' }
  const now = new Date(2026, 10, 2, 14, 30).getTime()

  it('Bericht, Zeitraum, Flotte, Behörde und Tag — bei „All authorities" keine AT-Nummer', () => {
    const teile = auswertungDruckTeile('Standardisation Report', { fleet: '', authority: '', period: '12m', doc, now })
    expect(teile).toEqual(['Standardisation Report', 'Last 12 months', 'All fleets', 'All authorities', '02.11.2026'])
    expect(druckTitel(teile)).toBe('Standardisation Report_Last 12 months_All fleets_All authorities_02.11.2026')
  })

  it('zwei Ausschnitte desselben Tages heissen verschieden — vorher beide „Instructor Connect"', () => {
    const a = druckTitel(auswertungDruckTeile('Analytics', { fleet: 'CL30', authority: 'UK', period: '3m', doc, now }))
    const b = druckTitel(auswertungDruckTeile('Analytics', { fleet: 'C560 XLS+', authority: 'AT', period: 'all', doc, now }))
    expect(a).toBe('Analytics_Last 3 months_CL30_GBR.ATO.0541_02.11.2026')
    expect(b).toBe('Analytics_All records_C560 XLS+_AT.ATO.106_02.11.2026')
    expect(a).not.toBe(b)
  })
})
