import { vergleichsform } from '../parse/seitenzuordnung'
import type { Zuordnung } from './fremdliste'
import type { WerteZuordnung } from './rueckschreiben'

/**
 * Listenprofile (N3.1 Schritt 2): Die bestätigte Spaltenzuordnung wird
 * gemerkt und beim nächsten Import DERSELBEN Liste wieder verwendet.
 * Erkannt wird die Liste an ihrer Kopfzeile. Gespeichert wird nur die
 * Zuordnung (Spaltennummern), kein Inhalt der Liste.
 *
 * Auch die Kopfzeile selbst steht nur als Prüfsumme darin: Vorher war ihr
 * Text der Schlüssel, und bei einer Liste ohne Kopfzeile galt die erste
 * Befundzeile als Kopf — ihr Text blieb unbegrenzt im Browser, über das
 * Abmelden hinaus (Audit 11/2026, SEC-02). Eine Datenzeile kann auch künftig
 * wie ein Kopf aussehen („Issue … | Action …"); mit der Prüfsumme ist das
 * kein Leck mehr. Alte Klartext-Schlüssel werden noch gelesen und beim
 * Öffnen von DocCheck umgeschrieben (`profileBereinigen`).
 *
 * Ohne Backend liegt das Profil im Browser (localStorage); mit Phase 1b
 * wandert es in `list_profiles`.
 */

export const PROFIL_KEY = 'dc-listenprofile'
/** Werte-Mapping DocCheck-Status → Werte der Fremdliste (Nachtrag Kap. 18) — eigener Schlüssel, damit alte Profile gültig bleiben. */
export const WERTE_KEY = 'dc-werteprofile'

export function signatur(kopf: string[]): string {
  return kopf.map(vergleichsform).join('|')
}

/**
 * Schlüssel eines Profils: Prüfsumme der Signatur (FNV-1a in zwei 32-Bit-
 * Bahnen, 64 Bit). Eine Verwechslung zweier Listen hieße nur: Die Zuordnung
 * der anderen wird VORGESCHLAGEN — bestätigt wird sie ohnehin von Hand.
 * „#" kommt in einer Signatur nie vor (`vergleichsform` lässt nur Buchstaben
 * und Ziffern stehen), alte Klartext-Schlüssel sind daran zu unterscheiden.
 */
export function profilSchluessel(kopf: string[]): string {
  const sig = signatur(kopf)
  let a = 0x811c9dc5
  let b = 0x050c5d1f
  for (let i = 0; i < sig.length; i++) {
    const c = sig.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995)
  }
  return `#${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

type Ablage = Pick<Storage, 'getItem' | 'setItem'>

function alle<T = Zuordnung>(ablage: Ablage, key = PROFIL_KEY): Record<string, T> {
  try {
    const v: unknown = JSON.parse(ablage.getItem(key) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {}
  } catch {
    return {}
  }
}

function laden<T>(kopf: string[], ablage: Ablage, key: string): T | null {
  const m = alle<T>(ablage, key)
  return m[profilSchluessel(kopf)] ?? m[signatur(kopf)] ?? null
}

/** Alte Klartext-Schlüssel (Signatur der Kopfzeile) als Prüfsumme — „#" kommt in einer Signatur nie vor. */
function umgeschrieben<T>(m: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(m).map(([k, v]): [string, T] => [k.startsWith('#') ? k : profilSchluessel(k.split('|')), v]))
}

/** Speichert unter der Prüfsumme und schreibt dabei alte Klartext-Schlüssel um — danach steht kein Kopftext mehr in der Ablage. */
function speichern<T>(kopf: string[], wert: T, ablage: Ablage, key: string): void {
  try {
    ablage.setItem(key, JSON.stringify({ ...umgeschrieben(alle<T>(ablage, key)), [profilSchluessel(kopf)]: wert }))
  } catch {
    /* voller oder gesperrter Speicher: dann eben ohne Profil */
  }
}

/**
 * Alte Klartext-Schlüssel umschreiben, ohne etwas zu speichern — beim
 * Öffnen von DocCheck. Erst beim nächsten Speichern hätte gereicht, wer
 * danach noch einen Re-Check macht; alle anderen behielten den Text einer
 * Befundzeile für immer im Browser (Gegenprüfung Audit 11/2026, SEC-02).
 */
export function profileBereinigen(ablage: Ablage): void {
  for (const key of [PROFIL_KEY, WERTE_KEY]) {
    const m = alle<unknown>(ablage, key)
    if (Object.keys(m).every((k) => k.startsWith('#'))) continue
    try {
      ablage.setItem(key, JSON.stringify(umgeschrieben(m)))
    } catch {
      /* gesperrter Speicher: dann bleibt es beim nächsten Versuch */
    }
  }
}

export function profilLaden(kopf: string[], ablage: Ablage): Zuordnung | null {
  return laden<Zuordnung>(kopf, ablage, PROFIL_KEY)
}

export function profilSpeichern(kopf: string[], z: Zuordnung, ablage: Ablage): void {
  speichern(kopf, z, ablage, PROFIL_KEY)
}

export function werteLaden(kopf: string[], ablage: Ablage): WerteZuordnung | null {
  return laden<WerteZuordnung>(kopf, ablage, WERTE_KEY)
}

export function werteSpeichern(kopf: string[], w: WerteZuordnung, ablage: Ablage): void {
  speichern(kopf, w, ablage, WERTE_KEY)
}
