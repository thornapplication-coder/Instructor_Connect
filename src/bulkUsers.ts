import type { Role, User } from './types'

/**
 * Sammelbearbeitung von Benutzern.
 *
 * Bei rund 130 Instruktoren ist jede wiederkehrende Aenderung Handarbeit
 * gewesen: Ein neues Muster in der Flotte hiess, es bei zwanzig Leuten
 * einzeln anzuhaken; eine ausgelaufene Berechtigung hiess, zwanzigmal
 * dasselbe Kaestchen zu leeren. Wer dabei einen uebersieht, merkt es erst,
 * wenn jemand ein Formular nicht anlegen kann.
 *
 * Die Planung liegt hier und nicht in der Ansicht, weil an ihr zwei Zusagen
 * haengen, die man nicht sehen kann:
 *
 *  1. **Der Zaehler ist ehrlich.** Gemeldet wird, was sich WIRKLICH aendert.
 *     Waeren unveraenderte Nutzer mitgezaehlt, meldete „20 geaendert" auch
 *     dann Erfolg, wenn nur zwei betroffen waren — und niemand merkte, dass
 *     die Auswahl falsch war.
 *  2. **Man kann sich nicht aussperren.** Wer sich selbst deaktiviert, ist
 *     draussen; wer den letzten aktiven Superadmin deaktiviert, sperrt die
 *     ganze ATO aus ihrer Verwaltung aus. Beides wird uebersprungen und
 *     benannt, nicht still ausgefuehrt und auch nicht still verweigert.
 *
 * Bewusst NICHT dabei: die Rolle. Eine Rollenaenderung ist eine
 * Rechteaenderung, und ein Fehlgriff dabei trifft zwanzig Konten auf einmal.
 * Rollen bleiben Einzelentscheidungen.
 */

export type BulkAktion =
  | { art: 'active'; wert: boolean }
  | { art: 'canGrade'; wert: boolean }
  | { art: 'isTrainee'; wert: boolean }
  | { art: 'canEditDirectory'; wert: boolean }
  | { art: 'chatBlocked'; wert: boolean }
  | { art: 'aircraft'; wert: 'add' | 'remove'; typ: string }

/** Warum ein Nutzer aus einer Sammelaktion herausfaellt. */
export type Uebersprungen = 'selbst' | 'letzterSuperadmin'

export type BulkPlan = {
  /** Je Nutzer nur die Felder, die sich tatsaechlich aendern. */
  patches: { id: string; patch: Partial<User> }[]
  /** Bewusst ausgelassen — mit Grund, damit die Oberflaeche ihn nennen kann. */
  uebersprungen: { id: string; grund: Uebersprungen }[]
}

const SUPERADMIN: Role = 'superadmin'

/** Ist dieser Nutzer der letzte, der die Verwaltung noch oeffnen kann? */
function letzterAktiverSuperadmin(users: User[], u: User): boolean {
  if (u.role !== SUPERADMIN || !u.active) return false
  return users.filter((x) => x.role === SUPERADMIN && x.active).length <= 1
}

export function planBulk(users: User[], ids: string[], aktion: BulkAktion, eigeneId: string): BulkPlan {
  const plan: BulkPlan = { patches: [], uebersprungen: [] }
  const gewaehlt = users.filter((u) => ids.includes(u.id))

  for (const u of gewaehlt) {
    if (aktion.art === 'active' && aktion.wert === false) {
      // Reihenfolge zaehlt: „ich selbst" ist der Grund, den der Bedienende
      // zuerst verstehen soll, auch wenn beides zutrifft.
      if (u.id === eigeneId) {
        plan.uebersprungen.push({ id: u.id, grund: 'selbst' })
        continue
      }
      if (letzterAktiverSuperadmin(users, u)) {
        plan.uebersprungen.push({ id: u.id, grund: 'letzterSuperadmin' })
        continue
      }
    }

    if (aktion.art === 'aircraft') {
      const vorhanden = u.aircraftTypes ?? []
      const neu =
        aktion.wert === 'add'
          ? vorhanden.includes(aktion.typ)
            ? vorhanden
            : [...vorhanden, aktion.typ].sort((a, b) => a.localeCompare(b))
          : vorhanden.filter((x) => x !== aktion.typ)
      // Gleiche Liste = keine Aenderung, also auch kein Treffer im Zaehler.
      if (neu.length === vorhanden.length && neu.every((x, i) => x === vorhanden[i])) continue
      plan.patches.push({ id: u.id, patch: { aircraftTypes: neu } })
      continue
    }

    const feld = aktion.art
    const alt = feld === 'chatBlocked' ? !!u.chatBlocked : u[feld]
    if (alt === aktion.wert) continue
    plan.patches.push({ id: u.id, patch: { [feld]: aktion.wert } as Partial<User> })
  }

  return plan
}
