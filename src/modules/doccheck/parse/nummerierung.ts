import { xmlEreignisse } from './xml'

/**
 * Automatische Nummerierung aus word/numbering.xml (Audit 11/2026, FRD-01).
 *
 * In Word-Handbüchern steht die Kapitelnummer meist NICHT im Text: Die
 * Formatvorlage „Heading 1" ist an eine Liste gebunden, und Word setzt
 * „1", „1.2", „(a)" erst beim Anzeigen davor. Wer nur w:t liest, bekommt
 * „General" statt „1 General" — und jeder Eintrag des Inhaltsverzeichnisses
 * (dessen Feldergebnis die Nummer als Text trägt) wird zum Fehlalarm,
 * Kapitelverweise lassen sich nicht prüfen, die Seitenzuordnung findet
 * keinen Anker. Deshalb wird hier nachgebildet, was Word zählt.
 */

export interface NumEbene {
  start: number
  /** w:numFmt — decimal, lowerLetter, upperRoman, bullet, none … */
  format: string
  /** w:lvlText mit Platzhaltern %1 … %9 */
  text: string
  /** Rechtsnummerierung: alle Ebenen dezimal („1.1" statt „I.a") */
  isLgl: boolean
  /** w:pStyle — die Vorlage, die an diese Ebene gebunden ist */
  pStyle?: string
  /** w:lvlRestart: 0 = nie neu beginnen, n = nach Ebene n (1-basiert) */
  neustart?: number
}

export interface NumInstanz {
  abstrakt: string
  /** w:lvlOverride je Ebene: neuer Startwert und/oder neue Ebene */
  ueberschrieben: Map<number, { start?: number; ebene?: Partial<NumEbene> }>
}

export interface NumDefinitionen {
  abstrakt: Map<string, Map<number, NumEbene>>
  instanzen: Map<string, NumInstanz>
  /**
   * Abstrakte Liste ohne eigene Ebenen, die auf eine Listenformatvorlage
   * verweist (w:numStyleLink) — die Ebenen stehen bei der Liste, an die
   * diese Vorlage gebunden ist.
   */
  vorlage: Map<string, string>
}

const ROEMISCH: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]

/** Ein Zählerwert in Words Zahlformat. Unbekannte Formate fallen auf dezimal zurück — eine Zahl ist besser als keine. */
export function zahlFormat(n: number, format: string): string {
  switch (format) {
    case 'none':
    case 'bullet':
      return ''
    case 'decimalZero':
      return n < 10 && n >= 0 ? `0${n}` : String(n)
    case 'lowerLetter':
    case 'upperLetter': {
      if (n < 1) return String(n)
      // Word zählt „z, aa, bb" — der Buchstabe wird wiederholt, nicht kombiniert.
      const b = String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1)
      return format === 'upperLetter' ? b.toUpperCase() : b
    }
    case 'lowerRoman':
    case 'upperRoman': {
      if (n < 1 || n > 3999) return String(n)
      let rest = n
      let r = ''
      for (const [w, z] of ROEMISCH) while (rest >= w) { r += z; rest -= w }
      return format === 'upperRoman' ? r.toUpperCase() : r
    }
    default:
      return String(n)
  }
}

export function nummerierungLesen(xml: string): NumDefinitionen {
  const abstrakt = new Map<string, Map<number, NumEbene>>()
  const instanzen = new Map<string, NumInstanz>()
  const vorlage = new Map<string, string>()
  let aktId = ''
  let aktAbstrakt: Map<number, NumEbene> | null = null
  let aktInstanz: NumInstanz | null = null
  let override: number | null = null
  let ebene: Partial<NumEbene> | null = null
  let ebeneNr = 0
  // Eigenschaften der Ebene stehen direkt in w:lvl — nicht in deren w:pPr/w:rPr.
  let tiefe = 0

  for (const e of xmlEreignisse(xml)) {
    if (e.typ === 'auf') {
      const val = e.attr['w:val']
      if (ebene) {
        if (tiefe === 0) {
          if (e.name === 'w:start') ebene.start = Number(val ?? 0)
          else if (e.name === 'w:numFmt') ebene.format = val ?? 'decimal'
          else if (e.name === 'w:lvlText') ebene.text = val ?? ''
          else if (e.name === 'w:isLgl') ebene.isLgl = val === undefined || !/^(0|false|off)$/i.test(val)
          else if (e.name === 'w:pStyle') ebene.pStyle = val
          else if (e.name === 'w:lvlRestart') ebene.neustart = Number(val ?? 0)
        }
        tiefe++
      } else if (e.name === 'w:abstractNum') {
        aktAbstrakt = new Map()
        aktId = e.attr['w:abstractNumId'] ?? ''
        abstrakt.set(aktId, aktAbstrakt)
      } else if (e.name === 'w:numStyleLink' && aktAbstrakt && val) vorlage.set(aktId, val)
      else if (e.name === 'w:num') {
        aktInstanz = { abstrakt: '', ueberschrieben: new Map() }
        instanzen.set(e.attr['w:numId'] ?? '', aktInstanz)
      } else if (e.name === 'w:abstractNumId' && aktInstanz) aktInstanz.abstrakt = val ?? ''
      else if (e.name === 'w:lvlOverride' && aktInstanz) {
        override = Number(e.attr['w:ilvl'] ?? 0)
        aktInstanz.ueberschrieben.set(override, {})
      } else if (e.name === 'w:startOverride' && aktInstanz && override !== null) aktInstanz.ueberschrieben.get(override)!.start = Number(val ?? 0)
      else if (e.name === 'w:lvl') {
        ebene = {}
        ebeneNr = Number(e.attr['w:ilvl'] ?? 0)
        tiefe = 0
      }
    } else if (e.typ === 'zu') {
      if (ebene && tiefe > 0) tiefe--
      else if (ebene) {
        if (aktInstanz && override !== null) aktInstanz.ueberschrieben.get(override)!.ebene = ebene
        else if (aktAbstrakt) aktAbstrakt.set(ebeneNr, { start: 1, format: 'decimal', text: '', isLgl: false, ...ebene })
        ebene = null
      } else if (e.name === 'w:abstractNum') aktAbstrakt = null
      else if (e.name === 'w:num') aktInstanz = null
      else if (e.name === 'w:lvlOverride') override = null
    }
  }
  return { abstrakt, instanzen, vorlage }
}

