import type { Role } from './types'

/**
 * Musterbezogene Sichtbarkeit — eine Regel für die ganze App.
 *
 * Bis hierher filterte genau EIN Bereich nach Aircraft Type: die Lesson
 * Plans. Instructor Info lief über Gruppen, der Chat über Mitgliedschaft, und
 * dass beides musterbezogen *wirkte*, lag nur daran, dass die Gruppen meist
 * nach Mustern geschnitten sind. Das ist Gewohnheit, keine Regel: Wer eine
 * gemischte Gruppe anlegt, zeigt CL30-Leuten C560-Inhalte.
 *
 * Jetzt gilt für alle inhaltlichen Bereiche dieselbe Regel, und sie steht an
 * einer Stelle statt an vier.
 *
 * **Ohne Muster heißt „für alle".** Ein Info-Eintrag ohne Musterangabe, eine
 * musterübergreifende Gruppe — das ist eine Aussage („betrifft alle") und
 * kein fehlender Wert. Die Alternative wäre gewesen, solche Inhalte
 * niemandem mehr zu zeigen; dann verschwände der Bestand auf einen Schlag,
 * still, und niemand wüsste warum. Dieselbe Auslegung gilt beim Feedback
 * schon länger („General").
 *
 * **Zwei Rollen stehen ausserhalb.** Superadmin und Training Admin sehen
 * alles, unabhängig von ihrer Zuordnung. Beide haben Aufgaben, die den
 * ganzen Betrieb betreffen: Der Superadmin verwaltet die ATO, der Training
 * Admin führt die Ablage (ORA.GEN.220) und braucht dafür den vollen Blick.
 * Wer sie einschränkte, machte genau die Rollen blind, die den Überblick
 * haben müssen.
 *
 * **Mitglied und Admin sind zugeordnet.** Für beide gilt der Musterbereich —
 * auch für den Admin, der Lesson Plans oder Info-Einträge pflegt. Das hat
 * eine Kehrseite, die man kennen muss: Um Inhalte eines Musters zu
 * verwalten, muss man diesem Muster zugeordnet sein. Die Zuordnung ist
 * deshalb eine Mehrfachauswahl und für diese beiden Rollen beim Anlegen
 * Pflicht.
 *
 * **Nicht betroffen sind die Nachweise.** Formularablage, Statistik und
 * Behördenexport bleiben rollenbasiert. Ein Training Admin mit nur einem
 * Muster sähe sonst einen Ausschnitt des Archivs — und die
 * Aufbewahrungspflicht (ORA.GEN.220) gilt für den ganzen Bestand, nicht für
 * den eigenen Teil davon.
 */

/** Rollen, deren Sicht NICHT am Muster haengt — sie sehen den ganzen Betrieb. */
const OHNE_SCHRANKE: readonly Role[] = ['superadmin', 'training_admin']

/**
 * Gilt der Musterbereich fuer diese Person?
 *
 * Die Rolle entscheidet, nicht die Zuordnung: Ein Superadmin ohne jedes
 * Muster sieht trotzdem alles, ein Mitglied mit allen Mustern sieht alles —
 * aber aus einem anderen Grund. Die Unterscheidung steht hier und nicht in
 * den Ansichten, damit sie nicht an vier Stellen auseinanderlaufen kann.
 */
export function giltMusterbereich(user: { role: Role } | null | undefined): boolean {
  return !!user && !OHNE_SCHRANKE.includes(user.role)
}

/**
 * Darf jemand mit diesen Mustern den Inhalt sehen?
 *
 * @param eigene  Die Muster der Person (Mehrfachauswahl).
 * @param muster  Das Muster des Inhalts; leer oder fehlend = betrifft alle.
 */
export function imMusterbereich(eigene: string[] | undefined, muster: string | undefined | null): boolean {
  if (!muster || !muster.trim()) return true
  return (eigene ?? []).includes(muster)
}

