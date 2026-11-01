import type { DocPage, OutlineNode } from '../parse/model'
import { ampelAus, type Ampel, type Befund } from './befund'
import { befund, type PruefKontext } from './kontext'

/**
 * Verweise (Nachtrag N7). Erkannt werden Verweise der Form „TM 1.11.2",
 * „refer to TM … chapter 1.5", „APX 5, Chapter 4", „Annex 9", „OMM 3.3.8",
 * „see 1.4.1.1", „exercise 3.8.3.5".
 *
 * Aufgeteilt nach Zuständigkeit, damit nichts doppelt gemeldet wird:
 * - interne Kapitelverweise („see chapter 7") prüft weiterhin die
 *   Formalprüfung (v1.1 Kap. 8.8, Prüfpunkt „querverweise") — zwei Regeln für
 *   dieselbe Sache liefen auseinander;
 * - hier, je Dokument: Übungsnummern aus Referenzlisten und Zirkelverweise;
 * - in der Paketprüfung: alle Verweise auf ein ANDERES Dokument.
 *
 * Ob ein Kapitel zum Kontext passt (Verweis „Grading" zeigt auf
 * „Standardisation"), kann nur die KI beurteilen — das folgt mit der
 * Prüf-Engine.
 */

export const VERWEIS_PUNKTE = ['uebung', 'zirkel'] as const

export interface Verweis {
  /** Dokumentnennung wie im Text („APX 5", „Annex 9", „OMM") — fehlt bei internen Verweisen */
  dok?: string
  nummer?: string
  uebung: boolean
  text: string
  zeile: string
  seite: string
}

const PREFIX = String.raw`(TM|OMM|OM[- ]?[A-D]|(?:APX|Appendix|ANX|Annex|Anhang|Anlage)\s*\d+[A-Z]?)`
const SCHLUESSEL = String.raw`(chapter|chap\.|ch\.|section|sect\.|paragraph|para\.?|exercise|ex\.|kapitel|abschnitt|übung)`
const NUMMER = String.raw`(\d+(?:\.\d+)*)`
const RE = new RegExp(String.raw`\b${PREFIX}\b(?:,?\s*${SCHLUESSEL}?\s*${NUMMER})?|\b(see|refer to|siehe|according to|in accordance with|iaw|gemäß)\s+(?:${SCHLUESSEL}\s+)?${NUMMER}|\b${SCHLUESSEL}\s+${NUMMER}`, 'giu')

const UEBUNG = /^(exercise|ex\.|übung)$/i
/** Jahreszahlen und Daten sind keine Kapitel („01.11.2026"). */
const datumAehnlich = (n: string) => n.split('.').some((t) => t.length === 4)

export function verweiseIn(zeile: string, seite = ''): Verweis[] {
  const out: Verweis[] = []
  for (const m of zeile.matchAll(RE)) {
    const [text, pre, k1, n1, , k2, n2, k3, n3] = m
    if (pre) {
      // „tm" in Kleinschreibung ist kein Training Manual
      if (/^tm$/i.test(pre) && pre !== 'TM') continue
      // Zahl direkt hinter dem Kürzel nur mit Punkt oder Schlüsselwort („TM 1.11.2", „APX 5, chapter 4")
      const nummer = n1 && (k1 || n1.includes('.')) && !datumAehnlich(n1) ? n1 : undefined
      out.push({ dok: pre.replace(/\s+/g, ' '), ...(nummer ? { nummer } : {}), uebung: UEBUNG.test(k1 ?? ''), text: nummer ? text : pre, zeile, seite })
    } else {
      const n = n2 ?? n3
      const k = k2 ?? k3
      // „see 4" ohne Schlüsselwort ist zu unsicher; „chapter 4" nicht
      if (!n || datumAehnlich(n) || (!k && !n.includes('.'))) continue
      out.push({ nummer: n, uebung: UEBUNG.test(k ?? ''), text, zeile, seite })
    }
  }
  return out
}

/* ----------------------------- Zielmengen ----------------------------- */

const NUMMERIERT = /^(\d+(?:\.\d+)*)\.?\s+\S/

/**
 * Vorhandene Kapitelnummern: aus der Gliederung UND aus nummerierten
 * Absätzen — viele Handbücher nummerieren Absätze („1.4.1.1 The PIC …"),
 * ohne sie als Überschrift zu formatieren. Nur die Gliederung zu nehmen
 * hieße, jeden Verweis auf einen solchen Absatz als kaputt zu melden.
 */
export function kapitelNummern(pages: DocPage[], outline: Pick<OutlineNode, 'titel'>[]): Set<string> {
  const s = new Set<string>()
  for (const o of outline) {
    const n = o.titel.match(NUMMERIERT)?.[1]
    if (n) s.add(n)
  }
  for (const p of pages)
    for (const z of p.text.split('\n')) {
      const n = z.includes(' | ') ? null : z.match(NUMMERIERT)?.[1]
      if (n && n.includes('.') && !datumAehnlich(n)) s.add(n)
    }
  return s
}