export interface Zaehler {
  /**
   * Nummerntext des nächsten Absatzes einer Liste — oder undefined (keine
   * Liste, numId 0, Aufzählungszeichen). `stil` dient nur dazu, die Ebene
   * zu finden, wenn weder Absatz noch Vorlage eine nennen (w:pStyle in w:lvl).
   */
  naechste(numId: string, ilvl?: number, stil?: string): string | undefined
}

/**
 * Zähler über ein ganzes Dokument. Gezählt wird je abstrakter Liste, nicht
 * je w:num: Word setzt zwei Instanzen derselben Liste FORT, solange keine
 * ein w:startOverride trägt — „Neu beginnen" schreibt Word genau als
 * solchen Override. Er greift beim ersten Absatz der Instanz.
 */
export function zaehlerAnlegen(defs: NumDefinitionen, listeDerVorlage: (stilId: string) => string | undefined = () => undefined): Zaehler {
  const stand = new Map<string, Map<number, number>>()
  const begonnen = new Set<string>()
  /**
   * Abstrakte Liste, deren Ebenen gelten. Bei einer Listenformatvorlage
   * (w:numStyleLink → Vorlage → w:numId → w:styleLink) liegen sie bei der
   * Liste der Vorlage — ohne diesen Schritt hatten so definierte Kapitel
   * keine Nummer, und das Verzeichnis meldete wieder jeden Eintrag.
   * Gezählt wird ebenfalls dort: Alle Listen derselben Vorlage zählen fort.
   */
  const wirksam = (abstrakt: string): string => {
    const stil = defs.vorlage.get(abstrakt)
    const ziel = stil ? defs.instanzen.get(listeDerVorlage(stil) ?? '')?.abstrakt : undefined
    return ziel !== undefined && ziel !== abstrakt && !defs.vorlage.has(ziel) ? ziel : abstrakt
  }
  return {
    naechste(numId, ilvl, stil) {
      if (!numId || numId === '0') return undefined
      const inst = defs.instanzen.get(numId)
      const liste = inst && wirksam(inst.abstrakt)
      const ebenen = liste !== undefined ? defs.abstrakt.get(liste) : undefined
      if (!inst || liste === undefined || !ebenen) return undefined
      const ebeneVon = (n: number): NumEbene | undefined => {
        const basis = ebenen.get(n)
        const o = inst.ueberschrieben.get(n)?.ebene
        return o ? { start: 1, format: 'decimal', text: '', isLgl: false, ...basis, ...o } : basis
      }
      let lvl = ilvl
      if (lvl === undefined && stil) for (const [n, e] of ebenen) if (e.pStyle === stil) lvl = n
      lvl ??= 0
      const def = ebeneVon(lvl)
      if (!def) return undefined
      const z = stand.get(liste) ?? new Map<number, number>()
      stand.set(liste, z)
      if (!begonnen.has(numId)) {
        begonnen.add(numId)
        for (const [n, o] of inst.ueberschrieben) {
          const s = o.start ?? o.ebene?.start
          if (s !== undefined) z.set(n, s - 1)
        }
      }
      z.set(lvl, (z.get(lvl) ?? def.start - 1) + 1)
      // Tiefere Ebenen beginnen nach einer höheren neu — außer lvlRestart sagt anderes.
      for (const n of [...z.keys()]) {
        if (n <= lvl) continue
        const r = ebeneVon(n)?.neustart
        if (r === undefined || (r > 0 && lvl + 1 <= r)) z.delete(n)
      }
      if (def.format === 'bullet' || !def.text) return undefined
      const text = def.text.replace(/%([1-9])/g, (_, k: string) => {
        const n = Number(k) - 1
        const e = ebeneVon(n)
        const wert = z.get(n) ?? (e ? e.start - 1 : 0)
        return zahlFormat(wert, def.isLgl ? 'decimal' : (e?.format ?? 'decimal'))
      })
      return text.trim() || undefined
    },
  }
}
