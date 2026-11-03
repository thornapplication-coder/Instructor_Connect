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

  it('hält hochgestellte Zeichen in ihrer Zeile — eine hochgestellte Ziffer bleibt Hochzahl (Gegenprüfung Audit 11/2026)', () => {
    // Vorher „10 3 ft": Die Zeile stimmte, die Hochzahl ging verloren.
    expect(seitenZeilen([s('10', 60, 700, 10), s('3', 71, 704, 4, 6), s('ft', 78, 700, 10)])).toEqual(['10 ³ ft'])
    // Fußnotenzeichen direkt an einer Regel: nicht „FCL.8101" (Maße wie im Word-PDF der Prüfer)
    expect(seitenZeilen([s('Die Ausbildung richtet sich nach FCL.810', 71, 698.7, 182.8, 11), s('1', 253.8, 702.8, 2.3, 6.4), s(' und ORA.ATO.230.', 256.2, 698.7, 80, 11)])).toEqual(['Die Ausbildung richtet sich nach FCL.810¹ und ORA.ATO.230.'])
    // Klein, aber nicht angehoben (Tiefstellung, kleinere Schrift in der Zeile) oder keine Ziffer: unverändert
    expect(seitenZeilen([s('H', 60, 700, 8, 10), s('2', 68, 698, 4, 6), s('O', 72, 700, 8, 10)])).toEqual(['H2O'])
    expect(seitenZeilen([s('the 1', 60, 700, 22, 10), s('st', 82, 703, 6, 6), s('flight', 90, 700, 25, 10)])).toEqual(['the 1st flight'])
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

  // Audit 11/2026, FRD-05: Spalten über eine senkrechte Lücke mit Fließtext auf
  // beiden Seiten — nicht über den Anteil zufällig gleicher Grundlinien.
  const KUERZEL = ['AMC', 'ATC', 'ATO', 'CFI', 'CRM', 'EASA', 'EU', 'FCL', 'FI', 'HT', 'METAR', 'ORA', 'PPL', 'QNH', 'SERA', 'TEM', 'VFR', 'VMC', 'VMO', 'WBT']
  const kopf = [s('Training Manual', 71, 804, 140), s('Edition 1 Revision 2', 451, 804, 88)]
  const fuss = (n: number) => [s('15.03.2026', 71, 31, 46), s(`Page ${n} of 13`, 487, 31, 52)]

  it('zweispaltige Abkürzungstabelle mit 20 Zeilen bleibt zeilenweise „ATO | Approved …"', () => {
    const z = seitenZeilen([
      ...kopf,
      s('List of Abbreviations', 71, 758, 119),
      ...KUERZEL.flatMap((k, i) => [s(k, 77, 741 - i * 13, k.length * 6), s(`${k === 'ATO' ? 'Approved Training Organisation' : `Meaning of ${k}`}`, 187, 741 - i * 13, 150)]),
      ...fuss(6),
    ])
    expect(z[0]).toBe('Training Manual | Edition 1 Revision 2')
    expect(z).toContain('ATO | Approved Training Organisation')
    expect(z[z.length - 1]).toBe('15.03.2026 | Page 6 of 13')
    expect(z).toHaveLength(KUERZEL.length + 3)
  })

  it('Tabelle mit Lücke in der Seitenmitte (Seite | Revision | Datum) bleibt ebenfalls Zeilen — die Zellen laufen nicht weiter', () => {
    const z = seitenZeilen([...kopf, ...Array.from({ length: 10 }, (_, i) => [s(String(i + 1), 80, 740 - i * 13, 10), s('2', 300, 740 - i * 13, 6), s('15.03.2026', 420, 740 - i * 13, 46)]).flat(), ...fuss(5)])
    expect(z.slice(1, 4)).toEqual(['1 | 2 | 15.03.2026', '2 | 2 | 15.03.2026', '3 | 2 | 15.03.2026'])
  })

  it('kurze Seite mit geteilter Kopf- und Fußzeile bleibt in Lesereihenfolge', () => {
    const z = seitenZeilen([...kopf, s('Highlights of Change', 71, 758, 119), s('Revision 2 contains the following changes:', 71, 741, 190), s('(a) Chapter 4 revised.', 71, 717, 120), s('(b) Chapter 5 clarified.', 71, 702, 120), ...fuss(4)])
    expect(z).toEqual(['Training Manual | Edition 1 Revision 2', 'Highlights of Change', 'Revision 2 contains the following changes:', '(a) Chapter 4 revised.', '(b) Chapter 5 clarified.', '15.03.2026 | Page 4 of 13'])
  })

  it('Zweispalter mit versetzten Grundlinien (12,5 / 13) wird Spalte für Spalte gelesen; Titel, Kopf und Fuß bleiben ganz', () => {
    const wort = ['the', 'crew', 'checks', 'each', 'item', 'before', 'start', 'and', 'after', 'landing']
    const stuecke: TextStueck[] = [...kopf, s('Safety Newsletter 2/2026', 193, 761, 210)]
    for (let i = 0; i < 20; i++) {
      stuecke.push(s(`${i === 0 ? 'Night' : wort[i % 10]} left ${i} text continues`, 63, 700 - i * 12.5, 215))
      stuecke.push(s(`${i === 0 ? 'Fuel' : wort[(i + 3) % 10]} right ${i} text continues`, 315, 700 - i * 13, 215))
    }
    stuecke.push(...fuss(1))
    const z = seitenZeilen(stuecke)
    expect(z.slice(0, 2)).toEqual(['Training Manual | Edition 1 Revision 2', 'Safety Newsletter 2/2026'])
    expect(z.slice(2, 22).every((x) => /\bleft\b/.test(x))).toBe(true)
    expect(z.slice(22, 42).every((x) => /\bright\b/.test(x))).toBe(true)
    expect(z[42]).toBe('15.03.2026 | Page 1 of 13')
  })

  it('Fließtext unter einem zweispaltigen Abschnitt: erst beide Spalten, dann die durchgehende Zeile', () => {
    const stuecke: TextStueck[] = []
    for (let i = 0; i < 8; i++) {
      stuecke.push(s(`links ${i} weiter`, 60, 700 - i * 14, 200))
      stuecke.push(s(`rechts ${i} weiter`, 320, 700 - i * 14, 200))
    }
    stuecke.push(s('Eine Zeile über die ganze Breite der Seite hinweg', 60, 580, 460), s('und noch eine', 60, 566, 80))
    const z = seitenZeilen(stuecke)
    expect(z.slice(-3)).toEqual(['rechts 7 weiter', 'Eine Zeile über die ganze Breite der Seite hinweg', 'und noch eine'])
  })

  it('kurzer Zweispalter unter durchgehender Kopf- und Fußzeile: Kopf und Fuß zählen bei der Spaltenlücke nicht mit', () => {
    // Sechs Rumpfzeilen, Kopf und Fuß über die ganze Breite: Zählten sie mit,
    // wäre die Lücke nur in 6 von 8 Zeilen frei (< 80 %) und die Spalten
    // würden zeilenweise gemischt (Gegenprüfung Audit 11/2026, FRD-05).
    const stuecke: TextStueck[] = [s('Training Manual Chapter 3 Edition 1 Revision 2', 60, 760, 400)]
    for (let i = 0; i < 6; i++) stuecke.push(s(`links ${i}`, 60, 740 - i * 14, 40), s(`rechts ${i}`, 320, 740 - i * 14, 40))
    stuecke.push(s('Page 4 of 13 issued 15.03.2026 controlled copy', 60, 650, 400))
    expect(seitenZeilen(stuecke)).toEqual([
      'Training Manual Chapter 3 Edition 1 Revision 2',
      ...Array.from({ length: 6 }, (_, i) => `links ${i}`),
      ...Array.from({ length: 6 }, (_, i) => `rechts ${i}`),
      'Page 4 of 13 issued 15.03.2026 controlled copy',
    ])
  })

  it('ignoriert leere Stücke und leere Seiten', () => {
    expect(seitenZeilen([s('  ', 60, 700)])).toEqual([])
    expect(rohZeilen([])).toEqual([])
  })
})
