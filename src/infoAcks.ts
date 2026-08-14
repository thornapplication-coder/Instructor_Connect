import { sichtbarFuer } from './aircraftScope'
import type { Group, Role } from './types'

/**
 * Wer muss einen Instructor-Info-Eintrag zur Kenntnis nehmen?
 *
 * Diese Frage hat DREI Antworten in der Oberflaeche, und sie muessen
 * dieselbe sein: die Quote ueber der Liste („3 von 12 bestaetigt"), die
 * aufklappbare Kontrollliste, und die Frage, ob jemand den Bestaetigen-Knopf
 * ueberhaupt sieht. Laufen sie auseinander, meldet die Quote eine Pflicht,
 * die der Betroffene gar nicht erfuellen kann.
 *
 * Sie lag als Hilfsfunktion in `InstructorInfo.tsx` und war damit von der
 * Testpflicht befreit — beide Wachen des Projekts globen auf `src/*.ts`.
 * Aufgefallen ist das auf Nachfrage, nicht beim Bauen.
 *
 * **Drei Bedingungen, alle notwendig:**
 *
 *  1. **Das Konto ist aktiv.** Ein stillgelegtes Konto kann sich nicht
 *     anmelden und deshalb auch nichts bestaetigen.
 *  2. **Das Modul steht offen.** Ein Training Admin ohne freigeschaltete
 *     Instructor Info zaehlte sonst in jeder Quote als dauerhaft saeumig.
 *  3. **Der Eintrag liegt im Musterbereich.** Ein Eintrag fremden Musters
 *     taucht in seiner Ansicht gar nicht auf — er stuende in der
 *     Kontrollliste und im Behoerdenauszug dauerhaft als PENDING. Ein
 *     Nachweisdokument naennte damit jemanden saeumig, dem die App den
 *     Eintrag vorenthaelt, und die Quote erreichte nie 100 %.
 *
 * Dazu die Zielgruppen des Eintrags: keine genannt heisst „alle".
 */

/** Gilt ein Info-Eintrag fuer diesen Nutzer? (leer = alle Gruppen) */
export function infoEntryAppliesTo(entry: { groupIds?: string[] }, userId: string, groups: Group[]): boolean {
  return (
    !entry.groupIds?.length ||
    entry.groupIds.some((gid) => groups.find((g) => g.id === gid)?.memberIds.includes(userId))
  )
}

/** Das Mindeste, was ein Nutzer fuer diese Entscheidung mitbringen muss. */
type Kandidat = { id: string; name: string; active: boolean; role: Role; aircraftTypes?: string[] }

/**
 * Die Zielpersonen einer Lese-Bestaetigung, alphabetisch.
 *
 * `darfModul` wird hereingereicht statt hier entschieden: Die Rechte-Matrix
 * haengt an den Einstellungen und lebt im Store. Was hierher gehoert, ist die
 * Verknuepfung der drei Bedingungen — sie ist es, die auseinanderlaufen kann.
 */
export function ackZiele<U extends Kandidat>(
  eintrag: { aircraftType?: string; groupIds?: string[] },
  nutzer: U[],
  gruppen: Group[],
  darfModul: (u: U) => boolean,
): U[] {
  return nutzer
    .filter((u) => u.active && darfModul(u) && sichtbarFuer(u, eintrag.aircraftType) && infoEntryAppliesTo(eintrag, u.id, gruppen))
    // Alphabetisch — die interne Reihenfolge war fuer eine Kontrollliste
    // nicht nachvollziehbar.
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Wie viele der Zielpersonen haben schon bestaetigt? */
export function ackStand<U extends Kandidat>(ziele: U[], acks: Record<string, number> | undefined): number {
  return ziele.filter((u) => (acks ?? {})[u.id]).length
}
