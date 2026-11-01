import { describe, expect, it } from 'vitest'
import { duplikatPruefen, sha256Hex } from './duplikat'

describe('sha256Hex', () => {
  it('liefert den bekannten Wert für "abc"', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex(new TextEncoder().encode('abc').buffer)).toHaveLength(64)
  })
})

describe('Duplikat-Warnung (Spez. 6.10)', () => {
  const bestand = [
    { id: 'l1', bezeichnung: 'POH Rev 26', herkunft: 'library' as const, sha256: 'aaa', nummer: 'POH-1', revision: 'Rev 26' },
    { id: 's1', bezeichnung: 'QRH Rev 3', herkunft: 'session' as const, sha256: 'bbb', nummer: 'QRH-1', revision: 'Rev 3' },
  ]

  it('gleicher Hash → identisch, auch gegen Sitzungsdokumente', () => {
    expect(duplikatPruefen({ sha256: 'aaa' }, bestand)).toEqual({ art: 'identisch', mit: bestand[0] })
    expect(duplikatPruefen({ sha256: 'bbb' }, bestand)?.mit.id).toBe('s1')
  })

  it('gleiche Nummer und Revision, anderer Hash → Warnung (Groß-/Kleinschreibung egal)', () => {
    expect(duplikatPruefen({ sha256: 'zzz', nummer: 'poh-1', revision: 'rev  26' }, bestand)).toEqual({ art: 'gleicheRevision', mit: bestand[0] })
  })

  it('neue Revision derselben Nummer ist kein Duplikat; das Dokument selbst zählt nicht', () => {
    expect(duplikatPruefen({ sha256: 'zzz', nummer: 'POH-1', revision: 'Rev 27' }, bestand)).toBeNull()
    expect(duplikatPruefen({ id: 'l1', sha256: 'aaa' }, bestand)).toBeNull()
    expect(duplikatPruefen({ sha256: 'zzz' }, bestand)).toBeNull()
  })
})
