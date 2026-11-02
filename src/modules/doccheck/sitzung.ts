import { useSyncExternalStore } from 'react'
import { registriereOffeneArbeit } from '../../editGuard'
import { hinweiseVergessen, sitzungsAblage } from './hinweis'
import { duplikatPruefen, type Duplikat, type Vergleichsdokument } from './parse/duplikat'
import type { Zusammenfassung } from './kern'
import type { ListenArt, ReferenzListe } from './referenz/liste'
import type { ReCheckSitzung } from './recheck/ablauf'
import { revisionAusDateiname } from './parse/meta'
import { gruppenVorschlagen, varianteAusKuerzel, vorbelegen, type PaketAngaben } from './paket/struktur'
import type { Mitglied, PaketErgebnis } from './paket/pruefen'

/**
 * Prüf- und Sitzungsdokumente der laufenden Sitzung (Spez. 4.1, 5.4).
 *
 * Absichtlich NICHT im Anwendungszustand von Instructor Connect: Der wird in
 * IndexedDB gespeichert, und Prüf- wie Sitzungsdokumente dürfen nie
 * gespeichert werden. Sie leben hier, im Speicher des Tabs — beim Verlassen
 * der Kachel bleiben sie, beim Abmelden werden sie verworfen.
 */

export type Rolle = 'review' | 'master'
export type Feld = 'typ' | 'titel' | 'nummer' | 'revision' | 'datum' | 'rang'

export interface SitzungsDok {
  id: string
  rolle: Rolle
  name: string
  groesse: number
  status: 'liest' | 'fertig' | 'fehler'
  fortschritt?: { seite: number; gesamt: number }
  fehler?: string
  z?: Zusammenfassung
  felder: Record<Feld, string>
  /** Felder mit automatisch erkanntem, noch nicht bestätigtem Wert */
  erkannt: Feld[]
  /** Stellung im Dokumentpaket (Nachtrag N1) — nur Prüfdokumente */
  paket?: PaketAngaben
  /** „Abbrechen" geklickt, Antwort des Workers steht aus (DC-01) */
  abbruch?: boolean
}

/** Eine hochgeladene Referenzliste (Soll) samt Rohtabelle — die Art lässt
 *  sich nachträglich umstellen, ohne die Datei erneut zu lesen. */
export interface SitzungsReferenz {
  liste: ReferenzListe | null
  datei: string
  blatt?: string
  zeilen: string[][]
  /** Vom Nutzer gewählte Art — bleibt, auch solange noch keine Liste entsteht (DC-13) */
  art?: ListenArt
  /** Vom Nutzer zugeordnete Spalten (Rolle → Spaltenindex), wenn die Köpfe nicht erkannt wurden */
  spalten?: Record<string, number>
}

export interface Zustand {
  nutzer: string | null
  docs: SitzungsDok[]
  referenzen?: SitzungsReferenz[]
  /** Re-Check einer Fremdliste (Nachtrag N3) — wie alles hier nur im Speicher */
  recheck?: ReCheckSitzung
  /** Prüfen als Paket statt als Einzeldokumente (Nachtrag Kap. 18) */
  paketModus?: boolean
  /** Ergebnis der letzten Paketprüfung samt Stand, gegen den sie lief */
  paketErgebnis?: { ergebnis: PaketErgebnis; stand: string }
}

export const LEER: Zustand = { nutzer: null, docs: [] }
const LEERE_FELDER: Record<Feld, string> = { typ: '', titel: '', nummer: '', revision: '', datum: '', rang: '' }

/* ------------------------- reine Übergänge ------------------------- */

export function neu(z: Zustand, d: { id: string; rolle: Rolle; name: string; groesse: number }): Zustand {
  return { ...z, docs: [...z.docs, { ...d, status: 'liest', felder: { ...LEERE_FELDER, rang: d.rolle === 'master' ? '9' : '' }, erkannt: [] }] }
}

const aendern = (z: Zustand, id: string, f: (d: SitzungsDok) => SitzungsDok): Zustand => ({ ...z, docs: z.docs.map((d) => (d.id === id ? f(d) : d)) })

export function fortschritt(z: Zustand, id: string, seite: number, gesamt: number): Zustand {
  return aendern(z, id, (d) => ({ ...d, fortschritt: { seite, gesamt } }))
}

