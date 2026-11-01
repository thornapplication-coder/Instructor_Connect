import JSZip from 'jszip'
import { pdfBauen, type PdfSeitenInhalt } from '../parse/pdfBauen'

/**
 * Synthetische Abnahmedateien des Nachtrags v1.2 (Kap. 20).
 *
 * Inhalte frei erfunden, keine echten Musterdaten — das Repo ist öffentlich.
 * Statt Binärdateien im Repo entstehen sie hier aus Code: Jeder Prüfpunkt
 * steht damit lesbar daneben, und eine Änderung am Testfall ist ein Diff,
 * keine neue Blackbox.
 */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function lauf(text: string, rPr = ''): string {
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

export function absatz(inhalt: string, pPr = ''): string {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inhalt}</w:p>`
}

export async function docxPacken(teile: { dokument: string; stile?: string; weitere?: Record<string, string> }): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${teile.dokument}</w:body></w:document>`)
  zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${W}>${teile.stile ?? ''}</w:styles>`)
  for (const [k, v] of Object.entries(teile.weitere ?? {})) zip.file(k, v)
  // Feste Zeitstempel: dieselbe Eingabe ergibt dieselbe Datei.
  for (const f of Object.values(zip.files)) f.date = new Date(Date.UTC(2026, 0, 1))
  return zip.generateAsync({ type: 'uint8array' })
}

/* ------------------------------ SBX-WORD-01 ------------------------------ */

/**
 * N4.4: weißer Text in Tabellenzelle ohne Schattierung (Befund); weißer Text
 * in der Kopfzeile einer Tabelle mit dunkler Formatvorlagen-Schattierung
 * (KEIN Befund); `w:vanish`; spanisch/italienisch markierte englische
 * Absätze; `noProof` auf Überschriften; letzter leerer Abschnitt mit eigener
 * Kopfzeile und abweichendem Datum; Dateiname E2R0.0 bei Deckblatt
 * „Edition 1"; verirrtes Fragment auf dem Deckblatt. Dazu Textmarker,
 * Textfeld mit eigener Füllung, ungenutzte Kopfzeile, Eigenschaften.
 */
export const SBX_WORD_01_NAME = 'SBX-WORD-01_TM_E2R0.0.docx'

export async function sbxWord01(): Promise<Uint8Array> {
  const stile = `
    <w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:noProof/></w:rPr></w:style>
    <w:style w:type="table" w:styleId="GridDark"><w:name w:val="Grid Dark"/>
      <w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:fill="1F3864"/></w:tcPr></w:tblStylePr>
    </w:style>`
  const kopf = (text: string) => `<?xml version="1.0"?><w:hdr ${W}>${absatz(lauf(text))}</w:hdr>`
  const textfeld =
    '<w:r><mc:AlternateContent><mc:Choice><w:drawing><wps:wsp><wps:spPr><a:solidFill><a:srgbClr val="002060"/></a:solidFill></wps:spPr><wps:txbx><w:txbxContent>' +
    absatz(lauf('Doc No.: SBX-WORD-01', '<w:color w:val="FFFFFF"/>')) +
    '</w:txbxContent></wps:txbx></wps:wsp></w:drawing></mc:Choice><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r>'
  const dokument = [
    absatz(lauf('Training Manual (synthetic)') + textfeld),
    absatz(lauf('Edition 1, Revision 0.0')),
    // Verirrtes Fragment auf dem Deckblatt — keine Überschrift.
    absatz(lauf('3.8.3.')),
    absatz(lauf('Edition 1 | 01.03.2026'), '<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/></w:sectPr>'),
    absatz(lauf('1 General'), '<w:pStyle w:val="Heading1"/>'),
    absatz(lauf('This paragraph is English but marked as Spanish.', '<w:lang w:val="es-ES"/>')),
    absatz(lauf('This paragraph is English but marked as Italian.', '<w:lang w:val="it-IT"/>')),
    absatz(lauf('Visible text. ') + lauf('hidden remark', '<w:vanish/>') + lauf(' Placeholder [TBD]', '<w:highlight w:val="yellow"/>')),
    '<w:tbl><w:tblPr><w:tblStyle w:val="GridDark"/><w:tblLook w:firstRow="1" w:noHBand="1"/></w:tblPr>' +
      `<w:tr><w:tc>${absatz(lauf('Item', '<w:color w:val="FFFFFF"/>'))}</w:tc><w:tc>${absatz(lauf('Value', '<w:color w:val="FFFFFF"/>'))}</w:tc></w:tr>` +
      `<w:tr><w:tc>${absatz(lauf('VMO'))}</w:tc><w:tc>${absatz(lauf('internal note do not submit', '<w:color w:val="FFFFFF"/>'))}</w:tc></w:tr>` +
      '</w:tbl>',
    absatz(lauf('Tiny text', '<w:sz w:val="3"/>')),
    absatz('', '<w:sectPr><w:headerReference w:type="default" r:id="rIdH1"/></w:sectPr>'),
    // Letzter, leerer Abschnitt mit eigener Kopfzeile und altem Datum.
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdH2"/></w:sectPr>',
  ].join('')
  return docxPacken({
    dokument,
    stile,
    weitere: {
      'word/_rels/document.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdH1" Target="header1.xml"/><Relationship Id="rIdH2" Target="header2.xml"/></Relationships>',
      'word/header1.xml': kopf('Training Manual | Edition 1 | 01.03.2026'),
      'word/header2.xml': kopf('Training Manual | Edition 1 | 15.01.2025'),
      'word/header3.xml': kopf('Old draft header 2024'),
      'word/settings.xml': `<w:settings ${W}><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="14"/></w:compat></w:settings>`,
      'docProps/core.xml': '<cp:coreProperties xmlns:cp="c" xmlns:dc="d" xmlns:dcterms="t"><dc:title></dc:title><dc:creator>A. Example</dc:creator><cp:lastModifiedBy>B. Example</cp:lastModifiedBy><dcterms:modified>2026-03-01T10:00:00Z</dcterms:modified></cp:coreProperties>',
      'docProps/app.xml': '<Properties><Pages>3</Pages></Properties>',
    },
  })
}

/* ------------------------------ SBX-PAGE-01 ------------------------------ */

/** Deterministischer Zufall — dieselbe Datei bei jedem Lauf. */
function zufall(saat: number): () => number {
  let x = saat
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296
    return x / 4294967296
  }
}

const WOERTER = 'pilot check system pressure engine fuel battery flap speed altitude climb descent approach procedure crew monitor verify select confirm advise maintain reduce increase normal abnormal emergency valve pump switch panel display indication caution warning limit'.split(' ')

export const ZEICHEN_JE_ZEILE = 90
export const ZEILEN_JE_SEITE = 40

/** Wortweiser Umbruch wie ein einfacher Satz — Grundlage des simulierten Word-Umbruchs. */
export function umbrechen(text: string, breite = ZEICHEN_JE_ZEILE): string[] {
  const zeilen: string[] = []
  let z = ''
  for (const w of text.split(' ')) {
    if (z && z.length + 1 + w.length > breite) {
      zeilen.push(z)
      z = w
    } else z = z ? `${z} ${w}` : w
  }
  if (z) zeilen.push(z)
  return zeilen
}

export interface SbxPage01 {
  docx: Uint8Array
  pdf: Uint8Array
  /** 20 Fundstellen mit der Seite, auf der sie im Word-PDF stehen */
  stichproben: { text: string; seite: number }[]
  seiten: number
}

/**
 * Ein DOCX mit Inhaltsverzeichnis (Words Seitenzahlen) und das „aus Word
 * exportierte" PDF mit demselben Umbruch. Words Umbruch wird simuliert:
 * 90 Zeichen je Zeile, 40 Zeilen je Seite. Im DOCX stehen — wie bei echten
 * Dateien, die nie gerendert wurden — KEINE Umbruchmarken außer nach dem
 * Inhaltsverzeichnis; die Näherung über Marken läge also daneben.
 */
export async function sbxPage01(): Promise<SbxPage01> {
  const r = zufall(42)
  const abschnitte = Array.from({ length: 12 }, (_, i) => ({
    titel: `${i + 1} ${['General', 'Systems', 'Limitations', 'Normal Procedures', 'Abnormal Procedures', 'Emergency Procedures', 'Performance', 'Weight and Balance', 'Handling', 'Supplements', 'Training Syllabus', 'Assessment'][i]}`,
    absaetze: Array.from({ length: 3 + Math.floor(r() * 6) }, (_, k) => {
      const n = 15 + Math.floor(r() * 140)
      return [`Marker-${i + 1}-${k + 1}`, ...Array.from({ length: n }, () => WOERTER[Math.floor(r() * WOERTER.length)])].join(' ')
    }),
  }))

  // Simulierter Umbruch: Seite 1 = Inhaltsverzeichnis, Inhalt ab Seite 2.
  type Zeile = { text: string; seite: number }
  const pdfSeiten: string[][] = [[]]
  const zeilen: Zeile[] = []
  let seite = 2
  let belegt = 0
  const setzen = (text: string) => {
    if (belegt >= ZEILEN_JE_SEITE) {
      seite++
      belegt = 0
    }
    zeilen.push({ text, seite })
    belegt++
  }
  const titelSeite: number[] = []
  for (const a of abschnitte) {
    if (belegt > ZEILEN_JE_SEITE - 4) {
      seite++
      belegt = 0
    }
    if (belegt > 0) setzen('')
    setzen(a.titel)
    titelSeite.push(zeilen[zeilen.length - 1].seite)
    for (const p of a.absaetze) {
      for (const z of umbrechen(p)) setzen(z)
      setzen('')
    }
  }
  const letzte = seite
  for (let s = 2; s <= letzte; s++) pdfSeiten[s - 1] = zeilen.filter((z) => z.seite === s && z.text).map((z) => z.text)
  pdfSeiten[0] = ['Contents', ...abschnitte.map((a, i) => `${a.titel} ${titelSeite[i]}`)]

  const pdf = pdfBauen(
    pdfSeiten.map((ls, i): PdfSeitenInhalt => ({
      texte: [...ls.map((t, k) => ({ text: t, x: 50, y: 800 - k * 18, groesse: 9 })), { text: `SBX-PAGE-01 Page ${i + 1}`, x: 50, y: 20, groesse: 8 }],
    })),
  )

  const stile = `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
    <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>`
  const toc = abschnitte.map((a, i) => absatz(lauf(a.titel) + '<w:r><w:tab/></w:r>' + lauf(String(titelSeite[i])), '<w:pStyle w:val="TOC1"/>')).join('')
  const inhalt = abschnitte.map((a) => absatz(lauf(a.titel), '<w:pStyle w:val="Heading1"/>') + a.absaetze.map((p) => absatz(lauf(p))).join('')).join('')
  const docx = await docxPacken({
    dokument: absatz(lauf('Contents')) + toc + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' + inhalt,
    stile,
    weitere: {
      'docProps/app.xml': `<Properties><Pages>${letzte}</Pages></Properties>`,
      'docProps/core.xml': '<cp:coreProperties xmlns:cp="c" xmlns:dc="d" xmlns:dcterms="t"><dcterms:modified>2026-03-01T10:00:00Z</dcterms:modified></cp:coreProperties>',
    },
  })

  // 20 Stichproben: fünf Wörter aus der Mitte einer Inhaltszeile.
  const kandidaten = zeilen.filter((z) => z.text.split(' ').length >= 8 && !/^Marker/.test(z.text))
  const stichproben: SbxPage01['stichproben'] = []
  const gewaehlt = new Set<number>()
  while (stichproben.length < 20) {
    const i = Math.floor(r() * kandidaten.length)
    if (gewaehlt.has(i)) continue
    gewaehlt.add(i)
    const w = kandidaten[i].text.split(' ')
    const text = w.slice(2, 7).join(' ')
    // Nur eindeutige Stichproben: Eine Wortfolge, die mehrfach vorkommt,
    // hätte keine eindeutige Seite.
    if (zeilen.filter((z) => z.text.includes(text)).length !== 1) continue
    stichproben.push({ text, seite: kandidaten[i].seite })
  }
  return { docx, pdf, stichproben, seiten: letzte }
}
