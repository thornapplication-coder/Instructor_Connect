import { describe, expect, it } from 'vitest'
import { abschnittSeiten, formalPruefung, gleicheSeite, istBeschriftung, kurzverweise, lepZeilen, nummernPruefen, ohneGesamt, revisionNennen, revNummer, wordAbkuerzungsliste } from './formal'
import { REGELN } from './kontext'
import type { Rohdokument, WortAbsatz } from '../parse/model'
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

  it('Verschiebungen und Formatänderungen sind offene Änderungen — Hoch, Ampel rot (Audit 11/2026, FRD-15)', () => {
    const aenderungen = [
      { art: 'moveFrom' as const, text: 'Check the fuel quantity.', autor: 'DC' },
      { art: 'moveTo' as const, text: 'Check the fuel quantity.', autor: 'DC' },
      { art: 'format' as const, text: 'Solo flights require approval.' },
      { art: 'ins' as const, text: 'neu' },
    ]
    const p = pruefe(roh(['Text'], { lenkung: { ...LEERE_LENKUNG, aenderungen } }))
    const b = p.befunde.find((x) => x.pruefpunkt === 'reste')!
    expect(b.prioritaet).toBe('High')
    expect(b.fundstellen.map((f) => f.auszug)).toEqual(['Moved away by DC: Check the fuel quantity.', 'Moved here by DC: Check the fuel quantity.', 'Formatting changed: Solo flights require approval.', 'Inserted: neu'])
    expect(p.ampel.reste).toBe('bad')
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

  it('DOCX-Inhaltsverzeichnis: Überschrift OHNE Nummer gegen Eintrag mit Nummer — nur der Titel zählt (Audit 11/2026, FRD-01)', () => {
    const word = (toc: { titel: string; seite: number; ebene: number }[]) => ({ absaetze: [], laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc })
    const r = roh(['General', 'Scope'], {
      format: 'docx',
      outline: [{ titel: 'General', ebene: 1, vonSeite: 1 }, { titel: 'Scope', ebene: 2, vonSeite: 1 }, { titel: '2 Systems', ebene: 1, vonSeite: 2 }, { titel: 'Annex', ebene: 1, vonSeite: 2 }],
      word: word([{ titel: '1 General', seite: 1, ebene: 1 }, { titel: '1.1 Scope', seite: 1, ebene: 2 }, { titel: '3 Systems', seite: 2, ebene: 1 }, { titel: '4 Annex', seite: 2, ebene: 1 }]),
    })
    // „2 Systems" trägt eine Nummer — dann muss sie auch stimmen.
    expect(pruefe(r).befunde.find((b) => b.pruefpunkt === 'inhalt')!.fundstellen.map((f) => f.auszug)).toEqual(['Entry without matching heading: 3 Systems', 'Heading missing in table of contents: 2 Systems'])
  })

  it('Kapitelverweis ohne Kapitelnummern im Dokument: nicht anwendbar statt grün (Audit 11/2026, FRD-01)', () => {
    // Es gibt ein Verweisziel (Tabelle 1), aber keine Kapitelnummer — der einzige Verweis ist ungeprüft
    const ohne = pruefe(roh(['General\nTable 1 Limits\nSee Section 6.2 for details.'], { outline: [{ titel: 'General', ebene: 1, vonSeite: 1 }] }))
    expect(ohne.befunde.filter((b) => b.pruefpunkt === 'querverweise')).toEqual([])
    expect(ohne.ampel.querverweise).toBe('na')
    // Ein Ziel dieser Art existiert, der Verweis ist ungeprüft (keine Abbildungen) → weiterhin geprüft, was geht
    const gemischt = pruefe(roh(['1 General\nSee Section 6.2. See Figure 4.'], { outline: [{ titel: '1 General', ebene: 1, vonSeite: 1 }] }))
    expect(gemischt.befunde.find((b) => b.pruefpunkt === 'querverweise')!.fundstellen.map((f) => f.auszug.split(' — ')[0])).toEqual(['See Section 6.2'])
    // Mit Kapitelnummern und gültigem Ziel: grün
    expect(pruefe(roh(['1 General\nSee Section 1.'], { outline: [{ titel: '1 General', ebene: 1, vonSeite: 1 }] })).ampel.querverweise).toBe('ok')
  })

  it('XLSX: Blattnamen sind keine Seitennummern — Seitennummerierung nicht anwendbar statt grün (Audit 11/2026, FRD-11)', () => {
    const r = roh(['a', 'b', 'c'], { format: 'xlsx' })
    r.pages = r.pages.map((p, i) => ({ ...p, label: ['Flights', 'Monthly', 'Summary'][i] }))
    expect(pruefe(r).ampel.seiten).toBe('na')
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
    const b = pruefe(r, 'Revision 2').befunde.find((x) => x.pruefpunkt === 'revisionsstand')!
    const a = b.fundstellen.map((f) => f.auszug)
    expect(a[0]).toBe('Cover: Revision 2, headers/footers: Rev 3')
    expect(a[1]).toContain('2026-03-02')
    expect(b.text).toContain('(2 deviations)')
    // Einzahl ohne „(s)" (Audit 11/2026, TXT-07)
    r.pages = r.pages.map((p) => ({ ...p, rand: ['Rev 3 | 01.03.2026'] }))
    expect(pruefe(r, 'Revision 2').befunde.find((x) => x.pruefpunkt === 'revisionsstand')!.text).toContain('(1 deviation)')
  })

  it('Revision im Befundtext nicht doppelt: „Document is at Revision 2" (Audit 11/2026, TXT-07/UID-14)', () => {
    const texte = (rev: string, seiten = ['Cover']) => pruefe(roh(seiten), rev).befunde.filter((b) => b.pruefpunkt === 'revisionen').map((b) => b.text)
    expect(texte('Revision 2')).toEqual(['Document is at Revision 2 but contains no highlights of change.'])
    expect(texte('2')).toEqual(['Document is at revision 2 but contains no highlights of change.'])
    expect(texte('Rev. 2', ['Record of Revisions\n1 | 01.06.2025 | Update', 'Highlights of Change'])).toEqual(['Last entry in the record of revisions (1) does not match the document (Rev. 2).'])
    for (const t of [...texte('Revision 2'), ...texte('Rev 2'), ...texte('Edition 1 Revision 2')]) expect(t).not.toMatch(/revision rev/i)
    // „… revision Issue 2 …" stand im Befund zum Newsletter der Prüfer (Nachtrag L-FREMD#3)
    expect(texte('Issue 2')).toEqual(['Document is at Issue 2 but contains no highlights of change.'])
    expect([revisionNennen(' Issue 3 '), revisionNennen('Ausgabe 1, Revision 3'), revisionNennen('2.1')]).toEqual(['Issue 3', 'Ausgabe 1, Revision 3', 'revision 2.1'])
  })

  it('Abkürzungen: CAS-Meldungen und Einheiten sind ausgenommen; ohne Befund grün', () => {
    const p = pruefe(roh(['List of Abbreviations\nAFM Airplane Flight Manual', '1 General\nUse the AFM. BATT 1 OFF BUS at 120 KIAS.']))
    expect(p.befunde.filter((b) => b.pruefpunkt === 'abkuerzungen')).toEqual([])
    expect(p.ampel.abkuerzungen).toBe('ok')
  })

  it('Abkürzungen: „NOTE:" ist kein Kürzel (Audit 11/2026, FRD-16)', () => {
    const p = pruefe(roh(['List of Abbreviations\nAFM Airplane Flight Manual', '1 General\nNOTE: Use the AFM. Do NOT exceed the limits.']))
    expect(p.befunde.filter((b) => b.pruefpunkt === 'abkuerzungen')).toEqual([])
  })

  it('LEP vollständig: kein Befund', () => {
    const r = roh(['List of Effective Pages\nPage 1\nPage 2\nPage 3', 'x', 'y'])
    r.pages = r.pages.map((p, i) => ({ ...p, label: `Page ${i + 1}` }))
    expect(pruefe(r).ampel.lep).toBe('ok')
  })

  describe('Kurzverweise ohne Schlüsselwort (Audit 11/2026, FRD-14)', () => {
    // Gliederung 1, 1.1, 2 wie im Prüferdokument — vorher meldete nur „see Section 9.4"
    const outline = [{ titel: '1 General', ebene: 1, vonSeite: 1 }, { titel: '1.1 Scope', ebene: 2, vonSeite: 1 }, { titel: '2 Training', ebene: 1, vonSeite: 1 }]
    const verweise = (satz: string, extra: Partial<Rohdokument> = {}) => {
      const p = pruefe(roh([`1 General\n1.1 Scope\n${satz}\n2 Training`], { outline, ...extra }))
      return { a: p.befunde.filter((b) => b.pruefpunkt === 'querverweise').flatMap((b) => b.fundstellen.map((f) => f.auszug.split(' — ')[0])), prio: p.befunde.find((b) => b.pruefpunkt === 'querverweise')?.prioritaet, ampel: p.ampel.querverweise }
    }

    it('„see 9.4" und „refer to 7.3" ohne Ziel → Medium', () => {
      expect(verweise('For the grading scale see 9.4. For the debriefing refer to 7.3.')).toEqual({ a: ['see 9.4', 'refer to 7.3'], prio: 'Medium', ampel: 'wait' })
      expect(verweise('Gemäß 3.2 wird gebrieft, siehe 4.1.').a).toEqual(['Gemäß 3.2', 'siehe 4.1'])
    })

    it('gültiges Ziel, Einheit, Datum, anderes Dokument, fremdes Regelwerk: kein Befund', () => {
      for (const satz of [
        'For the scope see 1.1.',
        'Credits are granted in accordance with 1.1² and 2.',
        'Turn final within 3 NM, refer to 7.3 NM before the threshold.',
        'Load the fuel, see 5.1 kg per tank.',
        'Plan the block time, see 1.5 hours per lesson; gemäß 2.5 Stunden Flugzeit.',
        'Revised, see 01.11.2026.',
        'For flap limits refer to 2.3 of the AFM and see 4.1 in OM-A.',
        'Siehe 4.1 des OM-A.',
        'Refer to 6.2 of the Operations Manual.',
        'See 2.1 of Regulation (EU) No 1178/2011.',
        'see 4.',
      ]) expect(verweise(satz), satz).toMatchObject({ a: [], ampel: 'ok' })
    })

    it('Ziel ist ein nummerierter Absatz ohne Überschriftvorlage (N7 „see 1.4.1.1")', () => {
      expect(verweise('1.4.1.1 The PIC shall brief the crew.\nFor the briefing see 1.4.1.1.').a).toEqual([])
    })

    it('ohne Kapitelnummern im Dokument: nicht anwendbar statt grün', () => {
      const p = pruefe(roh(['General\nFor the grading scale see 9.4.'], { outline: [{ titel: 'General', ebene: 1, vonSeite: 1 }] }))
      expect(p.befunde.filter((b) => b.pruefpunkt === 'querverweise')).toEqual([])
      expect(p.ampel.querverweise).toBe('na')
    })

    it('Baustein: Kurzform und Schlüsselwort-Form schließen sich aus — kein Verweis doppelt gezählt', () => {
      expect(kurzverweise('See Section 9.4 and see 9.4; IAW 2.1.3.').map((m) => m[0])).toEqual(['see 9.4', 'IAW 2.1.3'])
    })
  })

  describe('DOCX: Beschriftungen in Tabellenzellen (Audit 11/2026, FRD-18)', () => {
    const absatz = (nr: number, text: string, extra: Partial<WortAbsatz> = {}): WortAbsatz => ({ nr, text, ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1, ...extra })
    const zelle = (nr: number, text: string, zeile: number, spalte: number, extra: Partial<WortAbsatz> = {}) => absatz(nr, text, { tabelle: { zeile, spalte }, ...extra })
    const docx = (absaetze: WortAbsatz[]) => pruefe(roh([absaetze.map((a) => a.text).join('\n')], { format: 'docx', word: { absaetze, laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc: [] } }))

    it('Revisionszelle „Tabelle 2 ergänzt" ist keine Beschriftung — vorher Lücke „Tabelle 1" UND Doppelung „Tabelle 2"', () => {
      const p = docx([
        zelle(0, '2', 0, 0), zelle(1, '15.06.2025', 0, 1), zelle(2, 'Tabelle 2 ergänzt', 0, 2),
        absatz(3, 'Tabelle 1: Theoretische Ausbildung'), absatz(4, 'Tabelle 2: Praktische Ausbildung'),
        absatz(5, 'Die Inhalte stehen in Tabelle 1 und Tabelle 2, siehe Tabelle 2.'),
      ])
      expect(p.befunde.filter((b) => b.pruefpunkt === 'nummerierung')).toEqual([])
      expect(p.ampel.nummerierung).toBe('ok')
    })

    it('Beschriftung mit Vorlage „Caption" in einer Layout-Tabelle zählt — als Nummer und als Verweisziel', () => {
      const p = docx([
        zelle(0, 'Figure 1 Panel', 0, 0, { stilName: 'caption' }), zelle(1, 'Figure 1 revised', 1, 0),
        absatz(2, 'Figure 3 Lights'),
        absatz(3, 'The switches are shown, see Figure 1 and see Figure 2.'),
      ])
      expect(p.befunde.find((b) => b.pruefpunkt === 'nummerierung')!.fundstellen.map((f) => f.auszug)).toEqual(['Figure numbering gap: Figure 2 missing'])
      expect(p.befunde.find((b) => b.pruefpunkt === 'querverweise')!.fundstellen.map((f) => f.auszug.split(' — ')[0])).toEqual(['see Figure 2'])
      expect([istBeschriftung({ text: 'Table 2 amended', inTabelle: true }), istBeschriftung({ text: 'Table 2 Limits', inTabelle: true, stilName: 'Beschriftung' }), istBeschriftung({ text: `Table 3 shows ${'x'.repeat(120)}` })]).toEqual([false, true, false])
    })
  })

  describe('DOCX: Abkürzungsliste über Absätze statt geschätzte Seiten (Audit 11/2026, FRD-16)', () => {
    const absatz = (nr: number, text: string, extra: Partial<WortAbsatz> = {}): WortAbsatz => ({ nr, text, ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1, ...extra })
    const zelle = (nr: number, text: string, zeile: number, spalte: number) => absatz(nr, text, { tabelle: { zeile, spalte } })
    const liste = [
      absatz(0, 'Contents'), absatz(1, 'List of Abbreviations\t6', { toc: 1 }),
      absatz(2, 'List of Abbreviations', { ebene: 1 }),
      zelle(3, 'Abbreviation', 0, 0), zelle(4, 'Meaning', 0, 1),
      zelle(5, 'ATO', 1, 0), zelle(6, 'Approved Training Organisation', 1, 1),
      zelle(7, 'PPL', 2, 0), zelle(8, 'Private Pilot Licence', 2, 1),
      zelle(9, 'VFR', 3, 0), zelle(10, 'Visual Flight Rules', 3, 1),
    ]
    // Liste und Kapitel 1 auf DERSELBEN geschätzten Seite, wie beim Prüferdokument
    const docx = (absaetze: WortAbsatz[]) => {
      const text = absaetze.filter((a) => !a.toc).map((a) => a.text).join('\n')
      return pruefe(roh([text], { format: 'docx', word: { absaetze, laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc: [] } }))
    }

    it('benutzte Einträge auf derselben Seite sind kein „never used"; was fehlt, bleibt Befund', () => {
      const p = docx([...liste, absatz(11, '1 General', { ebene: 1 }), absatz(12, 'NOTE: The ATO trains PPL holders. The QRH applies.'), absatz(13, 'Footnote: PPL', { ort: 'fussnote', teil: 'word/footnotes.xml' })])
      expect(p.befunde.find((b) => b.pruefpunkt === 'abkuerzungen')!.fundstellen.map((f) => f.auszug)).toEqual(['Used but not in the list: QRH', 'Listed but never used: VFR'])
    })

    it('Baustein: Liste bis zur nächsten Überschrift, Kopfzeile der Tabelle und Verzeichniseintrag zählen nicht', () => {
      const l = wordAbkuerzungsliste([...liste, absatz(11, 'EGPWS Enhanced Ground Proximity Warning System'), absatz(12, '1 General', { ebene: 1 }), zelle(13, 'TEM', 0, 0), zelle(14, 'Threat and Error Management', 0, 1)], ['list of abbreviations'])!
      expect([l.von, l.bis, [...l.liste.keys()]]).toEqual([2, 11, ['ATO', 'PPL', 'VFR', 'EGPWS']])
      expect(wordAbkuerzungsliste([absatz(0, '1 General', { ebene: 1 })], ['list of abbreviations'])).toBeNull()
    })

    it('ohne lesbare Einträge unter der Überschrift: wie bisher über die Seiten', () => {
      const p = pruefe(roh(['List of Abbreviations\nAFM Airplane Flight Manual', '1 General\nUse the AFM and the QRH.'], { format: 'docx', word: { absaetze: [absatz(0, 'List of Abbreviations', { ebene: 1 })], laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc: [] } }))
      expect(p.befunde.find((b) => b.pruefpunkt === 'abkuerzungen')!.fundstellen.map((f) => f.auszug)).toEqual(['Used but not in the list: QRH'])
    })
  })

  describe('LEP über die Seitennummer (Audit 11/2026, FRD-07)', () => {
    // Fußzeilen „Page x of 3", LEP als Tabelle — vorher galt jede Seite als „Missing in LEP"
    const mitLep = (zeilen: string[], labels: string[], rand: string[] = []) => {
      const r = roh([`List of Effective Pages\nPage | Revision | Date\n${zeilen.join('\n')}`, 'Text', 'More text'])
      r.pages = r.pages.map((p, i) => ({ ...p, label: labels[i], ...(rand[i] ? { rand: [rand[i]] } : {}) }))
      return pruefe(r).befunde.filter((b) => b.pruefpunkt === 'lep')
    }
    const vonDrei = ['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']

    it('„Page 1 of 3" … gegen die Zeilen „1 | 2 | 15.03.2026": kein Befund', () => {
      expect(mitLep(['1 | 2 | 15.03.2026', '2 | 2 | 15.03.2026', '3 | 2 | 15.03.2026'], vonDrei)).toEqual([])
      // Deutsch ebenso
      expect(mitLep(['1 | 2 | 15.03.2026', '2 | 2 | 15.03.2026', '3 | 2 | 15.03.2026'], ['Seite 1 von 3', 'Seite 2 von 3', 'Seite 3 von 3'])).toEqual([])
    })

    it('fehlende Zeile 2 → „Missing in LEP: Page 2"; überzählige Zeile 4 → surplus', () => {
      const b = mitLep(['1 | 2 | 15.03.2026', '3 | 2 | 15.03.2026', '4 | 2 | 15.03.2026'], vonDrei)
      expect(b.map((x) => x.text)).toEqual(['List of Effective Pages does not match the actual pages (1 missing, 1 surplus).'])
      expect(b[0].fundstellen.map((f) => f.auszug)).toEqual(['Missing in LEP: Page 2', 'Listed in LEP but not in document: 4'])
    })

    it('Deckblatt ohne Seitenzahl: „1" im LEP ist die erste physische Seite, kein Überschuss (Gegenprüfung P5)', () => {
      // So bei den Fremddokumenten TM/AH: Fußzeile erst ab Seite 2, das LEP führt Seite 1 trotzdem
      const deckblatt = (lep: number[], erste?: string) => {
        const r = roh(['Training Manual', `List of Effective Pages\nPage | Revision | Date\n${lep.map((n) => `${n} | 2 | 15.03.2026`).join('\n')}`, 'Text', 'More text'])
        r.pages = r.pages.map((p, i) => ({ ...p, label: i === 0 ? erste : `Page ${i + 1} of 4` }))
        return pruefe(r).befunde.filter((b) => b.pruefpunkt === 'lep').flatMap((b) => b.fundstellen.map((f) => f.auszug))
      }
      expect(deckblatt([1, 2, 3, 4])).toEqual([])
      // Trägt die Seite eine eigene Bezeichnung, zählt nur die — „1" neben „Page i" bleibt Überschuss
      expect(deckblatt([1, 2, 3, 4], 'Page i')).toEqual(['Missing in LEP: Page i', 'Listed in LEP but not in document: 1'])
      // Eine Nummer jenseits der letzten Seite bleibt Überschuss
      expect(deckblatt([1, 2, 3, 4, 5])).toEqual(['Listed in LEP but not in document: 5'])
    })

    it('Revision und Datum je Eintrag gegen Kopf-/Fußzeile der Seite', () => {
      const rand = ['Revision 2 | 15.03.2026', 'Revision 1 | 15.03.2026', 'Revision 2 | 2026-03-01']
      const b = mitLep(['1 | 2 | 15.03.2026', '2 | 2 | 15.03.2026', '3 | 2 | 15.03.2026'], vonDrei, rand)
      expect(b[0].text).toBe('List of Effective Pages does not match the actual pages (0 missing, 0 surplus, 2 with a different revision or date).')
      expect(b[0].fundstellen.map((f) => f.auszug)).toEqual(['Page 2: LEP 2 / 2026-03-15, page Revision 1 / 2026-03-15', 'Page 3: LEP 2 / 2026-03-15, page Revision 2 / 2026-03-01'])
    })

    it('Bausteine: Einträge als Tabelle oder Text; „Total pages" ist keiner; gleiche Seite über die Nummer', () => {
      expect(lepZeilen('List of Effective Pages\nPage | Rev | Date\n1 | 2 | 15.03.2026\nTotal pages: 13\nPage 4 Rev 3 01.03.2026\n6-04-15 Page 2 Revision 1 2026-03-01\n7 3 15.03.2026')).toEqual([
        { seite: '1', rev: '2', datum: '2026-03-15' },
        { seite: 'Page 4', rev: 'Rev 3', datum: '2026-03-01' },
        { seite: '6-04-15 Page 2', rev: 'Revision 1', datum: '2026-03-01' },
        { seite: '7', datum: '2026-03-15' },
      ])
      expect([ohneGesamt('Page 7 of 13'), ohneGesamt('Seite 3 von 10'), ohneGesamt('3-12'), ohneGesamt('12/40')]).toEqual(['Page 7', 'Seite 3', '3-12', '12'])
      expect([gleicheSeite('7', 'Page 7'), gleicheSeite('Page 7', 'page 7'), gleicheSeite('Page 7', 'Page 70'), gleicheSeite('3-12', 'Page 3-12'), gleicheSeite('Page 1', 'Seite 1')]).toEqual([true, true, false, true, false])
    })
  })
})
