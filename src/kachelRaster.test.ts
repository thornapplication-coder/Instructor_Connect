import { describe, expect, it } from 'vitest'
import { rasterKlasse, rasterSpalten } from './kachelRaster'

/**
 * Kachelraster ohne Waise (Audit 11/2026, UID-09): Neun Kacheln in vier
 * Spalten liessen „Changelog" allein in der dritten Reihe stehen.
 */

/** Wie viele Kacheln stehen in der letzten Reihe, wie viele in einer vollen? */
const letzteReihe = (n: number) => {
  const c = rasterSpalten(n)
  return { voll: c, letzte: n % c === 0 ? c : n % c, reihen: Math.ceil(n / c) }
}

describe('rasterSpalten', () => {
  it('neun Bereiche des Superadmins: 3 × 3 statt 4 + 4 + 1', () => {
    expect(rasterSpalten(9)).toBe(3)
    expect(rasterKlasse(9)).toBe('grid-cols-3')
  })

  it('bis vier Kacheln eine Reihe in der gewohnten Breite (Gruppenadmin 2, Training Admin 1)', () => {
    for (const n of [1, 2, 3, 4]) expect(rasterSpalten(n)).toBe(4)
  })

  it('keine Anzahl bis 20 laesst eine Kachel allein in einer Reihe unter vollen Reihen', () => {
    for (let n = 1; n <= 20; n++) {
      const { voll, letzte, reihen } = letzteReihe(n)
      if (reihen > 1) expect(letzte, `${n} Kacheln`).toBeGreaterThanOrEqual(voll - 1)
    }
  })

  it('bevorzugt vier Spalten, wo sie aufgehen', () => {
    expect(rasterSpalten(8)).toBe(4)
    expect(rasterSpalten(7)).toBe(4) // 4 + 3
    expect(rasterSpalten(6)).toBe(3) // 3 + 3 statt 4 + 2
    expect(rasterSpalten(10)).toBe(5) // 5 + 5 statt 4 + 4 + 2
    expect(rasterSpalten(13)).toBe(2) // weder 4, 3 noch 5 geht ohne Waise auf
  })

  it('liefert fuer jede Zahl eine wirklich vorhandene Klasse', () => {
    for (let n = 1; n <= 40; n++) expect(rasterKlasse(n)).toMatch(/^grid-cols-[2-5]$/)
  })
})
