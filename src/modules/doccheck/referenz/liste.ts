import { vergleichsform } from '../parse/seitenzuordnung'

/**
 * Referenzlisten als Soll: Excel, CSV oder Markdown-Tabelle mit einer
 * Kopfzeile. Welche Art von Liste es ist, sagen die Spaltenköpfe — erkannt
 * werden deutsche und englische Bezeichnungen. Nicht erkannt heißt: Der
 * Nutzer wählt die Art und die Spalten selbst, statt dass geraten wird.
 */

export type ListenArt = 'glossar' | 'abkuerzungen' | 'register' | 'kennungen'

export interface GlossarEintrag { soll: string; varianten: string[]; hinweis?: string; quelle?: string }
export interface AbkEintrag { abk: string; bedeutung: string }
export interface RegisterEintrag { dokument: string; revision?: string; datum?: string }
export interface KennungEintrag { kennung: string; bezeichnung?: string }

export type Eintraege =
  | { art: 'glossar'; eintraege: GlossarEintrag[] }
  | { art: 'abkuerzungen'; eintraege: AbkEintrag[] }
  | { art: 'register'; eintraege: RegisterEintrag[] }
  | { art: 'kennungen'; eintraege: KennungEintrag[] }

export type ReferenzListe = { id: string; name: string; blatt?: string } & Eintraege

/** Spalten je Art: Rolle → Synonyme (Vergleichsform). Die erste Rolle ist Pflicht. */
export const SPALTEN: Record<ListenArt, Record<string, string[]>> = {
  glossar: {
    soll: ['sollschreibweise', 'soll', 'preferred', 'preferredterm', 'term', 'correct', 'correctspelling', 'begriff'],
    varianten: ['zuvermeidendevarianten', 'varianten', 'avoid', 'variants', 'incorrect', 'donotuse', 'notpreferred'],
    hinweis: ['hinweis', 'note', 'notes', 'remark', 'bemerkung'],
    quelle: ['quelle', 'source', 'reference', 'referenz'],
  },
  abkuerzungen: {
    abk: ['abkuerzung', 'abkürzung', 'abbreviation', 'acronym', 'abbr', 'kurzform'],
    bedeutung: ['bedeutung', 'meaning', 'definition', 'expansion', 'langform', 'description', 'beschreibung'],
  },
  register: {
    dokument: ['dokument', 'document', 'docno', 'documentnumber', 'dokumentnummer', 'nummer', 'number', 'manual', 'titel', 'title'],
    revision: ['revision', 'rev', 'edition', 'issue', 'ausgabe', 'stand'],
    datum: ['datum', 'date', 'effective', 'effectivedate', 'gueltigab', 'gültigab', 'issuedate'],
  },
  kennungen: {
    kennung: ['kennung', 'identifier', 'id', 'device', 'deviceid', 'registration', 'sn', 'serialnumber', 'serial', 'geraet', 'gerät', 'fstd', 'qualificationnumber'],
    bezeichnung: ['bezeichnung', 'name', 'designation', 'description', 'beschreibung', 'type', 'typ'],
  },
}

/** Ordnet Kopfzeilen-Zellen den Rollen einer Art zu. */
export function zuordnen(kopf: string[], art: ListenArt): Record<string, number> | null {
  const formen = kopf.map(vergleichsform)
  const out: Record<string, number> = {}
  for (const [rolle, syn] of Object.entries(SPALTEN[art])) {
    const i = formen.findIndex((f, k) => f && syn.includes(f) && !Object.values(out).includes(k))
    if (i >= 0) out[rolle] = i
  }
  const pflicht = Object.keys(SPALTEN[art])[0]
  return pflicht in out ? out : null
}

/**
 * Art erkennen: die Art mit den meisten zugeordneten Spalten. Ein Register
 * braucht neben dem Dokument auch Revision oder Datum — sonst wäre jede
 * Liste mit einer Spalte „Titel" ein Register.
 */
