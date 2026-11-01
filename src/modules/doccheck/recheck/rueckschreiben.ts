import JSZip from 'jszip'
import { teilLesen, zipOeffnen } from '../parse/zip'
import { vergleichsform } from '../parse/seitenzuordnung'
import { blattRaster, geteilteTexte, spalte } from '../parse/xlsx'
import { entitaeten, xmlEreignisse } from '../parse/xml'
import type { ReStatus } from './pruefen'

/**
 * Rückschreiben in die Originaldatei einer Fremdliste (Nachtrag N3.5).
 *
 * Gepatcht wird auf XML-Ebene, weil gängige Bibliotheken beim Lesen und
 * Schreiben Teile verlieren — Dropdowns im Erweiterungsbereich
 * `x14:dataValidations`, Diagramme, Web-Erweiterungen. Darum: nur die
 * Teile anfassen, die sich ändern müssen (Blatt, Formatvorlagen,
 * Arbeitsmappe, Beziehungen, Inhaltstypen); alles andere geht unverändert
 * durch. Kein XML wird neu serialisiert — Zeichenketten werden gezielt
 * ersetzt, damit auch Namensräume, Reihenfolge und Erweiterungen bleiben.
 *
 * Die Originaldatei wird nie überschrieben: Ausgabe ist eine neue Datei.
 */

/* ------------------------------- Zellen -------------------------------- */

export function spaltenName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const esc = (s: string) =>
  s
    // In XML 1.0 verbotene Steuerzeichen — eine einzige reicht für den Reparaturdialog.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** Zelle mit Inline-String (N3.5: neue Zellen als Inline-Strings, sharedStrings bleibt unberührt). */
export function inlineZelle(ref: string, text: string, stil?: number): string {
  return `<c r="${ref}"${stil !== undefined ? ` s="${stil}"` : ''} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`
}

const ZELLE = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

/** Stilindex einer Zelle (s-Attribut), sonst undefined. */
export function zellStil(zelle: string): number | undefined {
  const s = attr(zelle.slice(0, zelle.indexOf('>') + 1), 's')
  return s === undefined ? undefined : Number(s)
}

/**
 * Zelle in einer Zeile setzen oder einfügen — in Spaltenreihenfolge, wie
 * Excel sie verlangt. Unberührte Zellen bleiben Zeichen für Zeichen.
 * `spans` ist ein optionaler Hinweis und fällt weg, statt falsch zu werden.
 */
export function zelleSetzen(zeile: string, zelle: string): string {
  const ref = attr(zelle, 'r')!
  const ziel = spalte(ref)
  const offen = zeile.match(/^<row\b[^>]*?(\/?)>/)!
  const kopf = offen[0].replace(/\/>$/, '>').replace(/\sspans="[^"]*"/, '')
  const inhalt = offen[1] ? '' : zeile.slice(offen[0].length, zeile.lastIndexOf('</row>'))
  const zellen = [...inhalt.matchAll(ZELLE)].map((m) => m[0])
  const rest = inhalt.replace(ZELLE, '')
  const ohne = zellen.filter((c) => spalte(attr(c, 'r') ?? 'A') !== ziel)
  const i = ohne.findIndex((c) => spalte(attr(c, 'r') ?? 'A') > ziel)
  if (i < 0) ohne.push(zelle)
  else ohne.splice(i, 0, zelle)
  return `${kopf}${ohne.join('')}${rest}</row>`
}

/** Zeile `nr` (ab 1) bearbeiten; fehlt sie, wird sie an der richtigen Stelle angelegt. */
export function zeileBearbeiten(blatt: string, nr: number, f: (zeile: string) => string): string {
  const re = new RegExp(`<row\\b[^>]*\\sr="${nr}"[^>]*?(?:/>|>[\\s\\S]*?</row>)`)
  const m = blatt.match(re)
  if (m) return blatt.replace(re, () => f(m[0]))
  const neu = f(`<row r="${nr}"/>`)
  const sd = blatt.match(/<sheetData\s*\/>/)
  if (sd) return blatt.replace(sd[0], `<sheetData>${neu}</sheetData>`)
  const nach = [...blatt.matchAll(/<row\b[^>]*\sr="(\d+)"/g)].find((x) => Number(x[1]) > nr)
  if (nach) return blatt.slice(0, nach.index) + neu + blatt.slice(nach.index)
  return blatt.replace('</sheetData>', `${neu}</sheetData>`)
}

/** Zelle `ref` lesen (Rohtext des Elements) oder null. */
export function zelleLesen(blatt: string, ref: string): string | null {
  return blatt.match(new RegExp(`<c\\b[^>]*\\sr="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`))?.[0] ?? null
}

/* ----------------------------- Blattrahmen ----------------------------- */

/** `<dimension>` auf die neue letzte Spalte erweitern. */
export function dimensionErweitern(blatt: string, letzteSpalte: number): string {
  return blatt.replace(/<dimension ref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"\s*\/>/, (alt, a, z1, b, z2) => {
    const bis = b ?? a
    if (spalte(bis) >= letzteSpalte) return alt
    return `<dimension ref="${a}${z1}:${spaltenName(letzteSpalte)}${z2 ?? z1}"/>`
  })
}

