import { describe, expect, it } from 'vitest'
import { kopfText, kopfZeilen } from './gradingKopf'
import { FORM_TYPES } from './sandbox/gradingDefaults'
import type { GradingRecord, TraineeGrading } from './types'

/**
 * Kopfdaten eines Nachweises (Audit 11/2026, GTY-01, GTY-04).
 *
 * Bewacht wird, was auf dem Ausdruck schon einmal zerbrochen war: „Topics
 * Covered" ohne seine Zeilenumbrueche, die Event-Mehrfachauswahl des 308H als
 * ein Wort, das mitten im Wort umbrach, breite Felder in einer halben Spalte.
 * Dieselben Zeilen speisen den Forms-Export — was hier fehlt, fehlt dort.
 */

const typ = (id: string) => FORM_TYPES.find((f) => f.id === id)!
const pilot: TraineeGrading = {
  traineeName: 'Sophie Berger',
  traineeId: '',
  position: 'FO',
  grades: [],
  positiveComment: '',
  developmentComment: '',
  summaryComment: '',
  overall: null,
}
const rec = (header: Record<string, string>, trainees: TraineeGrading[] = [pilot]): Pick<GradingRecord, 'header' | 'trainees'> => ({ header, trainees })
const label = (k: string) => (k === 'forms:instructorQual' ? 'Instructor qualification' : 'Instructor seat')
const zeile = (z: ReturnType<typeof kopfZeilen>, key: string) => z.find((x) => x.key === key)!

describe('kopfZeilen', () => {
  it('behaelt die Zeilenumbrueche eines Textfelds und setzt es breit (308E Topics Covered)', () => {
    const z = zeile(kopfZeilen(typ('308E'), rec({ topicsCovered: 'Steep turns\nApproach to stall\nEngine failure after V1' }), label), 'topicsCovered')
    expect(z.wert).toBe('Steep turns\nApproach to stall\nEngine failure after V1')
    expect(z.mehrzeilig).toBe(true)
    expect(z.breit).toBe(true)
    expect(z.liste).toBeNull()
  })

  it('liefert eine Mehrfachauswahl Eintrag fuer Eintrag (308H Event, 308G Program)', () => {
    const h = zeile(kopfZeilen(typ('308H'), rec({ event: 'Adverse Weather, LVO / CAT II / CAT III, UPRT' }), label), 'event')
    expect(h.liste).toEqual(['Adverse Weather', 'LVO / CAT II / CAT III', 'UPRT'])
    expect(h.breit).toBe(true)
    expect(h.mehrzeilig).toBe(false)
    const g = zeile(kopfZeilen(typ('308G'), rec({ program: 'PRG 1*, PRG 3, PRG 8' }), label), 'program')
    expect(g.liste).toEqual(['PRG 1*', 'PRG 3', 'PRG 8'])
    // Die Fussnote des Originals reist mit.
    expect(g.hint).toContain('Either Pilot Seat')
  })

  it('setzt nur wide- und Textfelder breit, ein schmales Feld bleibt schmal', () => {
    const z = kopfZeilen(typ('308E'), rec({}), label)
    expect(zeile(z, 'approaches').breit).toBe(true) // wide im Katalog
    expect(zeile(z, 'airportsUsed').breit).toBe(false)
    expect(zeile(z, 'aircraftType').liste).toBeNull()
  })

  it('formatiert Datumsfelder als DD.MM.YYYY und laesst leere Felder leer', () => {
    const z = kopfZeilen(typ('310'), rec({ date: '2026-11-01', dueDate: '' }, []), label)
    expect(zeile(z, 'date').wert).toBe('01.11.2026')
    expect(zeile(z, 'dueDate').wert).toBe('')
    // Eine leere Mehrfachauswahl ist eine leere Liste, kein [''].
    expect(zeile(kopfZeilen(typ('308H'), rec({}), label), 'event').liste).toEqual([])
  })

  it('haengt Qualifikation und Sitz nur an Blaetter, die sie fuehren (GRD-06)', () => {
    const kopf = { instructorQual: 'TRI', instructorSeat: 'Right' }
    const a = kopfZeilen(typ('308A'), rec(kopf), label)
    expect(a.slice(-2).map((z) => [z.label, z.wert])).toEqual([
      ['Instructor qualification', 'TRI'],
      ['Instructor seat', 'Right'],
    ])
    // 308G beurteilt einen Instruktor, 306 hat keine Bewertung — dort nie.
    expect(kopfZeilen(typ('308G'), rec(kopf), label).some((z) => z.key === 'instructorQual')).toBe(false)
    expect(kopfZeilen(typ('306'), rec(kopf, []), label).some((z) => z.key === 'instructorQual')).toBe(false)
    // Leer heisst: keine Zeile, kein „–".
    expect(kopfZeilen(typ('308A'), rec({ instructorQual: '' }), label).some((z) => z.key === 'instructorQual')).toBe(false)
  })

  it('zeigt die gespeicherten Kopfdaten auch ohne Katalogeintrag', () => {
    // Formulartyp im Admin Panel geloescht: vorher blieb die Karte leer.
    const z = kopfZeilen(undefined, rec({ date: '2026-11-01', notes: 'Line 1\nLine 2', instructorQual: 'TRI', leer: ' ' }), label)
    expect(z.map((x) => [x.label, x.wert])).toEqual([
      ['date', '01.11.2026'],
      ['notes', 'Line 1\nLine 2'],
      ['Instructor qualification', 'TRI'],
    ])
    expect(zeile(z, 'notes').mehrzeilig).toBe(true)
    expect(zeile(z, 'notes').breit).toBe(true)
    expect(zeile(z, 'date').breit).toBe(false)
  })
})

describe('kopfText', () => {
  it('schreibt nur gefuellte Felder als „Label=Wert", ohne die ausgenommenen', () => {
    const z = kopfZeilen(typ('310'), rec({ traineeName: 'Sophie Berger', aircraftType: 'CL30', date: '2026-11-01', dueDate: '2026-12-15' }, []), label)
    expect(kopfText(z, ['traineeName', 'aircraftType', 'date'])).toBe('Due Date=15.12.2026')
    expect(kopfText(z)).toBe('Pilot / Student Name=Sophie Berger | Aircraft Type=CL30 | Date=01.11.2026 | Due Date=15.12.2026')
  })
})
