import { darfSchreiben } from './storeRechte'
import { RETENTION_MS, type Attachment, type Group, type PollType, type RetentionKey, type User } from './types'

/**
 * Regeln fuer Nachrichten und Umfragen, die Store und Chat-Ansicht
 * gemeinsam fragen (Audit 11/2026, KERN-08, KERN-09).
 *
 * Der Store wies eine Nachricht mit zu grossem Anhang ab und eine Umfrage
 * mit vergangenem Ablauf ebenso — still. Die Ansicht leerte trotzdem
 * Eingabe und Anhang bzw. schloss den Dialog: Der getippte Text war weg,
 * und eine Meldung gab es nicht. Damit beide denselben Grund kennen und
 * nennen koennen, steht die Regel hier und nicht zweimal — zwei Pruefungen
 * fuer dieselbe Sache laufen auseinander (CLAUDE.md).
 */

/* ===================== Nachrichten ===================== */

/** Warum eine Nachricht nicht gesendet wird. */
export type NachrichtGrund = 'gesperrt' | 'keinMitglied' | 'leer' | 'anhangZuGross'

/**
 * Ist der Anhang groesser, als die Einstellungen erlauben?
 *
 * Eigene Frage, weil die Ansicht sie schon beim Anfuegen stellt: Wer erst
 * beim Senden erfaehrt, dass die Datei zu gross ist, hat den Text schon
 * fertig getippt.
 */
export function anhangZuGross(anhang: Pick<Attachment, 'sizeMB'> | undefined, maxUploadMB: number): boolean {
  return !!anhang && anhang.sizeMB > maxUploadMB
}

/**
 * Darf diese Nachricht in diese Gruppe? `null` heisst ja, sonst der Grund.
 *
 * Die Sperre steht vor der Mitgliedschaft: Sie ist der Grund, den ein Admin
 * bewusst gesetzt hat, und sie gilt auch fuer Mitglieder. Mitgliedschaft und
 * Musterbereich fragt `darfSchreiben` (storeRechte.ts) — dieselbe Regel, nach
 * der die Ansicht das Eingabefeld zeigt.
 */
export function nachrichtAbgewiesen(
  actor: User | null | undefined,
  group: Pick<Group, 'memberIds' | 'aircraftType'> | undefined,
  text: string,
  anhang: Pick<Attachment, 'sizeMB'> | undefined,
  maxUploadMB: number,
): NachrichtGrund | null {
  if (actor?.chatBlocked) return 'gesperrt'
  if (!group || !darfSchreiben(actor, group)) return 'keinMitglied'
  if (!text.trim() && !anhang) return 'leer'
  if (anhangZuGross(anhang, maxUploadMB)) return 'anhangZuGross'
  return null
}

/* ===================== Umfragen ===================== */

/** Warum der Ablauf einer Umfrage nicht geht. */
export type AblaufGrund = 'ablaufFehlt' | 'ablaufVorbei' | 'ablaufNachAufbewahrung'

/** Warum eine Umfrage nicht angelegt wird. */
export type UmfrageGrund = 'frageLeer' | 'zuWenigOptionen' | AblaufGrund

export interface UmfrageEntwurf {
  question: string
  type: PollType
  options: string[]
  validUntil?: number
}

/**
 * Bis wann kann eine JETZT angelegte Umfrage hoechstens laufen?
 *
 * Die Aufbewahrung der Gruppe loescht eine Umfrage ab ihrer Erstellung,
 * ihre Gueltigkeit spielt dabei keine Rolle (`visiblePolls` im Store).
 * Eine laut Anzeige noch zwoelf Tage gueltige Umfrage verschwand deshalb
 * samt Stimmen nach sieben (Audit 11/2026, KERN-09). `undefined` heisst:
 * keine Grenze (Aufbewahrung „nie loeschen").
 *
 * Genau am Rand ist erlaubt: Die Umfrage schliesst im selben Augenblick,
 * in dem die Aufbewahrung sie entfernt — es geht keine offene Zeit verloren.
 */
export function spaetestesUmfrageEnde(jetzt: number, aufbewahrung: RetentionKey): number | undefined {
  const dauer = RETENTION_MS[aufbewahrung]
  return Number.isFinite(dauer) ? jetzt + dauer : undefined
}

/**
 * Passt der Ablauf? Eigene Frage, weil der Dialog den Grund AM DATUMSFELD
 * nennt — auch solange die Frage noch leer ist.
 *
 * Pflicht (Seed und Dialog fuehren ihn schon so): Eine Umfrage ohne Ende
 * liefe in einer Gruppe mit Aufbewahrung unangekuendigt in die Loeschung.
 */
export function umfrageAblaufFehler(validUntil: number | undefined, jetzt: number, aufbewahrung: RetentionKey): AblaufGrund | null {
  if (validUntil === undefined || !Number.isFinite(validUntil)) return 'ablaufFehlt'
  // Eine Umfrage, deren Gueltigkeit schon abgelaufen ist, kaeme geschlossen
  // zur Welt — niemand koennte je abstimmen.
  if (validUntil <= jetzt) return 'ablaufVorbei'
  const grenze = spaetestesUmfrageEnde(jetzt, aufbewahrung)
  if (grenze !== undefined && validUntil > grenze) return 'ablaufNachAufbewahrung'
  return null
}

