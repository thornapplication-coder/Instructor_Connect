import { musterFehlt, gruppenPflicht } from './aircraftScope'
import { fingerabdruckPruefen } from './docHash'
import { lokalerTag } from './datum'
import { fehlendePflichtfelder } from './migrateState'
import { docCheckBereinigt } from './modules/doccheck/access'
import type { AppState, GradingRecord } from './types'

/**
 * Selbsttest im täglichen Betrieb: Funktioniert die App auf DIESEM Gerät,
 * und ist der Datenbestand in sich stimmig?
 *
 * Die Tests in `npm test` prüfen den Code — nicht das iPad im Simulator,
 * dessen Browser die Ablage räumen darf, dessen Uhr falsch geht oder dessen
 * Offline-Cache nach einem Update unvollständig ist. Genau das sieht der
 * Nutzer erst, wenn es zu spät ist: ein Formular mit falscher
 * Unterschriftszeit, eine weiße Seite ohne Netz, verlorene Einträge.
 *
 * Hier stehen nur die REGELN (Ebene 1): Was gilt als in Ordnung, was als
 * Hinweis, was als Fehler. Die Messungen am Gerät stehen in
 * `selbsttestGeraet.ts` (Ebene 2), die DocCheck-Probe im Modul
 * (`modules/doccheck/selbsttest.ts`), die Anzeige in `pages/Selbsttest.tsx`.
 */

/**
 * `offen` heißt: nicht prüfbar (ohne Netz, API fehlt, nicht anwendbar) —
 * NIE grün. Ein Selbsttest, der nicht Prüfbares als bestanden meldet,
 * verspricht mehr, als er weiß.
 */
export type Stufe = 'ok' | 'hinweis' | 'fehler' | 'offen'
export type Gruppe = 'geraet' | 'daten' | 'doccheck'

export interface Ergebnis {
  /** Schlüssel des Prüfpunkts — zugleich i18n-Schlüssel `selbsttest.punkt.<id>` */
  id: string
  gruppe: Gruppe
  stufe: Stufe
  /** Welcher Satz die Lage beschreibt, wenn eine Stufe mehrere Gründe hat;
   *  sonst die Stufe selbst (`textSchluessel`) */
  variante?: string
  /** Die EINE Zahl des Satzes (`{{count}}` mit `_one`/`_other`) — zwei Zahlen
   *  in einem Satz lässt die Textwache nicht zu (i18n.test.ts) */
  zahl?: number
  /** Weitere Werte für den Satz (keine Zählwörter) */
  werte?: Record<string, string | number>
  /** Betroffene Datensätze (Formular- bzw. Nutzer-IDs) — für Verweise */
  betroffen?: string[]
}

/** i18n-Schlüssel des Satzes zu einem Ergebnis. */
export function textSchluessel(e: Ergebnis): string {
  return `selbsttest.punkt.${e.id}.${e.variante ?? e.stufe}`
}

/** Werte für den Satz zu einem Ergebnis. */
export function textWerte(e: Ergebnis): Record<string, string | number> {
  return { ...e.werte, ...(e.zahl !== undefined ? { count: e.zahl } : {}) }
}

const RANG: Record<Stufe, number> = { offen: 0, ok: 1, hinweis: 2, fehler: 3 }

/** Schlechteste Stufe; `offen` zählt nur, wenn nichts anderes geprüft wurde. */
export function gesamtStufe(ergebnisse: readonly Ergebnis[]): Stufe {
  let s: Stufe = 'offen'
  for (const e of ergebnisse) if (RANG[e.stufe] > RANG[s]) s = e.stufe
  return s
}

export function zaehlen(ergebnisse: readonly Ergebnis[]): Record<Stufe, number> {
  const z: Record<Stufe, number> = { ok: 0, hinweis: 0, fehler: 0, offen: 0 }
  for (const e of ergebnisse) z[e.stufe]++
  return z
}

/* ------------------------------ Datenbestand ------------------------------ */

const adresse = (e: string) => e.trim().toLowerCase()

