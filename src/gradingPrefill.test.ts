import { describe, expect, it } from 'vitest'
import { auswahlVon, fuehrtInstruktorAngaben, kopfFuerTyp, kopfVomElternblatt, vorbelegen, vorbelegung, type Vorbelegungsquelle } from './gradingPrefill'
import { FORM_TYPES, INSTRUCTOR_SET, PILOT_SET } from './sandbox/gradingDefaults'
import type { FormType, GradingRecord } from './types'

/**
 * Audit 11/2026, GRD-06: Qualifikation und Sitz des Instruktors wurden auf
 * JEDEM Formulartyp aus dem letzten Pilotenblatt vorbelegt — auch dort, wo das
 * Formular keine Knoepfe dafuer zeigt (306, 307A/B, 310, 308G). Sie landeten
 * unsichtbar und nicht entfernbar im unterschriebenen Nachweis.
 *
 * Geprueft wird gegen den echten Auslieferungskatalog, nicht gegen
 * nachgebaute Typen: Die Zusage gilt fuer die Formulare, die es gibt.
 */
const typ = (id: string): FormType => FORM_TYPES.find((f) => f.id === id)!
const kompetenzen = (ft: FormType) =>
  ft.competencySet === 'pilot' ? PILOT_SET.competencies.length : ft.competencySet === 'instructor' ? INSTRUCTOR_SET.competencies.length : 0

const quelle = (ft: FormType, over: Partial<Vorbelegungsquelle> = {}): Vorbelegungsquelle => ({
  letztesEigene: { header: { trainingDevice: 'FFS', instructorQual: 'TKI', instructorSeat: 'Right' } },
  eigeneMuster: ['CL30'],
  muster: ['CL30', 'C560 XLS+'],
  heute: '2026-11-02',
  anzahlKompetenzen: kompetenzen(ft),
  ...over,
})

describe('vorbelegung — nur, was der Typ fuehrt und der Nutzer sieht', () => {
  it.each(['306', '307A', '307B', '310', '308G'])('%s bekommt weder Qualifikation noch Sitz', (id) => {
    const v = vorbelegung(typ(id), quelle(typ(id)))
    expect(v).not.toHaveProperty('instructorQual')
    expect(v).not.toHaveProperty('instructorSeat')
  })

  it('308A bekommt beide — dort stehen die Knoepfe', () => {
    const v = vorbelegung(typ('308A'), quelle(typ('308A')))
    expect(v).toMatchObject({ instructorQual: 'TKI', instructorSeat: 'Right', trainingDevice: 'FFS', aircraftType: 'CL30', date: '2026-11-02' })
  })

  it('uebernimmt nur Qualifikation und Sitz, die zur Wahl stehen', () => {
    const v = vorbelegung(typ('308A'), quelle(typ('308A'), { letztesEigene: { header: { instructorQual: 'CRI', instructorSeat: 'Jumpseat' } } }))
    expect(v).not.toHaveProperty('instructorQual')
    expect(v).not.toHaveProperty('instructorSeat')
  })

  it('verwirft Auswahlwerte, die das Feld nicht anbietet', () => {
    // 308H bietet „FFS, FNPT, FTD" — das „OTD / Mock-Up" des letzten Blatts nicht.
    const v = vorbelegung(typ('308H'), quelle(typ('308H'), { letztesEigene: { header: { trainingDevice: 'OTD / Mock-Up' } } }))
    expect(v).not.toHaveProperty('trainingDevice')
  })

  it('prueft das Muster gegen die Liste der Einstellungen, nicht gegen den Katalog', () => {
    // Das Formular zeigt die Musterliste der Einstellungen. Steht das eigene
    // Muster dort nicht (mehr), laege es unsichtbar im Datensatz.
    const v = vorbelegung(typ('308A'), quelle(typ('308A'), { eigeneMuster: ['ATR 42/72'], muster: ['CL30'] }))
    expect(v).not.toHaveProperty('aircraftType')
  })

  it('belegt kein Muster vor, wenn der Nutzer mehrere fliegt', () => {
    expect(vorbelegung(typ('308A'), quelle(typ('308A'), { eigeneMuster: ['CL30', 'C560 XLS+'] }))).not.toHaveProperty('aircraftType')
  })

  it('belegt das Datum nur vor, wo es ein Datumsfeld gibt', () => {
    const ohneDatum: FormType = { id: 'X1', title: 'X', competencySet: null, fields: [], freeTextSections: [] }
    expect(vorbelegung(ohneDatum, quelle(ohneDatum))).toEqual({})
    expect(vorbelegung(typ('306'), quelle(typ('306'))).date).toBe('2026-11-02')
  })

  it('kommt ohne letztes eigenes Blatt aus', () => {
    const v = vorbelegung(typ('308A'), quelle(typ('308A'), { letztesEigene: undefined }))
    expect(v).toEqual({ date: '2026-11-02', aircraftType: 'CL30' })
  })

  it('eine Pflicht-Ankreuzgruppe mit genau einer Option ist vorbelegt (GTY-11)', () => {
    // 308D kennt als Training Device nur „FFS".
    expect(vorbelegung(typ('308D'), quelle(typ('308D'), { letztesEigene: undefined })).trainingDevice).toBe('FFS')
  })

  it('bei mehreren Optionen wird nichts geraten', () => {
    const v = vorbelegung(typ('308G'), quelle(typ('308G'), { letztesEigene: undefined }))
    expect(v).not.toHaveProperty('candidateQual')
    expect(v).not.toHaveProperty('operation')
  })

  it('eine optionale Einzeloption bleibt eine Frage', () => {
    const ft: FormType = {
      id: 'X2',
      title: 'X',
      competencySet: null,
      fields: [{ key: 'q', label: 'Q', type: 'radiogroup', options: ['Ja'], required: false }],
      freeTextSections: [],
    }
    expect(vorbelegung(ft, quelle(ft))).toEqual({})
  })
})

