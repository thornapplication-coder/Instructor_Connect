import { beforeEach, describe, expect, it, vi } from 'vitest'
import { annehmbar, bibliotheksVergleich, hochladen, MAX_BYTES, MELDE_TAKT } from './hochladen'
import type { Zusammenfassung } from './kern'
import { datei, entfernen, fuerNutzer, lesenZustand, setzen } from './sitzung'

const zf = (id: string, meta: Zusammenfassung['meta'] = {}): Zusammenfassung => ({
  id, format: 'pdf', seiten: 1, zeichen: 1, ocrKandidaten: [], ocrSeiten: 0, tabellen: 0, sha256: 's' + id, meta, duplikat: null, labels: [], outline: [],
  lenkung: { aenderungen: 0, kommentare: 0, revisionsbalken: 0, textfelder: 0, kopfzeilen: 0, fusszeilen: 0 },
})
const datei_ = (name: string, size = 3) => ({ name, size, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })

beforeEach(() => {
  fuerNutzer('u-test-' + Math.random())
})

describe('annehmbar', () => {
  it('nur PDF, DOCX, XLSX bis 500 MB', () => {
    expect(annehmbar({ name: 'A.PDF', size: 1 })).toBe('ok')
    expect(annehmbar({ name: 'a.doc', size: 1 })).toBe('format')
    expect(annehmbar({ name: 'a.pdf', size: MAX_BYTES + 1 })).toBe('groesse')
  })
})

describe('hochladen', () => {
  it('liest, legt die Datei für den Viewer ab, übernimmt erkannte Werte und meldet den Titel an den Worker', async () => {
    const titel = vi.fn()
    const lesen = vi.fn(async (a: { id: string; vorgabe?: string; bestand?: unknown[] }) => zf(a.id, { titel: 'PLM CL30', revision: 'Rev 1' }))
    const r = await hochladen([datei_('plm.pdf'), datei_('x.doc')], 'review', { lesen, titel } as never)
    expect(r.abgelehnt).toEqual([{ name: 'x.doc', grund: 'format' }])
    const d = lesenZustand().docs[0]
    expect(d).toMatchObject({ rolle: 'review', status: 'fertig', felder: { titel: 'PLM CL30', revision: 'Rev 1' } })
    expect(datei(d.id)).toEqual(new Uint8Array([1, 2, 3]))
    expect(titel).toHaveBeenCalledWith(d.id, 'PLM CL30')
    // Prüfdokumente ohne Rechtscharakter-Vorgabe, Bestand enthält die Bibliothek.
    expect(lesen.mock.calls[0][0].vorgabe).toBeUndefined()
    expect(lesen.mock.calls[0][0].bestand).toHaveLength(bibliotheksVergleich().length)
  })

  it('Master-Dokumente lesen mit Vorgabe OEM; Bestand enthält auch fertige Sitzungsdokumente', async () => {
    const lesen = vi.fn(async (a: { id: string }) => zf(a.id))
    await hochladen([datei_('a.pdf')], 'master', { lesen, titel: vi.fn() } as never)
    await hochladen([datei_('b.pdf')], 'master', { lesen, titel: vi.fn() } as never)
    expect(lesen.mock.calls[0][0]).toMatchObject({ vorgabe: 'OEM' })
    expect((lesen.mock.calls[1][0] as unknown as { bestand: { herkunft: string }[] }).bestand.some((b) => b.herkunft === 'session')).toBe(true)
  })

  it('drosselt Fortschrittsmeldungen, die letzte kommt immer an', async () => {
    let t = 0
    const zustaende: (number | undefined)[] = []
    const lesen = vi.fn(async (a: { id: string }, fort: (s: number, g: number) => void) => {
      for (let s = 1; s <= 5; s++) {
        t += MELDE_TAKT / 2
        fort(s, 5)
        zustaende.push(lesenZustand().docs.find((d) => d.id === a.id)?.fortschritt?.seite)
      }
      return zf(a.id)
    })
    await hochladen([datei_('a.pdf')], 'review', { lesen, titel: vi.fn() } as never, () => t)
    expect(zustaende).toEqual([1, 1, 3, 3, 5])
  })

  it('Fehler als Code; Abbruch entfernt das Dokument ganz', async () => {
    await hochladen([datei_('a.pdf')], 'review', { lesen: async () => { throw new Error('DC-PDF-PASSWORD') }, titel: vi.fn() } as never)
    expect(lesenZustand().docs[0]).toMatchObject({ status: 'fehler', fehler: 'DC-PDF-PASSWORD' })
    await hochladen([datei_('b.pdf')], 'review', { lesen: async () => { throw new Error('irgendwas') }, titel: vi.fn() } as never)
    expect(lesenZustand().docs[1].fehler).toBe('DC-PARSE')
    await hochladen([datei_('c.pdf')], 'review', { lesen: async () => { throw new Error('DC-ABORTED') }, titel: vi.fn() } as never)
    expect(lesenZustand().docs.map((d) => d.name)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('während des Lesens entfernt → wird nicht wieder aufgenommen; ohne Titel keine Meldung', async () => {
    const titel = vi.fn()
    const lesen = async (a: { id: string }) => {
      setzen((z) => entfernen(z, a.id))
      return zf(a.id)
    }
    await hochladen([datei_('a.pdf')], 'review', { lesen, titel } as never)
    expect(lesenZustand().docs).toEqual([])
    await hochladen([datei_('b.pdf')], 'review', { lesen: async (a: { id: string }) => zf(a.id), titel } as never)
    expect(titel).not.toHaveBeenCalled()
  })
})
