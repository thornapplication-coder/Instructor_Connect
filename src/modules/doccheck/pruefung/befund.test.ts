import { describe, expect, it } from 'vitest'
import de from '../i18n/de.json'
import en from '../i18n/en.json'
import { ampelAus, anzahl, gate, idsVergeben, lesestand, leseMeldung, nichtBewertbar, regelStand, sortieren, VOLL_GELESEN, type Befund } from './befund'

const b = (p: Partial<Befund>): Befund => ({
  id: 'x', quelle: 'formal', pruefpunkt: 'reste', kategorie: 'Editorial', prioritaet: 'Low', dokId: 'd', dokName: 'A', text: 't', fundstellen: [], verifizierung: 'Verified (rule-based)', status: 'Open', ...p,
})

describe('Befunde', () => {
  it('sortiert nach Priorität, dann Dokument, dann Prüfpunkt', () => {
    const s = sortieren([b({ prioritaet: 'Low', dokName: 'A' }), b({ prioritaet: 'High', dokName: 'B' }), b({ prioritaet: 'Medium', dokName: 'A', pruefpunkt: 'z' }), b({ prioritaet: 'Medium', dokName: 'A', pruefpunkt: 'a' })])
    expect(s.map((x) => [x.prioritaet, x.pruefpunkt])).toEqual([['High', 'reste'], ['Medium', 'a'], ['Medium', 'z'], ['Low', 'reste']])
  })

  it('Ampel: Hoch → rot, sonst gelb, ohne Befund grün, nicht anwendbar grau', () => {
    expect(ampelAus(['reste', 'lep', 'toc', 'nr'], [b({ prioritaet: 'High' }), b({ pruefpunkt: 'lep' })], ['nr'])).toEqual({ reste: 'bad', lep: 'wait', toc: 'ok', nr: 'na' })
  })

  it('Einzahl und Mehrzahl statt „(s)" (Audit 11/2026, TXT-07)', () => {
    expect([anzahl(1, 'paragraph'), anzahl(3, 'paragraph'), anzahl(0, 'place'), anzahl(2, 'entry', 'entries')]).toEqual(['1 paragraph', '3 paragraphs', '0 places', '2 entries'])
  })

  it('IDs je Quelle fortlaufend und lesbar', () => {
    const { id: _i, ...ohne } = b({})
    void _i
    expect(idsVergeben([ohne, { ...ohne, quelle: 'word' }, ohne, { ...ohne, quelle: 'sprache' }]).map((x) => x.id)).toEqual(['F-01', 'W-01', 'F-02', 'L-01'])
  })

  it('Gate (N4.3): warnt ab Werk, sperrt nur, wenn eingestellt', () => {
    expect(gate([b({ prioritaet: 'High' })], false, VOLL_GELESEN)).toEqual({ einreichungsfaehig: false, bewertbar: true, grund: null, hoch: 1, gesperrt: false })
    expect(gate([b({ prioritaet: 'High' })], true, VOLL_GELESEN).gesperrt).toBe(true)
    expect(gate([b({})], true, VOLL_GELESEN)).toEqual({ einreichungsfaehig: true, bewertbar: true, grund: null, hoch: 0, gesperrt: false })
  })

  it('Gate mit Seiten ohne Textebene: nicht bewertbar statt einreichungsfähig (Audit 11/2026, DC-03)', () => {
    // Ein Scan ohne OCR ergab 0 Befunde und damit „einreichungsfähig"
    const scan = lesestand([{ ocrKandidaten: [1], pruefung: { ohneText: true } }])
    expect(scan).toEqual({ ocrSeiten: 1, ohneText: 1 })
    expect(gate([], false, scan)).toEqual({ einreichungsfaehig: false, bewertbar: false, grund: 'ocr', hoch: 0, gesperrt: false })
    // Sperre nur, wenn eingestellt — ab Werk warnt das Gate (01.11.2026)
    expect(gate([], true, scan).gesperrt).toBe(true)
    // Teilweise gescannt: Die gelesenen Seiten sind geprüft, das Dokument ist es nicht
    expect(gate([b({})], false, lesestand([{ ocrKandidaten: [] }, { ocrKandidaten: [4, 5] }]))).toMatchObject({ bewertbar: false, grund: 'ocr', einreichungsfaehig: false })
    // Kein Text und nichts zum Erkennen (z. B. Text als Vektorpfade)
    expect(nichtBewertbar(lesestand([{ ocrKandidaten: [], pruefung: { ohneText: true } }]))).toBe('ohneText')
    expect(nichtBewertbar(lesestand([{ ocrKandidaten: [], pruefung: {} }, { ocrKandidaten: [] }]))).toBeNull()
    // Ein offener Hoch-Befund bleibt der Grund, warum es nicht einreichungsfähig ist
    expect(gate([b({ prioritaet: 'High' })], false, scan)).toMatchObject({ hoch: 1, bewertbar: false, einreichungsfaehig: false })
  })

  it('Prüfung-Reiter: ein Scan ohne Textebene ist nicht „geprüft: 0 Befunde" (Audit 11/2026, DC-03, Nachtrag DCF#5)', () => {
    const scan = { ocrKandidaten: [1], pruefung: { befunde: [], ohneText: true as const } }
    // Vorher: „1 Prüfdokument geprüft: 0 Befunde, davon 0 hoch."
    expect(regelStand([scan])).toEqual({ geprueft: 0, befunde: 0, hoch: 0, ocr: 1, ohneText: 0 })
    // Teilweise gescannt: geprüft, was gelesen ist, und zugleich nicht bewertbar — wie im Gate
    const teil = { ocrKandidaten: [4], pruefung: { befunde: [b({ prioritaet: 'High' }), b({})] } }
    expect(regelStand([scan, teil])).toEqual({ geprueft: 1, befunde: 2, hoch: 1, ocr: 2, ohneText: 0 })
    // Kein Text und nichts zu erkennen (Text als Vektorpfade): eigener Grund
    expect(regelStand([{ ocrKandidaten: [], pruefung: { befunde: [], ohneText: true } }])).toMatchObject({ geprueft: 0, ocr: 0, ohneText: 1 })
    // Trägt ein Dokument ohne Text dennoch einen Befund (Register, Word-Eigenschaften), ist es geprüft —
    // sonst stünde ein Befund ohne gezähltes Dokument da
    expect(regelStand([{ ocrKandidaten: [], pruefung: { befunde: [b({})], ohneText: true } }])).toMatchObject({ geprueft: 1, befunde: 1, ohneText: 1 })
    // Noch nicht gelesen (keine Prüfung) zählt nirgends; voll gelesen ohne Befund ist geprüft
    expect(regelStand([{ ocrKandidaten: [] }, { ocrKandidaten: [], pruefung: { befunde: [] } }])).toEqual({ geprueft: 1, befunde: 0, hoch: 0, ocr: 0, ohneText: 0 })
  })

  it('Lese-Toast: „geprüft – 0 Befunde" nur, wo eine Prüfung lief und Text hatte (Audit 11/2026, DC-03, Nachtrag DCF#5)', () => {
    const faelle = [
      leseMeldung({ ocrKandidaten: [], pruefung: { befunde: [b({}), b({})] } }),
      leseMeldung({ ocrKandidaten: [1, 2], pruefung: { befunde: [], ohneText: true } }),
      leseMeldung({ ocrKandidaten: [], pruefung: { befunde: [], ohneText: true } }),
      // Sitzungsdokument (Master) bzw. Prüfdokument mit abgeschalteten Prüfungen: vorher „gelesen und geprüft – 0 Befunde"
      leseMeldung({ ocrKandidaten: [] }),
      // Gescannter Master: Texterkennung ja, „nicht bewertbar" nein — bewertet wird er nicht
      leseMeldung({ ocrKandidaten: [3] }),
    ]
    expect(faelle).toEqual([
      { schluessel: 'gelesen', count: 2 },
      { schluessel: 'gelesenOcr', count: 2, ton: 'wait' },
      { schluessel: 'gelesenOhneText', ton: 'wait' },
      { schluessel: 'gelesenUngeprueft' },
      { schluessel: 'gelesenOcrUngeprueft', count: 1, ton: 'wait' },
    ])
    // Der Schlüssel wird in der Ansicht zusammengesetzt — die statische Schlüsselwache sieht ihn nicht
    for (const sprache of [de, en]) {
      const upload = sprache.upload as Record<string, unknown>
      for (const { schluessel, count } of faelle) expect(upload[count === undefined ? schluessel : `${schluessel}_other`], schluessel).toBeTruthy()
      expect(upload.gelesenUngeprueft).not.toMatch(/geprüft|checked/)
    }
  })
})
