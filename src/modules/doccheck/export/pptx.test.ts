import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { datenstand } from './datenstand'
import { eingabe } from './beispiel'
import { kuerzen, pptxExport } from './pptx'

describe('PowerPoint-Kurzbriefing (Spez. v1.1 Kap. 10.7)', async () => {
  const d = datenstand(eingabe())
  const zip = await JSZip.loadAsync(await pptxExport(d))
  const folie = async (n: number) => (await zip.file(`ppt/slides/slide${n}.xml`)!.async('string')).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&')

  it('acht Folien 16:9 in fester Reihenfolge, Master mit Fußzeile', async () => {
    const folien = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    expect(folien).toHaveLength(8)
    const titel = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(async (n) => (await folie(n)).trim().split(/\s{2,}/)[0]))
    expect(titel).toEqual(['Document Review Briefing', 'Scope & Basis', 'Overall Assessment', 'Findings by Category and Priority', 'Top 5 Critical Findings', 'Formal & Document Control', 'Next Steps', 'Method & Disclaimer'])
    const pres = await zip.file('ppt/presentation.xml')!.async('string')
    expect(pres).toContain('cx="12192000" cy="6858000"')
    const layout = await zip.file('ppt/slideLayouts/slideLayout2.xml')?.async('string') ?? ''
    expect(layout + (await zip.file('ppt/slideLayouts/slideLayout1.xml')!.async('string'))).toContain('AI-assisted review – expert approval required')
  })

  it('Inhalte gleich dem Datenstand: Gesamtbewertung, Kacheln, Top 5 IDs, natives Diagramm', async () => {
    expect(await folie(3)).toContain('Not ready for submission')
    expect((await folie(3)).replace(/\s+/g, ' ')).toContain('5 Total 2 High 2 Medium 1 Low 1 To verify')
    for (const id of d.top5) expect(await folie(5)).toContain(id)
    const charts = Object.keys(zip.files).filter((p) => /^ppt\/charts\/chart\d+\.xml$/.test(p))
    expect(charts).toHaveLength(1)
    const chart = await zip.file(charts[0])!.async('string')
    expect(chart).toContain('<c:barChart>')
    expect(chart).toContain('Inconsistency')
    expect(await folie(6)).toContain('Yellow')
    expect(await folie(7)).toContain('To be assigned')
  })

  it('kürzt an der Grenze mit Verweis auf die ID, nie die Schrift', () => {
    expect(kuerzen('kurz', 10)).toBe('kurz')
    expect(kuerzen('a'.repeat(50), 20)).toBe(`${'a'.repeat(19)}…`)
    const k = kuerzen('x '.repeat(100), 40, 'TM-001')
    expect(k.length).toBeLessThanOrEqual(40)
    expect(k.endsWith('… (see TM-001)')).toBe(true)
  })

  it('0 Befunde: Hinweis statt leerer Tabellen', async () => {
    const z = await JSZip.loadAsync(await pptxExport(datenstand(eingabe({ befunde: [], ampeln: [{ dokId: 'tm', gruppen: { formal: { lep: 'ok', inhalt: 'na' } } }] }))))
    const t = async (n: number) => (await z.file(`ppt/slides/slide${n}.xml`)!.async('string')).replace(/<[^>]+>/g, ' ')
    expect(await t(5)).toContain('No findings.')
    expect(await t(6)).toContain('1 × Green, 1 × Not applicable')
    expect(await t(7)).toContain('No findings.')
  })

  it('Grenzfälle: ohne Organisation und Dokumente, Bewertung „ready" und „after correction", nur grüne Ampeln', async () => {
    const lesen = async (e: Parameters<typeof eingabe>[0], n: number) => {
      const z = await JSZip.loadAsync(await pptxExport(datenstand(eingabe(e))))
      return (await z.file(`ppt/slides/slide${n}.xml`)!.async('string')).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&')
    }
    const ohne = { organisation: '', dokumente: [], befunde: [], ampeln: [] }
    expect(await lesen(ohne, 1)).toContain('Package')
    expect(await lesen(ohne, 1)).not.toContain('Organisation')
    expect(await lesen(ohne, 2)).toContain('Document under review: —')
    expect(await lesen(ohne, 3)).toContain('Ready for submission')
    expect(await lesen(ohne, 6)).toContain('0 × Green, 0 × Not applicable')
    const niedrig = { befunde: [eingabe().befunde[0]] }
    expect(await lesen(niedrig, 3)).toContain('Ready for submission after correction')
    expect(await lesen(niedrig, 7)).toContain('No findings.')
    const ohneRev = { dokumente: [{ ...eingabe().dokumente[0], revision: '', titel: '' }] }
    expect(await lesen(ohneRev, 1)).toContain('tm.docx')
  })
})
