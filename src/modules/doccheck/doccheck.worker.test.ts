import { describe, expect, it, vi } from 'vitest'
import { fehlerCode, verbinden, type Anfrage, type Antwort, type Bereich } from './doccheck.worker'
import { Kern } from './kern'
import type { PdfJs } from './parse/pdf'

function aufbau(kern: Partial<Kern>) {
  const raus: Antwort[] = []
  const bereich: Bereich = { onmessage: null, postMessage: (a) => raus.push(a) }
  const kernFuer = vi.fn(() => kern as Kern)
  verbinden(bereich, kernFuer)
  const senden = async (a: Anfrage) => {
    await bereich.onmessage!({ data: a })
  }
  return { raus, senden, kernFuer }
}

describe('Worker-Nachrichtenschicht', () => {
  it('init übergibt die Basis-Adresse; ohne init entsteht der Kern beim ersten Bedarf', async () => {
    const a = aufbau({ suchen: () => [] })
    await a.senden({ typ: 'init', basis: 'https://x/doccheck/' })
    expect(a.kernFuer).toHaveBeenCalledWith('https://x/doccheck/')
    const b = aufbau({ suchen: () => [] })
    await b.senden({ typ: 'suchen', nr: 1, q: 'x' })
    expect(b.kernFuer).toHaveBeenCalledWith('')
    expect(b.raus).toEqual([{ typ: 'treffer', nr: 1, treffer: [] }])
  })

  it('lesen meldet Fortschritt und Ergebnis', async () => {
    const z = { id: 'd' }
    // Ein gelesenes Regelwerk (N8) zieht die Prüfdokumente nach
    const a = aufbau({ lesen: async (_auf, melde) => (melde?.(1, 2), z as never), nachLesen: () => [{ id: 'p' } as never] })
    await a.senden({ typ: 'lesen', auftrag: { id: 'd', name: 'x.pdf', daten: new Uint8Array() } })
    expect(a.raus).toEqual([{ typ: 'fortschritt', id: 'd', seite: 1, gesamt: 2 }, { typ: 'fertig', id: 'd', z }, { typ: 'fertig', id: 'p', z: { id: 'p' } }])
  })

  it('Lesefehler kommen als Code, nie als Meldungstext', async () => {
    const a = aufbau({ lesen: async () => { throw new Error('geheimer Dokumentinhalt im Stack') } })
    await a.senden({ typ: 'lesen', auftrag: { id: 'd', name: 'x', daten: new Uint8Array() } })
    expect(a.raus).toEqual([{ typ: 'fehler', id: 'd', code: 'DC-PARSE' }])
  })

  it('abbrechen, entfernen, titel, seite und ocr werden durchgereicht', async () => {
    const kern = {
      abbrechen: vi.fn(), entfernen: vi.fn(() => [{ id: 'nach' } as never]), titelSetzen: vi.fn(), seitenText: vi.fn(() => 'T'),
      ocrEinspielen: vi.fn((id: string) => (id === 'd' ? ({ id } as never) : null)),
      paaren: vi.fn(async (id: string) => (id === 'd' ? ({ id, seitenQuelle: 'pdf_pair' } as never) : null)),
      referenzenSetzen: vi.fn(() => [{ id: 'd', ref: true } as never]),
      nachpruefen: vi.fn(() => [{ ref: '1' } as never]),
      paketPruefen: vi.fn(() => ({ befunde: [] }) as never),
    }
    const a = aufbau(kern)
    await a.senden({ typ: 'abbrechen', id: 'd' })
    await a.senden({ typ: 'entfernen', id: 'd' })
    await a.senden({ typ: 'titel', id: 'd', titel: 'T' })
    await a.senden({ typ: 'seite', nr: 3, id: 'd', seite: 1 })
    await a.senden({ typ: 'ocr', id: 'd', seiten: [] })
    await a.senden({ typ: 'ocr', id: 'fehlt', seiten: [] })
    await a.senden({ typ: 'paaren', id: 'd', daten: new Uint8Array() })
    await a.senden({ typ: 'paaren', id: 'fehlt', daten: new Uint8Array() })
    await a.senden({ typ: 'referenzen', listen: [] })
    await a.senden({ typ: 'nachpruefen', nr: 9, auftraege: [] })
    expect(a.raus.at(-1)).toEqual({ typ: 'nachgeprueft', nr: 9, ergebnisse: [{ ref: '1' }] })
    a.raus.pop()
    await a.senden({ typ: 'paket', nr: 10, struktur: [], korrekturen: [] })
    expect(a.raus.pop()).toEqual({ typ: 'paket', nr: 10, ergebnis: { befunde: [] } })
    expect(kern.abbrechen).toHaveBeenCalledWith('d')
    expect(kern.entfernen).toHaveBeenCalledWith('d')
    expect(kern.titelSetzen).toHaveBeenCalledWith('d', 'T')
    expect(a.raus).toEqual([{ typ: 'fertig', id: 'nach', z: { id: 'nach' } }, { typ: 'seite', nr: 3, text: 'T' }, { typ: 'fertig', id: 'd', z: { id: 'd' } }, { typ: 'fertig', id: 'd', z: { id: 'd', seitenQuelle: 'pdf_pair' } }, { typ: 'fertig', id: 'd', z: { id: 'd', ref: true } }])
  })
})

