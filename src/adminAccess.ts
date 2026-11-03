import type { Group, ModuleKey, PermKey, Role, Settings, User } from './types'

/**
 * Wer darf welchen Bereich des Admin-Panels oeffnen?
 *
 * Die Liste stand als Ternaer mitten in der Ansicht — Superadmin alles, alle
 * anderen Gruppen und Feedback — und ein zweites Mal, anders formuliert, im
 * Zugangsriegel derselben Datei. Zwei Aufzaehlungen derselben Sache: Die
 * Startseite zeigte dem Training Admin am Ende eine Kachel, hinter der die
 * andere Aufzaehlung „kein Zugriff" sagte.
 *
 * Jetzt entscheidet es eine Stelle, und alle drei fragen sie: die Kachel auf
 * der Startseite, die Reiterleiste und die Statuszeile. Ein Punkt der
 * Statuszeile fuehrt namentlich irgendwohin — steht dieses Irgendwohin der
 * Rolle nicht offen, darf der Punkt gar nicht erst erscheinen.
 */
export const ADMIN_TABS = ['users', 'permissions', 'grading', 'logbook', 'groups', 'feedback', 'settings', 'imprint', 'changelog'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

/**
 * Rechte, an denen ein Bereich ausser an der Rolle haengt.
 *
 * Der Training Admin bekam den Grading-Bereich fest — ohne die Matrix zu
 * lesen. Entzog der Superadmin ihm „Alle Grading-Formulare sehen", fehlte
 * die Kachel auf der Startseite, aber das Panel zeigte weiter alle Formulare
 * samt CSV-Export (Audit 11/2026, VERW-03). Zwei Wege, zwei Antworten auf
 * dieselbe Rechtefrage — und einer davon fuehrte am Entzug vorbei.
 */
export type AdminRechte = {
  /** grading_view_all aus der Matrix (Superadmin: immer). */
  gradingAlle: boolean
}

export function adminTabsFor(role: Role | undefined | null, rechte: AdminRechte): AdminTab[] {
  if (role === 'superadmin') return [...ADMIN_TABS]
  // Der Training Admin bekommt den Grading-Bereich — der Verlauf je Pilot und
  // die Standardisierung sind seine Aufgabe (er fuehrt die Ablage nach
  // ORA.GEN.220). Aber nur, solange die Matrix ihm den vollen Archivzugriff
  // laesst: Der Bereich zeigt den ganzen Bestand samt Export, ein Teilblick
  // ist dort nicht vorgesehen. Chats und Feedback gehoeren dem Gruppenadmin:
  // Er verwaltet keine Gruppen, also hat er dort auch nichts zu entscheiden.
  // Die Logbuch-Auswertung (alle Zeiten aller Instruktoren, aufgeschluesselt)
  // bleibt dem Superadmin vorbehalten: Der Training Admin oeffnet einzelne
  // Logbuecher ueber die Kachel, der Ueberblick ueber den ganzen Bestand ist
  // Leitungsaufgabe.
  if (role === 'training_admin') return rechte.gradingAlle ? ['grading'] : []
  if (role === 'group_admin') return ['groups', 'feedback']
  return []
}

/**
 * „Rechte dieser Person" in der Benutzerzeile fuehrte auf die Rechte-Seite —
 * aber ohne Filter: Man stand vor der Liste aller Personen und musste die,
 * von der man kam, ein zweites Mal suchen (Audit 11/2026, VERW-22). Der Link
 * traegt die E-Mail jetzt als `?q=` mit, die Rechte-Seite belegt ihre Suche
 * daraus vor. Die E-Mail, weil sie eindeutig ist; ein Name ist es nicht.
 */
export function rechteLink(email: string): string {
  return `/admin/permissions?q=${encodeURIComponent(email)}`
}

/**
 * Suchbegriff aus der Hash-Adresse (`#/admin/permissions?q=…`). Ohne `?q=`
 * leer — die Seite zeigt dann wie bisher alle. Nimmt den ganzen Hash, damit
 * die Ansicht `window.location.hash` unbearbeitet hineinreichen kann.
 */
export function suchAusQuery(hash: string): string {
  const frage = hash.indexOf('?')
  if (frage < 0) return ''
  return (new URLSearchParams(hash.slice(frage + 1)).get('q') ?? '').trim()
}

/** Hat diese Rolle mit diesen Rechten ueberhaupt ein Panel? */
export function hatAdminPanel(role: Role | undefined | null, rechte: AdminRechte): boolean {
  return adminTabsFor(role, rechte).length > 0
}

/**
 * Bereiche des Panels fuer eine Person — mit den Rechten aus der Matrix.
 *
 * Alle Aufrufer (Startseite, Reiter, Statuszeile, Chatliste) fragen DIESE
 * Funktion und reichen die Matrix nicht selbst durch. Sonst vergisst die
 * vierte Stelle das zweite Argument, und die Kachel fuehrt wieder ins Leere.
 */
export function adminTabsFuer(settings: Settings, user: User | null | undefined): AdminTab[] {
  return adminTabsFor(user?.role, { gradingAlle: userHasPerm(settings, user, 'grading_view_all') })
}

/**
 * Hat dieser Nutzer ein Admin-Panel? Zwei Aufzaehlungen derselben Freigabe
 * hatten sich schon einmal widersprochen — deshalb leitet sich die Antwort
 * aus `adminTabsFuer` ab, nicht aus einer eigenen Rollenliste.
 */
export function isAdminUser(settings: Settings, user: User | null | undefined): boolean {
  return adminTabsFuer(settings, user).length > 0
}

/** Was eine Rechtefrage von einer Person liest — ein Konto, das erst
 *  angelegt wird, hat noch keine Kennung, aber schon eine Rolle. */
export type RechtePerson = Pick<User, 'role' | 'canGrade' | 'canEditDirectory'>

/**
 * Rechte-Matrix: Der Superadmin darf immer alles. Admin und Training Admin
 * folgen der im Superadmin-Panel gepflegten Matrix. Nur beim Mitglied
 * steuern zwei Flags an der Person, was die Matrix sonst der Rolle gibt:
 * `canGrade` (Formulare anlegen) und `canEditDirectory` (Who to call).
 *
 * Lag frueher in store.tsx — ausserhalb beider Testwachen, obwohl jede
 * Rechtefrage der App hier beantwortet wird (Audit 11/2026, VERW-02).
 */
export function userHasPerm(settings: Settings, user: RechtePerson | null | undefined, key: PermKey): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  if (user.role === 'member') {
    if (key === 'grading_create') return user.canGrade
    if (key === 'contacts_manage') return user.canEditDirectory
    return false
  }
  return settings.permissions[user.role]?.[key] ?? false
}

