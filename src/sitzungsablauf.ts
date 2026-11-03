/**
 * Was geschieht mit einer Anmeldung, deren Zeit um ist?
 *
 * Sitzungen gelten bis Mitternacht. Der Takt im Store meldete bisher ab,
 * sobald die Zeit um war — auch mitten in einem offenen Formular. Wer um
 * 23:58 den Piloten unterschreiben ließ, stand um 00:00 vor der Anmeldung;
 * der Entwurf rettete Text und Noten, die Unterschriften nicht (sie werden
 * bewusst nie im Entwurf gesichert). Nachtschichten im FFS sind üblich
 * (Audit 11/2026, TEC-04).
 *
 * Jetzt gilt: Ist beim Ablauf Arbeit offen (editGuard: Formular,
 * Nachtragsunterschrift, Chat-Entwurf, Dialog, DocCheck-Sitzung), wird
 * gewarnt statt abgemeldet — bis sie gesichert oder verworfen ist, höchstens
 * aber NACHFRIST_MS lang. Ein gesperrtes Konto meldet immer sofort ab: Wer
 * deaktiviert wurde, arbeitet nicht weiter, auch nicht „nur noch kurz".
 */

export type SitzungsSchritt = 'bleiben' | 'warnen' | 'abmelden'

/**
 * Obergrenze der Nachfrist nach dem Ablauf. Lang genug für eine Session im
 * Simulator samt Nachbesprechung; ohne Grenze hielte ein vergessenes offenes
 * Formular eine Anmeldung beliebig lange am Leben.
 */
export const NACHFRIST_MS = 2 * 60 * 60 * 1000

export interface SitzungsLage {
  /** Ablaufzeitpunkt der gespeicherten Sitzung; 0 = keine (in einem anderen Tab abgemeldet) */
  ablauf: number
  jetzt: number
  /** Konto deaktiviert oder gelöscht */
  gesperrt: boolean
  /** hasUnsavedWork() — irgendetwas würde beim Abmelden verloren gehen */
  offeneArbeit: boolean
}

export function sitzungsSchritt({ ablauf, jetzt, gesperrt, offeneArbeit }: SitzungsLage): SitzungsSchritt {
  if (gesperrt) return 'abmelden'
  // Kein Eintrag mehr heißt: Jemand hat sich ausdrücklich abgemeldet (in
  // diesem Browser, anderer Tab). Das gilt überall — anders als der Ablauf
  // um Mitternacht, den niemand bewusst ausgelöst hat.
  if (ablauf === 0) return 'abmelden'
  if (ablauf > jetzt) return 'bleiben'
  if (offeneArbeit && jetzt - ablauf < NACHFRIST_MS) return 'warnen'
  return 'abmelden'
}
