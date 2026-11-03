import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { datenstand, FUSS_MAX, fussText, LABELS } from './datenstand'
import { befund, dok, eingabe } from './beispiel'
import { ampelOhneAuffaelliges, auffaelligeAmpeln, folien, KOPF_ORGANISATION_MAX, kopfText, kuerzen, nacharbeiten, naechsteSchritte, pptxExport, TITEL_MAX, titelFolie, wertachse } from './pptx'

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

  it('Scope & Basis nennt die KI-Modelle des Stands, sonst „keine" (Audit 11/2026, EXP-12)', async () => {
    expect(await folie(2)).toContain(`${LABELS.ident.models}: ${LABELS.noModel}`)
    const ki = await JSZip.loadAsync(await pptxExport(datenstand(eingabe({ modelle: 'Testmodell' }))))
    expect(await ki.file('ppt/slides/slide2.xml')!.async('string')).toContain(`${LABELS.ident.models}: Testmodell`)
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
    expect(await t(4)).toContain('No findings.')
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
    // Erwartung bewusst geändert (Audit 11/2026, EXP-21): vorher „0 × Green, 0 × Not applicable"
    expect(await lesen(ohne, 6)).toContain(LABELS.briefing.noChecks)
    expect(await lesen(ohne, 6)).not.toContain('0 ×')
    const niedrig = { befunde: [eingabe().befunde[0]] }
    expect(await lesen(niedrig, 3)).toContain('Ready for submission after correction')
    expect(await lesen(niedrig, 7)).toContain('No findings.')
    const ohneRev = { dokumente: [{ ...eingabe().dokumente[0], revision: '', titel: '' }] }
    expect(await lesen(ohneRev, 1)).toContain('tm.docx')
  })

  it('Folie 2 nennt nur die gelaufenen Prüfungen (Audit 11/2026, EXP-01/DC-12)', async () => {
    const f2 = (await folie(2)).replace(/\s+/g, ' ')
    expect(f2).toContain(`Checks performed: ${LABELS.checks.formal}, ${LABELS.checks.word}, ${LABELS.checks.paket}`)
    expect(f2).not.toMatch(/Calculations|Regulatory references|Language/)
  })

  it('Steuerzeichen aus PDF-Text oder Prüfstand machen keine Folie ungültig (Audit 11/2026, SEC-04)', async () => {
    // Vorher: „Bullet\u0002text" → slide5.xml und slide7.xml nicht wohlgeformt (expat: invalid token)
    const roh = eingabe({ organisation: 'Example\u0007 ATO', befunde: [befund('F-01', 'tm', { prioritaet: 'High', text: 'Bullet\u0002text from PDF', fundstellen: [{ seite: 'S. 3', ort: 'Kap\u000B 1', auszug: 'a\u001Fb' }] })] })
    const z = await JSZip.loadAsync(await pptxExport(datenstand(roh)))
    const teile = Object.keys(z.files).filter((p) => /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(p))
    expect(teile.length).toBeGreaterThan(8)
    for (const p of teile) expect(await z.file(p)!.async('string'), p).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
    expect(await z.file('ppt/slides/slide5.xml')!.async('string')).toContain('Bullettext from PDF')
  })

  it('Folie 1 nennt Hauptdokument und weitere Prüfdokumente — wie Kennung und Fußzeile (Audit 11/2026, EXP-08)', async () => {
    expect((await folie(1)).replace(/\s+/g, ' ')).toContain('Training Manual CL30 Rev 0.1 + 1 further document')
  })

  it('Folie 1: langer Titel mit „…" gekürzt, Revision und weitere Dokumente ganz, Feld für zwei Zeilen (Audit 11/2026, EXP-14)', async () => {
    // Vorher: Titel ungekürzt in einem Feld für eine Zeile (0,9 in) — er lief in die Aufzählung darunter
    const titel = `Training and Procedures Manual for Type Rating Courses ${'Volume '.repeat(30)}`.slice(0, 200)
    const lang = datenstand(eingabe({ dokumente: [dok('tm', 'review', { titel, revision: 'Rev. 3 / Amendment 2' })] }))
    const t = titelFolie(lang)
    expect(t.length).toBeLessThanOrEqual(TITEL_MAX)
    expect(t).toMatch(/^Training and Procedures Manual for Type Rating Courses Volume.*… Rev 3 \/ Amendment 2$/)
    const z = await JSZip.loadAsync(await pptxExport(lang))
    const xml = await z.file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain(`<a:t>${t}</a:t>`)
    expect(xml).not.toContain(titel)
    // Mit weiteren Prüfdokumenten bleibt auch deren Zahl ganz
    const paket = datenstand(eingabe({ dokumente: [dok('tm', 'review', { titel, revision: 'Rev 0.1' }), dok('b', 'review'), dok('c', 'review')] }))
    const p = titelFolie(paket)
    expect(p.length).toBeLessThanOrEqual(TITEL_MAX)
    expect(p.endsWith('… Rev 0.1 + 2 further documents')).toBe(true)
    // Kurzer Titel unverändert; eine sehr lange Revision verdrängt den Titel nicht ganz
    expect(titelFolie(d)).toBe('Training Manual CL30 Rev 0.1 + 1 further document')
    const revLang = titelFolie(datenstand(eingabe({ dokumente: [dok('tm', 'review', { titel, revision: `Rev ${'1.'.repeat(50)}1` })] })))
    expect(revLang).toMatch(/^Training and Proced… Rev /)
    expect(revLang).toContain(`Rev ${'1.'.repeat(50)}1`)
    // Ohne Prüfdokument wie bisher
    expect(titelFolie({ haupt: null, dokumente: [] })).toBe('Package')
  })
})

