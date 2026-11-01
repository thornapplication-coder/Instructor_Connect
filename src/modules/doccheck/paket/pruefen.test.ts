import { describe, expect, it } from 'vitest'
import { anhangListe, editierabstand, gruppenTyp, jaccard, paketPruefen, stundenangaben, uebersicht, wortDiff, type Mitglied } from './pruefen'

const m = (id: string, ebene: number, text: string, x: Partial<Mitglied> = {}): Mitglied => ({
  id, dokName: `Doc ${id}`, kuerzel: id, ebene, gruppe: '', variante: '', revision: '', datum: '', pages: [{ index: 1, text }], ...x,
})

describe('Anhangsliste (N1.2)', () => {
  it('Listeneinträge am Zeilenanfang; Sätze, Verweise und Inhaltsverzeichnis-Seitenzahlen richtig behandelt', () => {
    const tm = m('TM', 1, 'Appendix 4 – Line Training\nAnnex 2a: FFS\nAPX 4 – doppelt\nAppendix 5 describes the test.\nSee Appendix 6 for details\nAnhang 7 Prüfung ..... 12\nAnlage B\tReserved')
    expect(anhangListe(tm).map((e) => [e.bezeichnung, e.titel])).toEqual([['APX 4', 'Line Training'], ['ANX 2A', 'FFS'], ['APX 7', 'Prüfung'], ['ANX B', 'Reserved']])
  })

  it('Lücke, Reserved ohne Befund, nicht gelistet, Titel weicht ab', () => {
    const r = paketPruefen([
      m('TM', 1, 'Appendix 4 – Line Training\nAppendix 6 – Proficiency\nAnnex 9 – Reserved'),
      m('APX 4', 2, 'x', { dokName: 'Appendix 4 Line Flying' }),
      m('ANX 1', 3, 'y'),
    ])
    expect(r.befunde.map((b) => [b.dokId, b.kategorie, b.text.slice(0, 30)])).toEqual([
      ['APX 4', 'Inconsistency', 'Title of APX 4 does not match '],
      ['TM', 'Gap', 'APX 6 is listed in TM but is n'],
      ['TM', 'Document Control', 'ANX 1 is part of the package b'],
    ])
    expect(r.befunde.every((b) => b.quelle === 'paket' && /^P-\d\d$/.test(b.id))).toBe(true)
  })

  it('ohne Liste im TM: Prüfpunkt nicht anwendbar, kein Befund', () => {
    const r = paketPruefen([m('TM', 1, 'Kein Verzeichnis'), m('APX 1', 2, 'x')])
    expect(r.ampel.liste).toBe('na')
    expect(r.befunde).toEqual([])
  })
})

describe('Revisionsstand und Hierarchie', () => {
  it('Übersicht nach Ebene und Kürzel (numerisch), Abweichungen zum Dokument der Ebene 1', () => {
    const z = uebersicht([m('ANX 10', 3, '', { revision: 'R1' }), m('ANX 9', 3, '', { revision: 'R2', datum: '2026-01-01' }), m('TM', 1, '', { revision: 'R1', datum: '2026-02-01' })])
    expect(z.map((x) => [x.kuerzel, x.abweichung])).toEqual([['TM', []], ['ANX 9', ['revision', 'datum']], ['ANX 10', []]])
    const r = paketPruefen([m('TM', 1, '', { revision: 'R1', datum: '2026-02-01' }), m('ANX 9', 3, '', { revision: 'R2', datum: '2026-01-01' })])
    expect(r.befunde.map((b) => b.text.slice(0, 8))).toEqual(['Revision', 'Date of '])
  })

  it('Stundenangaben: Zahl, Komma, H:MM; Bezeichnung normalisiert', () => {
    expect(stundenangaben(m('x', 1, 'WBT: 2,5 h\nFFS Training – 16:30 hours\nTotal 40 hours\nGround – 12 Std.')).map((s) => [s.schluessel, s.stunden])).toEqual([['wbt', 2.5], ['ffstraining', 16.5], ['ground', 12]])
  })

  it('Befund beim tieferen Dokument gegen das NÄCHSThöhere mit derselben Angabe; gleiche Werte kein Befund', () => {
    const r = paketPruefen([
      m('TM', 1, 'WBT: 2 h\nFFS: 16 h'),
      m('APX 1', 2, 'WBT: 3 h'),
      m('ANX 1', 3, 'WBT: 4 h\nFFS: 16 h'),
    ])
    expect(r.befunde.map((b) => [b.dokId, b.weitere?.[0].dokId, b.prioritaet])).toEqual([['APX 1', 'TM', 'High'], ['ANX 1', 'APX 1', 'High']])
    expect(r.ampel.hierarchie).toBe('bad')
  })

  it('Einzeldokument: Stand und Hierarchie nicht anwendbar, Geschwister auch nicht', () => {
    expect(paketPruefen([m('TM', 1, 'x')]).ampel).toEqual({ liste: 'na', stand: 'na', hierarchie: 'na', geschwister: 'na', gegenfassung: 'na', propagation: 'na', verweise: 'na' })
  })
})

