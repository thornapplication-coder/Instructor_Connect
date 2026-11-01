import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument } from '../parse/model'
import { REGELN } from './kontext'
import { familie, regelIndex, regelwerkPruefung, verweisPruefen, zerlegen } from './regelwerk'

const quelle = (titel: string, text: string) => ({ titel, pages: [{ index: 1, text }] })
const EAR = quelle('EAR', [
  'FCL.725 Requirements (synthetic)',
  '(a) Training.',
  '(1) Course.',
  '(i) Theory.',
  '(ii) Practice.',
  '(2) Test.',
  '(b) Other.',
  '(i) Letter i, not roman — no number before.',
  'AMC1 FCL.725 Guidance',
  'Text that mentions FCL.999 does not define it.',
  // v1.1-Erkennung: CS nur als ganzes Regelwerk („CS-FCD"), nicht je Artikel
  'CS-FCD Scope',
  'FCL.010 Definitions',
  'No paragraphs here.',
].join('\n'))

describe('Regel-IDs zerlegen', () => {
  it('Art, Basis, Absätze und Familie', () => {
    expect(zerlegen('AMC1 ORA.ATO.230(a)(1)')).toEqual({ art: 'AMC1', basis: 'ORA.ATO.230', absaetze: ['(a)', '(1)'], text: 'AMC1 ORA.ATO.230(a)(1)' })
    expect(zerlegen('FCL.725')).toMatchObject({ art: '', basis: 'FCL.725', absaetze: [] })
    expect([familie('ORA.ATO.125'), familie('FCL.725'), familie('MED.B.001'), familie('CS-FCD.100'), familie('CS-FSTD(A).300'), familie('FCL.740.A'), familie('CAT.OP.MPA.150'), familie('FCL.1015'), familie('CS-25.1309')]).toEqual(['ORA.ATO', 'FCL', 'MED.B', 'CS-FCD', 'CS-FSTD', 'FCL', 'CAT.OP.MPA', 'FCL', 'CS-25'])
  })
})

describe('Index (N8)', () => {
  it('nur Überschriften definieren; Absätze (a) → (1) → (i); (i) ohne Ziffer davor ist ein Buchstabe', () => {
    const i = regelIndex([EAR])
    expect([...i.eintraege.keys()].sort()).toEqual(['AMC1 FCL.725', 'CS-FCD', 'FCL.010', 'FCL.725'])
    expect([...i.eintraege.get('FCL.725')!.absaetze].sort()).toEqual(['(a)', '(a)(1)', '(a)(1)(i)', '(a)(1)(ii)', '(a)(2)', '(b)', '(i)'])
    expect([...i.familien].sort()).toEqual(['CS-FCD', 'FCL'])
    expect(i.quellen).toEqual(['EAR'])
  })

  it('Prüfung je Verweis', () => {
    const i = regelIndex([EAR])
    expect(verweisPruefen('FCL.725(a)(1)(ii)', i)).toEqual({ status: 'verified' })
    expect(verweisPruefen('FCL.725(c)', i)).toEqual({ status: 'absatz', vorhanden: ['(a)', '(b)', '(i)'] })
    // Regel ohne erfasste Absätze: weder belegt noch widerlegt — nicht „verified"
    expect(verweisPruefen('FCL.010(a)', i)).toEqual({ status: 'unbelegt' })
    expect(verweisPruefen('FCL.999', i)).toEqual({ status: 'fehlt', naechste: expect.stringMatching(/^FCL\./) })
    expect(verweisPruefen('GM1 FCL.725', i)).toEqual({ status: 'fehlt', naechste: undefined })
    expect(verweisPruefen('MED.B.001', i)).toEqual({ status: 'quelle' })
  })
})

describe('Prüfung je Dokument', () => {
  const roh = (text: string): Rohdokument => ({ format: 'docx', pages: [{ index: 1, label: 'S. 1', text }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0 })
  const k = (text: string) => ({ dokId: 'd', dokName: 'D', roh: roh(text), meta: {}, regeln: REGELN })

  it('dieselbe falsche ID einmal, mit allen Fundstellen; fehlende Quellen je Familie zusammengefasst', () => {
    const r = regelwerkPruefung(k('See FCL.999.\nAgain FCL.999.\nMED.B.001 and MED.B.002.\nFCL.725(a) ok.'), regelIndex([EAR]))
    expect(r.befunde.map((b) => [b.pruefpunkt, b.fundstellen.length, b.verifizierung])).toEqual([
      ['regelids', 2, 'To verify'],
      ['quelle', 2, 'To verify – source not in library'],
    ])
    expect(r.befunde[1].text).toBe('2 rule references to MED.B cannot be verified: source not in library.')
    expect(r.stand).toEqual({ quellen: ['EAR'], verweise: 5, verifiziert: 1, nichtWiderlegbar: 0, zuPruefen: 2, ohneQuelle: 2 })
    expect(r.ampel).toEqual({ regelids: 'wait', absaetze: 'ok', quelle: 'wait' })
  })

  it('ohne Regelwerk: nicht anwendbar; ein einzelner Verweis ohne Quelle im Singular', () => {
    expect(regelwerkPruefung(k('FCL.725'), regelIndex([])).ampel).toEqual({ regelids: 'na', absaetze: 'na', quelle: 'na' })
    expect(regelwerkPruefung(k('ORA.ATO.125'), regelIndex([EAR])).befunde[0].text).toBe('1 rule reference to ORA.ATO cannot be verified: source not in library.')
    // Regel ohne erfasste Absätze: kein Befund, aber auch nicht als verifiziert gezählt
    const ohne = regelwerkPruefung(k('Rule FCL.725(c).'), regelIndex([quelle('X', 'FCL.725 T\nnothing')]))
    expect(ohne.befunde).toEqual([])
    expect(ohne.stand).toMatchObject({ verifiziert: 0, nichtWiderlegbar: 1 })
    expect(regelwerkPruefung(k('See CS-FCD.'), regelIndex([EAR])).stand.verifiziert).toBe(1)
  })

  it('Absatzmarke allein auf der Zeile (PDF-Auszug); (i) nach (h)(2) gilt in beiden Lesarten (Fachprüfung 01.11.2026)', () => {
    const i = regelIndex([quelle('PDF', 'ORA.ATO.125 T\n(a)\nText\n(b)\nText')])
    expect([...i.eintraege.get('ORA.ATO.125')!.absaetze].sort()).toEqual(['(a)', '(b)'])
    expect(verweisPruefen('ORA.ATO.125(z)', i)).toMatchObject({ status: 'absatz' })
    const h = regelIndex([quelle('X', 'FCL.900 T\n(h) H\n(1) eins\n(2) zwei\n(i) i — Buchstabe oder römisch?')])
    expect(verweisPruefen('FCL.900(i)', h)).toEqual({ status: 'verified' })
    expect(verweisPruefen('FCL.900(h)(2)(i)', h)).toEqual({ status: 'verified' })
  })
})

