import type { OutlineNode } from './model'

/**
 * Abschnittspfad für Seiten ohne eingebettete Gliederung.
 *
 * Erkannt werden nummerierte Überschriften („2", „2.4", „2.4.1" gefolgt von
 * einem großgeschriebenen Wort) in kurzen Zeilen. Lange Zeilen sind
 * Fließtext, auch wenn sie mit einer Zahl beginnen („2 engines are …").
 */
const UEBERSCHRIFT = /^((?:\d{1,2})(?:\.\d{1,2}){0,3})\.?\s+([A-ZÄÖÜ][^\n]{1,78})$/

export function ueberschrift(zeile: string): { nummer: string; titel: string; ebene: number } | null {
  const z = zeile.trim()
  if (z.length > 90 || z.includes(' | ')) return null
  const m = z.match(UEBERSCHRIFT)
  if (!m) return null
  // Satzende spricht gegen eine Überschrift — „2 Engines are installed."
  if (/[.;:,]$/.test(m[2])) return null
  // Mindestens ein Wort mit drei Buchstaben — „10 FT" ist eine Angabe, keine
  // Überschrift.
  if (!/[A-Za-zÄÖÜäöü]{3}/.test(m[2])) return null
  return { nummer: m[1], titel: `${m[1]} ${m[2]}`.trim(), ebene: m[1].split('.').length }
}

/**
 * Läuft über alle Seiten und liefert je Seite den Pfad, der am Seitenanfang
 * gilt bzw. auf der Seite zuletzt begonnen hat — dazu die Gliederung.
 */
export function abschnittsPfade(seitenTexte: string[]): { pfade: string[][]; outline: OutlineNode[] } {
  let pfad: string[] = []
  const outline: OutlineNode[] = []
  const pfade = seitenTexte.map((text, i) => {
    for (const zeile of text.split('\n')) {
      const u = ueberschrift(zeile)
      if (!u) continue
      pfad = [...pfad.slice(0, u.ebene - 1), u.titel]
      outline.push({ titel: u.titel, ebene: u.ebene, vonSeite: i + 1 })
    }
    return [...pfad]
  })
  return { pfade, outline }
}