describe('PowerPoint: Next Steps und Formal & Document Control schneiden nicht still ab (Audit 11/2026, EXP-05)', async () => {
  // Drei Dokumente; der einzige High-Befund und die einzige rote Ampel stehen im dritten, davor zehn Mediums bzw. viele gelbe
  const docs = [dok('a', 'review', { typ: 'TM', titel: 'Doc A' }), dok('b', 'review', { typ: 'OM', titel: 'Doc B' }), dok('c', 'review', { typ: 'SOP', titel: 'Doc C' })]
  const mediums = Array.from({ length: 10 }, (_, i) => befund(`F-${String(i + 1).padStart(2, '0')}`, i < 5 ? 'a' : 'b', { prioritaet: 'Medium' }))
  const gelb = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, 'wait' as const]))
  const d = datenstand(
    eingabe({
      dokumente: docs,
      befunde: [...mediums, befund('F-01', 'c', { prioritaet: 'High', text: 'Only high finding' }), befund('F-02', 'c', { prioritaet: 'Low' })],
      ampeln: [{ dokId: 'a', gruppen: { formal: gelb(10) } }, { dokId: 'b', gruppen: { formal: gelb(6) } }, { dokId: 'c', gruppen: { formal: { lep: 'bad', seiten: 'wait' } } }],
    }),
  )
  const zip = await JSZip.loadAsync(await pptxExport(d))
  const folie = async (n: number) => (await zip.file(`ppt/slides/slide${n}.xml`)!.async('string')).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

  it('Folie 7: High zuerst, dann Mediums in Export-Reihenfolge; Rest mit Verweis auf Excel/Word', async () => {
    // Vorher: die ersten acht in Export-Reihenfolge — acht Mediums aus Doc A/B, der High-Befund SOP-001 fehlte
    const n = naechsteSchritte(d)
    expect(n.zeilen.map((b) => b.id)).toEqual(['SOP-001', 'TM-001', 'TM-002', 'TM-003', 'TM-004', 'TM-005', 'OM-001', 'OM-002'])
    expect(n.rest).toBe(3)
    const f7 = await folie(7)
    expect(f7).toContain('SOP-001')
    expect(f7).toContain('+ 3 further – see Excel/Word (Export ID DC-2026-11-01-0007)')
    expect(f7).not.toContain('SOP-002')
  })

  it('Folie 6: Rot vor Gelb, reihum über die Dokumente; Rest gezählt', async () => {
    // Vorher: die ersten zwölf in Dokumentreihenfolge — alle aus Doc A, die rote Ampel von Doc C fehlte
    const a = auffaelligeAmpeln(d)
    expect(a.zeilen[0]).toMatchObject({ dokument: 'Doc C', ampel: 'bad' })
    expect(a.zeilen.slice(1, 4).map((z) => z.dokument)).toEqual(['Doc A', 'Doc B', 'Doc C'])
    expect(a.zeilen).toHaveLength(12)
    expect(a.rest).toBe(1 + 10 + 6 + 1 - 12)
    const f6 = await folie(6)
    expect(f6).toContain('Doc C')
    expect(f6).toContain('Red')
    expect(f6).toContain(`+ ${a.rest} further – see Excel/Word`)
  })

  it('ohne Überlauf keine Restzeile', async () => {
    const klein = datenstand(eingabe())
    expect([naechsteSchritte(klein).rest, auffaelligeAmpeln(klein).rest]).toEqual([0, 0])
    expect(await folie7(klein)).not.toContain('further –')
    expect(auffaelligeAmpeln({ ampeln: [] })).toEqual({ zeilen: [], rest: 0 })
  })

  async function folie7(x: typeof d) {
    const z = await JSZip.loadAsync(await pptxExport(x))
    return z.file('ppt/slides/slide7.xml')!.async('string')
  }
})