describe('fuehrtInstruktorAngaben', () => {
  it('nur Pilotenblaetter mit Kompetenzen, nie das 308G', () => {
    expect(fuehrtInstruktorAngaben(typ('308A'), 9)).toBe(true)
    expect(fuehrtInstruktorAngaben(typ('308A'), 0)).toBe(false)
    expect(fuehrtInstruktorAngaben(typ('308G'), 9)).toBe(false)
    expect(fuehrtInstruktorAngaben(typ('306'), 0)).toBe(false)
    // Ein selbst angelegter Typ mit Pilotenkatalog unter freier Nummer zaehlt mit.
    expect(fuehrtInstruktorAngaben({ id: '400', competencySet: 'pilot' }, 9)).toBe(true)
  })
})

describe('auswahlVon', () => {
  it('Muster aus den Einstellungen, sonst die Optionen des Feldes, sonst frei', () => {
    expect(auswahlVon({ key: 'aircraftType', options: ['ALT'] }, ['CL30'])).toEqual(['CL30'])
    expect(auswahlVon({ key: 'trainingDevice', options: ['FFS'] }, ['CL30'])).toEqual(['FFS'])
    expect(auswahlVon({ key: 'event' }, ['CL30'])).toBeUndefined()
  })
})

describe('vorbelegen — fuellt nur Luecken', () => {
  it('ueberschreibt keine Eingabe (Entwurf und Elternblatt gewinnen)', () => {
    expect(vorbelegen({ date: '2026-10-30', event: 'LOFT' }, { date: '2026-11-02', aircraftType: 'CL30' })).toEqual({
      date: '2026-10-30',
      event: 'LOFT',
      aircraftType: 'CL30',
    })
  })

  it('gibt ohne Aenderung dasselbe Objekt zurueck', () => {
    const h = { date: '2026-11-02' }
    expect(vorbelegen(h, { date: '2026-11-03' })).toBe(h)
    expect(vorbelegen(h, {})).toBe(h)
  })

  it('fuellt auch ein leer gesetztes Feld', () => {
    expect(vorbelegen({ aircraftType: '' }, { aircraftType: 'CL30' })).toEqual({ aircraftType: 'CL30' })
  })
})

/**
 * Nachtrag zum Audit 11/2026 (zu GRD-06): Folgeformulare erbten vom
 * Elternblatt auch das Training Device, obwohl 306 und 310 kein solches Feld
 * fuehren — unsichtbar im Nachweis, aber in der Spalte „Device" der
 * Forms-CSV. Geprueft gegen den Auslieferungskatalog.
 */