/**
 * Darf diese Umfrage so angelegt werden? `null` heisst ja, sonst der Grund.
 *
 * Der Dialog leitet daraus ab, ob „Erstellen" aktiv ist; der Store weist mit
 * derselben Antwort ab. Vorher prueften beide verschieden: Der Dialog liess
 * ein vergangenes Datum zu, der Store verwarf es still (KERN-08).
 */
export function umfrageAbgewiesen(e: UmfrageEntwurf, jetzt: number, aufbewahrung: RetentionKey): UmfrageGrund | null {
  if (!e.question.trim()) return 'frageLeer'
  if (e.type === 'multi' && e.options.filter((o) => o.trim()).length < 2) return 'zuWenigOptionen'
  return umfrageAblaufFehler(e.validUntil, jetzt, aufbewahrung)
}

/**
 * Datum (YYYY-MM-DD) und Uhrzeit (HH:MM) des Dialogs als UTC-Zeitpunkt.
 * Ohne Datum `undefined`; ohne Uhrzeit gilt 23:59 — das Ende des Tages, wie
 * es der Dialog vorbelegt.
 */
export function umfrageEndeAus(datum: string, zeit: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return undefined
  const hhmm = /^\d{2}:\d{2}/.test(zeit) ? zeit : '23:59'
  return Date.UTC(Number(datum.slice(0, 4)), Number(datum.slice(5, 7)) - 1, Number(datum.slice(8, 10)), Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)))
}

/** UTC-Kalendertag (YYYY-MM-DD) — fuer `min`/`max` am Datumsfeld des Dialogs, der in UTC rechnet. */
export function utcTag(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Ablaufzeitpunkt einheitlich als UTC anzeigen: DD.MM.YYYY HH:MM UTC */
export function utcZeit(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
}

/**
 * Anteile der Optionen in ganzen Prozent, die zusammen 100 ergeben.
 *
 * Je Option einzeln gerundet ergaben drei gleich starke Optionen
 * 33 + 33 + 33 = 99 %, die Stimmen 1/3/4 dagegen 13 + 38 + 50 = 101 %. Das
 * Größte-Reste-Verfahren stand schon in der Karte, wurde aber nie benutzt
 * (Audit 11/2026, KERN-15): Erst abrunden, dann die fehlenden Punkte an die
 * Optionen mit den größten Nachkommaresten verteilen — bei gleichem Rest an
 * die frühere Option, damit die Anzeige nicht von der Sortierung abhängt.
 *
 * Ohne Stimmen sind alle Anteile 0 (nicht 100 auf irgendwen verteilt).
 */
export function prozentAnteile(stimmen: readonly number[]): number[] {
  const gesamt = stimmen.reduce((a, b) => a + b, 0)
  if (gesamt <= 0) return stimmen.map(() => 0)
  const genau = stimmen.map((c) => (c / gesamt) * 100)
  const anteile = genau.map(Math.floor)
  let rest = 100 - anteile.reduce((a, b) => a + b, 0)
  const reihenfolge = genau
    .map((v, i) => ({ i, bruch: v - Math.floor(v) }))
    .sort((a, b) => b.bruch - a.bruch || a.i - b.i)
  for (const { i } of reihenfolge) {
    if (rest <= 0) break
    anteile[i] += 1
    rest -= 1
  }
  return anteile
}

/** Stimmen je Option — `votes` bildet Nutzer auf den Index ihrer Wahl ab. */
export function stimmenJeOption(anzahlOptionen: number, votes: Readonly<Record<string, number>>): number[] {
  const zaehler = Array.from({ length: anzahlOptionen }, () => 0)
  for (const v of Object.values(votes)) if (v >= 0 && v < anzahlOptionen) zaehler[v] += 1
  return zaehler
}

/* ===================== Verlauf ===================== */

/** Wie viele Einträge der Verlauf zuerst zeigt — und je Schritt nachlädt. */
export const VERLAUF_SCHRITT = 150

/**
 * Der gezeichnete Ausschnitt des Verlaufs: die jüngsten `gezeigt` Einträge.
 *
 * Eine Gruppe mit „nie löschen" sammelt über ein Jahr Tausende Nachrichten.
 * Nachgemessen mit 3000 Nachrichten: 12 307 DOM-Knoten, und jede Änderung
 * zeichnete alle (Audit 11/2026, TEC-10). Gelesen wird ein Chat von unten;
 * Älteres lädt die Ansicht auf Wunsch schrittweise nach. `verborgen` nennt,
 * wie viele noch davor liegen — für die Beschriftung des Knopfs.
 */
export function verlaufFenster<T>(eintraege: readonly T[], gezeigt: number): { sichtbar: readonly T[]; verborgen: number } {
  const ab = Math.max(0, eintraege.length - Math.max(0, Math.floor(gezeigt)))
  return { sichtbar: ab === 0 ? eintraege : eintraege.slice(ab), verborgen: ab }
}