/**
 * Fertig gelesen: Erkannte Metadaten füllen nur LEERE Felder — was der Nutzer
 * schon eingetragen hat, überschreibt keine Erkennung. Jedes gefüllte Feld
 * ist „erkannt", bis jemand es anfasst (Spez. 6.10: bestätigen).
 */
export function fertig(z: Zustand, id: string, zf: Zusammenfassung): Zustand {
  return paketVorbelegen(aendern(z, id, (d) => {
    const felder = { ...d.felder }
    const erkannt: Feld[] = [...d.erkannt]
    const vorschlag: Partial<Record<Feld, string | undefined>> = { typ: zf.meta.typ, titel: zf.meta.titel, nummer: zf.meta.nummer, revision: zf.meta.revision ?? revisionAusDateiname(d.name), datum: zf.meta.datum }
    for (const [k, v] of Object.entries(vorschlag) as [Feld, string | undefined][]) {
      if (v && !felder[k]) {
        felder[k] = v
        if (!erkannt.includes(k)) erkannt.push(k)
      }
    }
    return { ...d, status: 'fertig', fortschritt: undefined, z: zf, felder, erkannt }
  }))
}

/** OCR liefert eine neue Zusammenfassung — Felder bleiben, wie sie sind. */
export function aktualisiert(z: Zustand, zf: Zusammenfassung): Zustand {
  return aendern(z, zf.id, (d) => ({ ...d, z: zf }))
}

/**
 * „Abbrechen" angefordert (DC-01). Gemerkt in der Sitzung, nicht nur im
 * Knopf: War der Worker schon fertig, als die Nachricht ankam, kommt
 * statt des Abbruchs das Ergebnis — und das darf dann nicht aufgenommen
 * werden (`hochladen`).
 */
export function abbruchAnfordern(z: Zustand, id: string): Zustand {
  return aendern(z, id, (d) => (d.status === 'liest' ? { ...d, abbruch: true } : d))
}

export function fehler(z: Zustand, id: string, code: string): Zustand {
  return aendern(z, id, (d) => ({ ...d, status: 'fehler', fehler: code, fortschritt: undefined }))
}

export function feldSetzen(z: Zustand, id: string, feld: Feld, wert: string): Zustand {
  return aendern(z, id, (d) => ({ ...d, felder: { ...d.felder, [feld]: wert }, erkannt: d.erkannt.filter((k) => k !== feld) }))
}

/** „Erkannt" bestätigen, ohne den Wert zu ändern. */
export function bestaetigen(z: Zustand, id: string): Zustand {
  return aendern(z, id, (d) => ({ ...d, erkannt: [] }))
}

export function entfernen(z: Zustand, id: string): Zustand {
  return { ...z, docs: z.docs.filter((d) => d.id !== id) }
}

/**
 * Warum keine regelbasierten Befunde da sind. Sind alle Schalter aus, legt
 * der Kern keine Prüfung an — und Findings sagte „Prüfdokument hochladen",
 * obwohl eines geladen war (Audit 11/2026, DC-12). `null`: Es gibt geprüfte
 * Dokumente, eine leere Liste liegt dann am Filter.
 */
export function leerGrund(docs: SitzungsDok[]): 'keineDokumente' | 'abgeschaltet' | null {
  const pruef = docs.filter((d) => d.rolle === 'review' && d.status === 'fertig' && d.z)
  if (pruef.some((d) => d.z!.pruefung)) return null
  return pruef.length ? 'abgeschaltet' : 'keineDokumente'
}

/**
 * Befunde einer Dokumentkarte. Im Paketmodus liegen Paketbefunde beim
 * tieferen Dokument (Hierarchieregel, `dokId`) und stehen in Findings dort
 * — die Karte zählte nur die eigene Prüfung und zeigte grün „ohne Befund",
 * während Widersprüche offen waren (Audit 11/2026, DC-14). Ohne Paketmodus
 * zählen sie nicht: Dann gehören sie zu keiner Prüfung (wie in Findings).
 * `hoch` zählt beide, `paketHoch` nur die Paketbefunde.
 */