describe('kopfVomElternblatt — nur Felder, die der Folgetyp fuehrt', () => {
  const eltern: Pick<GradingRecord, 'header' | 'trainees'> = {
    header: { aircraftType: 'C560 XLS+', date: '2026-10-30', trainingDevice: 'FFS', event: 'FFS 3', instructorQual: 'TKI' },
    trainees: [
      {
        traineeId: '',
        traineeName: 'Sophie Testpilotin',
        position: 'CDR',
        grades: [],
        positiveComment: '',
        developmentComment: '',
        summaryComment: '',
        overall: 'not_competent',
      },
    ],
  }

  it.each(['306', '310'])('%s erbt Muster, Datum und Pilot — kein Training Device', (id) => {
    const kopf = kopfVomElternblatt(eltern, typ(id))
    expect(kopf).toEqual({ aircraftType: 'C560 XLS+', date: '2026-10-30', traineeName: 'Sophie Testpilotin' })
    // Auch nicht leer gesetzt: Der Schluessel selbst wuerde im Datensatz stehen.
    expect(kopf).not.toHaveProperty('trainingDevice')
  })

  it('Event, Qualifikation und Sitz des Elternblatts bleiben dort', () => {
    const kopf = kopfVomElternblatt(eltern, typ('306'))
    expect(kopf).not.toHaveProperty('event')
    expect(kopf).not.toHaveProperty('instructorQual')
  })

  it('ein gepflegter Folgetyp mit Training Device bekommt es', () => {
    const mitGeraet: FormType = { ...typ('310'), fields: [...typ('310').fields, { key: 'trainingDevice', label: 'Training Device', type: 'radiogroup', options: ['FFS'], required: true }] }
    expect(kopfVomElternblatt(eltern, mitGeraet).trainingDevice).toBe('FFS')
  })

  it('ohne Pilotennamen im Blatt gilt der Name aus dem Kopf; leere Werte entfallen', () => {
    const ohne = { header: { traineeName: 'Mika Beispiel', aircraftType: '' }, trainees: [] }
    expect(kopfVomElternblatt(ohne, typ('310'))).toEqual({ traineeName: 'Mika Beispiel' })
  })

  it('ohne bekannten Folgetyp wird nichts geerbt', () => {
    expect(kopfVomElternblatt(eltern, undefined)).toEqual({})
  })
})

/**
 * Gegenpruefung zu GRD-06: Die Vorbelegung fuellt nur Luecken. Wer nach dem
 * Oeffnen eines 308A (Device, Qualifikation, Sitz vorbelegt) den Typ auf
 * 307A oder 308G umstellte, behielt diese Werte unsichtbar im Kopf — im
 * Fingerabdruck und in der Spalte „Device" der Forms-CSV.
 */
describe('kopfFuerTyp — beim Typwechsel und Absenden bleibt nur, was der Typ zeigt', () => {
  const vom308A = { date: '2026-11-02', aircraftType: 'CL30', trainingDevice: 'FFS', event: 'FFS 3', instructorQual: 'TKI', instructorSeat: 'Right' }

  it('308A → 307A: Device, Qualifikation und Sitz fallen weg, gemeinsame Felder bleiben', () => {
    const kopf = kopfFuerTyp(vom308A, typ('307A'), kompetenzen(typ('307A')))
    expect(kopf).not.toHaveProperty('trainingDevice')
    expect(kopf).not.toHaveProperty('instructorQual')
    expect(kopf).not.toHaveProperty('instructorSeat')
    expect(kopf).toMatchObject({ date: '2026-11-02', aircraftType: 'CL30' })
  })

  it('308A → 308G: keine Knoepfe fuer Qualifikation und Sitz, also keine Werte', () => {
    const kopf = kopfFuerTyp(vom308A, typ('308G'), kompetenzen(typ('308G')))
    expect(kopf).not.toHaveProperty('instructorQual')
    expect(kopf).not.toHaveProperty('instructorSeat')
  })

  it('auf dem 308A bleibt alles — und es ist dasselbe Objekt (kein neues Rendern)', () => {
    expect(kopfFuerTyp(vom308A, typ('308A'), kompetenzen(typ('308A')))).toBe(vom308A)
  })

  it('jeder Schluessel des Ergebnisses ist ein Feld des Typs oder eine seiner Knopfgruppen', () => {
    for (const ft of FORM_TYPES) {
      const n = kompetenzen(ft)
      const felder = new Set([...ft.fields.map((f) => f.key), ...(fuehrtInstruktorAngaben(ft, n) ? ['instructorQual', 'instructorSeat'] : [])])
      for (const k of Object.keys(kopfFuerTyp(vom308A, ft, n))) expect(felder.has(k), `${ft.id}: ${k}`).toBe(true)
    }
  })
})
