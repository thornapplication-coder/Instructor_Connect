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

export function docCheckRolle(u: NutzerLike | null | undefined): DocCheckRolle {
  if (!u || !u.active) return 'keine'
  // Spez. 3.4: Der Superadmin von InstructorConnect ist automatisch
  // DocCheck-Superadmin — ohne Schalter, und ohne dass man es ihm nehmen kann.
  if (u.role === 'superadmin') return 'superadmin'
  if (!u.docCheckAccess) return 'keine'
  return u.docCheckAdmin ? 'admin' : 'nutzer'
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
 * Zahl auf der Kachel (Spez. 3.2): offene Nachprüf-Empfehlungen für alle,
 * fällige Revisionserinnerungen zusätzlich für die, die sie bestätigen
 * dürfen. Ein Nutzer, der nichts tun kann, bekommt keine Mahnung.
 */
export function kachelZahl(rolle: DocCheckRolle, offeneEmpfehlungen: number, faelligeErinnerungen: number): number {
  if (rolle === 'keine') return 0
  return offeneEmpfehlungen + (darf(rolle, 'erinnerungBestaetigen') ? faelligeErinnerungen : 0)
}
