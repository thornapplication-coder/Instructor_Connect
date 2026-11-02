import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fuerNutzer, lesenZustand, neu, fertig, setzen } from '../sitzung'
import { aendern, artSetzen, hinzufuegen, referenzDateiLesen } from './laden'
import { LISTE_MAX_MB } from './liste'

async function mappe(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Glossar" r:id="rId1"/><sheet name="Leer" r:id="rId2"/><sheet name="Sonstiges" r:id="rId3"/></sheets></workbook>')
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>')
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Preferred</t></si><si><t>Avoid</t></si><si><t>take-off</t></si><si><t>takeoff</t></si></sst>')
  // Leere Zelle B2 bleibt leer, C2 landet in Spalte 3.
  zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>')
  zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData/></worksheet>')
  zip.file('xl/worksheets/sheet3.xml', '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Foo</t></is></c><c r="C1" t="inlineStr"><is><t>Bar</t></is></c></row></sheetData></worksheet>')
  return zip.generateAsync({ type: 'uint8array' })
}

const v = () => {
  const hoerer: ((z: unknown) => void)[] = []
  return { referenzen: vi.fn(), beiOcr: (h: (z: never) => void) => (hoerer.push(h as never), () => {}), hoerer }
}

beforeEach(() => fuerNutzer('u-ref-' + Math.random()))

describe('Referenzlisten laden', () => {
  it('Excel: jedes nicht leere Blatt eine Liste, Zellen an ihrer Spalte', async () => {
    const r = await referenzDateiLesen('soll.xlsx', await mappe())
    expect(r.map((x) => [x.blatt, x.liste?.art ?? null])).toEqual([['Glossar', 'glossar'], ['Sonstiges', null]])
    expect(r[1].zeilen).toEqual([['Foo', '', 'Bar']])
  })

  it('CSV und Markdown; leere Datei ergibt nichts', async () => {
    const enc = new TextEncoder()
    expect((await referenzDateiLesen('a.csv', enc.encode('Abbreviation;Meaning\nAFM;Flight manual')))[0].liste?.art).toBe('abkuerzungen')
    expect((await referenzDateiLesen('g.md', enc.encode('| Soll | Varianten |\n|-|-|\n| A | B |')))[0].liste?.art).toBe('glossar')
    expect(await referenzDateiLesen('x.csv', enc.encode(''))).toEqual([])
  })

  it('hinzufügen meldet Unerkanntes, gibt nur gültige Listen an den Worker; Art umstellen und entfernen', async () => {
    const vb = v()
    const r = await hinzufuegen([{ name: 'soll.xlsx', arrayBuffer: async () => (await mappe()).buffer as ArrayBuffer }], vb as never)
    expect(r.unbekannt).toEqual(['soll.xlsx / Sonstiges'])
    expect(vb.referenzen).toHaveBeenLastCalledWith([expect.objectContaining({ art: 'glossar' })])
    aendern(1, 'kennungen', vb as never)
    expect(lesenZustand().referenzen?.[1].liste).toBeNull() // „Foo/Bar" sind keine Kennungsspalten
    aendern(0, null, vb as never)
    expect(lesenZustand().referenzen).toHaveLength(1)
    expect(vb.referenzen).toHaveBeenLastCalledWith([])
  })

  it('nicht erkannte Liste: gewählte Art bleibt, Spalten von Hand → Liste geht an den Worker (Audit 11/2026, DC-13)', async () => {
    const vb = v()
    const r = await hinzufuegen([{ name: 'fremd.csv', arrayBuffer: async () => new TextEncoder().encode('Foo;Bar\nAFM;Airplane Flight Manual').buffer as ArrayBuffer }], vb as never)
    expect(r.unbekannt).toEqual(['fremd.csv'])
    // Art gewählt, Köpfe passen nicht: keine Liste, aber die Wahl springt nicht zurück
    aendern(0, 'abkuerzungen', vb as never)
    expect(lesenZustand().referenzen?.[0]).toMatchObject({ art: 'abkuerzungen', liste: null })
    expect(vb.referenzen).toHaveBeenLastCalledWith([])
    aendern(0, 'abkuerzungen', vb as never, { abk: 0, bedeutung: 1 })
    expect(lesenZustand().referenzen?.[0]).toMatchObject({ art: 'abkuerzungen', spalten: { abk: 0, bedeutung: 1 } })
    expect(vb.referenzen).toHaveBeenLastCalledWith([expect.objectContaining({ art: 'abkuerzungen', eintraege: [{ abk: 'AFM', bedeutung: 'Airplane Flight Manual' }] })])
    // Eine andere Art verwirft die Zuordnung — ihre Rollen gibt es dort nicht
    const neu = artSetzen(lesenZustand().referenzen![0], 'kennungen')
    expect(neu.spalten).toBeUndefined()
    expect(neu).toMatchObject({ art: 'kennungen', liste: null })
    expect(artSetzen(neu, 'kennungen', { kennung: 0, bezeichnung: 1 }).liste).toMatchObject({ art: 'kennungen', eintraege: [{ kennung: 'AFM', bezeichnung: 'Airplane Flight Manual' }] })
  })

  it('übergroße Datei: abgewiesen, bevor sie gelesen wird; die übrigen Dateien kommen trotzdem an (Audit 11/2026, SEC-01)', async () => {
    const zuGross = LISTE_MAX_MB * 1024 * 1024 + 1
    await expect(referenzDateiLesen('riesig.csv', new Uint8Array(zuGross))).rejects.toThrow('DC-LISTE-GROSS')
    const vb = v()
    const gelesen = vi.fn(async () => new ArrayBuffer(0))
    const kaputt = async () => new TextEncoder().encode('PK kaputt').buffer as ArrayBuffer
    const r = await hinzufuegen(
      [
        { name: 'riesig.xlsx', size: zuGross, arrayBuffer: gelesen },
        { name: 'kaputt.xlsx', arrayBuffer: kaputt },
        { name: 'a.csv', size: 30, arrayBuffer: async () => new TextEncoder().encode('Abbreviation;Meaning\nAFM;Flight manual').buffer as ArrayBuffer },
      ],
      vb as never,
    )
    expect(gelesen).not.toHaveBeenCalled()
    expect(r.fehler).toEqual([{ name: 'riesig.xlsx', code: 'DC-LISTE-GROSS' }, { name: 'kaputt.xlsx', code: 'DC-PARSE' }])
    expect(vb.referenzen).toHaveBeenLastCalledWith([expect.objectContaining({ art: 'abkuerzungen' })])
  })

  it('Neu geprüfte Dokumente aus dem Worker landen in der Sitzung', async () => {
    setzen((z) => neu(z, { id: 'd', rolle: 'review', name: 'd.pdf', groesse: 1 }))
    setzen((z) => fertig(z, 'd', { id: 'd', meta: {} } as never))
    const vb = v()
    await hinzufuegen([], vb as never)
    vb.hoerer[0]({ id: 'd', meta: {}, seiten: 9 })
    expect(lesenZustand().docs[0].z).toMatchObject({ seiten: 9 })
  })
})
