import { describe, expect, it } from 'vitest'
import { nummerierungLesen, zaehlerAnlegen, zahlFormat } from './nummerierung'

// Audit 11/2026, FRD-01: Word setzt Kapitel- und Listennummern erst beim
// Anzeigen — hier wird nachgezählt, was Word zeigt.

const lvl = (ilvl: number, fmt: string, text: string, extra = '') =>
  `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/>${extra}<w:lvlText w:val="${text}"/><w:pPr><w:ind w:left="567"/><w:numFmt w:val="bullet"/></w:pPr></w:lvl>`

const XML = `<w:numbering>
  <w:abstractNum w:abstractNumId="20">
    ${lvl(0, 'decimal', '%1', '<w:pStyle w:val="Heading1"/>')}
    ${lvl(1, 'decimal', '%1.%2', '<w:pStyle w:val="Heading2"/>')}
    ${lvl(2, 'decimal', '%1.%2.%3')}
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="21">
    ${lvl(0, 'lowerLetter', '(%1)')}
    ${lvl(1, 'decimal', '(%2)')}
    ${lvl(2, 'lowerRoman', '(%3)')}
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="22">
    ${lvl(0, 'upperRoman', '%1.')}
    ${lvl(1, 'upperLetter', '%1.%2', '<w:isLgl/>')}
    ${lvl(2, 'decimal', '%3)', '<w:lvlRestart w:val="0"/>')}
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="8">${lvl(0, 'bullet', '')}</w:abstractNum>
  <w:num w:numId="10"><w:abstractNumId w:val="20"/></w:num>
  <w:num w:numId="101"><w:abstractNumId w:val="21"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
  <w:num w:numId="102"><w:abstractNumId w:val="21"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
  <w:num w:numId="103"><w:abstractNumId w:val="21"/></w:num>
  <w:num w:numId="104"><w:abstractNumId w:val="20"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/></w:lvlOverride></w:num>
  <w:num w:numId="105"><w:abstractNumId w:val="21"/><w:lvlOverride w:ilvl="0"><w:lvl w:ilvl="0"><w:start w:val="4"/><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%1:"/></w:lvl></w:lvlOverride></w:num>
  <w:num w:numId="5"><w:abstractNumId w:val="22"/></w:num>
  <w:num w:numId="1"><w:abstractNumId w:val="8"/></w:num>
  <w:num w:numId="99"><w:abstractNumId w:val="77"/></w:num>
</w:numbering>`

describe('Zahlformate wie Word', () => {
  it('dezimal, Buchstaben (z → aa), römisch, führende Null; Aufzählung und „none" ohne Text', () => {
    expect([1, 26, 27, 28].map((n) => zahlFormat(n, 'lowerLetter'))).toEqual(['a', 'z', 'aa', 'bb'])
    expect(zahlFormat(3, 'upperLetter')).toBe('C')
    expect([4, 9, 14, 1990].map((n) => zahlFormat(n, 'lowerRoman'))).toEqual(['iv', 'ix', 'xiv', 'mcmxc'])
    expect(zahlFormat(4, 'upperRoman')).toBe('IV')
    expect([zahlFormat(7, 'decimalZero'), zahlFormat(12, 'decimalZero')]).toEqual(['07', '12'])
    expect([zahlFormat(1, 'bullet'), zahlFormat(1, 'none')]).toEqual(['', ''])
    // Unbekanntes Format: dezimal statt nichts; Randwerte nicht als Buchstabe/Ziffer erfinden
    expect([zahlFormat(5, 'ordinal'), zahlFormat(0, 'lowerLetter'), zahlFormat(0, 'upperRoman')]).toEqual(['5', '0', '0'])
  })
})

