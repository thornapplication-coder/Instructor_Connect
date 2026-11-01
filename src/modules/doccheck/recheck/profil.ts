import { vergleichsform } from '../parse/seitenzuordnung'
import type { Zuordnung } from './fremdliste'

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

export function signatur(kopf: string[]): string {
  return kopf.map(vergleichsform).join('|')
}

type Ablage = Pick<Storage, 'getItem' | 'setItem'>

function alle(ablage: Ablage): Record<string, Zuordnung> {
  try {
    return JSON.parse(ablage.getItem(PROFIL_KEY) ?? '{}') as Record<string, Zuordnung>
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
