import { giltMusterbereich, imMusterbereich } from './aircraftScope'
import { csvNum, csvRow } from './csv'
import { dateiName } from './dateiName'
import { formatDate, formatDateTime, lokalerTag } from './datum'
import type { GradingRecord, Role } from './types'
import type { XlsxOptionen } from './xlsxExport'

/**
 * my AAA Logbook — die eigene Instruktorentätigkeit, aus den Formularen
 * abgeleitet.
 *
 * Für die Verlängerung von FI/TRI/SFI muss jeder Instruktor seine Tätigkeit
 * nachweisen. Die Daten liegen längst in den Grading-Records — gezählt wurde
 * trotzdem auf Papier oder in Excel daneben. Das Logbuch leitet die Einträge
 * aus dem Bestand ab, statt sie ein zweites Mal zu erfassen.
 *
 * **Was zählt — und was nicht:**
 *
 *  - Nur VOLLSTÄNDIG unterschriebene Formulare (`status === 'signed'`).
 *    Ein Blatt ohne alle Unterschriften ist kein Nachweis — dieselbe Regel
 *    wie in `gradingStats`.
 *  - Gezählt wird der DURCHGANG, nicht das Blatt (`batchId`): Zwei Piloten
 *    in einer Session sind zwei Blätter, aber eine Instruktorstunde. Sonst
 *    standen 5:30 als 11:00 im Nachweis (Audit 11/2026, LOG-01).
 *  - 306 und 310 zählen NIE: Folgeformulare dokumentieren die Session des
 *    Ausgangsblatts, keine eigene.
 *  - 308* ist „Simulator Training": Session aus Flight Time PF + PM des
 *    Formularkopfs (führt der Typ sie nicht, wie das 308G: aus Session
 *    Time), dazu pauschal 1:00 Briefing und 0:30 Debriefing als
 *    Startwerte — nachträglich je Eintrag änderbar. Steht im Formular gar
 *    keine Zeit, heißt der Eintrag `zeitFehlt` statt still 00:00 (GTY-03).
 *  - 307* ist „Ground Training": die Dauer aus dem Duration-Feld, ohne
 *    Zuschläge.
 *  - Andere (eigene) Formulartypen zählen nicht automatisch — für sie sagt
 *    keine Regel, was Briefing und Session wären. Der Weg dafür ist ein
 *    manueller Eintrag.
 *
 * **Korrekturen überleben.** Abgeleitete Einträge lassen sich ändern und
 * löschen; die Korrektur liegt als Override neben dem Formular, nicht im
 * Formular — ein unterschriebenes Blatt bleibt unangetastet (Fingerabdruck!),
 * und die Ableitung kann jederzeit neu rechnen, ohne die Korrektur zu
 * verlieren.
 */

/** Feste Kategorien; manuelle Einträge dürfen zusätzlich frei benennen. */
export const LOGBOOK_KATEGORIEN = ['Simulator Training', 'Ground Training', 'Other Training'] as const

export const BRIEFING_STD_MIN = 60
export const DEBRIEFING_STD_MIN = 30

/** "02:30" → 150. Tolerant: leere oder kaputte Angaben sind 0, nicht NaN.
 *  Fuer FORMULARWERTE — die hat das Grading-Formular schon geprueft; was
 *  der Nutzer im Logbuch tippt, liest `parseDauerEingabe`. */