/**
 * Spaltenbreite setzen (Nachtrag: Remark-Spalte ca. 95). Deckt ein
 * vorhandener `<col>`-Bereich die Spalte ab, wird er geteilt — sonst
 * gälte die neue Breite für alle Spalten des Bereichs.
 */
export function spaltenBreite(blatt: string, index: number, breite: number): string {
  const n = index + 1
  const neu = `<col min="${n}" max="${n}" width="${breite}" customWidth="1"/>`
  const cols = blatt.match(/<cols>([\s\S]*?)<\/cols>/)
  if (!cols) {
    // <cols> steht vor <sheetData> (nach sheetFormatPr/sheetViews).
    return blatt.replace(/<sheetData\b/, `<cols>${neu}</cols><sheetData`)
  }
  const teile: { min: number; max: number; xml: string }[] = []
  for (const m of cols[1].matchAll(/<col\b[^>]*?\/>/g)) {
    const min = Number(attr(m[0], 'min'))
    const max = Number(attr(m[0], 'max'))
    if (n < min || n > max) teile.push({ min, max, xml: m[0] })
    else {
      const mit = (a: number, b: number) => m[0].replace(/\smin="\d+"/, ` min="${a}"`).replace(/\smax="\d+"/, ` max="${b}"`)
      if (min < n) teile.push({ min, max: n - 1, xml: mit(min, n - 1) })
      if (max > n) teile.push({ min: n + 1, max, xml: mit(n + 1, max) })
    }
  }
  teile.push({ min: n, max: n, xml: neu })
  teile.sort((a, b) => a.min - b.min)
  return blatt.replace(cols[0], `<cols>${teile.map((t) => t.xml).join('')}</cols>`)
}

/* --------------------------- Formatvorlagen ---------------------------- */

/**
 * Neue Zellformatierung als Kopie einer vorhandenen, mit Zeilenumbruch und
 * oben ausgerichtet. Angehängt an `cellXfs` — vorhandene Indizes bleiben
 * unverändert (N3.5), denn jede Zelle der Datei verweist über sie.
 */
