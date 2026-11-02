import { xlsxTabellen } from '../parse/xlsx'
import { aktiveListen, aktualisiert, lesenZustand, referenzenSetzen, setzen, type SitzungsReferenz } from '../sitzung'
import type { Verbindung } from '../verbindung'
import { csvLesen, listeAusTabelle, listeGroessePruefen, mdTabelle, type ListenArt } from './liste'

/**
 * Referenzlisten laden: Excel (jedes Blatt eine Liste), CSV, Markdown.
 * Liest im Hauptfenster — die Dateien sind klein, und der Worker bekommt nur
 * die fertigen Einträge.
 */

export async function referenzDateiLesen(name: string, daten: Uint8Array): Promise<SitzungsReferenz[]> {
  listeGroessePruefen(daten.byteLength)
  if (/\.xlsx$/i.test(name)) {
    const blaetter = await xlsxTabellen(daten)
    return blaetter.filter((b) => b.zeilen.length).map((b) => ({ datei: name, blatt: b.name, zeilen: b.zeilen, liste: listeAusTabelle(name, b.zeilen, undefined, b.name) }))
  }
  const text = new TextDecoder().decode(daten)
  const zeilen = /\.md$/i.test(name) ? mdTabelle(text) : csvLesen(text)
  if (!zeilen.length) return []
  return [{ datei: name, zeilen, liste: listeAusTabelle(name, zeilen) }]
}

/**
 * Art ausdrücklich setzen (Erkennung lag daneben oder fand nichts), auf
 * Wunsch mit eigener Spaltenzuordnung. Die gewählte Art bleibt stehen, auch
 * wenn noch keine Liste entsteht — sonst sprang die Auswahl zurück, und die
 * Spaltenwahl hatte nichts, woran sie hängen konnte (Audit 11/2026, DC-13).
 * Eine neue Art verwirft die alte Zuordnung: Ihre Rollen gibt es dort nicht.
 */
export function artSetzen(r: SitzungsReferenz, art: ListenArt, spalten?: Record<string, number>): SitzungsReferenz {
  const { spalten: _alt, ...rest } = r
  return { ...rest, art, ...(spalten ? { spalten } : {}), liste: listeAusTabelle(r.datei, r.zeilen, art, r.blatt, spalten) }
}

/** Aktuelle Listen an den Worker; neu geprüfte Dokumente zurück in die Sitzung. */
export function anwenden(v: Pick<Verbindung, 'referenzen' | 'beiOcr'>): () => void {
  const ab = v.beiOcr((z) => setzen((s) => aktualisiert(s, z)))
  v.referenzen(aktiveListen(lesenZustand()))
  return ab
}

/**
 * Dateien als Referenzlisten aufnehmen. Eine Datei, die sich nicht lesen
 * lässt (zu groß, kaputt), kommt mit ihrem Fehlercode zurück und hält die
 * übrigen nicht auf — vorher brach die erste die ganze Auswahl ab, ohne
 * Meldung (SEC-01).
 */
export async function hinzufuegen(
  dateien: { name: string; size?: number; arrayBuffer(): Promise<ArrayBuffer> }[],
  v: Pick<Verbindung, 'referenzen' | 'beiOcr'>,
): Promise<{ unbekannt: string[]; fehler: { name: string; code: string }[] }> {
  const neu: SitzungsReferenz[] = []
  const fehler: { name: string; code: string }[] = []
  for (const f of dateien) {
    try {
      // Die Größe steht am File schon VOR dem Einlesen in den Speicher
      if (f.size !== undefined) listeGroessePruefen(f.size)
      neu.push(...(await referenzDateiLesen(f.name, new Uint8Array(await f.arrayBuffer()))))
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      fehler.push({ name: f.name, code: /^DC-[A-Z0-9-]+$/.test(m) ? m : 'DC-PARSE' })
    }
  }
  setzen((s) => referenzenSetzen(s, [...(s.referenzen ?? []), ...neu]))
  anwenden(v)
  return { unbekannt: neu.filter((r) => !r.liste).map((r) => (r.blatt ? `${r.datei} / ${r.blatt}` : r.datei)), fehler }
}

export function aendern(index: number, art: ListenArt | null, v: Pick<Verbindung, 'referenzen' | 'beiOcr'>, spalten?: Record<string, number>): void {
  setzen((s) => {
    const liste = [...(s.referenzen ?? [])]
    if (art === null) liste.splice(index, 1)
    else liste[index] = artSetzen(liste[index], art, spalten)
    return referenzenSetzen(s, liste)
  })
  anwenden(v)
}
