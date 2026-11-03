import { sichtbarFuer } from './aircraftScope'
import { dateiName } from './dateiName'
import { lokalerTag } from './datum'
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

/**
 * Downloadname der Kontrollliste nach dem gemeinsamen Schema (dateiName.ts):
 * Inhalt, Eintrag, Stand-Datum — z. B.
 * „read-confirmations_Änderung-Lärmschutzverfahren_2026-11-03.csv".
 *
 * Audit 11/2026, EXM-10/FN-01: Der Name entstand in der Ansicht mit
 * `replace(/[^\w-]+/g, '-')` ohne u-Flag — `\w` kennt nur ASCII, aus
 * „Änderung Lärmschutzverfahren Übung" wurde
 * „-nderung-L-rmschutzverfahren-bung". Und ohne Datum wurde der naechste
 * Auszug desselben Eintrags im Downloadordner zur „(1)"-Kopie; welcher
 * Stand der Quote galt, liess sich nur noch am Dateikopf ablesen.
 * `exportiertAm` ist derselbe Zeitpunkt wie im Kopf der Datei; der Tag ist
 * der ORTSTAG (`lokalerTag`), nicht der UTC-Tag.
 */
export function ackListeDateiName(titel: string, exportiertAm: number): string {
  return `${dateiName(['read-confirmations', titel], lokalerTag(exportiertAm))}.csv`
}

/* ===================== Veroeffentlichung und „Neu" ===================== */

/*
 * Die drei Zeitfragen lagen in store.tsx und damit ausserhalb beider
 * Testwachen; die Neu-Marke rechnete in Store und Ansicht verschieden mit
 * ihnen (Audit 11/2026, KERN-11).
 */

/** Ist der Eintrag schon veröffentlicht? „Gültig ab“ in der Zukunft heißt:
 *  noch nicht sichtbar und nicht bestätigbar (nur Verwalter sehen ihn). */
export function infoIsPublished(entry: { validFrom?: string }, ts: number): boolean {
  if (!entry.validFrom) return true
  const from = new Date(`${entry.validFrom}T00:00:00`).getTime()
  return Number.isNaN(from) || from <= ts
}

/** Abgelaufen? Nach dem Gültigkeitsende ist der Eintrag nicht mehr
 *  bestätigungspflichtig — eine Bestätigung auf ein überholtes Dokument
 *  landete sonst als „gelesen" in der Kontrollliste. */
export function infoIsExpired(entry: { validUntil?: string }, ts: number): boolean {
  if (!entry.validUntil) return false
  const until = new Date(`${entry.validUntil}T23:59:59`).getTime()
  return !Number.isNaN(until) && until < ts
}

/** Ab wann der Eintrag für die Leser sichtbar wurde — maßgeblich für die
 *  „Neu"-Markierung. Ein vorbereiteter Eintrag ging bisher ohne Markierung
 *  online, weil ab seiner Erstellung gerechnet wurde. */
export function infoPublishedAt(entry: { validFrom?: string; createdAt: number }): number {
  if (!entry.validFrom) return entry.createdAt
  const from = new Date(`${entry.validFrom}T00:00:00`).getTime()
  return Number.isNaN(from) ? entry.createdAt : Math.max(entry.createdAt, from)
}

/** Wie lange ein Eintrag ab seiner Veröffentlichung „Neu“ trägt. */
export const INFO_NEU_MS = 14 * 24 * 3600_000

/**
 * Traegt der Eintrag die Marke „Neu"?
 *
 * Nur veroeffentlicht und nur im Fenster ab der Veroeffentlichung. Vorher
 * genuegte `ts − Veroeffentlichung < 14 Tage` — bei einem geplanten Eintrag
 * ist der Abstand negativ, und die Karte trug „Neu" und „Geplant"
 * zugleich (KERN-11).
 */
export function infoIstNeu(entry: { validFrom?: string; createdAt: number }, ts: number): boolean {
  if (!infoIsPublished(entry, ts)) return false
  const alter = ts - infoPublishedAt(entry)
  return alter >= 0 && alter < INFO_NEU_MS
}

/**
 * Jüngste Veröffentlichung eines FREMDEN Eintrags — der Bezugspunkt für
 * „gesehen" und die Neu-Marke auf der Startkachel.
 *
 * Gezählt wird nur, was zum Zeitpunkt `ts` veröffentlicht ist. Verwalter
 * sehen auch Geplantes; dessen Veröffentlichung liegt in der Zukunft, und
 * genau dieser Zeitpunkt wurde als „gesehen" gespeichert: Bis zum
 * Startdatum blieb danach jede Neu-Marke aus, auch für sofort gültige
 * Einträge (KERN-11). Deshalb auch nie über `ts` hinaus.
 */
export function neuesteFremdeVeroeffentlichung(
  entries: { authorId: string; validFrom?: string; createdAt: number }[],
  userId: string | null | undefined,
  ts: number,
): number {
  return entries.reduce(
    (max, e) => (e.authorId !== userId && infoIsPublished(e, ts) ? Math.max(max, Math.min(infoPublishedAt(e), ts)) : max),
    0,
  )
}

/**
 * Der gespeicherte Gesehen-Zeitpunkt, soweit er gültig ist.
 *
 * Ein Zeitpunkt in der Zukunft stammt aus dem Fehler oben (KERN-11) — auf
 * einem Gerät, das ihn schon gespeichert hat, unterdrückte er die
 * Neu-Marke bis zu diesem Tag. Er zählt deshalb als „noch nichts gesehen";
 * beim nächsten Öffnen wird er durch einen gültigen ersetzt.
 */
export function infoGesehenBis(gesehen: number | undefined, ts: number): number {
  return gesehen !== undefined && gesehen <= ts ? gesehen : 0
}

/* ===================== Gueltigkeit beim Anlegen ===================== */

/** Warum die Gueltigkeit eines neuen Eintrags nicht passt. */
export type GueltigkeitGrund = 'bisVorAb'

/**
 * Passt „Gültig ab"/„Gültig bis"? `null` heißt ja.
 *
 * Ein Eintrag „ab 06.11. bis 27.10." ließ sich speichern und war danach
 * zugleich „abgelaufen" und „geplant" — für die Zielgruppe erschien er nie
 * (Audit 11/2026, KERN-12). Gleicher Tag ist erlaubt: Der Eintrag gilt dann
 * genau diesen einen Tag (`infoIsPublished` ab 00:00, `infoIsExpired` ab
 * 23:59:59). Fehlt eine Seite, gibt es nichts zu vergleichen — leeres „bis"
 * ist UFN, leeres „ab" heißt ab Veröffentlichung.
 *
 * Verglichen wird der Text: Beide Werte kommen als YYYY-MM-DD aus dem
 * Datumsfeld, und in dieser Schreibweise ist die Textfolge die Zeitfolge —
 * ohne Umweg über `Date`, der an der Zeitzone hinge. Ein Wert in anderer
 * Schreibweise wird nicht verglichen: Seine Textfolge sagte nichts.
 */
export function gueltigkeitFehler(validFrom: string | undefined, validUntil: string | undefined): GueltigkeitGrund | null {
  const tag = /^\d{4}-\d{2}-\d{2}$/
  if (!validFrom || !validUntil || !tag.test(validFrom) || !tag.test(validUntil)) return null
  return validUntil < validFrom ? 'bisVorAb' : null
}