export function stilMitUmbruch(styles: string, basis: number | undefined): { styles: string; index: number } {
  const m = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (!m) throw new Error('DC-XLSX-STYLES')
  const xfs = [...m[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((x) => x[0])
  const vorlage = xfs[basis ?? 0] ?? xfs[0] ?? '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  const auf = vorlage.match(/^<xf\b[^>]*?(?=\/?>)/)![0].replace(/\sapplyAlignment="[^"]*"/, '')
  const innen = vorlage.endsWith('/>') ? '' : vorlage.slice(vorlage.indexOf('>') + 1, vorlage.lastIndexOf('</xf>')).replace(/<alignment\b[^>]*?(?:\/>|>[\s\S]*?<\/alignment>)/, '')
  const neu = `${auf} applyAlignment="1"><alignment vertical="top" wrapText="1"/>${innen}</xf>`
  const index = xfs.length
  const block = m[0].replace(/<cellXfs\b[^>]*>/, `<cellXfs count="${index + 1}">`).replace('</cellXfs>', `${neu}</cellXfs>`)
  return { styles: styles.replace(m[0], block), index }
}

/* ----------------------------- Berechnung ------------------------------ */

/**
 * calcChain entfernen und Neuberechnung beim Öffnen erzwingen (N3.5). Eine
 * calcChain, die nicht mehr zur Datei passt, ist eine der häufigsten
 * Ursachen für Excels Reparaturdialog.
 */
export function neuBerechnen(workbook: string, rels: string, typen: string): { workbook: string; rels: string; typen: string } {
  const calc = workbook.match(/<calcPr\b[^>]*?\/>/)
  let wb: string
  if (calc) wb = workbook.replace(calc[0], calc[0].replace(/\sfullCalcOnLoad="[^"]*"/, '').replace(/\s*\/>$/, ' fullCalcOnLoad="1"/>'))
  else {
    // calcPr steht nach definedNames und vor allem, was in CT_Workbook folgt.
    const nach = workbook.match(/<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b/)
    wb = nach ? workbook.replace(nach[0], `<calcPr fullCalcOnLoad="1"/>${nach[0]}`) : workbook.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>')
  }
  return {
    workbook: wb,
    rels: rels.replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g, ''),
    typen: typen.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ''),
  }
}

/* ------------------------------ Arbeitsmappe ---------------------------- */

interface Mappe {
  zip: JSZip
  blaetter: { name: string; pfad: string }[]
  geteilt: string[]
}

async function mappeLesen(daten: Uint8Array): Promise<Mappe> {
  const zip = await zipOeffnen(daten)
  const lies = async (p: string) => (await teilLesen(zip, p)) ?? ''
  const wb = await lies('xl/workbook.xml')
  if (!wb) throw new Error('DC-XLSX-INVALID')
  const ziele = new Map<string, string>()
  for (const e of xmlEreignisse(await lies('xl/_rels/workbook.xml.rels'))) if (e.typ === 'auf' && e.name === 'Relationship') ziele.set(e.attr.Id, e.attr.Target)
  const blaetter: Mappe['blaetter'] = []
  for (const e of xmlEreignisse(wb)) {
    if (e.typ !== 'auf' || e.name !== 'sheet') continue
    const z = ziele.get(e.attr['r:id'] ?? '') ?? ''
    blaetter.push({ name: e.attr.name ?? '', pfad: z.startsWith('/') ? z.slice(1) : `xl/${z}` })
  }
  return { zip, blaetter, geteilt: geteilteTexte(await lies('xl/sharedStrings.xml')) }
}

/** Werte eines Bereichs wie `Lists!$A$2:$A$4` oder `"Open,Closed"`. */
async function bereichWerte(m: Mappe, formel: string, eigenesBlatt: string): Promise<string[]> {
  const f = formel.trim()
  if (/^".*"$/.test(f)) return f.slice(1, -1).split(',').map((w) => w.trim()).filter(Boolean)
  const b = f.match(/^(?:'?([^'!]+)'?!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/)
  if (!b) return []
  const blatt = m.blaetter.find((x) => x.name === (b[1] ?? eigenesBlatt))
  if (!blatt) return []
  const nr: number[] = []
  const raster = blattRaster((await teilLesen(m.zip, blatt.pfad)) ?? '', m.geteilt, nr)
  const [s1, s2] = [spalte(b[2]), spalte(b[4] ?? b[2])]
  const [z1, z2] = [Number(b[3]), Number(b[5] ?? b[3])]
  const out: string[] = []
  raster.forEach((zeile, i) => {
    if (nr[i] < z1 || nr[i] > z2) return
    for (let s = s1; s <= s2; s++) if (zeile[s]?.trim()) out.push(zeile[s].trim())
  })
  return out
}

const imBereich = (sqref: string, sp: number, zeile: number) =>
  sqref.split(/\s+/).some((r) => {
    const m = r.match(/^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/)
    if (!m) return false
    return sp >= spalte(m[1]) && sp <= spalte(m[3] ?? m[1]) && zeile >= Number(m[2]) && zeile <= Number(m[4] ?? m[2])
  })

/**
 * Werteliste der Status-Spalte — aus der Datenüberprüfung der Zelle
 * (klassisch oder im x14-Erweiterungsbereich), sonst aus den Werten, die in
 * der Spalte schon stehen. So schreibt DocCheck nur, was das Dropdown kennt.
 */
export async function listenWerte(daten: Uint8Array, blattName: string, sp: number, zeile: number, vorhandene: string[]): Promise<string[]> {
  const m = await mappeLesen(daten)
  const blatt = m.blaetter.find((b) => b.name === blattName)
  const xml = blatt ? ((await teilLesen(m.zip, blatt.pfad)) ?? '') : ''
  const pruefungen = [
    ...[...xml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)].map((d) => ({ typ: attr(d[1], 'type'), sqref: attr(d[1], 'sqref') ?? '', formel: d[2].match(/<formula1>([\s\S]*?)<\/formula1>/)?.[1] ?? '' })),
    ...[...xml.matchAll(/<x14:dataValidation\b([^>]*)>([\s\S]*?)<\/x14:dataValidation>/g)].map((d) => ({ typ: attr(d[1], 'type'), sqref: d[2].match(/<xm:sqref>([\s\S]*?)<\/xm:sqref>/)?.[1] ?? '', formel: d[2].match(/<xm:f>([\s\S]*?)<\/xm:f>/)?.[1] ?? '' })),
  ]
  const p = pruefungen.find((x) => x.typ === 'list' && imBereich(x.sqref, sp, zeile))
  const werte = p ? await bereichWerte(m, p.formel.replace(/&quot;/g, '"'), blattName) : []
  return werte.length ? [...new Set(werte)] : [...new Set(vorhandene.map((w) => w.trim()).filter(Boolean))]
}

/** Statuszuordnung DocCheck → Werteliste der Fremdliste; null = Zelle bleibt, wie sie ist. */
export type WerteZuordnung = Record<ReStatus, string | null>

const SYN: Record<ReStatus, string[]> = {
  resolved: ['closed', 'completed', 'complete', 'resolved', 'done', 'erledigt', 'geschlossen', 'behoben', 'abgeschlossen'],
  partial: ['partiallyresolved', 'partially', 'partial', 'inreview', 'inprogress', 'teilweise', 'inbearbeitung', 'open', 'offen'],
  open: ['open', 'offen', 'notresolved', 'nichtbehoben', 'inreview'],
  justify: ['justificationrequired', 'justification', 'begruendungerforderlich', 'begründungerforderlich', 'open', 'offen'],
  unverifiable: [],
}

export function werteVorschlagen(werte: string[]): WerteZuordnung {
  const f = werte.map((w) => ({ w, v: vergleichsform(w) }))
  const finde = (s: ReStatus) => {
    for (const syn of SYN[s]) {
      const t = f.find((x) => x.v === syn) ?? f.find((x) => x.v.startsWith(syn))
      if (t) return t.w
    }
    return null
  }
  return { resolved: finde('resolved'), partial: finde('partial'), open: finde('open'), justify: finde('justify'), unverifiable: null }
}

/* ----------------------------- Zählformeln ----------------------------- */

