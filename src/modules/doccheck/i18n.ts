import type { i18n as I18n } from 'i18next'
import de from './i18n/de.json'
import en from './i18n/en.json'

/**
 * Texte von DocCheck im Namensraum `doccheck` (Spez. 3.5).
 *
 * Sie werden NICHT in src/i18n/index.ts eingetragen, sondern beim Laden des
 * Moduls nachgereicht — sonst laege jeder DocCheck-Text im Startbundle
 * jedes Instruktors, auch wenn er die Kachel nie sieht. Mehrfaches Laden
 * (Hot Reload, zweiter Aufruf) ist harmlos: Es wird nur einmal eingetragen.
 */
export const NAMENSRAUM = 'doccheck'

export function registriereDocCheckTexte(i18n: Pick<I18n, 'hasResourceBundle' | 'addResourceBundle'>): boolean {
  if (i18n.hasResourceBundle('en', NAMENSRAUM)) return false
  i18n.addResourceBundle('en', NAMENSRAUM, en)
  i18n.addResourceBundle('de', NAMENSRAUM, de)
  return true
}
