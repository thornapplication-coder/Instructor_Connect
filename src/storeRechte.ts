import { adminTabsFuer, isGroupAdmin, userHasPerm, type AdminTab } from './adminAccess'
import { nachMuster, sichtbarFuer } from './aircraftScope'
import { mayAccessGroup } from './gruppen'
import type { FeedbackEntry, Group, Poll, Settings, User } from './types'

/**
 * Wer darf welche SCHREIBENDE Store-Aktion ausloesen?
 *
 * Der Store hat die Regel „Rechte werden an der Aktion geprueft, nicht nur
 * beim Rendern" — und hielt sie nur zur Haelfte: setPermission,
 * setDocCheckRights, importUsers und die Rolle in updateUser fragten den
 * Handelnden, addUser, updateSettings, die Feedback-, Info-, Kontakt- und
 * Lesson-Plan-Aktionen, addGroup und die Umfragen fragten niemanden. Ein
 * Superadmin, der gar nicht Mitglied war, stimmte in einer Gruppe ab; addUser
 * legte aus einer offen gebliebenen Ansicht jede Rolle bis zum Superadmin an
 * (Audit 11/2026, VERW-23, KERN-19).
 *
 * Die Regeln stehen hier als reine Funktionen, weil sie zwei Leser haben: den
 * Store, der eine Aktion ohne Recht verwirft, und die Oberflaeche, die den
 * Knopf dann gar nicht erst zeigt. Mit Phase 1b werden sie Vorlage fuer RLS —
 * deshalb ist der Test die Matrix Rolle × Fall, ausgeschrieben wie bei
 * access.ts.
 *
 * Ohne Backend bleibt das Bedienkomfort (CLAUDE.md): Wer den Browser
 * kontrolliert, kontrolliert seinen Zustand. Was es verhindert, sind die
 * Wege, die versehentlich offen stehen — ein zweiter Tab, eine Ansicht nach
 * „Ansicht als", ein Knopf, den eine Ansicht zu grosszuegig zeigt.
 */

type Handelnder = User | null | undefined

/** Ein deaktiviertes Konto handelt nicht mehr — auch nicht aus einem Tab,
 *  der vor der Deaktivierung offen war. */
function aktiv(actor: Handelnder): actor is User {
  return !!actor && actor.active !== false
}

/* ===================== Verwaltung ===================== */

export type VerwaltungsAktion = 'nutzerAnlegen' | 'nutzerAendern' | 'einstellungen' | 'feedback'

/**
 * Welcher Bereich des Admin-Panels eine Aktion traegt. Die Antwort kommt aus
 * `adminTabsFuer` — derselben Stelle, die Kachel, Reiter und Statuszeile
 * fragen. Eine eigene Rollenliste hier waere die zweite Aufzaehlung derselben
 * Freigabe, und zwei solche hatten sich schon einmal widersprochen.
 */
const BEREICH: Record<VerwaltungsAktion, AdminTab[]> = {
  nutzerAnlegen: ['users'],
  // Die Personenrechte (bewerten, Trainee, Verzeichnis, Chat-Sperre) stehen
  // unter „Berechtigungen" und laufen ebenfalls ueber updateUser.
  nutzerAendern: ['users', 'permissions'],
  // Das Impressum ist eine Einstellung (settings.imprint).
  einstellungen: ['settings', 'imprint'],
  feedback: ['feedback'],
}

export function darfVerwaltung(settings: Settings, actor: Handelnder, aktion: VerwaltungsAktion): boolean {
  if (!aktiv(actor)) return false
  const tabs = adminTabsFuer(settings, actor)
  return BEREICH[aktion].some((b) => tabs.includes(b))
}

/**
 * Rueckmeldungen, die diese Person im Panel sieht.
 *
 * Zwei Schranken, beide notwendig: die Gruppe (ein Gruppenadmin sieht nur
 * seine Leute) und das Muster (Feedback traegt einen Aircraft Type und folgt
 * derselben Regel wie Lesson Plans, Info und Chats). Stand als Rechnung in
 * store.tsx; hier, damit Sicht und Schreibrecht dieselbe Antwort geben —
 * sonst erledigt ein Gruppenadmin per Kennung, was er gar nicht sieht.
 */
export function feedbackFuer<F extends Pick<FeedbackEntry, 'authorId' | 'aircraftType'>>(
  user: Handelnder,
  eintraege: F[],
  groups: Pick<Group, 'adminIds' | 'memberIds'>[],
): F[] {
  if (!user) return []
  const meineLeute = new Set(groups.filter((g) => g.adminIds.includes(user.id)).flatMap((g) => g.memberIds))
  return nachMuster(user, eintraege, (f) => f.aircraftType).filter(
    (f) => user.role === 'superadmin' || meineLeute.has(f.authorId),
  )
}

/** Erledigen, wieder oeffnen, loeschen: wer den Feedback-Bereich hat UND den
 *  Eintrag darin sieht. */
