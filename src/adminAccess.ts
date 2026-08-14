import type { Role } from './types'

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
export const ADMIN_TABS = ['users', 'permissions', 'grading', 'groups', 'feedback', 'settings', 'imprint', 'changelog'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export function adminTabsFor(role: Role | undefined | null): AdminTab[] {
  if (role === 'superadmin') return [...ADMIN_TABS]
  // Der Training Admin bekommt den Grading-Bereich — der Verlauf je Pilot und
  // die Standardisierung sind seine Aufgabe (er fuehrt die Ablage nach
  // ORA.GEN.220). Chats und Feedback gehoeren dem Gruppenadmin: Er verwaltet
  // keine Gruppen, also hat er dort auch nichts zu entscheiden.
  if (role === 'training_admin') return ['grading']
  if (role === 'group_admin') return ['groups', 'feedback']
  return []
}

/** Hat diese Rolle ueberhaupt ein Panel? */
export function hatAdminPanel(role: Role | undefined | null): boolean {
  return adminTabsFor(role).length > 0
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