describe('Zähler (Audit 11/2026, FRD-01)', () => {
  const defs = nummerierungLesen(XML)

  it('liest Ebenen samt Vorlagenbindung; w:numFmt in w:pPr der Ebene zählt nicht', () => {
    expect(defs.abstrakt.get('20')!.get(1)).toEqual({ start: 1, format: 'decimal', text: '%1.%2', isLgl: false, pStyle: 'Heading2' })
    expect(defs.instanzen.get('101')).toEqual({ abstrakt: '21', ueberschrieben: new Map([[0, { start: 1 }]]) })
  })

  it('Mehrebenen-Liste 1 / 1.1 / 1.1.1 — tiefere Ebenen beginnen nach einer höheren neu', () => {
    const z = zaehlerAnlegen(defs)
    const folge = [0, 1, 1, 2, 2, 1, 2, 0, 1].map((i) => z.naechste('10', i))
    expect(folge).toEqual(['1', '1.1', '1.2', '1.2.1', '1.2.2', '1.3', '1.3.1', '2', '2.1'])
  })

  it('Ebene über w:pStyle der Liste, wenn Absatz und Vorlage keine nennen', () => {
    const z = zaehlerAnlegen(defs)
    expect([z.naechste('10', undefined, 'Heading1'), z.naechste('10', undefined, 'Heading2'), z.naechste('10', undefined, 'Normal')]).toEqual(['1', '1.1', '2'])
  })

  it('startOverride beginnt eine Instanz neu; ohne Override setzt Word dieselbe Liste fort', () => {
    const z = zaehlerAnlegen(defs)
    expect([z.naechste('101', 0), z.naechste('101', 0), z.naechste('101', 1), z.naechste('101', 2)]).toEqual(['(a)', '(b)', '(1)', '(i)'])
    expect([z.naechste('102', 0), z.naechste('102', 0)]).toEqual(['(a)', '(b)'])
    // 103 hat keinen Override: Fortsetzung der abstrakten Liste 21
    expect(z.naechste('103', 0)).toBe('(c)')
    // Override mit anderem Startwert
    expect(zaehlerAnlegen(defs).naechste('104', 0)).toBe('7')
  })

  it('lvlOverride mit eigener Ebene ersetzt Format und Start', () => {
    const z = zaehlerAnlegen(defs)
    expect([z.naechste('105', 0), z.naechste('105', 0)]).toEqual(['D:', 'E:'])
  })

  it('isLgl zeigt alle Ebenen dezimal; lvlRestart 0 zählt über eine höhere Ebene hinweg weiter', () => {
    const z = zaehlerAnlegen(defs)
    expect([z.naechste('5', 0), z.naechste('5', 1), z.naechste('5', 2), z.naechste('5', 0), z.naechste('5', 1), z.naechste('5', 2)]).toEqual(['I.', '1.1', '1)', 'II.', '2.1', '2)'])
  })

  it('numId 0, unbekannte Liste, unbekannte Ebene und Aufzählungszeichen ergeben keine Nummer', () => {
    const z = zaehlerAnlegen(defs)
    expect([z.naechste('0', 0), z.naechste('', 0), z.naechste('42', 0), z.naechste('99', 0), z.naechste('10', 8), z.naechste('1', 0)]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
  })

  it('Ebene ohne vorherige höhere Ebene zeigt deren Startwert minus eins — wie Word („0.1")', () => {
    expect(zaehlerAnlegen(defs).naechste('10', 1)).toBe('0.1')
  })

  it('Listenformatvorlage (w:numStyleLink): Ebenen und Zählung bei der Liste der Vorlage (Gegenprüfung Audit 11/2026)', () => {
    // Word schreibt eine Listenformatvorlage „Kapitel" so: Liste 30 trägt die
    // Ebenen (w:styleLink), Liste 31 nur den Verweis; die Vorlage zeigt auf
    // numId 40 (Liste 30), die Überschriften auf numId 41 (Liste 31).
    const xml = `<w:numbering>
      <w:abstractNum w:abstractNumId="30"><w:styleLink w:val="Kapitel"/>${lvl(0, 'decimal', '%1')}${lvl(1, 'decimal', '%1.%2')}</w:abstractNum>
      <w:abstractNum w:abstractNumId="31"><w:numStyleLink w:val="Kapitel"/></w:abstractNum>
      <w:abstractNum w:abstractNumId="32"><w:numStyleLink w:val="Fehlt"/></w:abstractNum>
      <w:num w:numId="40"><w:abstractNumId w:val="30"/></w:num>
      <w:num w:numId="41"><w:abstractNumId w:val="31"/></w:num>
      <w:num w:numId="42"><w:abstractNumId w:val="31"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>
      <w:num w:numId="43"><w:abstractNumId w:val="32"/></w:num>
    </w:numbering>`
    const d = nummerierungLesen(xml)
    expect(d.vorlage).toEqual(new Map([['31', 'Kapitel'], ['32', 'Fehlt']]))
    const z = zaehlerAnlegen(d, (id) => (id === 'Kapitel' ? '40' : undefined))
    expect([z.naechste('41', 0), z.naechste('41', 1), z.naechste('40', 0), z.naechste('41', 1)]).toEqual(['1', '1.1', '2', '2.1'])
    expect(zaehlerAnlegen(d, (id) => (id === 'Kapitel' ? '40' : undefined)).naechste('42', 0)).toBe('5')
    // Vorlage unbekannt oder kein Auflöser: keine Nummer erfinden
    expect([z.naechste('43', 0), zaehlerAnlegen(d).naechste('41', 0)]).toEqual([undefined, undefined])
  })

  it('leere oder fehlende numbering.xml: nichts zu zählen', () => {
    expect(zaehlerAnlegen(nummerierungLesen('')).naechste('1', 0)).toBeUndefined()
  })
})
