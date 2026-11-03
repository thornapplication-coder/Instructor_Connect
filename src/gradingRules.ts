import { formatDate, lokalerTag } from './datum'
import type { FormField, GradingRecord, GradingSettings, Settings, TraineeGrading } from './types'

/**
 * Reine Regeln des Grading-Moduls — bewusst ohne React und ohne Store, damit
 * sie sowohl in den Ansichten als auch im Store benutzbar sind (der Store
 * braucht sie für die Sichtbarkeit, die Ansichten für Ampel und Hinweise).
 */

/**
 * Automatik laut Vorgabe: mind. eine „1" oder mind. zwei „2" ⇒ Not Competent.
 *
 * Die Regel stand nur im Formular und griff dort beim Tippen. Die Pflichtkette
 * las danach ausschliesslich `overall` — ein Datensatz mit zwei Zweien, dessen
 * `overall` aus einem Entwurf, einer Migration oder den Seed-Daten noch auf
 * 'competent' stand, kam damit ohne 306 durch und zeigte gruen. Deshalb liegt
 * die Regel jetzt hier, wo BEIDE Seiten sie benutzen.
 */
export function autoNotCompetent(tr: TraineeGrading): boolean {
  const ones = tr.grades.filter((g) => g.grade === 1).length
  const twos = tr.grades.filter((g) => g.grade === 2).length
  return ones >= 1 || twos >= 2
}

/** Gilt der Pilot als nicht bestanden — erklaert oder rechnerisch? */
export function isNotCompetent(tr: TraineeGrading): boolean {
  return tr.overall === 'not_competent' || autoNotCompetent(tr)
}

/**
 * Farbcodierung laut Spez. 5.3: 5/4 grün, 3 dunkelgrün, 2 orange, 1 rot, NO
 * grau. Kräftige Vollfarben mit weißem/schwarzem Text — in Hell- UND
 * Dunkelmodus lesbar.
 *
 * Stand in `src/pages/Grading.tsx`, exportiert und von vier Ansichten
 * benutzt, ohne Test — die Testwache sah keine `.tsx` (Audit 11/2026,
 * TEC-18). Die Klassen stehen weiter als ganze Wörter im Quelltext, damit
 * Tailwind sie findet.
 */
export function gradeColor(g: number | 'NO' | null): string {
  // Textfarbe je Fläche so gewählt, dass jede Note mindestens 4,5:1 erreicht:
  // Weiß auf emerald-600 lag bei 3,77:1 und war zu blass.
  if (g === 'NO' || g === null) return 'bg-line/10 text-dim'
  if (g >= 4) return 'bg-emerald-700 text-white'
  if (g === 3) return 'bg-emerald-800 text-white'
  if (g === 2) return 'bg-amber-500 text-black'
  return 'bg-red-700 text-white'
}

/** 306 und 310 sind die einzigen Folgeformular-Typen. */
export function isFollowUpType(formTypeId: string): boolean {
  return formTypeId === '306' || formTypeId === '310'
}

/**
 * Darf ein Formulartyp aus dem Katalog verschwinden? Nein, wenn er
 *  - Pflicht-Folgeformular ist (306/310): Die Regeln verlangen ihn bei „Not
 *    Competent" bzw. „Session not completed" — ohne ihn im Katalog liesse
 *    sich ein solcher Durchgang gar nicht abschliessen (`'pflicht'`);
 *  - schon Datensaetze hat: Ein unterschriebenes Dokument verloere sonst
 *    seine Struktur (`'datensaetze'`).
 * `null` = frei loeschbar.
 *
 * Audit 11/2026, GRD-18: Die Regel stand nur im Store, der den Typ beim
 * Speichern still zurueckholte. Der Loeschknopf kannte sie nicht und fragte
 * „Delete this form type? It disappears from the selection …" — nach OK
 * stand 308A unveraendert da, ohne jede Rueckmeldung. Store und Ansicht
 * fragen jetzt dieselbe Funktion; der Knopf sagt vorher, warum nicht.
 */
export function formularTypInGebrauch(
  id: string,
  records: readonly Pick<GradingRecord, 'formTypeId'>[],
): 'pflicht' | 'datensaetze' | null {
  if (isFollowUpType(id)) return 'pflicht'
  return records.some((r) => r.formTypeId === id) ? 'datensaetze' : null
}

