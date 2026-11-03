import { isGroupAdmin } from './adminAccess'
import { sichtbarFuer, verliertLetzteGruppe, type GruppenPerson } from './aircraftScope'
import type { Group, Settings, User } from './types'

/**
 * Regeln fuer Chat-Gruppen, die Store und Oberflaeche gemeinsam fragen.
 *
 * Die Namensbedingung stand dreimal ausgeschrieben — in addGroup, in
 * renameGroup und im Anlege-Dialog —, jedes Mal etwas anders formuliert.
 * Zwei Pruefungen fuer dieselbe Sache laufen auseinander (CLAUDE.md).
 */

/** Warum ein Gruppenname nicht geht. */
export type GruppenNameFehler = 'leer' | 'vergeben'

/**
 * Der Name, wie er gespeichert wird: nur die Raender beschnitten.
 *
 * Innen bleibt alles stehen. „Ground Training Vienna Base" ist ein Name aus
 * vier Woertern, kein Tippfehler — die Umbenennung schnitt bei jedem
 * Tastendruck ab, und das Leerzeichen am Ende eines halb getippten Namens
 * verschwand, bevor das naechste Wort kam (Audit 11/2026, VERW-04).
 */
export function gruppenName(roh: string): string {
  return roh.trim()
}

/**
 * Ist dieser Name fuer diese Gruppe zulaessig?
 *
 * @param id  Die Gruppe, die umbenannt wird; `null` beim Anlegen. Der eigene
 *            Name zaehlt nicht als vergeben — sonst liesse sich eine Gruppe
 *            nicht auf ihre eigene Schreibweise zuruecksetzen.
 *
 * Verglichen wird ohne Gross-/Kleinschreibung und ohne Randleerzeichen:
 * „SIM Defects" und „sim defects " sind im Chat nicht auseinanderzuhalten.
 */
export function gruppenNameFehler(groups: Pick<Group, 'id' | 'name'>[], id: string | null, roh: string): GruppenNameFehler | null {
  const name = gruppenName(roh)
  if (!name) return 'leer'
  const vergleich = name.toLowerCase()
  if (groups.some((g) => g.id !== id && gruppenName(g.name).toLowerCase() === vergleich)) return 'vergeben'
  return null
}

/* ===================== Mitglieder und Admins ===================== */

/**
 * Warum eine neue Mitglieder- oder Adminliste nicht geht bzw. eine
 * Rueckfrage braucht.
 *
 * - `selbstEntfernt`: Ein Gruppenadmin nimmt sich selbst heraus — als
 *   Mitglied oder als Admin. Abgewiesen: Danach verwaltet er die Gruppe
 *   nicht mehr und sieht sie im Admin-Panel gar nicht erst. In ChatInfo war
 *   die eigene Zeile immer schon ausgenommen, im Admin-Panel genuegte ein
 *   Fehlklick (Audit 11/2026, VERW-09).
 * - `ohneAdmin`: Die Gruppe hatte einen Admin und haette danach keinen.
 *   Erlaubt — nur der Superadmin kann es ausloesen, und ihn fragt die
 *   Oberflaeche vorher. Sie stuende sonst still verwaist da.
 */
export type GruppenAenderungFehler = 'selbstEntfernt' | 'ohneAdmin'

/**
 * Prueft eine Aenderung an Mitgliedern und Admins einer Gruppe.
 *
 * Admin ist nur, wer auch Mitglied ist — dieselbe Regel wie im Store
 * (`setGroupMembers` nimmt dem Ausscheidenden die Adminrechte mit). Wer als
 * Mitglied entfernt wird, verliert also beides.
 *
 * Der Superadmin darf sich selbst entfernen: Er verwaltet jede Gruppe
 * ohnehin, auch ohne Mitgliedschaft.
 */
export function gruppenAenderungFehler(
  actor: Pick<User, 'id' | 'role'> | null,
  group: Pick<Group, 'memberIds' | 'adminIds'>,
  memberIds: string[],
  adminIds: string[],
): GruppenAenderungFehler | null {
  const vorher = group.adminIds.filter((a) => group.memberIds.includes(a))
  const nachher = adminIds.filter((a) => memberIds.includes(a))
  if (actor && actor.role !== 'superadmin') {
    const rausAlsMitglied = group.memberIds.includes(actor.id) && !memberIds.includes(actor.id)
    const rausAlsAdmin = vorher.includes(actor.id) && !nachher.includes(actor.id)
    if (rausAlsMitglied || rausAlsAdmin) return 'selbstEntfernt'
  }
  if (vorher.length > 0 && nachher.length === 0) return 'ohneAdmin'
  return null
}

/**
 * Wer kann Admin dieser Gruppe werden? Nur aktive Mitglieder.
 *
 * Angeboten wurden alle aktiven Nutzer; der Store nahm aber nur Mitglieder
 * an. Bei Nichtmitgliedern tat der Klick nichts, ohne Meldung
 * (Audit 11/2026, VERW-11). Ein deaktiviertes Konto kann sich nicht
 * anmelden, also auch nichts verwalten.
 */
export function adminKandidaten<U extends Pick<User, 'id' | 'active'>>(group: Pick<Group, 'memberIds'>, users: U[]): U[] {
  return users.filter((u) => u.active && group.memberIds.includes(u.id))
}

/**
 * Liesse das Entfernen aus DIESER Gruppe die Person ohne erreichbare Gruppe
 * zurueck?
 *
 * Der Store weist das ab (`setGroupMembers`, Regel aus aircraftScope.ts).
 * In der Chat-Info tat „Entfernen" dann schlicht nichts — ausgerechnet das
 * Loeschen einer Gruppe nannte seinen Grund (Audit 11/2026, KERN-08). Mit
 * dieser Frage kann die Zeile den Knopf vorher sperren und sagen, warum.
 */
export function entfernenBlockiert<G extends Pick<Group, 'id' | 'aircraftType' | 'memberIds'>>(
  settings: Settings,
  person: GruppenPerson,
  gruppen: G[],
  groupId: string,
): boolean {
  const nachher = gruppen.map((g) => (g.id === groupId ? { ...g, memberIds: g.memberIds.filter((m) => m !== person.id) } : g))
  return verliertLetzteGruppe(settings, person, gruppen, nachher)
}

/* ===================== Zugang ===================== */

/**
 * Darf der Nutzer diesen Chat betreten? Mitglieder, Gruppen-Admins,
 * Superadmin — und nur im eigenen Musterbereich.
 *
 * Lag in store.tsx, ausserhalb beider Testwachen; die Rechteregeln des
 * Stores (storeRechte.ts) bauen darauf auf und koennen eine .tsx-Datei mit
 * React nicht importieren (Audit 11/2026, KERN-19). store.tsx reicht die
 * Funktion unveraendert durch.
 */
export function mayAccessGroup(user: User | null | undefined, group: Group): boolean {
  if (!user) return false
  /* Der Musterbereich gilt auch hier, nicht nur in der Liste. Sonst waere die
     Filterung reine Kosmetik: Die Chatliste zeigte die Gruppe nicht, wer die
     Adresse kannte, war trotzdem drin. Dieselbe Luecke gab es schon einmal
     bei den Formularen (#29). */
  if (!sichtbarFuer(user, group.aircraftType)) return false
  return group.memberIds.includes(user.id) || isGroupAdmin(user, group)
}
