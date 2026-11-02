import type { Aenderung, Laufeigenschaften, Lenkung, WortAbsatz, WortLauf, WortOrt } from './model'
import { zahlFormat, type Zaehler } from './nummerierung'
import { hoch, type Einheit } from './seitenzuordnung'
import { farbe, rPrAnwenden, tabellenHintergrund, tabellenRPr, vorlageAufloesen, vorlageEbene, vorlageNummer, type Bedingung, type Stile } from './wordStile'
import { xmlEreignisse } from './xml'

/**
 * Ein Durchlauf durch einen Word-Teil (Haupttext, Kopf- oder Fußzeile).
 *
 * Er sammelt, was die Prüfungen später brauchen, in EINEM Lauf über das XML:
 * Absätze mit Vorlage und Ebene, Läufe mit wirksamen Eigenschaften und
 * wirksamem Hintergrund (Nachtrag N4), Abschnitte mit ihren Kopf- und
 * Fußzeilen-Verweisen, Tabellen, Textfelder, Änderungen, Revisionsbalken
 * und die Einheiten für die Seitenzuordnung (N5).
 */

export interface TeilErgebnis {
  absaetze: WortAbsatz[]
  laeufe: WortLauf[]
  /** Haupttext: Absätze und Tabellenzeilen in Lesereihenfolge */
  einheiten: Einheit[]
  /** Haupttext: je Abschnitt die Verweise auf Kopf-/Fußzeilen (Beziehungs-IDs) */
  sektionen: { kopf: { typ: string; rid: string }[]; fuss: { typ: string; rid: string }[] }[]
  tabellen: number
  seiten: number
  lenkung: Pick<Lenkung, 'aenderungen' | 'textfelder' | 'revisionsbalken'>
  /** Seitenfarbe (w:background), wenn der Teil eine setzt */
  seitenhintergrund?: string
}

interface TabellenKontext {
  stil?: string
  look: Set<Bedingung>
  bandH: boolean
  zeile: number
  spalte: number
  zeileCnf: Set<Bedingung>
  zelleCnf: Set<Bedingung>
  zelleShd?: string
  zellText: string
  reihe: string[]
  /** Rasterspalten der aktuellen Zelle (w:gridSpan) und leere Raster vor/nach der Zeile (w:gridBefore/w:gridAfter) */
  spann: number
  vor: number
  nach: number
}

/** Word erlaubt höchstens 63 Spalten — eine gefälschte Angabe soll keine Riesenzeile bauen. */
const rasterZahl = (v?: string) => Math.max(0, Math.min(63, Math.floor(Number(v)) || 0))

/**
 * Nachverfolgte Formatänderungen und was sie ändern — der Text steht im
 * Befund, wenn die Änderung keinen eigenen Text hat (Tabelle, Abschnitt).
 * Ihr Inhalt ist der ALTE Stand und wird nie angewandt (Audit 11/2026,
 * FRD-15: vorher wurde z. B. die alte weiße Schrift aus w:rPrChange zur
 * aktuellen Farbe).
 */
const FORMATAENDERUNG = new Map([
  ['w:rPrChange', 'Character formatting'],
  ['w:pPrChange', 'Paragraph formatting'],
  ['w:tblPrChange', 'Table formatting'],
  ['w:tblPrExChange', 'Table formatting'],
  ['w:tblGridChange', 'Table grid'],
  ['w:trPrChange', 'Table row formatting'],
  ['w:tcPrChange', 'Table cell formatting'],
  ['w:sectPrChange', 'Section formatting'],
  ['w:numberingChange', 'Numbering'],
])

const CNF_BITS: (Bedingung | null)[] = ['firstRow', 'lastRow', 'firstCol', 'lastCol', null, null, 'band1Horz', 'band2Horz']