/**
 * Regeln über den gespeicherten Bestand — dieselben Zusagen, die die
 * Schreibwege einzeln durchsetzen (letzter Superadmin, eindeutige Adresse,
 * Musterpflicht, Gruppenpflicht, DocCheck nur für Admin-Rollen). Steht hier
 * ein Fehler, ist ein Weg an einer Regel vorbeigekommen: ein alter Stand,
 * ein Import, ein Fehler im Code. Der Selbsttest findet es, BEVOR es jemand
 * im Betrieb merkt.
 */
export function datenPruefen(st: AppState, jetzt: number): Ergebnis[] {
  const out: Ergebnis[] = []
  const users = st.users ?? []
  const aktiv = users.filter((u) => u.active)

  // Ohne aktiven Superadmin vergibt niemand mehr Rechte — der Zustand, den
  // jeder Schreibweg verbietet (bulkUsers, benutzerRegeln, profiles_guard).
  out.push({ id: 'superadmin', gruppe: 'daten', stufe: aktiv.some((u) => u.role === 'superadmin') ? 'ok' : 'fehler' })

  // Die Adresse ist die einzige Anmeldekennung: zwei Konten, eine Adresse
  // hieße, der zweite meldet sich als der erste an.
  const gesehen = new Map<string, string>()
  const doppelt = new Set<string>()
  for (const u of users) {
    const a = adresse(u.email ?? '')
    if (!a) continue
    const erster = gesehen.get(a)
    if (erster) {
      doppelt.add(erster)
      doppelt.add(u.id)
    } else gesehen.set(a, u.id)
  }
  out.push({ id: 'adressen', gruppe: 'daten', stufe: doppelt.size ? 'fehler' : 'ok', zahl: doppelt.size, ...(doppelt.size ? { betroffen: [...doppelt] } : {}) })

  // Musterpflicht: Ein Konto ohne Muster sieht keine Lesson Plans — es ist
  // für nichts zuständig (aircraftScope.ts).
  const ohneMuster = aktiv.filter((u) => musterFehlt(u)).map((u) => u.id)
  out.push({ id: 'muster', gruppe: 'daten', stufe: ohneMuster.length ? 'hinweis' : 'ok', zahl: ohneMuster.length, ...(ohneMuster.length ? { betroffen: ohneMuster } : {}) })

  // Gruppen: Verweise auf Konten, die es nicht mehr gibt, und Personen mit
  // Chat, aber ohne erreichbare Gruppe (Pflicht beim Anlegen, KERN-07).
  const ids = new Set(users.map((u) => u.id))
  const verwaist = (st.groups ?? []).filter((g) => [...(g.memberIds ?? []), ...(g.adminIds ?? [])].some((id) => !ids.has(id))).map((g) => g.id)
  const ohneGruppe = aktiv
    .filter((u) => gruppenPflicht(st.settings, u) && !(st.groups ?? []).some((g) => (g.memberIds ?? []).includes(u.id)))
    .map((u) => u.id)
  out.push({ id: 'gruppenVerweise', gruppe: 'daten', stufe: verwaist.length ? 'hinweis' : 'ok', zahl: verwaist.length, ...(verwaist.length ? { betroffen: verwaist } : {}) })
  out.push({ id: 'ohneGruppe', gruppe: 'daten', stufe: ohneGruppe.length ? 'hinweis' : 'ok', zahl: ohneGruppe.length, ...(ohneGruppe.length ? { betroffen: ohneGruppe } : {}) })

  // DocCheck nur für Admin-Rollen (Entscheidung vom 04.11.2026) — beim
  // Laden bereinigt `migrateState`; steht hier etwas, kam ein Weg daran vorbei.
  const dcFalsch = users.filter((u) => docCheckBereinigt(u) !== u).map((u) => u.id)
  out.push({ id: 'doccheckRegel', gruppe: 'daten', stufe: dcFalsch.length ? 'fehler' : 'ok', zahl: dcFalsch.length, ...(dcFalsch.length ? { betroffen: dcFalsch } : {}) })

  // Pflichtlisten und -objekte (TEC-07): Fehlt eine, stürzt eine Ansicht ab.
  const fehlt = Object.keys(fehlendePflichtfelder(st))
  out.push({ id: 'struktur', gruppe: 'daten', stufe: fehlt.length ? 'fehler' : 'ok', werte: { felder: fehlt.join(', ') } })

  // Unterschriftszeiten in der Zukunft: Die Uhr des Geräts ging beim
  // Unterschreiben falsch — der Nachweis trägt eine unmögliche Zeit.
  const zukunft = (st.gradingRecords ?? []).filter((r) => zeitenVon(r).some((z) => z > jetzt + ZUKUNFT_SPIELRAUM_MS)).map((r) => r.id)
  out.push({ id: 'zeiten', gruppe: 'daten', stufe: zukunft.length ? 'hinweis' : 'ok', zahl: zukunft.length, ...(zukunft.length ? { betroffen: zukunft } : {}) })

  return out
}

