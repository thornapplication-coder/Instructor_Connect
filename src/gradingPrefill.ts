import type { FormField, FormType, GradingRecord } from './types'

/**
 * Vorbelegung der Kopfdaten eines Grading-Formulars.
 *
 * Gemessen wurden ZWOELF Tipps, bevor die erste Note vergeben werden konnte —
 * bei vier Sessions am Tag viermal dieselbe Eingabe. Dabei ist das meiste
 * bekannt: Das Datum ist heute; wer nur EIN Muster fliegt, hat keine Wahl;
 * Qualifikation, Sitz und Training Device sind dieselben wie beim letzten
 * eigenen Blatt.
 *
 * Audit 11/2026, GRD-06: Die Regel stand im Formular selbst und sagte „nur
 * Felder, die der gewaehlte Formulartyp ueberhaupt fuehrt" — fuer
 * Qualifikation und Sitz hielt sie sich nicht daran. Beide landeten auf jedem
 * Typ, auch auf 306, 307A/B, 310 und 308G, wo das Formular gar keine Knoepfe
 * dafuer zeigt: unsichtbar, nicht entfernbar, im Fingerabdruck und auf dem
 * Ausdruck. Die Vorbelegung steht deshalb hier, als reine Funktion, und
 * Formular, Anzeige und Vorbelegung fragen dieselbe Bedingung.
 */

/** Qualifikation des Instruktors — eigene Knopfgruppe, kein Katalogfeld. */
export const INSTRUKTOR_QUALI = ['TKI', 'SFI', 'TRI']
/** Sitz des Instruktors — ebenso. */
export const INSTRUKTOR_SITZ = ['Left', 'Right', 'Rear']

/**
 * Fuehrt dieser Formulartyp Qualifikation und Sitz des Instruktors?
 *
 * Nur die Pilotenblaetter: Ohne Kompetenzbewertung (306, 307A/B, 310) gibt es
 * die Teilnehmerkarte nicht, und das 308G beurteilt einen angehenden
 * Instruktor — dort stehen Qualifikation und Position im Kopf (candidateQual,
 * coiSeat …). Dieselbe Bedingung steuert die Knoepfe im Formular, die Zeilen
 * der Ansicht und die Vorbelegung — drei Stellen, eine Regel.
 */
export function fuehrtInstruktorAngaben(ft: Pick<FormType, 'id' | 'competencySet'>, anzahlKompetenzen: number): boolean {
  return anzahlKompetenzen > 0 && ft.competencySet === 'pilot' && ft.id !== '308G'
}

/**
 * Was ein Auswahlfeld zur Wahl stellt — `undefined` heisst „frei".
 *
 * Die Musterliste kommt zentral aus den Einstellungen, nicht aus dem Katalog:
 * Damit stehen in ALLEN Formularen dieselben Aircraft Types, und die
 * Vorbelegung prueft gegen genau die Liste, die das Formular anzeigt. Ein
 * Wert, der dort nicht steht, laege unsichtbar im Datensatz — das Auswahlfeld
 * zeigte „…".
 */
export function auswahlVon(f: Pick<FormField, 'key' | 'options'>, muster: string[]): string[] | undefined {
  return f.key === 'aircraftType' ? muster : f.options
}

export interface Vorbelegungsquelle {
  /** Letztes eigenes Blatt mit Piloten — Quelle fuer Device, Qualifikation, Sitz. */
  letztesEigene?: Pick<GradingRecord, 'header'>
  /** Muster des Nutzers; nur bei genau einem ist die Wahl klar. */
  eigeneMuster: string[]
  /** Musterliste der Einstellungen (Auswahl des Feldes aircraftType). */
  muster: string[]
  /** Heutiger Tag in Ortszeit (`lokalerTag`, GRD-16), nicht der UTC-Tag. */
  heute: string
  /** Kompetenzen des Formulartyps — ohne sie keine Teilnehmerkarte. */
  anzahlKompetenzen: number
}

/**
 * Vorschlag fuer die Kopfdaten: nur Felder, die der Typ fuehrt und die der
 * Nutzer sieht und aendern kann; bei Auswahlfeldern nur Werte, die dort zur
 * Wahl stehen. Was davon tatsaechlich gesetzt wird, entscheidet `vorbelegen`
 * — vorhandene Eingaben (Entwurf, Elternblatt) gewinnen immer.
 */
