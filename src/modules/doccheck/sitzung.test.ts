import { describe, expect, it, vi } from 'vitest'
import { registrierteArbeitOffen } from '../../editGuard'
import type { Zusammenfassung } from './kern'
import type { ReCheckSitzung } from './recheck/ablauf'
import {
  abonnieren, offeneArbeit, referenzenSetzen, aktualisiert, bestaetigen, paketBestaetigen, paketSetzen, paketStruktur, paketVorbelegen, datei, dateiAblegen, dateiEntfernen, duplikatFuer, entfernen, fehler, feldSetzen, fertig, fortschritt, fuerNutzer, LEER, lesenZustand, neu, offenePflichtfelder, setzen,
} from './sitzung'

const zf = (id: string, meta: Partial<Zusammenfassung['meta']> = {}, sha = 'h' + id): Zusammenfassung => ({
  id, format: 'pdf', seiten: 3, zeichen: 10, ocrKandidaten: [], ocrSeiten: 0, tabellen: 0, sha256: sha, meta, duplikat: null, labels: [], outline: [],
  lenkung: { aenderungen: 0, kommentare: 0, revisionsbalken: 0, textfelder: 0, kopfzeilen: 0, fusszeilen: 0 }, seitenQuelle: 'native',
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

  it('Revision fehlt im Dokument → aus dem Dateinamen, als „erkannt" markiert', () => {
    let z = neu(LEER, { id: 'a', rolle: 'review', name: 'TM_E2R0.1.docx', groesse: 1 })
    z = fertig(z, 'a', zf('a', { titel: 'TM' }))
    expect(z.docs[0].felder.revision).toBe('Edition 2 Rev 0.1')
    expect(z.docs[0].erkannt).toContain('revision')
    expect(offenePflichtfelder(z.docs[0])).toEqual([])
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

describe('Offene Arbeit für das automatische Update (Audit 11/2026, TEC-02)', () => {
  /*
   * Vorher lud ein DocCheck-Tab nach jedem Deployment binnen einer Minute von
   * selbst neu — eingelesene Pakete, OCR-Läufe und Re-Check-Bestätigungen
   * waren ohne Rückfrage weg. Die Sitzung meldet sich deshalb beim Laden des
   * Moduls bei der Bearbeitungs-Wache an.
   */
  it('zählt Dokumente, Referenzlisten und einen Re-Check — eine leere Sitzung nicht', () => {
    expect(offeneArbeit(LEER)).toBe(false)
    expect(offeneArbeit({ ...LEER, referenzen: [] })).toBe(false)
    expect(offeneArbeit(neu(LEER, { id: 'a', rolle: 'review', name: 'a', groesse: 1 }))).toBe(true)
    expect(offeneArbeit(referenzenSetzen(LEER, [{ liste: null, datei: 'soll.xlsx', zeilen: [] }]))).toBe(true)
    expect(offeneArbeit({ ...LEER, recheck: {} as ReCheckSitzung })).toBe(true)
  })

  it('ist bei der Wache angemeldet: Dokument da → offen, nach dem Abmelden nicht mehr', () => {
    fuerNutzer('u-tec02')
    expect(registrierteArbeitOffen()).toBe(false)
    setzen((z) => neu(z, { id: 'p', rolle: 'review', name: 'p.docx', groesse: 1 }))
    expect(registrierteArbeitOffen()).toBe(true)
    fuerNutzer(null)
    expect(registrierteArbeitOffen()).toBe(false)
  })
})

describe('Dokumentpaket in der Sitzung (N1)', () => {
  const lesen = (z: ReturnType<typeof neu>, id: string, name: string, titel = '', rolle: 'review' | 'master' = 'review') => fertig(neu(z, { id, rolle, name, groesse: 1 }), id, zf(id, { titel }))

  it('fertige Prüfdokumente werden vorbelegt, Geschwister vorgeschlagen; Master bleiben draußen', () => {
    let z = lesen(LEER, 't', 'SBX_TM.docx')
    z = lesen(z, 'a', 'ANX2A.docx')
    expect(z.docs[1].paket).toMatchObject({ kuerzel: 'ANX 2A', gruppe: '' })
    z = lesen(z, 'b', 'ANX2B_SP.docx')
    z = lesen(z, 'm', 'ANX2C.docx', '', 'master')
    expect(z.docs.map((d) => [d.paket?.kuerzel, d.paket?.gruppe, d.paket?.variante])).toEqual([['TM', '', ''], ['ANX 2A', 'ANX 2', 'A'], ['ANX 2B', 'ANX 2', 'SP'], [undefined, undefined, undefined]])
    expect(paketVorbelegen(z)).toBe(z)
  })

  it('Handänderung bestätigt und bleibt; Vorschlag überschreibt sie nicht', () => {
    let z = lesen(lesen(LEER, 'a', 'ANX2A.docx'), 'b', 'ANX2B.docx')
    z = paketSetzen(z, 'a', { gruppe: '' })
    expect(z.docs[0].paket).toMatchObject({ gruppe: '', erkannt: false })
    expect(paketVorbelegen(z).docs[0].paket!.gruppe).toBe('')
    expect(paketSetzen(z, 'gibtsnicht', { ebene: 2 })).toEqual(z)
    expect(paketBestaetigen(z).docs.every((d) => !d.paket!.erkannt)).toBe(true)
  })

  it('Struktur für den Worker mit bestätigter Revision; Dokumente ohne Paketangabe fallen weg', () => {
    let z = lesen(LEER, 't', 'TM.docx', 'Training Manual')
    z = feldSetzen(z, 't', 'revision', 'R0.1')
    z = neu(z, { id: 'x', rolle: 'review', name: 'liest.docx', groesse: 1 })
    expect(paketStruktur(z)).toEqual([{ id: 't', dokName: 'Training Manual', kuerzel: 'TM', ebene: 1, gruppe: '', variante: '', revision: 'R0.1', datum: '' }])
  })
})