export function darfFeedbackBearbeiten(
  settings: Settings,
  actor: Handelnder,
  eintrag: Pick<FeedbackEntry, 'authorId' | 'aircraftType'>,
  groups: Pick<Group, 'adminIds' | 'memberIds'>[],
): boolean {
  return darfVerwaltung(settings, actor, 'feedback') && feedbackFuer(actor, [eintrag], groups).length === 1
}

/**
 * Grading-Konfiguration (Formulartypen, Kompetenzkataloge, Empfänger):
 * nur der Superadmin. Die Ansicht zeigte den Bereich schon nur ihm, aber
 * `updateGrading` und `removeFormType` fragten niemanden — ein Training
 * Admin mit `grading_view_all` hat den Grading-Bereich, nicht dessen
 * Konfiguration, und ein Tab nach einem Rollenwechsel änderte sie weiter
 * (Audit 11/2026, Runde 3, Rest aus R3-FORMULARTYP). Eine Stelle für Ansicht
 * und Store, damit beide dieselbe Antwort geben.
 */
export function darfGradingKonfigurieren(actor: Handelnder): boolean {
  return aktiv(actor) && actor.role === 'superadmin'
}

/* ===================== Inhalte ===================== */

/**
 * Info-Eintrag anlegen oder loeschen: Recht `info_manage` und das Muster des
 * Eintrags im eigenen Bereich. Was jemand einem Inhalt an Muster geben darf,
 * ist das, was er sieht (`musterZurAuswahl`) — ein fremdes Muster haette er
 * angelegt und im selben Moment aus den Augen verloren. Ohne Muster heisst
 * „fuer alle" und liegt in jedem Bereich.
 */
export function darfInfoVerwalten(settings: Settings, actor: Handelnder, muster: string | undefined | null): boolean {
  return aktiv(actor) && userHasPerm(settings, actor, 'info_manage') && sichtbarFuer(actor, muster)
}

/** Lesson Plan hochladen oder loeschen — dieselbe Regel mit `lessons_manage`. */
export function darfLessonPlansVerwalten(settings: Settings, actor: Handelnder, muster: string | undefined | null): boolean {
  return aktiv(actor) && userHasPerm(settings, actor, 'lessons_manage') && sichtbarFuer(actor, muster)
}

/** Who to call pflegen. Das Verzeichnis ist nicht musterbezogen. */
export function darfKontakteVerwalten(settings: Settings, actor: Handelnder): boolean {
  return aktiv(actor) && userHasPerm(settings, actor, 'contacts_manage')
}

/* ===================== Chat ===================== */

/**
 * Gruppe anlegen: wer den Gruppenbereich des Panels hat (Superadmin,
 * Gruppenadmin), und nur mit einem Muster, das er selbst sieht — der Anleger
 * wird Mitglied und koennte eine Gruppe fremden Musters sonst nicht betreten.
 */
export function darfGruppeAnlegen(settings: Settings, actor: Handelnder, muster: string | undefined | null): boolean {
  if (!aktiv(actor)) return false
  return adminTabsFuer(settings, actor).includes('groups') && sichtbarFuer(actor, muster)
}

/**
 * Schreiben — Nachricht oder Umfrage: nur Mitglieder, im eigenen
 * Musterbereich, ohne Chat-Sperre. Der Superadmin verwaltet jede Gruppe,
 * spricht aber nur in denen, deren Mitglied er ist.
 */
export function darfSchreiben(actor: Handelnder, group: Pick<Group, 'memberIds' | 'aircraftType'>): boolean {
  if (!aktiv(actor) || actor.chatBlocked) return false
  return group.memberIds.includes(actor.id) && sichtbarFuer(actor, group.aircraftType)
}

/**
 * Abstimmen: nur Mitglieder im eigenen Musterbereich. Die Chat-Sperre greift
 * hier bewusst nicht — sie heisst „mitlesen ja, senden nein", und eine Stimme
 * ist keine Nachricht. Ein Superadmin ohne Mitgliedschaft stimmt NICHT ab:
 * Er sieht die Gruppe, aber die Umfrage fragt ihre Mitglieder.
 */
export function darfAbstimmen(actor: Handelnder, group: Pick<Group, 'memberIds' | 'aircraftType'>): boolean {
  if (!aktiv(actor)) return false
  return group.memberIds.includes(actor.id) && sichtbarFuer(actor, group.aircraftType)
}

/**
 * Umfrage schliessen: Autor oder Admin der Gruppe (Superadmin ueberall) —
 * dieselbe Regel, nach der die Umfragekarte den Knopf zeigt. Der Zugang zur
 * Gruppe gehoert dazu: Ein Gruppenadmin einer Gruppe fremden Musters kommt
 * nicht hinein, also auch nicht an ihre Umfragen.
 */
export function darfUmfrageSchliessen(actor: Handelnder, poll: Pick<Poll, 'authorId'>, group: Group): boolean {
  if (!aktiv(actor) || !mayAccessGroup(actor, group)) return false
  return poll.authorId === actor.id || isGroupAdmin(actor, group)
}

/** Benachrichtigungen einer Gruppe stumm schalten: wer die Gruppe betreten
 *  kann. */
export function darfStummschalten(actor: Handelnder, group: Group): boolean {
  return aktiv(actor) && mayAccessGroup(actor, group)
}
