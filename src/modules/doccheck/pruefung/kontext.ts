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
