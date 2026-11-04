import type { Role } from '../../types'
import type { DocCheckAktion, DocCheckAuditEintrag, DocCheckFlags, DocCheckRolle } from './types'

/**
 * Wer darf in DocCheck was? — an EINER Stelle.
 *
 * Kachel, Route, Reiter und Store fragen alle hier. Das ist dieselbe Lehre
 * wie bei `adminTabsFor`: Zwei Aufzählungen derselben Sache laufen
 * auseinander, und dann steht hinter einer Kachel „kein Zugriff".
 *
 * Wichtig, und im Integrationsbericht benannt: Solange es kein Backend gibt,
 * ist das hier Bedienkomfort, keine Durchsetzung. Die Spezifikation verlangt
 * die Durchsetzung in RLS (Kap. 5.2) — die kommt mit Phase 1b. Diese Matrix
 * ist dann die Vorlage für die Policies und für den Rollen-Test, der jede
 * Zeile mit jeder Rolle durchprobiert.
 */

interface NutzerLike extends DocCheckFlags {
  role: Role
  active: boolean
}

/**
 * DocCheck ist den Admin-Rollen vorbehalten (Entscheidung vom 04.11.2026):
 * Superadmin, Gruppenadmin und Training Admin können Zugang bekommen, ein
 * Mitglied (Instruktor) nie. Die Spezifikation (3.4) hatte den Zugang von
 * der Rolle getrennt; in der Sandbox hatte deshalb ein Instruktor Zugang zu
 * vertraulichen Herstellerunterlagen, und ein zum Mitglied herabgestufter
 * Admin behielt ihn still. Eine Absprache „nie an Instruktoren" hielt das
 * nicht — ein Haken, den man nie setzen darf, sollte es nicht geben.
 *
 * Dieselbe Regel steht in der Datenbank (Prüfregel auf profiles,
 * `doccheck.rolle_aus`, `set_rights`); `src/backend/rls.test.ts` hält beide
 * gegeneinander.
 */
export function docCheckMoeglich(role: Role): boolean {
  return role !== 'member'
}

export function docCheckRolle(u: NutzerLike | null | undefined): DocCheckRolle {
  if (!u || !u.active) return 'keine'
  // Spez. 3.4: Der Superadmin von InstructorConnect ist automatisch
  // DocCheck-Superadmin — ohne Schalter, und ohne dass man es ihm nehmen kann.
  if (u.role === 'superadmin') return 'superadmin'
  // Auch ein gespeicherter Haken wirkt beim Mitglied nicht — ein Stand von
  // vor der Regel, ein Import, ein Fehler an anderer Stelle.
  if (!docCheckMoeglich(u.role) || !u.docCheckAccess) return 'keine'
  return u.docCheckAdmin ? 'admin' : 'nutzer'
}

/**
 * Nutzer ohne DocCheck-Schalter, wenn seine Rolle keinen erlaubt — sonst
 * unverändert (dasselbe Objekt, damit `migrateState` keine Änderung meldet,
 * wo keine ist).
 *
 * Gebraucht beim Rollenwechsel auf Mitglied und beim Laden eines alten
 * Stands. Ohne das stünde der Haken weiter im Datensatz, wirkungslos — und
 * wer die Person später wieder zum Admin machte, gäbe ihr den Zugang zurück,
 * ohne ihn je vergeben zu haben. Wie in der Datenbank
 * (`profiles_guard_mitglied`): herabgestuft heißt Zugang weg.
 */
export function docCheckBereinigt<T extends DocCheckFlags & { role: Role }>(u: T): T {
  if (docCheckMoeglich(u.role) || (!u.docCheckAccess && !u.docCheckAdmin)) return u
  return { ...u, docCheckAccess: false, docCheckAdmin: false }
}

const ALLE: DocCheckRolle[] = ['nutzer', 'admin', 'superadmin']
const PFLEGE: DocCheckRolle[] = ['admin', 'superadmin']
const SUPER: DocCheckRolle[] = ['superadmin']

/** Spez. Kap. 5.1, Zeile für Zeile. */
const MATRIX: Record<DocCheckAktion, DocCheckRolle[]> = {
  kachel: ALLE,
  bibliothekLesen: ALLE,
  pdfAnsehen: ALLE,
  // Ansehen ja, herunterladen nein — ein Bedienungsschutz, kein
  // Kopierschutz (Spez. 5.5). Er gilt trotzdem.
  pdfHerunterladen: PFLEGE,
  pruefen: ALLE,
  bibliothekPflegen: PFLEGE,
  endgueltigLoeschen: SUPER,
  erinnerungBestaetigen: PFLEGE,
  konfigurieren: SUPER,
  protokolleLesen: SUPER,
}