describe('Geschwister (N2)', () => {
  const mp = (text: string) => m('ANX 2A', 3, text, { gruppe: 'G', variante: 'MP' })
  const sp = (text: string) => m('ANX 2B', 3, text, { gruppe: 'G', variante: 'SP' })

  it('Hilfsfunktionen: Jaccard, Wortdiff, Editierabstand, Gruppentyp', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3)
    expect(jaccard([], [])).toBe(0)
    expect(wortDiff(['a', 'b', 'c'], ['a', 'x', 'c', 'd'])).toEqual({ weg: ['b'], neu: ['x', 'd'] })
    expect(wortDiff(['a', 'b'], [])).toEqual({ weg: ['a', 'b'], neu: [] })
    expect(editierabstand('receive', 'recieve')).toBe(2)
    expect(gruppenTyp(['MP', 'SP'])).toBe('MP_SP')
    expect(gruppenTyp(['A', 'B'])).toBeNull()
    expect(gruppenTyp([])).toBeNull()
  })

  it('erlaubte Unterschiede (Begriffe der Fassung, Variantenbezeichnung, Kürzel) erzeugen nichts', () => {
    const r = paketPruefen([mp('Annex 2A FFS Training MP version text\nThe Captain and the First Officer review the briefing notes together.'), sp('Annex 2B FFS Training SP version text\nThe and the review the briefing notes together.')])
    expect(r.befunde).toEqual([])
    expect(r.ampel).toMatchObject({ geschwister: 'ok', gegenfassung: 'ok', propagation: 'na' })
  })

  it('verdächtiger Unterschied beim zweiten Mitglied, mit Verweis aufs erste', () => {
    const r = paketPruefen([mp('Each session lasts four hours with briefing.'), sp('Each session lasts three hours with briefing.')])
    expect(r.befunde).toEqual([expect.objectContaining({ dokId: 'ANX 2B', pruefpunkt: 'geschwister', kategorie: 'Inconsistency', weitere: [expect.objectContaining({ dokId: 'ANX 2A' })] })])
    expect(r.befunde[0].text).toContain('"four" (ANX 2A) vs "three" (ANX 2B)')
    // Wort fehlt nur auf einer Seite
    const nur = paketPruefen([mp('The trainee completes the written exam today.'), sp('The trainee completes the exam today.')])
    expect(nur.befunde[0].text).toContain('"written" (ANX 2A) vs nothing in ANX 2B')
  })

  it('Tippfehler: beim Dokument mit dem Wort, das sonst nirgends steht — in beide Richtungen; unentschieden → Inkonsistenz', () => {
    const tm = m('TM', 1, 'Pilots receive the syllabus.')
    const a = paketPruefen([tm, mp('The trainee shall recieve a briefing.'), sp('The trainee shall receive a briefing.')])
    expect(a.befunde).toEqual([expect.objectContaining({ dokId: 'ANX 2A', kategorie: 'Editorial', weitere: [expect.objectContaining({ dokId: 'ANX 2B' })] })])
    const b = paketPruefen([tm, mp('The trainee shall receive a briefing.'), sp('The trainee shall recieve a briefing.')])
    expect(b.befunde[0]).toMatchObject({ dokId: 'ANX 2B', kategorie: 'Editorial' })
    const offen = paketPruefen([mp('The trainee shall receive a briefing.'), sp('The trainee shall recieve a briefing.')])
    expect(offen.befunde[0]).toMatchObject({ dokId: 'ANX 2B', kategorie: 'Inconsistency' })
    expect(offen.befunde[0].text).toContain('differ in spelling')
  })

  it('Reste der Gegenfassung: Akronyme mit Groß-/Kleinschreibung, Wörter ohne', () => {
    const r = paketPruefen([mp('x'), sp('The PM checks.\nThe Crew briefs.\nPMs are not meant.\nwe use pm in lower case.')])
    expect(r.befunde.map((b) => b.text.slice(0, 40))).toEqual(['"PM" belongs to the MP version but appea', '"crew" belongs to the MP version but app'])
    expect(r.befunde[0].fundstellen).toEqual([{ seite: '1', auszug: 'The PM checks.' }])
  })

  it('Gruppe ohne Regeltyp: kein Gegenfassungs-Prüfpunkt; Gruppe aus einem Mitglied zählt nicht', () => {
    const r = paketPruefen([m('A', 3, 'x', { gruppe: 'G', variante: 'A' }), m('B', 3, 'x', { gruppe: 'G', variante: 'B' })])
    expect(r.ampel).toMatchObject({ geschwister: 'ok', gegenfassung: 'na' })
    expect(paketPruefen([m('A', 3, 'x', { gruppe: 'G' }), m('B', 3, 'x')]).ampel.geschwister).toBe('na')
  })

  it('Fix-Propagation: Korrektur aus dem Re-Check fehlt im Geschwister; ohne Gruppe oder ohne Rest nichts', () => {
    const r = paketPruefen([mp('The trainee shall receive it.'), sp('The trainee shall recieve it.')], [
      { ref: '7', dokId: 'ANX 2A', weg: 'recieve' },
      { ref: '8', dokId: 'ANX 2A', weg: 'nirgends' },
      { ref: '9', dokId: 'fehlt', weg: 'recieve' },
    ])
    expect(r.befunde.filter((b) => b.pruefpunkt === 'propagation')).toEqual([expect.objectContaining({ dokId: 'ANX 2B', text: expect.stringContaining('finding 7 was corrected in ANX 2A') })])
    expect(paketPruefen([m('X', 1, 'recieve')], [{ ref: '1', dokId: 'X', weg: 'recieve' }]).befunde).toEqual([])
  })
})

