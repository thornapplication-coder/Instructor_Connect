import { describe, expect, it, vi } from 'vitest'
import type { Anfrage, Antwort } from './doccheck.worker'
import { Verbindung, type WorkerLike } from './verbindung'

function fakeWorker() {
  const gesendet: { a: Anfrage; transfer?: Transferable[] }[] = []
  const w: WorkerLike & { antworten(a: Antwort): void } = {
    onmessage: null,
    postMessage: (a, transfer) => gesendet.push({ a, transfer }),
    terminate: vi.fn(),
    antworten(a) {
      this.onmessage?.({ data: a } as MessageEvent<Antwort>)
    },
  }
  return { w, gesendet }
}

describe('Verbindung zum Worker', () => {
  it('startet erst beim ersten Bedarf und schickt zuerst init mit der Basis', () => {
    const { w, gesendet } = fakeWorker()
    const erzeugen = vi.fn(() => w)
    const v = new Verbindung(erzeugen, 'B/')
    v.abbrechen('x')
    expect(erzeugen).not.toHaveBeenCalled()
    void v.suchen('q')
    void v.suchen('r')
    expect(erzeugen).toHaveBeenCalledTimes(1)
    expect(gesendet[0].a).toEqual({ typ: 'init', basis: 'B/' })
  })

  it('lesen: Kopie übertragen, Fortschritt melden, Ergebnis liefern', async () => {
    const { w, gesendet } = fakeWorker()
    const v = new Verbindung(() => w, '')
    const original = new Uint8Array([1, 2, 3])
    const fort = vi.fn()
    const p = v.lesen({ id: 'd', name: 'x', daten: original }, fort)
    const lesen = gesendet[1]
    expect(lesen.transfer?.[0]).not.toBe(original.buffer)
    w.antworten({ typ: 'fortschritt', id: 'd', seite: 1, gesamt: 2 })
    w.antworten({ typ: 'fertig', id: 'd', z: { id: 'd' } as never })
    await expect(p).resolves.toEqual({ id: 'd' })
    expect(fort).toHaveBeenCalledWith(1, 2)
    expect(original).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('Fehler als Error mit Code; unbekannte Antworten werden ignoriert', async () => {
    const { w } = fakeWorker()
    const v = new Verbindung(() => w, '')
    const p = v.lesen({ id: 'd', name: 'x', daten: new Uint8Array() })
    w.antworten({ typ: 'fehler', id: 'd', code: 'DC-FORMAT' })
    await expect(p).rejects.toThrow('DC-FORMAT')
    w.antworten({ typ: 'fehler', id: 'weg', code: 'DC-X' })
    w.antworten({ typ: 'fortschritt', id: 'weg', seite: 1, gesamt: 1 })
    w.antworten({ typ: 'treffer', nr: 999, treffer: [] })
  })

  it('suchen und seitenText über Nummern zugeordnet', async () => {
    const { w, gesendet } = fakeWorker()
    const v = new Verbindung(() => w, '')
    const s = v.suchen('BATT')
    const t = v.seitenText('d', 2)
    const nrS = (gesendet[1].a as { nr: number }).nr
    const nrT = (gesendet[2].a as { nr: number }).nr
    w.antworten({ typ: 'seite', nr: nrT, text: 'Seite 2' })
    w.antworten({ typ: 'treffer', nr: nrS, treffer: [{ docId: 'd' } as never] })
    await expect(s).resolves.toEqual([{ docId: 'd' }])
    await expect(t).resolves.toBe('Seite 2')
    const n = v.nachpruefen([])
    w.antworten({ typ: 'nachgeprueft', nr: (gesendet.at(-1)!.a as { nr: number }).nr, ergebnisse: [{ ref: '7' } as never] })
    await expect(n).resolves.toEqual([{ ref: '7' }])
    const pk = v.paketPruefen([])
    w.antworten({ typ: 'paket', nr: (gesendet.at(-1)!.a as { nr: number }).nr, ergebnis: { befunde: [] } as never })
    await expect(pk).resolves.toEqual({ befunde: [] })
  })

  it('OCR-Ergebnis an die Hörer; titel/entfernen werden gesendet', () => {
    const { w, gesendet } = fakeWorker()
    const v = new Verbindung(() => w, '')
    const h = vi.fn()
    const weg = v.beiOcr(h)
    v.ocrEinspielen('d', [{ n: 1, text: 't' }])
    w.antworten({ typ: 'fertig', id: 'd', z: { id: 'd' } as never })
    expect(h).toHaveBeenCalledWith({ id: 'd' })
    weg()
    v.titel('d', 'T')
    v.entfernen('d')
    v.paaren('d', new Uint8Array([1]))
    expect(gesendet[gesendet.length - 1].transfer).toHaveLength(1)
    v.referenzen([])
    expect(gesendet.slice(-4).map((g) => g.a.typ)).toEqual(['titel', 'entfernen', 'paaren', 'referenzen'])
  })

  it('pruefenSetzen startet keinen Worker; läuft einer, geht der Stand hin und die Antworten an die Hörer (DC-12)', () => {
    const { w, gesendet } = fakeWorker()
    const erzeugen = vi.fn(() => w)
    const v = new Verbindung(erzeugen, '')
    v.pruefenSetzen({ formal: false, word: true, rechnen: true })
    expect(erzeugen).not.toHaveBeenCalled()
    void v.suchen('q')
    v.pruefenSetzen({ formal: false, word: true, rechnen: true })
    expect(gesendet.at(-1)!.a).toEqual({ typ: 'pruefenSetzen', schalter: { formal: false, word: true, rechnen: true } })
    const h = vi.fn()
    v.beiOcr(h)
    w.antworten({ typ: 'fertig', id: 'd', z: { id: 'd' } as never })
    expect(h).toHaveBeenCalledWith({ id: 'd' })
  })

  it('beenden: Worker weg, offene Zusagen gelöst statt hängend', async () => {
    const { w } = fakeWorker()
    const v = new Verbindung(() => w, '')
    const l = v.lesen({ id: 'd', name: 'x', daten: new Uint8Array() })
    const s = v.suchen('q')
    v.beenden()
    expect(w.terminate).toHaveBeenCalled()
    await expect(l).rejects.toThrow('DC-ABORTED')
    await expect(s).resolves.toBeNull()
    v.beenden()
  })
})
