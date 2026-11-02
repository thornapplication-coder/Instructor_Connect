/**
 * Sprung zu einem beanstandeten Feld: hinscrollen und das Bedienelement
 * fokussieren, an dem der Nutzer weitermacht.
 *
 * Audit 11/2026, GTY-12: Der Sprung suchte `field-<key>` und fand bei
 * Ankreuzgruppen nichts — die Gruppe trug keine id. „Please choose either
 * …" (308F) und „Required field missing: Training Device" (308C) standen
 * unter dem Weiter-Knopf, der Fokus blieb dort. Jetzt trägt die Gruppe die
 * id, und hier steht, was dann den Fokus bekommt: das Element selbst, wenn
 * es bedienbar ist, sonst das erste bedienbare darin (bei einer Gruppe der
 * erste Knopf), sonst der Bereich (Gruppen sind dafür mit tabIndex -1
 * fokussierbar, siehe Field).
 *
 * EINE Regel für den Kopf (Schritt 1) und die Liste der offenen Punkte
 * (Schritt 2) — vorher standen zwei Fassungen im Formular.
 */

/** Deaktivierte zählen nicht: Ein Fokus darauf ginge ins Leere. */
const BEDIENBAR = ['input', 'select', 'textarea', 'button'].map((t) => `${t}:not([disabled])`).join(', ')

export interface Sprungziel {
  /** wird ins Bild gescrollt */
  bereich: HTMLElement
  /** bekommt den Fokus */
  fokus: HTMLElement
}

export function sprungZiel(id: string, doc: Document): Sprungziel | null {
  const bereich = doc.getElementById(id)
  if (!bereich) return null
  if (bereich.matches(BEDIENBAR)) return { bereich, fokus: bereich }
  return { bereich, fokus: bereich.querySelector<HTMLElement>(BEDIENBAR) ?? bereich }
}

/** Hinspringen; `false`, wenn es das Ziel (noch) nicht gibt — etwa weil es
 *  auf dem anderen Schritt des Formulars steht. */
export function springeZuFeld(id: string, doc: Document = document): boolean {
  const ziel = sprungZiel(id, doc)
  if (!ziel) return false
  ziel.bereich.scrollIntoView({ block: 'center', behavior: 'smooth' })
  // Erst scrollen, dann ohne zweiten Sprung fokussieren — sonst ruckt die
  // Seite zweimal, und der Fokus landet am Rand statt in der Mitte.
  ziel.fokus.focus({ preventScroll: true })
  return true
}