/** Eine Stunde Spielraum: Uhren zweier Geräte gehen nie genau gleich. */
export const ZUKUNFT_SPIELRAUM_MS = 60 * 60_000

function zeitenVon(r: GradingRecord): number[] {
  return [r.createdAt, r.signedAt, r.instructorSignedAt, r.countersignedAt].filter((z): z is number => typeof z === 'number' && Number.isFinite(z))
}

/**
 * Alle Fingerabdrücke nachrechnen (docHash.ts) — die Formularansicht tut
 * es je Dokument, aber nur, wenn jemand es öffnet. Eine Änderung nach der
 * Unterschrift ist ein Fehler; ein Altbestand ohne Abdruck ist nicht
 * prüfbar und wird gezählt, nicht verschwiegen.
 */
export async function fingerabdrueckePruefen(records: readonly GradingRecord[]): Promise<Ergebnis[]> {
  let geprueft = 0
  let ohne = 0
  const geaendert: string[] = []
  for (const r of records) {
    if (r.status !== 'signed') continue
    const e = await fingerabdruckPruefen(r)
    if (e === 'ohne') ohne++
    else {
      geprueft++
      if (e === 'geaendert') geaendert.push(r.id)
    }
  }
  const out: Ergebnis[] = [
    geaendert.length
      ? { id: 'fingerabdruck', gruppe: 'daten', stufe: 'fehler', zahl: geaendert.length, betroffen: geaendert }
      : geprueft
        ? { id: 'fingerabdruck', gruppe: 'daten', stufe: 'ok', zahl: geprueft }
        : { id: 'fingerabdruck', gruppe: 'daten', stufe: 'offen', variante: 'keine' },
  ]
  // Eigene Zeile statt Nebensatz: eine Zahl je Satz.
  if (ohne) out.push({ id: 'altbestand', gruppe: 'daten', stufe: 'offen', zahl: ohne })
  return out
}

/* --------------------------------- Gerät ---------------------------------- */

/** Ablage schreiben und wieder lesen — gemessen in `selbsttestGeraet.ts`. */
export interface SpeicherProbe {
  ok: boolean
  ms: number
}

/** Über dieser Dauer ist die Ablage auffällig langsam (Startzeitgrenze: 3 s, persist.ts). */
export const SPEICHER_LANGSAM_MS = 1500

export function speicherBewerten(p: SpeicherProbe | null): Ergebnis {
  if (!p) return { id: 'speicher', gruppe: 'geraet', stufe: 'offen' }
  if (!p.ok) return { id: 'speicher', gruppe: 'geraet', stufe: 'fehler' }
  // Millisekunden als Wert, nicht als Zahl des Satzes: „4 ms" wird nicht gebeugt.
  return { id: 'speicher', gruppe: 'geraet', stufe: p.ms > SPEICHER_LANGSAM_MS ? 'hinweis' : 'ok', werte: { ms: Math.round(p.ms) } }
}

