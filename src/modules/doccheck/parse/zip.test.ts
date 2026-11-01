import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { GRENZEN, teilLesen, zipOeffnen } from './zip'

const zip = async (teile: Record<string, string>) => {
  const z = new JSZip()
  for (const [k, v] of Object.entries(teile)) z.file(k, v)
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
const klein = { eintraege: 3, jeTeil: 1000, gesamt: 1500 }

describe('ZIP mit Grenzen (Sicherheitsprüfung: Zip-Bombe)', () => {
  it('normale Datei: Teile lesen, fehlender Teil undefined, UTF-8 über Stückgrenzen hinweg', async () => {
    const z = await zipOeffnen(await zip({ 'a.xml': 'Grüße ' + 'ä'.repeat(70000) }))
    expect(await teilLesen(z, 'a.xml')).toBe('Grüße ' + 'ä'.repeat(70000))
    expect(await teilLesen(z, 'fehlt.xml')).toBeUndefined()
    expect(GRENZEN.jeTeil).toBe(200 * 1024 * 1024)
  })

  it('Zip-Bombe: wenige Kilobyte gepackt, beim Öffnen an der angegebenen Größe erkannt', async () => {
    const bombe = await zip({ 'word/document.xml': 'A'.repeat(5_000_000) })
    expect(bombe.length).toBeLessThan(20_000)
    await expect(zipOeffnen(bombe, { ...GRENZEN, jeTeil: 1_000_000 })).rejects.toThrow('DC-ZIP-GROSS')
  })

  it('zu viele Einträge, zu groß in Summe', async () => {
    await expect(zipOeffnen(await zip({ a: '1', b: '2', c: '3', d: '4' }), klein)).rejects.toThrow('DC-ZIP-GROSS')
    await expect(zipOeffnen(await zip({ a: 'x'.repeat(900), b: 'x'.repeat(900) }), klein)).rejects.toThrow('DC-ZIP-GROSS')
  })

  it('gefälschte Größenangabe: Lesen bricht ab, sobald die TATSÄCHLICHE Menge die Grenze überschreitet', async () => {
    // Geöffnet mit großzügiger Grenze (Angabe unauffällig), gelesen mit enger — wie eine gelogene Angabe
    const z = await zipOeffnen(await zip({ 'a.xml': 'x'.repeat(200_000) }))
    await expect(teilLesen(z, 'a.xml', { ...GRENZEN, jeTeil: 10_000 })).rejects.toThrow('DC-ZIP-GROSS')
  })

  it('Gesamtbudget über mehrere gelesene Teile derselben Datei', async () => {
    const z = await zipOeffnen(await zip({ a: 'x'.repeat(800), b: 'x'.repeat(800) }))
    const g = { eintraege: 10, jeTeil: 1000, gesamt: 1200 }
    expect(await teilLesen(z, 'a', g)).toHaveLength(800)
    await expect(teilLesen(z, 'b', g)).rejects.toThrow('DC-ZIP-GROSS')
  })

  it('beschädigte Daten: Fehler statt Hängen', async () => {
    const d = await zip({ 'a.xml': 'Inhalt '.repeat(5000) })
    // Nur die komprimierten Daten beschädigen (Kopf 30 Byte + Name), das Verzeichnis bleibt heil
    const groesse = new DataView(d.buffer, d.byteOffset).getUint32(18, true)
    const start = 30 + 'a.xml'.length
    const kaputt = d.slice()
    for (let i = start; i < start + groesse; i++) kaputt[i] = 0xff
    const z = await zipOeffnen(kaputt)
    await expect(teilLesen(z, 'a.xml')).rejects.toBeTruthy()
  })
})
