import { describe, expect, it } from 'vitest'
import { rohZeilen, seitenZeilen, type TextStueck } from './zeilen'

const s = (str: string, x: number, y: number, w = str.length * 5, h = 10): TextStueck => ({ str, x, y, w, h })

describe('Zeilenaufbau aus PDF-Textstücken (Spez. 7.2)', () => {
  it('ordnet von oben nach unten, links nach rechts — unabhängig von der Lieferreihenfolge', () => {
    expect(seitenZeilen([s('zweite', 60, 700), s('erste', 60, 714), s('Zeile', 95, 700)])).toEqual(['erste', 'zweite Zeile'])
  })

  it('setzt Leerzeichen nur bei echter Lücke, nicht zwischen Silben eines Stücks', () => {
    expect(seitenZeilen([s('go', 60, 700, 10), s('-around', 70, 700, 35)])).toEqual(['go-around'])
    expect(seitenZeilen([s('go', 60, 700, 10), s('around', 75, 700, 30)])).toEqual(['go around'])
  })

  it('hält hochgestellte Zeichen in ihrer Zeile', () => {
    expect(seitenZeilen([s('10', 60, 700, 10), s('3', 71, 704, 4, 6), s('ft', 78, 700, 10)])).toEqual(['10 3 ft'])
  })

  it('trennt eine Abbildungsbeschriftung vom Fließtext statt sie hineinzumischen (Kap. 17: „or or")', () => {
    const z = seitenZeilen([s('Select flaps or', 60, 700, 75), s('or', 400, 700, 10), s('use the checklist', 60, 686, 85)])
    expect(z).toEqual(['Select flaps or | or', 'use the checklist'])
    expect(z.join(' ')).not.toMatch(/or or/)
  })

  it('liest zweispaltigen Satz Spalte für Spalte', () => {
    const stuecke: TextStueck[] = []
    for (let i = 0; i < 8; i++) {
      stuecke.push(s(`links ${i}`, 60, 700 - i * 14, 40))
      stuecke.push(s(`rechts ${i}`, 320, 700 - i * 14, 40))
    }
    const z = seitenZeilen(stuecke)
    expect(z.slice(0, 8).every((x) => x.startsWith('links'))).toBe(true)
    expect(z.slice(8).every((x) => x.startsWith('rechts'))).toBe(true)
  })

  it('ignoriert leere Stücke und leere Seiten', () => {
    expect(seitenZeilen([s('  ', 60, 700)])).toEqual([])
    expect(rohZeilen([])).toEqual([])
  })
})
