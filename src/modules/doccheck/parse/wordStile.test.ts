import { describe, expect, it } from 'vitest'
import { farbe, rPrAnwenden, stileLesen, tabellenHintergrund, tabellenRPr, vorlageAufloesen, vorlageEbene } from './wordStile'

const XML = `<w:styles>
  <w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="20"/><w:lang w:val="de-AT"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:color w:val="333333"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Box"><w:name w:val="Box"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:fill="EEEEEE"/></w:pPr><w:rPr><w:noProof/><w:vanish w:val="0"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="H2"><w:name w:val="Custom"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="H2b"><w:name w:val="Custom b"/><w:basedOn w:val="H2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Verzeichnis1"><w:name w:val="toc 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Zyklus"><w:name w:val="Zyklus"/><w:basedOn w:val="Zyklus"/></w:style>
  <w:style w:type="table" w:default="1" w:styleId="Grid"><w:name w:val="Grid"/><w:rPr><w:sz w:val="18"/></w:rPr><w:tcPr><w:shd w:fill="F0F0F0"/></w:tcPr>
    <w:tblStylePr w:type="firstRow"><w:rPr><w:color w:val="FFFFFF"/><w:b/></w:rPr><w:tcPr><w:shd w:fill="000080"/></w:tcPr></w:tblStylePr>
    <w:tblStylePr w:type="band1Horz"><w:tcPr><w:shd w:fill="DDEEFF"/></w:tcPr></w:tblStylePr>
    <w:tblStylePr w:type="wholeTable"><w:tcPr><w:shd w:fill="123456"/></w:tcPr></w:tblStylePr>
  </w:style>
  <w:style w:type="table" w:styleId="GridAbgeleitet"><w:name w:val="Abg"/><w:basedOn w:val="Grid"/></w:style>
</w:styles>`

describe('Formatvorlagen', () => {
  const st = stileLesen(XML)

  it('Dokumentvorgabe, Standard-Absatz- und Tabellenvorlage', () => {
    expect(st.standard).toEqual({ groesse: 10, sprache: 'de-AT' })
    expect(st.standardAbsatz).toBe('Normal')
    expect(st.standardTabelle).toBe('Grid')
  })

  it('löst die basedOn-Kette auf, Basis zuerst — und übersteht Zyklen', () => {
    expect(vorlageAufloesen(st, 'Box')).toEqual({ farbe: '333333', noProof: true, vanish: false, _pShd: 'EEEEEE' })
    expect(vorlageAufloesen(st, 'Zyklus')).toEqual({})
    expect(vorlageAufloesen(st, undefined)).toEqual({})
  })

  it('Ebenen aus outlineLvl, vererbt, und Inhaltsverzeichnis aus „toc N"', () => {
    expect(vorlageEbene(st, 'H2b')).toEqual({ ebene: 2, name: 'Custom b', toc: undefined })
    expect(vorlageEbene(st, 'Verzeichnis1')).toMatchObject({ toc: 1 })
    expect(vorlageEbene(st, 'Normal')).toEqual({ name: 'Normal' })
    expect(vorlageEbene(st, undefined)).toEqual({ name: undefined })
  })

  it('Tabellen: Bedingung vor Gesamt, Kopfzeile vor Band, Vererbung', () => {
    expect(tabellenHintergrund(st, 'Grid', new Set(['firstRow', 'band1Horz']))).toBe('000080')
    expect(tabellenHintergrund(st, 'Grid', new Set(['band1Horz']))).toBe('DDEEFF')
    // wholeTable gilt für die ganze Tabelle und überschreibt das Grundformat.
    expect(tabellenHintergrund(st, 'GridAbgeleitet', new Set())).toBe('123456')
    expect(tabellenHintergrund(st, undefined, new Set())).toBeUndefined()
    expect(tabellenRPr(st, 'GridAbgeleitet', new Set(['firstRow']))).toEqual({ groesse: 9, farbe: 'FFFFFF', fett: true })
    expect(tabellenRPr(st, 'Grid', new Set())).toEqual({ groesse: 9 })
  })
})

describe('Zeichenformat-Bausteine', () => {
  it('farbe normalisiert und verwirft Ungültiges', () => {
    expect(farbe('ffffff')).toBe('FFFFFF')
    expect(farbe('auto')).toBe('auto')
    expect(farbe('red')).toBeUndefined()
    expect(farbe(undefined)).toBeUndefined()
  })

  it('rPrAnwenden: Schalter, Größe, Sprache, Markierung, Schattierung', () => {
    const z: Record<string, unknown> = {}
    const auf = (name: string, attr: Record<string, string> = {}) => rPrAnwenden(z, { typ: 'auf', name, attr, leer: true })
    auf('w:vanish')
    auf('w:noProof', { 'w:val': 'false' })
    auf('w:sz', { 'w:val': '7' })
    auf('w:sz', { 'w:val': 'x' })
    auf('w:lang', { 'w:val': 'fr-FR' })
    auf('w:highlight', { 'w:val': 'green' })
    auf('w:shd', { 'w:fill': 'auto' })
    auf('w:color', { 'w:val': 'nope' })
    expect(z).toEqual({ vanish: true, noProof: false, groesse: 3.5, sprache: 'fr-FR', markierung: 'green' })
    auf('w:highlight', { 'w:val': 'none' })
    auf('w:shd', { 'w:fill': 'ABCDEF' })
    expect(z).toMatchObject({ schattierung: 'ABCDEF' })
    expect(z).not.toHaveProperty('markierung')
    rPrAnwenden(z, { typ: 'zu', name: 'w:b' })
    expect(z).not.toHaveProperty('fett')
  })
})