/**
 * Darf der Browser die Ablage bei Platzmangel räumen? Ohne „dauerhaft"
 * kann Safari nach Wochen ohne Nutzung alles löschen — Notizen, Entwürfe,
 * im Sandbox-Betrieb den ganzen Bestand.
 */
export function dauerhaftBewerten(dauerhaft: boolean | null): Ergebnis {
  if (dauerhaft === null) return { id: 'dauerhaft', gruppe: 'geraet', stufe: 'offen' }
  return { id: 'dauerhaft', gruppe: 'geraet', stufe: dauerhaft ? 'ok' : 'hinweis' }
}

/** Gleiche Schwelle wie der Speicherstreifen (StorageBanner, 85 %). */
export const FUELLSTAND_HINWEIS = 0.85
export const FUELLSTAND_FEHLER = 0.95

export function fuellstandBewerten(info: { usage: number; quota: number } | null): Ergebnis {
  if (!info || !(info.quota > 0)) return { id: 'fuellstand', gruppe: 'geraet', stufe: 'offen' }
  const anteil = info.usage / info.quota
  const stufe: Stufe = anteil > FUELLSTAND_FEHLER ? 'fehler' : anteil > FUELLSTAND_HINWEIS ? 'hinweis' : 'ok'
  return { id: 'fuellstand', gruppe: 'geraet', stufe, werte: { prozent: Math.round(anteil * 100) } }
}

/**
 * Uhr des Geräts gegen die Serverzeit (Kopf `Date` der Antwort). Die
 * Unterschriftszeit eines Formulars kommt vom Gerät — geht dessen Uhr
 * falsch, steht eine falsche Zeit im behördlichen Nachweis.
 */
const STUNDE_MS = 3600_000
const TAG_MS = 24 * STUNDE_MS
export const UHR_HINWEIS_MS = 2 * 60_000
export const UHR_FEHLER_MS = 10 * 60_000

export function uhrBewerten(abweichungMs: number | null): Ergebnis {
  if (abweichungMs === null || !Number.isFinite(abweichungMs)) return { id: 'uhr', gruppe: 'geraet', stufe: 'offen' }
  const a = Math.abs(abweichungMs)
  const stufe: Stufe = a > UHR_FEHLER_MS ? 'fehler' : a > UHR_HINWEIS_MS ? 'hinweis' : 'ok'
  // Vor- und Nachgehen als eigene Sätze: „vor"/„ahead" ist kein Wert, den
  // man in einen Satz einsetzt. Die Einheit wächst mit: „4320 Minuten" las
  // niemand als drei Tage. Sekunden sind Rauschen (Laufzeit der Anfrage,
  // Auflösung des Kopfs).
  if (stufe === 'ok') return { id: 'uhr', gruppe: 'geraet', stufe }
  const [einheit, zahl] = a >= 2 * TAG_MS ? ['Tage', Math.round(a / TAG_MS)] : a >= 2 * STUNDE_MS ? ['Stunden', Math.round(a / STUNDE_MS)] : ['Minuten', Math.round(a / 60_000)]
  return { id: 'uhr', gruppe: 'geraet', stufe, variante: `${abweichungMs > 0 ? 'vor' : 'nach'}${einheit}`, zahl }
}

/**
 * Abweichung der Geräteuhr aus dem `Date`-Kopf einer Antwort. Der Kopf hat
 * Sekundenauflösung und gilt für den Moment des Sendens — verglichen wird
 * deshalb mit der Mitte zwischen Anfrage und Antwort.
 */
export function uhrAbweichung(serverDatum: string | null, gesendet: number, empfangen: number): number | null {
  if (!serverDatum) return null
  const server = Date.parse(serverDatum)
  if (!Number.isFinite(server)) return null
  return (gesendet + empfangen) / 2 - server
}

