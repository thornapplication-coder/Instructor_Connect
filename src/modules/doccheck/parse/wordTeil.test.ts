import { describe, expect, it } from 'vitest'
import { nummerierungLesen, zaehlerAnlegen } from './nummerierung'
import { stileLesen } from './wordStile'
import { hoch } from './seitenzuordnung'
import { cnf, symbolZeichen, tabellenLook, teilLesen } from './wordTeil'

const st = stileLesen(`<w:styles><w:style w:type="table" w:styleId="T"><w:name w:val="T"/>
  <w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:fill="AAAAAA"/></w:tcPr></w:tblStylePr>
  <w:tblStylePr w:type="band2Horz"><w:tcPr><w:shd w:fill="BBBBBB"/></w:tcPr></w:tblStylePr>
  <w:tblStylePr w:type="firstCol"><w:tcPr><w:shd w:fill="CCCCCC"/></w:tcPr></w:tblStylePr>
  <w:tblStylePr w:type="lastRow"><w:tcPr><w:shd w:fill="DDDDDD"/></w:tcPr></w:tblStylePr></w:style>
  <w:style w:type="paragraph" w:styleId="Shd"><w:name w:val="Shd"/><w:pPr><w:shd w:fill="999999"/></w:pPr></w:style></w:styles>`)
