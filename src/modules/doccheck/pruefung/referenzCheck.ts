import { datumFinden } from '../parse/meta'
import { vergleichsform } from '../parse/seitenzuordnung'
import type { ReferenzListe } from '../referenz/liste'
import { ampelAus, type Befund, type Fundstelle } from './befund'
import { absaetze, befund, fundstelle, verwendeteAbkuerzungen, type PruefKontext } from './kontext'

/**
 * Prüfung gegen Referenzlisten (Excel/CSV/Markdown als Soll): Glossar,
 * Abkürzungsliste, Dokumentregister, Kennungen. Jede Abweichung wird ein
 * Befund im selben Gate — mit der Liste als Quelle, nicht mit einer
 * erfundenen Regel.
 */

export const REFERENZ_PUNKTE = ['glossar', 'abkuerzungsliste', 'register', 'kennungen'] as const

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Excel speichert Daten als Seriennummer (Tage seit 30.12.1899). */
export function excelDatum(s?: string): string | undefined {
  if (!s) return undefined
  if (/^\d{5}(\.\d+)?$/.test(s.trim())) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  return datumFinden(s)
}

/** Zahlenfolge einer Revisionsangabe — „Rev 2" und „Revision 2" sind dasselbe. */
export const revisionsZahlen = (s?: string) => (s?.match(/\d+(?:\.\d+)?/g) ?? []).map((x) => String(Number(x))).join('|')

/** Bauart einer Kennung: Großbuchstaben → A, Ziffern → 9, Rest bleibt. */
export function bauart(k: string): string {
  return k.replace(/[A-Z]/g, 'A').replace(/[a-z]/g, 'a').replace(/\d/g, '9')
}

function bauartRegex(b: string): RegExp {
  const teile = [...b].map((c) => (c === 'A' ? '[A-Z]' : c === 'a' ? '[a-z]' : c === '9' ? '\\d' : esc(c))).join('')
  return new RegExp(`(?<![\\w-])${teile}(?![\\w-])`, 'g')
}

