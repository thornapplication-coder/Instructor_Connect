import type { Laufeigenschaften } from '../parse/model'

/**
 * Unsichtbarer Text (Nachtrag N4): Schriftfarbe gleich oder nahe dem
 * WIRKSAMEN Hintergrund (Kontrast < 1,5:1), `w:vanish`, oder Schrift ≤ 2 pt.
 *
 * „auto" ist Words automatische Farbe — sie schaltet auf dunklem Grund
 * selbst auf weiß. Automatischer Text ist deshalb nie unsichtbar.
 */

export const KONTRAST_GRENZE = 1.5
export const GROESSE_GRENZE = 2

function luminanz(hex: string): number {
  const kanal = (i: number) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4)
}

export function kontrast(a: string, b: string): number {
  const [h, d] = [luminanz(a), luminanz(b)].sort((x, y) => y - x)
  return (h + 0.05) / (d + 0.05)
}

export type Unsichtbar = 'farbe' | 'vanish' | 'groesse' | null

export function unsichtbar(e: Laufeigenschaften, hintergrund: string): Unsichtbar {
  if (e.vanish) return 'vanish'
  if (e.groesse !== undefined && e.groesse <= GROESSE_GRENZE) return 'groesse'
  if (e.farbe && e.farbe !== 'auto' && /^[0-9A-F]{6}$/.test(hintergrund) && kontrast(e.farbe, hintergrund) < KONTRAST_GRENZE) return 'farbe'
  return null
}
