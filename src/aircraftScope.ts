import { userMayModule, type RechtePerson } from './adminAccess'
import type { Group, Role, Settings } from './types'

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

/**
 * Gruppen, die eine Person tatsaechlich betreten kann.
 *
 * Die Pflicht „mindestens eine Gruppe" zaehlte jede Mitgliedschaft — auch in
 * Gruppen fremden Musters, die die Person nie zu sehen bekommt
 * (mayAccessGroup prueft sichtbarFuer). Der Seed fuehrte Mika (nur C560 XLS+)
 * als Mitglied der CL30-Gruppe; nahm man ihn aus „SIM Defects", liess der
 * Store das zu, und seine Chatliste meldete „in keiner Gruppe"
 * (Audit 11/2026, KERN-07/VERW-16). Die Pflicht war erfuellt, der Zweck
 * nicht.
 *
 * Gezaehlt wird deshalb nur, was die Person erreicht: Mitglied, im
 * Musterbereich (ohne Muster = fuer alle) und mit Chat-Modul. Die Regel
 * steht hier, weil sie die Musterregel ist — eine zweite Auslegung in der
 * Ansicht waere die vierte Stelle, an der sie auseinanderlaufen kann.
 */
export type GruppenPerson = RechtePerson & { id: string; aircraftTypes?: string[] }

/**
 * Muss diese Person mindestens einer Gruppe angehoeren?
 *
 * Nur wer den Chat hat. Der Training Admin hat kein Chat-Modul
 * (userMayModule); eine Pflicht, die er nicht erfuellen KANN, stand im
 * Widerspruch zu ihm selbst — der Seed fuehrte ihn ohne Gruppe, und kein
 * Schreibweg haette ihn in eine erreichbare bringen koennen.
 */
export function gruppenPflicht(settings: Settings, person: RechtePerson): boolean {
  return userMayModule(settings, person, 'chat')
}

/** Koennte diese Person die Gruppe betreten, wenn sie Mitglied waere? */
export function gruppenTauglich(
  settings: Settings,
  person: RechtePerson & { aircraftTypes?: string[] },
  gruppe: Pick<Group, 'aircraftType'>,
): boolean {
  return userMayModule(settings, person, 'chat') && sichtbarFuer(person, gruppe.aircraftType)
}

/** Die Gruppen, in denen die Person Mitglied ist UND die sie betreten kann. */
export function erreichbareGruppen<G extends Pick<Group, 'aircraftType' | 'memberIds'>>(
  settings: Settings,
  person: GruppenPerson,
  gruppen: G[],
): G[] {
  return gruppen.filter((g) => g.memberIds.includes(person.id) && gruppenTauglich(settings, person, g))
}

/**
 * Fehlt dieser Person eine erreichbare Gruppe, obwohl sie eine braucht?
 * Die eine Frage, die Anlegen, Import, Mitgliederpflege, Loeschen und
 * Rollen-/Musterwechsel stellen.
 */
export function ohneErreichbareGruppe(settings: Settings, person: GruppenPerson, gruppen: Pick<Group, 'aircraftType' | 'memberIds'>[]): boolean {
  return gruppenPflicht(settings, person) && erreichbareGruppen(settings, person, gruppen).length === 0
}

/**
 * Verliert die Person mit dieser Aenderung ihre letzte erreichbare Gruppe?
 *
 * Abgelehnt wird nur die VERSCHLECHTERUNG: Wer schon vorher keine
 * erreichbare Gruppe hatte (Altbestand), darf aus einer unerreichbaren
 * entfernt werden — sonst liesse sich der falsche Zustand nie aufraeumen.
 * Genau das scheiterte im Audit: „Entfernen" von Mika aus der CL30-Gruppe
 * aenderte nichts und meldete nichts.
 */
export function verliertLetzteGruppe(
  settings: Settings,
  person: GruppenPerson,
  vorher: Pick<Group, 'aircraftType' | 'memberIds'>[],
  nachher: Pick<Group, 'aircraftType' | 'memberIds'>[],
): boolean {
  return !ohneErreichbareGruppe(settings, person, vorher) && ohneErreichbareGruppe(settings, person, nachher)
}

/**
 * Nimmt eine Aenderung an der PERSON (Rolle, Muster) ihr die letzte
 * erreichbare Gruppe? Wer sein Muster verliert, verliert dessen Gruppen.
 * Einzelaenderung und Sammelbearbeitung fragen dieselbe Stelle — sonst
 * meldete die Sammelaktion als geaendert, was der Store abweist.
 *
 * Wie bei `verliertLetzteGruppe` zaehlt nur die Verschlechterung: Wer die
 * Pflicht vorher nicht hatte (Training Admin) oder sie schon nicht
 * erfuellte, verliert nichts.
 */
export function verliertGruppeDurch(
  settings: Settings,
  vorher: GruppenPerson,
  nachher: GruppenPerson,
  gruppen: Pick<Group, 'aircraftType' | 'memberIds'>[],
): boolean {
  return gruppenPflicht(settings, vorher) && !ohneErreichbareGruppe(settings, vorher, gruppen) && ohneErreichbareGruppe(settings, nachher, gruppen)
}

/** Wo ein Muster noch haengt — je Bereich gezaehlt. */
export interface MusterVerwendung {
  gruppen: number
  nutzer: number
  lessonPlans: number
  formulare: number
  info: number
}

/**
 * Wie oft ein Muster noch verwendet wird.
 *
 * Der Store behaelt ein Muster, an dem noch etwas haengt — sonst zeigten
 * diese Verweise ins Leere. Er tat das aber still: Der Chip verschwand nicht,
 * sondern sprang ans Listenende, ohne Meldung (Audit 11/2026, VERW-18). Die
 * Zaehlung steht hier, damit Store (behalten) und Oberflaeche (Grund nennen)
 * dieselbe Regel fragen.
 */
export function musterInVerwendung(
  st: {
    groups: Pick<Group, 'aircraftType'>[]
    users: { aircraftTypes: string[] }[]
    lessonPlans: { aircraftType: string }[]
    gradingRecords: { header: { aircraftType?: string } }[]
    infoEntries: { aircraftType?: string }[]
  },
  typ: string,
): MusterVerwendung {
  return {
    gruppen: st.groups.filter((g) => g.aircraftType === typ).length,
    nutzer: st.users.filter((u) => u.aircraftTypes.includes(typ)).length,
    lessonPlans: st.lessonPlans.filter((l) => l.aircraftType === typ).length,
    formulare: st.gradingRecords.filter((r) => r.header.aircraftType === typ).length,
    info: st.infoEntries.filter((e) => e.aircraftType === typ).length,
  }
}

/** Haengt an dem Muster noch irgendetwas? */
export function musterBelegt(v: MusterVerwendung): boolean {
  return v.gruppen + v.nutzer + v.lessonPlans + v.formulare + v.info > 0
}

/**
 * Neue Musterliste mit der Reihenfolge des Bestands.
 *
 * Bleibt ein Muster, weil es noch belegt ist, steht es an SEINER Stelle —
 * nicht angehaengt. Neu hinzugekommene folgen am Ende, wie getippt.
 */
export function musterListeBehalten(alt: string[], neu: string[], belegt: (typ: string) => boolean): string[] {
  const bleibt = alt.filter((a) => neu.includes(a) || belegt(a))
  return [...bleibt, ...neu.filter((n) => !alt.includes(n))]
}