/** Was der Offline-Start braucht — gemessen in `selbsttestGeraet.ts`. */
export interface OfflineStand {
  /** Kennt der Browser Service Worker überhaupt? */
  unterstuetzt: boolean
  /** Ist ein Worker registriert und aktiv? */
  aktiv: boolean
  /** Steuert er diese Seite? (Beim allerersten Laden noch nicht.) */
  steuert: boolean
  /** Dateien, die der Worker vorab laden soll */
  gesamt: number
  /** davon nicht im Cache */
  fehlend: number
}

export function offlineBewerten(s: OfflineStand | null): Ergebnis {
  if (!s) return { id: 'offline', gruppe: 'geraet', stufe: 'offen' }
  // Ohne Service Worker gibt es keinen Offline-Start — im Simulator ohne
  // Netz ist die App dann schlicht weg.
  if (!s.unterstuetzt) return { id: 'offline', gruppe: 'geraet', stufe: 'fehler', variante: 'nichtUnterstuetzt' }
  // Beim ersten Besuch normal: Er richtet sich gerade ein.
  if (!s.aktiv || !s.steuert) return { id: 'offline', gruppe: 'geraet', stufe: 'hinweis', variante: 'einrichten' }
  if (s.gesamt === 0) return { id: 'offline', gruppe: 'geraet', stufe: 'offen' }
  if (s.fehlend > 0) return { id: 'offline', gruppe: 'geraet', stufe: 'fehler', variante: 'fehlend', zahl: s.fehlend }
  return { id: 'offline', gruppe: 'geraet', stufe: 'ok', zahl: s.gesamt }
}

/**
 * Läuft die veröffentlichte Version? Verglichen wird der Name des
 * Vorab-Caches (inhaltsgehasht, `cacheName` in swQuelle.ts): Er ändert sich
 * genau dann, wenn sich eine ausgelieferte Datei ändert.
 */
export function versionBewerten(v: { aktiv: string | null; server: string | null; wartet: boolean } | null): Ergebnis {
  if (!v || !v.aktiv) return { id: 'version', gruppe: 'geraet', stufe: 'offen', variante: 'unbekannt' }
  const stand = { stand: kurzStand(v.aktiv) }
  if (v.wartet || (v.server && v.server !== v.aktiv)) return { id: 'version', gruppe: 'geraet', stufe: 'hinweis', werte: stand }
  if (!v.server) return { id: 'version', gruppe: 'geraet', stufe: 'offen', variante: 'ohneNetz', werte: stand }
  return { id: 'version', gruppe: 'geraet', stufe: 'ok', werte: stand }
}

/** „ic-3fa2…" → die letzten 8 Zeichen: genug, um zwei Geräte zu vergleichen. */
export function kurzStand(cache: string): string {
  return cache.slice(-8)
}

/** Ohne diese Funktionen läuft die App nicht oder nur halb. */
export const PFLICHT_APIS = ['indexedDB', 'crypto.subtle', 'Worker', 'Intl'] as const
/** Ohne diese läuft sie, aber eingeschränkt (kein Offline-Start, keine Ablage-Schätzung). */
export const WUNSCH_APIS = ['serviceWorker', 'caches', 'storage.estimate'] as const

export function browserBewerten(fehlend: readonly string[]): Ergebnis {
  const pflicht = fehlend.filter((f) => (PFLICHT_APIS as readonly string[]).includes(f))
  const stufe: Stufe = pflicht.length ? 'fehler' : fehlend.length ? 'hinweis' : 'ok'
  return { id: 'browser', gruppe: 'geraet', stufe, werte: { fehlend: fehlend.join(', ') } }
}

/** Ohne Netz ist das kein Fehler — aber die Prüfungen, die es brauchen, sind dann offen. */
export function netzBewerten(online: boolean | null): Ergebnis {
  if (online === null) return { id: 'netz', gruppe: 'geraet', stufe: 'offen' }
  return { id: 'netz', gruppe: 'geraet', stufe: online ? 'ok' : 'hinweis' }
}

/* --------------------------------- Ablauf --------------------------------- */

/**
 * Läuft der Kurz-Check beim Start? Einmal je Kalendertag und Gerät —
 * nicht bei jedem Seitenwechsel, und nicht erst nach 24 Stunden: Wer jeden
 * Morgen um 7 Uhr öffnet, soll jeden Morgen geprüft werden.
 */
