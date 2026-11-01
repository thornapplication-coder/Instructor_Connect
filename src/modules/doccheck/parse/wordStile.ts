import type { Laufeigenschaften } from './model'
import { xmlEreignisse, type XmlEreignis } from './xml'

/**
 * Formatvorlagen aus word/styles.xml — mit Vererbung (`basedOn`).
 *
 * Der Nachtrag (N4) verlangt den WIRKSAMEN Hintergrund eines Laufs, und der
 * hängt oft gar nicht am Lauf: Weißer Text in der Kopfzeile einer Tabelle
 * ist lesbar, wenn die Tabellenformatvorlage die erste Zeile dunkel
 * schattiert — und unsichtbar, wenn sie es nicht tut. Wer nur die direkte
 * Formatierung liest, meldet den ersten Fall fälschlich und übersieht keinen
 * echten. Deshalb hier die ganze Kette.
 */

export type Bedingung = 'firstRow' | 'lastRow' | 'firstCol' | 'lastCol' | 'band1Horz' | 'band2Horz'

export interface Stil {
  id: string
  typ: string
  name: string
  basedOn?: string
  ebene?: number
  toc?: number
  rPr: Laufeigenschaften
  /** Absatzschattierung der Vorlage */
  pShd?: string
  /** Tabellenvorlage: Zellschattierung gesamt und je Bedingung */
  zelle?: string
  bedingt?: Partial<Record<Bedingung, string>>
  /** Tabellenvorlage: Zeichenformat je Bedingung (z. B. weiße, fette Kopfzeile) */
  bedingtRPr?: Partial<Record<Bedingung, Laufeigenschaften>>
}

export interface Stile {
  stile: Map<string, Stil>
  standard: Laufeigenschaften
  standardAbsatz?: string
  standardTabelle?: string
}

const AN = (v?: string) => v === undefined || !/^(0|false|off|none)$/i.test(v)

