import { describe, expect, it } from 'vitest'
import { pdfDatum, pdfZuordnung, seitenAusEinheiten, teilen, tocEintrag, tocPlausibel, tocZuordnung, vergleichsform } from './seitenzuordnung'

describe('Bausteine der Seitenzuordnung (Nachtrag N5)', () => {
  it('Vergleichsform ignoriert Leerraum, Trenner und Groß-/Kleinschreibung', () => {
    expect(vergleichsform('Go-Around | 155 KIAS')).toBe('goaround155kias')
  })

  it('TOC-Eintrag: Titel und Seite, auch mit Füllpunkten; ohne Zahl keine Seite', () => {
    expect(tocEintrag('2.4 Limitations\t17')).toEqual({ titel: '2.4 Limitations', seite: 17 })
    expect(tocEintrag('3 Fuel ........ 22')).toEqual({ titel: '3 Fuel', seite: 22 })
    expect(tocEintrag('Ohne Seite')).toEqual({ titel: 'Ohne Seite', seite: null })
    expect(tocEintrag('42')).toEqual({ titel: '42', seite: null })
  })

  it('ein veraltetes Inhaltsverzeichnis (fallende Seitenzahlen) wird nicht benutzt', () => {
    expect(tocPlausibel([{ titel: 'a', seite: 3, ebene: 1 }, { titel: 'b', seite: 2, ebene: 1 }])).toBe(false)
    expect(tocPlausibel([{ titel: 'a', seite: 3, ebene: 1 }])).toBe(false)
    expect(tocPlausibel([{ titel: 'a', seite: 3, ebene: 1 }, { titel: 'b', seite: null, ebene: 1 }, { titel: 'c', seite: 3, ebene: 1 }])).toBe(true)
  })

  it('TOC-Abbildung: Anker exakt, dazwischen anteilig, gedeckelt durch die nächste Überschrift', () => {
    const e = [
      { text: 'Intro', seite: 1 },
      { text: '1 Alpha', seite: 1, ebene: 1 },
      { text: 'x'.repeat(1000), seite: 1 },
      { text: 'y'.repeat(1000), seite: 1 },
      { text: '2 Beta', seite: 1, ebene: 1 },
      { text: 'z'.repeat(500), seite: 1 },
    ]
    const s = tocZuordnung(e, [{ titel: '1 Alpha', seite: 3, ebene: 1 }, { titel: '2 Beta', seite: 5, ebene: 1 }], 6)
    expect(s).toEqual([1, 3, 3, 4, 5, 5])
    // Ohne genug Anker keine Abbildung.
    expect(tocZuordnung(e, [{ titel: '1 Alpha', seite: 3, ebene: 1 }, { titel: 'Fremd', seite: 5, ebene: 1 }])).toBeNull()
    expect(tocZuordnung(e, [])).toBeNull()
  })

  it('TOC-Abbildung ohne Gesamtzahl: Ende aus der Textdichte geschätzt', () => {
    const e = [{ text: '1 A', seite: 1, ebene: 1 }, { text: 'x'.repeat(3000), seite: 1 }, { text: '2 B', seite: 1, ebene: 1 }, { text: 'y'.repeat(3000), seite: 1 }]
    const s = tocZuordnung(e, [{ titel: '1 A', seite: 1, ebene: 1 }, { titel: '2 B', seite: 2, ebene: 1 }])!
    expect(s.slice(0, 3)).toEqual([1, 1, 2])
    expect(s[3]).toBeGreaterThanOrEqual(2)
  })

  it('PDF-Zuordnung: teilt eine Einheit an der Seitengrenze, misst die Abweichung', () => {
    const e = [{ text: 'kurz', seite: 1 }, { text: 'Erster Absatz der lang genug ist und über die Grenze läuft', seite: 1 }, { text: 'Fehlt im PDF komplett hier', seite: 1 }]
    const r = pdfZuordnung(e, ['Erster Absatz der lang genug', 'ist und über die Grenze läuft'])
    expect(r.seiten).toEqual([1, 1, 2])
    expect(r.schnitte[1]).toEqual([{ seite: 1, ab: 0 }, { seite: 2, ab: 29 }])
    expect(r.abweichung).toBeGreaterThan(0.3)
    const t = teilen(e, r.schnitte)
    expect(t.einheiten.map((x) => [x.text, x.seite])).toEqual([
      ['kurz', 1],
      ['Erster Absatz der lang genug', 1],
      ['ist und über die Grenze läuft', 2],
      ['Fehlt im PDF komplett hier', 2],
    ])
    expect(pdfZuordnung([], []).abweichung).toBe(0)
  })

  it('PDF-Zuordnung findet auch zurückliegende Stellen (Reihenfolge abweichend)', () => {
    const r = pdfZuordnung([{ text: 'Zweiter Teil des Textes', seite: 1 }, { text: 'Erster Teil des Textes', seite: 1 }], ['Erster Teil des Textes', 'Zweiter Teil des Textes'])
    expect(r.seiten).toEqual([2, 1])
  })

  it('Seiten aus Einheiten: Lücken bleiben als leere Seiten, Pfad und Gliederung', () => {
    const r = seitenAusEinheiten([{ text: '1 Alpha', seite: 1, ebene: 1 }, { text: 'Text', seite: 3 }], [1, 3], (n) => `S. ${n}`)
    expect(r.pages.map((p) => [p.index, p.label, p.text, p.sectionPath])).toEqual([
      [1, 'S. 1', '1 Alpha', ['1 Alpha']],
      [2, 'S. 2', '', ['1 Alpha']],
      [3, 'S. 3', 'Text', ['1 Alpha']],
    ])
    expect(r.outline).toEqual([{ titel: '1 Alpha', ebene: 1, vonSeite: 1 }])
  })

  it('PDF-Datum mit Zeitzone; Unbrauchbares → null', () => {
    expect(pdfDatum("D:20261101100000+01'00'")).toBe(Date.UTC(2026, 10, 1, 9, 0, 0))
    expect(pdfDatum('D:20261101100000Z')).toBe(Date.UTC(2026, 10, 1, 10, 0, 0))
    expect(pdfDatum('D:2026')).toBe(Date.UTC(2026, 0, 1))
    expect(pdfDatum("D:20261101100000-05'30'")).toBe(Date.UTC(2026, 10, 1, 15, 30, 0))
    expect(pdfDatum('gestern')).toBeNull()
    expect(pdfDatum(undefined)).toBeNull()
  })
})