/**
 * Steht ein Kompetenz-Kürzel im Satz schon bei einer ANDEREN Kompetenz?
 * Groß-/Kleinschreibung zählt nicht — gespeichert wird ohnehin in
 * Großbuchstaben, „com" ist also „COM". `eigenerCode` ist das Kürzel der
 * gerade bearbeiteten Kompetenz (`null` bei einer neuen): Sie darf ihr
 * eigenes Kürzel behalten.
 *
 * Audit 11/2026, GRD-19: Der Editor prüfte nur auf leere Eingabe. Zwei
 * Kompetenzen mit demselben Kürzel liessen sich speichern — danach setzte
 * ein Klick im Formular die Note bei BEIDEN (die Note hängt am Kürzel),
 * die offenen Punkte und die React-Schlüssel kollidierten, und jede
 * Auswertung je Kompetenz zählte beide zusammen. Für Formularnummern gab
 * es die Prüfung längst (`formIdTaken`); hier fehlte sie.
 */
export function codeVergeben(
  code: string,
  competencies: readonly { code: string }[],
  eigenerCode: string | null,
): boolean {
  const norm = (c: string) => c.trim().toUpperCase()
  const gesucht = norm(code)
  if (!gesucht) return false
  return competencies.some((c) => norm(c.code) === gesucht && (eigenerCode === null || norm(c.code) !== norm(eigenerCode)))
}

/**
 * Beurteilt dieses Blatt einen angehenden Instruktor (308G) statt eines
 * Piloten? Maßgeblich ist der Kompetenzsatz; die Kennung fängt den Fall ab,
 * dass die Ansicht den Formulartyp nicht (mehr) im Katalog findet.
 */
export function istInstruktorBlatt(ft: { id: string; competencySet?: string | null }): boolean {
  return ft.competencySet === 'instructor' || ft.id === '308G'
}

/** Wörter für Personen und Unterschriften — Schlüssel MIT Namensraum, damit
 *  i18n.test.ts mechanisch prüft, dass es sie in forms.json gibt. */
const PILOTENBLATT = {
  teilnehmer: 'forms:participants',
  person: 'forms:student',
  personN: 'forms:traineeN',
  name: 'forms:studentName',
  personZeile: 'forms:personPilot',
  ausbilder: 'forms:instructor',
  hinzufuegen: 'forms:addTrainee',
  sigAusbilder: 'forms:sigInstructor',
  sigPerson: 'forms:sigTrainee',
  kuerzel: true,
} as const

const INSTRUKTORBLATT = {
  teilnehmer: 'forms:participantsCai',
  person: 'forms:candidateInstructor',
  personN: 'forms:candidateN',
  name: 'forms:candidateName',
  personZeile: 'forms:personCai',
  ausbilder: 'forms:courseInstructor',
  hinzufuegen: 'forms:addCandidate',
  sigAusbilder: 'forms:sigCOI',
  sigPerson: 'forms:sigCAI',
  kuerzel: false,
} as const

export type Bezeichnungen = { [K in keyof typeof PILOTENBLATT]: (typeof PILOTENBLATT)[K] | (typeof INSTRUKTORBLATT)[K] }

/**
 * Wie ein Formulartyp seine Personen und Unterschriften nennt.
 *
 * Audit 11/2026, GTY-10: Das 308G beurteilt einen Candidate Instructor (CAI)
 * durch einen Course Instructor (COI). Ansicht und Druck nannten beide so,
 * das Formular dagegen „Instructor signature" / „Trainee signature", bot
 * „Add another pilot" an und nannte in den offenen Punkten Kürzel („PRE",
 * „CLI"), die es nirgends zeigt — die Kacheln tragen auf dem 308G nur den
 * ausgeschriebenen Titel. Formular und Ansicht holen die Wörter deshalb
 * hier; die Bezeichnungen standen vorher an beiden Stellen von Hand.
 *
 * `kuerzel` sagt, ob Kompetenzen mit ihrem Kürzel genannt werden — das
 * Original des 308G führt keine.
 */
export function bezeichnungen(ft: { id: string; competencySet?: string | null }): Bezeichnungen {
  return istInstruktorBlatt(ft) ? INSTRUKTORBLATT : PILOTENBLATT
}

