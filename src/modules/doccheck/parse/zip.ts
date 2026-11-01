import JSZip from 'jszip'

/**
 * ZIP-Container (DOCX, XLSX) mit Grenzen öffnen und lesen.
 *
 * Eine präparierte Datei von wenigen Kilobyte kann sich beim Entpacken auf
 * Gigabyte aufblähen (Zip-Bombe) und den Tab abstürzen lassen — fremde
 * Findinglisten kommen von Dritten (Sicherheitsprüfung 01.11.2026). Die
 * Größenangaben im ZIP-Verzeichnis lassen sich fälschen; darum zwei
 * Stufen: Beim Öffnen werden Anzahl und angegebene Größen geprüft, beim
 * Lesen zählt die TATSÄCHLICH entpackte Menge, und das Lesen bricht ab,
 * sobald sie die Grenze überschreitet.
 */

export const GRENZEN = {
  eintraege: 10_000,
  /** je Teil (z. B. word/document.xml) */
  jeTeil: 200 * 1024 * 1024,
  /** alle gelesenen Teile einer Datei zusammen */
  gesamt: 1024 * 1024 * 1024,
}

const verbraucht = new WeakMap<JSZip, number>()

interface Eintrag {
  _data?: { uncompressedSize?: number }
}

/** Der Datenstrom von jszip (in den Typen nicht veröffentlicht, aber Teil der API). */
interface Strom {
  on(e: 'data', f: (stueck: Uint8Array) => void): Strom
  on(e: 'error', f: (e: Error) => void): Strom
  on(e: 'end', f: () => void): Strom
  pause(): Strom
  resume(): Strom
}

export async function zipOeffnen(daten: Uint8Array | ArrayBuffer, g = GRENZEN): Promise<JSZip> {
  const zip = await JSZip.loadAsync(daten)
  const dateien = Object.values(zip.files).filter((f) => !f.dir)
  if (dateien.length > g.eintraege) throw new Error('DC-ZIP-GROSS')
  let summe = 0
  for (const f of dateien) {
    const groesse = (f as unknown as Eintrag)._data?.uncompressedSize ?? 0
    if (groesse > g.jeTeil) throw new Error('DC-ZIP-GROSS')
    summe += groesse
  }
  if (summe > g.gesamt) throw new Error('DC-ZIP-GROSS')
  verbraucht.set(zip, 0)
  return zip
}

/** Einen Teil als Text lesen — mit Abbruch, sobald die entpackte Menge eine Grenze überschreitet. */
export function teilLesen(zip: JSZip, pfad: string, g = GRENZEN): Promise<string | undefined> {
  const f = zip.file(pfad)
  if (!f) return Promise.resolve(undefined)
  return new Promise((ok, fehler) => {
    const decoder = new TextDecoder('utf-8')
    let text = ''
    let menge = 0
    let fertig = false
    const strom = (f as unknown as { internalStream(t: 'uint8array'): Strom }).internalStream('uint8array')
    strom
      .on('data', (stueck: Uint8Array) => {
        if (fertig) return
        menge += stueck.length
        const gesamt = (verbraucht.get(zip) ?? 0) + stueck.length
        verbraucht.set(zip, gesamt)
        if (menge > g.jeTeil || gesamt > g.gesamt) {
          fertig = true
          strom.pause()
          fehler(new Error('DC-ZIP-GROSS'))
          return
        }
        text += decoder.decode(stueck, { stream: true })
      })
      // Ein Promise wird nur einmal erfüllt: Nach dem Abbruch ist ein späteres „end" wirkungslos.
      .on('error', fehler)
      .on('end', () => ok(text + decoder.decode()))
      .resume()
  })
}
