import { describe, expect, it } from 'vitest'
import { abschnittSeiten, formalPruefung, nummernPruefen, revNummer } from './formal'
import { REGELN } from './kontext'
import type { Rohdokument } from '../parse/model'
import { LEERE_LENKUNG } from '../parse/model'

const roh = (texte: string[], extra: Partial<Rohdokument> = {}): Rohdokument => ({
  format: 'pdf', pages: texte.map((text, i) => ({ index: i + 1, text })), outline: [], lenkung: { ...LEERE_LENKUNG, aenderungen: [], kommentare: [] }, ocrKandidaten: [], tabellen: 0, ...extra,
})
const pruefe = (r: Rohdokument, revision?: string) => formalPruefung({ dokId: 'd', dokName: 'D', roh: r, meta: { revision }, regeln: REGELN })

describe('Bausteine der Formalprüfung', () => {
  it('nummernPruefen: Lücken und Doppelungen je Ebene', () => {
    expect(nummernPruefen(['1', '1.1', '1.2', '2', '2.1', '2.3', '4', '4'])).toEqual({ luecken: ['2.2', '3'], doppelt: ['4'] })
    expect(nummernPruefen(['1', '1.1', '1.4'])).toEqual({ luecken: ['1.2–1.3'], doppelt: [] })
    expect(nummernPruefen(['2'])).toEqual({ luecken: ['1'], doppelt: [] })
  })

  it('revNummer', () => {
    expect(revNummer('Edition 2 Rev 1.0')).toBe(1)
    expect(revNummer('Revision 3')).toBe(3)
    expect(revNummer('Issue 4')).toBe(4)
    expect(revNummer(undefined)).toBeUndefined()
    expect(revNummer('Rev C')).toBeUndefined()
  })

  it('abschnittSeiten: Überschrift ja, Verzeichniseintrag nein', () => {
    const s = abschnittSeiten([{ text: 'Contents\nList of Effective Pages ..... 3' }, { text: 'x' }, { text: 'List of Effective Pages\nPage 1' }, { text: '2 Abbreviations' }], ['list of effective pages', 'abbreviations'])
    expect(s).toEqual([2, 3])
  })
})

describe('Formalprüfung — Grenzfälle', () => {
  it('Dokument ohne Gliederung, Labels und Listen: viele Punkte nicht anwendbar, keine Befunde', () => {
    const p = pruefe(roh(['Just a short text page.']))
    expect(p.befunde).toEqual([])
    expect(p.ampel).toMatchObject({ revisionsstand: 'na', lep: 'na', seiten: 'na', revisionen: 'na', inhalt: 'na', querverweise: 'na', abkuerzungen: 'na', reste: 'ok', nummerierung: 'na' })
  })

  it('Revision > 0 ohne Highlights of Change; „x of y" mit wechselnder Gesamtzahl; Doppelte Seite', () => {
    const r = roh(['Cover', 'a', 'b', 'c'])
    r.pages = r.pages.map((p, i) => ({ ...p, label: ['Page 1 of 4', 'Page 2 of 4', 'Page 2 of 5', 'Page 3 of 4'][i] }))
    const p = pruefe(r, 'Revision 1')
    expect(p.befunde.find((b) => b.pruefpunkt === 'revisionen')?.text).toContain('no highlights of change')
    const seiten = p.befunde.find((b) => b.pruefpunkt === 'seiten')!.fundstellen.map((f) => f.auszug).join('\n')
    expect(seiten).toContain('Different totals')
    expect(seiten).toContain('Duplicate page number: Page 2')
  })

  it('offene Änderungen und Kommentare sind Hoch', () => {
    const r = roh(['Text'], { lenkung: { ...LEERE_LENKUNG, aenderungen: [{ art: 'del', text: 'alt' }], kommentare: [{ text: 'check' }] } })
    const b = pruefe(r).befunde.find((x) => x.pruefpunkt === 'reste')!
    expect(b.prioritaet).toBe('High')
    expect(b.fundstellen.map((f) => f.ort)).toEqual(['Tracked change', 'Comment'])
  })

  it('PDF-Inhaltsverzeichnis: falsche Seitenzahl wird gemeldet, wenn die Seiten nur Zahlen tragen', () => {
    const r = roh(['Contents\n1 General ..... 2\n2 Systems ..... 2', '1 General\nx', '2 Systems\ny'], { outline: [{ titel: '1 General', ebene: 1, vonSeite: 2 }, { titel: '2 Systems', ebene: 1, vonSeite: 3 }] })
    const a = pruefe(r).befunde.find((b) => b.pruefpunkt === 'inhalt')!.fundstellen.map((f) => f.auszug)
    expect(a).toEqual(['2 Systems: listed on page 2, found on page 3'])
  })

  it('DOCX-Inhaltsverzeichnis: Abgleich nur über Titel', () => {
    const r = roh(['1 A', '2 B'], {
      format: 'docx',
      outline: [{ titel: '1 A', ebene: 1, vonSeite: 1 }, { titel: '2 B', ebene: 1, vonSeite: 2 }],
      word: { absaetze: [], laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc: [{ titel: '1 A', seite: 1, ebene: 1 }, { titel: '3 C', seite: 3, ebene: 1 }] },
    })
    const a = pruefe(r).befunde.find((b) => b.pruefpunkt === 'inhalt')!
    expect(a.text).toContain('DOCX: compared by title only')
    expect(a.fundstellen.map((f) => f.auszug)).toEqual(['Entry without matching heading: 3 C', 'Heading missing in table of contents: 2 B'])
  })

  it('Abbildungen: doppelte Nummer mit Fundstelle', () => {
    const p = pruefe(roh(['Figure 1 Panel\nFigure 1 Switch\nFigure 2 Lights']))
    expect(p.befunde.find((b) => b.pruefpunkt === 'nummerierung')!.fundstellen.map((f) => f.auszug)).toEqual(['Duplicate figure number: Figure 1'])
  })
})