/**
 * Pflicht-Folgeformulare, die zu diesem Formular noch fehlen:
 * Not Competent ⇒ 306 (Additional Training) ist verpflichtend,
 * Session not completed ⇒ 310 (Deferred Item) ist verpflichtend.
 *
 * BEIDE hängen an genau EINEM Blatt, also an genau einem Piloten. Das 310
 * galt früher für den ganzen Durchgang (alle Blätter desselben batchId) —
 * diese Zusage ist mit Befund #24 hinfällig geworden: Seither führt das
 * Formular 310 ein Pflichtfeld „Pilot / Student Name". Ein 310, das Pilot A
 * nennt, kann den Nachweis für Pilot B nicht erbringen; es hakte dessen
 * offene Punkte stillschweigend ab, ohne ihn je zu erwähnen.
 *
 * Erfüllt ist die Pflicht erst mit der Unterschrift: ein angelegtes, aber
 * nicht unterschriebenes Folgeformular ist kein Nachweis und darf das
 * Ausgangsformular nicht stillschweigend abhaken.
 */
export function missingFollowUps(r: GradingRecord, all: GradingRecord[]): string[] {
  // Maßgeblich ist der TYP, nicht das parentId-Feld: Über die Adresszeile
  // ließ sich ein gewöhnliches Blatt mit erfundenem parentId anlegen und
  // damit die Pflicht auf 306/310 aushebeln — „Not Competent" wurde grün,
  // ohne dass je ein Folgeformular entstand.
  if (isFollowUpType(r.formTypeId)) return []
  /*
   * Ein Folgeformular zaehlt nur, wenn es DENSELBEN Piloten nennt.
   *
   * Geprueft wurden bisher nur Typ, `parentId` und Unterschrift. Der Name im
   * 306/310 ist aber ein frei ueberschreibbares Textfeld: Ein 306, das
   * Pilot B nennt, hakte damit die Pflicht des Blattes von Pilot A ab —
   * genau die Konstellation, wegen der Befund #24 das 310 vom Durchgang auf
   * das Einzelblatt umgestellt hat. Die strukturelle Bindung war geloest,
   * die inhaltliche fehlte.
   *
   * Traegt das Kind keinen Namen (Altbestand vor dem Pflichtfeld), zaehlt es
   * weiterhin — sonst meldete die App rueckwirkend Luecken, die es nie gab.
   */
  const namen = new Set(r.trainees.map((tr) => (tr.traineeName ?? '').trim().toLowerCase()).filter(Boolean))
  const passtZumPiloten = (c: GradingRecord) => {
    const kind = (c.header.traineeName ?? '').trim().toLowerCase()
    return !kind || namen.size === 0 || namen.has(kind)
  }
  const signedChildren = (formTypeId: string) =>
    all.filter((c) => c.parentId === r.id && c.formTypeId === formTypeId && c.status === 'signed' && passtZumPiloten(c))
  const signedChild = (formTypeId: string) => signedChildren(formTypeId).length > 0
  const out: string[] = []
  /*
   * EIN 306 je nicht bestandenem Piloten.
   *
   * Neu angelegte Durchgaenge werden je Pilot in eigene Blaetter geteilt,
   * dort steht immer genau einer. Bestands- und Importblaetter fuehren aber
   * mehrere — und ein einziges unterschriebenes 306 machte ein Blatt mit
   * zwei Durchgefallenen gruen. Gezaehlt wird deshalb, nicht bloss gefragt,
   * ob eines da ist.
   */
  const durchgefallen = r.trainees.filter(isNotCompetent).length
  if (durchgefallen > 0 && signedChildren('306').length < durchgefallen) out.push('306')
  if (r.sessionStatus === 'not_completed' && !signedChild('310')) out.push('310')
  return out
}

/**
 * Für die Anzeige: Gibt es zu diesem Pflicht-Folgeformular bereits einen
 * angefangenen, aber noch nicht unterschriebenen Datensatz? Dann wartet es
 * nur noch auf die Unterschrift, statt komplett zu fehlen.
 */
export function followUpStarted(r: GradingRecord, all: GradingRecord[], formTypeId: string): boolean {
  return all.some((c) => c.parentId === r.id && c.formTypeId === formTypeId && c.status !== 'signed')
}

/** Piloten eines Formulars — Folgeformulare (306/310) führen ihren Piloten
 *  in den Kopfdaten, ältere erben ihn vom Ausgangsformular. */
export function traineesOf(r: GradingRecord, all: GradingRecord[]) {
  if (r.trainees.length > 0) return r.trainees
  const own = r.header.traineeName?.trim()
  if (own)
    return [
      {
        traineeId: '',
        traineeName: own,
        position: '',
        grades: [],
        positiveComment: '',
        developmentComment: '',
        summaryComment: '',
        overall: null,
      },
    ]
  const parent = r.parentId ? all.find((x) => x.id === r.parentId) : undefined
  return parent?.trainees ?? []
}