const COUNTIF = /^COUNTIF\(\s*(?:'?([^'!]+)'?!)?\$?([A-Z]+)\$?(\d+)?:\$?([A-Z]+)\$?(\d+)?\s*,\s*(.+?)\s*\)$/i

/**
 * Zwischengespeicherte Ergebnisse von COUNTIF-Formeln, die auf das
 * geänderte Blatt zeigen, neu setzen — damit auch Programme ohne
 * Neuberechnung (Vorschau, Viewer) die neuen Zahlen zeigen. Was sich nicht
 * sicher auswerten lässt (Platzhalter, Vergleiche, geteilte Formeln),
 * bleibt stehen; die erzwungene Neuberechnung beim Öffnen holt es nach.
 */
export function zaehlformelnAktualisieren(blatt: string, blattName: string, geaendert: { name: string; raster: string[][]; nr: number[] }, geteilt: string[]): string {
  const eigen = { nr: [] as number[], raster: [] as string[][] }
  eigen.raster = blattRaster(blatt, geteilt, eigen.nr)
  const wertIn = (q: { raster: string[][]; nr: number[] }, sp: number, z: number) => q.raster[q.nr.indexOf(z)]?.[sp] ?? ''
  return blatt.replace(/<c\b([^>]*)>(\s*<f>([^<]+)<\/f>\s*)(?:<v>[^<]*<\/v>)?\s*<\/c>/g, (alt, a: string, fTeil: string, formel: string) => {
    const m = entitaeten(formel).match(COUNTIF)
    if (!m) return alt
    const ziel = m[1] ?? blattName
    if (ziel !== geaendert.name) return alt
    let krit = m[6]
    const ref = krit.match(/^\$?([A-Z]+)\$?(\d+)$/)
    if (ref) krit = wertIn(eigen, spalte(ref[1]), Number(ref[2]))
    else if (/^".*"$/.test(krit)) krit = krit.slice(1, -1)
    else if (!/^-?\d+(\.\d+)?$/.test(krit)) return alt
    if (/[*?~<>=]/.test(krit)) return alt
    const sp = spalte(m[2])
    if (spalte(m[4]) !== sp) return alt
    const [von, bis] = [m[3] ? Number(m[3]) : 1, m[5] ? Number(m[5]) : Infinity]
    const k = krit.trim().toLowerCase()
    const n = geaendert.raster.filter((z, i) => geaendert.nr[i] >= von && geaendert.nr[i] <= bis && (z[sp] ?? '').trim().toLowerCase() === k).length
    // t="str" o. ä. entfernen: das Ergebnis ist eine Zahl.
    return `<c${a.replace(/\st="[^"]*"/, '')}>${fTeil}<v>${n}</v></c>`
  })
}

/* --------------------------- Blatt „New findings" ---------------------- */

/**
 * Neues Blatt für neue Befunde (Nachtrag N3.5): „im Stil der Liste" —
 * gleiche Kopfzellen, Spaltenbreiten, Zellformate, Dropdowns und bedingte
 * Formatierungen der Quelle, dazu Prioritätsfarben, fixierte Kopfzeile,
 * Autofilter, A4 quer. Die Kopfzeile steht in derselben Zeile wie in der
 * Quelle: Bedingte Formatierungen und Prüfungen tragen relative Bezüge, die
 * an dieser Zeile hängen — rückte sie nach oben, färbte jede Regel die
 * falsche Zeile.
 */
export interface NeuesBlatt {
  /** Blattname; ist er schon vergeben, hängt DocCheck „ (2)" usw. an */
  name: string
  /** Titel über der Kopfzeile, wenn die Kopfzeile nicht in Zeile 1 steht */
  titel: string
  /** Kopftitel der Spalten RECHTS der Quelle (Priorität, Kategorie …), in Reihenfolge */
  zusatzKopf: string[]
  /** je neuer Befund die Werte nach Spaltenindex (Quelle und Zusatzspalten durchgehend) */
  zeilen: Record<number, string>[]
  /** Spalte mit der Priorität und die geschriebenen Werte für Hoch/Mittel/Niedrig */
  prio?: { spalte: number; hoch: string; mittel: string; niedrig: string }
}

/** Bereich „A4:C20 G4:G20" auf neue Zeilen abbilden; Bereiche über der Datenzeile fallen weg. */
export function bereichUmlegen(sqref: string, ab: number, von: number, bis: number): string {
  return sqref
    .split(/\s+/)
    .map((r) => {
      const m = r.match(/^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/)
      if (!m) return /^[A-Z]+:[A-Z]+$/.test(r) ? r : ''
      if (Number(m[4] ?? m[2]) < ab) return ''
      return `${m[1]}${von}:${m[3] ?? m[1]}${bis}`
    })
    .filter(Boolean)
    .join(' ')
}

/** Bezug ohne Blattnamen („$A$2:$A$4") auf das Quellblatt festlegen — im neuen Blatt zeigte er sonst ins Leere. */
export function formelQualifizieren(f: string, quelle: string): string {
  if (/^".*"$/.test(f.trim()) || f.includes('!')) return f
  return /^\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?$/.test(f.trim()) ? `'${quelle.replace(/'/g, "''")}'!${f.trim()}` : f
}

