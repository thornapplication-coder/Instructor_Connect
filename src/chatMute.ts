/**
 * Stummschaltung des Chats — eine persoenliche Einstellung je Nutzer und
 * Gruppe (Audit 11/2026, KERN-06).
 *
 * Sie lag als `muted` am Gruppenobjekt: Mika schaltete „SIM Defects" stumm,
 * und Alex' Chat-Info zeigte danach ebenfalls „Benachrichtigungen stumm" —
 * jedes Mitglied schaltete die Gruppe fuer alle stumm oder wieder laut, ohne
 * Recht und ohne Hinweis. Das Impressum sagt Stummschalten „pro Gruppe" als
 * eigene Wahl zu. Jetzt steht je Nutzer die Liste seiner stummen Gruppen im
 * Zustand (`mutedGroups`), und nur er selbst aendert sie.
 */

/** Je Nutzer die IDs seiner stumm geschalteten Gruppen. */
export type StummListe = Record<string, string[]>

/** Hat dieser Nutzer diese Gruppe stumm geschaltet? */
export function istStumm(liste: StummListe | undefined, userId: string | null | undefined, groupId: string): boolean {
  if (!userId) return false
  return liste?.[userId]?.includes(groupId) ?? false
}

/**
 * Schaltet die Gruppe fuer GENAU diesen Nutzer um und gibt die neue Liste
 * zurueck. Die Eintraege anderer Nutzer bleiben dieselben Objekte.
 */
export function schalteStumm(liste: StummListe | undefined, userId: string, groupId: string): StummListe {
  const alt = liste ?? {}
  const eigene = alt[userId] ?? []
  const neu = eigene.includes(groupId) ? eigene.filter((g) => g !== groupId) : [...eigene, groupId]
  return { ...alt, [userId]: neu }
}