/**
 * Teilnehmer einer Anwesenheitsliste (307A/307B) — ohne leere Zeilen.
 *
 * Audit 11/2026, GRD-02/EXP-01: Anwesenheitslisten fuehren weder `trainees`
 * noch ein Kopffeld mit Namen; ihre Personen stehen in `attendance`.
 * `traineesOf` lieferte dafuer [] und der Behoerdenexport schrieb fuer
 * KEINEN Anwesenheitsnachweis eine Zeile, obwohl der Dateikopf ihn zaehlte.
 * `traineesOf` bleibt bewusst bei den Piloten eines Blattes — Folgeformulare
 * erben genau sie, nicht die Kursteilnehmer. Die Ablage-Listen fragen
 * `personenSuche` und `personenKurz`, die beides kennen.
 * Eine leere Zeile ist kein Teilnehmer — dieselbe Regel wie in `hasEvidence`.
 */
export function teilnehmerOf(r: Pick<GradingRecord, 'attendance'>): string[] {
  return (r.attendance ?? []).map((a) => a.name.trim()).filter(Boolean)
}

/** Beschriftung der Personenzeile; `forms:attendees` erwartet `count`. */
export type PersonenSchluessel = Bezeichnungen['personZeile'] | 'forms:attendees'

export interface PersonenZeile {
  schluessel: PersonenSchluessel
  /** Anzahl der Personen (fuer „Participants (26)"). */
  anzahl: number
  /** Namen fuer Kopf und Fuss des Dokuments — bei Anwesenheitslisten
   *  verkuerzt auf „Erster +N": Der Kopf wiederholt sich auf JEDEM Blatt,
   *  die vollstaendige Liste steht im Dokument selbst. */
  namen: string[]
  /** Stehen die Namen im Blatt selbst (`trainees`)? Nur dann gehoert eine
   *  eigene Zeile in die Kopfdaten — 306/310 fuehren den Namen als Kopffeld,
   *  307A/307B in der Teilnehmerliste. */
  ausBlatt: boolean
}

/**
 * Wen ein Dokument nennt — und unter welcher Beschriftung.
 *
 * Audit 11/2026, PRT-02: Die Ansicht waehlte die Beschriftung nur zwischen
 * Pilot und CAI. Ein 307A druckte deshalb auf jedem Blatt „Pilot / Student
 * Name: Jürgen Müller 1 +25" — der erste Kursteilnehmer stand als geschulter
 * Pilot auf dem Nachweis. Reihenfolge der Quellen wie bisher: eigene
 * Bewertungen, Kopffeld (306/310), geerbter Pilot des Ausgangsblatts,
 * Teilnehmerliste.
 */
export function personenZeile(
  r: GradingRecord,
  ft: { id: string; competencySet?: string | null },
  alle: GradingRecord[],
  name: (tr: { traineeName?: string; traineeId: string }) => string,
): PersonenZeile {
  const schluessel = bezeichnungen(ft).personZeile
  const zeile = (namen: string[], ausBlatt = false): PersonenZeile => ({ schluessel, anzahl: namen.length, namen, ausBlatt })
  const eigene = r.trainees.map(name).filter(Boolean)
  if (eigene.length > 0) return zeile(eigene, true)
  const kopf = r.header.traineeName?.trim()
  if (kopf) return zeile([kopf])
  const geerbt = traineesOf(r, alle).map(name).filter(Boolean)
  if (geerbt.length > 0) return zeile(geerbt)
  const teilnehmer = teilnehmerOf(r)
  if (teilnehmer.length > 0) {
    const kurz = teilnehmer[0] + (teilnehmer.length > 1 ? ` +${teilnehmer.length - 1}` : '')
    return { schluessel: 'forms:attendees', anzahl: teilnehmer.length, namen: [kurz], ausBlatt: false }
  }
  return zeile([])
}

/**
 * Personen einer Ablage-Zeile — Anzeige (`personenKurz`) und Suche/Filter
 * (`personenSuche`).
 *
 * Nachtrag zum Audit 11/2026 (gleiche Ursache wie GRD-02/EXP-01, hier in der
 * Oberflaeche): Die Listen der Ablage fragten nur `traineesOf`. Jedes 307A
 * und 307B stand dort als „no trainee", und seine Teilnehmer liessen sich
 * weder suchen noch filtern — wer die Nachweise einer Person zusammensucht,
 * fand ihre Anwesenheiten nicht.
 *
 * Angezeigt wird dasselbe wie in Kopf und Fuss des Dokuments
 * (`personenZeile`), also „Erster +N" bei Anwesenheitslisten: 26 Namen
 * passen in keine Listenzeile und in keine Ansage. Die Beschriftung braucht
 * die Zeile nicht, der Formulartyp steht davor.
 */