export function befundZahl(d: SitzungsDok, paket: PaketErgebnis | undefined, paketAktiv: boolean): { eigen: number; paket: number; hoch: number; paketHoch: number } {
  const eigen = d.z?.pruefung?.befunde ?? []
  const imPaket = paketAktiv && paket ? paket.befunde.filter((b) => b.dokId === d.id) : []
  const paketHoch = imPaket.filter((b) => b.prioritaet === 'High').length
  return { eigen: eigen.length, paket: imPaket.length, hoch: eigen.filter((b) => b.prioritaet === 'High').length + paketHoch, paketHoch }
}

/** Was fehlt noch? Revision ist Pflicht (Spez. 6.1, 11.2); Master brauchen einen Titel. */
export function offenePflichtfelder(d: SitzungsDok): Feld[] {
  const out: Feld[] = []
  if (!d.felder.revision.trim()) out.push('revision')
  if (d.rolle === 'master' && !d.felder.titel.trim()) out.push('titel')
  return out
}

/**
 * Duplikat neu bewerten — mit den AKTUELLEN Feldern. Der Worker prüft beim
 * Lesen mit den erkannten Werten; korrigiert der Nutzer die Revision, ändert
 * sich das Ergebnis.
 */
export function duplikatFuer(d: SitzungsDok, z: Zustand, bibliothek: Vergleichsdokument[]): Duplikat {
  if (!d.z) return null
  const andere: Vergleichsdokument[] = [
    ...bibliothek,
    ...z.docs.filter((x) => x.id !== d.id && x.z).map((x) => ({ id: x.id, bezeichnung: x.felder.titel || x.name, herkunft: (x.rolle === 'review' ? 'review' : 'session') as Vergleichsdokument['herkunft'], sha256: x.z!.sha256, nummer: x.felder.nummer, revision: x.felder.revision })),
  ]
  return duplikatPruefen({ id: d.id, sha256: d.z.sha256, nummer: d.felder.nummer, revision: d.felder.revision }, andere)
}

export function referenzenSetzen(z: Zustand, r: SitzungsReferenz[]): Zustand {
  return { ...z, referenzen: r }
}

/** Die gültigen Listen (erkannt oder zugeordnet) für die Prüfung. */
export function aktiveListen(z: Zustand): ReferenzListe[] {
  return (z.referenzen ?? []).map((r) => r.liste).filter((l): l is ReferenzListe => l !== null)
}

/* ------------------------- Dokumentpaket (N1) ------------------------- */

/**
 * Paketangaben vorbelegen: jedes fertige Prüfdokument ohne Angaben bekommt
 * sie aus Dateiname und Titel; Geschwistergruppen werden vorgeschlagen, wo
 * noch keine bestätigte Angabe steht. Was der Nutzer gesetzt hat, bleibt.
 */
export function paketVorbelegen(z: Zustand): Zustand {
  let geaendert = false
  let docs = z.docs.map((d) => {
    if (d.rolle !== 'review' || d.status !== 'fertig' || d.paket) return d
    geaendert = true
    return { ...d, paket: vorbelegen(d.name, d.felder.titel) }
  })
  const vorschlag = gruppenVorschlagen(docs.filter((d) => d.paket).map((d) => ({ id: d.id, a: d.paket! })))
  docs = docs.map((d) => {
    const g = vorschlag[d.id]
    if (!g || !d.paket?.erkannt || d.paket.gruppe) return d
    geaendert = true
    return { ...d, paket: { ...d.paket, gruppe: g, variante: d.paket.variante || varianteAusKuerzel(d.paket.kuerzel) } }
  })
  return geaendert ? { ...z, docs } : z
}

/** Eine Angabe von Hand ändern — damit gilt sie als bestätigt. */
export function paketSetzen(z: Zustand, id: string, patch: Partial<Omit<PaketAngaben, 'erkannt'>>): Zustand {
  return aendern(z, id, (d) => (d.paket ? { ...d, paket: { ...d.paket, ...patch, erkannt: false } } : d))
}

/** Alle Vorbelegungen bestätigen. */
export function paketBestaetigen(z: Zustand): Zustand {
  return { ...z, docs: z.docs.map((d) => (d.paket?.erkannt ? { ...d, paket: { ...d.paket, erkannt: false } } : d)) }
}

