import { useSyncExternalStore } from 'react'
import { duplikatPruefen, type Duplikat, type Vergleichsdokument } from './parse/duplikat'
import type { Zusammenfassung } from './kern'

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
}

export interface Zustand {
  nutzer: string | null
  docs: SitzungsDok[]
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
  return aendern(z, id, (d) => {
    const felder = { ...d.felder }
    const erkannt: Feld[] = [...d.erkannt]
    const vorschlag: Partial<Record<Feld, string | undefined>> = { typ: zf.meta.typ, titel: zf.meta.titel, nummer: zf.meta.nummer, revision: zf.meta.revision, datum: zf.meta.datum }
    for (const [k, v] of Object.entries(vorschlag) as [Feld, string | undefined][]) {
      if (v && !felder[k]) {
        felder[k] = v
        if (!erkannt.includes(k)) erkannt.push(k)
      }
    }
    return { ...d, status: 'fertig', fortschritt: undefined, z: zf, felder, erkannt }
  })
}

/** OCR liefert eine neue Zusammenfassung — Felder bleiben, wie sie sind. */
export function aktualisiert(z: Zustand, zf: Zusammenfassung): Zustand {
  return aendern(z, zf.id, (d) => ({ ...d, z: zf }))
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
 * sehen. Liefert, ob verworfen wurde.
 */
export function fuerNutzer(nutzer: string | null): boolean {
  if (zustand.nutzer === nutzer) return false
  const hatte = zustand.docs.length > 0
  dateien.clear()
  setzen(() => ({ nutzer, docs: [] }))
  return hatte
}

// Abmelden verwirft die Sitzung — das Ereignis kommt aus dem Store von
// Instructor Connect, der von DocCheck sonst nichts weiß.
if (typeof window !== 'undefined') window.addEventListener('ic-abmelden', () => fuerNutzer(null))