/** Übungsnummern aus Referenzlisten: Tabellenzeilen, deren erste Zelle eine Nummer mit ≥ 3 Teilen ist. */
export function uebungsNummern(pages: DocPage[]): Set<string> {
  const s = new Set<string>()
  for (const p of pages)
    for (const z of p.text.split('\n')) {
      const erste = z.includes(' | ') ? z.split(' | ')[0].trim() : ''
      if (/^\d+(?:\.\d+){2,}$/.test(erste)) s.add(erste)
    }
  return s
}

/** Existiert die Nummer? Kapitel „1" gilt, wenn es „1" oder „1.x" gibt. */
export function vorhanden(n: string, kapitel: Set<string>, uebungen: Set<string>): boolean {
  if (uebungen.has(n)) return true
  for (const k of kapitel) if (k === n || k.startsWith(`${n}.`)) return true
  return false
}

/* ---------------------------- Abschnitte ------------------------------ */

export interface Abschnitt {
  nummer: string
  titel: string
  text: string
}

/** Abschnitte entlang der Gliederung — für die Zirkelverweise. */
export function abschnitte(pages: DocPage[], outline: Pick<OutlineNode, 'titel'>[]): Abschnitt[] {
  const titel = new Set(outline.map((o) => o.titel.trim()))
  const out: Abschnitt[] = []
  let akt: Abschnitt | null = null
  for (const p of pages)
    for (const z of p.text.split('\n')) {
      const t = z.trim()
      if (titel.has(t)) {
        const n = t.match(NUMMERIERT)?.[1]
        akt = n ? { nummer: n, titel: t, text: '' } : null
        if (akt) out.push(akt)
      } else if (akt && t) akt.text += `${t}\n`
    }
  return out
}

/** Ein „leerer" Abschnitt: kurz und nichts als genau ein Verweis — Kante im Verweisgraphen. */
export function nurVerweis(a: Abschnitt): Verweis | null {
  const woerter = a.text.split(/\s+/).filter(Boolean).length
  if (woerter > 25) return null
  const v = a.text.split('\n').flatMap((z) => verweiseIn(z)).filter((x) => x.nummer)
  return v.length === 1 ? v[0] : null
}

/** Kreise in einem Graphen Knoten → Knoten (höchstens ein Nachfolger je Knoten). */
export function kreise(kanten: Map<string, string>): string[][] {
  const gesehen = new Set<string>()
  const out: string[][] = []
  for (const start of kanten.keys()) {
    if (gesehen.has(start)) continue
    const weg: string[] = []
    let k: string | undefined = start
    while (k && !gesehen.has(k) && !weg.includes(k)) {
      weg.push(k)
      k = kanten.get(k)
    }
    if (k && weg.includes(k)) out.push(weg.slice(weg.indexOf(k)))
    weg.forEach((w) => gesehen.add(w))
  }
  return out
}

/* ------------------------- Prüfung je Dokument ------------------------- */

export function verweisPruefung(k: PruefKontext): { befunde: Omit<Befund, 'id'>[]; ampel: Record<string, Ampel> } {
  const { pages, outline } = k.roh
  const kap = kapitelNummern(pages, outline)
  const ueb = uebungsNummern(pages)
  const befunde: Omit<Befund, 'id'>[] = []
  if (ueb.size) {
    for (const p of pages)
      for (const z of p.text.split('\n'))
        for (const v of verweiseIn(z, p.label ?? String(p.index))) {
          // Nur Übungsverweise — Kapitelverweise gehören der Formalprüfung
          if (v.dok || !v.nummer || !v.uebung || vorhanden(v.nummer, kap, ueb)) continue
          befunde.push(befund(k, { quelle: 'verweis', pruefpunkt: 'uebung', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Reference to exercise ${v.nummer} — no such exercise in the reference list of this document.`, fundstellen: [{ seite: v.seite, auszug: z.trim() }] }))
        }
  }
  // Zirkel innerhalb des Dokuments: A verweist nur auf B, B nur auf A
  const kanten = new Map<string, string>()
  for (const a of abschnitte(pages, outline)) {
    const v = nurVerweis(a)
    if (v && !v.dok) kanten.set(a.nummer, v.nummer!)
  }
  for (const kreis of kreise(kanten)) {
    befunde.push(befund(k, { quelle: 'verweis', pruefpunkt: 'zirkel', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `Circular reference without content: ${[...kreis, kreis[0]].join(' → ')}.`, fundstellen: kreis.map((n) => ({ ort: n, auszug: abschnitte(pages, outline).find((a) => a.nummer === n)!.text.trim() })) }))
  }
  const na = [...(!ueb.size ? ['uebung'] : []), ...(!outline.length ? ['zirkel'] : [])]
  return { befunde, ampel: ampelAus([...VERWEIS_PUNKTE], befunde as Befund[], na) }
}
