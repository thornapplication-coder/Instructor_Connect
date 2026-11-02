import { musterFehlt, ohneErreichbareGruppe, verliertGruppeDurch } from './aircraftScope'
import { letzterAktiverSuperadmin } from './bulkUsers'
import type { Group, Settings, User } from './types'

/**
 * Was eine Aenderung an EINEM Nutzer darf — und warum nicht.
 *
 * Die Regeln standen still in `updateUser`: Der Store liess verbotene Felder
 * fallen und meldete nichts. Die Nutzerzeile rief ihn ohne Rueckgabe auf;
 * ein Klick auf „Deaktivieren" beim eigenen Konto verpuffte, ein
 * erfolgreicher Rollenwechsel blieb ebenso stumm (Audit 11/2026, VERW-10).
 * Die Sammelbearbeitung dagegen nannte genau diese Gruende — „nicht still
 * ausgefuehrt und auch nicht still verweigert" (bulkUsers.ts).
 *
 * Und eine Regel fehlte ganz: Der Superadmin konnte sich mit einem Klick
 * selbst zum Mitglied machen und stand vor „kein Zugriff". Die Datenbank
 * verbietet genau das (profiles_guard, IC-SELF), Sandbox und Backend
 * antworteten verschieden (Audit 11/2026, VERW-01).
 *
 * Jetzt fragen Store UND Oberflaeche diese Funktion: der Store, um nur das
 * Erlaubte zu schreiben, die Oberflaeche, um den Grund zu nennen.
 */

export type Ablehnung = 'selbstRolle' | 'selbstDeaktivieren' | 'letzterSuperadmin' | 'letztesMuster' | 'letzteGruppe'

export type EinzelErgebnis = {
  /** Nur die Felder, die geschrieben werden duerfen. */
  patch: Partial<User>
  /** Was abgelehnt wurde — in der Reihenfolge, in der der Bedienende es verstehen soll. */
  abgelehnt: Ablehnung[]
  /**
   * Nach der Aenderung fehlt der Person eine Gruppe, die sie betreten kann —
   * ohne dass das abgelehnt wurde. Der Fall ist der Wechsel aus einer Rolle
   * OHNE Chat (Training Admin) in eine mit: Der Training Admin kann keiner
   * Gruppe angehoeren; ihn deshalb nie herabstufen zu duerfen, waere eine
   * Sackgasse. Die Oberflaeche sagt es stattdessen dazu (ebenso bei einem
   * Altkonto, das schon vorher ohne erreichbare Gruppe war).
   */
  gruppeFehlt: boolean
}

/** Gruppen und Einstellungen — fuer die Pflicht „mindestens eine erreichbare Gruppe". */
export type GruppenKontext = { groups: Pick<Group, 'aircraftType' | 'memberIds'>[]; settings: Settings }

/**
 * @param alle      Gesamtbestand — wer der letzte aktive Superadmin ist,
 *                  entscheidet sich am ganzen Bestand.
 * @param ziel      Der Nutzer VOR der Aenderung.
 * @param patch     Die gewuenschte Aenderung.
 * @param eigeneId  Wer aendert. Die eigene Rolle und das eigene Konto sind
 *                  tabu — wie IC-SELF in profiles_guard.
 */
export function einzelAenderung(
  alle: User[],
  ziel: User,
  patch: Partial<User>,
  eigeneId: string | null,
  kontext?: GruppenKontext,
): EinzelErgebnis {
  const erlaubt: Partial<User> = { ...patch }
  const abgelehnt: Ablehnung[] = []
  // Dieselbe Rolle ist keine Aenderung — und darf deshalb auch nichts ablehnen.
  if (erlaubt.role === undefined || erlaubt.role === ziel.role) delete erlaubt.role
  if (erlaubt.active === undefined || erlaubt.active === ziel.active) delete erlaubt.active

  // Reihenfolge wie in planBulk: „ich selbst" ist der Grund, den der
  // Bedienende zuerst verstehen soll, auch wenn mehreres zutrifft.
  if (ziel.id === eigeneId) {
    if (erlaubt.role !== undefined) {
      delete erlaubt.role
      abgelehnt.push('selbstRolle')
    }
    if (erlaubt.active === false) {
      delete erlaubt.active
      abgelehnt.push('selbstDeaktivieren')
    }
  }

  if (letzterAktiverSuperadmin(alle, ziel) && ((erlaubt.role !== undefined && erlaubt.role !== 'superadmin') || erlaubt.active === false)) {
    delete erlaubt.role
    delete erlaubt.active
    abgelehnt.push('letzterSuperadmin')
  }

  // Niemand wird blind geschaltet. Geprueft wird das ERGEBNIS, nicht der
  // Patch: Ob die Rolle oder die Musterliste den Ausschlag gibt, ist
  // gleichgueltig. Ein bereits so entstandenes Altkonto bleibt aenderbar,
  // solange die Aenderung es nicht schlechter macht.
  if (musterFehlt({ ...ziel, ...erlaubt }) && !musterFehlt(ziel)) {
    delete erlaubt.role
    delete erlaubt.aircraftTypes
    abgelehnt.push('letztesMuster')
  }

  let gruppeFehlt = false
  if (kontext) {
    // Seit die Gruppenpflicht nur erreichbare Gruppen zaehlt, aendern Rolle
    // und Muster, was jemand erreicht: Wer sein Muster verliert, verliert
    // dessen Gruppen. Ohne diese Pruefung waere das der fuenfte Weg in den
    // Zustand, den Anlegen, Import, Mitgliederpflege und Loeschen verbieten.
    const { groups, settings } = kontext
    // Abgelehnt wird nur, wer die Pflicht schon hatte UND sie bisher
    // erfuellte — ein Altkonto ohne erreichbare Gruppe bleibt aenderbar,
    // solange die Aenderung es nicht schlechter macht.
    if (verliertGruppeDurch(settings, ziel, { ...ziel, ...erlaubt }, groups)) {
      delete erlaubt.role
      delete erlaubt.aircraftTypes
      abgelehnt.push('letzteGruppe')
    }
    gruppeFehlt = ohneErreichbareGruppe(settings, { ...ziel, ...erlaubt }, groups)
  }

  return { patch: erlaubt, abgelehnt, gruppeFehlt }
}
