import { describe, expect, it } from 'vitest'
import { LEERE_LENKUNG, type Rohdokument, type WortAbsatz } from '../parse/model'
import { REGELN } from './kontext'
import { SPRACH_PUNKTE, sprachCheck } from './sprachCheck'

const roh = (text: string): Rohdokument => ({ format: 'pdf', pages: [{ index: 1, label: '3', text }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 0 })
const pruefe = (text: string) => sprachCheck({ dokId: 'd', dokName: 'D', roh: roh(text), meta: {}, regeln: REGELN })

describe('Sprache und Platzhalter — Grenzfälle', () => {
  it('fremdsprachiger Absatz ohne Arbeitsauftrag ist Mittel; Seite wird genannt', () => {
    const r = pruefe('The pilot shall check the system and the crew is in the aircraft.\nThe instructor will brief the trainee on all items of the lesson.\nDie Besatzung ist mit dem Flugzeug vertraut und kennt die Verfahren.')
    const b = r.befunde.find((x) => x.pruefpunkt === 'fremdsprache')!
    expect(b.prioritaet).toBe('Medium')
    expect(b.fundstellen[0].seite).toBe('3')
  })

  it('ohne erkennbare Dokumentsprache: Sprachprüfung nicht anwendbar, Platzhalter trotzdem', () => {
    const r = pruefe('VMO 320\nAT-FFS-nnnn')
    expect(r.sprache).toBeNull()
    expect(r.ampel).toEqual({ fremdsprache: 'na', einschuebe: 'na', platzhalter: 'wait' })
    expect(Object.keys(r.ampel)).toEqual([...SPRACH_PUNKTE])
  })

  it('Zitat in Landessprache wird nicht gemeldet', () => {
    const r = pruefe('The pilot shall check the system and the crew is in the aircraft.\n„Bitte nicht berühren und nicht entfernen, das ist wichtig“')
    expect(r.befunde.filter((b) => b.pruefpunkt === 'fremdsprache')).toEqual([])
  })

  it('Befundtexte: Einzahl, „a language other than", Kongruenz (Audit 11/2026, TXT-07)', () => {
    const de = 'Die Besatzung ist mit dem Flugzeug vertraut und kennt die Verfahren.'
    const en = 'The pilot shall check the system and the crew is in the aircraft.'
    const text = (t: string) => pruefe(t).befunde.find((b) => b.pruefpunkt === 'fremdsprache')!.text
    expect(text(`${en}\n${en}\n${de}`)).toBe('Text in a language other than the document language (en) in 1 paragraph.')
    expect(text(`${en}\n${en}\n${en}\nBitte noch prüfen, das ist nicht aktuell und muss geändert werden.`)).toBe('Text in a language other than the document language (en) in 1 paragraph, which looks like a working comment.')
    expect(text(`${en}\n${en}\n${en}\n${en}\n${de}\nBitte noch prüfen, das ist nicht aktuell und muss geändert werden.`)).toBe('Text in a language other than the document language (en) in 2 paragraphs; 1 of them looks like a working comment.')
    expect(pruefe('AT-FFS-nnnn').befunde[0].text).toBe('1 placeholder still in the document (number placeholders, _XX suffixes, fill-in lines).')
  })
})

describe('Eigennamen in deutschen Dokumenten (Audit 11/2026, FRD-17)', () => {
  const deutsch = ['Dieses Ausbildungshandbuch beschreibt die Ausbildung zur Nachtflugberechtigung an der ATO.', 'Die Wolkenuntergrenze muss mindestens 1 500 ft über Grund betragen und die Sicht ist gut.']

  it('PDF-Zeile „SERA | Standardised European Rules of the Air" ist kein fremdsprachiger Rest; ein englischer Arbeitskommentar bleibt Hoch', () => {
    const r = pruefe([...deutsch, 'SERA | Standardised European Rules of the Air', 'Please check the values before the release of the manual.'].join('\n'))
    expect(r.sprache).toBe('de')
    const b = r.befunde.find((x) => x.pruefpunkt === 'fremdsprache')!
    expect(b.prioritaet).toBe('High')
    expect(b.fundstellen.map((f) => f.auszug)).toEqual(['Please check the values before the release of the manual. [en]'])
  })

  it('DOCX-Zelle neben ihrem Kürzel — über die erste Zelle der Zeile', () => {
    const absatz = (nr: number, text: string, extra: Partial<WortAbsatz> = {}): WortAbsatz => ({ nr, text, ort: 'body', teil: 'word/document.xml', sektion: 1, seiteCa: 1, ...extra })
    const zellen = (zeile: number, a: string, b: string, nr: number) => [absatz(nr, a, { tabelle: { zeile, spalte: 0 } }), absatz(nr + 1, b, { tabelle: { zeile, spalte: 1 } })]
    const absaetze = [
      ...deutsch.map((t, i) => absatz(i, t)),
      ...zellen(0, 'SERA', 'Standardised European Rules of the Air', 10),
      // Kürzel, aber keine Auflösung und kein Name: ein englischer Rest
      ...zellen(1, 'MMO', 'This value is not valid for the aircraft of the operator.', 12),
    ]
    const roh: Rohdokument = { format: 'docx', pages: [{ index: 1, text: absaetze.map((a) => a.text).join('\n') }], outline: [], lenkung: LEERE_LENKUNG, ocrKandidaten: [], tabellen: 1, word: { absaetze, laeufe: [], abschnitte: [], verwaisteKopfFuss: [], standard: {}, eigenschaften: {}, toc: [] } }
    const r = sprachCheck({ dokId: 'd', dokName: 'D', roh, meta: {}, regeln: REGELN })
    expect(r.befunde.find((x) => x.pruefpunkt === 'fremdsprache')!.fundstellen.map((f) => [f.ort, f.auszug])).toEqual([['Table row 2, column 2', 'This value is not valid for the aircraft of the operator. [en]']])
  })
})
