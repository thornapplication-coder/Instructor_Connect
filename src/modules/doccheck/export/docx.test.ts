import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { datenstand, FUSS_MAX, fussText, LABELS } from './datenstand'
import { befund, dok, eingabe } from './beispiel'
import { berichtAbschnitte, docxExport, kategorienZeilen } from './docx'

const dokumentXml = async (d: Uint8Array) => (await JSZip.loadAsync(d)).file('word/document.xml')!.async('string')

describe('Word-Prüfbericht (Spez. v1.1 Kap. 10.5)', async () => {
  const d = datenstand(eingabe())
  const xml = await dokumentXml(await docxExport(d))
  const text = xml.replace(/<[^>]+>/g, '')

  it('alle Befund-IDs und die Gesamtbewertung — dieselben wie im Datenstand', () => {
    for (const b of d.befunde) expect(text).toContain(b.id)
    expect(text).toContain('Document Review Report')
    expect(text).toContain('Not ready for submission')
    expect(text).toContain('AI-assisted review – expert approval required')
    expect(text).toContain('DC-2026-11-01-0007')
  })

  it('kein Inhaltsverzeichnis-Feld (kein Aktualisierungsdialog), interne Links auf Textmarken', () => {
    expect(xml).not.toMatch(/TOC \\/)
    expect(xml).not.toContain('w:fldSimple')
    for (const a of ['control', 'executive', 'top5', 'findings', 'matrix', 'sources', 'method', 'approval']) {
      expect(xml).toContain(`w:anchor="${a}"`)
      expect(xml).toMatch(new RegExp(`<w:bookmarkStart[^>]*w:name="${a}"`))
    }
  })

  it('Befunde im Querformat, Kopfzeile wiederholt, Zeilen ungeteilt, nach Kapitel gruppiert', () => {
    expect(xml).toContain('w:orient="landscape"')
    expect(xml).toContain('<w:tblHeader/>')
    expect(xml).toContain('<w:cantSplit/>')
    expect(text).toContain('Training Manual CL30 — 2.1 Hours')
    expect(text).toContain('Package — Without chapter')
    expect(berichtAbschnitte(d)).toHaveLength(4)
  })

  it('Revisionsprüfung nennt ehrlich, was fehlt; 0 Befunde und ohne Organisation bleibt gültig', async () => {
    const rev = await dokumentXml(await docxExport(datenstand(eingabe({ art: 'revision' }))))
    expect(rev).toContain('Revision comparison and HoC draft are part of phase 9')
    const leer = (await dokumentXml(await docxExport(datenstand(eingabe({ befunde: [], ampeln: [], organisation: '' }))))).replace(/<[^>]+>/g, '')
    expect(leer).toContain('No findings.')
    expect(leer).toContain('Ready for submission')
    expect(leer).not.toContain('Example ATO')
  })

  it('Scope nennt die gelaufenen Prüfungen; Seiten englisch (Audit 11/2026, EXP-01/DC-12, EXP-07/TXT-01)', async () => {
    expect(text).toContain(`Scope: ${LABELS.checks.formal}, ${LABELS.checks.word}, ${LABELS.checks.paket}.`)
    expect(text).not.toMatch(/Calculations & plausibility|Regulatory references/)
    // Top 5 und Befundtabelle: „Page 3", kein „S. 3"
    expect(text).toContain('Training Manual CL30 · 2.1 Hours · Page 3')
    expect(text).not.toMatch(/\b(S\.|ca\.) \d/)
    const ohnePaket = (await dokumentXml(await docxExport(datenstand(eingabe({ paketGeprueft: false, befunde: [], ampeln: [{ dokId: 'tm', gruppen: { rechnen: { summen: 'ok' } } }] }))))).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
    expect(ohnePaket).toContain(`Scope: ${LABELS.checks.rechnen}.`)
  })

  it('Deckblatt nennt Hauptdokument und weitere Prüfdokumente (Audit 11/2026, EXP-08)', () => {
    expect(text).toContain('Training Manual CL30 · TM-CL30 · Rev 0.1 · 2026-10-01 + 1 further document (see “Documents &amp; Sources”)')
  })
})