describe('PowerPoint: leerer Stand ohne Bruchzahlen und Leersätze (Audit 11/2026, EXP-21)', async () => {
  const leer = datenstand(eingabe({ befunde: [], ampeln: [] }))
  const zip = await JSZip.loadAsync(await pptxExport(leer))
  const folie = async (n: number) => (await zip.file(`ppt/slides/slide${n}.xml`)!.async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('ohne Prüfpunkte: Folie 6 sagt es, statt „0 × Green, 0 × Not applicable"', async () => {
    expect(await folie(6)).toContain('No formal checks performed.')
    expect(await folie(6)).not.toContain('0 ×')
  })

  it('ohne Befunde kein leeres Diagramm, sondern derselbe Hinweis wie auf Folie 5 und 7', async () => {
    // Vorher: Diagramm mit Achse 0, 0.1 … 1 für Anzahlen
    expect(await folie(4)).toContain(LABELS.summary.noFindings)
    expect(zip.file(/^ppt\/(charts\/chart\d+\.xml|embeddings\/.+)$/)).toEqual([])
  })

  it('mit Befunden: Zählachse ab 0 in ganzen Schritten, ohne Nachkommastellen', async () => {
    const z = await JSZip.loadAsync(await pptxExport(datenstand(eingabe())))
    // Die Diagrammnummer zählt pptxgenjs über alle Präsentationen eines Laufs hoch
    const achse = (await z.file(/^ppt\/charts\/chart\d+\.xml$/)[0].async('string')).match(/<c:valAx>.*<\/c:valAx>/s)![0]
    expect(achse).toContain('<c:min val="0"/>')
    expect(achse).toContain('<c:majorUnit val="1"/>')
    expect(achse).toContain('<c:numFmt formatCode="0"')
  })

  it('Einerschritte bis 10 Befunde je Kategorie (gestapelt gezählt), darüber wählt das Programm', () => {
    const zaehlung = (n: number) => ({ ...leer.zaehlung, Gap: { High: n - 2, Medium: 1, Low: 1 } })
    expect(wertachse(leer)).toEqual({ valAxisMinVal: 0, valAxisLabelFormatCode: '0', valAxisMajorUnit: 1 })
    expect(wertachse({ zaehlung: zaehlung(10) }).valAxisMajorUnit).toBe(1)
    expect(wertachse({ zaehlung: zaehlung(11) })).toEqual({ valAxisMinVal: 0, valAxisLabelFormatCode: '0' })
  })

  it('nur grüne bzw. nicht anwendbare Ampeln: ohne „0 ×"-Teile', () => {
    const a = (ampel: 'ok' | 'na') => ({ dokument: 'Doc', gruppe: 'Formal check', punkt: 'LEP', ampel })
    expect(ampelOhneAuffaelliges({ ampeln: [a('ok'), a('ok')] })).toBe('2 × Green')
    expect(ampelOhneAuffaelliges({ ampeln: [a('na')] })).toBe('1 × Not applicable')
    expect(ampelOhneAuffaelliges({ ampeln: [a('ok'), a('na')] })).toBe('1 × Green, 1 × Not applicable')
    expect(ampelOhneAuffaelliges({ ampeln: [] })).toBe(LABELS.briefing.noChecks)
  })
})

describe('PowerPoint: Tabellenköpfe aus labels.en.json, Top 5 mit „Location" (Audit 11/2026, TXT-16)', async () => {
  const zip = await JSZip.loadAsync(await pptxExport(datenstand(eingabe())))
  const zeilen = async (n: number) =>
    ((await zip.file(`ppt/slides/slide${n}.xml`)!.async('string')).match(/<a:tr .*?<\/a:tr>/gs) ?? []).map((r) => (r.match(/<a:t>[^<]*<\/a:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')))

  it('Top 5: Kopf „Location", Zeile mit Kapitel UND Seite', async () => {
    // Vorher: Kopf „Chapter", Inhalt Kapitel ODER Seite — meist stand die Seite unter „Chapter"
    const t = await zeilen(5)
    expect(t[0]).toEqual([LABELS.columns[0], LABELS.report.location, LABELS.columns[16], LABELS.columns[17]])
    const ort = new Map(t.slice(1).map((z) => [z[0], z[1]]))
    expect(ort.get('TM-001')).toBe('2.1 Hours · Page 3')
    expect(ort.get('TM2-001')).toBe('1 General · Page 2')
    // Ohne Kapitel nur die Seite; ohne beides bleibt die Zelle leer (die nächste ist schon der Befund)
    expect(ort.get('TM-002')).toBe('Page 3')
    expect(ort.get('PKG-001')).toBe('Finding P-01')
  })

  it('Folie 6 und 7: Köpfe aus den Spaltenbezeichnungen der Exporte', async () => {
    expect((await zeilen(6))[0]).toEqual([LABELS.columns[1], LABELS.report.checkpoint, LABELS.columns[23]])
    expect((await zeilen(7))[0]).toEqual([LABELS.columns[0], LABELS.columns[16], LABELS.columns[21], LABELS.columns[22]])
  })
})

describe('PowerPoint: Sprache, Dateieigenschaften, Titelplatzhalter (Audit 11/2026, EXM-02/EXM-03/EXM-08)', async () => {
  const d = datenstand(eingabe({ organisation: 'Example ATO GmbH & Co KG' }))
  const zip = await JSZip.loadAsync(await pptxExport(d))
  const teil = (p: string) => zip.file(p)!.async('string')
  const xmlTeile = Object.keys(zip.files).filter((p) => /^ppt\/.*\.xml$/.test(p))
  const folienTeile = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))

  it('jeder Lauf en-GB — auch Foliennummer, Diagramm, Master und Notizen (EXM-02)', async () => {
    // Vorher: lang="en-US" überall (Vorgabe von pptxgenjs), der Text ist britisch („Organisation", „colour")
    expect(xmlTeile.length).toBeGreaterThan(20)
    for (const p of xmlTeile) expect(await teil(p), p).not.toMatch(/\slang="(?!en-GB")/)
    for (const p of folienTeile) expect(await teil(p), p).toContain('lang="en-GB"')
    const diagramm = xmlTeile.filter((p) => /^ppt\/charts\/chart\d+\.xml$/.test(p))
    expect(diagramm).toHaveLength(1)
    expect(await teil(diagramm[0])).toContain('lang="en-GB"')
  })

  it('Eigenschaften fachlich: Thema, Firma = Organisation (maskiert), keine Bibliotheksvorgaben (EXM-03)', async () => {
    const core = await teil('docProps/core.xml')
    const app = await teil('docProps/app.xml')
    // Vorher: Thema „PptxGenJS Presentation", Firma „PptxGenJS", Anwendung „Microsoft Office PowerPoint"
    for (const x of [core, app]) expect(x).not.toMatch(/PptxGenJS|Un-named|Microsoft/)
    expect(core).toContain('<dc:subject>DocCheck Review – Training Manual CL30 Rev 0.1 + 1 further document</dc:subject>')
    expect(core).toContain('<cp:lastModifiedBy>DocCheck</cp:lastModifiedBy>')
    // pptxgenjs maskiert die Firma nicht — ungeschützt wäre „& Co" ungültiges XML
    expect(app).toContain('<Company>Example ATO GmbH &amp; Co KG</Company>')
    expect(app).toContain('<Application>DocCheck</Application>')
    const ohne = await JSZip.loadAsync(await pptxExport(datenstand(eingabe({ organisation: '' }))))
    expect(await ohne.file('docProps/app.xml')!.async('string')).toContain('<Company></Company>')
  })

  it('eingebettete Diagramm-Mappe ohne „PptxGenJS" als Autor (EXM-03)', async () => {
    const mappen = Object.keys(zip.files).filter((p) => /^ppt\/embeddings\/.*\.xlsx$/.test(p))
    expect(mappen).toHaveLength(1)
    const mappe = await JSZip.loadAsync(await zip.file(mappen[0])!.async('uint8array'))
    const core = await mappe.file('docProps/core.xml')!.async('string')
    const app = await mappe.file('docProps/app.xml')!.async('string')
    expect(core + app).not.toMatch(/PptxGenJS|Microsoft/)
    expect(core).toContain('<dc:creator>DocCheck</dc:creator>')
    // Das Diagramm liest seine Werte weiter aus der Mappe
    expect(await mappe.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('<sheetData>')
  })

  it('jede Folie trägt ihren Titel im Titelplatzhalter des Masters, 22 pt ohne Verkleinerung (EXM-08)', async () => {
    // Vorher: Titel als freies Textfeld — Gliederung, Barrierefreiheitsprüfung und PDF-Lesezeichen sahen nur „Slide 1…8"
    const { titel } = folien(d)
    expect(titel).toHaveLength(8)
    for (const [i, p] of folienTeile.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).entries()) {
      const xml = await teil(p)
      const form = xml.match(/<p:sp>(?:(?!<\/p:sp>).)*<p:ph\s[^>]*type="title"(?:(?!<\/p:sp>).)*<\/p:sp>/s)?.[0]
      expect(form, p).toBeDefined()
      expect(form).toContain(`<a:t>${titel[i].replace(/&/g, '&amp;')}</a:t>`)
      expect(form).toContain('sz="2200"')
      expect(form).not.toMatch(/normAutofit|spAutoFit/)
    }
    const layout = await teil('ppt/slideLayouts/slideLayout2.xml')
    expect(layout).toMatch(/<p:ph\s[^>]*type="title"/)
    // Links bündig wie vorher, nicht zentriert wie der Titelstil des Masters
    expect(layout).toMatch(/type="title".*?<a:lvl1pPr[^>]*algn="l"/s)
    // app.xml nennt die Folientitel statt „Slide n"
    const app = await teil('docProps/app.xml')
    expect(app).not.toMatch(/<vt:lpstr>Slide \d+<\/vt:lpstr>/)
    expect(app).toContain('<vt:lpstr>Scope &amp; Basis</vt:lpstr>')
  })

  it('Nacharbeit: Folie ohne bekannten Titel behält „Slide n"', async () => {
    const roh = (await folien(d).praesentation.write({ outputType: 'uint8array' })) as Uint8Array
    const z = await JSZip.loadAsync(await nacharbeiten(roh, ['Nur die erste']))
    const app = await z.file('docProps/app.xml')!.async('string')
    expect(app).toContain('<vt:lpstr>Nur die erste</vt:lpstr>')
    expect(app).toContain('<vt:lpstr>Slide 2</vt:lpstr>')
  })
})

describe('PowerPoint: Fuß- und Kopfleiste des Masters mit Textgrenze (Audit 11/2026, EXP-04, Nachtrag EXPDC#6)', async () => {
  // Vorher brach die Fußzeile bei langem Titel zweizeilig bis an den unteren Folienrand,
  // eine lange Organisation die Kopfleiste dreizeilig über den blauen Balken
  const titel = 'Operations Manual Part D – Training Programme for the Type Rating Instructor Course A320 including Line Training'
  const organisation = 'Aviation Academy Austria GmbH – Approved Training Organisation AT.ATO.106'
  const d = datenstand(eingabe({ organisation, dokumente: [dok('tm', 'review', { titel, revision: 'Rev. 3 / Amendment 2' }), dok('b', 'review')] }))
  const zip = await JSZip.loadAsync(await pptxExport(d))
  const masterTexte = async () => {
    const teile = Object.keys(zip.files).filter((p) => /^ppt\/(slideLayouts|slideMasters)\/[^/]+\.xml$/.test(p))
    const texte = await Promise.all(teile.map(async (p) => ((await zip.file(p)!.async('string')).match(/<a:t>[^<]*<\/a:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'))))
    return [...new Set(texte.flat())]
  }

  it('Fußzeile: dieselbe gekürzte Angabe wie Excel und Word, Export-ID und Disclaimer ganz', async () => {
    const fuss = (await masterTexte()).filter((t) => t.endsWith(LABELS.disclaimer))
    expect(fuss).toEqual([`${fussText(d)} · ${LABELS.disclaimer}`])
    expect(Array.from(fussText(d)).length).toBeLessThanOrEqual(FUSS_MAX)
    expect(fuss[0]).toContain(' · DC-2026-11-01-0007 · ')
    expect(fuss[0]).not.toContain(titel)
  })

  it('Kopfleiste: Organisation gekürzt, Produkt ganz; kurze Organisation unverändert, ohne Organisation nur das Produkt', async () => {
    const kopf = (await masterTexte()).filter((t) => t.endsWith(LABELS.product) && !t.includes(LABELS.disclaimer))
    expect(kopf).toEqual([kopfText(d)])
    expect(kopf[0]).toBe(`Aviation Academy Austria GmbH – Approve… · ${LABELS.product}`)
    expect(Array.from(kopf[0].split(' · ')[0]).length).toBeLessThanOrEqual(KOPF_ORGANISATION_MAX)
    expect(kopfText({ organisation: 'Aviation Academy Austria GmbH' })).toBe(`Aviation Academy Austria GmbH · ${LABELS.product}`)
    expect(kopfText({ organisation: '' })).toBe(LABELS.product)
  })
})
