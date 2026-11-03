/**
 * Was fehlt einem Feedback noch? (Audit 11/2026, A11Y-16)
 *
 * Das Formular kannte nur „alles da" oder „etwas fehlt": Ein Banner nannte
 * drei Felder auf einmal, markiert war keins, und das Banner blieb stehen,
 * nachdem alles ausgefüllt war. Jetzt sagt diese Liste, WELCHE Felder
 * fehlen — das Formular markiert genau diese, springt zum ersten, und das
 * Banner verschwindet mit dem letzten. Der Store fragt dieselbe Liste.
 */

/** Ein Pflichtfeld des Formulars, in der Reihenfolge, in der es dort steht. */
export type FeedbackFeld = 'recipient' | 'category' | 'aircraft' | 'message'

export interface FeedbackEntwurf {
  recipient: string
  category: string
  /** Bezug: allgemein oder musterbezogen */
  scope: 'general' | 'aircraft'
  aircraftType: string
  message: string
}

/**
 * Die fehlenden Pflichtfelder, in Formular-Reihenfolge — das erste ist das
 * Sprungziel. Leer heißt: absendbar.
 *
 * Bei Musterbezug ist das Muster Pflicht, sonst wäre der Bezug leer; bei
 * „Allgemein" zählt es nicht. Eine Nachricht nur aus Leerraum ist keine.
 */
export function feedbackFehlt(f: FeedbackEntwurf): FeedbackFeld[] {
  const fehlt: FeedbackFeld[] = []
  if (!f.recipient) fehlt.push('recipient')
  if (!f.category) fehlt.push('category')
  if (f.scope === 'aircraft' && !f.aircraftType) fehlt.push('aircraft')
  if (!f.message.trim()) fehlt.push('message')
  return fehlt
}