/** Prioritätsfarben als neue `dxf`-Einträge — ANGEHÄNGT, vorhandene Indizes bleiben. */
export function prioDxfs(styles: string): { styles: string; hoch: number; mittel: number; niedrig: number } {
  const farben = ['FFFFC7CE', 'FFFFEB9C', 'FFC6EFCE'].map((c) => `<dxf><fill><patternFill><bgColor rgb="${c}"/></patternFill></fill></dxf>`)
  const m = styles.match(/<dxfs\b[^>]*?(?:\/>|>([\s\S]*?)<\/dxfs>)/)
  const vorhanden = m?.[1] ? [...m[1].matchAll(/<dxf\b[^>]*?(?:\/>|>[\s\S]*?<\/dxf>)/g)].length : 0
  const block = `<dxfs count="${vorhanden + 3}">${m?.[1] ?? ''}${farben.join('')}</dxfs>`
  let neu: string
  if (m) neu = styles.replace(m[0], block)
  else {
    // dxfs steht nach cellStyles und vor tableStyles/colors/extLst (CT_Stylesheet)
    const nach = styles.match(/<(tableStyles|colors|extLst)\b/)
    neu = nach ? styles.replace(nach[0], `${block}${nach[0]}`) : styles.replace('</styleSheet>', `${block}</styleSheet>`)
  }
  return { styles: neu, hoch: vorhanden, mittel: vorhanden + 1, niedrig: vorhanden + 2 }
}

export function eindeutigerName(name: string, vergeben: string[]): string {
  const klein = new Set(vergeben.map((v) => v.toLowerCase()))
  // Excel: höchstens 31 Zeichen, keine []:*?/\
  const basis = name.replace(/[[\]:*?/\\]/g, '').slice(0, 31)
  if (!klein.has(basis.toLowerCase())) return basis
  for (let i = 2; ; i++) {
    const n = `${basis.slice(0, 31 - ` (${i})`.length)} (${i})`
    if (!klein.has(n.toLowerCase())) return n
  }
}

