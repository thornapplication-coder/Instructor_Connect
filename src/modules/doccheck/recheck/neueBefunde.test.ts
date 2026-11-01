import { describe, expect, it } from 'vitest'
import type { Befund } from '../pruefung/befund'
import type { ReErgebnis } from './pruefen'
import { dokumentWert, istRest, naechsteNummern, neueBefundeFuer } from './neueBefunde'

const b = (id: string, prio: Befund['prioritaet'], dokId: string, auszug: string, x: Partial<Befund> = {}): Befund => ({
  id, quelle: 'formal', pruefpunkt: 'p', kategorie: 'Editorial', prioritaet: prio, dokId, dokName: dokId.toUpperCase(), text: `T ${id}`,
  fundstellen: auszug ? [{ seite: 'S. 2', ort: '1.4 Briefing', auszug }] : [], verifizierung: 'Verified (rule-based)', status: 'Open', ...x,
})
const erg = (rest: { dokId: string; auszug: string }[]): ReErgebnis => ({ rest: rest.map((r) => ({ ...r, dok: '', kapitel: '', seite: '', index: 1 })) }) as unknown as ReErgebnis

describe('Nummerierung neuer Befunde (N3.1 Schritt 6, Kap. 13.3)', () => {
  it('im Anschluss an die höchste Nummer, im Format der Liste', () => {
    expect(naechsteNummern(['1', '20', '3'], 2)).toEqual(['21', '22'])
    expect(naechsteNummern(['F-007', 'F-012', 'F-3'], 2)).toEqual(['F-013', 'F-014'])
    expect(naechsteNummern(['TM 7', 'APX 2'], 1)).toEqual(['TM 8'])
    expect(naechsteNummern(['F-099'], 2)).toEqual(['F-100', 'F-101'])
    // ohne Nummern (nur Ersatz „#Zeile") beginnt die Zählung bei 1
    expect(naechsteNummern(['#5', 'abc', ''], 2)).toEqual(['1', '2'])
    expect(naechsteNummern([], 0)).toEqual([])
  })
})

describe('Dublettenregel (N3.4, N10.3)', () => {
  const e = [erg([{ dokId: 'tm', auszug: 'The PF shall call out the deviation.' }])]
  it('Restfundstelle eines alten Befunds ist kein neuer Befund — in beiden Richtungen enthalten, nur im selben Dokument', () => {
    expect(istRest('tm', 'call out the deviation', e)).toBe(true)
    expect(istRest('tm', 'Note: The PF shall call out the deviation. See 2.1', e)).toBe(true)
    expect(istRest('apx', 'call out the deviation', e)).toBe(false)
    expect(istRest('tm', 'PF', e)).toBe(false)
    expect(istRest('tm', '', e)).toBe(false)
    expect(istRest('tm', 'x', [erg([{ dokId: 'tm', auszug: 'x' }])])).toBe(false)
  })

  it('ausgenommen, wenn ALLE Fundstellen Reste sind; sonst bleibt er mit der ersten eigenen Fundstelle', () => {
    const r = neueBefundeFuer(
      [
        b('F-01', 'Low', 'tm', 'call out the deviation'),
        b('F-02', 'High', 'apx', 'Total 16:00'),
        b('F-03', 'Medium', 'tm', '', { fundstellen: [{ auszug: 'call out the deviation' }, { seite: 'S. 9', auszug: 'Placeholder XX' }] }),
        b('F-04', 'High', 'tm', ''),
      ],
      e,
      ['1', '20'],
      { 'APX 4': { art: 'dok', ids: ['apx'] }, Schreibweise: { art: 'paket' } },
    )
    expect(r.ausgenommen).toBe(1)
    // Hoch zuerst, dann nach Dokumentname; Nummern ab 21
    expect(r.liste.map((n) => [n.nr, n.befund, n.dokument, n.seite, n.kapitel])).toEqual([
      ['21', 'T F-02', 'APX 4', 'S. 2', '1.4 Briefing'],
      ['22', 'T F-04', 'TM', '', ''],
      ['23', 'T F-03', 'TM', 'S. 9', ''],
    ])
    expect(r.liste[0]).toMatchObject({ prioritaet: 'High', kategorie: 'Editorial', verifizierung: 'Verified (rule-based)', dokId: 'apx' })
  })

  it('Dokumentname so, wie die Liste ihn führt; sonst der Name in DocCheck', () => {
    expect(dokumentWert('apx', { 'APPENDIX 4': { art: 'dok', ids: ['x', 'apx'] } }, 'Appendix 4 Line Training')).toBe('APPENDIX 4')
    expect(dokumentWert('apx', { OSD: { art: 'fehlt' } }, 'Appendix 4')).toBe('Appendix 4')
  })
})
