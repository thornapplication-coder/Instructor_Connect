/**
 * Ist der Sandbox-Betrieb aktiv?
 *
 * Die Sandbox-Leiste trug den Kommentar „Erscheint nie in Produktion" — es
 * gab dafür aber keinerlei Bedingung. Sie war in jedem Build enthalten, und
 * mit ihr drei Werkzeuge, die jedem angemeldeten Nutzer offenstanden:
 * Identitätswechsel ohne Anmeldung, Zeitverschiebung (die in `signedAt` UND
 * in den Fingerabdruck einfließt) und das Löschen des gesamten Bestands.
 *
 * Der Schalter steht bewusst standardmäßig auf AN: Die heutige
 * Veröffentlichung IST die Sandbox-Demo, sie soll unverändert weiterlaufen.
 * Sobald es einen echten Betrieb gibt, wird `VITE_SANDBOX=false` gesetzt —
 * dann verschwindet die Leiste, und die drei Eingriffe verweigern den
 * Dienst auch dann, wenn jemand sie über die Konsole aufruft.
 */
export const SANDBOX: boolean = import.meta.env.VITE_SANDBOX !== 'false'