/** Struktur für die Paketprüfung im Worker — Revision und Datum aus den bestätigten Feldern. */
export function paketStruktur(z: Zustand): Omit<Mitglied, 'pages'>[] {
  return z.docs
    .filter((d) => d.rolle === 'review' && d.status === 'fertig' && d.paket)
    .map((d) => ({ id: d.id, dokName: d.felder.titel || d.name, kuerzel: d.paket!.kuerzel, ebene: d.paket!.ebene, gruppe: d.paket!.gruppe, variante: d.paket!.variante, revision: d.felder.revision, datum: d.felder.datum }))
}

/* --------------------------- Speicher ---------------------------- */

let zustand: Zustand = LEER
const hoerer = new Set<() => void>()
/** Originaldateien für den Viewer — getrennt, damit der Zustand klein bleibt. */
const dateien = new Map<string, Uint8Array>()

export function setzen(f: (z: Zustand) => Zustand): void {
  const neuer = f(zustand)
  if (neuer === zustand) return
  zustand = neuer
  hoerer.forEach((h) => h())
}

export function lesenZustand(): Zustand {
  return zustand
}

export function abonnieren(h: () => void): () => void {
  hoerer.add(h)
  return () => hoerer.delete(h)
}

export function useSitzung(): Zustand {
  return useSyncExternalStore(abonnieren, lesenZustand)
}

export function dateiAblegen(id: string, daten: Uint8Array): void {
  dateien.set(id, daten)
}

export function datei(id: string): Uint8Array | undefined {
  return dateien.get(id)
}

export function dateiEntfernen(id: string): void {
  dateien.delete(id)
}

/**
 * Gehört die Sitzung noch dem angemeldeten Nutzer? Sonst alles verwerfen —
 * auch der Sandbox-Wechsel „Ansicht als" darf keine fremden Dokumente
 * sehen. Liefert, ob verworfen wurde; dann beendet der Aufrufer den Worker.
 *
 * „Verworfen" heißt jede offene Arbeit, nicht nur Dokumente: Referenzlisten
 * liegen auch im Kern des Workers. Zählten nur Dokumente, blieb das Glossar
 * des Vorgängers dort stehen, unsichtbar — und der nächste Nutzer bekam
 * Befunde „… glossary glossar-alex.csv" aus einer Liste, die er nie geladen
 * hatte (Audit 11/2026, Nachtrag SEC#1).
 */
export function fuerNutzer(nutzer: string | null): boolean {
  if (zustand.nutzer === nutzer) return false
  const hatte = offeneArbeit(zustand)
  dateien.clear()
  setzen(() => ({ nutzer, docs: [] }))
  return hatte
}

/**
 * Liegt in der Sitzung etwas, das ein Neuladen verlöre?
 *
 * Alles hier lebt nur im Speicher des Tabs: eingelesene Dokumente (samt
 * OCR-Läufen von Minuten), Referenzlisten und ein Re-Check mit Zuordnung
 * und Bestätigungen — ob schon zurückgeschrieben oder nicht, weiß die
 * Sitzung nicht, also zählt er, solange er da ist.
 */
export function offeneArbeit(z: Zustand): boolean {
  return z.docs.length > 0 || (z.referenzen?.length ?? 0) > 0 || z.recheck !== undefined
}

/*
 * Beim Laden des Moduls bei der Bearbeitungs-Wache anmelden (Audit 11/2026,
 * TEC-02): Vorher lud das automatische Update einen DocCheck-Tab mitten in
 * der Prüfung neu, und alle Sitzungsdokumente waren weg.
 *
 * Bewusst in Kauf genommen: Übernimmt ein ANDERER Tab die neue Version,
 * lädt dieser Tab nicht nach (UpdateBanner, controllerchange). Der Streifen
 * bleibt stehen, „Jetzt aktualisieren" lädt neu, und sobald die Sitzung
 * leer ist, geschieht es von selbst.
 */
registriereOffeneArbeit(() => offeneArbeit(zustand))

// Abmelden verwirft die Sitzung — das Ereignis kommt aus dem Store von
// Instructor Connect, der von DocCheck sonst nichts weiß. Mit ihr endet auch
// die Bestätigung des Hinweisdialogs: Der nächste Nutzer am selben Gerät sieht
// ihn wieder (Audit 11/2026, SEC-05).
if (typeof window !== 'undefined')
  window.addEventListener('ic-abmelden', () => {
    fuerNutzer(null)
    hinweiseVergessen(sitzungsAblage())
  })
