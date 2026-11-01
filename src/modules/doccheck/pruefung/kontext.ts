import regelnJson from '../config/formal-rules.json'
import type { ErkannteMeta } from '../parse/meta'
import type { Rohdokument, WortOrt } from '../parse/model'
import { vergleichsform } from '../parse/seitenzuordnung'
import type { Befund, Fundstelle } from './befund'

/**
 * Was alle regelbasierten Prüfungen brauchen: das gelesene Dokument, seine
 * erkannten Metadaten, den Dateinamen und die Regeln aus
 * config/formal-rules.json — plus zwei Helfer, die jede Prüfung sonst selbst
 * schriebe: Befund bauen und eine Textstelle ihrer Seite zuordnen.
 */

export type Regeln = typeof regelnJson
export const REGELN: Regeln = regelnJson

export interface PruefKontext {
  dokId: string
  dokName: string
  roh: Rohdokument
  meta: ErkannteMeta
  regeln: Regeln
}

/** Höchstzahl Fundstellen je Befund — mehr liest niemand, der Rest steht als Zahl im Text. */
export const MAX_FUNDSTELLEN = 25

export function befund(k: PruefKontext, b: Omit<Befund, 'id' | 'dokId' | 'dokName' | 'verifizierung' | 'status'>): Omit<Befund, 'id'> {
  return { ...b, fundstellen: b.fundstellen.slice(0, MAX_FUNDSTELLEN), dokId: k.dokId, dokName: k.dokName, verifizierung: 'Verified (rule-based)', status: 'Open' }
}

/** Seitenbezeichnung einer Seite: gedruckt, sonst die Nummer. */
export function seitenName(p: { index: number; label?: string }): string {
  return p.label ?? String(p.index)
}

/** Findet die Seite, auf der ein Text steht (Vergleichsform, erste 40 Zeichen). */
export function seiteFinder(roh: Rohdokument): (text: string) => string | undefined {
  const formen = roh.pages.map((p) => vergleichsform(p.text))
  return (text) => {
    const f = vergleichsform(text).slice(0, 40)
    if (f.length < 4) return undefined
    const i = formen.findIndex((x) => x.includes(f))
    return i >= 0 ? seitenName(roh.pages[i]) : undefined
  }
}

export interface PruefAbsatz {
  text: string
  seite?: string
  ort?: string
  wortOrt?: WortOrt
}

/**
 * Absätze in Lesereihenfolge für alle Formate. DOCX: echte Absätze inkl.
 * Textfelder, Tabellenzellen, Kopf-/Fußzeilen. PDF/XLSX: Zeilen der Seiten.
 */
export function absaetze(roh: Rohdokument): PruefAbsatz[] {
  if (roh.word) {
    const seite = seiteFinder(roh)
    return roh.word.absaetze
      .filter((a) => a.text.trim())
      .map((a) => ({
        text: a.text.replace(/\s+/g, ' ').trim(),
        seite: a.ort === 'body' || a.ort === 'textfeld' ? seite(a.text) : undefined,
        ort: a.ort === 'kopf' ? `Header (${a.teil.replace('word/', '')})` : a.ort === 'fuss' ? `Footer (${a.teil.replace('word/', '')})` : a.ort === 'textfeld' ? 'Text box' : a.tabelle ? `Table row ${a.tabelle.zeile + 1}, column ${a.tabelle.spalte + 1}` : undefined,
        wortOrt: a.ort,
      }))
  }
  return roh.pages.flatMap((p) =>
    p.text
      .split('\n')
      .filter((z) => z.trim())
      .map((z) => ({ text: z.trim(), seite: seitenName(p), ...(roh.format === 'xlsx' ? { ort: `Sheet ${p.label ?? p.index}` } : {}) })),
  )
}

export function kurz(s: string, n = 120): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export function fundstelle(a: PruefAbsatz, auszug = a.text): Fundstelle {
  return { ...(a.seite ? { seite: a.seite } : {}), ...(a.ort ? { ort: a.ort } : {}), auszug: kurz(auszug) }
}

const EINHEITEN = new Set(['KIAS', 'KTAS', 'KCAS', 'KT', 'FT', 'NM', 'LBS', 'KG', 'PSI', 'HPA', 'FPM', 'RPM', 'VDC', 'VAC', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII'])

/**
 * Im Text benutzte Abkürzungen mit der ersten Seite ihres Auftretens.
 * EINE Regel für Formalprüfung und Referenzliste: CAS-Meldungen (zwei und
 * mehr Großbuchstaben-Wörter in Folge), Einheiten und römische Zahlen
 * zählen nicht.
 */
export function verwendeteAbkuerzungen(roh: Rohdokument, ausgenommen: Set<number> = new Set()): Map<string, string> {
  const verwendet = new Map<string, string>()
  roh.pages.forEach((p, i) => {
    if (ausgenommen.has(i)) return
    const ohneCas = p.text.replace(/\b[A-Z0-9]{2,}(?:\s+[A-Z0-9]{1,}){1,}\b/g, ' ')
    // Teile von Kennungen (SBX-REF-01, AT-FFS-0199) sind keine Abkürzungen.
    for (const m of ohneCas.matchAll(/(?<![\w-])[A-Z][A-Z0-9]{1,5}(?![\w-])/g)) {
      const t = m[0]
      if (EINHEITEN.has(t) || !/[A-Z]{2}/.test(t)) continue
      if (!verwendet.has(t)) verwendet.set(t, seitenName(p))
    }
  })
  return verwendet
}

/** Editierabstand (Levenshtein) — für Tippfehler zwischen Geschwistern und die nächstliegende Regel-ID. */
export function editierabstand(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