export function personenKurz(
  r: GradingRecord,
  alle: GradingRecord[],
  name: (tr: { traineeName?: string; traineeId: string }) => string,
): string {
  return personenZeile(r, { id: r.formTypeId }, alle, name).namen.join(', ')
}

/** Gesucht und gefiltert wird dagegen nach JEDEM Namen — auch nach dem
 *  sechsundzwanzigsten Teilnehmer, der in der Kurzform nicht steht. */
export function personenSuche(
  r: GradingRecord,
  alle: GradingRecord[],
  name: (tr: { traineeName?: string; traineeId: string }) => string,
): string[] {
  return [...traineesOf(r, alle).map(name), ...teilnehmerOf(r)]
}

/**
 * Teile des Drucktitels eines Nachweises (`druckTitel`, dateiName.ts):
 * Form_Titel_Person_Instruktor_Datum_Event — z. B.
 * „308A_Grading Sheet TR_Sophie Berger_Mika Beispiel_05.08.2026_OPC Recurrent".
 *
 * Der Browser schlaegt ihn beim „Als PDF sichern" als Dateinamen vor. Die
 * Person gehoert hinein, weil nach Pilot abgelegt wird, nicht nach
 * Instruktor — ohne sie lagen zwoelf gleichnamige PDFs im selben Ordner.
 * `personen` sind dieselben Namen wie in Kopf und Fuss (`personenZeile`).
 * Das Datum im App-Format (datum.ts), wie es auf dem Dokument steht.
 *
 * Audit 11/2026, EXM-10: Das Event verlor seinen Leerraum ganz und stand als
 * „OPCRecurrent" im Namen. Es behaelt ihn jetzt wie Titel und Namen auch —
 * mit „-" statt Leerzeichen wurde eine Mehrfachauswahl des 308H zu
 * „Adverse-Weather,-LVO---CAT-II…".
 */
export function druckTitelTeile(
  r: Pick<GradingRecord, 'formTypeId' | 'header'>,
  a: { formTitel: string; personen: readonly string[]; instruktor: string },
): string[] {
  return [
    r.formTypeId,
    a.formTitel,
    a.personen.join(', '),
    a.instruktor,
    r.header.date ? formatDate(r.header.date) : '',
    r.header.event ?? '',
  ]
}

/**
 * Ampelsystem für den Formularstatus:
 *  grün  = abgeschlossen, unterschrieben und versendet
 *  gelb  = noch offen (Unterschrift/Versand ausständig oder
 *          Pflicht-Folgeformular fehlt)
 *  rot   = Versand fehlgeschlagen — Handeln erforderlich
 */
export type TrafficColor = 'green' | 'yellow' | 'red'

/**
 * Liegt der Beleg vollständig vor? Die Ampel las früher nur `status`,
 * `mailStatus` und die Folgeformulare — ein Datensatz mit leeren
 * Signaturfeldern und ohne `signedAt` zeigte damit grün und war optisch von
 * einem vollständigen Nachweis nicht zu unterscheiden.
 *
 * Anwesenheitsformulare (307A/307B) tragen keine Gegenzeichnung des Piloten;
 * dort bürgt der Instruktor. Sie brauchen dafür aber mindestens einen
 * Teilnehmer — eine Anwesenheitsliste ohne Anwesende belegt nichts.
 */
export function hasEvidence(r: GradingRecord): boolean {
  if (!istUnterschrift(r.signatureInstructor) || !r.signedAt) return false
  if (r.attendance) return r.attendance.some((a) => a.name.trim())
  return istUnterschrift(r.signatureTrainee)
}

/**
 * Ist das ein Unterschriftsbild — oder nur eine Zeichenkette, die so aussieht?
 *
 * Audit 11/2026, MOB-01: Geprueft wurde nur, ob ueberhaupt etwas im Feld
 * steht. Im Querformat verschwand der Strich, gespeichert wurde trotzdem ein
 * (transparentes) PNG, und die Liste der offenen Punkte strich „The
 * instructor signature is missing." — der Nachweis liess sich mit LEERER
 * Unterschrift als „signed" absenden. Ob ein Bild Tinte traegt, entscheidet
 * die Zeichenflaeche (`tintenRahmen` in signaturBild.ts, sie liefert ohne
 * Tinte `null`); hier faellt zusaetzlich alles durch, was gar kein Bild ist:
 * leer, „data:," (so antwortet ein Canvas ohne Flaeche) oder ein Bild ohne
 * Inhalt.
 */
