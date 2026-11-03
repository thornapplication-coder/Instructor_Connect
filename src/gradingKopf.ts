import { formatDate } from './datum'
import { fuehrtInstruktorAngaben } from './gradingPrefill'
import type { FormType, GradingRecord } from './types'

/**
 * Die Kopfdaten eines Nachweises als Zeilen — EINE Quelle fuer Ansicht,
 * Ausdruck und Behoerdenexport.
 *
 * Audit 11/2026, GTY-01: Die Ansicht setzte jedes Feld als „Beschriftung
 * links, Wert rechts" in eine halbe Spalte, ohne Ruecksicht auf die Art des
 * Feldes. Das Formular kannte `wide` (GradingForm), die Ansicht nicht. Auf
 * dem amtlichen Ausdruck stand dann „Topics Covered" als Fliesstext ohne
 * seine Zeilenumbrueche, daneben die Beschriftung umgebrochen; beim 308H
 * „Eve" / „nt" und beim 308G „PRG 1*, PRG 3, PRG" / „8". Was ein Feld
 * braucht (volle Breite, Zeilenumbrueche, Liste), steht deshalb hier, die
 * Ansicht setzt es nur noch um.
 *
 * Audit 11/2026, GTY-04: Der Forms-Export kannte nur Muster, Device und
 * Datum. Er liest die uebrigen Kopffelder aus denselben Zeilen — sonst gaebe
 * es zwei Auslegungen davon, was auf dem Nachweis steht.
 */

/** Angaben ohne Katalogfeld, die das Formular trotzdem erfasst. */
export type ZusatzSchluessel = 'forms:instructorQual' | 'forms:instructorSeat'

const ZUSATZ: { key: string; schluessel: ZusatzSchluessel }[] = [
  { key: 'instructorQual', schluessel: 'forms:instructorQual' },
  { key: 'instructorSeat', schluessel: 'forms:instructorSeat' },
]

export interface KopfZeile {
  key: string
  label: string
  /** Fussnote des Originalformulars (z. B. PRG*) */
  hint?: string
  /** Anzeigewert; Datum als DD.MM.YYYY, leer als ''. */
  wert: string
  /** Ueber die volle Breite: `wide` im Katalog oder ein Textfeld. */
  breit: boolean
  /** Textfeld — Zeilenumbrueche gehoeren zum Inhalt. */
  mehrzeilig: boolean
  /** Mehrfachauswahl, Eintrag fuer Eintrag; sonst null. */
  liste: string[] | null
}

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/

/**
 * Zeilen der Kopfdaten in der Reihenfolge des Katalogs, gefolgt von
 * Qualifikation und Sitz des Instruktors. Die beiden erfasst das Formular,
 * sie sind aber keine Katalogfelder — ohne diese Zeilen fehlten sie auf dem
 * Dokument. Nur auf den Blaettern, die sie fuehren (GRD-06): Vorbelegt
 * landeten sie auch auf 306/307/310/308G, wo das Formular sie nie zeigte,
 * und auf dem 308G widersprachen sie dem Sitz des Course Instructors.
 * Leere Katalogfelder bleiben drin: Auf dem Dokument steht dann „–", das
 * Feld war Teil des Formulars.
 *
 * Fehlt der Formulartyp im Katalog (im Admin Panel geloescht), kommen die
 * gespeicherten Kopfdaten unter ihrem Schluessel zurueck. Vorher zeigte die
 * Ansicht dann gar keine Kopfdaten — ein aufbewahrungspflichtiger Nachweis
 * verliert seinen Inhalt nicht, weil sich der Katalog aendert.
 */
export function kopfZeilen(
  ft: Pick<FormType, 'id' | 'competencySet' | 'fields'> | undefined,
  r: Pick<GradingRecord, 'header' | 'trainees'>,
  beschriftung: (schluessel: ZusatzSchluessel) => string,
): KopfZeile[] {
  const zusatzLabel = (key: string) => {
    const z = ZUSATZ.find((x) => x.key === key)
    return z ? beschriftung(z.schluessel) : key
  }
  if (!ft) {
    return Object.entries(r.header)
      .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
      .map(([key, roh]) => {
        const mehrzeilig = roh.includes('\n')
        return { key, label: zusatzLabel(key), wert: ISO_TAG.test(roh) ? formatDate(roh) : roh, breit: mehrzeilig, mehrzeilig, liste: null }
      })
  }
  const felder: KopfZeile[] = ft.fields.map((f) => {
    const roh = r.header[f.key] ?? ''
    return {
      key: f.key,
      label: f.label,
      hint: f.hint,
      wert: f.type === 'date' && roh ? formatDate(roh) : roh,
      breit: !!f.wide || f.type === 'textarea',
      mehrzeilig: f.type === 'textarea',
      // Das Formular speichert die Auswahl mit ', ' getrennt (GradingForm,
      // Reihenfolge des Originals) — genau dort darf umbrochen werden.
      liste: f.type === 'checkgroup' ? roh.split(', ').map((x) => x.trim()).filter(Boolean) : null,
    }
  })
  const zusatz: KopfZeile[] = fuehrtInstruktorAngaben(ft, r.trainees.length)
    ? ZUSATZ.filter((z) => r.header[z.key]?.trim()).map((z) => ({
        key: z.key,
        label: beschriftung(z.schluessel),
        wert: r.header[z.key],
        breit: false,
        mehrzeilig: false,
        liste: null,
      }))
    : []
  return [...felder, ...zusatz]
}

/**
 * Kopfdaten als EINE Zelle („Label=Wert | Label=Wert") fuer den Export —
 * nur gefuellte Felder, ohne die Schluessel, die eine eigene Spalte haben.
 * Zeilenumbrueche eines Textfelds bleiben stehen; die Maskierung der Zelle
 * ist Sache von `csvRow`.
 */
export function kopfText(zeilen: KopfZeile[], ohne: readonly string[] = []): string {
  return zeilen
    .filter((z) => !ohne.includes(z.key) && z.wert.trim() !== '')
    .map((z) => `${z.label}=${z.wert}`)
    .join(' | ')
}
