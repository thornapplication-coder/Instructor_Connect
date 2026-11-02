/**
 * Hinweisdialog je Sitzung (Spez. v1.1 Kap. 5.5 Nr. 2: „Beim ersten Öffnen je
 * Sitzung sehen Nutzer einen Hinweisdialog" — OEM-Vertraulichkeit,
 * Exportkontrolle).
 *
 * „Sitzung" ist die ANMELDUNG eines Nutzers, nicht der Tab. Der Schlüssel war
 * fest („dc-notice-seen") und überlebte das Abmelden: Am geteilten iPad sah
 * der nächste Nutzer im selben Tab den Hinweis nie, ebenso nach „Ansicht als"
 * (Audit 11/2026, SEC-05). Deshalb trägt der Schlüssel den Nutzer, und jedes
 * Abmelden (`ic-abmelden`) räumt alle — auch den alten ohne Nutzer.
 *
 * sessionStorage, nicht der App-Zustand: Ein neuer Tab zeigt ihn wieder.
 * Ohne Ablage (gesperrte Website-Daten) ist er immer offen — lieber einmal
 * zu oft als gar nicht.
 */

export const HINWEIS_PRAEFIX = 'dc-notice-seen'

export type HinweisAblage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

const schluessel = (nutzer: string) => `${HINWEIS_PRAEFIX}:${nutzer}`

export function hinweisOffen(ablage: HinweisAblage | null, nutzer: string | null): boolean {
  if (!ablage || !nutzer) return true
  try {
    return ablage.getItem(schluessel(nutzer)) !== '1'
  } catch {
    return true
  }
}

export function hinweisMerken(ablage: HinweisAblage | null, nutzer: string | null): void {
  if (!ablage || !nutzer) return
  try {
    ablage.setItem(schluessel(nutzer), '1')
  } catch {
    /* voller oder gesperrter Speicher: dann erscheint er eben wieder */
  }
}

/** Beim Abmelden: alle Bestätigungen dieses Tabs vergessen. */
export function hinweiseVergessen(ablage: HinweisAblage | null): void {
  if (!ablage) return
  try {
    const weg: string[] = []
    for (let i = 0; i < ablage.length; i++) {
      const k = ablage.key(i)
      if (k?.startsWith(HINWEIS_PRAEFIX)) weg.push(k)
    }
    for (const k of weg) ablage.removeItem(k)
  } catch {
    /* gesperrter Speicher: dann steht dort auch nichts */
  }
}

/** sessionStorage — oder null, wo schon der Zugriff wirft (gesperrte Website-Daten, manche Vorschauen). */
export function sitzungsAblage(): HinweisAblage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}
