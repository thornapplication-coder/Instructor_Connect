import { describe, expect, it } from 'vitest'
import { kopfFussEntfernen, muster, seitenLabel } from './kopfFuss'

const seite = (n: number, inhalt: string[]) => ['SBX PLM CL30 | Rev 2.0', ...inhalt, `Rev 2.0 | 6-04-15 Page ${n} | 01.03.2026`]

describe('Kopf- und Fußzeilen (Spez. 7.2)', () => {
  it('entfernt Zeilen, die auf mehr als 60 % der Seiten wiederkehren — auch mit wechselnder Seitenzahl', () => {
    const seiten = [1, 2, 3, 4, 5].map((n) => seite(n, [`Inhalt ${n}`]))
    const r = kopfFussEntfernen(seiten)
    expect(r.seiten).toEqual([1, 2, 3, 4, 5].map((n) => [`Inhalt ${n}`]))
  })

  it('übernimmt die gedruckte Seitenbezeichnung, ohne Revision und Datum', () => {
    const r = kopfFussEntfernen([1, 2, 3].map((n) => seite(n, [`x${n}`])))
    expect(r.labels).toEqual(['6-04-15 Page 1', '6-04-15 Page 2', '6-04-15 Page 3'])
    expect(r.rand[1]).toEqual(['SBX PLM CL30 | Rev 2.0', 'Rev 2.0 | 6-04-15 Page 2 | 01.03.2026'])
  })

  it('lässt Inhaltszeilen stehen, die sich nur in einer Zahl unterscheiden („Step 1", „Step 2")', () => {
    const seiten = [1, 2, 3, 4].map((n) => [`Step ${n} check`, `x${n}`])
    expect(kopfFussEntfernen(seiten).seiten).toEqual(seiten)
  })

  it('reine Seitenzahl „- 12 -" gilt als Rahmen', () => {
    const r = kopfFussEntfernen([1, 2, 3].map((n) => [`a${'q'.repeat(n)}`, `- ${n} -`]))
    expect(r.seiten).toEqual([['aq'], ['aqq'], ['aqqq']])
  })

  it('lässt Inhalt stehen, der nur auf wenigen Seiten wiederkehrt', () => {
    const seiten = [['WARNING', 'a'], ['WARNING', 'b'], ['c'], ['d'], ['e']]
    expect(kopfFussEntfernen(seiten).seiten).toEqual(seiten)
  })

  it('entfernt nur am Rand — dieselbe Zeile mitten im Text bleibt', () => {
    const lang = (n: number) => ['KOPF', `a${'x'.repeat(n)}`, `b${'y'.repeat(n)}`, 'c', 'KOPF', 'd', `e${'z'.repeat(n)}`, `f${'w'.repeat(n)}`, `Seite ${n}`]
    const r = kopfFussEntfernen([1, 2, 3].map(lang))
    expect(r.seiten[0]).toEqual(['ax', 'by', 'c', 'KOPF', 'd', 'ez', 'fw'])
    expect(r.labels[0]).toBe('Seite 1')
  })

  it('unter drei Seiten keine Erkennung — zu wenig, um „wiederkehrend" zu sagen', () => {
    const seiten = [['K', 'a'], ['K', 'b']]
    expect(kopfFussEntfernen(seiten)).toEqual({ seiten, labels: [undefined, undefined], entfernt: [], rand: [[], []] })
  })

  it('Seitenzahl ohne „Page" wird ebenfalls übernommen', () => {
    const r = kopfFussEntfernen([1, 2, 3].map((n) => ['x', `${n}`]))
    expect(r.labels).toEqual(['1', '2', '3'])
  })

  it('muster und seitenLabel', () => {
    expect(muster('Page 12  of 300')).toBe('page # of #')
    expect(seitenLabel('Rev 2 | 6-04-15 Page 2 | 01.03.2026')).toBe('6-04-15 Page 2')
    expect(seitenLabel('Chapter 2 | 14')).toBe('Chapter 2')
    expect(seitenLabel('ohne')).toBe('ohne')
  })
})
