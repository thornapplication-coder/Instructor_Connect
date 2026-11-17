import { describe, expect, it } from 'vitest'
import { rasterKlasse, rasterSpalten, startRasterKlasse, startSpalten } from './kachelRaster'

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

/**
 * Startseite (Audit 11/2026, UID-09, Teil Startseite): Neun Kacheln in vier
 * Spalten — „DocCheck" allein in Reihe 3 und unter der Falz.
 */
describe('startSpalten', () => {
  const STUFEN = ['telefon', 'tablet', 'desktop', 'flach'] as const

  it('Superadmin und Gruppenadmin (neun Kacheln): am Desktop 5 + 4, zwei Reihen', () => {
    expect(startSpalten(9, 'desktop')).toBe(5)
    expect(startSpalten(9, 'tablet')).toBe(3)
    expect(startSpalten(9, 'flach')).toBe(3) // 3 × 3 statt 4 + 4 + 1
    expect(startSpalten(9, 'telefon')).toBe(2)
  })

  it('Mitglied ohne DocCheck (acht) und mit nur sieben Modulen', () => {
    expect(startSpalten(8, 'desktop')).toBe(4)
    expect(startSpalten(7, 'desktop')).toBe(4)
    expect(startSpalten(7, 'tablet')).toBe(4) // 4 + 3 statt 3 + 3 + 1
  })

  it('Training Admin (ab Werk drei Kacheln mit DocCheck, ohne zwei): eine volle Reihe, kein leeres Feld daneben', () => {
    for (const stufe of ['tablet', 'desktop', 'flach'] as const) expect(startSpalten(3, stufe), stufe).toBe(3)
    expect(startSpalten(3, 'telefon')).toBe(2) // Telefon bleibt zweispaltig: 2 + 1
    for (const stufe of STUFEN) expect(startSpalten(2, stufe), stufe).toBe(2)
    for (const stufe of STUFEN) expect(startSpalten(1, stufe), stufe).toBe(1)
    expect(startSpalten(0, 'desktop')).toBe(1)
  })

  it('keine Kachelzahl bis 12 lässt auf einer Stufe eine Kachel allein unter vollen Reihen', () => {
    for (const stufe of STUFEN) {
      for (let n = 1; n <= 12; n++) {
        const c = startSpalten(n, stufe)
        const letzte = n % c === 0 ? c : n % c
        if (n > c) expect(letzte, `${stufe}: ${n} Kacheln in ${c} Spalten`).toBeGreaterThanOrEqual(c - 1)
        // Eine einzige Reihe ist immer voll.
        else expect(c, `${stufe}: ${n} Kacheln`).toBe(n)
      }
    }
  })

  it('am Desktop nie mehr als zwei Reihen bis zehn Kacheln — sonst rutscht die letzte unter die Falz', () => {
    for (let n = 1; n <= 10; n++) expect(Math.ceil(n / startSpalten(n, 'desktop')), `${n} Kacheln`).toBeLessThanOrEqual(2)
  })

  it('setzt die Klassen aller Stufen wörtlich zusammen — flach zuletzt', () => {
    expect(startRasterKlasse(9)).toBe('grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 short:grid-cols-3')
    expect(startRasterKlasse(2)).toBe('grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 short:grid-cols-2')
    for (let n = 1; n <= 12; n++) expect(startRasterKlasse(n)).toMatch(/^grid-cols-[12] sm:grid-cols-[1-4] lg:grid-cols-[1-5] short:grid-cols-[1-4]$/)
  })
})
