import { xlsxTabellen } from '../parse/xlsx'
import { aktiveListen, aktualisiert, lesenZustand, referenzenSetzen, setzen, type SitzungsReferenz } from '../sitzung'
import type { Verbindung } from '../verbindung'
import { csvLesen, listeAusTabelle, mdTabelle, type ListenArt } from './liste'

/**
 * Referenzlisten laden: Excel (jedes Blatt eine Liste), CSV, Markdown.
 * Liest im Hauptfenster — die Dateien sind klein, und der Worker bekommt nur
 * die fertigen Einträge.
 */

export async function referenzDateiLesen(name: string, daten: Uint8Array): Promise<SitzungsReferenz[]> {
  if (/\.xlsx$/i.test(name)) {
    const blaetter = await xlsxTabellen(daten)
    return blaetter.filter((b) => b.zeilen.length).map((b) => ({ datei: name, blatt: b.name, zeilen: b.zeilen, liste: listeAusTabelle(name, b.zeilen, undefined, b.name) }))
  }
  const text = new TextDecoder().decode(daten)
  const zeilen = /\.md$/i.test(name) ? mdTabelle(text) : csvLesen(text)
  if (!zeilen.length) return []
  return [{ datei: name, zeilen, liste: listeAusTabelle(name, zeilen) }]
}

/** Art ausdrücklich setzen (Erkennung lag daneben oder fand nichts). */
export function artSetzen(r: SitzungsReferenz, art: ListenArt): SitzungsReferenz {
  return { ...r, liste: listeAusTabelle(r.datei, r.zeilen, art, r.blatt) }
}

/** Aktuelle Listen an den Worker; neu geprüfte Dokumente zurück in die Sitzung. */
export function anwenden(v: Pick<Verbindung, 'referenzen' | 'beiOcr'>): () => void {
  const ab = v.beiOcr((z) => setzen((s) => aktualisiert(s, z)))
  v.referenzen(aktiveListen(lesenZustand()))
  return ab
}

export async function hinzufuegen(dateien: { name: string; arrayBuffer(): Promise<ArrayBuffer> }[], v: Pick<Verbindung, 'referenzen' | 'beiOcr'>): Promise<{ unbekannt: string[] }> {
  const neu: SitzungsReferenz[] = []
  for (const f of dateien) neu.push(...(await referenzDateiLesen(f.name, new Uint8Array(await f.arrayBuffer()))))
  setzen((s) => referenzenSetzen(s, [...(s.referenzen ?? []), ...neu]))
  anwenden(v)
  return { unbekannt: neu.filter((r) => !r.liste).map((r) => (r.blatt ? `${r.datei} / ${r.blatt}` : r.datei)) }
}

export function aendern(index: number, art: ListenArt | null, v: Pick<Verbindung, 'referenzen' | 'beiOcr'>): void {
  setzen((s) => {
    const liste = [...(s.referenzen ?? [])]
    if (art === null) liste.splice(index, 1)
    else liste[index] = artSetzen(liste[index], art)
    return referenzenSetzen(s, liste)
  })
  anwenden(v)
}