export function istUnterschrift(v: string | null | undefined): v is string {
  return typeof v === 'string' && /^data:image\/[a-z0-9.+-]+(;[^,]*)?,\S/i.test(v)
}

type Dokumentkopf = Settings['documentHeader'] | undefined

/**
 * Dokumentenstand im Moment des Unterschreibens (ATO, Zulassung,
 * Formularstand, Titel).
 *
 * Audit 11/2026, GRD-03: Eingefroren wurde er nur im Zweig der Grading
 * Sheets. 306, 310, 307A und 307B lasen ihn zur Druckzeit aus den
 * Einstellungen — ein spaeter geaenderter Formularstand oder eine neue
 * Zulassungsnummer stand damit auf einem laengst unterschriebenen Nachweis,
 * und der Fingerabdruck meldete „unveraendert" (null = null). Beide Zweige
 * holen ihn jetzt hier.
 */
export function dokumentStand(kopf: Dokumentkopf, authority: 'AT' | 'UK', formTitle: string): NonNullable<GradingRecord['docSnapshot']> {
  const k = kopf ?? { atoName: '', approvalNumber: '', approvalNumberUK: '', formRevision: '' }
  return {
    atoName: k.atoName,
    // Ohne eigene UK-Nummer gilt die oesterreichische — wie bisher in der Anzeige.
    approval: (authority === 'UK' ? k.approvalNumberUK : k.approvalNumber) || k.approvalNumber,
    formRevision: k.formRevision,
    formTitle,
  }
}

/**
 * An wen ein Nachweis geht.
 *
 * Audit 11/2026, GTY-06: Die Regel stand zweimal (Formular und Ansicht) und
 * war sich nicht einig — das Formular kannte die Eskalation bei 306 nicht.
 * Die Ansicht rechnete sie zudem zur ANZEIGEZEIT aus den Einstellungen: Ein
 * alter Nachweis nannte nach jeder Aenderung Empfaenger, an die er nie ging.
 * Das Ergebnis wird deshalb beim Absenden als `recipients` gespeichert;
 * diese Funktion bleibt der Rueckfall fuer Altbestand.
 */
export function empfaengerVon(
  r: Pick<GradingRecord, 'formTypeId' | 'trainees' | 'sessionStatus' | 'extraRecipients'>,
  grading: Pick<GradingSettings, 'defaultRecipients' | 'deferredRecipients' | 'escalationRecipients'>,
): string[] {
  // Auch der rechnerisch nicht bestandene Pilot loest die Eskalation aus.
  const eskalation = r.formTypeId === '306' || r.trainees.some(isNotCompetent) || r.sessionStatus === 'not_completed'
  return [
    ...new Set([
      ...grading.defaultRecipients,
      // Form 310 (Deferred Item) geht IMMER an den Training Admin.
      ...(r.formTypeId === '310' ? grading.deferredRecipients : []),
      ...(eskalation ? grading.escalationRecipients : []),
      ...(r.extraRecipients ?? []),
    ]),
  ]
}

/**
 * Beim Absenden einfrieren, was sonst spaeter aus den Einstellungen gelesen
 * wuerde: Dokumentenstand (GRD-03) und Empfaenger (GTY-06). EIN Weg fuer
 * jeden Formulartyp — vorher kannte nur der Zweig der Grading Sheets den
 * Dokumentenstand, und 306/310/307A/307B blieben auf dem Altbestandsweg.
 */
export function einfrieren(
  r: GradingRecord,
  kopf: Dokumentkopf,
  formTitle: string,
  grading: Pick<GradingSettings, 'defaultRecipients' | 'deferredRecipients' | 'escalationRecipients'>,
): GradingRecord {
  return { ...r, docSnapshot: dokumentStand(kopf, r.authority ?? 'AT', formTitle), recipients: empfaengerVon(r, grading) }
}

/**
 * Zustaendige Behoerde eines Formulars.
 *
 * Audit 11/2026, GRD-04: Folgeformulare starteten immer mit AT. Das 306 eines
 * GBR.ATO.0541-Trainings wurde damit unter AT.ATO.106 gedruckt und exportiert,
 * sofern niemand das Feld von Hand umstellte. Ein Folgeformular gehoert zur
 * Zulassung seines Elternblatts — dessen Angabe geht deshalb auch einem
 * gesicherten Entwurf vor. Ein bestehender Datensatz behaelt seine eigene.
 */
