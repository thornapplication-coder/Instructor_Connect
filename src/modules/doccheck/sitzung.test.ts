import { describe, expect, it, vi } from 'vitest'
import type { Zusammenfassung } from './kern'
import {
  abonnieren, aktualisiert, bestaetigen, datei, dateiAblegen, dateiEntfernen, duplikatFuer, entfernen, fehler, feldSetzen, fertig, fortschritt, fuerNutzer, LEER, lesenZustand, neu, offenePflichtfelder, setzen,
} from './sitzung'

const zf = (id: string, meta: Partial<Zusammenfassung['meta']> = {}, sha = 'h' + id): Zusammenfassung => ({
  id, format: 'pdf', seiten: 3, zeichen: 10, ocrKandidaten: [], ocrSeiten: 0, tabellen: 0, sha256: sha, meta, duplikat: null, labels: [], outline: [],
  lenkung: { aenderungen: 0, kommentare: 0, revisionsbalken: 0, textfelder: 0, kopfzeilen: 0, fusszeilen: 0 },
})

describe('Sitzungsübergänge', () => {
  it('neu → Fortschritt → fertig: erkannte Werte füllen nur leere Felder und sind markiert', () => {
    let z = neu(LEER, { id: 'a', rolle: 'review', name: 'plm.pdf', groesse: 10 })
    z = feldSetzen(z, 'a', 'revision', 'Rev 9')
    z = fortschritt(z, 'a', 1, 3)
    expect(z.docs[0].fortschritt).toEqual({ seite: 1, gesamt: 3 })
    z = fertig(z, 'a', zf('a', { titel: 'PLM', revision: 'Rev 1', datum: '2026-03-01', typ: 'PLM' }))
    const d = z.docs[0]
    expect(d.status).toBe('fertig')
    expect(d.fortschritt).toBeUndefined()
    expect(d.felder).toMatchObject({ titel: 'PLM', revision: 'Rev 9', datum: '2026-03-01', typ: 'PLM', nummer: '' })
    expect(d.erkannt.sort()).toEqual(['datum', 'titel', 'typ'])
  })

  it('Master bekommt einen Vorgaberang; Anfassen eines Felds hebt „erkannt" auf; bestätigen hebt alle auf', () => {
    let z = neu(LEER, { id: 'm', rolle: 'master', name: 'x', groesse: 1 })
    expect(z.docs[0].felder.rang).toBe('9')
    z = fertig(z, 'm', zf('m', { titel: 'T', revision: 'R' }))
    z = feldSetzen(z, 'm', 'titel', 'T2')
    expect(z.docs[0].erkannt).toEqual(['revision'])
    z = bestaetigen(z, 'm')
    expect(z.docs[0].erkannt).toEqual([])
  })

  it('fehler, aktualisiert, entfernen', () => {
    let z = neu(neu(LEER, { id: 'a', rolle: 'review', name: 'a', groesse: 1 }), { id: 'b', rolle: 'review', name: 'b', groesse: 1 })
    z = fehler(z, 'a', 'DC-PDF-PASSWORD')
    expect(z.docs[0]).toMatchObject({ status: 'fehler', fehler: 'DC-PDF-PASSWORD' })
    z = fertig(z, 'b', zf('b', { titel: 'B' }))
    z = aktualisiert(z, { ...zf('b'), ocrSeiten: 2 })
    expect(z.docs[1].z?.ocrSeiten).toBe(2)
    expect(z.docs[1].felder.titel).toBe('B')
    expect(entfernen(z, 'a').docs.map((d) => d.id)).toEqual(['b'])
  })

  it('Pflichtfelder: Revision immer, Titel für Master', () => {
    const r = neu(LEER, { id: 'a', rolle: 'review', name: 'a', groesse: 1 }).docs[0]
    const m = neu(LEER, { id: 'm', rolle: 'master', name: 'm', groesse: 1 }).docs[0]
    expect(offenePflichtfelder(r)).toEqual(['revision'])
    expect(offenePflichtfelder(m)).toEqual(['revision', 'titel'])
    expect(offenePflichtfelder({ ...r, felder: { ...r.felder, revision: ' Rev 1 ' } })).toEqual([])
  })

  it('Duplikat mit den AKTUELLEN Feldern — gegen Bibliothek und andere Sitzungsdokumente', () => {
    let z = neu(neu(LEER, { id: 'a', rolle: 'review', name: 'a', groesse: 1 }), { id: 'b', rolle: 'master', name: 'b', groesse: 1 })
    z = fertig(z, 'a', zf('a', { nummer: 'N', revision: 'R1' }, 'gleich'))
    z = fertig(z, 'b', zf('b', {}, 'gleich'))
    expect(duplikatFuer(z.docs[1], z, [])?.art).toBe('identisch')
    const bib = [{ id: 'l', bezeichnung: 'AFM Rev 12', herkunft: 'library' as const, nummer: 'N', revision: 'R2' }]
    expect(duplikatFuer(z.docs[0], z, bib)?.mit.id).toBe('b')
    const z2 = fertig(neu(LEER, { id: 'c', rolle: 'review', name: 'c', groesse: 1 }), 'c', zf('c', { nummer: 'N', revision: 'R2' }))
    expect(duplikatFuer(z2.docs[0], z2, bib)).toMatchObject({ art: 'gleicheRevision', mit: { id: 'l' } })
    expect(duplikatFuer(neu(LEER, { id: 'x', rolle: 'review', name: 'x', groesse: 1 }).docs[0], z, bib)).toBeNull()
  })
})

describe('Speicher', () => {
  it('benachrichtigt nur bei echter Änderung', () => {
    const h = vi.fn()
    const weg = abonnieren(h)
    setzen((z) => z)
    expect(h).not.toHaveBeenCalled()
    setzen((z) => neu(z, { id: 's', rolle: 'review', name: 's', groesse: 1 }))
    expect(h).toHaveBeenCalledOnce()
    expect(lesenZustand().docs.some((d) => d.id === 's')).toBe(true)
    weg()
  })

  it('Nutzerwechsel oder Abmelden verwirft Dokumente und Dateien (Spez. 5.4)', () => {
    fuerNutzer('u1')
    setzen((z) => neu(z, { id: 'q', rolle: 'review', name: 'q', groesse: 1 }))
    dateiAblegen('q', new Uint8Array([1]))
    expect(fuerNutzer('u1')).toBe(false)
    expect(datei('q')).toEqual(new Uint8Array([1]))
    expect(fuerNutzer('u2')).toBe(true)
    expect(lesenZustand()).toEqual({ nutzer: 'u2', docs: [] })
    expect(datei('q')).toBeUndefined()
    expect(fuerNutzer(null)).toBe(false)
    dateiAblegen('z', new Uint8Array())
    dateiEntfernen('z')
    expect(datei('z')).toBeUndefined()
  })
})
