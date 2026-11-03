import JSZip from 'jszip'
import { FUSS_MAX, fussText, kennung, LABELS as L, type Datenstand } from './datenstand'

/**
 * Excel im Projektformat (Spez. v1.1 Kap. 10.4): Summary, Findings,
 * Compliance Matrix, Documents & Sources.
 *
 * Von Hand geschrieben wie `recheck/rueckschreiben.ts` — ohne Excel-
 * Bibliothek (CLAUDE.md: bewusst ohne SheetJS). Das Layout ist damit
 * Code: feste Spaltenbreiten, feste Formate, feste Reihenfolge. Zahlen in
 * „Summary" sind ECHTE Formeln auf „Findings" (COUNTIFS) mit
 * mitgeliefertem Ergebnis, damit auch Vorschauprogramme ohne
 * Neuberechnung die richtigen Zahlen zeigen.
 */

/** Akzentfarbe der App (Hellmodus, `--c-accent`) als feste Konstante des Export-Layouts. */
export const AKZENT = '2563BE'

/** Zellformate (Index in cellXfs) — eine Stelle, alle Blätter. */
const S = { normal: 0, hinweis: 1, kopf: 2, text: 3, schluessel: 4, titel: 5, zahl: 6, zahlFett: 7 } as const

/** Text für XML: Steuerzeichen raus, Sonderzeichen maskiert — auch für Stellen, an denen pptxgenjs selbst nicht maskiert. */
export const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function spaltenName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export type Zelle = string | number | { f: string; v: number } | null
type Zeile = { zellen: Zelle[]; stil?: number; stile?: number[]; hoehe?: number }

function zelle(ref: string, z: Zelle, stil: number): string {
  if (z === null || z === '') return `<c r="${ref}" s="${stil}"/>`
  if (typeof z === 'number') return `<c r="${ref}" s="${stil}"><v>${z}</v></c>`
  if (typeof z === 'object') return `<c r="${ref}" s="${stil}"><f>${esc(z.f)}</f><v>${z.v}</v></c>`
  return `<c r="${ref}" s="${stil}" t="inlineStr"><is><t xml:space="preserve">${esc(z)}</t></is></c>`
}

/** Höhe einer Textzeile in Arial 10 (wie `defaultRowHeight`). */
const ZEILE_PT = 13.2

/**
 * Zeilenhöhe für Text in VERBUNDENEN Zellen: Excel passt die Höhe dort
 * nicht selbst an — ohne Angabe bliebe eine Zeile sichtbar und der Rest
 * abgeschnitten. `breite` ist die Summe der Spaltenbreiten in Zeichen der
 * Standardschrift; Fließtext ist schmaler als die Ziffer, nach der Excel
 * misst, die Schätzung reicht also auch mit Wortumbruch. Eine Zeile braucht
 * keine Angabe (`undefined`) — dann misst das Programm selbst.
 */
export function zeilenHoehe(text: string, breite: number): number | undefined {
  const zeilen = text.split('\n').reduce((n, absatz) => n + Math.max(1, Math.ceil(Array.from(absatz).length / Math.max(1, breite))), 0)
  return zeilen > 1 ? Math.round(zeilen * ZEILE_PT * 10) / 10 : undefined
}

/** Breite eines verbundenen Bereichs in Zeichen der Standardschrift. */
const gesamtBreite = (breiten: number[]) => breiten.reduce((a, b) => a + b, 0)

function zeilenXml(zeilen: Zeile[], ab = 1): string {
  return zeilen
    .map((z, i) => {
      const r = ab + i
      const zellen = z.zellen.map((c, k) => zelle(`${spaltenName(k)}${r}`, c, z.stile?.[k] ?? z.stil ?? S.normal)).join('')
      return `<row r="${r}"${z.hoehe ? ` ht="${z.hoehe}" customHeight="1"` : ''}>${zellen}</row>`
    })
    .join('')
}

/** Excel nimmt Kopf- und Fußzeilen bis 255 Zeichen — gezählt wird der Text MIT Steuercodes (`&L`, `&"Arial,Regular"`, `&&`). */
export const FUSSZEILE_MAX = 255