export function parseDauer(hhmm: string | undefined | null): number {
  if (!hhmm) return 0
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(hhmm.trim())
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Eine EINGABE im Logbuch als Minuten — oder null, wenn sie sich nicht
 * eindeutig lesen laesst.
 *
 * Audit 11/2026, KERN-02: Das Feld oeffnet am iPhone den Ziffernblock
 * (`inputMode="numeric"`), und der hat keinen Doppelpunkt. Gelesen wurde nur
 * „H:MM"; „130" wurde beim Verlassen still zu 00:00 — im Korrekturdialog
 * verschwand so die Session-Zeit aus dem Taetigkeitsnachweis. Jetzt:
 *
 *  - „1:30" wie bisher,
 *  - reine Ziffern als HMM bzw. HHMM („130" und „0130" = 1:30, „1230" =
 *    12:30) — so tippt man eine Dauer auf dem Ziffernblock,
 *  - ein oder zwei Ziffern („90") sind NICHT eindeutig (90 Minuten? 90
 *    Stunden?) und werden gemeldet statt geraten; nur „0" ist klar,
 *  - Minuten ab 60 („1:75", „175") und alles andere („1.30", „1,5") ebenso.
 *
 * Ein leeres Feld ist keine Fehleingabe, sondern „keine Zeit" (0).
 */
export function parseDauerEingabe(text: string): number | null {
  const s = text.trim()
  if (s === '' || /^0+$/.test(s)) return 0
  const m = /^(\d{1,3}):(\d{2})$/.exec(s) ?? /^(\d{1,2})(\d{2})$/.exec(s)
  if (!m) return null
  const minuten = Number(m[2])
  if (minuten >= 60) return null
  return Number(m[1]) * 60 + minuten
}

/** 150 → "02:30". Negatives wird zu "00:00" — eine Minusdauer ist ein Fehler. */
export function formatDauer(min: number): string {
  const v = Math.max(0, Math.round(min))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

export type LogbookEintrag = {
  /** Bei abgeleiteten Einträgen die ID des ältesten Blatts des Durchgangs,
   *  bei manuellen die eigene. */
  id: string
  quelle: 'formular' | 'manuell'
  formTypeId?: string
  /** Nur abgeleitet: ALLE Blätter des Durchgangs, ältestes zuerst (= `id`).
   *  Korrekturen werden darunter gesucht und geschrieben (LOG-01). */
  blattIds?: string[]
  /** YYYY-MM-DD — sortier- und vergleichbar als Text. */
  datum: string
  aircraftType: string
  kategorie: string
  /** Teilzeiten in Minuten. 307 und manuelle Einträge haben nur `session`. */
  briefing: number
  session: number
  debriefing: number
  gesamt: number
  piloten: string[]
  notiz: string
  /**
   * Nur abgeleitet und nur, wenn eine Korrektur eine Teilzeit verändert:
   * die Werte des unterschriebenen Formulars. Audit 11/2026, KERN-04 — die
   * Zeile trug die Formularnummer und wirkte formulargedeckt, obwohl die
   * Zeit frei eingegeben war; wer auswertet, konnte das nicht unterscheiden.
   * Eine Notiz allein oder dieselben Werte sind keine Abweichung.
   */
  korrigiert?: { briefing: number; session: number; debriefing: number; gesamt: number }
  /**
   * Nur abgeleitet: Das Formular nennt KEINE Sessionzeit (kein Feld
   * ausgefüllt) und keine Korrektur ergänzt sie. Audit 11/2026, GTY-03 —
   * ein 308G von vor dem Feld „Session Time" stand als Session 00:00 im
   * Nachweis, als wäre das gemessen. Die Session zählt dann 0, aber
   * Anzeige und Export sagen, dass sie fehlt.
   */
  zeitFehlt?: boolean
}

/** Korrektur an einem abgeleiteten Eintrag — liegt NEBEN dem Formular. */
export type LogbookOverride = {
  briefing?: number
  session?: number
  debriefing?: number
  notiz?: string
  /** Der Eintrag ist bewusst entfernt; die Ableitung legt ihn nicht neu an. */
  geloescht?: boolean
}

export type LogbookManuell = {
  id: string
  datum: string
  aircraftType: string
  kategorie: string
  /** Minuten. */
  dauer: number
  notiz: string
}

/** Das Logbuch EINER Person, wie es im Store liegt. */
export type LogbookStand = {
  overrides: Record<string, LogbookOverride>
  manuell: LogbookManuell[]
}

export const LEERES_LOGBUCH: LogbookStand = { overrides: {}, manuell: [] }

/** Gehört dieser Formulartyp überhaupt ins Logbuch (unabhängig vom Stand)? */
function logbuchTyp(formTypeId: string): boolean {
  return formTypeId.startsWith('307') || formTypeId.startsWith('308')
}

/** Zählt dieses Formular in irgendein Logbuch? */
export function zaehltInsLogbuch(r: Pick<GradingRecord, 'status' | 'formTypeId'>): boolean {
  return r.status === 'signed' && logbuchTyp(r.formTypeId)
}

/** Datum eines Formulars: der Schulungstag aus dem Kopf, sonst der Zeitpunkt
 *  der Unterschrift bzw. Erfassung — dieselbe Rangfolge wie in der Ablage.
 *  Der Ersatz ist der Kalendertag in ORTSZEIT (Audit 11/2026, EXM-01): Mit
 *  `toISOString()` landete eine Unterschrift um 00:30 in Wien auf dem
 *  Vortag — und damit im Logbuch womöglich im falschen Monat. */
function formularDatum(r: GradingRecord): string {
  const kopf = (r.header.date ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(kopf)) return kopf
  return lokalerTag(r.signedAt ?? r.createdAt)
}

function pilotenVon(r: GradingRecord): string[] {
  const namen = r.trainees.map((t) => (t.traineeName ?? '').trim()).filter(Boolean)
  if (namen.length > 0) return namen
  return (r.attendance ?? []).map((a) => (a.name ?? '').trim()).filter(Boolean)
}

/**
 * Die Durchgänge einer Person: ihre Blätter der Logbuch-Typen, gruppiert
 * nach `batchId` (ein Blatt ohne Durchgang ist sein eigener), je Durchgang
 * ältestes Blatt zuerst. Alle Blätter eines Durchgangs entstehen im selben
 * Augenblick (`GradingForm`, ein `createdAt`); dann entscheidet die
 * Reihenfolge der Ablage, und die ändert sich beim Nachsignieren nicht —
 * die ID des Eintrags bleibt damit stabil.
 */
function durchgaengeVon(records: GradingRecord[], userId: string): GradingRecord[][] {
  const gruppen = new Map<string, GradingRecord[]>()
  for (const r of records) {
    if (r.instructorId !== userId || !logbuchTyp(r.formTypeId)) continue
    const k = r.batchId ?? r.id
    const g = gruppen.get(k)
    if (g) g.push(r)
    else gruppen.set(k, [r])
  }
  // Array.prototype.sort ist stabil: gleiche createdAt behalten die Ablagefolge.
  return [...gruppen.values()].map((g) => [...g].sort((a, b) => a.createdAt - b.createdAt))
}

/**
 * Die Korrektur, die für einen Durchgang gilt — oder null.
 *
 * Seit LOG-01 schreibt die Oberfläche eine Korrektur NUR unter die ID des
 * Eintrags und räumt die anderen Blätter dabei ab (`overrideSetzen`); eine
 * Löschmarke steht auf JEDEM Blatt, damit sie auch ein später
 * nachsigniertes Blatt erfasst. Vorher war jedes Blatt ein eigener Eintrag
 * mit eigener Korrektur. Für diesen Altbestand gilt:
 *
 *  - eine Zeitkorrektur geht einer Löschmarke vor (die erste in der Folge
 *    der Blätter — eine „jüngste" gibt es nicht, Korrekturen tragen keine
 *    Zeit),
 *  - entfernt ist der Durchgang nur, wenn JEDES unterschriebene Blatt die
 *    Marke trägt. Wer vorher nur den doppelten Eintrag eines zweiten
 *    Piloten löschte, hat damit die Verdopplung beseitigt, nicht die
 *    Session.
 */
function korrekturFuer(blaetter: GradingRecord[], overrides: Record<string, LogbookOverride>): LogbookOverride | null {
  const vorhanden = blaetter.map((b) => overrides[b.id]).filter((o): o is LogbookOverride => !!o)
  const korrektur = vorhanden.find((o) => !o.geloescht)
  if (korrektur) return korrektur
  const signiert = blaetter.filter(zaehltInsLogbuch)
  if (signiert.length > 0 && signiert.every((b) => overrides[b.id]?.geloescht)) return { geloescht: true }
  return null
}

/** Ein Zeitfeld des Formulars, das ausgefüllt ist (auch „00:00" — das ist
 *  eine Angabe; leer oder fehlend ist keine). */
const gefuellt = (wert: string | undefined) => !!wert && wert.trim() !== ''

/**
 * Formularwerte eines Durchgangs, ohne Korrektur — und ob das Formular
 * überhaupt eine Sessionzeit nennt.
 *
 * 308*: PF + PM, sobald eines davon ausgefüllt ist; sonst Session Time —
 * das 308G führt PF/PM nicht (GTY-03). 307*: das Duration-Feld.
 */
function formularZeiten(r: GradingRecord): { briefing: number; session: number; debriefing: number; zeitFehlt: boolean } {
  const h = r.header
  if (!r.formTypeId.startsWith('308')) {
    return { briefing: 0, session: parseDauer(h.duration), debriefing: 0, zeitFehlt: !gefuellt(h.duration) }
  }
  const pfPm = gefuellt(h.flightTimePF) || gefuellt(h.flightTimePM)
  return {
    briefing: BRIEFING_STD_MIN,
    session: pfPm ? parseDauer(h.flightTimePF) + parseDauer(h.flightTimePM) : parseDauer(h.sessionTime),
    debriefing: DEBRIEFING_STD_MIN,
    zeitFehlt: !pfPm && !gefuellt(h.sessionTime),
  }
}

/**
 * Der Eintrag eines Durchgangs — oder null, wenn kein Blatt fertig ist oder
 * der Durchgang bewusst entfernt wurde.
 *
 * Teilweise unterschrieben: Der Durchgang erscheint, sobald EIN Blatt
 * vollständig unterschrieben ist — die Session hat stattgefunden, und
 * dieses Blatt belegt sie. Als Piloten stehen nur die fertigen Blätter da;
 * wer noch unterschreiben muss, kommt mit seiner Unterschrift dazu, die Zeit
 * zählt dabei nicht noch einmal. Zeiten, Datum und Muster stammen aus dem
 * ältesten fertigen Blatt: Der Kopf ist für alle Blätter eines Durchgangs
 * derselbe (`GradingForm`, `buildRecords`).
 */
function eintragAusDurchgang(blaetter: GradingRecord[], overrides: Record<string, LogbookOverride>): LogbookEintrag | null {
  const fertig = blaetter.filter(zaehltInsLogbuch)
  if (fertig.length === 0) return null
  const ov = korrekturFuer(blaetter, overrides)
  if (ov?.geloescht) return null
  const r = fertig[0]
  const formular = formularZeiten(r)
  const briefing = ov?.briefing ?? formular.briefing
  const session = ov?.session ?? formular.session
  const debriefing = ov?.debriefing ?? formular.debriefing
  const abweichend = briefing !== formular.briefing || session !== formular.session || debriefing !== formular.debriefing
  // Eine Korrektur MIT Session ergänzt die fehlende Zeit; eine Notiz allein nicht.
  const zeitFehlt = formular.zeitFehlt && ov?.session === undefined
  return {
    id: blaetter[0].id,
    quelle: 'formular',
    formTypeId: r.formTypeId,
    blattIds: blaetter.map((b) => b.id),
    datum: formularDatum(r),
    aircraftType: (r.header.aircraftType ?? '').trim(),
    kategorie: r.formTypeId.startsWith('308') ? 'Simulator Training' : 'Ground Training',
    briefing,
    session,
    debriefing,
    gesamt: briefing + session + debriefing,
    piloten: [...new Set(fertig.flatMap(pilotenVon))],
    notiz: ov?.notiz ?? '',
    ...(abweichend
      ? { korrigiert: { briefing: formular.briefing, session: formular.session, debriefing: formular.debriefing, gesamt: formular.briefing + formular.session + formular.debriefing } }
      : {}),
    ...(zeitFehlt ? { zeitFehlt: true } : {}),
  }
}

/**
 * Der abgeleitete Eintrag EINES Formulars — oder null, wenn es nicht zählt
 * oder bewusst entfernt wurde. Für ein Blatt ohne Geschwister; das Logbuch
 * selbst rechnet je Durchgang (`logbuchVon`).
 */
export function eintragAusFormular(r: GradingRecord, override?: LogbookOverride): LogbookEintrag | null {
  return eintragAusDurchgang([r], override ? { [r.id]: override } : {})
}

/** Neueste zuerst, bei gleichem Tag zuerst die Formulare. */
function nachDatum(a: LogbookEintrag, b: LogbookEintrag): number {
  return a.datum === b.datum ? (a.quelle === b.quelle ? 0 : a.quelle === 'formular' ? -1 : 1) : a.datum < b.datum ? 1 : -1
}

/**
 * Das vollständige Logbuch einer Person: Ableitung aus allen Durchgängen, in
 * denen sie als Instruktor steht, plus die manuellen Einträge — neueste
 * zuerst, bei gleichem Tag zuerst die Formulare.
 */
export function logbuchVon(records: GradingRecord[], userId: string, stand: LogbookStand): LogbookEintrag[] {
  const abgeleitet = durchgaengeVon(records, userId)
    .map((b) => eintragAusDurchgang(b, stand.overrides))
    .filter((e): e is LogbookEintrag => e !== null)
  const manuell = stand.manuell.map<LogbookEintrag>((m) => ({
    id: m.id,
    quelle: 'manuell',
    datum: m.datum,
    aircraftType: m.aircraftType,
    kategorie: m.kategorie,
    briefing: 0,
    session: m.dauer,
    debriefing: 0,
    gesamt: m.dauer,
    piloten: [],
    notiz: m.notiz,
  }))
  return [...abgeleitet, ...manuell].sort(nachDatum)
}

/**
 * Die bewusst entfernten Formular-Einträge einer Person — mit den Werten des
 * Formulars, damit man sieht, WAS man zurückholt.
 *
 * Audit 11/2026, KERN-05: Die Löschmarke ist gewollt (die Ableitung legt
 * einen entfernten Eintrag nicht neu an), aber sie ließ sich nicht
 * zurücknehmen — „Auf Formularwerte zurücksetzen" saß im Dialog eines
 * SICHTBAREN Eintrags. Ein Fehlgriff entfernte eine Sim-Session dauerhaft
 * aus dem Tätigkeitsnachweis.
 */
export function entfernteFormularEintraege(records: GradingRecord[], userId: string, stand: LogbookStand): LogbookEintrag[] {
  return durchgaengeVon(records, userId)
    .filter((b) => b.some(zaehltInsLogbuch) && korrekturFuer(b, stand.overrides)?.geloescht)
    .map((b) => eintragAusDurchgang(b, {}))
    .filter((e): e is LogbookEintrag => e !== null)
    .sort(nachDatum)
}

/**
 * Schreibt eine Korrektur (oder ihre Rücknahme mit `null`) für einen
 * abgeleiteten Eintrag und gibt die neuen Overrides zurück.
 *
 * Die alten Korrekturen ALLER Blätter des Durchgangs fallen dabei weg —
 * sonst tauchte nach „Zurücksetzen" eine Altkorrektur eines anderen Blatts
 * wieder auf. Eine Zeitkorrektur steht unter der ID des Eintrags, eine
 * Löschmarke auf jedem Blatt (siehe `korrekturFuer`).
 */
export function overrideSetzen(
  overrides: Record<string, LogbookOverride>,
  eintrag: { id: string; blattIds?: string[] },
  ov: LogbookOverride | null,
): Record<string, LogbookOverride> {
  const ids = eintrag.blattIds?.length ? eintrag.blattIds : [eintrag.id]
  const neu = { ...overrides }
  for (const id of ids) delete neu[id]
  if (ov === null) return neu
  if (ov.geloescht) for (const id of ids) neu[id] = { geloescht: true }
  else neu[eintrag.id] = ov
  return neu
}

export type LogbookFilter = {
  von?: string
  bis?: string
  muster?: string
  kategorie?: string
  formTyp?: string
  pilot?: string
}

export function filtereEintraege(eintraege: LogbookEintrag[], f: LogbookFilter): LogbookEintrag[] {
  return eintraege.filter((e) => {
    if (f.von && e.datum < f.von) return false
    if (f.bis && e.datum > f.bis) return false
    if (f.muster && e.aircraftType !== f.muster) return false
    if (f.kategorie && e.kategorie !== f.kategorie) return false
    if (f.formTyp && e.formTypeId !== f.formTyp) return false
    if (f.pilot && !e.piloten.some((p) => p.toLowerCase().includes(f.pilot!.trim().toLowerCase()))) return false
    return true
  })
}

export type LogbookSummen = {
  gesamt: number
  eintraege: number
  jeKategorie: Record<string, number>
  jeMuster: Record<string, number>
}

export function summiere(eintraege: LogbookEintrag[]): LogbookSummen {
  const s: LogbookSummen = { gesamt: 0, eintraege: eintraege.length, jeKategorie: {}, jeMuster: {} }
  for (const e of eintraege) {
    s.gesamt += e.gesamt
    s.jeKategorie[e.kategorie] = (s.jeKategorie[e.kategorie] ?? 0) + e.gesamt
    const m = e.aircraftType || '—'
    s.jeMuster[m] = (s.jeMuster[m] ?? 0) + e.gesamt
  }
  return s
}

/**
 * Was ein Betrachter vom Logbuch einer ANDEREN Person sieht.
 *
 * Das eigene Logbuch sieht jeder ganz. Superadmin und Training Admin sehen
 * alle ganz (dieselbe Rollenausnahme wie überall, `OHNE_SCHRANKE`). Ein
 * Gruppenadmin sieht fremde Logbücher nur in seinen Mustern — ein Eintrag
 * ohne Muster gilt dabei wie überall als „für alle". Ein Mitglied sieht
 * fremde Logbücher gar nicht.
 */
export function sichtbareEintraege(
  viewer: { id: string; role: Role; aircraftTypes?: string[] },
  ownerId: string,
  eintraege: LogbookEintrag[],
): LogbookEintrag[] {
  return logbuchSicht(viewer, ownerId, eintraege).eintraege
}

export type LogbuchSicht = {
  eintraege: LogbookEintrag[]
  /** Wie viele Einträge die Musterregel ausblendet. */
  ausgeblendet: number
  /** Die Muster, auf die die Sicht beschränkt ist — null, wenn sie es nicht ist. */
  bereich: string[] | null
}

/**
 * Dieselbe Sicht wie `sichtbareEintraege`, dazu WAS sie auslässt.
 *
 * Audit 11/2026, KERN-03: Öffnete ein Gruppenadmin (CL30) das Logbuch einer
 * Person, die nur C560 fliegt, stand da „Noch keine Einträge … 00:00", und
 * die CSV behauptete „Aircraft type: all … Entries 0 of 0". Dass er nur
 * seine Muster sieht, ist gewollt — nicht, dass Anzeige und Export das
 * verschweigen und einen leeren Tätigkeitsnachweis behaupten.
 */
export function logbuchSicht(
  viewer: { id: string; role: Role; aircraftTypes?: string[] },
  ownerId: string,
  eintraege: LogbookEintrag[],
): LogbuchSicht {
  if (viewer.id === ownerId || !giltMusterbereich(viewer)) return { eintraege, ausgeblendet: 0, bereich: null }
  const sichtbar = viewer.role === 'group_admin' ? eintraege.filter((e) => imMusterbereich(viewer.aircraftTypes, e.aircraftType)) : []
  return { eintraege: sichtbar, ausgeblendet: eintraege.length - sichtbar.length, bereich: viewer.role === 'group_admin' ? [...(viewer.aircraftTypes ?? [])].sort() : [] }
}

/** Darf der Betrachter dieses Logbuch überhaupt öffnen? */
export function darfLogbuchOeffnen(viewer: { id: string; role: Role }, ownerId: string): boolean {
  if (viewer.id === ownerId) return true
  return viewer.role === 'superadmin' || viewer.role === 'training_admin' || viewer.role === 'group_admin'
}

/**
 * Zeitfilter der Admin-Auswertung (Superadmin-Panel, Bereich „Logbuch").
 *
 * Zwei Arten von Filter in EINER Reihe, weil sie sich für den Leser wie eine
 * Frage anfühlen („welche Zeit will ich sehen?"): „alle" und „ohneBriefing"
 * ändern, WIE gezählt wird (mit oder ohne Vor- und Nachbereitung), die drei
 * Kategoriefilter ändern, WAS gezählt wird. „other" fängt alles, was weder
 * Ground noch Simulator ist — auch Freitext-Kategorien: Sonst fiele ein
 * manueller Eintrag mit eigener Bezeichnung aus jeder der drei Gruppen und
 * die Kategoriesummen ergäben zusammen weniger als „alle".
 */
export const ADMIN_ZEIT_FILTER = ['alle', 'ohneBriefing', 'ground', 'simulator', 'other'] as const
export type AdminZeitFilter = (typeof ADMIN_ZEIT_FILTER)[number]

export function eintraegeUnterFilter(eintraege: LogbookEintrag[], filter: AdminZeitFilter): LogbookEintrag[] {
  if (filter === 'ground') return eintraege.filter((e) => e.kategorie === 'Ground Training')
  if (filter === 'simulator') return eintraege.filter((e) => e.kategorie === 'Simulator Training')
  if (filter === 'other') return eintraege.filter((e) => e.kategorie !== 'Ground Training' && e.kategorie !== 'Simulator Training')
  return eintraege
}

/**
 * Summe unter einem Zeitfilter. Bei „ohneBriefing" zählt nur die Session —
 * bei 307ern und manuellen Einträgen ist das ohnehin die ganze Zeit, bei
 * 308ern fallen Briefing und Debriefing weg. Die Kategoriefilter zählen die
 * volle Zeit ihrer Einträge, Briefing eingeschlossen: „Simulator Training
 * only" fragt nach dem Aufwand der Kategorie, nicht nach der reinen Sim-Zeit.
 */
export function summeUnterFilter(eintraege: LogbookEintrag[], filter: AdminZeitFilter): { minuten: number; anzahl: number } {
  const passend = eintraegeUnterFilter(eintraege, filter)
  const minuten = passend.reduce((s, e) => s + (filter === 'ohneBriefing' ? e.session : e.gesamt), 0)
  return { minuten, anzahl: passend.length }
}

export type AdminZeile = {
  anzahl: number
  ground: number
  simulator: number
  other: number
  gesamt: number
  /** Muster, die in den gezaehlten Eintraegen vorkommen — sortiert, ohne Leere */
  muster: string[]
}

/**
 * Eine Zeile der Admin-Tabelle: je Kategorie eine Spalte statt eines
 * umzuschaltenden Einzelwerts — der Ueberblick soll ohne Klicken zeigen,
 * woraus sich die Gesamtzeit zusammensetzt. `ohneBriefing` zaehlt ueberall
 * nur die Session (bei 307ern und manuellen Eintraegen ohnehin die ganze
 * Zeit); die drei Kategoriespalten ergeben zusammen stets die Gesamtspalte,
 * weil „other" auch Freitext-Kategorien faengt.
 */
export function adminZeile(eintraege: LogbookEintrag[], ohneBriefing: boolean): AdminZeile {
  const zeit = (e: LogbookEintrag) => (ohneBriefing ? e.session : e.gesamt)
  const je = (f: AdminZeitFilter) => eintraegeUnterFilter(eintraege, f).reduce((s, e) => s + zeit(e), 0)
  return {
    anzahl: eintraege.length,
    ground: je('ground'),
    simulator: je('simulator'),
    other: je('other'),
    gesamt: eintraege.reduce((s, e) => s + zeit(e), 0),
    muster: [...new Set(eintraege.map((e) => e.aircraftType).filter(Boolean))].sort(),
  }
}

export type LogbuchAbschnitt =
  | { art: 'monat'; monat: string; eintraege: LogbookEintrag[] }
  | { art: 'luecke'; von: string; bis: string; monate: number }

/**
 * Gliedert Eintraege in Monatsabschnitte, neuester zuerst — mit sichtbaren
 * Luecken. Ein EINZELNER Monat ohne Eintrag steht als leerer Monat da: In
 * einem Taetigkeitsnachweis sieht ein fehlender Monat aus wie ein
 * Uebertragungsfehler, ein leerer Monat ist eine Aussage.
 *
 * MEHRERE leere Monate am Stueck werden zu einer Zeile zusammengefasst.
 * Befund aus dem Audit: Ein einzelner Eintrag von 2019 neben einem von 2026
 * erzeugte 90 Abschnitte, 88 davon leer — am Handy minutenlanges Scrollen
 * durch „keine Eintraege". Die Aussage bleibt erhalten, sie braucht nur
 * nicht 88 Zeilen.
 */
export function nachMonaten(eintraege: LogbookEintrag[]): LogbuchAbschnitt[] {
  if (eintraege.length === 0) return []
  const gruppen = new Map<string, LogbookEintrag[]>()
  for (const e of eintraege) {
    const k = e.datum.slice(0, 7)
    const g = gruppen.get(k)
    if (g) g.push(e)
    else gruppen.set(k, [e])
  }
  const schluessel = [...gruppen.keys()].sort()
  const [minJ, minM] = schluessel[0].split('-').map(Number)
  const [maxJ, maxM] = schluessel[schluessel.length - 1].split('-').map(Number)
  const out: LogbuchAbschnitt[] = []
  let leer: string[] = []
  const luecke = () => {
    if (leer.length === 0) return
    if (leer.length === 1) out.push({ art: 'monat', monat: leer[0], eintraege: [] })
    // Neuester zuerst: leer[0] ist der juengste, der letzte der aelteste.
    else out.push({ art: 'luecke', von: leer[leer.length - 1], bis: leer[0], monate: leer.length })
    leer = []
  }
  for (let j = maxJ, m = maxM; j > minJ || (j === minJ && m >= minM); ) {
    const k = `${j}-${String(m).padStart(2, '0')}`
    const g = gruppen.get(k)
    if (g) {
      luecke()
      out.push({ art: 'monat', monat: k, eintraege: g })
    } else {
      leer.push(k)
    }
    m -= 1
    if (m === 0) {
      m = 12
      j -= 1
    }
  }
  luecke()
  return out
}

export type AdminTabelle = {
  zeilen: (AdminZeile & { id: string; name: string; aktiv: boolean })[]
  summe: { anzahl: number; ground: number; simulator: number; other: number; gesamt: number }
  musterListe: string[]
}

/**
 * Die ganze Admin-Auswertung in EINER Rechnung — Zeilen, Summenzeile und die
 * Muster-Auswahl aus demselben Durchlauf.
 *
 * Zwei Befunde des Audits stecken hier drin: Die Seite rechnete `logbuchVon`
 * zweimal je Nutzer (einmal fuer die Tabelle, einmal fuer die Musterliste),
 * und die Summenzeile stand als fuenf `reduce` in der .tsx — also ausserhalb
 * jeder Testwache. Die Zusage „die Summenzeile ist die Summe der Spalten"
 * gehoert getestet, nicht gehofft.
 */
export function adminTabelle(
  nutzer: { id: string; name: string; active: boolean }[],
  records: GradingRecord[],
  stand: Record<string, LogbookStand>,
  filter: LogbookFilter,
  ohneBriefing: boolean,
): AdminTabelle {
  const alleMuster = new Set<string>()
  const zeilen: AdminTabelle['zeilen'] = []
  for (const u of nutzer) {
    const alle = logbuchVon(records, u.id, stand[u.id] ?? LEERES_LOGBUCH)
    if (alle.length === 0) continue // wer kein Logbuch fuehrt, ist keine Nullzeile wert
    for (const e of alle) if (e.aircraftType) alleMuster.add(e.aircraftType)
    zeilen.push({ id: u.id, name: u.name, aktiv: u.active, ...adminZeile(filtereEintraege(alle, filter), ohneBriefing) })
  }
  zeilen.sort((a, b) => b.gesamt - a.gesamt || a.name.localeCompare(b.name))
  const feld = (k: 'anzahl' | 'ground' | 'simulator' | 'other' | 'gesamt') => zeilen.reduce((s, z) => s + z[k], 0)
  return {
    zeilen,
    summe: { anzahl: feld('anzahl'), ground: feld('ground'), simulator: feld('simulator'), other: feld('other'), gesamt: feld('gesamt') },
    musterListe: [...alleMuster].sort(),
  }
}

/** Minuten als Dezimalstunden (150 → 2.5) — damit sich die Zeiten in Excel
 *  summieren und sortieren lassen. „02:30" ist dort nur Text. */
export function dezimalStunden(min: number): number {
  return Math.round((Math.max(0, min) / 60) * 100) / 100
}

/** Eine Zelle der Logbuch-Exporte: Text, oder Zahl für Dezimalstunden und
 *  Zähler (CSV schreibt sie mit Dezimalkomma, Excel als Zahl). */
export type ExportZelle = string | number

/** Zeilen als CSV — Dezimalzahlen mit dem Komma der Semikolon-Datei. */
export function zeilenAlsCsv(zeilen: ExportZelle[][]): string {
  return zeilen.map((r) => csvRow(r.map((z) => (typeof z === 'number' && !Number.isInteger(z) ? csvNum(z) : z)))).join('')
}

/** Kopf jedes Logbuch-Exports: wann und von wem — dieselbe Zeile wie im
 *  Grading-Export. Das Impressum sagt zu, dass Ausdrucke und Exporte immer
 *  Datum, Uhrzeit und Namen der exportierenden Person tragen. */
function exportKopf(exportiertAm: number, exportiertVon: string): ExportZelle[] {
  return ['Exported (date/time)', formatDateTime(exportiertAm), 'Exported by', exportiertVon]
}

function zeitraum(von?: string, bis?: string): string {
  return von || bis ? `${von ? formatDate(von) : '…'} - ${bis ? formatDate(bis) : '…'}` : 'all'
}

const LOGBUCH_SPALTEN = [
  'Date',
  'Category',
  'Aircraft',
  'Form',
  'Pilots',
  'Briefing',
  'Briefing (h)',
  'Session',
  'Session (h)',
  'Debriefing',
  'Debriefing (h)',
  'Total',
  'Total (h)',
  'Adjusted (form total)',
  'Note',
] as const

/** Je Zeit zwei Zellen: HH:MM zum Lesen, Dezimalstunden zum Rechnen. */
function zeitZellen(b: number, s: number, d: number, g: number): ExportZelle[] {
  return [formatDauer(b), dezimalStunden(b), formatDauer(s), dezimalStunden(s), formatDauer(d), dezimalStunden(d), formatDauer(g), dezimalStunden(g)]
}

/** Fehlt die Sessionzeit im Formular (GTY-03), steht „missing" statt
 *  „00:00" — eine 0 saehe gemessen aus. Die Summe zaehlt sie als 0. */
function sessionFehlt(zellen: ExportZelle[], e: LogbookEintrag): ExportZelle[] {
  if (!e.zeitFehlt) return zellen
  const z = [...zellen]
  z[2] = 'missing'
  z[3] = ''
  return z
}

/**
 * Die Zeilen der Logbuch-CSV einer Person.
 *
 * Audit 11/2026, KERN-14/LOG-02: Der Aufbau stand in `Logbook.tsx`, ausserhalb
 * jeder Testwache — und war unvollständig. Der Kopf nannte nur das Datum,
 * weder Uhrzeit noch Exportierenden, auch wenn ein Admin ein FREMDES Logbuch
 * exportierte. Die Zeiten standen nur als „16:30", das Tabellenprogramme als
 * Tageszeit lesen und über 24 h nicht summieren (der Admin-Export begründete
 * seine „(h)"-Spalten genau damit); und die Summe stand in Spalte 2 statt
 * unter „Total".
 *
 * KERN-03: Ist die Sicht auf die Muster des Betrachters beschränkt, nennt
 * der Kopf diesen Bereich und die Zahl der nicht gezeigten Einträge — vorher
 * stand dort „all", über einer leeren Liste.
 */
export function logbuchCsvZeilen(a: {
  inhaber: string
  sicht: LogbuchSicht
  /** Die gezeigten, also gefilterten Einträge. */
  eintraege: LogbookEintrag[]
  filter: LogbookFilter
  /** Zeitpunkt des Exports (mit Zeitversatz der Sandbox). */
  exportiertAm: number
  exportiertVon: string
}): ExportZelle[][] {
  const { sicht, eintraege, filter } = a
  const bereich = sicht.bereich ? `${sicht.bereich.join(', ') || '—'} (scope of viewer)` : 'all'
  const summe = (k: 'briefing' | 'session' | 'debriefing' | 'gesamt') => eintraege.reduce((n, e) => n + e[k], 0)
  return [
    ['my AAA Logbook', a.inhaber],
    exportKopf(a.exportiertAm, a.exportiertVon),
    /* Die aktiven Filter gehoeren in den Dateikopf — sonst sieht ein
       gefilterter Auszug aus wie das vollstaendige Logbuch. */
    ['Period', zeitraum(filter.von, filter.bis)],
    ['Aircraft type', filter.muster || bereich],
    ...(sicht.bereich ? [['Outside scope (not shown)', sicht.ausgeblendet]] : []),
    ['Category', filter.kategorie || 'all'],
    ['Form', filter.formTyp || 'all'],
    ['Pilot', filter.pilot || 'all'],
    ['Entries', `${eintraege.length} of ${sicht.eintraege.length}`],
    [],
    [...LOGBUCH_SPALTEN],
    ...eintraege.map((e) => [
      formatDate(e.datum),
      e.kategorie,
      e.aircraftType,
      e.formTypeId ?? 'manual',
      e.piloten.join('; '),
      ...sessionFehlt(zeitZellen(e.briefing, e.session, e.debriefing, e.gesamt), e),
      e.korrigiert ? formatDauer(e.korrigiert.gesamt) : '',
      e.notiz,
    ]),
    [],
    // Die Summe steht unter ihren Spalten, nicht irgendwo in Spalte 2.
    ['Total', '', '', '', '', ...zeitZellen(summe('briefing'), summe('session'), summe('debriefing'), summe('gesamt')), '', ''],
  ]
}

/** Titel des Admin-Exports — erste Zeile UND Dateieigenschaft der Excel-Datei. */
export const ADMIN_EXPORT_TITEL = 'AAA Logbook — all instructors'

/* Je Zeit zwei Spalten: HH:MM zum Lesen, Dezimalstunden zum Rechnen.
   „16:30" ist in Excel Text — damit laesst sich weder summieren noch
   sortieren, und genau dafuer nimmt jemand Excel statt CSV. */
const ADMIN_SPALTEN = ['Instructor', 'Aircraft types', 'Entries', 'Ground', 'Ground (h)', 'Simulator', 'Simulator (h)', 'Other', 'Other (h)', 'Total', 'Total (h)'] as const

type AdminExportEingabe = {
  tabelle: Pick<AdminTabelle, 'zeilen' | 'summe'>
  filter: Pick<LogbookFilter, 'von' | 'bis' | 'muster'>
  ohneBriefing: boolean
  exportiertAm: number
  exportiertVon: string
}

function adminExport(a: AdminExportEingabe): { zeilen: ExportZelle[][]; kopfzeile: number } {
  const { zeilen, summe } = a.tabelle
  const zeiten = (z: { ground: number; simulator: number; other: number; gesamt: number }): ExportZelle[] => [
    formatDauer(z.ground),
    dezimalStunden(z.ground),
    formatDauer(z.simulator),
    dezimalStunden(z.simulator),
    formatDauer(z.other),
    dezimalStunden(z.other),
    formatDauer(z.gesamt),
    dezimalStunden(z.gesamt),
  ]
  const vorspann: ExportZelle[][] = [
    [ADMIN_EXPORT_TITEL],
    exportKopf(a.exportiertAm, a.exportiertVon),
    ['Period', zeitraum(a.filter.von, a.filter.bis)],
    ['Aircraft type', a.filter.muster || 'all'],
    ['Counting', a.ohneBriefing ? 'without briefing' : 'with briefing'],
    [],
  ]
  return {
    zeilen: [
      ...vorspann,
      [...ADMIN_SPALTEN],
      ...zeilen.map((z) => [z.name, z.muster.join(', '), z.anzahl, ...zeiten(z)]),
      ['Total', '', summe.anzahl, ...zeiten(summe)],
    ],
    kopfzeile: vorspann.length + 1,
  }
}

/**
 * Die Zeilen des Admin-Exports (CSV und Excel aus denselben Zeilen): aktive
 * Filter im Kopf, dann exakt die Tabelle der Ansicht. Kopf mit Uhrzeit und
 * Exportierendem wie die Logbuch-CSV (KERN-14).
 */
export function adminExportZeilen(a: AdminExportEingabe): ExportZelle[][] {
  return adminExport(a).zeilen
}

/**
 * Dieselben Zeilen fuer Excel, dazu die Gestaltung: welche Zeile der Kopf
 * ist, welche Spalten Dezimalstunden („0.00") tragen, Titel und Zeitpunkt
 * fuer die Dateieigenschaften und das ZIP-Datum.
 *
 * Audit 11/2026, XLSX-01/EXM-09: Die Datei kam als Rohtabelle ohne
 * Kopfformat und ohne Eigenschaften, mit Zahlen wie „2.25" neben „4". Die
 * Angaben stehen HIER und nicht in der Seite, weil nur hier feststeht, wo
 * die Kopfzeile liegt und welche Spalten Stunden sind — zaehlte die Seite
 * Zeilen ab, liefe sie beim naechsten Kopffeld eine Zeile daneben.
 */
export function adminExcel(a: AdminExportEingabe): { zeilen: ExportZelle[][]; optionen: XlsxOptionen } {
  const { zeilen, kopfzeile } = adminExport(a)
  const zr = zeitraum(a.filter.von, a.filter.bis)
  return {
    zeilen,
    optionen: {
      kopfzeile,
      dezimalSpalten: ADMIN_SPALTEN.flatMap((s, i) => (s.endsWith('(h)') ? [i] : [])),
      // Ab „Entries" stehen Zahlen und Zeiten — alles rechts, sonst klebt
      // „05:30" an der Zahl davor.
      rechtsSpalten: ADMIN_SPALTEN.flatMap((_, i) => (i >= ADMIN_SPALTEN.indexOf('Entries') ? [i] : [])),
      summenzeile: zeilen.length,
      titel: zr === 'all' ? ADMIN_EXPORT_TITEL : `${ADMIN_EXPORT_TITEL} · ${zr}`,
      erstellt: a.exportiertAm,
    },
  }
}

/**
 * Downloadname eines Logbuch-Exports nach dem gemeinsamen Schema
 * (dateiName.ts): Inhalt, Bezug, Stand-Datum — z. B.
 * „aaa-logbook_Jürgen-Müller_2026-11-02.csv" bzw. fuer die Auswertung aller
 * Instruktoren (`inhaber` null) „aaa-logbook-instructors_2026-11-02.xlsx".
 *
 * Audit 11/2026, EXM-10/FN-01: Die Admin-Exporte hiessen immer gleich, und
 * der Name der Einzel-CSV ersetzte mit `/[^\w-]+/` ohne u-Flag jeden Umlaut
 * („J-rgen-M-ller"). Ein Logbuch ist eine Momentaufnahme — ohne Datum wurde
 * der naechste Auszug im Downloadordner zur „(1)"-Kopie, und welcher Stand
 * der aktuelle war, liess sich nur noch am Dateikopf ablesen.
 * `exportiertAm` ist derselbe Zeitpunkt wie im Kopf der Datei; der Tag ist
 * der ORTSTAG (`lokalerTag`), nicht der UTC-Tag.
 */
export function logbuchDateiName(inhaber: string | null, exportiertAm: number, endung: 'csv' | 'xlsx'): string {
  const teile = inhaber === null ? ['aaa-logbook-instructors'] : ['aaa-logbook', inhaber]
  return `${dateiName(teile, lokalerTag(exportiertAm))}.${endung}`
}
