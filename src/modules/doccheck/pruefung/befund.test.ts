import { describe, expect, it } from 'vitest'
import { ampelAus, gate, idsVergeben, sortieren, type Befund } from './befund'

const b = (p: Partial<Befund>): Befund => ({
  id: 'x', quelle: 'formal', pruefpunkt: 'reste', kategorie: 'Editorial', prioritaet: 'Low', dokId: 'd', dokName: 'A', text: 't', fundstellen: [], verifizierung: 'Verified (rule-based)', status: 'Open', ...p,
})

describe('Befunde', () => {
  it('sortiert nach Priorität, dann Dokument, dann Prüfpunkt', () => {
    const s = sortieren([b({ prioritaet: 'Low', dokName: 'A' }), b({ prioritaet: 'High', dokName: 'B' }), b({ prioritaet: 'Medium', dokName: 'A', pruefpunkt: 'z' }), b({ prioritaet: 'Medium', dokName: 'A', pruefpunkt: 'a' })])
    expect(s.map((x) => [x.prioritaet, x.pruefpunkt])).toEqual([['High', 'reste'], ['Medium', 'a'], ['Medium', 'z'], ['Low', 'reste']])
  })

  it('Ampel: Hoch → rot, sonst gelb, ohne Befund grün, nicht anwendbar grau', () => {
    expect(ampelAus(['reste', 'lep', 'toc', 'nr'], [b({ prioritaet: 'High' }), b({ pruefpunkt: 'lep' })], ['nr'])).toEqual({ reste: 'bad', lep: 'wait', toc: 'ok', nr: 'na' })
  })

  it('IDs je Quelle fortlaufend und lesbar', () => {
    const { id: _i, ...ohne } = b({})
    void _i
    expect(idsVergeben([ohne, { ...ohne, quelle: 'word' }, ohne, { ...ohne, quelle: 'sprache' }]).map((x) => x.id)).toEqual(['F-01', 'W-01', 'F-02', 'L-01'])
  })

  it('Gate (N4.3): warnt ab Werk, sperrt nur, wenn eingestellt', () => {
    expect(gate([b({ prioritaet: 'High' })], false)).toEqual({ einreichungsfaehig: false, hoch: 1, gesperrt: false })
    expect(gate([b({ prioritaet: 'High' })], true).gesperrt).toBe(true)
    expect(gate([b({})], true)).toEqual({ einreichungsfaehig: true, hoch: 0, gesperrt: false })
  })
})
