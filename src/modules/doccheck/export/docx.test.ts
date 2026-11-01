import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { datenstand } from './datenstand'
import { eingabe } from './beispiel'
import { berichtAbschnitte, docxExport } from './docx'

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
})