export function behoerdeFuer(
  existing: Pick<GradingRecord, 'authority'> | undefined,
  parent: Pick<GradingRecord, 'authority'> | undefined,
  entwurf?: unknown,
): 'AT' | 'UK' {
  if (existing) return existing.authority ?? 'AT'
  // Altbestand ohne Angabe gilt als AT — so liest ihn auch die Anzeige.
  if (parent) return parent.authority ?? 'AT'
  return entwurf === 'UK' ? 'UK' : 'AT'
}

export function trafficLight(r: GradingRecord, all?: GradingRecord[]): TrafficColor {
  if (r.mailStatus === 'failed') return 'red'
  if (all && missingFollowUps(r, all).length > 0) return 'yellow'
  if (r.status === 'signed' && r.mailStatus === 'sent' && hasEvidence(r)) return 'green'
  return 'yellow'
}

/**
 * Sortierung aller Grading-Listen: zuerst nach dem Schulungsdatum
 * (absteigend, neueste oben); bei gleichem Datum nach dem Status —
 * Sending failed (rot) vor Open (gelb) vor Completed (grün).
 */
/**
 * Datum, nach dem die Listen ordnen UND gruppieren: der SCHULUNGSTAG aus
 * dem Kopf, ersatzweise der Anlagezeitpunkt.
 *
 * Beides auseinanderzuhalten war schon einmal ein Befund (#51): Ein Blatt,
 * das am Folgetag ausgefüllt wird, gehört zur Session, nicht zum Tag des
 * Ausfüllens. Die Liste sortierte danach bereits, zeigte in der Zeile aber
 * `createdAt` — zwei verschiedene Daten für dieselbe Zeile.
 */
export function gradingListDate(r: GradingRecord): number {
  const raw = r.header.date
  if (raw) {
    const t = new Date(`${raw}T00:00:00`).getTime()
    if (!Number.isNaN(t)) return t
  }
  return r.createdAt
}

/** Tagesschlüssel (YYYY-MM-DD) zum Gruppieren der Liste. */
export function gradingDayKey(r: GradingRecord): string {
  return lokalerTag(gradingListDate(r))
}

export function gradingListComparator(all: GradingRecord[]) {
  const rank: Record<TrafficColor, number> = { red: 0, yellow: 1, green: 2 }
  const dateOf = gradingListDate
  return (a: GradingRecord, b: GradingRecord): number => {
    const dd = dateOf(b) - dateOf(a)
    if (dd !== 0) return dd
    return rank[trafficLight(a, all)] - rank[trafficLight(b, all)]
  }
}

/** Ist der Vorgang komplett abgeschlossen? Unfertige Formulare dürfen dem
 *  Instruktor nicht durch die Aufbewahrungsfrist aus der Liste fallen. */
export function isComplete(r: GradingRecord, all: GradingRecord[]): boolean {
  return trafficLight(r, all) === 'green'
}

/**
 * Overall Result nach einer Notenaenderung.
 *
 * Audit 11/2026, GRD-08: Die Automatik (eine 1 oder zwei 2) setzte „Not
 * Competent" — zurueckgenommen wurde es nie. Nach einem Tippfehler (1 statt
 * 4) blieb der Pilot nicht bestanden, OHNE eine Note, die das traegt: Das
 * loeste ein Pflicht-306, die Eskalationsempfaenger und einen Eintrag in der
 * NC-Statistik aus. Faellt die Bedingung weg, wird das Ergebnis deshalb
 * geleert — gewaehlt werden muss es dann bewusst (die offenen Punkte nennen
 * „Overall Result"). Ein von Hand gesetztes Not Competent, das nicht von
 * der Automatik kam, bleibt stehen.
 */
export function overallNachNote(vorher: TraineeGrading, nachher: TraineeGrading): TraineeGrading {
  if (autoNotCompetent(nachher)) return nachher.overall === 'not_competent' ? nachher : { ...nachher, overall: 'not_competent' }
  if (autoNotCompetent(vorher) && nachher.overall === 'not_competent') return { ...nachher, overall: null }
  return nachher
}

/**
 * Ganze Zahl ab 0 — Takeoffs und Landings (Felder vom Typ `number`).
 *
 * Audit 11/2026, GTY-07: Das Feld nahm „-3", „2.5" und „1e5" an, und das
 * landete im unterschriebenen Nachweis. Leer ist erlaubt, solange das Feld
 * optional ist; ob ein Pflichtfeld fehlt, sagt die Pflichtpruefung.
 */
