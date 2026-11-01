import { describe, expect, it } from 'vitest'
import { gruppenVorschlagen, varianteAusKuerzel, vorbelegen } from './struktur'

describe('Paketstruktur vorbelegen (N1.1)', () => {
  it('Präfixe TM, APX/APPENDIX, ANX/ANNEX aus Dateiname, sonst aus dem Titel', () => {
    expect(vorbelegen('Training Manual.docx')).toMatchObject({ kuerzel: 'TM', ebene: 1, erkannt: true })
    expect(vorbelegen('APPENDIX_4_Line.docx')).toMatchObject({ kuerzel: 'APX 4', ebene: 2 })
    expect(vorbelegen('anx-2a.pdf')).toMatchObject({ kuerzel: 'ANX 2A', ebene: 3 })
    expect(vorbelegen('dokument.docx', 'Annex B Emergency')).toMatchObject({ kuerzel: 'ANX B', ebene: 3 })
    expect(vorbelegen('notizen.docx', 'Irgendwas')).toEqual({ kuerzel: '', ebene: 1, gruppe: '', variante: '', erkannt: false })
  })

  it('Ziffern-Präfix setzt die Ebene; Variante aus MP/SP oder „Variant C"', () => {
    expect(vorbelegen('2_APX4.docx')).toMatchObject({ kuerzel: 'APX 4', ebene: 2 })
    expect(vorbelegen('3_Syllabus.docx')).toMatchObject({ kuerzel: '', ebene: 3 })
    expect(vorbelegen('ANX2_SP.docx').variante).toBe('SP')
    expect(vorbelegen('anx 5.docx', 'Annex 5 Variant c').variante).toBe('C')
  })

  it('Gruppen: gleiche Ebene, Kürzel bis auf den letzten Buchstaben gleich oder gleiches Kürzel; Einzelne nicht', () => {
    const a = (kuerzel: string, ebene = 3) => ({ kuerzel, ebene, gruppe: '', variante: '', erkannt: true })
    expect(gruppenVorschlagen([
      { id: '1', a: a('ANX 2A') }, { id: '2', a: a('ANX 2B') }, { id: '3', a: a('ANX 3') },
      { id: '4', a: a('APX 7', 2) }, { id: '5', a: a('APX 7', 2) }, { id: '6', a: a('ANX 2C', 2) }, { id: '7', a: a('') },
    ])).toEqual({ 1: 'ANX 2', 2: 'ANX 2', 4: 'APX 7', 5: 'APX 7' })
  })

  it('Variante aus dem Kürzel', () => {
    expect([varianteAusKuerzel('ANX 2b'), varianteAusKuerzel('APX 4'), varianteAusKuerzel('TM')]).toEqual(['B', '', ''])
  })
})