describe('Formalprüfung — Verweisarten, Revisionsverzeichnis, Datum', () => {
  it('Querverweise auf Anhang, Abbildung, Tabelle: vorhanden ok, fehlend gemeldet', () => {
    const p = pruefe(roh([
      'Appendix A Forms\nFigure 2 Panel\nTable 1 Limits\nTable 2 Speeds',
      'See Appendix A. See Appendix B. Refer to Figure 2 and see Figure 3. See Table 1, see Table 4.',
    ]))
    const a = p.befunde.find((b) => b.pruefpunkt === 'querverweise')!.fundstellen.map((f) => f.auszug.split(' — ')[0])
    expect(a).toEqual(['See Appendix B', 'see Figure 3', 'see Table 4'])
  })

  it('Verweis in ein fremdes Regelwerk ist kein fehlendes Ziel (Fachprüfung 01.11.2026)', () => {
    const p = pruefe(roh(['Appendix A Forms', 'See Annex I (Part-FCL). Refer to Appendix 9 to Part-FCL. See Appendix B.']))
    const a = p.befunde.find((b) => b.pruefpunkt === 'querverweise')!.fundstellen.map((f) => f.auszug.split(' — ')[0])
    expect(a).toEqual(['See Appendix B'])
  })

  it('Revisionsverzeichnis: letzter Eintrag passt nicht zur Dokumentrevision; mit HoC kein Zusatzbefund', () => {
    const p = pruefe(roh(['Record of Revisions\n0 | 01.01.2025 | Initial\n1 | 01.06.2025 | Update', 'Highlights of Change\nChapter 2 updated']), 'Revision 2')
    const r = p.befunde.filter((b) => b.pruefpunkt === 'revisionen')
    expect(r).toHaveLength(1)
    expect(r[0].text).toContain('(1) does not match')
    expect(pruefe(roh(['Record of Revisions\n0 | 01.01.2025 | Initial\n1 | 01.06.2025 | Update', 'Highlights of Change']), 'Revision 1').befunde.filter((b) => b.pruefpunkt === 'revisionen')).toEqual([])
  })

  it('Revisionsstand: abweichendes Datum auf einer Seite und Deckblatt-Revision anders', () => {
    const r = roh(['Cover', 'a', 'b', 'c'])
    r.pages = r.pages.map((p, i) => ({ ...p, rand: [`Rev 3 | ${i === 2 ? '02.03.2026' : '01.03.2026'}`] }))
    const a = pruefe(r, 'Revision 2').befunde.find((b) => b.pruefpunkt === 'revisionsstand')!.fundstellen.map((f) => f.auszug)
    expect(a[0]).toBe('Cover: Revision 2, headers/footers: Rev 3')
    expect(a[1]).toContain('2026-03-02')
  })

  it('Abkürzungen: CAS-Meldungen und Einheiten sind ausgenommen; ohne Befund grün', () => {
    const p = pruefe(roh(['List of Abbreviations\nAFM Airplane Flight Manual', '1 General\nUse the AFM. BATT 1 OFF BUS at 120 KIAS.']))
    expect(p.befunde.filter((b) => b.pruefpunkt === 'abkuerzungen')).toEqual([])
    expect(p.ampel.abkuerzungen).toBe('ok')
  })

  it('LEP vollständig: kein Befund', () => {
    const r = roh(['List of Effective Pages\nPage 1\nPage 2\nPage 3', 'x', 'y'])
    r.pages = r.pages.map((p, i) => ({ ...p, label: `Page ${i + 1}` }))
    expect(pruefe(r).ampel.lep).toBe('ok')
  })
})
