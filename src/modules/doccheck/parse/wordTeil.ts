import type { Laufeigenschaften, Lenkung, WortAbsatz, WortLauf, WortOrt } from './model'
import { farbe, rPrAnwenden, tabellenHintergrund, tabellenRPr, vorlageAufloesen, vorlageEbene, type Bedingung, type Stile } from './wordStile'
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
  einheiten: { text: string; seite: number; ebene?: number }[]
  /** Haupttext: je Abschnitt die Verweise auf Kopf-/Fußzeilen (Beziehungs-IDs) */
  sektionen: { kopf: { typ: string; rid: string }[]; fuss: { typ: string; rid: string }[] }[]
  tabellen: number
  seiten: number
  lenkung: Pick<Lenkung, 'aenderungen' | 'textfelder' | 'revisionsbalken'>
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
}

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

export function teilLesen(
  xml: string,
  opts: { teil: string; ort: Exclude<WortOrt, 'textfeld'>; stile: Stile; startNr: number; seitenhintergrund?: string },
): TeilErgebnis {
  const { stile } = opts
  const absaetze: WortAbsatz[] = []
  const laeufe: WortLauf[] = []
  const einheiten: TeilErgebnis['einheiten'] = []
  const sektionen: TeilErgebnis['sektionen'] = [{ kopf: [], fuss: [] }]
  const lenkung: TeilErgebnis['lenkung'] = { aenderungen: [], textfelder: [], revisionsbalken: 0 }
  let tabellen = 0
  let seite = 1
  let textSeitUmbruch = true

  const tabStapel: TabellenKontext[] = []
  const formFuellung: (string | undefined)[] = []
  let inFormSpPr = 0
  let inSolidFill = 0
  let txbx = 0
  let fallback = 0
  let inPPr = false
  let inSectPr = false
  let sektionEndet = false
  let inTblPr = false
  let inTcPr = false
  let rand = false

  type OffenerAbsatz = WortAbsatz & { pShd?: string; laufStart: number }
  type OffenerLauf = { e: Laufeigenschaften; text: string; rStil?: string }
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
  let ins: { autor?: string; text: string } | null = null
  let del: { autor?: string; text: string } | null = null

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

  const hintergrund = (lp: Laufeigenschaften): string => {
    if (lp.schattierung) return lp.schattierung
    if (absatz?.pShd) return absatz.pShd
    const pv = vorlageAufloesen(stile, absatz?.stil ?? stile.standardAbsatz)._pShd
    if (pv) return pv
    if (txbx && formFuellung.length) {
      const f = formFuellung[formFuellung.length - 1]
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
      const t = tabStapel[tabStapel.length - 1]
      switch (e.name) {
        case 'w:background': {
          const f = farbe(e.attr['w:color'])
          if (f && f !== 'auto') opts.seitenhintergrund = f
          break
        }
        case 'w:txbxContent': txbx++; break
        case 'wps:wsp': formFuellung.push(undefined); break
        case 'wps:spPr': inFormSpPr++; break
        case 'a:solidFill': if (inFormSpPr) inSolidFill++; break
        case 'a:srgbClr': if (inFormSpPr && inSolidFill && formFuellung.length) formFuellung[formFuellung.length - 1] = farbe(e.attr.val); break
        case 'w:tbl':
          if (!txbx) {
            if (tabStapel.length === 0) tabellen++
            tabStapel.push({ look: new Set(), bandH: true, zeile: -1, spalte: -1, zeileCnf: new Set(), zelleCnf: new Set(), zellText: '', reihe: [] })
          }
          break
        case 'w:tblPr': inTblPr = true; break
        case 'w:tblStyle': if (t && inTblPr) t.stil = e.attr['w:val']; break
        case 'w:tblLook': if (t && inTblPr) Object.assign(t, tabellenLook(e.attr)); break
        case 'w:tr': if (t && !txbx) { t.zeile++; t.spalte = -1; t.zeileCnf = new Set(); t.reihe = [] } break
        case 'w:tc': if (t && !txbx) { t.spalte++; t.zelleCnf = new Set(); t.zelleShd = undefined; t.zellText = '' } break
        case 'w:tcPr': inTcPr = true; break
        case 'w:cnfStyle': if (t && !txbx) { if (inTcPr) t.zelleCnf = cnf(e.attr); else if (!absatz) t.zeileCnf = cnf(e.attr) } break
        case 'w:p':
          stapel.push({ absatz, lauf })
          lauf = null
          absatz = {
            nr: opts.startNr + absaetze.length,
            text: '',
            ort: txbx ? 'textfeld' : opts.ort,
            teil: opts.teil,
            sektion: sektionen.length,
            seiteCa: seite,
            laufStart: laeufe.length,
            ...(t && !txbx ? { tabelle: { zeile: t.zeile, spalte: t.spalte } } : {}),
          }
          rand = false
          break
        case 'w:pPr': if (absatz && !lauf) inPPr = true; break
        case 'w:pStyle': if (absatz && inPPr) absatz.stil = e.attr['w:val']; break
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
        case 'w:ins': ins = { autor: e.attr['w:author'], text: '' }; break
        case 'w:del': del = { autor: e.attr['w:author'], text: '' }; break
        case 'w:t': inText = true; break
        case 'w:delText': inDelText = true; break
        case 'w:tab': if (absatz && lauf && !del) { absatz.text += '\t'; lauf.text += '\t' } break
        case 'w:br':
          if (e.attr['w:type'] === 'page' && !txbx && !t && opts.ort === 'body') umbruch()
          else if (absatz && lauf && !del) { absatz.text += ' '; lauf.text += ' ' }
          break
        case 'w:lastRenderedPageBreak': if (!txbx && !t && opts.ort === 'body') umbruch(); break
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
      const t = tabStapel[tabStapel.length - 1]
      switch (e.name) {
        case 'wps:wsp': formFuellung.pop(); break
        case 'wps:spPr': inFormSpPr--; break
        case 'a:solidFill': if (inFormSpPr) inSolidFill--; break
        case 'w:tblPr': inTblPr = false; break
        case 'w:tcPr': inTcPr = false; break
        case 'w:pPr': inPPr = false; break
        case 'w:sectPr':
          inSectPr = false
          break
        case 'w:pBdr': rand = false; break
        case 'w:rPr': inRPr = false; markeRPr = false; break
        case 'w:t': inText = false; break
        case 'w:delText': inDelText = false; break
        case 'w:ins': if (ins?.text.trim()) lenkung.aenderungen.push({ art: 'ins', text: ins.text.trim(), autor: ins.autor }); ins = null; break
        case 'w:del': if (del?.text.trim()) lenkung.aenderungen.push({ art: 'del', text: del.text.trim(), autor: del.autor }); del = null; break
        case 'w:r': {
          const l = lauf
          lauf = laufStapel.pop() ?? null
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
          const { pShd: _p, laufStart: _l, ...rest } = a
          void _p
          void _l
          const fertig: WortAbsatz = { ...rest, ...(ev.name ? { stilName: ev.name } : {}), ...(ev.ebene ? { ebene: ev.ebene } : {}), ...(ev.toc ? { toc: ev.toc } : {}) }
          absaetze.push(fertig)
          const text = a.text.replace(/[ \t]+/g, ' ').trim()
          if (txbx) { if (text) lenkung.textfelder.push(text) }
          else if (t) t.zellText = `${t.zellText} ${text}`.trim()
          else if (text && opts.ort === 'body') {
            einheiten.push({ text, seite, ...(ev.ebene ? { ebene: ev.ebene } : {}) })
            textSeitUmbruch = false
          }
          if (sektionEndet) {
            sektionen.push({ kopf: [], fuss: [] })
            sektionEndet = false
          }
          break
        }
        case 'w:tc': if (t && !txbx) t.reihe.push(t.zellText); break
        case 'w:tr':
          if (t && !txbx && t.reihe.some(Boolean) && tabStapel.length === 1 && opts.ort === 'body') {
            einheiten.push({ text: t.reihe.join(' | '), seite })
            textSeitUmbruch = false
          }
          break
        case 'w:tbl': if (!txbx) tabStapel.pop(); break
        case 'w:txbxContent': txbx--; break
      }
    } else if (inText && absatz && lauf && !del) {
      absatz.text += e.text
      lauf.text += e.text
      if (ins) ins.text += e.text
    } else if (inDelText && del) del.text += e.text
  }
  // Ein Abschnitt, der durch einen sectPr in einem Absatz endete und danach
  // keinen Inhalt mehr hat, ist Words leerer Schlussabschnitt — er bleibt in
  // der Liste (Nachtrag N4: „letzter leerer Abschnitt mit eigener Kopfzeile").
  return { absaetze, laeufe, einheiten, sektionen, tabellen, seiten: seite, lenkung }
}
