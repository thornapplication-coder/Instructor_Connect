import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { absaetze as pruefAbsaetze } from '../pruefung/kontext'
import { Suchindex } from '../search/suche'
import { docxLesen, eigenschaftenLesen, ueberschriftStile } from './docx'
import { dateiLesen } from './lesen'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
const p = (text: string, stil?: string, extra = '') => `<w:p>${stil ? `<w:pPr><w:pStyle w:val="${stil}"/>${extra}</w:pPr>` : extra ? `<w:pPr>${extra}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`

/** Synthetisches DOCX — Kap. 19: keine echten Dokumente im Repo. */
export async function docxBauen(body: string, teile: Record<string, string> = {}): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`)
  zip.file(
    'word/styles.xml',
    `<w:styles ${W}><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Ueberschrift2"><w:name w:val="Custom"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style><w:style w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
  )
  for (const [k, v] of Object.entries(teile)) zip.file(k, v)
  return zip.generateAsync({ type: 'uint8array' })
}

describe('DOCX lesen (Spez. 7.3)', () => {
  it('Überschriften ergeben Abschnittspfad und Gliederung, Seiten aus Umbrüchen mit „ca."', async () => {
    const body = [
      p('1 Electrical', 'Heading1'),
      p('1.1 Battery', 'Ueberschrift2'),
      p('Check BATT 1 OFF BUS.'),
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
      '<w:p><w:r><w:lastRenderedPageBreak/><w:t>Second page text</w:t></w:r></w:p>',
      p('2 Fuel', 'Heading1'),
    ].join('')
    const r = await docxLesen(await docxBauen(body))
    expect(r.format).toBe('docx')
    expect(r.pages.map((x) => x.label)).toEqual(['ca. 1', 'ca. 2'])
    expect(r.pages[0].text).toBe('1 Electrical\n1.1 Battery\nCheck BATT 1 OFF BUS.')
    expect(r.pages[0].sectionPath).toEqual(['1 Electrical', '1.1 Battery'])
    expect(r.pages[1].sectionPath).toEqual(['2 Fuel'])
    expect(r.outline.map((o) => [o.titel, o.ebene, o.vonSeite])).toEqual([['1 Electrical', 1, 1], ['1.1 Battery', 2, 1], ['2 Fuel', 1, 2]])
  })

  it('Tabellen zeilenweise als „Zelle | Zelle", gezählt', async () => {
    const tab = '<w:tbl><w:tr><w:tc>' + p('VMO') + '</w:tc><w:tc>' + p('320 KIAS') + '</w:tc></w:tr><w:tr><w:tc>' + p('') + '</w:tc></w:tr></w:tbl>'
    const r = await docxLesen(await docxBauen(tab))
    expect(r.pages[0].text).toBe('VMO | 320 KIAS')
    expect(r.tabellen).toBe(1)
  })

  it('erfasst Änderungen, Kommentare, Kopf-/Fußzeilen, Textfelder und Revisionsbalken getrennt', async () => {
    const body = [
      '<w:p><w:ins w:author="Anna"><w:r><w:t>neu</w:t></w:r></w:ins><w:del w:author="Ben"><w:r><w:delText>alt</w:delText></w:r></w:del><w:r><w:t> Text</w:t></w:r></w:p>',
      p('Geänderter Absatz', undefined, '<w:pBdr><w:left w:val="single"/></w:pBdr>'),
      '<w:p><w:r><mc:AlternateContent><mc:Choice><w:txbxContent>' + p('Doc No.: SBX-OM-1') + '</w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent>' + p('Doc No.: SBX-OM-1') + '</w:txbxContent></mc:Fallback></mc:AlternateContent></w:r></w:p>',
    ].join('')
    const r = await docxLesen(
      await docxBauen(body, {
        'word/header1.xml': `<w:hdr ${W}>${p('Operations Manual')}</w:hdr>`,
        'word/footer1.xml': `<w:ftr ${W}>${p('Page 1')}</w:ftr>`,
        'word/comments.xml': `<w:comments ${W}><w:comment w:author="QM">${p('Bitte prüfen')}${p('zweiter Absatz')}</w:comment></w:comments>`,
        'docProps/core.xml': '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:title>OM Part A</dc:title><cp:revision>57</cp:revision></cp:coreProperties>',
      }),
    )
    // Das Textfeld steht getrennt in der Lenkung UND — genau einmal — im
    // Seitentext; vorher fanden Suche und Prüfungen es nicht (Audit 11/2026, FRD-13).
    expect(r.pages[0].text).toBe('neu Text\nGeänderter Absatz\nDoc No.: SBX-OM-1')
    expect(r.lenkung.aenderungen).toEqual([{ art: 'ins', text: 'neu', autor: 'Anna' }, { art: 'del', text: 'alt', autor: 'Ben' }])
    expect(r.lenkung.kommentare).toEqual([{ autor: 'QM', text: 'Bitte prüfen zweiter Absatz' }])
    expect(r.lenkung.kopfzeilen).toEqual(['Operations Manual'])
    expect(r.lenkung.fusszeilen).toEqual(['Page 1'])
    // Textfeld genau EINMAL, obwohl Word es in Choice und Fallback doppelt ablegt.
    expect(r.lenkung.textfelder).toEqual(['Doc No.: SBX-OM-1'])
    expect(r.lenkung.revisionsbalken).toBe(1)
    expect(r.lenkung.eigenschaften).toEqual({ title: 'OM Part A' })
  })

  it('Tabulator wird Leerzeichen; doppelter Umbruch ohne Text zählt einmal', async () => {
    const body = '<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/><w:lastRenderedPageBreak/></w:r></w:p>' + p('C')
    const r = await docxLesen(await docxBauen(body))
    expect(r.pages.map((x) => x.text)).toEqual(['A B', 'C'])
  })

  it('automatische Nummerierung über die Vorlage: Gliederung „1 General", Verzeichnis verankert auf allen Kapiteln (Audit 11/2026, FRD-01)', async () => {
    const W2 = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    const stile = `<w:styles ${W2}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="10"/></w:numPr></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="10"/></w:numPr></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style><w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/></w:style></w:styles>`
    const numbering = `<w:numbering ${W2}><w:abstractNum w:abstractNumId="20">
      <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:pStyle w:val="Heading1"/><w:lvlText w:val="%1"/></w:lvl>
      <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:pStyle w:val="Heading2"/><w:lvlText w:val="%1.%2"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="21"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="(%1)"/></w:lvl></w:abstractNum>
      <w:num w:numId="10"><w:abstractNumId w:val="20"/></w:num><w:num w:numId="11"><w:abstractNumId w:val="21"/></w:num></w:numbering>`
    const toc = (t: string, s: number, e = 1) => `<w:p><w:pPr><w:pStyle w:val="TOC${e}"/></w:pPr><w:r><w:t>${t}</w:t></w:r><w:r><w:tab/><w:t>${s}</w:t></w:r></w:p>`
    const lang = 'The course is conducted by the ATO and every lesson is recorded in the training file. '.repeat(30)
    const body = [
      toc('1\tGeneral', 2), toc('1.1\tScope', 2, 2), toc('Record of Revisions', 3), toc('2\tCourse Structure', 4),
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
      p('General', 'Heading1'), p('Scope', 'Heading2'),
      p('flights below 150 m are not permitted', undefined, '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="11"/></w:numPr>'),
      p('visibility at least 5 km', undefined, '<w:numPr><w:numId w:val="11"/></w:numPr>'),
      p(lang),
      // numId 0 hebt die Liste der Vorlage auf — wie bei „Record of Revisions" in Handbüchern
      p('Record of Revisions', 'Heading1', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>'),
      p(lang),
      p('Course Structure', 'Heading1'), p(lang),
    ].join('')
    const r = await docxLesen(await docxBauen(body, { 'word/styles.xml': stile, 'word/numbering.xml': numbering }))
    expect(r.outline.map((o) => [o.titel, o.vonSeite])).toEqual([['1 General', 2], ['1.1 Scope', 2], ['Record of Revisions', 3], ['2 Course Structure', 4]])
    expect(r.seitenQuelle).toBe('toc_mapping')
    expect(r.pages[1].text).toContain('(a) flights below 150 m are not permitted\n(b) visibility at least 5 km')
    expect(r.word!.absaetze.filter((a) => a.ebene === 1).map((a) => a.text)).toEqual(['1 General', 'Record of Revisions', '2 Course Structure'])
    expect(r.pages[3].sectionPath).toEqual(['2 Course Structure'])
  })

  it('Kapitelnummern über eine Listenformatvorlage (w:numStyleLink) — Firmenvorlagen binden Überschriften oft so (Gegenprüfung Audit 11/2026)', async () => {
    const W2 = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    const stile = `<w:styles ${W2}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
      <w:style w:type="numbering" w:styleId="Kapitel"><w:name w:val="Kapitel"/><w:pPr><w:numPr><w:numId w:val="40"/></w:numPr></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:numPr><w:numId w:val="41"/></w:numPr></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="41"/></w:numPr></w:pPr></w:style></w:styles>`
    const numbering = `<w:numbering ${W2}>
      <w:abstractNum w:abstractNumId="30"><w:styleLink w:val="Kapitel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="31"><w:numStyleLink w:val="Kapitel"/></w:abstractNum>
      <w:num w:numId="40"><w:abstractNumId w:val="30"/></w:num><w:num w:numId="41"><w:abstractNumId w:val="31"/></w:num></w:numbering>`
    const r = await docxLesen(await docxBauen([p('General', 'Heading1'), p('Scope', 'Heading2'), p('Course Structure', 'Heading1')].join(''), { 'word/styles.xml': stile, 'word/numbering.xml': numbering }))
    expect(r.outline.map((o) => o.titel)).toEqual(['1 General', '1.1 Scope', '2 Course Structure'])
  })

  it('Fuß- und Endnoten stehen im Seitentext, Textfelder sind suchbar (Audit 11/2026, FRD-13)', async () => {
    const note = (art: 'footnote' | 'endnote', id: string, text: string) => `<w:${art} w:id="${id}"><w:p><w:r><w:${art}Ref/></w:r><w:r><w:t xml:space="preserve"> ${text}</w:t></w:r></w:p></w:${art}>`
    const body = [
      '<w:p><w:r><w:t>Licences follow Part-FCL</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:t>.</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>See the closing remark</w:t></w:r><w:r><w:endnoteReference w:id="1"/></w:r></w:p>',
      '<w:p><w:r><w:drawing><w:txbxContent>' + p('CONTROLLED COPY') + '</w:txbxContent></w:drawing></w:r></w:p>',
    ].join('')
    const r = await docxLesen(
      await docxBauen(body, {
        'word/footnotes.xml': `<w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>${note('footnote', '1', 'Regulation (EU) No 1178/2011 as amended.')}</w:footnotes>`,
        'word/endnotes.xml': `<w:endnotes ${W}>${note('endnote', '1', 'Issued by the EU.')}</w:endnotes>`,
      }),
    )
    expect(r.pages[0].text).toBe('Licences follow Part-FCL¹.\n¹ Regulation (EU) No 1178/2011 as amended.\nSee the closing remarkⁱ\nⁱ Issued by the EU.\nCONTROLLED COPY')
    // Notenabsätze im Word-Extrakt — eindeutig nummeriert, mit Fundort
    const nr = r.word!.absaetze.map((a) => a.nr)
    expect(new Set(nr).size).toBe(nr.length)
    expect(r.word!.laeufe.every((l) => r.word!.absaetze.some((a) => a.nr === l.absatz))).toBe(true)
    const noten = pruefAbsaetze(r).filter((a) => a.wortOrt === 'fussnote')
    expect(noten.map((a) => [a.text, a.ort, a.seite])).toEqual([['Regulation (EU) No 1178/2011 as amended.', 'Footnote', 'ca. 1'], ['Issued by the EU.', 'Endnote', 'ca. 1']])
    const index = new Suchindex()
    index.hinzufuegen({ id: 'd', titel: 'D', pages: r.pages })
    expect(index.suchen('CONTROLLED COPY').map((t) => t.seite)).toEqual([1])
    expect(index.suchen('1178/2011').length).toBe(1)
  })

  it('abgebrochen: nach dem nächsten entpackten Teil DC-ABORTED, auch über dateiLesen (Audit 11/2026, DC-01)', async () => {
    const c = new AbortController()
    c.abort()
    await expect(docxLesen(await docxBauen(p('Text')), undefined, c.signal)).rejects.toThrow('DC-ABORTED')
    await expect(dateiLesen({ name: 'a.docx', daten: await docxBauen(p('Text')) }, { pdfjs: async () => { throw new Error('kein PDF') } }, { signal: c.signal })).rejects.toThrow('DC-ABORTED')
  })

  it('ohne word/document.xml: verständlicher Fehlercode', async () => {
    const zip = new JSZip()
    zip.file('x.txt', 'x')
    await expect(docxLesen(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('DC-DOCX-INVALID')
  })
})

describe('Stile und Eigenschaften', () => {
  it('Überschriftsebene aus Name oder outlineLvl', () => {
    const m = ueberschriftStile(`<w:styles><w:style w:styleId="H1"><w:name w:val="Heading 1"/></w:style><w:style w:styleId="X"><w:name w:val="x"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style><w:style w:styleId="N"><w:name w:val="Normal"/></w:style></w:styles>`)
    expect([...m]).toEqual([['H1', 1], ['X', 3]])
  })

  it('benutzerdefinierte Eigenschaften: Revision und Dokumentnummer', () => {
    const custom = '<Properties><property name="Revision"><vt:lpwstr>Rev 4</vt:lpwstr></property><property name="Doc_No"><vt:lpwstr>OM-A</vt:lpwstr></property><property name="Other"><vt:lpwstr>x</vt:lpwstr></property></Properties>'
    expect(eigenschaftenLesen(undefined, custom)).toEqual({ revision: 'Rev 4', docNumber: 'OM-A' })
    expect(eigenschaftenLesen('<c><dc:subject>Sub</dc:subject></c>')).toEqual({ subject: 'Sub' })
  })

  it('Kern und app.xml über den Ereignisstrom: Entitäten, erster nicht leerer Wert, Seitenzahl nur als Zahl', () => {
    expect(eigenschaftenLesen('<c><dc:title/><dc:title>OM &amp; SOP</dc:title><dc:title>zweiter</dc:title><dcterms:modified xsi:type="x">2026-03-01T10:00:00Z</dcterms:modified></c>', undefined, '<Properties><Pages> 12 </Pages></Properties>')).toEqual({ title: 'OM & SOP', modified: '2026-03-01T10:00:00Z', pages: '12' })
    expect(eigenschaftenLesen(undefined, undefined, '<Properties><Pages>zwölf</Pages></Properties>')).toEqual({})
  })

  it('präparierte Nebenteile: linear und ohne Absturz — kaputt heißt „keine Angaben" (Audit 11/2026, SEC-01)', async () => {
    const a = performance.now()
    expect(eigenschaftenLesen('<c>' + '<dc:title>'.repeat(1e5), '<Properties>' + '<!--'.repeat(1e5), '<Properties>' + '<Pages>'.repeat(1e5))).toEqual({})
    const r = await docxLesen(await docxBauen(p('Text'), { 'word/settings.xml': `<w:settings ${W}>` + '<w:compatSetting w:name="compatibilityMode" '.repeat(2e4) }))
    expect(performance.now() - a).toBeLessThan(1500)
    expect(r.word!.kompatibilitaet).toBeUndefined()
    const ok = await docxLesen(await docxBauen(p('Text'), { 'word/settings.xml': `<w:settings ${W}><w:compat><w:compatSetting w:name="other" w:val="1"/><w:compatSetting w:val="15" w:name="compatibilityMode" w:uri="u"/></w:compat></w:settings>` }))
    expect(ok.word!.kompatibilitaet).toBe(15)
    // Seitenfarbe kommt aus dem Durchlauf über den Haupttext, nicht aus einem eigenen Muster
    expect((await docxLesen(await docxBauen('<w:background w:color="ffffee"/>' + p('Text')))).word!.seitenhintergrund).toBe('FFFFEE')
    expect((await docxLesen(await docxBauen('<w:background w:color="auto"/>' + p('Text')))).word!.seitenhintergrund).toBeUndefined()
  })
})
