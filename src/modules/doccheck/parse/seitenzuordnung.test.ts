import { describe, expect, it } from 'vitest'
import { hatNummer, ohneNummer, pdfDatum, pdfZuordnung, seitenAusEinheiten, teilen, tocEintrag, tocPlausibel, tocZuordnung, vergleichsform } from './seitenzuordnung'

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

  it('TOC-Abbildung: Überschrift ohne Nummer findet ihren Anker am Eintrag mit Nummer (Audit 11/2026, FRD-01)', () => {
    expect([hatNummer('1.2 Scope'), hatNummer('1.2. Scope'), hatNummer('Scope'), hatNummer('2024')]).toEqual([true, true, false, false])
    expect([ohneNummer('1.2 Scope'), ohneNummer('Appendix A')]).toEqual(['Scope', 'Appendix A'])
    const e = [{ text: 'General', seite: 1, ebene: 1 }, { text: 'x'.repeat(3000), seite: 1 }, { text: 'Course Structure', seite: 1, ebene: 1 }, { text: 'y'.repeat(100), seite: 1 }]
    expect(tocZuordnung(e, [{ titel: '1 General', seite: 7, ebene: 1 }, { titel: '2 Course Structure', seite: 8, ebene: 1 }], 9)).toEqual([7, 7, 8, 8])
    // Trägt die Überschrift eine Nummer, muss sie stimmen
    expect(tocZuordnung([{ text: '3 General', seite: 1, ebene: 1 }, { text: '4 Course Structure', seite: 1, ebene: 1 }], [{ titel: '1 General', seite: 7, ebene: 1 }, { titel: '2 Course Structure', seite: 8, ebene: 1 }])).toBeNull()
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

  it('PDF-Zuordnung: Fußnotenziffer nur im PDF zählt nicht als Abweichung (Audit 11/2026, FRD-06)', () => {
    const e = [{ text: 'Instructors delivering the course hold an FI certificate and have completed the standardisation within the last 12 months.', seite: 1 }]
    const r = pdfZuordnung(e, ['Instructors delivering the course hold an FI certificate3 and have completed the standardisation within the last 12 months.'])
    expect(r.abweichung).toBeLessThan(0.02)
    expect(r.abweichung).toBe(0)
    // Seitengrenze NACH der übersprungenen Ziffer: der Schnitt liegt im Originaltext richtig
    const t = pdfZuordnung(e, ['Instructors delivering the course hold an FI certificate3 and have', 'completed the standardisation within the last 12 months.'])
    expect(teilen(e, t.schnitte).einheiten.map((x) => [x.text, x.seite])).toEqual([
      ['Instructors delivering the course hold an FI certificate and have', 1],
      ['completed the standardisation within the last 12 months.', 2],
    ])
    // Mehr als drei fremde Ziffern oder ein anderes Zeichen: echte Abweichung
    expect(pdfZuordnung(e, ['Instructors delivering the course hold an FI certificate1234 and have completed the standardisation within the last 12 months.']).abweichung).toBeGreaterThan(0.3)
    expect(pdfZuordnung(e, ['Instructors delivering the course hold an FI certificate* and have completed the standardisation within the last 12 months.']).abweichung).toBe(0)
    expect(pdfZuordnung(e, ['Instructors delivering the course hold an FI certificatex and have completed the standardisation within the last 12 months.']).abweichung).toBeGreaterThan(0.3)
  })

  it('PDF-Zuordnung: Fußnote hinter ihrem Anker verschiebt den Lesezeiger nicht (Gegenprüfung Audit 11/2026, FRD-13)', () => {
    // Im DOCX folgt die Fußnote ihrem Absatz, im PDF steht sie am Seitenfuß.
    // Rückte der Zeiger dorthin, fand „2.2 Course Phases" seinen Text erst
    // im Inhaltsverzeichnis auf S. 1 — so geschehen mit FREMD-TM-FI.
    const e = [
      { text: 'Contents', seite: 1 },
      { text: '2.1 Entry Requirements\t2', seite: 1 },
      { text: '2.2 Course Phases\t2', seite: 1 },
      { text: '2.1 Entry Requirements', seite: 1, ebene: 2 },
      { text: 'Applicants are credited in accordance with 2.3².', seite: 1 },
      { text: '² The amount of credit is decided by the HT.', seite: 1, nachgereicht: true },
      { text: '2.2 Course Phases', seite: 1, ebene: 2 },
      { text: 'The course consists of theoretical knowledge instruction.', seite: 1 },
    ]
    const pdf = ['Contents\n2.1 Entry Requirements 2\n2.2 Course Phases 2', '2.1 Entry Requirements\nApplicants are credited in accordance with 2.32.\n2.2 Course Phases\nThe course consists of theoretical knowledge instruction.\n2 The amount of credit is decided by the HT.']
    const r = pdfZuordnung(e, pdf)
    expect(r.seiten).toEqual([1, 1, 1, 2, 2, 2, 2, 2])
    expect(r.abweichung).toBe(0)
    // Gegenstück: dieselbe Einheit im Textfluss zöge die Überschrift ins Verzeichnis
    expect(pdfZuordnung(e.map(({ nachgereicht: _n, ...x }) => x), pdf).seiten[6]).toBe(1)
  })

  it('PDF-Zuordnung: Absatz über den Seitenwechsel — Fußnoten am Seitenfuß und Kopf der nächsten Seite stehen dazwischen (Gegenprüfung Audit 11/2026)', () => {
    const e = [{ text: 'Applicants hold a licence. The second half of this long paragraph continues on the next page.', seite: 1 }]
    const pdf = ['Applicants hold a licence. The second half of this\n1 The licence is issued by the authority.\n2 See Part-FCL.', 'Chapter 2 continued\nlong paragraph continues on the next page.']
    const r = pdfZuordnung(e, pdf)
    expect(r.abweichung).toBe(0)
    // Der Schnitt liegt an der Stelle der Einheit, an der die PDF-Seite wechselt
    expect(teilen(e, r.schnitte).einheiten.map((x) => [x.text, x.seite])).toEqual([
      ['Applicants hold a licence. The second half of this', 1],
      ['long paragraph continues on the next page.', 2],
    ])
    // Geht der Text hinter dem Seitenwechsel anders weiter, bleibt es eine Abweichung
    expect(pdfZuordnung(e, [pdf[0], 'Chapter 2 continued\nshort paragraph ends differently here.']).abweichung).toBeGreaterThan(0.3)
    // Mitten auf der Seite wird nicht gesprungen: zu weit vor dem Seitenwechsel
    const weit = pdfZuordnung(e, [`Applicants hold a licence. The second half of this ${'other words in between '.repeat(80)}`, 'long paragraph continues on the next page.'])
    expect(weit.abweichung).toBeGreaterThan(0.3)
    // Ein Rest unter sechs Zeichen fände sich hinter der Grenze zufällig — kein Sprung
    const kurz = pdfZuordnung([{ text: 'Applicants hold a licence. The second half of this ab', seite: 1 }], ['Applicants hold a licence. The second half of this\n1 Footnote text.', 'ab cd'])
    expect(kurz.abweichung).toBeGreaterThan(0)
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

describe('Seitenaufbau bei sehr vielen Einheiten', () => {
  it('200 000 Einheiten ohne Stapelüberlauf (gefunden bei DC-01)', () => {
    const einheiten = Array.from({ length: 200000 }, (_, i) => ({ text: `Absatz ${i}`, seite: 1 + Math.floor(i / 100) }))
    const { pages } = seitenAusEinheiten(einheiten, einheiten.map((e) => e.seite), (n) => `ca. ${n}`)
    expect(pages).toHaveLength(2000)
  })
})