const p = (t: string, pPr = '', rPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t>${t}</w:t></w:r></w:p>`
const lies = (xml: string, ort: 'body' | 'kopf' = 'body') => teilLesen(xml, { teil: 't.xml', ort, stile: st, startNr: 0 })

describe('Bedingungen', () => {
  it('cnfStyle als Attribute oder Bitfolge', () => {
    expect([...cnf({ 'w:firstRow': '1', 'w:lastColumn': 'true', 'w:evenHBand': '1' })].sort()).toEqual(['band2Horz', 'firstRow', 'lastCol'])
    expect([...cnf({ 'w:val': '010000100000' })].sort()).toEqual(['band1Horz', 'lastRow'])
  })
  it('tblLook als Attribute oder Hexwert', () => {
    expect(tabellenLook({ 'w:val': '04A0' })).toEqual({ look: new Set(['firstRow', 'firstCol']), bandH: true })
    expect(tabellenLook({ 'w:lastRow': '1', 'w:lastColumn': '1', 'w:noHBand': '1' })).toEqual({ look: new Set(['lastRow', 'lastCol']), bandH: false })
  })
})

describe('teilLesen — wirksamer Hintergrund', () => {
  it('Bänder abwechselnd, erste Spalte, Zeilen-cnf vor Spalte, direkte Zellschattierung gewinnt', () => {
    const zelle = (t: string, tcPr = '') => `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ''}${p(t)}</w:tc>`
    const xml = `<w:tbl><w:tblPr><w:tblStyle w:val="T"/><w:tblLook w:firstColumn="1"/></w:tblPr>
      <w:tr>${zelle('a0')}${zelle('b0')}</w:tr>
      <w:tr>${zelle('a1')}${zelle('b1', '<w:shd w:fill="111111"/>')}</w:tr>
      <w:tr><w:trPr><w:cnfStyle w:lastRow="1"/></w:trPr>${zelle('a2')}${zelle('b2')}</w:tr></w:tbl>`
    const r = lies(xml)
    const hg = Object.fromEntries(r.laeufe.map((l) => [l.text, l.hintergrund]))
    // a2: letzte Zeile UND erste Spalte — nach Words Rangfolge gewinnt die Zeile.
    expect(hg).toEqual({ a0: 'CCCCCC', b0: 'AAAAAA', a1: 'CCCCCC', b1: '111111', a2: 'DDDDDD', b2: 'DDDDDD' })
    expect(r.tabellen).toBe(1)
    expect(r.einheiten.map((e) => e.text)).toEqual(['a0 | b0', 'a1 | b1', 'a2 | b2'])
  })

  it('Lauf- vor Absatzschattierung vor Vorlage; Absatzmarke zählt nicht; Seitenhintergrund', () => {
    const r = lies(
      `<w:background w:color="FFFFEE"/>` +
        p('lauf', '<w:shd w:fill="222222"/>', '<w:shd w:fill="333333"/>') +
        p('absatz', '<w:shd w:fill="222222"/>') +
        p('vorlage', '<w:pStyle w:val="Shd"/>') +
        p('marke', '<w:rPr><w:shd w:fill="444444"/></w:rPr>') +
        p('seite'),
    )
    expect(Object.fromEntries(r.laeufe.map((l) => [l.text, l.hintergrund]))).toEqual({ lauf: '333333', absatz: '222222', vorlage: '999999', marke: 'FFFFEE', seite: 'FFFFEE' })
  })
})

describe('teilLesen — Struktur', () => {
  it('Seitenumbrüche nur im Haupttext; Umbruch ohne Text dazwischen zählt einmal', () => {
    const xml = p('eins') + '<w:p><w:r><w:br w:type="page"/><w:lastRenderedPageBreak/></w:r></w:p>' + p('zwei')
    expect(lies(xml).einheiten).toEqual([{ text: 'eins', seite: 1 }, { text: 'zwei', seite: 2 }])
    expect(lies(xml, 'kopf').einheiten).toEqual([])
  })

  it('Zeilenumbruch und Tab werden Leerzeichen; gelöschter Text fehlt im Absatz', () => {
    const xml = '<w:p><w:r><w:t>A</w:t><w:br/><w:t>B</w:t><w:tab/><w:t>C</w:t></w:r><w:del w:author="x"><w:r><w:delText>weg</w:delText></w:r></w:del></w:p>'
    const r = lies(xml)
    expect(r.einheiten[0].text).toBe('A B C')
    expect(r.lenkung.aenderungen).toEqual([{ art: 'del', text: 'weg', autor: 'x' }])
  })

  it('Abschnitte: Verweise im pPr-sectPr gehören zum endenden Abschnitt', () => {
    const xml = p('x', '<w:sectPr><w:headerReference w:type="first" r:id="r1"/><w:footerReference r:id="r2"/></w:sectPr>') + '<w:sectPr><w:headerReference r:id="r3"/></w:sectPr>'
    expect(lies(xml).sektionen).toEqual([
      { kopf: [{ typ: 'first', rid: 'r1' }], fuss: [{ typ: 'default', rid: 'r2' }] },
      { kopf: [{ typ: 'default', rid: 'r3' }], fuss: [] },
    ])
  })
})

describe('Textfeld: Füllung der Form, nicht ihr Rahmen (Audit 11/2026, FRD-04)', () => {
  const form = (spPr: string, text: string, farbe: string) =>
    `<w:p><w:r><w:drawing><wps:wsp><wps:spPr>${spPr}</wps:spPr><wps:txbx><w:txbxContent>${p(text, '', `<w:color w:val="${farbe}"/>`)}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r></w:p>`
  const hg = (xml: string) => lies(xml).laeufe[0].hintergrund

  it('helle Füllung, Rahmen in Schriftfarbe: Hintergrund ist die Füllung', () => {
    expect(hg(form('<a:solidFill><a:srgbClr val="F2F2F2"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></a:ln>', 'CONTROLLED COPY', '1F3864'))).toBe('F2F2F2')
  })

  it('dunkle Füllung, weißer Rahmen, weiße Schrift: Hintergrund dunkel — auch wenn der Rahmen vor der Füllung steht', () => {
    expect(hg(form('<a:solidFill><a:srgbClr val="1F3864"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>', 'WHITE ON NAVY', 'FFFFFF'))).toBe('1F3864')
    expect(hg(form('<a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill>', 'X', 'FFFFFF'))).toBe('1F3864')
  })

  it('Verlauf, keine Füllung, Designfarbe, abgewandelte Farbe: nicht bestimmbar — kein geratener Hintergrund', () => {
    expect(hg(form('<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst></a:gradFill>', 'G', 'FFFFFF'))).toBeUndefined()
    expect(hg(form('<a:noFill/><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>', 'N', 'FFFFFF'))).toBeUndefined()
    expect(hg(form('<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>', 'S', 'FFFFFF'))).toBeUndefined()
    expect(hg(form('<a:solidFill><a:srgbClr val="1F3864"><a:alpha val="20000"/></a:srgbClr></a:solidFill>', 'A', 'FFFFFF'))).toBeUndefined()
    // Ohne jede Füllangabe bleibt es beim Seitenhintergrund (Bestand)
    expect(hg(form('<a:xfrm/>', 'O', '000000'))).toBe('FFFFFF')
  })

  // Nachtrag L-FREMD#2: So legt Word eine eingefügte Form an — keine Füllung
  // in wps:spPr, die Akzentfarbe kommt aus dem Design (a:fillRef). Vorher
  // galt weiße Schrift darauf als weiß auf weißer Seite, also „Invisible text".
  it('Füllung aus dem Design (wps:style, a:fillRef): nicht bestimmbar; idx 0 heißt keine Füllung; eigene Füllung geht vor', () => {
    const mitStil = (spPr: string, idx: string) =>
      `<w:p><w:r><w:drawing><wps:wsp><wps:spPr>${spPr}</wps:spPr><wps:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="${idx}"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></wps:style><wps:txbx><w:txbxContent>${p('SAFETY FIRST', '', '<w:color w:val="FFFFFF"/>')}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r></w:p>`
    expect(hg(mitStil('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', '1'))).toBeUndefined()
    expect(hg(mitStil('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', '0'))).toBe('FFFFFF')
    expect(hg(mitStil('<a:solidFill><a:srgbClr val="1F3864"/></a:solidFill>', '1'))).toBe('1F3864')
    // Gilt nur für die eigene Form: ein Textfeld danach ohne Stil bleibt auf der Seite
    const r = lies(mitStil('', '1') + form('<a:xfrm/>', 'NEXT', '000000'))
    expect(r.laeufe.map((l) => [l.text, l.hintergrund])).toEqual([['SAFETY FIRST', undefined], ['NEXT', 'FFFFFF']])
  })
})

describe('Fuß- und Endnotenverweise (Audit 11/2026, FRD-06)', () => {
  it('fortlaufend hochgestellt im Absatz und in der Einheit; Endnoten römisch; eigenes Zeichen und gelöschte Verweise ohne Nummer', () => {
    const ref = (art: 'footnote' | 'endnote', extra = '') => `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:${art}Reference w:id="9"${extra}/></w:r>`
    const r = lies(
      `<w:p><w:r><w:t>FI certificate</w:t></w:r>${ref('footnote')}<w:r><w:t xml:space="preserve"> and FCL.810</w:t></w:r>${ref('footnote')}<w:r><w:t>.</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>See note</w:t></w:r>${ref('endnote')}${ref('endnote')}<w:r><w:t>Custom</w:t></w:r>${ref('footnote', ' w:customMarkFollows="1"')}<w:r><w:t>*</w:t></w:r><w:del w:author="x">${ref('footnote')}</w:del></w:p>`,
    )
    expect(r.einheiten.map((e) => e.text)).toEqual(['FI certificate¹ and FCL.810².', 'See noteⁱⁱⁱCustom*'])
    expect(r.laeufe.filter((l) => l.text === '¹' || l.text === '²')).toHaveLength(2)
    expect([hoch('10'), hoch('iv'), hoch('x-')]).toEqual(['¹⁰', 'ⁱᵛ', 'ˣ-'])
  })
})

describe('Textfeld im Absatz (Deckblatt)', () => {
  it('der äußere Absatz behält seinen Text, das Textfeld steht getrennt — als eigene Einheit dahinter (FRD-13)', () => {
    const xml = '<w:p><w:r><w:t>Training Manual</w:t></w:r><w:r><w:txbxContent><w:p><w:pPr><w:shd w:fill="002060"/></w:pPr><w:r><w:t>Doc No.: X</w:t></w:r></w:p></w:txbxContent></w:r><w:r><w:t> CL30</w:t></w:r></w:p>'
    const r = lies(xml)
    // Das Textfeld steht nicht im Textfluss — markiert für die PDF-Paarung
    expect(r.einheiten).toEqual([{ text: 'Training Manual CL30', seite: 1 }, { text: 'Doc No.: X', seite: 1, nachgereicht: true }])
    expect(r.lenkung.textfelder).toEqual(['Doc No.: X'])
    expect(r.absaetze.map((a) => [a.text, a.ort])).toEqual([['Doc No.: X', 'textfeld'], ['Training Manual CL30', 'body']])
    expect(r.laeufe.find((l) => l.text === 'Doc No.: X')?.hintergrund).toBe('002060')
    // Eigene Nummer je Absatz — der Lauf im Textfeld zeigt auf das Textfeld, nicht auf den Anker
    expect(r.absaetze.map((a) => a.nr)).toEqual([1, 0])
    expect(r.laeufe.map((l) => [l.text, l.absatz])).toEqual([['Training Manual', 0], ['Doc No.: X', 1], [' CL30', 0]])
  })
})

describe('Sichtbarer Text, der vorher fehlte (Audit 11/2026, FRD-13)', () => {
  it('geschützter Bindestrich wird „-", bedingter Trennstrich entfällt; w:cr und w:ptab wie Umbruch und Tab', () => {
    const r = lies(
      '<w:p><w:r><w:t>Part</w:t></w:r><w:r><w:noBreakHyphen/></w:r><w:r><w:t>FCL. A go</w:t></w:r><w:r><w:noBreakHyphen/></w:r><w:r><w:t>around, non</w:t><w:softHyphen/><w:t>precision.</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>A</w:t><w:cr/><w:t>B</w:t><w:ptab w:relativeTo="margin" w:alignment="right" w:leader="none"/><w:t>C</w:t></w:r></w:p>',
    )
    expect(r.einheiten.map((e) => e.text)).toEqual(['Part-FCL. A go-around, nonprecision.', 'A B C'])
  })

  it('w:sym: Symbol-Schrift auf Unicode, andere Symbolschriften als U+FFFD — nichts geraten', () => {
    const sym = (font: string, char: string) => `<w:r><w:sym w:font="${font}" w:char="${char}"/></w:r>`
    const r = lies(`<w:p><w:r><w:t>OAT 15</w:t></w:r>${sym('Symbol', 'F0B0')}<w:r><w:t>C, </w:t></w:r>${sym('Symbol', 'f044')}${sym('Symbol', 'F0B1')}<w:r><w:t> </w:t></w:r>${sym('Wingdings', 'F0FC')}${sym('Cambria Math', '2211')}<w:del w:author="x"><w:r><w:sym w:font="Symbol" w:char="F0B0"/></w:r></w:del></w:p>`)
    expect(r.einheiten[0].text).toBe('OAT 15°C, Δ± \uFFFD∑')
    expect([symbolZeichen('Symbol', 'F061'), symbolZeichen(' symbol ', 'B3'), symbolZeichen('Symbol', 'F0F2'), symbolZeichen('Symbol', 'F0E6'), symbolZeichen('Symbol', 'F0FE')]).toEqual(['α', '≥', '∫', '\uFFFD', '\uFFFD'])
    // Nicht-Symbolschrift mit Zeichen unter 0x100: das Zeichen selbst; Steuerzeichen und Unsinn nie
    expect([symbolZeichen('Arial', '00B0'), symbolZeichen('Arial', '0002'), symbolZeichen('Arial', '0085'), symbolZeichen('Symbol', 'F07F'), symbolZeichen(undefined, undefined), symbolZeichen('Arial', 'D800'), symbolZeichen('Arial', '110000')]).toEqual(['°', '\uFFFD', '\uFFFD', '\uFFFD', '\uFFFD', '\uFFFD', '\uFFFD'])
  })

  it('innere Tabelle: Zeilen stehen in der Zelle der äußeren, Tabellen zählen einmal', () => {
    const zelle = (inhalt: string) => `<w:tc>${inhalt}</w:tc>`
    const innen = `<w:tbl><w:tr>${zelle(p('Fuel on board'))}${zelle(p('120 litres'))}</w:tr><w:tr>${zelle(p('Oil quantity'))}${zelle(p('6 quarts'))}</w:tr><w:tr>${zelle(p(''))}</w:tr></w:tbl>`
    const r = lies(`<w:tbl><w:tr>${zelle(p('Item'))}${zelle(p('Values'))}</w:tr><w:tr>${zelle(p('Pre-flight figures'))}${zelle(innen + '<w:p/>')}</w:tr></w:tbl>${p('Each item is confirmed aloud.')}`)
    expect(r.einheiten.map((e) => e.text)).toEqual(['Item | Values', 'Pre-flight figures | Fuel on board | 120 litres Oil quantity | 6 quarts', 'Each item is confirmed aloud.'])
    expect(r.tabellen).toBe(1)
  })

  it('Fuß- und Endnoten folgen als Einheit auf den Absatz mit dem Verweis — mit derselben Ziffer; eigenes Zeichen ohne Ziffer; gelöschter Verweis ohne Note', () => {
    const ref = (art: 'footnote' | 'endnote', id: string, extra = '') => `<w:r><w:${art}Reference w:id="${id}"${extra}/></w:r>`
    const noten = { fuss: new Map([['2', 'Regulation (EU) No 1178/2011.'], ['3', 'Custom note.'], ['4', 'Deleted note.']]), end: new Map([['1', 'See the EU publication.']]) }
    const r = teilLesen(
      `<w:p><w:r><w:t>Licences are issued under Part-FCL</w:t></w:r>${ref('footnote', '2')}<w:r><w:t>.</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Further</w:t></w:r>${ref('endnote', '1')}${ref('footnote', '3', ' w:customMarkFollows="1"')}<w:r><w:t>*</w:t></w:r><w:del w:author="x">${ref('footnote', '4')}</w:del>${ref('footnote', '99')}</w:p>`,
      { teil: 'word/document.xml', ort: 'body', stile: st, startNr: 0, noten },
    )
    expect(r.einheiten.map((e) => e.text)).toEqual(['Licences are issued under Part-FCL¹.', '¹ Regulation (EU) No 1178/2011.', 'Furtherⁱ*²', 'ⁱ See the EU publication.', 'Custom note.'])
    // Noten stehen in Word nicht im Textfluss — die PDF-Paarung darf an ihnen
    // den Lesezeiger nicht weiterschieben (Gegenprüfung Audit 11/2026)
    expect(r.einheiten.map((e) => !!e.nachgereicht)).toEqual([false, true, false, true, true])
  })

  it('Fußnote in einer Tabellenzelle: Note erst hinter der ganzen Tabelle — die Tabelle bleibt im Seitentext beisammen (Gegenprüfung Audit 11/2026)', () => {
    const zelle = (x: string) => `<w:tc>${p(x)}</w:tc>`
    const mitNote = '<w:tc><w:p><w:r><w:t>1.5</w:t></w:r><w:r><w:footnoteReference w:id="2"/></w:r></w:p></w:tc>'
    const r = teilLesen(
      `<w:tbl><w:tr>${zelle('Lesson')}${zelle('Hours')}</w:tr><w:tr>${zelle('FI-01')}${mitNote}</w:tr><w:tr>${zelle('FI-02')}${zelle('2.0')}</w:tr><w:tr>${zelle('Total')}${zelle('3.5')}</w:tr></w:tbl>${p('After')}`,
      { teil: 'word/document.xml', ort: 'body', stile: st, startNr: 0, noten: { fuss: new Map([['2', 'Including ground time.']]) } },
    )
    expect(r.einheiten.map((e) => e.text)).toEqual(['Lesson | Hours', 'FI-01 | 1.5¹', 'FI-02 | 2.0', 'Total | 3.5', '¹ Including ground time.', 'After'])
  })

  it('Textfeld in leerem Ankerabsatz und in einer Tabellenzelle: eigene Einheit hinter Absatz bzw. Tabelle; Kopfzeile ohne Einheiten', () => {
    const feld = (t: string) => `<w:r><w:drawing><wps:wsp><wps:txbx><w:txbxContent>${p(t)}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r>`
    const xml = `<w:p>${feld('CONTROLLED COPY')}</w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r>${feld('IN CELL')}</w:p></w:tc><w:tc>${p('B')}</w:tc></w:tr></w:tbl>${p('After')}`
    expect(lies(xml).einheiten.map((e) => e.text)).toEqual(['CONTROLLED COPY', 'Cell | B', 'IN CELL', 'After'])
    expect(lies(xml).einheiten.map((e) => !!e.nachgereicht)).toEqual([true, false, true, false])
    const kopf = lies(xml, 'kopf')
    expect(kopf.einheiten).toEqual([])
    expect(kopf.lenkung.textfelder).toEqual(['CONTROLLED COPY', 'IN CELL'])
  })

  it('Notenteil: jeder Absatz trägt die w:id seiner Note', () => {
    const r = teilLesen(`<w:footnotes><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1">${p('First')}${p('second paragraph')}</w:footnote><w:footnote w:id="2">${p('Other')}</w:footnote></w:footnotes>`, { teil: 'word/footnotes.xml', ort: 'fussnote', stile: st, startNr: 0 })
    expect(r.absaetze.map((a) => [a.notiz, a.text, a.ort])).toEqual([['-1', '', 'fussnote'], ['1', 'First', 'fussnote'], ['1', 'second paragraph', 'fussnote'], ['2', 'Other', 'fussnote']])
    expect(r.einheiten).toEqual([])
  })
})