/**
 * Sieht diese Person diesen Inhalt?
 *
 * Fasst beide Fragen zusammen — gilt die Schranke fuer die Rolle, und liegt
 * der Inhalt im Musterbereich. Die Ansichten rufen NUR das hier auf: Sonst
 * muesste jede von ihnen die Rollenausnahme selbst kennen, und genau so
 * laufen vier Stellen auseinander.
 */
export function sichtbarFuer(
  user: { role: Role; aircraftTypes?: string[] } | null | undefined,
  muster: string | undefined | null,
): boolean {
  if (!user) return false
  if (!giltMusterbereich(user)) return true
  return imMusterbereich(user.aircraftTypes, muster)
}

/** Liste auf den Musterbereich einer Person eindampfen (inkl. Rollenausnahme). */
export function nachMuster<T>(
  user: { role: Role; aircraftTypes?: string[] } | null | undefined,
  liste: T[],
  musterVon: (x: T) => string | undefined | null,
): T[] {
  if (!user) return []
  if (!giltMusterbereich(user)) return liste
  return liste.filter((x) => imMusterbereich(user.aircraftTypes, musterVon(x)))
}

/**
 * Ein Konto ohne jedes Muster ist für nichts zuständig — es sähe von allem
 * Musterbezogenen nichts. Beim Anlegen ist die Zuordnung deshalb Pflicht
 * (Dialog UND Store), und bestehende Konten ohne Zuordnung bekommen bei der
 * Migration alle Muster: Der Umstieg darf niemandem etwas wegnehmen, was er
 * gestern noch sah.
 */
export function ohneMuster(user: { aircraftTypes?: string[] }): boolean {
  return (user.aircraftTypes ?? []).length === 0
}

/**
 * Braucht diese Rolle beim Anlegen zwingend eine Musterzuordnung?
 *
 * Nur dort, wo sie etwas bewirkt. Einem Superadmin ein Muster abzuverlangen,
 * das seine Sicht nicht veraendert, waere ein totes Pflichtfeld — man
 * klickt irgendetwas an, und der naechste liest daraus eine Zustaendigkeit,
 * die es nicht gibt.
 */
export function musterPflicht(role: Role): boolean {
  return giltMusterbereich({ role })
}

/**
 * Waere dieses Konto fuer nichts zustaendig?
 *
 * Die Frage stellt sich an JEDEM Schreibweg auf einen Nutzer, nicht nur beim
 * Anlegen — und genau das war der Fehler: Die Bedingung stand in `addUser`
 * von Hand ausgeschrieben, waehrend Import, Sammelbearbeitung, Rollenwechsel
 * und die Chip-Reihe in der Nutzerzeile sie nicht kannten. Vier Wege in einen
 * Zustand, den der fuenfte ausdruecklich verbietet.
 *
 * Deshalb steht sie hier, und die Schreibwege rufen sie. Wer einen neuen Weg
 * baut, hat damit eine Stelle zu fragen statt einer Bedingung nachzubauen.
 */
export function musterFehlt(user: { role: Role; aircraftTypes?: string[] }): boolean {
  return musterPflicht(user.role) && ohneMuster(user)
}

/**
 * Welche Muster darf diese Person einem Inhalt GEBEN?
 *
 * Nur die, die sie auch sieht. Sonst legt ein Gruppenadmin einen Lesson Plan
 * fuer ein fremdes Muster an, bekommt die Bestaetigung — und der Plan ist im
 * selben Moment weg: Die Liste, aus der man loeschen und bearbeiten koennte,
 * ist dieselbe gefilterte. Nur ein Superadmin kaeme noch heran.
 *
 * `aircraftScope` kannte diese Kehrseite im Kopfkommentar bereits („Um
 * Inhalte eines Musters zu verwalten, muss man diesem Muster zugeordnet
 * sein"), zog aber die Folge nicht: Dann duerfen die Auswahlfelder auch nur
 * das anbieten.
 */
export function musterZurAuswahl(
  user: { role: Role; aircraftTypes?: string[] } | null | undefined,
  alle: string[],
): string[] {
  if (!user) return []
  if (!giltMusterbereich(user)) return alle
  return alle.filter((m) => imMusterbereich(user.aircraftTypes, m))
}