describe('Verweise zwischen Dokumenten (N7)', () => {
  const tm = (text: string, x: Partial<Mitglied> = {}) => m('TM', 1, text, x)
  it('Annex statt Appendix; fehlende Quelle zusammengefasst je Dokument; eigenes Dokument per Kürzel', () => {
    const r = paketPruefen([
      tm('See Annex 9.\nSee OMM 1.2 and OMM 3.4.\nSee TM 7.1.', { outline: [{ titel: '1 General' }] }),
      m('APX 9', 2, '1 Intro', { outline: [{ titel: '1 Intro' }] }),
    ])
    const v = r.befunde.filter((b) => b.pruefpunkt === 'verweise')
    expect(v.map((b) => [b.text.split(/[,:—]/)[0].trim(), b.verifizierung])).toEqual([
      ['Reference to Annex 9', 'Verified (rule-based)'],
      ['Reference to TM chapter 7.1', 'Verified (rule-based)'],
      ['Reference to OMM cannot be verified', 'Not verifiable – source missing'],
    ])
    expect(v[2].fundstellen).toHaveLength(1)
    expect(v[2].text).toContain('(2×)')
  })

  it('Ziel ohne erkennbare Gliederung: keine Aussage; Zirkel in EINEM Dokument meldet das Dokument selbst', () => {
    expect(paketPruefen([tm('See APX 1, chapter 9.'), m('APX 1', 2, 'Freitext ohne Nummern')]).befunde).toEqual([])
    const o = [{ titel: '1 A' }, { titel: '2 B' }]
    const r = paketPruefen([tm('1 A\nSee TM chapter 2.\n2 B\nSee TM chapter 1.', { outline: o })])
    expect(r.befunde).toEqual([])
    expect(r.ampel.verweise).toBe('ok')
  })
})