describe('Verschiebungen und Formatänderungen (Audit 11/2026, FRD-15)', () => {
  const am = 'w:id="1" w:author="Document Control" w:date="2026-03-10T09:00:00Z"'
  it('moveFrom/moveTo: Text einmal (an der neuen Stelle), zwei offene Änderungen', () => {
    const r = lies(
      `<w:p><w:moveFromRangeStart ${am} w:name="move1"/><w:moveFrom ${am}><w:r><w:t>Check the fuel quantity visually.</w:t></w:r></w:moveFrom><w:moveFromRangeEnd w:id="1"/></w:p>` +
        p('The aircraft is prepared by the student.') +
        `<w:p><w:moveToRangeStart ${am} w:name="move1"/><w:moveTo ${am}><w:r><w:t>Check the fuel quantity visually.</w:t></w:r></w:moveTo><w:moveToRangeEnd w:id="1"/></w:p>`,
    )
    expect(r.einheiten.map((e) => e.text)).toEqual(['The aircraft is prepared by the student.', 'Check the fuel quantity visually.'])
    expect(r.lenkung.aenderungen).toEqual([
      { art: 'moveFrom', text: 'Check the fuel quantity visually.', autor: 'Document Control' },
      { art: 'moveTo', text: 'Check the fuel quantity visually.', autor: 'Document Control' },
    ])
    expect(r.laeufe.map((l) => l.text)).toEqual(['The aircraft is prepared by the student.', 'Check the fuel quantity visually.'])
  })

  it('rPrChange: eine Änderung mit dem Lauftext; der alte Stand (weiß) wird NICHT wirksam', () => {
    const r = lies(`<w:p><w:r><w:rPr><w:b/><w:color w:val="000000"/><w:rPrChange ${am}><w:rPr><w:color w:val="FFFFFF"/><w:vanish/></w:rPr></w:rPrChange></w:rPr><w:t>Solo flights require the approval of the CFI.</w:t></w:r></w:p>`)
    expect(r.lenkung.aenderungen).toEqual([{ art: 'format', text: 'Solo flights require the approval of the CFI.', autor: 'Document Control' }])
    expect(r.laeufe[0].eigenschaften).toMatchObject({ fett: true, farbe: '000000' })
    expect(r.laeufe[0].eigenschaften.vanish).toBeUndefined()
  })

  it('pPrChange: alte Vorlage und alte Liste gelten nicht; Absatzmarke, Tabelle und Abschnitt zählen je einmal', () => {
    const r = lies(
      `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:rPr><w:rPrChange ${am}><w:rPr/></w:rPrChange></w:rPr><w:pPrChange ${am}><w:pPr><w:pStyle w:val="Shd"/><w:numPr><w:numId w:val="3"/></w:numPr></w:pPr></w:pPrChange></w:pPr><w:r><w:t>Now normal body text</w:t></w:r></w:p>` +
        `<w:tbl><w:tblPr><w:tblStyle w:val="T"/><w:tblPrChange ${am}><w:tblPr/></w:tblPrChange></w:tblPr><w:tr><w:trPr><w:trPrChange ${am}><w:trPr/></w:trPrChange></w:trPr><w:tc>${p('a')}</w:tc></w:tr></w:tbl>` +
        `<w:sectPr><w:sectPrChange ${am}><w:sectPr/></w:sectPrChange></w:sectPr>`,
    )
    expect(r.absaetze[0].stil).toBe('Normal')
    expect(r.laeufe[0].hintergrund).toBe('FFFFFF')
    expect(r.einheiten.map((e) => e.text)).toEqual(['Now normal body text', 'a'])
    expect(r.lenkung.aenderungen.map((a) => [a.art, a.text])).toEqual([
      ['format', 'Now normal body text'],
      ['format', 'Now normal body text'],
      ['format', 'Table formatting'],
      ['format', 'Table row formatting'],
      ['format', 'Section formatting'],
    ])
  })

  // Nachtrag L-FREMD#1: So speichert Word die Rückstufung tatsächlich — Normal
  // ist die Vorgabe, steht also gar nicht als pStyle da; nur der alte Stand
  // nennt Heading 2. Vorher wurde der Absatz zur Überschrift der Ebene 2,
  // und Gliederung, Verzeichnisabgleich und Kapitelpfad liefen falsch.
  it('pPrChange: von Heading 2 auf Normal zurückgestuft — keine Überschrift mehr', () => {
    const stile = stileLesen(`<w:styles><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style></w:styles>`)
    const xml = (alt: string) => `<w:p><w:pPr>${alt}</w:pPr><w:r><w:t>Now normal body text</w:t></w:r></w:p>`
    const r = teilLesen(xml(`<w:pPrChange ${am}><w:pPr><w:pStyle w:val="Heading2"/></w:pPr></w:pPrChange>`), { teil: 't.xml', ort: 'body', stile, startNr: 0 })
    expect(r.absaetze[0]).toMatchObject({ stilName: 'Normal' })
    expect(r.absaetze[0].ebene).toBeUndefined()
    expect(r.einheiten).toEqual([{ text: 'Now normal body text', seite: 1 }])
    // Gegenstück: dieselbe Vorlage als AKTUELLER Stand bleibt Überschrift
    const h = teilLesen(xml('<w:pStyle w:val="Heading2"/>'), { teil: 't.xml', ort: 'body', stile, startNr: 0 })
    expect([h.absaetze[0].ebene, h.einheiten[0].ebene]).toEqual([2, 2])
  })

  // Nachtrag L-FREMD#1, Umkehrung: Der alte Stand darf echten weißen Text
  // nicht verdecken — sonst entginge „Invisible text" gerade dort, wo jemand
  // die Schrift nachträglich weiß gemacht hat.
  it('rPrChange: jetzt weiß, vorher schwarz — die weiße Farbe gilt', () => {
    const r = lies(`<w:p><w:r><w:rPr><w:color w:val="FFFFFF"/><w:rPrChange ${am}><w:rPr><w:color w:val="000000"/></w:rPr></w:rPrChange></w:rPr><w:t>Hidden remark</w:t></w:r></w:p>`)
    expect(r.laeufe[0]).toMatchObject({ text: 'Hidden remark', hintergrund: 'FFFFFF', eigenschaften: { farbe: 'FFFFFF' } })
  })

  it('Liste: der wegverschobene Punkt zählt nicht mit, die alte Liste aus pPrChange gilt nicht', () => {
    const nummern = zaehlerAnlegen(nummerierungLesen('<w:numbering><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="(%1)"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>'))
    const num = '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    const r = teilLesen(
      p('Alpha', num) +
        `<w:p><w:pPr>${num}<w:rPr><w:moveFrom ${am}/></w:rPr></w:pPr><w:moveFrom ${am}><w:r><w:t>Beta</w:t></w:r></w:moveFrom></w:p>` +
        p('Gamma', num) +
        `<w:p><w:pPr>${num}<w:rPr><w:moveTo ${am}/></w:rPr></w:pPr><w:moveTo ${am}><w:r><w:t>Beta</w:t></w:r></w:moveTo></w:p>` +
        p('Plain', `<w:pPrChange ${am}><w:pPr>${num}</w:pPr></w:pPrChange>`) +
        p('Delta', num),
      { teil: 't.xml', ort: 'body', stile: st, startNr: 0, nummern },
    )
    expect(r.einheiten.map((e) => e.text)).toEqual(['(a) Alpha', '(b) Gamma', '(c) Beta', 'Plain', '(d) Delta'])
  })

  it('Formatänderung an einem Lauf ohne Text bzw. an einem leeren Absatz: benannt statt leer', () => {
    const r = lies(`<w:p><w:pPr><w:pPrChange ${am}><w:pPr/></w:pPrChange></w:pPr><w:r><w:rPr><w:rPrChange ${am}><w:rPr/></w:rPrChange></w:rPr><w:fldChar w:fldCharType="begin"/></w:r></w:p>`)
    expect(r.lenkung.aenderungen.map((a) => a.text)).toEqual(['Paragraph formatting', 'Character formatting'])
  })
})
