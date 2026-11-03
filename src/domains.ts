import type { User } from './types'

/**
 * Erlaubte Login-Domains — eine Regel fuer Anmeldung, Anlegen und Import.
 *
 * Die Liste nahm jede Zeichenkette an, und drei Stellen verglichen von Hand:
 * Anmeldung und Code-Anforderung mit `endsWith('@' + d)`, der Import mit
 * `=== d`. Nachgestellt (Audit 11/2026, VERW-05): „example.test" entfernt,
 * „@Example.Test" hinzugefuegt — gespeichert wurde genau so, und die
 * Anmeldung pruefte gegen „@@example.test", was nie traf. Die ganze ATO
 * stand vor „Kein Konto fuer diese E-Mail-Adresse". Der Dialog „Benutzer
 * anlegen" pruefte die Domain gar nicht und legte Konten an, die sich nie
 * anmelden konnten (VERW-12).
 *
 * **Leere Liste heisst: alle Domains.** So war es seit jeher, und so bleibt
 * es — eine leere Liste ist eine Aussage („keine Einschraenkung"), kein
 * fehlender Wert.
 */

/** Hostname-artig: Buchstaben, Ziffern, Bindestrich, mindestens ein Punkt. */
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

/**
 * Eine Eingabe in die Schreibweise bringen, die gespeichert und verglichen
 * wird: ohne Rand, ohne fuehrendes @, klein. Ungueltiges ergibt `null` —
 * die Oberflaeche nennt dann den Grund, statt es zu speichern.
 */
export function normalisiereDomain(roh: string): string | null {
  const d = roh.trim().replace(/^@+/, '').toLowerCase()
  return DOMAIN.test(d) ? d : null
}

/**
 * Darf sich diese Adresse anmelden (bzw. angelegt werden)?
 *
 * Gespeicherte Eintraege werden beim Vergleich ebenfalls normalisiert: Ein
 * Altbestand mit „@Example.Test" sperrte sonst weiter aus, obwohl die Regel
 * inzwischen stimmt. Was sich nicht normalisieren laesst, trifft nichts.
 */
export function domainErlaubt(email: string, liste: string[]): boolean {
  if (liste.length === 0) return true
  const mail = email.trim().toLowerCase()
  const at = mail.lastIndexOf('@')
  if (at < 0) return false
  const domain = mail.slice(at + 1)
  return liste.some((d) => normalisiereDomain(d) === domain)
}

/** Aktive Konten, die sich mit dieser Liste nicht mehr anmelden koennten. */
export function ausgesperrt<U extends Pick<User, 'email' | 'active'>>(users: U[], liste: string[]): U[] {
  return users.filter((u) => u.active && !domainErlaubt(u.email, liste))
}

/**
 * Sperrte diese Liste JEDEN aktiven Superadmin aus?
 *
 * Dann kaeme niemand mehr in die Verwaltung, um sie zurueckzunehmen — der
 * Store lehnt eine solche Liste ab. Gibt es gar keinen aktiven Superadmin,
 * kann ihn auch keine Liste aussperren.
 */
export function superadminAusgesperrt(users: Pick<User, 'email' | 'active' | 'role'>[], liste: string[]): boolean {
  const supers = users.filter((u) => u.active && u.role === 'superadmin')
  return supers.length > 0 && supers.every((u) => !domainErlaubt(u.email, liste))
}

/**
 * Eine Liste fuer die Ablage bereinigen: normalisiert, ohne Ungueltiges,
 * ohne Doppelte, Reihenfolge wie eingegeben.
 */
export function domainListe(roh: string[]): string[] {
  const aus: string[] = []
  for (const r of roh) {
    const d = normalisiereDomain(r)
    if (d && !aus.includes(d)) aus.push(d)
  }
  return aus
}

/**
 * Wen sperrte der Wechsel von `alt` auf `neu` ZUSAETZLICH aus? Die Rueckfrage
 * nennt diese Zahl — wer schon vorher nicht passte, aendert sich nicht.
 */
export function neuAusgesperrt<U extends Pick<User, 'id' | 'email' | 'active'>>(users: U[], alt: string[], neu: string[]): U[] {
  const vorher = new Set(ausgesperrt(users, alt).map((u) => u.id))
  return ausgesperrt(users, neu).filter((u) => !vorher.has(u.id))
}

/**
 * Darf diese Liste gespeichert werden?
 *
 * - `selbst`: Der handelnde Superadmin kaeme beim naechsten Mal nicht mehr
 *   hinein. Er sitzt gerade in der Verwaltung und merkt es erst, wenn die
 *   Sitzung um Mitternacht ablaeuft.
 * - `superadmin`: Kein aktiver Superadmin passte mehr — niemand koennte die
 *   Liste zuruecknehmen.
 */
export type DomainSperre = 'selbst' | 'superadmin'

export function domainSperre(
  users: Pick<User, 'email' | 'active' | 'role'>[],
  liste: string[],
  eigeneMail: string | null | undefined,
): DomainSperre | null {
  if (eigeneMail && !domainErlaubt(eigeneMail, liste)) return 'selbst'
  if (superadminAusgesperrt(users, liste)) return 'superadmin'
  return null
}