describe('Word: Satz der Tabellen, Fußzeile, Kennzahlen wie Excel (Audit 11/2026, EXP-19)', async () => {
  const d = datenstand(eingabe({ datum: '2026-11-02T00:30:00+01:00' }))
  const zip = await JSZip.loadAsync(await docxExport(d))
  const xml = await zip.file('word/document.xml')!.async('string')
  const zeilen = (t: string) => (t.match(/<w:tr>.*?<\/w:tr>/gs) ?? []).map((r) => (r.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, '')))
  const tabelleMit = (kopf: string) => (xml.match(/<w:tbl>.*?<\/w:tbl>/gs) ?? []).find((t) => zeilen(t)[0]?.[0] === kopf)!

  it('Kategorientabelle mit Total und To verify — dieselben Zahlen wie das Excel-Blatt „Summary"', () => {
    // Vorher endete die Tabelle nach „Recommendation"; Total und To verify gab es nur im Excel
    const t = zeilen(tabelleMit('Category'))
    expect(t.at(-2)).toEqual(['Total', '2', '2', '1', '5'])
    expect(t.at(-1)).toEqual(['To verify', '', '', '', '1'])
    expect(kategorienZeilen(d).slice(-2)).toEqual([['Total', '2', '2', '1', '5'], ['To verify', '', '', '', String(d.zuPruefen)]])
    // Summenzeilen fett
    expect(tabelleMit('Category').split('<w:tr>').at(-1)).toContain('<w:b/>')
    const leer = datenstand(eingabe({ befunde: [] }))
    expect(kategorienZeilen(leer).slice(-2)).toEqual([['Total', '0', '0', '0', '0'], ['To verify', '', '', '', '0']])
  })

  it('Report history: Zeitstempel mit Uhrzeit und Versatz, nicht nur der Tag', () => {
    // Vorher „Timestamp" = d.datum — zwei Exporte desselben Tages sahen gleich aus
    expect(zeilen(tabelleMit(LABELS.ident.exportId))[1]).toEqual(['DC-2026-11-02-0007', '2026-11-02T00:30:00+01:00', 'InstructorConnect 1.22.0 · Layout 1.0'])
  })

  it('Top 5: ID- und Referenzspalte 12 % breit, IDs unverändert (kein geschützter Bindestrich)', () => {
    // Vorher 10 %: „DOC3-|001" und der Kopf „Referenc|e" brachen um
    const t = tabelleMit('ID')
    const breiten = [...t.split('<w:tr>')[1].matchAll(/<w:tcW w:type="pct" w:w="(\d+)%?"\/>/g)].map((m) => m[1])
    // Prozent in Fünfzigsteln (OOXML pct): 600 = 12 %
    expect(breiten).toEqual(['600', '900', '1500', '1400', '600'])
    expect(zeilen(t).slice(1).map((z) => z[0])).toEqual(d.top5)
    expect(xml).not.toContain('w:noBreakHyphen')
    expect(xml).not.toContain('\u2011')
  })

  it('Fußzeile: gekürzte Angabe mit ganzer Export-ID, danach Seite und Disclaimer', async () => {
    const lang = datenstand(eingabe({ organisation: 'Aviation Academy Austria GmbH & Co KG <Test> – Ä Ö Ü ß', dokumente: [{ ...d.dokumente[0], titel: 'Training Manual (synthetic)', revision: 'Edition 1 Revision 0.0' }, ...d.dokumente.slice(1)] }))
    const fz = await (await JSZip.loadAsync(await docxExport(lang))).file('word/footer1.xml')!.async('string')
    const text = fz.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    expect(fussText(lang).length).toBeLessThanOrEqual(FUSS_MAX)
    expect(text.startsWith(`${fussText(lang)} · Page `)).toBe(true)
    expect(fussText(lang).endsWith(' · DC-2026-11-01-0007')).toBe(true)
  })
})