/** Alle Aktionen der Matrix — für den Rollentest gegen die Datenbank (supabase/migrations). */
export const AKTIONEN = Object.keys(MATRIX) as DocCheckAktion[]

export function darf(rolle: DocCheckRolle, aktion: DocCheckAktion): boolean {
  return MATRIX[aktion].includes(rolle)
}

/**
 * Neue Schalterstellung aus einem Wunsch ableiten.
 *
 * „DocCheck admin" setzt „DocCheck access" voraus (Spez. 3.4). Statt einen
 * unmöglichen Zustand abzulehnen, folgt der andere Schalter mit: Wer jemanden
 * zum Admin macht, will ihm den Zugang geben; wer den Zugang nimmt, nimmt
 * auch die Pflege. Ein Admin ohne Zugang wäre ein Zustand, den keine Ansicht
 * erklären kann.
 */
export function rechteSetzen(alt: DocCheckFlags, wunsch: DocCheckFlags): Required<DocCheckFlags> {
  let access = wunsch.docCheckAccess ?? !!alt.docCheckAccess
  let admin = wunsch.docCheckAdmin ?? !!alt.docCheckAdmin
  if (wunsch.docCheckAdmin === true) access = true
  if (!access) admin = false
  return { docCheckAccess: access, docCheckAdmin: admin }
}

/**
 * Darf diese Schalterstellung für diese Rolle gespeichert werden? Einem
 * Mitglied DocCheck zu GEBEN wird abgelehnt (wie `set_rights` in der
 * Datenbank, IC-DOCCHECK-ROLE); einen Haken aus einem alten Stand zu
 * ENTFERNEN geht immer.
 */
export function rechteErlaubt(role: Role, neu: Required<DocCheckFlags>): boolean {
  return docCheckMoeglich(role) || (!neu.docCheckAccess && !neu.docCheckAdmin)
}

/**
 * Protokollzeilen für eine Rechteänderung (Spez. 3.4: „Jede Änderung einer
 * Berechtigung wird im Audit-Log protokolliert"). Nur was sich WIRKLICH
 * ändert, erscheint — ein Klick auf einen schon gesetzten Schalter ist kein
 * Ereignis.
 */
export function rechteAudit(
  alt: DocCheckFlags,
  neu: Required<DocCheckFlags>,
  kontext: { von: string; ziel: string; at: number; id: () => string },
): DocCheckAuditEintrag[] {
  const out: DocCheckAuditEintrag[] = []
  const paare: [keyof DocCheckFlags, DocCheckAuditEintrag['aktion']][] = [
    ['docCheckAccess', 'zugang'],
    ['docCheckAdmin', 'admin'],
  ]
  for (const [feld, aktion] of paare) {
    const vorher = !!alt[feld]
    if (vorher !== neu[feld]) {
      out.push({ id: kontext.id(), at: kontext.at, von: kontext.von, aktion, ziel: kontext.ziel, wert: `${vorher} → ${neu[feld]}` })
    }
  }
  return out
}

/**
 * Protokollzeile für einen Rollen- oder Statuswechsel, der die DocCheck-Rolle
 * ändert.
 *
 * Die DocCheck-Rolle hängt nicht nur an den beiden Schaltern: Der Superadmin
 * ist automatisch DocCheck-Superadmin, und ein deaktiviertes Konto hat gar
 * keine. Wer Chris zum Superadmin machte oder Mika deaktivierte, änderte
 * also DocCheck-Rechte — protokolliert wurde nur `setDocCheckRights`, und der
 * folgenreichste Wechsel stand nirgends (Audit 11/2026, VERW-15; Spez. 3.4:
 * „Jede Änderung einer Berechtigung wird im Audit-Log protokolliert").
 *
 * `vorher = null` heißt: neues Konto (vorher „keine"). Eine Zeile nur, wenn
 * sich die DocCheck-Rolle tatsächlich ändert — ein Wechsel Mitglied → Admin
 * ohne DocCheck-Zugang ist für DocCheck kein Ereignis. Dieselbe Regel steht
 * in der Datenbank als Trigger (supabase/migrations, `rollen_audit`).
 */