/**
 * Darf dieser Nutzer das Modul ueberhaupt betreten? Der Training Admin ist auf
 * die Formularablage begrenzt; weitere Module oeffnen sich nur, wenn die
 * Rechte-Matrix sie ihm freischaltet. Alle anderen Rollen sehen alles —
 * die Feinsteuerung passiert innerhalb der Module.
 */
export function userMayModule(settings: Settings, user: RechtePerson | null | undefined, module: ModuleKey): boolean {
  if (!user) return false
  if (module === 'grading') return userHasPerm(settings, user, 'grading_create') || userHasPerm(settings, user, 'grading_view_all')
  if (user.role !== 'training_admin') return true
  if (module === 'info') return userHasPerm(settings, user, 'info_manage')
  if (module === 'lessons') return userHasPerm(settings, user, 'lessons_manage')
  if (module === 'contacts') return userHasPerm(settings, user, 'contacts_manage')
  // Notizen bekommt der Training Admin bewusst nicht: Seine Rolle ist die
  // lesende Sicht auf die Formularablage, keine Instruktorentaetigkeit — er
  // hat nichts, wofuer er sich etwas fuer die naechste Session merken muesste.
  return false
}

/** Darf der Nutzer in dieser Gruppe administrieren? Superadmin ueberall. */
export function isGroupAdmin(user: User | null, group: Group): boolean {
  if (!user) return false
  return user.role === 'superadmin' || group.adminIds.includes(user.id)
}

/**
 * Rechte, die an der einzelnen Person haengen — nicht an ihrer Rolle.
 *
 * Sie standen verstreut: vier Kaestchen in der aufgeklappten Nutzerzeile,
 * dieselben vier als Schalter der Sammelbearbeitung, und die Rollen-Matrix
 * daneben in einem eigenen Bereich. Wer wissen wollte, was jemand darf,
 * musste an drei Stellen nachsehen und die Antworten selbst zusammenlegen.
 *
 * Die Liste steht hier, damit Matrix, Nutzerzeile und Sammelbearbeitung
 * dieselben Rechte in derselben Reihenfolge zeigen.
 */
export const PERSON_PERMS = ['canGrade', 'isTrainee', 'canEditDirectory', 'chatBlocked'] as const
export type PersonPerm = (typeof PERSON_PERMS)[number]

/**
 * Ist dieses Recht eine Sperre statt einer Erlaubnis?
 *
 * `chatBlocked` ist das einzige umgekehrt gemeinte: Ein Haken nimmt etwas
 * weg, statt etwas zu geben. In einer Tabelle mit vier Spalten liest sich das
 * sonst falsch herum — die Ansicht faerbt es deshalb anders.
 */
export function istSperre(perm: PersonPerm): boolean {
  return perm === 'chatBlocked'
}

/**
 * Welches Rollen-Recht ein Personenrecht beim Mitglied ersetzt. Nur diese
 * beiden haben ein Gegenstueck in der Matrix; Trainee und Chat-Sperre gibt
 * es nur an der Person.
 */
const MATRIX_RECHT: Partial<Record<PersonPerm, PermKey>> = {
  canGrade: 'grading_create',
  canEditDirectory: 'contacts_manage',
}

/**
 * Bewirkt das Kaestchen bei dieser Rolle ueberhaupt etwas?
 *
 * „Darf bewerten" und „Darf Who to call bearbeiten" wertet `userHasPerm` nur
 * beim Mitglied aus; bei Admin und Training Admin entscheidet die Matrix,
 * beim Superadmin nichts (er darf alles). Die Rechte-Seite bot die Kaestchen
 * trotzdem fuer alle an: Wer einem Admin das Bewerten entzog, sah den Haken
 * verschwinden — und der Admin bewertete weiter (Audit 11/2026, VERW-02).
 * Trainee und Chat-Sperre wirken bei jeder Rolle (Trainee-Auswahl,
 * sendMessage/createPoll).
 */
export function personenRechtWirkt(role: Role, perm: PersonPerm): boolean {
  return MATRIX_RECHT[perm] === undefined || role === 'member'
}

/**
 * Was gilt fuer diese Person TATSAECHLICH? Wirkt das Kaestchen nicht, zeigt
 * die Rechte-Seite den Wert aus der Rolle (Matrix bzw. Superadmin) — sie soll
 * die wirksamen Rechte zeigen, nicht ein gespeichertes Flag ohne Folgen.
 */
export function personenRechtWirksam(settings: Settings, user: User, perm: PersonPerm): boolean {
  const recht = MATRIX_RECHT[perm]
  if (recht) return userHasPerm(settings, user, recht)
  return perm === 'chatBlocked' ? !!user.chatBlocked : user[perm]
}
