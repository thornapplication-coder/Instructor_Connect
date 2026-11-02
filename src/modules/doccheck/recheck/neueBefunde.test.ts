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

  it('Auszug „<Treffer> — <Kontext>": dieselbe Stelle trotz anders geschnittenem Rest (Audit 11/2026, DC-04)', () => {
    // Paar aus SBX-PKG-01 (APX 4) und SBX-FL-01 Nr. 11 „Delete TBD": vorher false → „Neue Findings" Nr. 21 doppelte den offenen Altbefund
    const rest = [erg([{ dokId: 'APX 4', auszug: '…a/c is prepared by the crew. Duration: TBD. 2 Line Check See TM chapter 2.1.' }])]
    expect(istRest('APX 4', 'TBD — The a/c is prepared by the crew. Duration: TBD.', rest)).toBe(true)
    // gleicher Treffer in einem anderen Absatz: andere Umgebung, also ein eigener Mangel
    expect(istRest('APX 4', 'TBD — Battery limits: TBD.', rest)).toBe(false)
    expect(istRest('APX 4', 'TBD — Weight and balance figures: TBD pending.', rest)).toBe(false)
    // Treffer, der im Rest gar nicht steht, ist nie derselbe Mangel — auch bei gleichem Satz
    expect(istRest('APX 4', 'XXX — The a/c is prepared by the crew. Duration: XXX.', rest)).toBe(false)
    // anderes Dokument
    expect(istRest('TM', 'TBD — The a/c is prepared by the crew. Duration: TBD.', rest)).toBe(false)
    // kurzer Kontext: 80 % des kürzeren genügen
    expect(istRest('APX 4', 'TBD — Duration: TBD.', rest)).toBe(true)
  })

  it('verankert zählt nur DERSELBE beanstandete Text — ein anderer Mangel im selben Satz bleibt neu (Gegenprüfung Audit 11/2026, DC-04)', () => {
    // Rest des alten Befunds „Delete TBD": gesucht war „TBD"
    const rest = [{ ...erg([{ dokId: 'APX 4', auszug: '…a/c is prepared by the the crew. Duration: TBD. 2 Line Check See TM chapter 2.1.' }]) }]
    rest[0].rest[0].text = 'TBD'
    expect(istRest('APX 4', 'TBD — The a/c is prepared by the the crew. Duration: TBD.', rest)).toBe(true)
    // Doppelwort im selben Satz: gleiche Umgebung, aber ein anderer Mangel — vorher als Dublette verschluckt
    expect(istRest('APX 4', 'the the — The a/c is prepared by the the crew. Duration: TBD.', rest)).toBe(false)
    // Längerer oder kürzerer beanstandeter Text desselben Mangels zählt
    rest[0].rest[0].text = 'Duration: TBD'
    expect(istRest('APX 4', 'TBD — The a/c is prepared by the the crew. Duration: TBD.', rest)).toBe(true)
  })

  it('Auszug, dessen Treffer nicht im Kontext steht (Word-Check „Text — Art"): Stücke einzeln, Ganzes auch', () => {
    const rest = [erg([{ dokId: 'w', auszug: '…Visible text. hidden remark Placeholder [TBD]…' }])]
    expect(istRest('w', 'hidden remark — hidden text (auto on unknown background)', rest)).toBe(true)
    expect(istRest('w', 'other words — hidden text (auto on unknown background)', rest)).toBe(false)
    // Gedankenstrich im Fließtext: Das Ganze überlappt
    const satz = [erg([{ dokId: 'w', auszug: 'The crew — PF and PM — complete the checklist before engine start.' }])]
    expect(istRest('w', 'The crew — PF and PM — complete the checklist', satz)).toBe(true)
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
    expect(dokumentWert('apx', { 'APPENDIX 4': { art: 'dok', ids: ['apx'] } }, 'Appendix 4 Line Training')).toBe('APPENDIX 4')
    // Ein Wert für zwei Dokumente nennt keines davon (DC-05) — bis 11/2026 stand hier 'APPENDIX 4'
    expect(dokumentWert('apx', { 'APPENDIX 4': { art: 'dok', ids: ['x', 'apx'] } }, 'Appendix 4 Line Training')).toBe('Appendix 4 Line Training')
    expect(dokumentWert('apx', { OSD: { art: 'fehlt' } }, 'Appendix 4')).toBe('Appendix 4')
  })

  it('ein Wert, der auf mehrere Dokumente zeigt, nennt keines davon — sonst das Paketkürzel (Audit 11/2026, DC-05)', () => {
    // vorher: „TM" für den Befund in APX 4, weil „TM" auch auf APX 4 zeigte
    const ziele = { TM: { art: 'dok' as const, ids: ['apx', 'tm'] }, 'APX 4': { art: 'dok' as const, ids: ['apx'] } }
    expect(dokumentWert('apx', ziele, 'APX 4')).toBe('APX 4')
    expect(dokumentWert('tm', ziele, 'TM')).toBe('TM')
    expect(dokumentWert('tm', ziele, 'SBX-PKG-01 Training Manual R0.1')).toBe('SBX-PKG-01 Training Manual R0.1')
    // zwei Schreibweisen für genau dieses Dokument: die erste der Liste
    expect(dokumentWert('apx', { 'APX 4': { art: 'dok', ids: ['apx'] }, 'APPENDIX 4': { art: 'dok', ids: ['apx'] } }, 'x')).toBe('APX 4')
    // neueBefundeFuer: ohne passenden Listenwert das Kürzel, ohne Kürzel der Titel
    const r = neueBefundeFuer([b('F-1', 'High', 'anx', 'Total 16:00'), b('F-2', 'High', 'om', 'Total 17:00')], [], ['1'], ziele, { anx: 'ANX 2B' })
    expect(r.liste.map((n) => n.dokument)).toEqual(['ANX 2B', 'OM'])
  })
})
