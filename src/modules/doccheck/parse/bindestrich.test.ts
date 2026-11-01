import { describe, expect, it } from 'vitest'
import { bindestrichWoerter, zeilenVerbinden } from './bindestrich'

describe('Silbentrennung (Spez. 7.2, Kap. 17: „goaround")', () => {
  it('echtes Bindestrichwort bleibt, wenn es im Dokument auch ohne Umbruch vorkommt', () => {
    const echte = bindestrichWoerter(['Perform a go-around if unstable.'])
    expect(zeilenVerbinden(['Initiate the go-', 'around immediately.'], echte)).toBe('Initiate the go-around immediately.')
  })

  it('Silbentrennung wird zusammengezogen', () => {
    expect(zeilenVerbinden(['Check the hy-', 'draulic pressure.'], new Set())).toBe('Check the hydraulic pressure.')
  })

  it('kein Zusammenziehen bei großem oder numerischem Anschluss', () => {
    expect(zeilenVerbinden(['Climb to FL-', '200 now.'], new Set())).toBe('Climb to FL-\n200 now.')
    expect(zeilenVerbinden(['See ATR-', 'Liste.'], new Set())).toBe('See ATR-\nListe.')
  })

  it('übersteht mehrfache Trennung hintereinander', () => {
    expect(zeilenVerbinden(['an-', 'ti-', 'ice on'], new Set())).toBe('antiice on')
  })

  it('normale Zeilenumbrüche bleiben erhalten', () => {
    expect(zeilenVerbinden(['eins', 'zwei'], new Set())).toBe('eins\nzwei')
  })

  it('sammelt nur Bindestrichwörter innerhalb von Zeilen, kleingeschrieben', () => {
    expect([...bindestrichWoerter(['A Go-Around and a take-off', 'end-'])].sort()).toEqual(['go-around', 'take-off'])
  })
})
