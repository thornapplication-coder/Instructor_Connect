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
 * **Auch Verwalter sind zugeordnet.** Wer Lesson Plans oder Info-Einträge
 * pflegt, sieht sie für die Muster, für die er zuständig ist — nicht für
 * alle. Das war die ausdrückliche Vorgabe, und es hat eine Kehrseite, die
 * man kennen muss: Um Inhalte eines Musters zu verwalten, muss man diesem
 * Muster zugeordnet sein. Die Zuordnung ist deshalb eine Mehrfachauswahl,
 * und beim Anlegen eines Kontos Pflicht.
 *
 * **Nicht betroffen sind die Nachweise.** Formularablage, Statistik und
 * Behördenexport bleiben rollenbasiert. Ein Training Admin mit nur einem
 * Muster sähe sonst einen Ausschnitt des Archivs — und die
 * Aufbewahrungspflicht (ORA.GEN.220) gilt für den ganzen Bestand, nicht für
 * den eigenen Teil davon.
 */

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

/** Liste auf den Musterbereich einer Person eindampfen. */
export function nachMuster<T>(eigene: string[] | undefined, liste: T[], musterVon: (x: T) => string | undefined | null): T[] {
  return liste.filter((x) => imMusterbereich(eigene, musterVon(x)))
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
