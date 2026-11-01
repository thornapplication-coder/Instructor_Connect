import { describe, expect, it, vi } from 'vitest'
import { fehlerCode, verbinden, type Anfrage, type Antwort, type Bereich } from './doccheck.worker'
import type { Kern } from './kern'

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
    const a = aufbau({ lesen: async (_auf, melde) => (melde?.(1, 2), z as never) })
    await a.senden({ typ: 'lesen', auftrag: { id: 'd', name: 'x.pdf', daten: new Uint8Array() } })
    expect(a.raus).toEqual([{ typ: 'fortschritt', id: 'd', seite: 1, gesamt: 2 }, { typ: 'fertig', id: 'd', z }])
  })

  it('Lesefehler kommen als Code, nie als Meldungstext', async () => {
    const a = aufbau({ lesen: async () => { throw new Error('geheimer Dokumentinhalt im Stack') } })
    await a.senden({ typ: 'lesen', auftrag: { id: 'd', name: 'x', daten: new Uint8Array() } })
    expect(a.raus).toEqual([{ typ: 'fehler', id: 'd', code: 'DC-PARSE' }])
  })

  it('abbrechen, entfernen, titel, seite und ocr werden durchgereicht', async () => {
    const kern = {
      abbrechen: vi.fn(), entfernen: vi.fn(), titelSetzen: vi.fn(), seitenText: vi.fn(() => 'T'),
      ocrEinspielen: vi.fn((id: string) => (id === 'd' ? ({ id } as never) : null)),
      paaren: vi.fn(async (id: string) => (id === 'd' ? ({ id, seitenQuelle: 'pdf_pair' } as never) : null)),
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
    expect(kern.abbrechen).toHaveBeenCalledWith('d')
    expect(kern.entfernen).toHaveBeenCalledWith('d')
    expect(kern.titelSetzen).toHaveBeenCalledWith('d', 'T')
    expect(a.raus).toEqual([{ typ: 'seite', nr: 3, text: 'T' }, { typ: 'fertig', id: 'd', z: { id: 'd' } }, { typ: 'fertig', id: 'd', z: { id: 'd', seitenQuelle: 'pdf_pair' } }])
  })
})

describe('fehlerCode', () => {
  it('lässt DC-Codes durch, alles andere wird DC-PARSE', () => {
    expect(fehlerCode(new Error('DC-PDF-PASSWORD'))).toBe('DC-PDF-PASSWORD')
    expect(fehlerCode(new Error('DC-x y'))).toBe('DC-PARSE')
    expect(fehlerCode('kein Error')).toBe('DC-PARSE')
  })
})

