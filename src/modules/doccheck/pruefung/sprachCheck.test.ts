import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument } from '../parse/model'
import { REGELN } from './kontext'
import { SPRACH_PUNKTE, sprachCheck } from './sprachCheck'

const roh = (text: string): Rohdokument => ({ format: 'pdf', pages: [{ index: 1, label: '3', text }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0 })
const pruefe = (text: string) => sprachCheck({ dokId: 'd', dokName: 'D', roh: roh(text), meta: {}, regeln: REGELN })

describe('Sprache und Platzhalter — Grenzfälle', () => {
  it('fremdsprachiger Absatz ohne Arbeitsauftrag ist Mittel; Seite wird genannt', () => {
    const r = pruefe('The pilot shall check the system and the crew is in the aircraft.\nThe instructor will brief the trainee on all items of the lesson.\nDie Besatzung ist mit dem Flugzeug vertraut und kennt die Verfahren.')
    const b = r.befunde.find((x) => x.pruefpunkt === 'fremdsprache')!
    expect(b.prioritaet).toBe('Medium')
    expect(b.fundstellen[0].seite).toBe('3')
  })

  it('ohne erkennbare Dokumentsprache: Sprachprüfung nicht anwendbar, Platzhalter trotzdem', () => {
    const r = pruefe('VMO 320\nAT-FFS-nnnn')
    expect(r.sprache).toBeNull()
    expect(r.ampel).toEqual({ fremdsprache: 'na', einschuebe: 'na', platzhalter: 'wait' })
    expect(Object.keys(r.ampel)).toEqual([...SPRACH_PUNKTE])
  })

  it('Zitat in Landessprache wird nicht gemeldet', () => {
    const r = pruefe('The pilot shall check the system and the crew is in the aircraft.\n„Bitte nicht berühren und nicht entfernen, das ist wichtig“')
    expect(r.befunde.filter((b) => b.pruefpunkt === 'fremdsprache')).toEqual([])
  })
})