export function ganzzahligNichtNegativ(wert: string | undefined, pflicht = false): boolean {
  const v = (wert ?? '').trim()
  if (!v) return !pflicht
  return /^\d+$/.test(v)
}

/**
 * Von-/Nach-Paare, die nicht gleich sein duerfen: Ein Difference-Training
 * von „ATR PEC" nach „ATR PEC" (308C) oder eine Conversion von Single nach
 * Single Pilot Ops (308D) belegt nichts.
 */
const VON_NACH: [string, string][] = [
  ['variantFrom', 'variantTo'],
  ['convFrom', 'convTo'],
]

/**
 * Audit 11/2026, GTY-11: Ein solcher Nachweis ging ohne jede Rueckfrage
 * durch. Gemeldet wird nur ein Paar, dessen beide Felder der Formulartyp
 * fuehrt und die beide ausgefuellt sind — ein leeres Feld ist Sache der
 * Pflichtpruefung, nicht dieser Regel.
 */
export function gleichePaare(
  fields: Pick<FormField, 'key'>[],
  header: Record<string, string | undefined>,
): { von: string; nach: string }[] {
  const hat = (key: string) => fields.some((f) => f.key === key)
  return VON_NACH.filter(([von, nach]) => {
    const a = header[von]?.trim()
    return hat(von) && hat(nach) && !!a && a === header[nach]?.trim()
  }).map(([von, nach]) => ({ von, nach }))
}

/** Eine Beanstandung im Kopf: an welchem Feld, mit welchem Text und mit
 *  welchen Einsetzungen. Der Schluessel steht MIT Namensraum da — so prueft
 *  i18n.test.ts mechanisch, dass es ihn in forms.json gibt. */
export interface Kopffehler {
  feld: string
  schluessel: 'forms:errDueBeforeDate' | 'forms:errSameFromTo' | 'forms:errWholeNumber'
  werte: Record<string, string>
}

/**
 * Plausibilitaet der Kopfdaten — eine Stelle fuer Warnung und Fehler.
 *
 * Audit 11/2026, GTY-05: Die Zukunftswarnung pruefte JEDES Datumsfeld. Ein
 * korrektes Due Date des 310 (es liegt naturgemaess in der Zukunft) loeste
 * deshalb „The date is in the future" aus, waehrend ein Due Date VOR dem
 * Formulardatum ohne Rueckfrage durchging. Gewarnt wird jetzt nur beim
 * Schulungsdatum (`date` — jeder Formulartyp fuehrt es unter diesem
 * Schluessel, auch die im Admin Panel angelegten); ein Due Date vor dem
 * Datum ist ein Fehler.
 *
 * Die Fehler tragen ihr Feld: Das Formular meldet sie in Schritt 1 am Feld
 * (`validateHeader`) bzw. fuer Session-Daten in der Liste der offenen
 * Punkte (Schritt 2) — je nachdem, wo das Feld steht.
 */
export function kopfHinweise(
  fields: Pick<FormField, 'key' | 'label' | 'type'>[],
  header: Record<string, string | undefined>,
  heute: string,
): { zukunft: boolean; fehler: Kopffehler[] } {
  const feld = (key: string) => fields.find((f) => f.key === key)
  const wert = (key: string) => header[key]?.trim() ?? ''
  const datum = feld('date')
  // ISO-Tage (YYYY-MM-DD) vergleichen sich als Zeichenkette richtig.
  const zukunft = datum?.type === 'date' && !!wert('date') && wert('date') > heute
  const fehler: Kopffehler[] = []
  const faellig = feld('dueDate')
  if (datum && faellig && wert('dueDate') && wert('date') && wert('dueDate') < wert('date')) {
    fehler.push({ feld: 'dueDate', schluessel: 'forms:errDueBeforeDate', werte: { due: faellig.label, date: datum.label } })
  }
  for (const p of gleichePaare(fields, header)) {
    fehler.push({ feld: p.nach, schluessel: 'forms:errSameFromTo', werte: { from: feld(p.von)!.label, to: feld(p.nach)!.label } })
  }
  for (const f of fields) {
    if (f.type === 'number' && !ganzzahligNichtNegativ(header[f.key])) {
      fehler.push({ feld: f.key, schluessel: 'forms:errWholeNumber', werte: { field: f.label } })
    }
  }
  return { zukunft, fehler }
}
