import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { annehmbar, bibliotheksVergleich, hochladen, MAX_BYTES, MELDE_TAKT, PAAR_ZEIT_JE_MB, PAAR_ZEIT_MAX, PAAR_ZEIT_SOCKEL, paarZeitgrenze, pdfDazulegen, stamm } from './hochladen'
import type { Zusammenfassung } from './kern'
import { abbruchAnfordern, aktualisiert, datei, entfernen, fuerNutzer, lesenZustand, setzen } from './sitzung'

const zf = (id: string, meta: Zusammenfassung['meta'] = {}): Zusammenfassung => ({
  id, format: 'pdf', seiten: 1, zeichen: 1, ocrKandidaten: [], ocrSeiten: 0, tabellen: 0, sha256: 's' + id, meta, duplikat: null, labels: [], outline: [],
  lenkung: { aenderungen: 0, kommentare: 0, revisionsbalken: 0, textfelder: 0, kopfzeilen: 0, fusszeilen: 0 }, seitenQuelle: 'native',
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
    // Prüfdokumente ohne Rechtscharakter-Vorgabe, Bestand enthält die Bibliothek,
    // und sie werden geprüft (Spez. 8.8).
    expect(lesen.mock.calls[0][0].vorgabe).toBeUndefined()
    expect((lesen.mock.calls[0][0] as { pruefen?: unknown }).pruefen).toEqual({ formal: true, word: true, rechnen: true })
    expect(lesen.mock.calls[0][0].bestand).toHaveLength(bibliotheksVergleich().length)
  })

  it('Master-Dokumente lesen mit Vorgabe OEM; Bestand enthält auch fertige Sitzungsdokumente', async () => {
    const lesen = vi.fn(async (a: { id: string }) => zf(a.id))
    await hochladen([datei_('a.pdf')], 'master', { lesen, titel: vi.fn() } as never)
    await hochladen([datei_('b.pdf')], 'master', { lesen, titel: vi.fn() } as never)
    expect(lesen.mock.calls[0][0]).toMatchObject({ vorgabe: 'OEM' })
    expect(lesen.mock.calls[0][0]).not.toHaveProperty('pruefen')
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

  it('Abbrechen kam erst an, als der Worker schon fertig war: Ergebnis verworfen, auch im Worker (Gegenprüfung Audit 11/2026, DC-01)', async () => {
    const entfernenImWorker = vi.fn()
    const titel = vi.fn()
    // Der Klick fällt zwischen „fertig" im Worker und die Antwort im Fenster
    const lesen = async (a: { id: string }) => {
      setzen((z) => abbruchAnfordern(z, a.id))
      return zf(a.id, { titel: 'Spät' })
    }
    await hochladen([datei_('spaet.pdf')], 'review', { lesen, titel, entfernen: entfernenImWorker } as never)
    expect(lesenZustand().docs).toEqual([])
    expect(entfernenImWorker).toHaveBeenCalledTimes(1)
    expect(titel).not.toHaveBeenCalled()
    // Abbruch durch den Worker selbst: ebenso ganz weg
    await hochladen([datei_('c.pdf')], 'review', { lesen: async () => { throw new Error('DC-ABORTED') }, titel, entfernen: entfernenImWorker } as never)
    expect([lesenZustand().docs.length, entfernenImWorker.mock.calls.length]).toEqual([0, 2])
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

describe('Word-PDF-Paar beim Hochladen (Nachtrag N5)', () => {
  const verbindung = () => {
    let hoerer: ((z: Zusammenfassung) => void) | null = null
    const paaren = vi.fn((id: string) => hoerer?.({ ...zf(id), format: 'docx', seitenQuelle: 'pdf_pair' }))
    return {
      lesen: vi.fn(async (a: { id: string; name: string }) => ({ ...zf(a.id), format: /docx$/.test(a.name) ? ('docx' as const) : ('pdf' as const) })),
      titel: vi.fn(),
      paaren,
      beiOcr: (h: (z: Zusammenfassung) => void) => ((hoerer = h), () => (hoerer = null)),
    }
  }

  it('gleichnamiges PDF wird gepaart statt als eigenes Dokument geladen', async () => {
    const v = verbindung()
    await hochladen([datei_('TM_E1R0.docx'), datei_('tm_e1r0.PDF'), datei_('anderes.pdf')], 'review', v as never)
    expect(lesenZustand().docs.map((d) => d.name)).toEqual(['TM_E1R0.docx', 'anderes.pdf'])
    const d = lesenZustand().docs[0]
    expect(v.paaren).toHaveBeenCalledWith(d.id, expect.any(Uint8Array))
    expect(d.z?.seitenQuelle).toBe('pdf_pair')
    expect(datei(`${d.id}#pdf`)).toBeDefined()
  })

  it('Feature-Schalter aus: keine Paarung, beide Dateien sind Dokumente', async () => {
    const v = verbindung()
    await hochladen([datei_('a.docx'), datei_('a.pdf')], 'review', v as never, undefined, { paaren: false })
    expect(lesenZustand().docs).toHaveLength(2)
    expect(v.paaren).not.toHaveBeenCalled()
  })

  it('DOCX nicht lesbar: das gleichnamige PDF wird ein eigenes Prüfdokument (Audit 11/2026, DC-07)', async () => {
    const v = verbindung()
    v.lesen.mockImplementation(async (a: { id: string; name: string }) => {
      if (/docx$/.test(a.name)) throw new Error('DC-DOCX-INVALID')
      return { ...zf(a.id), format: 'pdf' as const }
    })
    // vorher: drei lesen-Aufträge für vier Dateien, x.pdf ohne Karte und ohne Meldung
    await hochladen([datei_('x.docx'), datei_('x.pdf')], 'review', v as never)
    expect(v.lesen.mock.calls.map((c) => c[0].name)).toEqual(['x.docx', 'x.pdf'])
    expect(lesenZustand().docs.map((d) => [d.name, d.status, d.fehler])).toEqual([
      ['x.docx', 'fehler', 'DC-DOCX-INVALID'],
      ['x.pdf', 'fertig', undefined],
    ])
    expect(v.paaren).not.toHaveBeenCalled()
  })

  it('DOCX zu groß: abgelehnt, das PDF wird normal gelesen — ein zu großes PDF wird nicht gepaart, sondern abgelehnt (DC-07)', async () => {
    const v = verbindung()
    const r = await hochladen([datei_('x.docx', MAX_BYTES + 1), datei_('x.pdf')], 'review', v as never)
    expect(r.abgelehnt).toEqual([{ name: 'x.docx', grund: 'groesse' }])
    expect(lesenZustand().docs.map((d) => d.name)).toEqual(['x.pdf'])
    expect(v.paaren).not.toHaveBeenCalled()
    fuerNutzer('u-test-gross')
    const r2 = await hochladen([datei_('y.docx'), datei_('y.pdf', MAX_BYTES + 1)], 'review', v as never)
    expect(r2.abgelehnt).toEqual([{ name: 'y.pdf', grund: 'groesse' }])
    expect(lesenZustand().docs.map((d) => [d.name, d.z?.seitenQuelle])).toEqual([['y.docx', 'native']])
    expect(v.paaren).not.toHaveBeenCalled()
  })

  it('Abbruch des DOCX nimmt das Paar ganz zurück; ein Paarling, der kein DOCX ergab, wird eigenes Dokument (DC-07)', async () => {
    const v = verbindung()
    v.lesen.mockImplementation(async (a: { id: string; name: string }) => {
      if (/docx$/.test(a.name)) throw new Error('DC-ABORTED')
      return { ...zf(a.id), format: 'pdf' as const }
    })
    await hochladen([datei_('a.docx'), datei_('a.pdf')], 'review', v as never)
    expect(lesenZustand().docs).toEqual([])
    // Der Leser meldet für die .docx-Datei ein anderes Format: keine Paarung, das PDF steht für sich
    v.lesen.mockImplementation(async (a: { id: string }) => ({ ...zf(a.id), format: 'pdf' as const }))
    await hochladen([datei_('b.docx'), datei_('b.pdf')], 'review', v as never)
    expect(lesenZustand().docs.map((d) => d.name)).toEqual(['b.docx', 'b.pdf'])
    expect(v.paaren).not.toHaveBeenCalled()
  })

  it('pdfDazulegen ignoriert Meldungen zu anderen Dokumenten', async () => {
    let hoerer: ((z: Zusammenfassung) => void) | null = null
    const p = pdfDazulegen('x', datei_('x.pdf'), {
      beiOcr: (h) => ((hoerer = h), () => (hoerer = null)),
      paaren: () => {
        hoerer?.(zf('anderes'))
        hoerer?.(zf('x'))
      },
    })
    await expect(p).resolves.toMatchObject({ id: 'x' })
  })

  it('stamm', () => {
    expect(stamm(' PLM.E1R0.DOCX')).toBe('plm.e1r0')
  })
})

/**
 * Audit 11/2026, Runde 3: `pdfDazulegen` wartete unbegrenzt auf die
 * Paarungsmeldung des Workers. Antwortete er nie — hängend, oder weil er
 * das Dokument nicht mehr kennt und dann gar nichts schickt —, blieb der
 * Knopf auf „Gleiche ab …" stehen und das Hochladen kam nie zum Ende.
 */
describe('Word-PDF-Paarung mit Zeitgrenze', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Worker, der nie antwortet; `melden` schickt später doch noch eine Zusammenfassung */
  const stumm = () => {
    const hoerer = new Set<(z: Zusammenfassung) => void>()
    return {
      lesen: vi.fn(async (a: { id: string; name: string }) => ({ ...zf(a.id), format: /docx$/.test(a.name) ? ('docx' as const) : ('pdf' as const), seitenQuelle: 'approx' as const })),
      titel: vi.fn(),
      paaren: vi.fn(),
      beiOcr: vi.fn((h: (z: Zusammenfassung) => void) => (hoerer.add(h), () => void hoerer.delete(h))),
      melden: (z: Zusammenfassung) => hoerer.forEach((h) => h(z)),
      hoerer,
    }
  }

  it('Zeitgrenze wächst mit der Größe: Sockel, je angefangenem MB, höchstens 10 min', () => {
    expect(paarZeitgrenze(0)).toBe(PAAR_ZEIT_SOCKEL)
    expect(paarZeitgrenze(1)).toBe(PAAR_ZEIT_SOCKEL + PAAR_ZEIT_JE_MB)
    expect(paarZeitgrenze(5 * 1_048_576)).toBe(PAAR_ZEIT_SOCKEL + 5 * PAAR_ZEIT_JE_MB)
    expect(paarZeitgrenze(MAX_BYTES)).toBe(PAAR_ZEIT_MAX)
    expect(paarZeitgrenze(-1)).toBe(PAAR_ZEIT_SOCKEL)
  })

  it('keine Antwort: nach der Zeitgrenze „zeit", Hörer abgemeldet, das DOCX bleibt unverändert nutzbar', async () => {
    vi.useFakeTimers()
    const v = stumm()
    await hochladen([datei_('w.docx')], 'review', v as never, undefined, { paaren: false })
    const vorher = lesenZustand().docs[0]
    const p = pdfDazulegen(vorher.id, datei_('w.pdf', 2 * 1_048_576), v)
    let ergebnis: unknown = 'offen'
    void p.then((z) => (ergebnis = z))
    await vi.advanceTimersByTimeAsync(paarZeitgrenze(2 * 1_048_576) - 1)
    expect(ergebnis).toBe('offen')
    await vi.advanceTimersByTimeAsync(1)
    expect(ergebnis).toBe('zeit')
    expect(v.hoerer.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(lesenZustand().docs[0]).toEqual(vorher)
    expect(vorher).toMatchObject({ status: 'fertig', z: { seitenQuelle: 'approx' } })
    // Das PDF liegt für eine späte Antwort bereit
    expect(datei(`${vorher.id}#pdf`)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('eine späte Antwort ändert hier nichts mehr; der dauerhafte Hörer der App übernimmt sie sauber', async () => {
    vi.useFakeTimers()
    const v = stumm()
    await hochladen([datei_('w.docx')], 'review', v as never, undefined, { paaren: false })
    const id = lesenZustand().docs[0].id
    const p = pdfDazulegen(id, datei_('w.pdf'), v)
    await vi.advanceTimersByTimeAsync(paarZeitgrenze(3))
    await expect(p).resolves.toBe('zeit')
    // Wie DocCheckApp: ein Hörer, der jede Aktualisierung aus dem Worker einspielt
    const ab = v.beiOcr((z) => setzen((s) => aktualisiert(s, z)))
    v.melden({ ...zf(id), format: 'docx', seitenQuelle: 'pdf_pair' })
    expect(lesenZustand().docs[0]).toMatchObject({ id, status: 'fertig', z: { seitenQuelle: 'pdf_pair' } })
    ab()
  })

  it('Antwort vor der Zeitgrenze: Ergebnis übernommen, keine Uhr läuft weiter', async () => {
    vi.useFakeTimers()
    const v = stumm()
    v.paaren.mockImplementation((id: string) => setTimeout(() => v.melden({ ...zf(id), format: 'docx', seitenQuelle: 'pdf_pair' }), 5_000))
    await hochladen([datei_('w.docx')], 'review', v as never, undefined, { paaren: false })
    const id = lesenZustand().docs[0].id
    const p = pdfDazulegen(id, datei_('w.pdf'), v)
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(p).resolves.toMatchObject({ id, seitenQuelle: 'pdf_pair' })
    expect(vi.getTimerCount()).toBe(0)
    expect(lesenZustand().docs[0].z?.seitenQuelle).toBe('pdf_pair')
  })

  it('beim Hochladen als Paar: das DOCX ist gelesen und gemeldet, das Hochladen endet trotzdem', async () => {
    vi.useFakeTimers()
    const v = stumm()
    const lauf = hochladen([datei_('p.docx'), datei_('p.pdf'), datei_('x.doc')], 'review', v as never)
    let ende: Awaited<typeof lauf> | null = null
    void lauf.then((r) => (ende = r))
    await vi.advanceTimersByTimeAsync(paarZeitgrenze(3))
    expect(ende).toEqual({ abgelehnt: [{ name: 'x.doc', grund: 'format' }], ohneAntwort: ['p.docx'] })
    expect(v.paaren).toHaveBeenCalledTimes(1)
    expect(lesenZustand().docs.map((d) => [d.name, d.status, d.z?.seitenQuelle])).toEqual([['p.docx', 'fertig', 'approx']])
  })

  it('Dokument entfernt oder abgemeldet, während gewartet wird: sofort „entfernt", keine Meldung nach Ablauf (Gegenprüfung Runde 3)', async () => {
    // Sonst hätte die Uhr Minuten später „keine Antwort" zu einem Dokument gemeldet, das es nicht
    // mehr gibt — nach dem Abmelden mit seinem Namen vor dem nächsten Nutzer.
    vi.useFakeTimers()
    const v = stumm()
    await hochladen([datei_('a.docx'), datei_('b.docx')], 'review', v as never, undefined, { paaren: false })
    const [a, b] = lesenZustand().docs.map((d) => d.id)
    const pa = pdfDazulegen(a, datei_('a.pdf'), v)
    const pb = pdfDazulegen(b, datei_('b.pdf'), v)
    await vi.advanceTimersByTimeAsync(0)
    // Eine andere Änderung der Sitzung beendet das Warten nicht
    setzen((s) => entfernen(s, b))
    await expect(pb).resolves.toBe('entfernt')
    let ergebnis: unknown = 'offen'
    void pa.then((z) => (ergebnis = z))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ergebnis).toBe('offen')
    fuerNutzer('u-test-anderer')
    await vi.advanceTimersByTimeAsync(0)
    expect(ergebnis).toBe('entfernt')
    expect([v.hoerer.size, vi.getTimerCount()]).toEqual([0, 0])

    // Beim Hochladen als Paar: entfernt, während auf die Paarung gewartet wird → nicht „ohne Antwort"
    v.paaren.mockClear()
    const lauf = hochladen([datei_('p.docx'), datei_('p.pdf')], 'review', v as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(v.paaren).toHaveBeenCalledTimes(1)
    setzen((s) => entfernen(s, s.docs[0].id))
    await expect(lauf).resolves.toEqual({ abgelehnt: [], ohneAntwort: [] })
  })
})