describe('Worker — Prüfschalter (Audit 11/2026, DC-12)', () => {
  it('pruefenSetzen reicht den Stand an den Kern und meldet jedes neu geprüfte Dokument', async () => {
    const pruefenSetzen = vi.fn(() => [{ id: 'a' } as never, { id: 'b' } as never])
    const a = aufbau({ pruefenSetzen })
    await a.senden({ typ: 'pruefenSetzen', schalter: { formal: false, word: true, rechnen: true } })
    expect(pruefenSetzen).toHaveBeenCalledWith({ formal: false, word: true, rechnen: true })
    expect(a.raus).toEqual([{ typ: 'fertig', id: 'a', z: { id: 'a' } }, { typ: 'fertig', id: 'b', z: { id: 'b' } }])
  })
})

describe('fehlerCode', () => {
  it('lässt DC-Codes durch, alles andere wird DC-PARSE', () => {
    expect(fehlerCode(new Error('DC-PDF-PASSWORD'))).toBe('DC-PDF-PASSWORD')
    expect(fehlerCode(new Error('DC-x y'))).toBe('DC-PARSE')
    expect(fehlerCode('kein Error')).toBe('DC-PARSE')
  })
})


describe('Abbrechen erreicht den Worker während des Lesens (Audit 11/2026, DC-01)', () => {
  // pdf.js im Fake-Worker (so lief es im Worker bis TEC-20): Antworten nur über Promise.resolve
  const seite = { getTextContent: () => Promise.resolve({ items: [{ str: 'Synthetic page text', transform: [1, 0, 0, 1, 50, 700], width: 100, height: 10 }] }), getOperatorList: () => Promise.resolve({ fnArray: [] }), cleanup: () => {} }
  const pdfjs: PdfJs = { OPS: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 300, getPage: () => Promise.resolve(seite), getMetadata: () => Promise.resolve({ info: {} }) }), destroy: () => Promise.resolve() }) }

  it("„abbrechen“ nach dem ersten Fortschritt: Fehler DC-ABORTED, kein „fertig“; eine Suche dazwischen wird beantwortet", async () => {
    const raus: Antwort[] = []
    const bereich: Bereich = {
      onmessage: null,
      postMessage: (a) => {
        raus.push(a)
        // Die Oberfläche schickt ihre Nachrichten als eigene Tasks — wie postMessage
        if (a.typ === 'fortschritt' && a.seite === 1) {
          setTimeout(() => void bereich.onmessage!({ data: { typ: 'suchen', nr: 7, q: 'x' } }), 0)
          setTimeout(() => void bereich.onmessage!({ data: { typ: 'abbrechen', id: 'gross' } }), 0)
        }
      },
    }
    verbinden(bereich, () => new Kern({ pdfjs: async () => pdfjs }))
    await bereich.onmessage!({ data: { typ: 'lesen', auftrag: { id: 'gross', name: 'gross.pdf', daten: new TextEncoder().encode('%PDF-1.4 synthetisch') } } })
    expect(raus.filter((a) => a.typ !== 'fortschritt')).toEqual([{ typ: 'treffer', nr: 7, treffer: [] }, { typ: 'fehler', id: 'gross', code: 'DC-ABORTED' }])
    expect(raus.filter((a) => a.typ === 'fortschritt').length).toBeLessThan(300)
  })
})