describe('Word: Ampel als Matrix in der Executive Summary (Audit 11/2026, EXP-10)', async () => {
  // Paket aus 7 Dokumenten × 19 Prüfpunkten — vorher 133 Tabellenzeilen, acht Seiten mitten in der Zusammenfassung
  const punkte = Array.from({ length: 19 }, (_, i) => `p${String(i).padStart(2, '0')}`)
  const ampelVon = (k: number) => Object.fromEntries(punkte.map((p, i) => [p, (['ok', 'wait', 'bad', 'na'] as const)[(i + k) % 4]]))
  const paket = (n: number) => {
    const ids = Array.from({ length: n }, (_, i) => `d${i}`)
    return datenstand(eingabe({ dokumente: ids.map((id, i) => dok(id, 'review', { titel: `Doc ${i}`, typ: i === 0 ? 'TM' : '' })), befunde: [], ampeln: ids.map((dokId, k) => ({ dokId, gruppen: { formal: ampelVon(k) } })) }))
  }
  const tabellen = async (n: number) => {
    const xml = await dokumentXml(await docxExport(paket(n)))
    const alle = xml.match(/<w:tbl>.*?<\/w:tbl>/gs) ?? []
    return alle.filter((t) => t.replace(/<[^>]+>/g, ' ').includes(LABELS.report.checkpoint)).map((t) => (t.match(/<w:tr>.*?<\/w:tr>/gs) ?? []).map((r) => r.replace(/<[^>]+>/g, ' ').trim().split(/\s{2,}/)))
  }

  it('7 Dokumente × 19 Punkte: EINE Tabelle mit höchstens 20 Zeilen, jeder Prüfpunkt genau einmal', async () => {
    const [matrix, ...rest] = await tabellen(7)
    expect(rest).toEqual([])
    expect(matrix.length).toBeLessThanOrEqual(20)
    expect(matrix[0]).toEqual([LABELS.report.checkpoint, 'TM', 'DOC1', 'DOC2', 'DOC3', 'DOC4', 'DOC5', 'DOC6'])
    const zeilen = matrix.slice(1).map((z) => z[0])
    expect(zeilen).toHaveLength(19)
    expect(new Set(zeilen).size).toBe(19)
    // Zellen: Green/Yellow/Red ausgeschrieben, „n.a." kurz
    expect(matrix[1].slice(1)).toEqual(['Green', 'Yellow', 'Red', 'n.a.', 'Green', 'Yellow', 'Red'])
  })

  it('Legende unter der Matrix; Prüfpunkt, der für ein Dokument nicht lief, heißt „–"', async () => {
    const d = datenstand(eingabe({ ampeln: [{ dokId: 'tm', gruppen: { formal: { lep: 'ok' }, word: { unsichtbar: 'bad' } } }, { dokId: 'apx', gruppen: { formal: { lep: 'na' } } }] }))
    const t = (await dokumentXml(await docxExport(d))).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
    expect(t).toContain('TM = Training Manual CL30 · TM2 = Appendix 4 – Line Training. n.a. = Not applicable; – = not checked for this document.')
    expect(t).toMatch(/Word check – \S.* Red – /)
    // Die alte Zeilenliste Dokument × Prüfpunkt ist weg
    expect(t).not.toContain('Document Group Checkpoint Status')
  })

  it('mehr als 7 Dokumente: eine weitere Matrix für die nächsten, keine Zeilenliste', async () => {
    const m = await tabellen(9)
    expect(m).toHaveLength(2)
    expect(m.map((t) => t[0].length - 1)).toEqual([7, 2])
    expect(m.every((t) => t.length === 20)).toBe(true)
  })
})