export function artErkennen(kopf: string[]): { art: ListenArt; spalten: Record<string, number> } | null {
  const kandidaten = (Object.keys(SPALTEN) as ListenArt[])
    .map((art) => ({ art, spalten: zuordnen(kopf, art) }))
    .filter((k): k is { art: ListenArt; spalten: Record<string, number> } => k.spalten !== null)
    .filter((k) => k.art !== 'register' || 'revision' in k.spalten || 'datum' in k.spalten)
    .filter((k) => k.art !== 'abkuerzungen' || 'bedeutung' in k.spalten)
  return kandidaten.sort((a, b) => Object.keys(b.spalten).length - Object.keys(a.spalten).length)[0] ?? null
}

/** Erste Zeile mit mindestens einem erkannten Kopf; davor stehen oft Titelzeilen. */
export function kopfzeile(zeilen: string[][]): number {
  const i = zeilen.slice(0, 10).findIndex((z) => artErkennen(z) !== null)
  return i < 0 ? 0 : i
}

const teilen = (s?: string) => (s ?? '').split(/[;,/\n]|\s+\|\s+/).map((x) => x.trim()).filter(Boolean)

export function listeAusTabelle(name: string, zeilen: string[][], vorgabe?: ListenArt, blatt?: string): ReferenzListe | null {
  const k = kopfzeile(zeilen)
  const kopf = zeilen[k] ?? []
  const erkannt = vorgabe ? { art: vorgabe, spalten: zuordnen(kopf, vorgabe) } : artErkennen(kopf)
  if (!erkannt?.spalten) return null
  const { art, spalten } = erkannt
  const daten = zeilen.slice(k + 1).filter((z) => z.some((x) => x?.trim()))
  const zelle = (z: string[], rolle: string) => (spalten[rolle] !== undefined ? (z[spalten[rolle]] ?? '').trim() : '')
  const id = `ref-${vergleichsform(name)}-${blatt ? vergleichsform(blatt) : ''}`
  const basis = { id, name, ...(blatt ? { blatt } : {}) }
  switch (art) {
    case 'glossar':
      return { ...basis, art, eintraege: daten.map((z) => ({ soll: zelle(z, 'soll'), varianten: teilen(zelle(z, 'varianten')), ...(zelle(z, 'hinweis') ? { hinweis: zelle(z, 'hinweis') } : {}), ...(zelle(z, 'quelle') ? { quelle: zelle(z, 'quelle') } : {}) })).filter((e) => e.soll) }
    case 'abkuerzungen':
      return { ...basis, art, eintraege: daten.map((z) => ({ abk: zelle(z, 'abk'), bedeutung: zelle(z, 'bedeutung') })).filter((e) => e.abk) }
    case 'register':
      return { ...basis, art, eintraege: daten.map((z) => ({ dokument: zelle(z, 'dokument'), ...(zelle(z, 'revision') ? { revision: zelle(z, 'revision') } : {}), ...(zelle(z, 'datum') ? { datum: zelle(z, 'datum') } : {}) })).filter((e) => e.dokument) }
    case 'kennungen':
      return { ...basis, art, eintraege: daten.map((z) => ({ kennung: zelle(z, 'kennung'), ...(zelle(z, 'bezeichnung') ? { bezeichnung: zelle(z, 'bezeichnung') } : {}) })).filter((e) => e.kennung) }
  }
}

/** CSV mit Komma, Semikolon oder Tab; Anführungszeichen nach RFC 4180. */
export function csvLesen(text: string): string[][] {
  const erste = text.split(/\r?\n/)[0] ?? ''
  const trenner = [';', '\t', ','].sort((a, b) => erste.split(b).length - erste.split(a).length)[0]
  const zeilen: string[][] = []
  let z: string[] = []
  let feld = ''
  let inQ = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') { feld += '"'; i++ }
      else if (c === '"') inQ = false
      else feld += c
    } else if (c === '"') inQ = true
    else if (c === trenner) { z.push(feld.trim()); feld = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      z.push(feld.trim())
      if (z.some(Boolean)) zeilen.push(z)
      z = []
      feld = ''
    } else feld += c
  }
  z.push(feld.trim())
  if (z.some(Boolean)) zeilen.push(z)
  return zeilen
}

/** Markdown-Tabelle („| a | b |"), Trennzeile wird übersprungen. */
export function mdTabelle(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((z) => z.trim().startsWith('|'))
    .filter((z) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(z))
    .map((z) => z.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim()))
}
