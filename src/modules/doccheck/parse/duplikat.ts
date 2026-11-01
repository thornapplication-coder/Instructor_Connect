/**
 * Fingerabdruck und Duplikat-Warnung (Spez. 6.10).
 *
 * Verglichen wird mit ALLEN Bibliotheksdokumenten — auch archivierten —
 * und den Sitzungsdokumenten. Gleicher Hash heißt: dieselbe Datei. Gleiche
 * Nummer und Revision mit anderem Hash heißt: Jemand hat das Dokument
 * verändert, ohne die Revision hochzuzählen — genau das, was eine Behörde
 * findet.
 */

export async function sha256Hex(daten: ArrayBuffer | Uint8Array): Promise<string> {
  const puffer = daten instanceof Uint8Array ? daten : new Uint8Array(daten)
  const h = await globalThis.crypto.subtle.digest('SHA-256', puffer as BufferSource)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface Vergleichsdokument {
  id: string
  bezeichnung: string
  herkunft: 'library' | 'session' | 'review'
  sha256?: string
  nummer?: string
  revision?: string
}

export type Duplikat = { art: 'identisch' | 'gleicheRevision'; mit: Vergleichsdokument } | null

const norm = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

export function duplikatPruefen(
  neu: { id?: string; sha256: string; nummer?: string; revision?: string },
  bestand: Vergleichsdokument[],
): Duplikat {
  const andere = bestand.filter((d) => d.id !== neu.id)
  const gleich = andere.find((d) => d.sha256 && d.sha256 === neu.sha256)
  if (gleich) return { art: 'identisch', mit: gleich }
  if (neu.nummer && neu.revision) {
    const rev = andere.find((d) => d.nummer && d.revision && norm(d.nummer) === norm(neu.nummer) && norm(d.revision) === norm(neu.revision))
    if (rev) return { art: 'gleicheRevision', mit: rev }
  }
  return null
}
