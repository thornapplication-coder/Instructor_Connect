import { giltMusterbereich, imMusterbereich } from './aircraftScope'
import type { GradingRecord, Role } from './types'

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
 *  - 306 und 310 zählen NIE: Folgeformulare dokumentieren die Session des
 *    Ausgangsblatts, keine eigene.
 *  - 308* ist „Simulator Training": Session aus Flight Time PF + PM des
 *    Formularkopfs, dazu pauschal 1:00 Briefing und 0:30 Debriefing als
 *    Startwerte — nachträglich je Eintrag änderbar.
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

/** "02:30" → 150. Tolerant: leere oder kaputte Angaben sind 0, nicht NaN. */
export function parseDauer(hhmm: string | undefined | null): number {
  if (!hhmm) return 0
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(hhmm.trim())
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

/** 150 → "02:30". Negatives wird zu "00:00" — eine Minusdauer ist ein Fehler. */
export function formatDauer(min: number): string {
  const v = Math.max(0, Math.round(min))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

export type LogbookEintrag = {
  /** Formular-ID bei abgeleiteten, eigene ID bei manuellen Einträgen. */
  id: string
  quelle: 'formular' | 'manuell'
  formTypeId?: string
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

/** Zählt dieses Formular in irgendein Logbuch? */
export function zaehltInsLogbuch(r: Pick<GradingRecord, 'status' | 'formTypeId'>): boolean {
  if (r.status !== 'signed') return false
  const typ = r.formTypeId
  return typ.startsWith('307') || typ.startsWith('308')
}

/** Datum eines Formulars: der Schulungstag aus dem Kopf, sonst der Zeitpunkt
 *  der Unterschrift bzw. Erfassung — dieselbe Rangfolge wie in der Ablage. */
function formularDatum(r: GradingRecord): string {
  const kopf = (r.header.date ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(kopf)) return kopf
  return new Date(r.signedAt ?? r.createdAt).toISOString().slice(0, 10)
}

function pilotenVon(r: GradingRecord): string[] {
  const namen = r.trainees.map((t) => (t.traineeName ?? '').trim()).filter(Boolean)
  if (namen.length > 0) return namen
  return (r.attendance ?? []).map((a) => (a.name ?? '').trim()).filter(Boolean)
}

/**
 * Der abgeleitete Eintrag eines Formulars — oder null, wenn es nicht zählt
 * oder bewusst entfernt wurde.
 */
export function eintragAusFormular(r: GradingRecord, override?: LogbookOverride): LogbookEintrag | null {
  if (!zaehltInsLogbuch(r)) return null
  const ov = override ?? {}
  if (ov.geloescht) return null
  const sim = r.formTypeId.startsWith('308')
  const session = ov.session ?? (sim ? parseDauer(r.header.flightTimePF) + parseDauer(r.header.flightTimePM) : parseDauer(r.header.duration))
  const briefing = ov.briefing ?? (sim ? BRIEFING_STD_MIN : 0)
  const debriefing = ov.debriefing ?? (sim ? DEBRIEFING_STD_MIN : 0)
  return {
    id: r.id,
    quelle: 'formular',
    formTypeId: r.formTypeId,
    datum: formularDatum(r),
    aircraftType: (r.header.aircraftType ?? '').trim(),
    kategorie: sim ? 'Simulator Training' : 'Ground Training',
    briefing,
    session,
    debriefing,
    gesamt: briefing + session + debriefing,
    piloten: pilotenVon(r),
    notiz: ov.notiz ?? '',
  }
}

/**
 * Das vollständige Logbuch einer Person: Ableitung aus allen Formularen, auf
 * denen sie als Instruktor steht, plus die manuellen Einträge — neueste
 * zuerst, bei gleichem Tag zuerst die Formulare.
 */
export function logbuchVon(records: GradingRecord[], userId: string, stand: LogbookStand): LogbookEintrag[] {
  const abgeleitet = records
    .filter((r) => r.instructorId === userId)
    .map((r) => eintragAusFormular(r, stand.overrides[r.id]))
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
  return [...abgeleitet, ...manuell].sort((a, b) => (a.datum === b.datum ? (a.quelle === b.quelle ? 0 : a.quelle === 'formular' ? -1 : 1) : a.datum < b.datum ? 1 : -1))
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
  if (viewer.id === ownerId) return eintraege
  if (!giltMusterbereich(viewer)) return eintraege
  if (viewer.role === 'group_admin') return eintraege.filter((e) => imMusterbereich(viewer.aircraftTypes, e.aircraftType))
  return []
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

export type LogbuchMonat = { monat: string /* YYYY-MM */; eintraege: LogbookEintrag[] }

/**
 * Gruppiert Eintraege nach Monat, neuester zuerst — und zwar LUECKENLOS:
 * Ein Monat ohne Eintrag steht als leere Gruppe da. Ein Taetigkeitsnachweis,
 * in dem der Juni einfach fehlt, sieht aus wie ein Uebertragungsfehler;
 * ein Juni mit „keine Eintraege" ist eine Aussage.
 */
export function nachMonaten(eintraege: LogbookEintrag[]): LogbuchMonat[] {
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
  const out: LogbuchMonat[] = []
  for (let j = maxJ, m = maxM; j > minJ || (j === minJ && m >= minM); ) {
    const k = `${j}-${String(m).padStart(2, '0')}`
    out.push({ monat: k, eintraege: gruppen.get(k) ?? [] })
    m -= 1
    if (m === 0) {
      m = 12
      j -= 1
    }
  }
  return out
}