export function referenzCheck(k: PruefKontext, listen: ReferenzListe[], dateiname = ''): { befunde: Omit<Befund, 'id'>[]; ampel: Record<string, 'ok' | 'wait' | 'bad' | 'na'> } {
  const out: Omit<Befund, 'id'>[] = []
  const alle = absaetze(k.roh)
  const na = REFERENZ_PUNKTE.filter((p) => !listen.some((l) => ({ glossar: 'glossar', abkuerzungsliste: 'abkuerzungen', register: 'register', kennungen: 'kennungen' })[p] === l.art))
  const quelle = (l: ReferenzListe) => `${l.name}${l.blatt ? ` / ${l.blatt}` : ''}`

  /* Glossar — Varianten statt Soll-Schreibweise */
  for (const l of listen) {
    if (l.art !== 'glossar') continue
    for (const e of l.eintraege) {
      const varianten = e.varianten.filter((v) => vergleichsform(v) && v.toLowerCase() !== e.soll.toLowerCase())
      if (!varianten.length) continue
      const re = new RegExp(`(?<![\\p{L}\\d-])(${varianten.map(esc).join('|')})(?![\\p{L}\\d-])`, 'giu')
      const fs: Fundstelle[] = []
      const gefunden = new Set<string>()
      for (const a of alle) for (const m of a.text.matchAll(re)) {
        gefunden.add(m[1])
        fs.push(fundstelle(a, `${m[1]} — ${a.text}`))
      }
      if (fs.length) {
        out.push(befund(k, { quelle: 'referenz', pruefpunkt: 'glossar', kategorie: 'Editorial', prioritaet: 'Low', text: `Use "${e.soll}" instead of ${[...gefunden].map((g) => `"${g}"`).join(', ')} (${fs.length} occurrence(s); glossary ${quelle(l)}${e.quelle ? `, source: ${e.quelle}` : ''}).`, fundstellen: fs, anleitung: 'glossar' }))
      }
    }
  }

  /* Abkürzungsliste — benutzt, aber nicht in der Referenz */
  const abkListen = listen.filter((l): l is Extract<ReferenzListe, { art: 'abkuerzungen' }> => l.art === 'abkuerzungen')
  if (abkListen.length) {
    const bekannt = new Set(abkListen.flatMap((l) => l.eintraege.map((e) => e.abk.trim())))
    const fehlt = [...verwendeteAbkuerzungen(k.roh)].filter(([a]) => !bekannt.has(a))
    if (fehlt.length) out.push(befund(k, { quelle: 'referenz', pruefpunkt: 'abkuerzungsliste', kategorie: 'Editorial', prioritaet: 'Low', text: `${fehlt.length} abbreviation(s) used that are not in the reference list (${abkListen.map(quelle).join(', ')}).`, fundstellen: fehlt.map(([a, s]) => ({ seite: s, auszug: a })), anleitung: 'abkuerzungsliste' }))
  }

  /* Dokumentregister — erwartete Revision und erwartetes Datum */
  for (const l of listen) {
    if (l.art !== 'register') continue
    const kennzeichen = [k.meta.nummer, k.meta.titel, k.dokName, dateiname].filter(Boolean).map((x) => vergleichsform(x!))
    const treffer = l.eintraege.find((e) => {
      const f = vergleichsform(e.dokument)
      return f.length >= 3 && kennzeichen.some((x) => x === f || x.includes(f))
    })
    if (!treffer) {
      out.push(befund(k, { quelle: 'referenz', pruefpunkt: 'register', kategorie: 'Document Control', prioritaet: 'Low', text: `Document not found in the document register ${quelle(l)}.`, fundstellen: [{ ort: quelle(l), auszug: [k.meta.nummer, k.meta.titel].filter(Boolean).join(' · ') || dateiname }], anleitung: 'register' }))
      continue
    }
    const fs: Fundstelle[] = []
    if (treffer.revision && revisionsZahlen(treffer.revision) !== revisionsZahlen(k.meta.revision)) fs.push({ ort: quelle(l), auszug: `Revision: register "${treffer.revision}", document "${k.meta.revision ?? '—'}"` })
    const soll = excelDatum(treffer.datum)
    if (soll && soll !== k.meta.datum) fs.push({ ort: quelle(l), auszug: `Date: register ${soll}, document ${k.meta.datum ?? '—'}` })
    if (fs.length) out.push(befund(k, { quelle: 'referenz', pruefpunkt: 'register', kategorie: 'Document Control', prioritaet: 'Medium', text: `Revision or date does not match the document register entry "${treffer.dokument}".`, fundstellen: fs, anleitung: 'register' }))
  }

  /* Kennungen — gleiche Bauart, aber nicht in der Liste */
  const kenn = listen.filter((l): l is Extract<ReferenzListe, { art: 'kennungen' }> => l.art === 'kennungen')
  if (kenn.length) {
    const bekannt = new Set(kenn.flatMap((l) => l.eintraege.map((e) => e.kennung.trim())))
    // Nur Bauarten mit Ziffern UND Buchstaben — „1" oder „AB" fände überall etwas.
    const bauarten = [...new Set([...bekannt].map(bauart))].filter((b) => /9/.test(b) && /[Aa]/.test(b))
    const fs: Fundstelle[] = []
    for (const b of bauarten) {
      const re = bauartRegex(b)
      for (const a of alle) for (const m of a.text.matchAll(re)) if (!bekannt.has(m[0])) fs.push(fundstelle(a, `${m[0]} — ${a.text}`))
    }
    if (fs.length) out.push(befund(k, { quelle: 'referenz', pruefpunkt: 'kennungen', kategorie: 'Inconsistency', prioritaet: 'Medium', text: `${fs.length} identifier(s) not found in the reference list (${kenn.map(quelle).join(', ')}).`, fundstellen: fs, anleitung: 'kennungen' }))
  }

  return { befunde: out, ampel: ampelAus([...REFERENZ_PUNKTE], out as Befund[], na) }
}