/** Bedingungen aus w:cnfStyle (Attribute oder Bitfolge). */
export function cnf(attr: Record<string, string>): Set<Bedingung> {
  const out = new Set<Bedingung>()
  const val = attr['w:val']
  if (val && /^[01]{8,12}$/.test(val)) CNF_BITS.forEach((b, i) => b && val[i] === '1' && out.add(b))
  const map: Record<string, Bedingung> = { 'w:firstRow': 'firstRow', 'w:lastRow': 'lastRow', 'w:firstColumn': 'firstCol', 'w:lastColumn': 'lastCol', 'w:oddHBand': 'band1Horz', 'w:evenHBand': 'band2Horz' }
  for (const [k, b] of Object.entries(map)) if (attr[k] === '1' || attr[k] === 'true') out.add(b)
  return out
}

/** w:tblLook: welche Bedingungen die Tabelle überhaupt einschaltet. */
export function tabellenLook(attr: Record<string, string>): { look: Set<Bedingung>; bandH: boolean } {
  const look = new Set<Bedingung>()
  const hex = attr['w:val'] ? parseInt(attr['w:val'], 16) : NaN
  const an = (k: string, bit: number) => attr[k] === '1' || attr[k] === 'true' || (!Number.isNaN(hex) && (hex & bit) !== 0)
  if (an('w:firstRow', 0x20)) look.add('firstRow')
  if (an('w:lastRow', 0x40)) look.add('lastRow')
  if (an('w:firstColumn', 0x80)) look.add('firstCol')
  if (an('w:lastColumn', 0x100)) look.add('lastCol')
  return { look, bandH: !an('w:noHBand', 0x200) }
}

// Schrift „Symbol" (Adobe-Belegung) → Unicode, ab 0x20 bzw. 0xA0; „U+FFFD" =
// Bauteil großer Klammern oder Pfeile ohne eigenes Zeichen.
const SYMBOL_20 = ' !∀#∃%&∋()∗+,−./0123456789:;<=>?≅ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ[∴]⊥_\uFFFDαβχδεφγηιϕκλμνοπθρστυϖωξψζ{|}∼'
const SYMBOL_A0 = '€ϒ′≤⁄∞ƒ♣♦♥♠↔←↑→↓°±″≥×∝∂•÷≠≡≈…\uFFFD\uFFFD↵ℵℑℜ℘⊗⊕∅∩∪⊃⊇⊄⊂⊆∈∉∠∇®©™∏√⋅¬∧∨⇔⇐⇑⇒⇓◊〈®©™∑' + '\uFFFD'.repeat(11) + '〉∫'

/**
 * Zeichen eines w:sym (Audit 11/2026, FRD-13: „°" fehlte im Text). Word legt
 * Zeichen aus Symbolschriften in den privaten Bereich F000–F0FF; nur für
 * „Symbol" ist die Belegung bekannt. Andere Symbolschriften (Wingdings …)
 * werden U+FFFD — da steht ein Zeichen, aber welches, wird nicht geraten.
 */