export function rollenAudit(
  vorher: NutzerLike | null,
  nachher: NutzerLike,
  kontext: { von: string; ziel: string; at: number; id: () => string },
): DocCheckAuditEintrag[] {
  const alt = docCheckRolle(vorher)
  const neu = docCheckRolle(nachher)
  if (alt === neu) return []
  return [{ id: kontext.id(), at: kontext.at, von: kontext.von, aktion: 'rolle', ziel: kontext.ziel, wert: `${alt} → ${neu}` }]
}

/**
 * Re-Check bestätigt (N11): Ins Audit gehören nur Nummer und Status, nie
 * Befundtext — dieselbe Regel wie `doccheck.log_recheck` in der Migration,
 * `src/backend/rls.test.ts` hält beide gegeneinander.
 *
 * Vorher übernahm die Sandbox die Nummernspalte ungeprüft: Stand dort Text,
 * landeten bis zu 300 Zeichen Befundtext im gespeicherten Zustand
 * („CONFIDENTIAL OEM remark …: Not verifiable"), und mit Backend wäre
 * derselbe Klick an IC-INPUT gescheitert — schon bei „F 001" (Audit 11/2026,
 * SEC-06). Jetzt steht für eine Nummer, die die Regel nicht erfüllt, die
 * Zeile der Liste (`#<Zeile>`, wie `befundeLesen` es ohne Nummer tut); ein
 * Status außerhalb der festen Liste fällt weg.
 */
export const RECHECK_STATUS: readonly string[] = ['Resolved', 'Partially resolved', 'Not resolved', 'Not verifiable', 'Closed – justification required']
/** Wie `log_recheck`: höchstens so viele Einträge je Aufruf — mehr werden mehrere Zeilen, nicht abgeschnitten. */
export const RECHECK_JE_AUFRUF = 500
const RECHECK_REF = /^[A-Za-z0-9._#/-]{1,20}$/

/** `zeile`: Zeile der Liste, wie der Nutzer sie sieht (Excel-Zeile, bei CSV Zeile ab 1). */
export interface RecheckEintrag {
  ref: string
  zeile: number
  status: string
}

/** Einträge, wie `log_recheck` sie annimmt. */
export function recheckEintraege(eintraege: RecheckEintrag[]): { ref: string; status: string }[] {
  return eintraege
    .filter((e) => RECHECK_STATUS.includes(e.status))
    .map((e) => ({ ref: RECHECK_REF.test(e.ref) ? e.ref : `#${Number.isSafeInteger(e.zeile) && e.zeile > 0 ? e.zeile : 0}`, status: e.status }))
}

/** Audit-Zeilen fürs Bestätigen — je höchstens 500 Einträge; Listenname ohne Steuerzeichen, höchstens 200 Zeichen, Wert höchstens 2000 (wie die Datenbank). */
export function recheckAudit(liste: string, eintraege: RecheckEintrag[], kontext: { von: string; at: number; id: () => string }): DocCheckAuditEintrag[] {
  const ok = recheckEintraege(eintraege)
  const ziel = [...liste.replace(/\p{Cc}/gu, '')].slice(0, 200).join('')
  const out: DocCheckAuditEintrag[] = []
  for (let i = 0; i < ok.length; i += RECHECK_JE_AUFRUF) {
    const wert = ok.slice(i, i + RECHECK_JE_AUFRUF).map((e) => `${e.ref}: ${e.status}`).join(', ')
    out.push({ id: kontext.id(), at: kontext.at, von: kontext.von, aktion: 'recheckBestaetigt', ziel, wert: wert.slice(0, 2000) })
  }
  return out
}

/**
 * Zahl auf der Kachel (Spez. 3.2): offene Nachprüf-Empfehlungen für alle,
 * fällige Revisionserinnerungen zusätzlich für die, die sie bestätigen
 * dürfen. Ein Nutzer, der nichts tun kann, bekommt keine Mahnung.
 */
export function kachelZahl(rolle: DocCheckRolle, offeneEmpfehlungen: number, faelligeErinnerungen: number): number {
  if (rolle === 'keine') return 0
  return offeneEmpfehlungen + (darf(rolle, 'erinnerungBestaetigen') ? faelligeErinnerungen : 0)
}
