import { describe, expect, it } from 'vitest'
import { stileLesen } from './wordStile'
import { cnf, tabellenLook, teilLesen } from './wordTeil'

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

describe('Textfeld im Absatz (Deckblatt)', () => {
  it('der äußere Absatz behält seinen Text, das Textfeld steht getrennt', () => {
    const xml = '<w:p><w:r><w:t>Training Manual</w:t></w:r><w:r><w:txbxContent><w:p><w:pPr><w:shd w:fill="002060"/></w:pPr><w:r><w:t>Doc No.: X</w:t></w:r></w:p></w:txbxContent></w:r><w:r><w:t> CL30</w:t></w:r></w:p>'
    const r = lies(xml)
    expect(r.einheiten).toEqual([{ text: 'Training Manual CL30', seite: 1 }])
    expect(r.lenkung.textfelder).toEqual(['Doc No.: X'])
    expect(r.absaetze.map((a) => [a.text, a.ort])).toEqual([['Doc No.: X', 'textfeld'], ['Training Manual CL30', 'body']])
    expect(r.laeufe.find((l) => l.text === 'Doc No.: X')?.hintergrund).toBe('002060')
  })
})