/** Blatt-XML aus der Quelle bauen. `stil(basis)` liefert einen Stil mit Zeilenumbruch. */
export function blattBauen(quelle: string, quellName: string, kopfZeile: number, nb: NeuesBlatt, stil: (basis: number | undefined) => number, prioDxf?: { hoch: number; mittel: number; niedrig: number }): string {
  // xr:uid sind Kennungen je Element — kopiert wären sie doppelt vergeben
  const ohneUid = (s: string) => s.replace(/\sxr\d*:uid="[^"]*"/g, '')
  // Wurzel der Quelle samt Namensräumen (x14ac, mc …) — die kopierten Teile brauchen sie.
  // Ohne Hauptnamensraum wäre das Blatt für Excel kein Arbeitsblatt.
  const quellWurzel = ohneUid(quelle.match(/<worksheet\b[^>]*>/)?.[0] ?? '')
  const wurzel = /\sxmlns="/.test(quellWurzel) ? quellWurzel : '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
  // Breite aus den Zellbezügen, nicht aus dem Textraster: Ohne geteilte Texte
  // wären dort alle t="s"-Zellen leer, und die Liste schiene eine Spalte breit
  const quellBreite = Math.max(1, ...[...quelle.matchAll(/<c\b[^>]*\sr="([A-Z]+)\d+"/g)].map((m) => spalte(m[1]) + 1))
  const letzte = quellBreite - 1 + nb.zusatzKopf.length
  const von = kopfZeile + 1
  const bis = kopfZeile + Math.max(1, nb.zeilen.length)
  const L = spaltenName(letzte)

  // Kopf: Zellen der Quelle unverändert (gleicher Stil, gleicher Text), dann die Zusatzspalten
  const kopfQuelle = quelle.match(new RegExp(`<row\\b[^>]*\\sr="${kopfZeile}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`))
  const kopfZellen = [...(kopfQuelle?.[1] ?? '').matchAll(ZELLE)].map((c) => c[0])
  const letzteKopfStil = zellStil(kopfZellen.at(-1) ?? '')
  const kopf = `<row r="${kopfZeile}"${kopfQuelle?.[0].match(/\s(ht="[^"]*"\s+customHeight="[^"]*")/)?.[1] ? ` ${kopfQuelle[0].match(/\s(ht="[^"]*"\s+customHeight="[^"]*")/)![1]}` : ''}>${kopfZellen.join('')}${nb.zusatzKopf.map((t, i) => inlineZelle(`${spaltenName(quellBreite + i)}${kopfZeile}`, t, letzteKopfStil)).join('')}</row>`

  // Datenzeilen: Format der ersten Datenzeile der Quelle je Spalte, mit Umbruch
  const ersteDaten = quelle.match(new RegExp(`<row\\b[^>]*\\sr="${von}"[^>]*?(?:/>|>[\\s\\S]*?</row>)`))?.[0] ?? ''
  const basis = (sp: number) => zellStil(zelleLesen(ersteDaten, `${spaltenName(Math.min(sp, quellBreite - 1))}${von}`) ?? '')
  const zeilen = nb.zeilen.map((werte, i) => {
    const z = von + i
    // Jede Spalte bekommt ihre Zelle, auch leer — sonst fehlen dort Rahmen und Füllung der Liste
    const zellen = Array.from({ length: letzte + 1 }, (_, sp) => {
      const w = werte[sp] ?? ''
      const ref = `${spaltenName(sp)}${z}`
      return w === '' ? `<c r="${ref}" s="${stil(basis(sp))}"/>` : inlineZelle(ref, w, stil(basis(sp)))
    })
    return `<row r="${z}">${zellen.join('')}</row>`
  })
  const titel = kopfZeile > 1 ? `<row r="1">${inlineZelle('A1', nb.titel, zellStil(zelleLesen(quelle, 'A1') ?? ''))}</row>` : ''

  // Spaltenbreiten der Quelle, Zusatzspalten 16 breit
  const cols = quelle.match(/<cols>[\s\S]*?<\/cols>/)?.[0] ?? '<cols></cols>'
  const zusatzCols = nb.zusatzKopf.map((_, i) => `<col min="${quellBreite + i + 1}" max="${quellBreite + i + 1}" width="16" customWidth="1"/>`).join('')
  const colsNeu = cols.replace('</cols>', `${zusatzCols}</cols>`)

  // Bedingte Formatierungen der Quelle auf die neuen Zeilen; Prioritätsfarben dazu
  let prioritaet = Math.max(0, ...[...quelle.matchAll(/<cfRule\b[^>]*\spriority="(\d+)"/g)].map((m) => Number(m[1])))
  const cf: string[] = []
  for (const m of quelle.matchAll(/<conditionalFormatting\b([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g)) {
    const sq = bereichUmlegen(attr(m[1], 'sqref') ?? '', von, von, bis)
    if (sq) cf.push(`<conditionalFormatting sqref="${sq}">${m[2]}</conditionalFormatting>`)
  }
  if (nb.prio && prioDxf) {
    const p = spaltenName(nb.prio.spalte)
    const regel = (wert: string, dxf: number) => `<cfRule type="cellIs" dxfId="${dxf}" priority="${++prioritaet}" operator="equal"><formula>"${esc(wert).replace(/"/g, '""')}"</formula></cfRule>`
    cf.push(`<conditionalFormatting sqref="${p}${von}:${p}${bis}">${regel(nb.prio.hoch, prioDxf.hoch)}${regel(nb.prio.mittel, prioDxf.mittel)}${regel(nb.prio.niedrig, prioDxf.niedrig)}</conditionalFormatting>`)
  }

  // Dropdowns: klassisch und im x14-Erweiterungsbereich, Bezüge aufs Quellblatt festgelegt
  const dv = [...quelle.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)]
    .map((d) => {
      const sq = bereichUmlegen(attr(d[1], 'sqref') ?? '', von, von, bis)
      return sq ? `<dataValidation${ohneUid(d[1]).replace(/\ssqref="[^"]*"/, ` sqref="${sq}"`)}>${d[2].replace(/<formula1>([\s\S]*?)<\/formula1>/, (_, f: string) => `<formula1>${formelQualifizieren(f, quellName)}</formula1>`)}</dataValidation>` : ''
    })
    .filter(Boolean)
  const x14 = [...quelle.matchAll(/<x14:dataValidation\b([^>]*)>([\s\S]*?)<\/x14:dataValidation>/g)]
    .map((d) => {
      const sq = bereichUmlegen(d[2].match(/<xm:sqref>([\s\S]*?)<\/xm:sqref>/)?.[1] ?? '', von, von, bis)
      return sq ? `<x14:dataValidation${ohneUid(d[1])}>${d[2].replace(/<xm:f>([\s\S]*?)<\/xm:f>/, (_, f: string) => `<xm:f>${formelQualifizieren(f, quellName)}</xm:f>`).replace(/<xm:sqref>[\s\S]*?<\/xm:sqref>/, `<xm:sqref>${sq}</xm:sqref>`)}</x14:dataValidation>` : ''
    })
    .filter(Boolean)
  const ext = x14.length
    ? `<extLst><ext uri="{CCE6A557-97BC-4b89-ADB6-D9C93CAAB3DF}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:dataValidations count="${x14.length}" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">${x14.join('')}</x14:dataValidations></ext></extLst>`
    : ''

  const formatPr = quelle.match(/<sheetFormatPr\b[^>]*?\/>/)?.[0] ?? ''
  const raender = quelle.match(/<pageMargins\b[^>]*?\/>/)?.[0] ?? '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
  // Reihenfolge nach CT_Worksheet — eine falsche Reihenfolge ist für Excel eine kaputte Datei
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${wurzel}` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:${L}${bis}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${kopfZeile}" topLeftCell="A${von}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${von}" sqref="A${von}"/></sheetView></sheetViews>` +
    formatPr +
    colsNeu +
    `<sheetData>${titel}${kopf}${zeilen.join('')}</sheetData>` +
    `<autoFilter ref="A${kopfZeile}:${L}${bis}"/>` +
    cf.join('') +
    (dv.length ? `<dataValidations count="${dv.length}">${dv.join('')}</dataValidations>` : '') +
    raender +
    `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    ext +
    `</worksheet>`
  )
}

/** Blatt in Arbeitsmappe, Beziehungen und Inhaltstypen eintragen; Filterbereich als definierter Name. */
export function blattEintragen(
  teile: { workbook: string; rels: string; typen: string },
  name: string,
  pfad: string,
  filter: string,
): { workbook: string; rels: string; typen: string } {
  const ids = [...teile.rels.matchAll(/\sId="([^"]+)"/g)].map((m) => m[1])
  let k = ids.length + 1
  while (ids.includes(`rId${k}`)) k++
  const rid = `rId${k}`
  const sheetIds = [...teile.workbook.matchAll(/<sheet\b[^>]*\ssheetId="(\d+)"/g)].map((m) => Number(m[1]))
  const index = [...teile.workbook.matchAll(/<sheet\b/g)].length
  const xmlName = esc(name).replace(/"/g, '&quot;')
  let wb = teile.workbook.replace('</sheets>', `<sheet name="${xmlName}" sheetId="${Math.max(0, ...sheetIds) + 1}" r:id="${rid}"/></sheets>`)
  const dn = `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${esc(`'${name.replace(/'/g, "''")}'!${filter}`)}</definedName>`
  if (/<definedNames>/.test(wb)) wb = wb.replace('</definedNames>', `${dn}</definedNames>`)
  else {
    // definedNames steht nach sheets/functionGroups/externalReferences, vor calcPr und allem Weiteren
    const nach = wb.match(/<(calcPr|oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b/)
    wb = nach ? wb.replace(nach[0], `<definedNames>${dn}</definedNames>${nach[0]}`) : wb.replace('</workbook>', `<definedNames>${dn}</definedNames></workbook>`)
  }
  return {
    workbook: wb,
    rels: teile.rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${pfad.replace(/^xl\//, '')}"/></Relationships>`),
    typen: teile.typen.replace('</Types>', `<Override PartName="/${pfad}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
  }
}

/**
 * docProps/app.xml: Blattzahl und -namen nachziehen. Rein informativ —
 * aber Programme, die sie lesen, sollen das neue Blatt nicht übersehen.
 * Fehlt die erwartete Gestalt, bleibt die Datei unverändert.
 */
export function appEintragen(app: string, name: string): string {
  const paare = app.match(/<HeadingPairs>[\s\S]*?<\/HeadingPairs>/)?.[0]
  const titel = app.match(/<TitlesOfParts>\s*<vt:vector size="(\d+)"[^>]*>([\s\S]*?)<\/vt:vector>\s*<\/TitlesOfParts>/)
  if (!titel) return app
  const eintraege = [...titel[2].matchAll(/<vt:lpstr>[\s\S]*?<\/vt:lpstr>/g)].map((m) => m[0])
  let nach = eintraege.length
  let neuePaare = paare
  if (paare) {
    const gruppen = [...paare.matchAll(/<vt:lpstr>([^<]*)<\/vt:lpstr>\s*<\/vt:variant>\s*<vt:variant>\s*<vt:i4>(\d+)<\/vt:i4>/g)]
    let davor = 0
    const g = gruppen.find((x) => {
      if (/^(Worksheets|Arbeitsblätter|Tabellenblätter)$/i.test(x[1])) return true
      davor += Number(x[2])
      return false
    })
    if (!g) return app
    nach = davor + Number(g[2])
    neuePaare = paare.replace(g[0], g[0].replace(`<vt:i4>${g[2]}</vt:i4>`, `<vt:i4>${Number(g[2]) + 1}</vt:i4>`))
  }
  eintraege.splice(nach, 0, `<vt:lpstr>${esc(name)}</vt:lpstr>`)
  const vektor = titel[0].replace(`size="${titel[1]}"`, `size="${eintraege.length}"`).replace(titel[2], eintraege.join(''))
  return (paare && neuePaare ? app.replace(paare, neuePaare) : app).replace(titel[0], vektor)
}

/* ------------------------------ Auftrag -------------------------------- */

export interface RueckschreibAuftrag {
  blatt: string
  /** Excel-Zeile der Kopfzeile (ab 1) */
  kopfZeile: number
  /** Spalte des Team-Status (0-basiert); ohne → nur Remark */
  statusSpalte?: number
  remarkTitel: string
  /** Neue Befunde als eigenes Blatt (N3.1 Schritt 6) — ohne: kein neues Blatt */
  neu?: NeuesBlatt
  zeilen: { excelZeile: number; status: string | null; remark: string }[]
}

/** Dateiname der Ausgabe: Original nie überschreiben, Datum anhängen (N3.5). */
export function ausgabeName(datei: string, datum: string): string {
  const stamm = datei.replace(/\.xlsx$/i, '')
  return `${stamm}_recheck_${datum.slice(0, 10)}.xlsx`
}

/** Pfade, die das Rückschreiben ändern darf — alles andere bleibt byte-gleich. */
export const GEAENDERTE_TEILE = ['[Content_Types].xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/calcChain.xml']

export async function rueckschreiben(daten: Uint8Array, a: RueckschreibAuftrag): Promise<{ daten: Uint8Array; geaendert: string[] }> {
  const m = await mappeLesen(daten)
  const blatt = m.blaetter.find((b) => b.name === a.blatt)
  if (!blatt) throw new Error('DC-XLSX-SHEET')
  const lies = async (p: string) => (await teilLesen(m.zip, p)) ?? ''
  let xml = await lies(blatt.pfad)
  // Quelle VOR dem Remark: Das Blatt „New findings" bekommt die Spalten der Liste, nicht die Remark-Spalte
  const quelleXml = xml
  let styles = await lies('xl/styles.xml')
  const geaendert = new Set<string>([blatt.pfad])

  // Neue Spalte rechts neben der letzten benutzten Spalte (auch der Kopfzeile).
  const nr: number[] = []
  const raster = blattRaster(xml, m.geteilt, nr)
  const letzte = Math.max(0, ...raster.map((z) => z.length - 1))
  const neu = letzte + 1
  const ref = (z: number) => `${spaltenName(neu)}${z}`

  // Kopf im Stil der vorhandenen Kopfzeile: Formatierung der letzten Kopfzelle.
  const kopfStil = zellStil(zelleLesen(xml, `${spaltenName(letzte)}${a.kopfZeile}`) ?? '')
  xml = zeileBearbeiten(xml, a.kopfZeile, (z) => zelleSetzen(z, inlineZelle(ref(a.kopfZeile), a.remarkTitel, kopfStil)))

  // Remark-Zellen: Formatierung der letzten Zelle ihrer Zeile, plus Umbruch.
  const umbruch = new Map<number | undefined, number>()
  const stilFuer = (basis: number | undefined) => {
    if (!umbruch.has(basis)) {
      const r = stilMitUmbruch(styles, basis)
      styles = r.styles
      umbruch.set(basis, r.index)
    }
    return umbruch.get(basis)!
  }
  for (const z of a.zeilen) {
    const basis = zellStil(zelleLesen(xml, `${spaltenName(letzte)}${z.excelZeile}`) ?? '')
    const s = stilFuer(basis)
    xml = zeileBearbeiten(xml, z.excelZeile, (row) => {
      let r = zelleSetzen(row, inlineZelle(ref(z.excelZeile), z.remark, s))
      if (z.status !== null && a.statusSpalte !== undefined) {
        const sr = `${spaltenName(a.statusSpalte)}${z.excelZeile}`
        r = zelleSetzen(r, inlineZelle(sr, z.status, zellStil(zelleLesen(row, sr) ?? '')))
      }
      return r
    })
  }
  xml = spaltenBreite(dimensionErweitern(xml, neu), neu, 95)
  m.zip.file(blatt.pfad, xml)
  if (umbruch.size) {
    m.zip.file('xl/styles.xml', styles)
    geaendert.add('xl/styles.xml')
  }

  // Zählformeln überall dort, wo sie auf das geänderte Blatt zeigen.
  const nrNeu: number[] = []
  const quelle = { name: a.blatt, raster: blattRaster(xml, m.geteilt, nrNeu), nr: nrNeu }
  for (const b of m.blaetter) {
    const alt = b.pfad === blatt.pfad ? xml : await lies(b.pfad)
    const neuXml = zaehlformelnAktualisieren(alt, b.name, quelle, m.geteilt)
    if (neuXml !== alt) {
      m.zip.file(b.pfad, neuXml)
      geaendert.add(b.pfad)
    }
  }

  let mappe = { workbook: await lies('xl/workbook.xml'), rels: await lies('xl/_rels/workbook.xml.rels'), typen: await lies('[Content_Types].xml') }
  if (a.neu && a.neu.zeilen.length) {
    const name = eindeutigerName(a.neu.name, m.blaetter.map((b) => b.name))
    let k = 1
    while (m.zip.file(`xl/worksheets/sheet${k}.xml`)) k++
    const pfad = `xl/worksheets/sheet${k}.xml`
    let dxf: ReturnType<typeof prioDxfs> | undefined
    if (a.neu.prio) {
      dxf = prioDxfs(styles)
      styles = dxf.styles
    }
    const xmlNeu = blattBauen(quelleXml, a.blatt, a.kopfZeile, a.neu, stilFuer, dxf)
    m.zip.file(pfad, xmlNeu)
    m.zip.file('xl/styles.xml', styles)
    const filter = xmlNeu.match(/<autoFilter ref="([^"]+)"/)![1]
    mappe = blattEintragen(mappe, name, pfad, filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2'))
    const app = await teilLesen(m.zip, 'docProps/app.xml')
    if (app) {
      const appNeu = appEintragen(app, name)
      if (appNeu !== app) {
        m.zip.file('docProps/app.xml', appNeu)
        geaendert.add('docProps/app.xml')
      }
    }
    for (const p of [pfad, 'xl/styles.xml']) geaendert.add(p)
  }
  const n = neuBerechnen(mappe.workbook, mappe.rels, mappe.typen)
  m.zip.file('xl/workbook.xml', n.workbook)
  m.zip.file('xl/_rels/workbook.xml.rels', n.rels)
  m.zip.file('[Content_Types].xml', n.typen)
  m.zip.remove('xl/calcChain.xml')
  for (const p of ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml', 'xl/calcChain.xml']) geaendert.add(p)

  const out = await m.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return { daten: out, geaendert: [...geaendert] }
}