/**
 * Fußzeile nach Kap. 10.2; `&` ist in Kopf-/Fußzeilen ein Steuerzeichen und
 * wird verdoppelt. Links die gekürzte Fußzeile (`fussText`, dieselbe wie in
 * Word und PowerPoint), rechts Seitenzahl und Disclaimer. Vorher lief eine
 * lange Organisation mit langem Titel über 255 Zeichen und in den rechten
 * Teil hinein (Audit 11/2026, EXP-04). Jedes `&` im Text zählt doppelt —
 * darum wird der linke Teil gemessen, wie Excel ihn liest, und notfalls
 * weiter gekürzt.
 */
export function fusszeile(d: Datenstand): string {
  const t = (s: string) => s.replace(/&/g, '&&')
  const schrift = '&"Arial,Regular"&8'
  const rechts = `&R${schrift}Page &P of &N · ${t(L.disclaimer)}`
  let max = FUSS_MAX
  const links = () => `&L${schrift}${t(fussText(d, max))}`
  while (max > 1 && links().length + rechts.length > FUSSZEILE_MAX) max--
  return esc(links() + rechts)
}

interface Blatt {
  name: string
  breiten: number[]
  zeilen: Zeile[]
  /** Kopfzeile (ab 1) — fixiert, Filter, auf jeder Druckseite */
  kopf?: number
  /** verbundene Bereiche, z. B. „B4:E4" */
  verbunden?: string[]
  filter?: string
  extras?: string
  /** zugeklappte Spalten (Index ab 0) — als Gliederungsgruppe, nicht gelöscht */
  zugeklappt?: number[]
  /** schmale Seitenränder links/rechts (Excel-Vorgabe „Schmal", 0,25") — nur, wo die Breite die Schrift bestimmt */
  schmal?: boolean
}

/**
 * `<cols>` mit zugeklappten Spalten als Gliederung der Ebene 1: verborgen,
 * und die Spalte rechts daneben trägt `collapsed` — dort sitzt in Excel das
 * „+", das sie wieder aufklappt (summaryRight ist Vorgabe).
 */
function spaltenXml(b: Blatt): string {
  const zu = new Set(b.zugeklappt ?? [])
  return b.breiten
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}"${zu.has(i) ? ' hidden="1"' : ''} customWidth="1"${zu.has(i) ? ' outlineLevel="1"' : ''}${!zu.has(i) && zu.has(i - 1) ? ' collapsed="1"' : ''}/>`)
    .join('')
}