export function vorbelegung(ft: FormType, q: Vorbelegungsquelle): Record<string, string> {
  const out: Record<string, string> = {}
  const katalog = (key: string, wert: string | undefined) => {
    const feld = ft.fields.find((f) => f.key === key)
    if (!wert || !feld) return
    const auswahl = auswahlVon(feld, q.muster)
    if (auswahl && !auswahl.includes(wert)) return
    out[key] = wert
  }
  katalog('date', q.heute)
  if (q.eigeneMuster.length === 1) katalog('aircraftType', q.eigeneMuster[0])
  katalog('trainingDevice', q.letztesEigene?.header.trainingDevice)
  /*
   * Eine Pflicht-Ankreuzgruppe mit genau EINER Option ist keine Frage (GTY-11,
   * Teil Vorbelegung): 308D kennt als Training Device nur „FFS". Ohne
   * Vorbelegung kostete sie einen Tipp und meldete sonst einen offenen
   * Pflichtpunkt, den es inhaltlich nicht gibt.
   */
  for (const f of ft.fields) {
    if (f.type !== 'radiogroup' || !f.required || out[f.key]) continue
    const auswahl = auswahlVon(f, q.muster) ?? []
    if (auswahl.length === 1) out[f.key] = auswahl[0]
  }
  if (fuehrtInstruktorAngaben(ft, q.anzahlKompetenzen)) {
    const frei = (key: string, erlaubt: string[]) => {
      const wert = q.letztesEigene?.header[key]
      if (wert && erlaubt.includes(wert)) out[key] = wert
    }
    frei('instructorQual', INSTRUKTOR_QUALI)
    frei('instructorSeat', INSTRUKTOR_SITZ)
  }
  return out
}

/**
 * Kopfdaten, die ein Folgeformular (306/310) von seinem Elternblatt erbt —
 * nur in Feldern, die der Folgetyp fuehrt.
 *
 * Audit 11/2026 (Nachtrag zu GRD-06): Das Formular uebernahm immer auch das
 * Training Device, obwohl weder 306 noch 310 ein solches Feld haben. Es stand
 * unsichtbar und nicht aenderbar im Datensatz und im Fingerabdruck, fehlte
 * auf dem Ausdruck und erschien trotzdem in der Spalte „Device" der
 * Forms-CSV. Dieselbe Zusage wie bei der Vorbelegung: Was das Formular nicht
 * zeigt, traegt der Nachweis nicht. Fuehrt ein im Admin Panel gepflegter
 * Folgetyp das Feld, wird es uebernommen — die Regel fragt den Katalog, keine
 * feste Liste.
 */
export function kopfVomElternblatt(
  parent: Pick<GradingRecord, 'header' | 'trainees'>,
  ft: Pick<FormType, 'fields'> | undefined,
): Record<string, string> {
  const geerbt: Record<string, string | undefined> = {
    aircraftType: parent.header.aircraftType,
    date: parent.header.date,
    trainingDevice: parent.header.trainingDevice,
    // Folgeformulare gehoeren genau einem Piloten — Name aus dem
    // Ausgangsformular, bleibt aenderbar.
    traineeName: parent.trainees[0]?.traineeName || parent.header.traineeName,
  }
  const out: Record<string, string> = {}
  for (const f of ft?.fields ?? []) {
    const wert = geerbt[f.key]
    if (wert) out[f.key] = wert
  }
  return out
}

/**
 * Kopfdaten auf das zuschneiden, was dieser Formulartyp zeigt: seine
 * Katalogfelder, dazu Qualifikation und Sitz des Instruktors nur dort, wo es
 * deren Knoepfe gibt.
 *
 * Gegenpruefung zu GRD-06: `vorbelegen` fuellt nur Luecken und nimmt nichts
 * weg. Wer ein 308A oeffnete (Datum, Device, Qualifikation, Sitz vorbelegt)
 * und dann auf 307A oder 308G wechselte, behielt diese Werte im Kopf —
 * unsichtbar, nicht entfernbar, im Fingerabdruck und in der Spalte „Device"
 * der Forms-CSV. Derselbe Befund auf einem anderen Weg. Beim Typwechsel und
 * beim Absenden laeuft deshalb alles hier durch; dieselbe Bedingung wie die
 * Knoepfe (`fuehrtInstruktorAngaben`). Gibt dasselbe Objekt zurueck, wenn
 * nichts wegfaellt.
 */
export function kopfFuerTyp(
  header: Record<string, string>,
  ft: Pick<FormType, 'id' | 'competencySet' | 'fields'>,
  anzahlKompetenzen: number,
): Record<string, string> {
  const erlaubt = new Set(ft.fields.map((f) => f.key))
  if (fuehrtInstruktorAngaben(ft, anzahlKompetenzen)) {
    erlaubt.add('instructorQual')
    erlaubt.add('instructorSeat')
  }
  const fremd = Object.keys(header).filter((k) => !erlaubt.has(k))
  return fremd.length === 0 ? header : Object.fromEntries(Object.entries(header).filter(([k]) => erlaubt.has(k)))
}

/** Fuellt nur Luecken. Gibt dasselbe Objekt zurueck, wenn sich nichts
 *  aendert — sonst loeste jede Vorbelegung ein neues Rendern aus. */
export function vorbelegen(header: Record<string, string>, vorschlag: Record<string, string>): Record<string, string> {
  const luecken = Object.entries(vorschlag).filter(([k, v]) => v && !header[k])
  return luecken.length === 0 ? header : { ...header, ...Object.fromEntries(luecken) }
}
