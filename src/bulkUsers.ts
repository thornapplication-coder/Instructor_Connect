import { musterFehlt } from './aircraftScope'
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
 *     ganze ATO aus ihrer Verwaltung aus. Wer sein letztes Muster verliert,
 *     ist aus allem Musterbezogenen draussen — inhaltlich derselbe Fall, nur
 *     leiser. Alle drei werden uebersprungen und benannt, nicht still
 *     ausgefuehrt und auch nicht still verweigert.
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
export type Uebersprungen = 'selbst' | 'letzterSuperadmin' | 'nichtSichtbar' | 'letztesMuster'

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

/**
 * @param alle       Gesamtbestand — ausschliesslich fuer die Aussperr-Pruefung.
 *                   Wer der letzte aktive Superadmin ist, entscheidet sich am
 *                   ganzen Bestand, nicht an dem, was gerade gefiltert ist.
 * @param sichtbar   Was auf dem Bildschirm steht. NUR hierauf wirkt die Aktion.
 * @param ids        Die Auswahl.
 *
 * Die Trennung von `alle` und `sichtbar` ist der Kern und keine Formsache:
 * Die Auswahl ist eine Liste von Kennungen und ueberlebt jeden Filterwechsel.
 * Wer 100 Member auswaehlt, dann auf „Superadmin" filtert und „Deaktivieren"
 * drueckt, sperrte damit 100 Instruktoren aus, von denen in dem Moment keiner
 * sichtbar war — die Rueckfrage nennt nur eine Zahl, keine Namen. Deshalb
 * faellt hier alles heraus, was nicht auf dem Bildschirm steht, und wird als
 * `nichtSichtbar` benannt statt still ausgefuehrt.
 */
export function planBulk(alle: User[], sichtbar: User[], ids: string[], aktion: BulkAktion, eigeneId: string): BulkPlan {
  const plan: BulkPlan = { patches: [], uebersprungen: [] }
  const sichtbareIds = new Set(sichtbar.map((u) => u.id))
  ids.filter((id) => !sichtbareIds.has(id)).forEach((id) => plan.uebersprungen.push({ id, grund: 'nichtSichtbar' }))
  const gewaehlt = sichtbar.filter((u) => ids.includes(u.id))

  for (const u of gewaehlt) {
    if (aktion.art === 'active' && aktion.wert === false) {
      // Reihenfolge zaehlt: „ich selbst" ist der Grund, den der Bedienende
      // zuerst verstehen soll, auch wenn beides zutrifft.
      if (u.id === eigeneId) {
        plan.uebersprungen.push({ id: u.id, grund: 'selbst' })
        continue
      }
      if (letzterAktiverSuperadmin(alle, u)) {
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
      // „CL30 faellt aus der Flotte" trifft vierzig Leute auf einmal — wer
      // nur CL30 hatte, staende danach ohne alles da. Der Store weist eine
      // solche Aenderung ohnehin ab; wuerde sie hier trotzdem eingeplant,
      // meldete der Zaehler vierzig geaenderte und es waeren dreissig.
      if (musterFehlt({ role: u.role, aircraftTypes: neu })) {
        plan.uebersprungen.push({ id: u.id, grund: 'letztesMuster' })
        continue
      }
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
