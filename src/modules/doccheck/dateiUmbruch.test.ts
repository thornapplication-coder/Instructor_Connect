import { describe, expect, it } from 'vitest'
import { umbruchStellen } from './dateiUmbruch'

describe('Dateinamen umbrechen nur an Trennzeichen (Audit 11/2026, UID-05)', () => {
  it('Umbruch nur NACH „_", „-", „." — nie mitten im Wort', () => {
    const teile = umbruchStellen('SBX-WORD-01_TM_E2R0.0.docx')
    // „E2R0.0" ist eine Revisionsnummer: Der Punkt zwischen Ziffern bricht nicht (Gegenprüfung — vorher „E2R0." / „0.docx")
    expect(teile).toEqual(['SBX-', 'WORD-', '01_', 'TM_', 'E2R0.0.docx'])
    // Nichts geht verloren, nichts kommt dazu: Die Ansicht setzt nur <wbr> dazwischen
    expect(teile.join('')).toBe('SBX-WORD-01_TM_E2R0.0.docx')
    // Jeder Teil außer dem letzten endet auf ein Trennzeichen
    for (const t of teile.slice(0, -1)) expect(t).toMatch(/[_.-]$/)
    expect(umbruchStellen('OM_A_2.3.4_final.pdf')).toEqual(['OM_', 'A_', '2.3.4_', 'final.pdf'])
    expect(umbruchStellen('Rev.2-Entwurf')).toEqual(['Rev.', '2-', 'Entwurf'])
  })

  it('die Endung steht nie allein — sie bleibt beim Teil davor', () => {
    expect(umbruchStellen('SBX-PKG-01_APX4_R0.1.docx')).toEqual(['SBX-', 'PKG-', '01_', 'APX4_', 'R0.1.docx'])
    expect(umbruchStellen('liste.xlsx')).toEqual(['liste.xlsx'])
    // Kein Endungs-Fall: langer letzter Teil oder kein Punkt davor
    expect(umbruchStellen('a.verylongpart')).toEqual(['a.', 'verylongpart'])
    expect(umbruchStellen('a_docx')).toEqual(['a_', 'docx'])
  })

  it('kein Teil nur aus Trennzeichen; ohne Trennzeichen ein Teil', () => {
    expect(umbruchStellen('a__b')).toEqual(['a__', 'b'])
    expect(umbruchStellen('.env')).toEqual(['.env'])
    expect(umbruchStellen('Liste ohne Trenner')).toEqual(['Liste ohne Trenner'])
    expect(umbruchStellen('---')).toEqual(['---'])
    expect(umbruchStellen('')).toEqual([''])
  })
})
