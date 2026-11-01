import { vergleichsform } from '../parse/seitenzuordnung'
import type { Zuordnung } from './fremdliste'
import type { WerteZuordnung } from './rueckschreiben'

/**
 * Listenprofile (N3.1 Schritt 2): Die bestätigte Spaltenzuordnung wird
 * gemerkt und beim nächsten Import DERSELBEN Liste wieder verwendet.
 * Erkannt wird die Liste an ihrer Kopfzeile. Gespeichert wird nur die
 * Zuordnung (Spaltennummern), kein Inhalt der Liste.
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

type Ablage = Pick<Storage, 'getItem' | 'setItem'>

function alle<T = Zuordnung>(ablage: Ablage, key = PROFIL_KEY): Record<string, T> {
  try {
    return JSON.parse(ablage.getItem(key) ?? '{}') as Record<string, T>
  } catch {
    return {}
  }
}

export function profilLaden(kopf: string[], ablage: Ablage): Zuordnung | null {
  return alle(ablage)[signatur(kopf)] ?? null
}

export function profilSpeichern(kopf: string[], z: Zuordnung, ablage: Ablage): void {
  try {
    ablage.setItem(PROFIL_KEY, JSON.stringify({ ...alle(ablage), [signatur(kopf)]: z }))
  } catch {
    /* voller oder gesperrter Speicher: dann eben ohne Profil */
  }
}

export function werteLaden(kopf: string[], ablage: Ablage): WerteZuordnung | null {
  return alle<WerteZuordnung>(ablage, WERTE_KEY)[signatur(kopf)] ?? null
}

export function werteSpeichern(kopf: string[], w: WerteZuordnung, ablage: Ablage): void {
  try {
    ablage.setItem(WERTE_KEY, JSON.stringify({ ...alle<WerteZuordnung>(ablage, WERTE_KEY), [signatur(kopf)]: w }))
  } catch {
    /* wie oben */
  }
}