function blattXml(b: Blatt, d: Datenstand): string {
  const letzte = spaltenName(Math.max(1, b.breiten.length) - 1)
  const n = Math.max(1, b.zeilen.length)
  const pane = b.kopf ? `<pane ySplit="${b.kopf}" topLeftCell="A${b.kopf + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${b.kopf + 1}" sqref="A${b.kopf + 1}"/>` : ''
  // Reihenfolge nach CT_Worksheet — eine falsche Reihenfolge ist für Excel eine kaputte Datei
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:${letzte}${n}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${b.name === L.sheets.summary ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="13.2"${b.zugeklappt?.length ? ' outlineLevelCol="1"' : ''}/>` +
    `<cols>${spaltenXml(b)}</cols>` +
    `<sheetData>${zeilenXml(b.zeilen)}</sheetData>` +
    (b.filter ? `<autoFilter ref="${b.filter}"/>` : '') +
    (b.verbunden?.length ? `<mergeCells count="${b.verbunden.length}">${b.verbunden.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>` : '') +
    (b.extras ?? '') +
    `<pageMargins left="${b.schmal ? 0.25 : 0.5}" right="${b.schmal ? 0.25 : 0.5}" top="0.6" bottom="0.7" header="0.3" footer="0.3"/>` +
    // Alle Blätter A4 quer (Kap. 10.4) — „Summary" druckte hochkant (Audit 11/2026, EXP-12)
    `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    // Fußzeile nicht mitskalieren: „an Breite angepasst" verkleinert „Findings" stark, und die Fußzeile
    // wurde mit ihr unlesbar — so steht sie auf jedem Blatt gleich in 8 pt (EXP-12)
    `<headerFooter scaleWithDoc="0"><oddFooter>${fusszeile(d)}</oddFooter></headerFooter>` +
    `</worksheet>`
  )
}

const liste = (werte: string[]) => `"${werte.join(',')}"`

/**
 * Spalten von „Findings", die nur die KI-Prüfung füllt (Phase 4): Bezug aufs
 * Regelwerk, Anforderung, Master-Zitat, Quelle, technische Einordnung. Die
 * regelbasierten Prüfungen lassen sie leer — auch ein Regelwerksbefund nennt
 * die Regel im Befundtext, nicht unter „Reference".
 */
export const KI_SPALTEN = ['Reference', 'Reference Type', 'Requirement (Summary)', 'Master Quote (verbatim)', 'Source (Library/Session)', 'Technical Type'] as const

/**
 * KI-Spalten, die „Findings" zugeklappt zeigt: nur ohne KI-Prüfung und nur,
 * wenn die Spalte in JEDER Zeile leer ist (Index ab 0).
 *
 * Spez. 10.4 verlangt 24 feste Spalten und Druck „an Breite angepasst" —
 * zusammen ergab das auf A4 quer rund 30 % der Schriftgröße, unlesbar (Audit
 * 11/2026, EXP-12; Entscheidung des Nutzers vom 03.11.2026: „ohne leere
 * KI-Spalten"). Ausgelegt so, dass die Datei die Spalten der Spezifikation
 * behält: Sie bleiben in Reihenfolge und Kopf erhalten, zugeklappt als
 * Gliederung, ein Klick auf „+" öffnet sie; Excel druckt verborgene Spalten
 * nicht. Mit KI-Prüfung bleiben sie offen — eine leere Referenz ist dann
 * eine Aussage —, ebenso eine Spalte, in der irgendetwas steht.
 */
export function ausgeblendeteSpalten(d: Pick<Datenstand, 'modelle' | 'befunde'>): number[] {
  if (d.modelle) return []
  return KI_SPALTEN.map((titel) => L.columns.indexOf(titel)).filter((i) => d.befunde.every((b) => !b.spalten[i]?.trim()))
}

/** Blatt „Findings": eine Zeile je Befund, Spalten fest (Kap. 10.4). */
function findings(d: Datenstand): Blatt {
  const n = d.befunde.length
  const bis = Math.max(3, n + 2)
  const col = (titel: string) => spaltenName(L.columns.indexOf(titel))
  const bereich = (titel: string) => `${col(titel)}3:${col(titel)}${bis}`
  const dv = (titel: string, werte: string[]) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${bereich(titel)}"><formula1>${esc(liste(werte))}</formula1></dataValidation>`
  const prio = col('Priority')
  // Ganze Zeile nach Priorität einfärben (Kap. 10.3); Regeln mit relativem Zeilenbezug ab Zeile 3
  const cf = L.priorities
    .map((p, i) => `<cfRule type="expression" dxfId="${i}" priority="${i + 1}"><formula>$${prio}3="${p}"</formula></cfRule>`)
    .join('')
  return {
    name: L.sheets.findings,
    // Für den Druck auf eine Seitenbreite bemessen (EXP-12): Jedes Zeichen Breite kostet Schriftgröße,
    // lange Texte brechen um. Untergrenzen: Kopfwörter fett ohne Trennung („Responsible", „Other
    // Affected"), ein Datum ohne „####" unter „Due Date". Die KI-Spalten (I–M, O) bleiben, wie sie waren.
    breiten: [10, 13, 10, 10, 13, 8, 10, 22, 16, 12, 30, 30, 16, 12, 14, 8, 26, 26, 14, 11, 10, 12, 10, 9],
    schmal: true,
    kopf: 2,
    filter: `A2:${spaltenName(L.columns.length - 1)}${Math.max(2, n + 2)}`,
    zugeklappt: ausgeblendeteSpalten(d),
    zeilen: [
      { zellen: [L.disclaimer], stil: S.hinweis },
      { zellen: L.columns, stil: S.kopf, hoehe: 30 },
      ...d.befunde.map((b) => ({ zellen: b.spalten as Zelle[], stil: S.text })),
    ],
    extras:
      `<conditionalFormatting sqref="A3:${spaltenName(L.columns.length - 1)}${bis}">${cf}</conditionalFormatting>` +
      `<dataValidations count="5">${dv('Category', L.categories)}${dv('Priority', L.priorities)}${dv('Verification', L.verifications)}${dv('Revision Status', L.revisionStatuses)}${dv('Status', L.statuses)}</dataValidations>`,
  }
}

/** Blatt „Summary": Kennung, Zählung als Formeln, Formalprüfung, Gesamtbewertung, Top 5. */
function summary(d: Datenstand): { blatt: Blatt; gesamtZeile: number } {
  const z: Zeile[] = [{ zellen: [L.disclaimer], stil: S.hinweis }, { zellen: [`${L.product} – ${L.sheets.summary}`], stil: S.titel, hoehe: 22 }]
  // Werte des Kennungsblocks über B:E — in Spalte B allein brächen sie Wort für Wort um;
  // mehrzeilige („Checks performed") mit Höhe, weil Excel verbundene Zellen nicht anpasst (EXP-11)
  const breiten = [30, 22, 26, 14, 60]
  const verbunden: string[] = []
  for (const [k, v] of kennung(d)) {
    z.push({ zellen: [k, v, null, null, null], stile: [S.schluessel, S.text, S.text, S.text, S.text], hoehe: zeilenHoehe(v, gesamtBreite(breiten.slice(1))) })
    verbunden.push(`B${z.length}:E${z.length}`)
  }
  const gesamtZeile = z.findIndex((x) => x.zellen[0] === L.ident.overall) + 1
  z.push({ zellen: [L.overallBasis], stil: S.hinweis })
  verbunden.push(`A${z.length}:E${z.length}`)
  z.push({ zellen: [] })

  // Category × Priority als COUNTIFS auf „Findings" (Kap. 10.4)
  const kat = spaltenName(L.columns.indexOf('Category'))
  const pri = spaltenName(L.columns.indexOf('Priority'))
  const ver = spaltenName(L.columns.indexOf('Verification'))
  const F = `'${L.sheets.findings}'`
  z.push({ zellen: [L.summary.byCategory], stil: S.schluessel })
  z.push({ zellen: ['Category', ...L.priorities, L.summary.total], stil: S.kopf })
  const kopfZeile = z.length
  for (const k of L.categories) {
    const r = z.length + 1
    const werte = L.priorities.map((p) => d.zaehlung[k as keyof Datenstand['zaehlung']][p as 'High'])
    z.push({
      zellen: [k, ...L.priorities.map((p, i) => ({ f: `COUNTIFS(${F}!$${kat}:$${kat},"${k}",${F}!$${pri}:$${pri},"${p}")`, v: werte[i] })), { f: `SUM(B${r}:D${r})`, v: werte.reduce((a, b) => a + b, 0) }],
      stile: [S.text, S.zahl, S.zahl, S.zahl, S.zahlFett],
    })
  }
  const von = kopfZeile + 1
  const bisZ = z.length
  const summe = (sp: string, v: number) => ({ f: `SUM(${sp}${von}:${sp}${bisZ})`, v })
  const proPrio = L.priorities.map((p) => d.befunde.filter((b) => b.prioritaet === p).length)
  z.push({ zellen: [L.summary.total, summe('B', proPrio[0]), summe('C', proPrio[1]), summe('D', proPrio[2]), summe('E', d.befunde.length)], stile: [S.schluessel, S.zahlFett, S.zahlFett, S.zahlFett, S.zahlFett] })
  z.push({ zellen: [L.summary.toVerify, { f: `COUNTIF(${F}!$${ver}:$${ver},"To verify*")`, v: d.zuPruefen }], stile: [S.schluessel, S.zahlFett] })
  z.push({ zellen: [] })

  // Formalprüfung als Ampel je Prüfpunkt
  z.push({ zellen: [L.summary.formal], stil: S.schluessel })
  z.push({ zellen: ['Document', 'Group', 'Checkpoint', 'Status'], stil: S.kopf })
  const ampelVon = z.length + 1
  for (const a of d.ampeln) z.push({ zellen: [a.dokument, a.gruppe, a.punkt, L.ampel[a.ampel]], stil: S.text })
  const ampelBis = Math.max(ampelVon, z.length)
  z.push({ zellen: [] })

  // Top 5
  z.push({ zellen: [L.summary.top5], stil: S.schluessel })
  z.push({ zellen: ['ID', 'Document', 'Page', 'Priority', 'Finding'], stil: S.kopf })
  const nachId = new Map(d.befunde.map((b) => [b.id, b]))
  if (!d.top5.length) z.push({ zellen: [L.summary.noFindings], stil: S.text })
  for (const id of d.top5) {
    const b = nachId.get(id)!
    z.push({ zellen: [b.id, b.spalten[1], b.spalten[5], b.prioritaet, b.spalten[16]], stil: S.text })
  }

  const ampelCf = (['ok', 'wait', 'bad'] as const)
    .map((a, i) => `<cfRule type="cellIs" dxfId="${3 + i}" priority="${i + 1}" operator="equal"><formula>"${L.ampel[a]}"</formula></cfRule>`)
    .join('')
  // Auch „nicht bewertbar" steht zur Wahl: Der Vorschlag muss im Dropdown vorkommen (DC-03)
  const overall = [L.overall.ready, L.overall.afterCorrection, L.overall.notReady, L.overall.notAssessable]
  return {
    gesamtZeile,
    blatt: {
      name: L.sheets.summary,
      breiten,
      zeilen: z,
      verbunden,
      extras:
        (d.ampeln.length ? `<conditionalFormatting sqref="D${ampelVon}:D${ampelBis}">${ampelCf}</conditionalFormatting>` : '') +
        `<dataValidations count="1"><dataValidation type="list" allowBlank="0" showErrorMessage="1" sqref="B${gesamtZeile}"><formula1>${esc(liste(overall))}</formula1></dataValidation></dataValidations>`,
    },
  }
}

function matrix(d: Datenstand): Blatt {
  void d
  return {
    name: L.sheets.matrix,
    breiten: [50, 14, 24, 16, 18],
    kopf: 2,
    zeilen: [{ zellen: [L.disclaimer], stil: S.hinweis }, { zellen: L.matrix.columns, stil: S.kopf, hoehe: 30 }, { zellen: [L.matrix.notGenerated], stil: S.text }],
  }
}

/**
 * Blatt „Documents & Sources": eine Zeile je Dokument, darunter Bibliotheksstand,
 * Methode und Quellenhierarchie. Diese Erläuterungen laufen über B:I — in
 * Spalte B (14 Zeichen) allein brachen sie Wort für Wort um, über dreizehn
 * Zeilen, und rechts daneben blieb alles leer (Audit 11/2026, EXP-11). B..I
 * tragen denselben Stil, damit der Rahmen durchgeht.
 */
function quellen(d: Datenstand): Blatt {
  const art = (r: string) => (r === 'review' ? L.sourceKinds.review : r === 'master' ? L.sourceKinds.library : L.sourceKinds.session)
  const breiten = [26, 14, 40, 16, 14, 12, 8, 8, 16]
  const erlaeuterung = (k: string, v: string): Zeile => ({ zellen: [k, v, ...Array<null>(7).fill(null)], stile: [S.schluessel, ...Array<number>(8).fill(S.text)], hoehe: zeilenHoehe(v, gesamtBreite(breiten.slice(1))) })
  const erlaeuterungen = [
    erlaeuterung(L.ident.library, d.bibliothek),
    erlaeuterung(L.sources.method, L.sources.methodText),
    erlaeuterung(L.sources.hierarchy, L.sources.hierarchyText),
  ]
  // Disclaimer, Kopf, Dokumente, Leerzeile — dann die Erläuterungen
  const ab = 2 + d.dokumente.length + 2
  return {
    name: L.sheets.sources,
    breiten,
    kopf: 2,
    filter: `A2:I${Math.max(2, d.dokumente.length + 2)}`,
    zeilen: [
      { zellen: [L.disclaimer], stil: S.hinweis },
      { zellen: L.sources.columns, stil: S.kopf, hoehe: 30 },
      ...d.dokumente.map((x) => ({
        zellen: [art(x.rolle), x.typ, x.titel || x.name, x.nummer, x.revision, x.datum, x.rang, x.seiten, x.sha256.slice(0, 12)] as Zelle[],
        stile: [S.text, S.text, S.text, S.text, S.text, S.text, S.text, S.zahl, S.text],
      })),
      { zellen: [] },
      ...erlaeuterungen,
    ],
    verbunden: erlaeuterungen.map((_, i) => `B${ab + i}:I${ab + i}`),
  }
}

export const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="5"><font><sz val="10"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font><font><i/><sz val="9"/><color rgb="FF475467"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="14"/><color rgb="FF${AKZENT}"/><name val="Arial"/><family val="2"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${AKZENT}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="8">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  // dxf 0–2: High/Medium/Low (Kap. 10.3), 3–5: Ampel grün/gelb/rot
  `<dxfs count="6">` +
  `<dxf><font><color rgb="FFB42318"/></font><fill><patternFill><bgColor rgb="FFFDECEC"/></patternFill></fill></dxf>` +
  `<dxf><font><color rgb="FF9C5700"/></font><fill><patternFill><bgColor rgb="FFFFF4D6"/></patternFill></fill></dxf>` +
  `<dxf><font><color rgb="FF${AKZENT}"/></font><fill><patternFill><bgColor rgb="FFE8EFFA"/></patternFill></fill></dxf>` +
  `<dxf><font><color rgb="FF067647"/></font><fill><patternFill><bgColor rgb="FFDCFAE6"/></patternFill></fill></dxf>` +
  `<dxf><font><color rgb="FF9C5700"/></font><fill><patternFill><bgColor rgb="FFFFF4D6"/></patternFill></fill></dxf>` +
  `<dxf><font><color rgb="FFB42318"/></font><fill><patternFill><bgColor rgb="FFFDECEC"/></patternFill></fill></dxf>` +
  `</dxfs></styleSheet>`

export async function xlsxExport(d: Datenstand): Promise<Uint8Array> {
  const s = summary(d)
  const blaetter = [s.blatt, findings(d), matrix(d), quellen(d)]
  const zip = new JSZip()
  // Feste Zeitstempel: Gleicher Datenstand → gleiche Datei (Layout-Tests, Kap. 10.8).
  // Ohne createFolders:false legt JSZip Ordnereinträge mit der AKTUELLEN Zeit an —
  // der Test fiel nur auf, wenn zwei Läufe in verschiedene Sekunden fielen
  const date = new Date(`${d.datum}T00:00:00Z`)
  const f = (p: string, inhalt: string) => zip.file(p, inhalt, { date, createFolders: false })
  f(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${blaetter.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  )
  f('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
  f('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(`${L.product} ${d.exportId}`)}</dc:title><dc:creator>DocCheck</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${d.datum}T00:00:00Z</dcterms:created></cp:coreProperties>`)
  f('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>DocCheck</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${blaetter.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${blaetter.length}" baseType="lpstr">${blaetter.map((b) => `<vt:lpstr>${esc(b.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`)
  // Druck: Kopfzeile(n) auf jeder Seite; Filterbereiche als definierte Namen
  const namen = blaetter.flatMap((b, i) => [
    ...(b.kopf ? [`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(b.name)}'!$1:$${b.kopf}</definedName>`] : []),
    ...(b.filter ? [`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(b.name)}'!${b.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>`] : []),
  ])
  f(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${blaetter.map((b, i) => `<sheet name="${esc(b.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${namen.join('')}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
  )
  f(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${blaetter.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${blaetter.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  )
  f('xl/styles.xml', STYLES)
  blaetter.forEach((b, i) => f(`xl/worksheets/sheet${i + 1}.xml`, blattXml(b, d)))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