describe('Word: Sprache, Eigenschaften, Gliederung, Top-5-Köpfe (Audit 11/2026, EXM-02/EXM-03/EXM-07, TXT-16)', async () => {
  const d = datenstand(eingabe())
  const zip = await JSZip.loadAsync(await docxExport(d))
  const teil = (p: string) => zip.file(p)!.async('string')
  const stil = async (id: string) => (await teil('word/styles.xml')).match(new RegExp(`<w:style [^>]*w:styleId="${id}".*?</w:style>`, 's'))?.[0] ?? ''

  it('Sprache en-GB in der Dokumentvorgabe, nirgends eine andere (EXM-02)', async () => {
    // Vorher: kein w:lang — Word/LibreOffice prüften gegen die eigene Bearbeitungssprache, das PDF hieß de-DE
    const styles = await teil('word/styles.xml')
    expect(styles.match(/<w:rPrDefault>.*?<\/w:rPrDefault>/s)?.[0]).toContain('<w:lang w:val="en-GB"/>')
    for (const p of Object.keys(zip.files).filter((x) => /^word\/.*\.xml$/.test(x))) expect(await teil(p), p).not.toMatch(/<w:lang w:val="(?!en-GB")/)
  })

  it('Eigenschaften fachlich, ohne die Vorgabe „Un-named" (EXM-03)', async () => {
    const core = await teil('docProps/core.xml')
    expect(core).not.toContain('Un-named')
    expect(core).toContain('<cp:lastModifiedBy>DocCheck</cp:lastModifiedBy>')
    expect(core).toContain('<dc:subject>DocCheck Review – Training Manual CL30 Rev 0.1 + 1 further document</dc:subject>')
    expect(core).toContain(`<dc:description>${LABELS.disclaimer}</dc:description>`)
  })

  it('Überschriften mit Gliederungsebene 0/1/2 — Navigator und PDF-Lesezeichen in LibreOffice (EXM-07)', async () => {
    // Vorher: Heading1–3 nur mit Abständen; LibreOffice zeigte keine Gliederung, das PDF hatte keine Lesezeichen
    expect(await stil('Heading1')).toContain('<w:outlineLvl w:val="0"/>')
    expect(await stil('Heading2')).toContain('<w:outlineLvl w:val="1"/>')
    expect(await stil('Heading3')).toContain('<w:outlineLvl w:val="2"/>')
    expect(await stil('Body')).not.toContain('w:outlineLvl')
  })

  it('Überschriften bleiben bei ihrem Inhalt — keine allein am Seitenende (Gegenprüfung P7)', async () => {
    // Vorher nur Heading3: „Top 5 Critical Findings" stand im LibreOffice-PDF unten auf Seite 3, die Tabelle auf Seite 4
    for (const h of ['Heading1', 'Heading2', 'Heading3']) expect(await stil(h), h).toContain('<w:keepNext/>')
    expect(await stil('Body')).not.toContain('w:keepNext')
  })

  it('Top 5: Köpfe aus labels.en.json, „Location" wie auf der Folie (TXT-16)', async () => {
    const xml = await teil('word/document.xml')
    const top5 = (xml.match(/<w:tbl>.*?<\/w:tbl>/gs) ?? []).find((t) => t.includes(`>${d.top5[0]}<`))!
    const kopf = (top5.match(/<w:tr>.*?<\/w:tr>/s)![0].match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, ''))
    expect(kopf).toEqual([LABELS.columns[0], LABELS.report.location, LABELS.columns[16], LABELS.columns[17], LABELS.columns[8]])
  })
})

describe('Word: Befunde nach KAPITEL gruppiert, die Stelle darin in der Zeile (Audit 11/2026, Nachtrag TXT#1)', async () => {
  // Vorher gruppierte der Bericht nach dem Ort: „TM — Table row 3, column 2", „TM — docProps/core.xml"
  const d = datenstand(eingabe({
    befunde: [
      befund('F-01', 'tm', { fundstellen: [{ seite: 'S. 3', kapitel: '2.1 Hours', ort: 'Table row 3, column 2', auszug: 'x' }] }),
      befund('F-02', 'tm', { fundstellen: [{ seite: 'S. 3', kapitel: '2.1 Hours', auszug: 'y' }] }),
      befund('F-03', 'tm', { fundstellen: [{ ort: 'Document properties', auszug: 'Title is empty' }] }),
    ],
  }))
  const text = (await dokumentXml(await docxExport(d))).replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')

  it('eine Gruppe je Kapitel, Tabellenzelle und Seite in der Zeile', () => {
    expect(text.match(/Training Manual CL30 — 2\.1 Hours/g)).toHaveLength(1)
    expect(text).toContain('Training Manual CL30 — Document properties')
    expect(text).not.toContain('— Table row')
    expect(text).toContain('2.1 Hours / Table row 3, column 2 / Page 3')
  })
})
