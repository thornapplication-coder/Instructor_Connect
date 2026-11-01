import { describe, expect, it } from 'vitest'
import { datumFinden, metaErkennen, nummerFinden, revisionFinden, titelFinden, typFinden } from './meta'

describe('Datum', () => {
  it('erkennt ISO, DD.MM.YYYY und ausgeschriebene Monate (de/en)', () => {
    expect(datumFinden('Issued 2026-03-01')).toBe('2026-03-01')
    expect(datumFinden('Datum: 1.3.2026')).toBe('2026-03-01')
    expect(datumFinden('Effective 01 March 2026')).toBe('2026-03-01')
    expect(datumFinden('01-Mar-2026')).toBe('2026-03-01')
    expect(datumFinden('15. Jänner 2026')).toBeUndefined() // Punkt nach dem Tag: kein Muster
    expect(datumFinden('15 Jänner 2026')).toBe('2026-01-15')
    expect(datumFinden('March 1, 2026')).toBe('2026-03-01')
  })

  it('nimmt das erste gültige Datum und verwirft unmögliche', () => {
    expect(datumFinden('31.02.2026 then 2026-04-02')).toBe('2026-04-02')
    expect(datumFinden('99.99.2026')).toBeUndefined()
  })

  it('erkennt bewusst KEIN mehrdeutiges 03/04/2026', () => {
    expect(datumFinden('Date 03/04/2026')).toBeUndefined()
  })
})

describe('Revision', () => {
  it('behält das Schlüsselwort und kombiniert Edition und Revision', () => {
    expect(revisionFinden('Rev. 0.0')).toBe('Rev 0.0')
    expect(revisionFinden('Revision 3')).toBe('Revision 3')
    expect(revisionFinden('Edition 1')).toBe('Edition 1')
    expect(revisionFinden('Issue 3')).toBe('Issue 3')
    expect(revisionFinden('Ed. 2, Rev. 1')).toBe('Edition 2 Rev 1')
    expect(revisionFinden('Revision No.: 12')).toBe('Revision 12')
    expect(revisionFinden('Rev C')).toBe('Rev C')
    // EASA-Revisionen tragen Jahr und Monat — gefunden beim Browsertest.
    expect(revisionFinden('Revision 2026-07')).toBe('Revision 2026-07')
  })

  it('kein Treffer in Fließtext ohne Revisionsangabe', () => {
    expect(revisionFinden('the review process')).toBeUndefined()
    expect(revisionFinden('Revised procedures')).toBeUndefined()
  })
})

describe('Nummer, Titel, Typ', () => {
  it('Dokumentnummer nach üblichem Schlüsselwort', () => {
    expect(nummerFinden('Doc No.: SBX-PLM-300')).toBe('SBX-PLM-300')
    expect(nummerFinden('P/N 190-02178-01')).toBe('190-02178-01')
    expect(nummerFinden('no number here')).toBeUndefined()
  })

  it('Titel: bevorzugt eine Zeile mit Handbuch-Wort, ohne Revision/Datum/Nummer', () => {
    expect(titelFinden(['AVIATION ACADEMY', 'Rev. 2.0', 'Pilot Learning Manual CL30'])).toBe('Pilot Learning Manual CL30')
    expect(titelFinden(['Short', 'Some cover heading'])).toBe('Some cover heading')
    expect(titelFinden([])).toBeUndefined()
    expect(titelFinden(['Contents', '4 Normal Procedures 5', '5 Abnormal Procedures ..... 7', 'Training Manual CL30'])).toBe('Training Manual CL30')
  })

  it('Typ aus dem Titel', () => {
    expect(typFinden('Pilot Learning Manual')).toBe('PLM')
    expect(typFinden('Operations Manual Part A')).toBe('OM')
    expect(typFinden('Airplane Flight Manual')).toBe('AFM')
    expect(typFinden('Garmin G3000 Pilot’s Guide')).toBe('AVIONICS')
    expect(typFinden('Easy Access Rules for Part-ORA')).toBe('IR')
    expect(typFinden('Kochbuch')).toBeUndefined()
  })
})

describe('metaErkennen (Abnahme Phase 2: Revision und Datum eines Beispiel-Manuals)', () => {
  it('liest das Deckblatt eines synthetischen Manuals', () => {
    const deckblatt = ['AVIATION ACADEMY AUSTRIA', 'Pilot Learning Manual CL30', 'Doc No.: SBX-PLM-300', 'Edition 1, Rev. 0.0', 'Effective 01 March 2026'].join('\n')
    expect(metaErkennen([deckblatt])).toEqual({ titel: 'Pilot Learning Manual CL30', nummer: 'SBX-PLM-300', revision: 'Edition 1 Rev 0.0', datum: '2026-03-01', typ: 'PLM' })
  })

  it('Dokumenteigenschaften gehen vor', () => {
    const m = metaErkennen(['Rev. 1'], { title: 'Training Manual', revision: 'Rev 5', docNumber: 'TM-1' })
    expect([m.titel, m.revision, m.nummer, m.typ]).toEqual(['Training Manual', 'Rev 5', 'TM-1', 'TM'])
  })

  it('Typ nach dem Titel, nicht nach Erwähnungen im Text (Browsertest: EASA-Auszug als „TM")', () => {
    const m = metaErkennen(['Easy Access Rules for Part-ORA\nRevision 2026-07', 'ORA.ATO.230 Training manual'])
    expect([m.typ, m.revision]).toEqual(['IR', 'Revision 2026-07'])
    expect(metaErkennen(['Cover\nOperations Manual reference']).typ).toBe('OM')
  })

  it('leere Eingabe ergibt leere Felder statt geratener', () => {
    expect(metaErkennen([])).toEqual({ titel: undefined, nummer: undefined, revision: undefined, datum: undefined, typ: undefined })
  })
})
