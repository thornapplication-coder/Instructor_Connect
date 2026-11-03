import type { Contact } from './types'

/**
 * Regeln des Verzeichnisses „Who to call" (Audit 11/2026, KERN-16).
 *
 * Gespeichert wurde jede Eingabe, wie sie kam: „Training" und „Training "
 * ergaben zwei Abteilungs-Chips und zwei Abschnitte. Ein Kontakt ohne
 * Telefonnummer bot trotzdem „Anrufen" (`tel:` ohne Ziel), einer ohne
 * E-Mail „Nachricht senden" (`mailto:`), und darunter stand „ · ". Die
 * Regeln stehen hier, damit Dialog, Store und Liste dieselben fragen.
 */

/** Was der Dialog erfasst — der Kontakt ohne seine ID. */
export type KontaktEingabe = Pick<Contact, 'department' | 'position' | 'name' | 'phone' | 'email'>

/** Leerraum am Rand weg, Läufe im Innern zu EINEM Leerzeichen. */
const einfach = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Der Kontakt, wie er gespeichert wird: alle Felder ohne Leerraum am Rand,
 * mehrfache Leerzeichen im Innern zusammengezogen (auch in der Nummer —
 * „+43 1  5550" und „+43 1 5550" sind dieselbe). Eine E-Mail-Adresse
 * enthält nie Leerraum; er fällt ganz weg. Leere Werte bleiben leer.
 * Weitere Felder (etwa die ID) bleiben unberührt.
 */
export function kontaktNormalisieren<T extends KontaktEingabe>(c: T): T {
  return {
    ...c,
    department: einfach(c.department),
    position: einfach(c.position),
    name: einfach(c.name),
    phone: einfach(c.phone),
    email: (c.email ?? '').replace(/\s+/g, ''),
  }
}

/** Ein Feld, das so nicht gespeichert wird. */
export type KontaktFeld = 'department' | 'name' | 'phone' | 'email'

/** Grob, nicht streng: lokal@domain.tld ohne Leerraum. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Telefonnummer grob geprüft: Ziffern mit den üblichen Trennern, ein „+"
 * nur am Anfang, 3 bis 20 Ziffern — auch eine dreistellige Nebenstelle
 * ist eine Nummer.
 */
export function telefonGueltig(phone: string): boolean {
  const p = einfach(phone)
  if (!/^\+?[\d ()/.-]+$/.test(p)) return false
  const ziffern = p.replace(/\D/g, '').length
  return ziffern >= 3 && ziffern <= 20
}

/**
 * Welche Felder halten das Speichern auf? Leer heißt: keins.
 *
 * Pflicht sind Abteilung und Name (wie bisher). Telefon und E-Mail dürfen
 * fehlen — ein Kontakt ohne Mail ist eine Aussage —, aber was dasteht, muss
 * wie eine Nummer bzw. Adresse aussehen: Ein Knopf, der „Anrufen" sagt und
 * nichts Wählbares hat, ist schlimmer als keiner.
 */
export function kontaktFehler(c: KontaktEingabe): KontaktFeld[] {
  const n = kontaktNormalisieren(c)
  const fehler: KontaktFeld[] = []
  if (!n.department) fehler.push('department')
  if (!n.name) fehler.push('name')
  if (n.phone && !telefonGueltig(n.phone)) fehler.push('phone')
  if (n.email && !EMAIL.test(n.email)) fehler.push('email')
  return fehler
}

/** `tel:`-Ziel — nur Ziffern und ein führendes „+"; ohne Ziffern keins. */
export function telefonLink(phone: string | undefined): string | null {
  const p = einfach(phone)
  const ziffern = p.replace(/\D/g, '')
  if (!ziffern) return null
  return `tel:${p.startsWith('+') ? '+' : ''}${ziffern}`
}

/** `mailto:`-Ziel — ohne Adresse keins. */
export function mailLink(email: string | undefined): string | null {
  const e = (email ?? '').replace(/\s+/g, '')
  return e ? `mailto:${e}` : null
}

/** Abteilung, unter der ein Kontakt steht — auch für Altbestand mit Leerraum. */
export function abteilungVon(c: Pick<Contact, 'department'>): string {
  return einfach(c.department)
}

/**
 * Die Liste der Seite: Abteilungen (für die Chips), dazu je Abteilung die
 * Kontakte, die zu Filter und Suche passen — Abteilungen alphabetisch,
 * darin nach Name.
 *
 * Gruppiert wird nach `abteilungVon`, nicht nach dem Rohwert: Ein schon
 * gespeichertes „Training " fällt so mit „Training" zusammen, ohne dass der
 * Bestand angefasst werden muss.
 */
export function kontaktGruppen<C extends Contact>(
  kontakte: readonly C[],
  filter: string,
  suche: string,
): { abteilungen: string[]; gruppen: { department: string; contacts: C[] }[]; treffer: number } {
  const abteilungen = [...new Set(kontakte.map(abteilungVon))].sort((a, b) => a.localeCompare(b))
  const nadel = suche.trim().toLowerCase()
  const passend = kontakte
    .filter((c) => !filter || abteilungVon(c) === filter)
    // Ohne Suchfeld war ein Kontakt in einem langen Verzeichnis nur durch
    // Scrollen zu finden.
    .filter((c) => !nadel || `${c.name} ${c.position} ${c.department} ${c.email} ${c.phone}`.toLowerCase().includes(nadel))
    .sort((a, b) => a.name.localeCompare(b.name))
  // Eine Abteilung ohne Treffer bekommt keine Überschrift — vorher stand
  // bei einer Suche jede Abteilung da, die meisten leer.
  const gruppen = abteilungen
    .filter((d) => !filter || d === filter)
    .map((d) => ({ department: d, contacts: passend.filter((c) => abteilungVon(c) === d) }))
    .filter((g) => g.contacts.length > 0)
  return { abteilungen, gruppen, treffer: passend.length }
}