export function automatischFaellig(letzterLauf: number | null, jetzt: number): boolean {
  if (letzterLauf === null || !Number.isFinite(letzterLauf) || letzterLauf > jetzt) return true
  return lokalerTag(letzterLauf) !== lokalerTag(jetzt)
}

/**
 * Welche Ergebnisse meldet der Streifen unten? Nur Fehler — ein Hinweis
 * (Ablage nicht dauerhaft, erster Start) gehört auf die Seite, nicht in
 * jeden Arbeitsgang. Den Datenbestand sieht nur, wer ihn prüfen darf.
 */
export function streifenMeldungen(ergebnisse: readonly Ergebnis[], darfDaten: boolean): Ergebnis[] {
  return ergebnisse.filter((e) => e.stufe === 'fehler' && (e.gruppe === 'geraet' || (e.gruppe === 'daten' && darfDaten)))
}

/** Gespeicherter Stand des letzten Laufs je Gerät (Bequemlichkeit, kein Nachweis). */
export interface LetzterLauf {
  zeit: number
  stufe: Stufe
}

export function letzterLaufLesen(roh: string | null): LetzterLauf | null {
  if (!roh) return null
  try {
    const x = JSON.parse(roh) as Partial<LetzterLauf>
    if (typeof x.zeit !== 'number' || !Number.isFinite(x.zeit)) return null
    if (x.stufe !== 'ok' && x.stufe !== 'hinweis' && x.stufe !== 'fehler' && x.stufe !== 'offen') return null
    return { zeit: x.zeit, stufe: x.stufe }
  } catch {
    return null
  }
}

/* --------------------------------- Bericht -------------------------------- */

type Uebersetzen = (schluessel: string, werte?: Record<string, unknown>) => string

/**
 * Bericht als Text — zum Kopieren oder Herunterladen, wenn jemand ein
 * Problem meldet. Keine Inhalte, keine Namen: nur Prüfpunkte, Stufen und
 * Zahlen; betroffene Datensätze als IDs.
 */
export function berichtText(ergebnisse: readonly Ergebnis[], t: Uebersetzen, kopf: { zeit: string; geraet: string; stand: string }): string {
  const zeilen = [t('selbsttest.berichtTitel'), `${t('selbsttest.berichtZeit')}: ${kopf.zeit}`, `${t('selbsttest.berichtGeraet')}: ${kopf.geraet}`, `${t('selbsttest.berichtStand')}: ${kopf.stand}`, '']
  for (const g of ['geraet', 'daten', 'doccheck'] as const) {
    const teil = ergebnisse.filter((e) => e.gruppe === g)
    if (!teil.length) continue
    zeilen.push(`## ${t(`selbsttest.gruppe.${g}`)}`)
    for (const e of teil) {
      zeilen.push(`[${t(`selbsttest.stufe.${e.stufe}`)}] ${t(`selbsttest.punkt.${e.id}.name`)} — ${t(textSchluessel(e), textWerte(e))}`)
      if (e.betroffen?.length) zeilen.push(`    ${e.betroffen.join(', ')}`)
    }
    zeilen.push('')
  }
  return zeilen.join('\n')
}

/**
 * Kopfzeile der Seite: „1 Fehler · 2 Hinweise · 1 Punkt nicht prüfbar" bzw.
 * „Alles in Ordnung" (mit den nicht prüfbaren dahinter — sie werden gezählt,
 * nicht verschwiegen).
 */
export function zusammenfassungText(z: Record<Stufe, number>, t: Uebersetzen): string {
  const teile = (['fehler', 'hinweis', 'offen'] as const).filter((s) => z[s] > 0).map((s) => t(`selbsttest.zusammenfassung.${s}`, { count: z[s] }))
  if (z.fehler + z.hinweis === 0) return [t('selbsttest.zusammenfassung.ok'), ...teile].join(' · ')
  return teile.join(' · ')
}