export function symbolZeichen(schrift: string | undefined, code: string | undefined): string {
  const n = parseInt(code ?? '', 16)
  // Steuerzeichen (C0, DEL, C1) und Ersatzh\u00E4lften sind kein sichtbares Zeichen
  if (!Number.isFinite(n) || n < 0x20 || (n >= 0x7f && n <= 0x9f) || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '\uFFFD'
  const privat = n >= 0xf000 && n <= 0xf0ff
  if (!privat && n > 0xff) return String.fromCodePoint(n)
  const b = n & 0xff
  if (!/^symbol$/i.test(schrift?.trim() ?? '')) return privat ? '\uFFFD' : String.fromCodePoint(b)
  return (b >= 0x20 && b < 0x7f ? SYMBOL_20[b - 0x20] : b >= 0xa0 && b - 0xa0 < SYMBOL_A0.length ? SYMBOL_A0[b - 0xa0] : undefined) ?? '\uFFFD'
}

export function teilLesen(
  xml: string,
  opts: {
    teil: string
    ort: Exclude<WortOrt, 'textfeld'>
    stile: Stile
    startNr: number
    seitenhintergrund?: string
    /** Zähler der automatischen Nummerierung (word/numbering.xml) — ohne ihn keine Listennummern */
    nummern?: Zaehler
    /** Text der Fuß- und Endnoten je w:id (word/footnotes.xml, word/endnotes.xml) */
    noten?: { fuss?: Map<string, string>; end?: Map<string, string> }
  },
): TeilErgebnis {
  const { stile } = opts
  const absaetze: WortAbsatz[] = []
  const laeufe: WortLauf[] = []
  const einheiten: TeilErgebnis['einheiten'] = []
  const sektionen: TeilErgebnis['sektionen'] = [{ kopf: [], fuss: [] }]
  const lenkung: TeilErgebnis['lenkung'] = { aenderungen: [], textfelder: [], revisionsbalken: 0 }
  let tabellen = 0
  let geoeffnet = 0
  let seite = 1
  let textSeitUmbruch = true

  const tabStapel: TabellenKontext[] = []
  // Füllung je Form: Farbe; null = vorhanden, aber nicht bestimmbar (Verlauf,
  // Designfarbe, transparent …); undefined = keine Angabe.
  const formFuellung: (string | null | undefined)[] = []
  // Tiefe in wps:spPr — 1 heißt: direktes Kind. Nur DORT steht die Füllung;
  // a:ln/a:solidFill ist die Rahmenfarbe (Audit 11/2026, FRD-04).
  let spTiefe = 0
  let fuellungOffen = false
  // In wps:style: Steht in wps:spPr keine Füllung, füllt Word die Form aus
  // dem Design (a:fillRef, idx 0 = keine Füllung) — bei eingefügten Formen
  // die Vorgabe, meist Akzentfarbe. Welche, steht im Design und wird nicht
  // geraten; ohne das galt weiße Schrift auf so einer Form als „Invisible
  // text" auf weißer Seite (Nachtrag L-FREMD#2, gleiche Ursache wie FRD-04).
  let inFormStil = false
  let txbx = 0
  let fallback = 0
  let inPPr = false
  let inNumPr = false
  // Tiefe in einer Formatänderung (FORMATAENDERUNG) — darin steht der alte Stand
  let inAlt = 0
  let inSectPr = false
  let sektionEndet = false
  let inTblPr = false
  let inTcPr = false
  let rand = false

  type OffenerAbsatz = WortAbsatz & {
    pShd?: string
    laufStart: number
    numId?: string
    ilvl?: number
    /** Formatänderungen an Absatz oder Absatzmarke — ihr Text ist der Absatztext */
    format?: Aenderung[]
    /** Absatzmarke gelöscht oder wegverschoben: Word zeigt den Absatz nicht mehr */
    markeWeg?: boolean
  }
  type OffenerLauf = { e: Laufeigenschaften; text: string; rStil?: string; format?: Aenderung[] }
  let absatz: OffenerAbsatz | null = null
  let lauf: OffenerLauf | null = null
  // Textfelder stecken IN einem Lauf eines Absatzes (Deckblätter!). Ohne
  // Stapel überschrieb der innere Absatz den äußeren, und dessen Text — oft
  // der Titel — ging verloren. Gefunden beim Browsertest mit SBX-WORD-01.
  const stapel: { absatz: OffenerAbsatz | null; lauf: OffenerLauf | null }[] = []
  const laufStapel: (OffenerLauf | null)[] = []
  let inRPr = false
  // rPr der Absatzmarke (in w:pPr) gehört zu keinem Lauf — ihre Schattierung
  // ist nicht die des Absatzes.
  let markeRPr = false
  let inText = false
  let inDelText = false
  // Fuß- und Endnoten zählt Word getrennt, in Dokumentreihenfolge (Endnoten römisch).
  let fussnoten = 0
  let endnoten = 0
  // Verschiebungen zeichnet Word wie Einfügen und Löschen auf: Der Text an
  // der alten Stelle (w:moveFrom) gehört nicht mehr zum Inhalt — vorher
  // stand er doppelt da, und keine der beiden Stellen galt als offene
  // Änderung (Audit 11/2026, FRD-15).
  let ins: { art: 'ins' | 'moveTo'; autor?: string; text: string } | null = null
  let del: { art: 'del' | 'moveFrom'; autor?: string; text: string } | null = null
  // In word/footnotes.xml bzw. endnotes.xml: die Note, zu der der Absatz gehört
  let notiz: string | undefined
  // Was Word sichtbar zeigt, aber nicht im Fließtext steht — Textfelder und
  // Fuß-/Endnoten —, folgt als eigene Einheit auf die Einheit, in der es
  // verankert ist (Audit 11/2026, FRD-13). Sonst fanden Suche und Prüfungen
  // „CONTROLLED COPY" oder eine Abkürzung nur in der Fußnote nicht. Direkt
  // dahinter, nicht am Dokumentende: So bleibt die Seite die des Ankers,
  // und im Word-PDF steht die Fußnote auf derselben Seite. Markiert, weil
  // sie dort NICHT im Textfluss steht (`Einheit.nachgereicht`).
  const nachgereicht: string[] = []
  const nachreichen = () => {
    for (const text of nachgereicht.splice(0)) {
      einheiten.push({ text, seite, nachgereicht: true })
      textSeitUmbruch = false
    }
  }
  // Sichtbares Zeichen an Absatz und Lauf — nur, was nicht gelöscht ist.
  const zeichen = (z: string) => {
    if (!absatz || !lauf || del) return
    absatz.text += z
    lauf.text += z
  }

  const umbruch = () => {
    if (textSeitUmbruch) return
    seite++
    textSeitUmbruch = true
  }

  /** Welche Bedingungen der Tabellenvorlage gelten für die aktuelle Zelle? */
  const bedingungen = (t: TabellenKontext): Set<Bedingung> => {
    const aktiv = new Set<Bedingung>([...t.zeileCnf, ...t.zelleCnf])
    if (t.zeile === 0 && t.look.has('firstRow')) aktiv.add('firstRow')
    if (t.spalte === 0 && t.look.has('firstCol')) aktiv.add('firstCol')
    if (t.bandH && !aktiv.has('firstRow')) aktiv.add((t.zeile - (t.look.has('firstRow') ? 1 : 0)) % 2 === 0 ? 'band1Horz' : 'band2Horz')
    return aktiv
  }

  const hintergrund = (lp: Laufeigenschaften): string | undefined => {
    if (lp.schattierung) return lp.schattierung
    if (absatz?.pShd) return absatz.pShd
    const pv = vorlageAufloesen(stile, absatz?.stil ?? stile.standardAbsatz)._pShd
    if (pv) return pv
    if (txbx && formFuellung.length) {
      const f = formFuellung[formFuellung.length - 1]
      // Nicht bestimmbare Füllung: kein Hintergrund geraten — sonst wäre
      // weiße Schrift auf einer Verlaufs- oder Designfarbe „unsichtbar".
      if (f === null) return undefined
      if (f) return f
    }
    const t = tabStapel[tabStapel.length - 1]
    if (t && !txbx) {
      if (t.zelleShd) return t.zelleShd
      const v = tabellenHintergrund(stile, t.stil ?? stile.standardTabelle, bedingungen(t))
      if (v) return v
    }
    return opts.seitenhintergrund ?? 'FFFFFF'
  }

  for (const e of xmlEreignisse(xml)) {
    if (e.typ === 'auf') {
      if (e.name === 'mc:Fallback') fallback++
      if (fallback) continue
      if (FORMATAENDERUNG.has(e.name)) {
        if (!inAlt) {
          const a: Aenderung = { art: 'format', text: '', autor: e.attr['w:author'] }
          // Am Lauf bzw. Absatz gesammelt — der Text folgt erst danach
          if (e.name === 'w:rPrChange' && lauf) (lauf.format ??= []).push(a)
          else if ((e.name === 'w:rPrChange' || e.name === 'w:pPrChange') && absatz) (absatz.format ??= []).push(a)
          else a.text = FORMATAENDERUNG.get(e.name)!
          lenkung.aenderungen.push(a)
        }
        inAlt++
        continue
      }
      if (inAlt) continue
      const t = tabStapel[tabStapel.length - 1]
      if (spTiefe > 0) {
        const oben = formFuellung.length - 1
        if (oben >= 0 && spTiefe === 1) {
          if (e.name === 'a:solidFill') {
            fuellungOffen = true
            formFuellung[oben] = null
          } else if (/^a:(noFill|gradFill|blipFill|pattFill|grpFill)$/.test(e.name)) formFuellung[oben] = null
        } else if (oben >= 0 && spTiefe === 2 && fuellungOffen && e.name === 'a:srgbClr') {
          // Mit Abwandlung (a:alpha, a:lumMod …) ist es nicht mehr die angegebene Farbe.
          formFuellung[oben] = e.leer ? (farbe(e.attr.val) ?? null) : null
        }
        spTiefe++
      }
      switch (e.name) {
        case 'w:background': {
          const f = farbe(e.attr['w:color'])
          if (f && f !== 'auto') opts.seitenhintergrund = f
          break
        }
        case 'w:txbxContent': txbx++; break
        case 'w:footnote':
        case 'w:endnote': notiz = e.attr['w:id']; break
        case 'wps:wsp': formFuellung.push(undefined); break
        case 'wps:spPr': spTiefe = 1; fuellungOffen = false; break
        case 'wps:style': inFormStil = true; break
        case 'a:fillRef': {
          const oben = formFuellung.length - 1
          if (inFormStil && oben >= 0 && formFuellung[oben] === undefined && (e.attr.idx ?? '0') !== '0') formFuellung[oben] = null
          break
        }
        case 'w:tbl':
          if (!txbx) {
            if (tabStapel.length === 0) tabellen++
            tabStapel.push({ look: new Set(), bandH: true, zeile: -1, spalte: -1, zeileCnf: new Set(), zelleCnf: new Set(), zellText: '', reihe: [], spann: 1, vor: 0, nach: 0 })
          }
          break
        case 'w:tblPr': inTblPr = true; break
        case 'w:tblStyle': if (t && inTblPr) t.stil = e.attr['w:val']; break
        case 'w:tblLook': if (t && inTblPr) Object.assign(t, tabellenLook(e.attr)); break
        case 'w:tr': if (t && !txbx) { t.zeile++; t.spalte = -1; t.zeileCnf = new Set(); t.reihe = []; t.vor = 0; t.nach = 0 } break
        case 'w:tc': if (t && !txbx) { t.spalte++; t.zelleCnf = new Set(); t.zelleShd = undefined; t.zellText = ''; t.spann = 1 } break
        case 'w:tcPr': inTcPr = true; break
        // Verbundene Zellen füllen ihr Raster mit leeren Zellen auf: Sonst hatte
        // der zweizeilige Kopf „… | Flight time | Cumulative" über „… | Dual |
        // Mutual | " eine Zelle weniger, die Rechenprüfung trennte ihn ab und
        // summierte die Kumuliert-Spalte (Audit 11/2026, FRD-03). Fortgesetzte
        // vMerge-Zellen sind eigene w:tc und bleiben leer.
        case 'w:gridSpan': if (t && !txbx && inTcPr) t.spann = Math.max(1, rasterZahl(e.attr['w:val'])); break
        case 'w:gridBefore': if (t && !txbx && !inTcPr) t.vor = rasterZahl(e.attr['w:val']); break
        case 'w:gridAfter': if (t && !txbx && !inTcPr) t.nach = rasterZahl(e.attr['w:val']); break
        case 'w:cnfStyle': if (t && !txbx) { if (inTcPr) t.zelleCnf = cnf(e.attr); else if (!absatz) t.zeileCnf = cnf(e.attr) } break
        case 'w:p':
          stapel.push({ absatz, lauf })
          lauf = null
          absatz = {
            // Beim ÖFFNEN gezählt: Ein Textfeld-Absatz öffnet, bevor sein
            // Ankerabsatz fertig ist — mit absaetze.length bekamen beide
            // dieselbe Nummer, und Fundstellen im Textfeld zeigten auf den
            // Anker (gefunden beim Test zu FRD-13).
            nr: opts.startNr + geoeffnet++,
            text: '',
            ort: txbx ? 'textfeld' : opts.ort,
            teil: opts.teil,
            sektion: sektionen.length,
            seiteCa: seite,
            laufStart: laeufe.length,
            ...(notiz !== undefined ? { notiz } : {}),
            ...(t && !txbx ? { tabelle: { zeile: t.zeile, spalte: t.spalte } } : {}),
          }
          rand = false
          break
        case 'w:pPr': if (absatz && !lauf) inPPr = true; break
        case 'w:pStyle': if (absatz && inPPr) absatz.stil = e.attr['w:val']; break
        case 'w:numPr': if (absatz && inPPr) inNumPr = true; break
        case 'w:numId': if (absatz && inNumPr) absatz.numId = e.attr['w:val']; break
        case 'w:ilvl': if (absatz && inNumPr) absatz.ilvl = Number(e.attr['w:val'] ?? 0); break
        case 'w:pBdr': if (inPPr) rand = true; break
        case 'w:sectPr': inSectPr = true; if (inPPr) sektionEndet = true; break
        case 'w:headerReference': if (inSectPr) sektionen[sektionen.length - 1].kopf.push({ typ: e.attr['w:type'] ?? 'default', rid: e.attr['r:id'] ?? '' }); break
        case 'w:footerReference': if (inSectPr) sektionen[sektionen.length - 1].fuss.push({ typ: e.attr['w:type'] ?? 'default', rid: e.attr['r:id'] ?? '' }); break
        case 'w:r':
          laufStapel.push(lauf)
          lauf = { e: {}, text: '' }
          break
        case 'w:rPr': if (lauf) inRPr = true; else if (inPPr) markeRPr = true; break
        case 'w:rStyle': if (lauf && inRPr) lauf.rStil = e.attr['w:val']; break
        case 'w:ins':
        case 'w:moveTo':
          ins = { art: e.name === 'w:ins' ? 'ins' : 'moveTo', autor: e.attr['w:author'], text: '' }
          break
        case 'w:del':
        case 'w:moveFrom':
          // Leer in der rPr der Absatzmarke: Die Marke selbst ist gelöscht bzw. verschoben
          if (markeRPr && absatz) absatz.markeWeg = true
          del = { art: e.name === 'w:del' ? 'del' : 'moveFrom', autor: e.attr['w:author'], text: '' }
          break
        case 'w:t': inText = true; break
        case 'w:delText': inDelText = true; break
        case 'w:tab':
        case 'w:ptab': zeichen('\t'); break
        case 'w:br':
          if (e.attr['w:type'] === 'page' && !txbx && !t && opts.ort === 'body') umbruch()
          else zeichen(' ')
          break
        case 'w:cr': zeichen(' '); break
        // Geschützter Bindestrich: Word zeigt „-" — ohne ihn las sich
        // „Part-FCL" als „PartFCL" (FRD-13). Der bedingte Trennstrich
        // (w:softHyphen) erscheint nur am Zeilenende und bleibt weg.
        case 'w:noBreakHyphen': zeichen('-'); break
        case 'w:sym': zeichen(symbolZeichen(e.attr['w:font'], e.attr['w:char'])); break
        case 'w:lastRenderedPageBreak': if (!txbx && !t && opts.ort === 'body') umbruch(); break
        case 'w:footnoteReference':
        case 'w:endnoteReference': {
          // Word zeigt die Verweisziffer im Text, und sie steht auch im
          // exportierten PDF — fehlte sie hier, scheiterte das Word-PDF-Paar
          // an jeder Fußnote (Audit 11/2026, FRD-06). Hochgestellt: „FCL.810¹"
          // bleibt als Regel „FCL.810" lesbar; NFKC macht beim Abgleich „1" daraus.
          if (!absatz || !lauf || del) break
          const fuss = e.name === 'w:footnoteReference'
          // Eigenes Zeichen (w:customMarkFollows): steht als Text im nächsten Lauf
          const eigen = /^(1|true|on)$/i.test(e.attr['w:customMarkFollows'] ?? '')
          const z = eigen ? '' : fuss ? hoch(String(++fussnoten)) : hoch(zahlFormat(++endnoten, 'lowerRoman'))
          zeichen(z)
          const note = (fuss ? opts.noten?.fuss : opts.noten?.end)?.get(e.attr['w:id'] ?? '')
          if (note && opts.ort === 'body') nachgereicht.push(z ? `${z} ${note}` : note)
          break
        }
        default:
          if (inRPr && lauf) rPrAnwenden(lauf.e, e)
          else if (inPPr && absatz && e.name === 'w:shd' && !inSectPr && !markeRPr) {
            const f = farbe(e.attr['w:fill'])
            if (f && f !== 'auto') absatz.pShd = f
          } else if (inTcPr && t && e.name === 'w:shd') {
            const f = farbe(e.attr['w:fill'])
            if (f && f !== 'auto') t.zelleShd = f
          }
      }
      if (rand && (e.name === 'w:left' || e.name === 'w:right')) {
        lenkung.revisionsbalken++
        rand = false
      }
    } else if (e.typ === 'zu') {
      if (e.name === 'mc:Fallback') { fallback--; continue }
      if (fallback) continue
      if (FORMATAENDERUNG.has(e.name)) {
        inAlt--
        continue
      }
      if (inAlt) continue
      const t = tabStapel[tabStapel.length - 1]
      if (spTiefe > 0) {
        spTiefe--
        if (spTiefe === 1 && e.name === 'a:solidFill') fuellungOffen = false
      }
      switch (e.name) {
        case 'wps:wsp': formFuellung.pop(); break
        case 'wps:style': inFormStil = false; break
        case 'w:tblPr': inTblPr = false; break
        case 'w:tcPr': inTcPr = false; break
        case 'w:pPr': inPPr = false; break
        case 'w:numPr': inNumPr = false; break
        case 'w:sectPr':
          inSectPr = false
          break
        case 'w:pBdr': rand = false; break
        case 'w:rPr': inRPr = false; markeRPr = false; break
        case 'w:t': inText = false; break
        case 'w:delText': inDelText = false; break
        case 'w:ins':
        case 'w:moveTo':
          if (ins?.text.trim()) lenkung.aenderungen.push({ art: ins.art, text: ins.text.trim(), autor: ins.autor })
          ins = null
          break
        case 'w:del':
        case 'w:moveFrom':
          if (del?.text.trim()) lenkung.aenderungen.push({ art: del.art, text: del.text.trim(), autor: del.autor })
          del = null
          break
        case 'w:r': {
          const l = lauf
          lauf = laufStapel.pop() ?? null
          for (const a of l?.format ?? []) a.text = l!.text.trim() || FORMATAENDERUNG.get('w:rPrChange')!
          if (!l || !absatz || !l.text) break
          // Wirksam (Rangfolge wie Word): Dokumentvorgabe ← Tabellenvorlage
          // (samt Bedingung) ← Absatzvorlage ← Zeichenvorlage ← direkt.
          const { _pShd, ...ausAbsatz } = vorlageAufloesen(stile, absatz.stil ?? stile.standardAbsatz)
          void _pShd
          const tab = tabStapel[tabStapel.length - 1]
          const ausTabelle = tab && !txbx ? tabellenRPr(stile, tab.stil ?? stile.standardTabelle, bedingungen(tab)) : {}
          const eigenschaften: Laufeigenschaften = { ...stile.standard, ...ausTabelle, ...ausAbsatz, ...vorlageAufloesen(stile, l.rStil), ...l.e }
          delete (eigenschaften as { _pShd?: string })._pShd
          laeufe.push({ absatz: absatz.nr, text: l.text, eigenschaften, hintergrund: hintergrund(eigenschaften) })
          break
        }
        case 'w:p': {
          const a = absatz
          const vorher = stapel.pop()
          absatz = vorher?.absatz ?? null
          lauf = vorher?.lauf ?? null
          if (!a) break
          const ev = vorlageEbene(stile, a.stil ?? stile.standardAbsatz)
          // Listennummer wie in Word VOR den Text (Audit 11/2026, FRD-01): Erst
          // damit tragen Gliederung, Kapitelpfad, Verzeichnis-Anker und
          // Kapitelverweise „1.2", wo Word „1.2" zeigt. numId 0 im Absatz hebt
          // die Liste der Vorlage auf.
          const vn = vorlageNummer(stile, a.stil ?? stile.standardAbsatz)
          // Ein Absatz, dessen Marke gelöscht oder wegverschoben ist und der
          // nichts mehr zeigt, zählt in der Liste nicht mit — sonst verschöbe
          // ein verschobener Listenpunkt alle folgenden Nummern (FRD-15).
          const weg = a.markeWeg && !a.text.trim()
          const numId = weg ? undefined : (a.numId ?? vn.numId)
          const nummer = numId ? opts.nummern?.naechste(numId, a.ilvl ?? (a.numId === undefined ? vn.ilvl : undefined), a.stil ?? stile.standardAbsatz) : undefined
          if (nummer) a.text = `${nummer} ${a.text}`
          for (const f of a.format ?? []) f.text = a.text.replace(/\s+/g, ' ').trim() || FORMATAENDERUNG.get('w:pPrChange')!
          const { pShd: _p, laufStart: _l, numId: _n, ilvl: _i, format: _f, markeWeg: _w, ...rest } = a
          void _p
          void _l
          void _n
          void _i
          void _f
          void _w
          const fertig: WortAbsatz = { ...rest, ...(ev.name ? { stilName: ev.name } : {}), ...(ev.ebene ? { ebene: ev.ebene } : {}), ...(ev.toc ? { toc: ev.toc } : {}) }
          absaetze.push(fertig)
          const text = a.text.replace(/[ \t]+/g, ' ').trim()
          if (txbx) {
            if (text) lenkung.textfelder.push(text)
            if (text && opts.ort === 'body') nachgereicht.push(text)
          } else if (t) t.zellText = `${t.zellText} ${text}`.trim()
          else if (opts.ort === 'body') {
            if (text) {
              einheiten.push({ text, seite, ...(ev.ebene ? { ebene: ev.ebene } : {}) })
              textSeitUmbruch = false
            }
            nachreichen()
          }
          if (sektionEndet) {
            sektionen.push({ kopf: [], fuss: [] })
            sektionEndet = false
          }
          break
        }
        case 'w:tc': if (t && !txbx) t.reihe.push(t.zellText, ...new Array<string>(t.spann - 1).fill('')); break
        case 'w:tr':
          if (!t || txbx) break
          t.reihe = [...new Array<string>(t.vor).fill(''), ...t.reihe, ...new Array<string>(t.nach).fill('')]
          if (tabStapel.length > 1) {
            // Zeile einer inneren Tabelle: Ihr Text gehört in die Zelle der
            // äußeren — vorher blieb er im inneren Kontext und fehlte ganz
            // („Fuel on board | 120 litres", FRD-13).
            const aussen = tabStapel[tabStapel.length - 2]
            if (t.reihe.some(Boolean)) aussen.zellText = `${aussen.zellText} ${t.reihe.join(' | ')}`.trim()
          } else if (opts.ort === 'body' && t.reihe.some(Boolean)) {
            einheiten.push({ text: t.reihe.join(' | '), seite })
            textSeitUmbruch = false
          }
          break
        case 'w:tbl':
          if (txbx) break
          tabStapel.pop()
          // Fußnoten und Textfelder aus der Tabelle erst HINTER der ganzen
          // Tabelle: Eine Zeile „¹ …" zwischen zwei Tabellenzeilen teilte sie
          // im Seitentext, und die Rechenprüfung nahm die Zeile nach der
          // Note für den Kopf einer neuen Tabelle (Gegenprüfung Audit 11/2026).
          if (!tabStapel.length && opts.ort === 'body') nachreichen()
          break
        case 'w:txbxContent': txbx--; break
        case 'w:footnote':
        case 'w:endnote': notiz = undefined; break
      }
    } else if (inText && absatz && lauf && !del) {
      absatz.text += e.text
      lauf.text += e.text
      if (ins) ins.text += e.text
    } else if ((inDelText || inText) && del) del.text += e.text
  }
  nachreichen()
  // Ein Abschnitt, der durch einen sectPr in einem Absatz endete und danach
  // keinen Inhalt mehr hat, ist Words leerer Schlussabschnitt — er bleibt in
  // der Liste (Nachtrag N4: „letzter leerer Abschnitt mit eigener Kopfzeile").
  return { absaetze, laeufe, einheiten, sektionen, tabellen, seiten: seite, lenkung, ...(opts.seitenhintergrund ? { seitenhintergrund: opts.seitenhintergrund } : {}) }
}