/** Farbwert normalisieren: RRGGBB groß, „auto" bleibt. */
export function farbe(v?: string): string | undefined {
  if (!v) return undefined
  if (/^auto$/i.test(v)) return 'auto'
  return /^[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : undefined
}

/**
 * Ein Ereignis innerhalb von w:rPr auf die Eigenschaften anwenden. Gemeinsam
 * für Vorlagen und direkte Formatierung — eine Auslegung, nicht zwei.
 */
export function rPrAnwenden(ziel: Laufeigenschaften, e: XmlEreignis): void {
  if (e.typ !== 'auf') return
  const val = e.attr['w:val']
  switch (e.name) {
    case 'w:color': {
      const f = farbe(val)
      if (f) ziel.farbe = f
      break
    }
    case 'w:sz': if (val && /^\d+$/.test(val)) ziel.groesse = Number(val) / 2; break
    case 'w:vanish': ziel.vanish = AN(val); break
    case 'w:noProof': ziel.noProof = AN(val); break
    case 'w:b': ziel.fett = AN(val); break
    case 'w:lang': if (val) ziel.sprache = val; break
    case 'w:highlight': if (val && val !== 'none') ziel.markierung = val; else delete ziel.markierung; break
    case 'w:shd': {
      const f = farbe(e.attr['w:fill'])
      if (f && f !== 'auto') ziel.schattierung = f
      break
    }
  }
}

const BEDINGUNGEN: Bedingung[] = ['firstRow', 'lastRow', 'firstCol', 'lastCol', 'band1Horz', 'band2Horz']

export function stileLesen(xml: string): Stile {
  const stile = new Map<string, Stil>()
  const standard: Laufeigenschaften = {}
  let standardAbsatz: string | undefined
  let standardTabelle: string | undefined
  let s: Stil | null = null
  let inRPr = 0
  let inDefaults = false
  let bedingung: Bedingung | null = null
  let inTcPr = false
  let inPPr = false

  for (const e of xmlEreignisse(xml)) {
    if (e.typ === 'auf') {
      if (e.name === 'w:rPrDefault') inDefaults = true
      else if (e.name === 'w:style') {
        s = { id: e.attr['w:styleId'] ?? '', typ: e.attr['w:type'] ?? 'paragraph', name: '', rPr: {} }
        if (AN(e.attr['w:default']) && e.attr['w:default'] !== undefined) {
          if (s.typ === 'paragraph') standardAbsatz = s.id
          if (s.typ === 'table') standardTabelle = s.id
        }
      } else if (s && e.name === 'w:name') s.name = e.attr['w:val'] ?? ''
      else if (s && e.name === 'w:basedOn') s.basedOn = e.attr['w:val']
      else if (s && e.name === 'w:outlineLvl') s.ebene = Number(e.attr['w:val']) + 1
      else if (s && e.name === 'w:tblStylePr') {
        // „wholeTable" ist keine Bedingung, sondern das Format der ganzen
        // Tabelle — es landet beim Grundformat der Vorlage.
        const t = e.attr['w:type'] as Bedingung
        bedingung = BEDINGUNGEN.includes(t) ? t : null
      } else if (e.name === 'w:rPr') inRPr++
      else if (e.name === 'w:tcPr') inTcPr = true
      else if (e.name === 'w:pPr') inPPr = true
      else if (inRPr && (s || inDefaults)) {
        // Eigenschaften einer Tabellen-Bedingung gelten nur dort, nicht für die Vorlage.
        if (inDefaults) rPrAnwenden(standard, e)
        else if (s && !bedingung) rPrAnwenden(s.rPr, e)
        else if (s && bedingung) {
          s.bedingtRPr ??= {}
          rPrAnwenden((s.bedingtRPr[bedingung] ??= {}), e)
        }
      } else if (s && e.name === 'w:shd') {
        const f = farbe(e.attr['w:fill'])
        if (f && f !== 'auto') {
          if (inTcPr && bedingung) s.bedingt = { ...(s.bedingt ?? {}), [bedingung]: f }
          else if (inTcPr) s.zelle = f
          else if (inPPr && !bedingung) s.pShd = f
        }
      }
    } else if (e.typ === 'zu') {
      if (e.name === 'w:rPrDefault') inDefaults = false
      else if (e.name === 'w:rPr') inRPr--
      else if (e.name === 'w:tcPr') inTcPr = false
      else if (e.name === 'w:pPr') inPPr = false
      else if (e.name === 'w:tblStylePr') bedingung = null
      else if (e.name === 'w:style' && s) {
        const ausName = s.name.match(/^heading\s*(\d)$/i)
        if (!s.ebene && ausName) s.ebene = Number(ausName[1])
        const toc = s.name.match(/^toc\s*(\d)$/i)
        if (toc) s.toc = Number(toc[1])
        if (s.id) stile.set(s.id, s)
        s = null
      }
    }
  }
  return { stile, standard, standardAbsatz, standardTabelle }
}

/** Eigenschaften einer Vorlage samt ihrer Basis-Kette (Basis zuerst). */
export function vorlageAufloesen(st: Stile, id: string | undefined): Laufeigenschaften & { _pShd?: string } {
  const kette: Stil[] = []
  const gesehen = new Set<string>()
  let x = id ? st.stile.get(id) : undefined
  // Zyklen in basedOn kommen in beschädigten Dateien vor — nicht endlos laufen.
  while (x && !gesehen.has(x.id)) {
    gesehen.add(x.id)
    kette.unshift(x)
    x = x.basedOn ? st.stile.get(x.basedOn) : undefined
  }
  const out: Laufeigenschaften & { _pShd?: string } = {}
  for (const k of kette) {
    Object.assign(out, k.rPr)
    if (k.pShd) out._pShd = k.pShd
  }
  return out
}

/** Ebene/TOC-Ebene einer Absatzvorlage, mit Vererbung. */
export function vorlageEbene(st: Stile, id: string | undefined): { ebene?: number; toc?: number; name?: string } {
  const gesehen = new Set<string>()
  let x = id ? st.stile.get(id) : undefined
  const name = x?.name
  while (x && !gesehen.has(x.id)) {
    gesehen.add(x.id)
    if (x.ebene || x.toc) return { ebene: x.ebene, toc: x.toc, name }
    x = x.basedOn ? st.stile.get(x.basedOn) : undefined
  }
  return { name }
}

/** Tabellenvorlage: Zellschattierung für eine Position, Bedingungen vor Gesamt. */
export function tabellenHintergrund(st: Stile, id: string | undefined, aktiv: Set<Bedingung>): string | undefined {
  const gesehen = new Set<string>()
  let x = id ? st.stile.get(id) : undefined
  // Rangfolge nach Word: Kopf-/Fußzeile vor erster/letzter Spalte vor Bändern
  // (Word wendet in umgekehrter Folge an; was später kommt, gewinnt).
  const reihenfolge: Bedingung[] = ['firstRow', 'lastRow', 'firstCol', 'lastCol', 'band1Horz', 'band2Horz']
  while (x && !gesehen.has(x.id)) {
    gesehen.add(x.id)
    for (const b of reihenfolge) if (aktiv.has(b) && x.bedingt?.[b]) return x.bedingt[b]
    if (x.zelle) return x.zelle
    x = x.basedOn ? st.stile.get(x.basedOn) : undefined
  }
  return undefined
}

/**
 * Zeichenformat aus einer Tabellenvorlage für eine Position: Grundformat der
 * Vorlage, darüber die zutreffenden Bedingungen (Bänder zuerst, Kopf/Fuß und
 * Ecken zuletzt — sie gewinnen).
 */
export function tabellenRPr(st: Stile, id: string | undefined, aktiv: Set<Bedingung>): Laufeigenschaften {
  const kette: Stil[] = []
  const gesehen = new Set<string>()
  let x = id ? st.stile.get(id) : undefined
  while (x && !gesehen.has(x.id)) {
    gesehen.add(x.id)
    kette.unshift(x)
    x = x.basedOn ? st.stile.get(x.basedOn) : undefined
  }
  const out: Laufeigenschaften = {}
  const reihenfolge: Bedingung[] = ['band1Horz', 'band2Horz', 'firstCol', 'lastCol', 'firstRow', 'lastRow']
  for (const k of kette) {
    Object.assign(out, k.rPr)
    for (const b of reihenfolge) if (aktiv.has(b) && k.bedingtRPr?.[b]) Object.assign(out, k.bedingtRPr[b])
  }
  return out
}
