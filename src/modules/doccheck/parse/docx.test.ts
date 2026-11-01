import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { docxLesen, eigenschaftenLesen, ueberschriftStile } from './docx'

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
    expect(r.pages[0].text).toBe('neu Text\nGeänderter Absatz')
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
})
