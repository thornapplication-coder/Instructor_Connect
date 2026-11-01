import { describe, expect, it } from 'vitest'
import { befundeLesen, dokForm, kopfzeileFinden, zielVorschlagen, zuordnungVorschlagen } from './fremdliste'

describe('Spaltenzuordnung fremder Findinglisten (N3.1 Schritt 2)', () => {
  it('erkennt deutsche und englische Köpfe, auch mit Zusatz („Status Compliance 2026")', () => {
    expect(zuordnungVorschlagen(['No.', 'Area', 'Page', 'Chapter', 'Finding', 'Recommendation', 'Status Compliance 2026', 'Comment Team', 'Responsible'])).toEqual({
      id: 0, dokument: 1, seite: 2, kapitel: 3, befund: 4, empfehlung: 5, status: 6, kommentar: 7, verantwortlich: 8,
    })
    expect(zuordnungVorschlagen(['Nr', 'Dokument', 'Befund', 'Bemerkung'])).toEqual({ id: 0, dokument: 1, befund: 2, kommentar: 3 })
  })

  it('Priorität wird erkannt (für das Blatt „New findings", N3.5)', () => {
    expect(zuordnungVorschlagen(['Nr', 'Befund', 'Priorität'])).toEqual({ id: 0, befund: 1, prioritaet: 2 })
    expect(zuordnungVorschlagen(['ID', 'Finding', 'Severity level'])).toEqual({ id: 0, befund: 1, prioritaet: 2 })
  })

  it('eine Spalte wird nur einmal vergeben; Unbekanntes bleibt frei', () => {
    const z = zuordnungVorschlagen(['Finding', 'Finding', 'xyz'])
    expect(z).toEqual({ befund: 0 })
  })

  it('Kopfzeile unter einer Titelzeile wird gefunden; ohne Treffer gilt Zeile 1', () => {
    expect(kopfzeileFinden([['Finding list 2026'], [], ['No.', 'Finding', 'Status']])).toBe(2)
    expect(kopfzeileFinden([['a', 'b']])).toBe(0)
  })

  it('liest Befunde ab der Kopfzeile, Zeilen ohne Befund und Empfehlung fallen weg', () => {
    const zeilen = [['No.', 'Finding', 'Status'], ['1', ' Text ', 'Open'], ['', '', 'Open'], ['', 'ohne Nr', '']]
    const b = befundeLesen(zeilen, 0, zuordnungVorschlagen(zeilen[0]))
    expect(b).toEqual([
      { ref: '1', zeile: 1, dokument: '', seite: '', kapitel: '', befund: 'Text', empfehlung: '', teamStatus: 'Open', kommentar: '', verantwortlich: '' },
      expect.objectContaining({ ref: '#4', zeile: 3, befund: 'ohne Nr' }),
    ])
  })
})

describe('Dokumentzuordnung (N3.1 Schritt 3)', () => {
  const docs = [
    { id: 'tm', namen: ['TM', 'SBX Training Manual', 'tm.docx'] },
    { id: 'apx', namen: ['APX 4', 'Appendix 4 Line Training', 'SBX-PKG-01_APX4_R0.1.docx'] },
  ]

  it('Kurz- und Langformen: APX 4 = APPENDIX 4, TM = TRAINING MANUAL', () => {
    expect(dokForm('APPENDIX 4')).toBe('apx4')
    expect(dokForm('Annex B')).toBe('anxb')
    expect(zielVorschlagen('APPENDIX 4', docs)).toEqual({ art: 'dok', ids: ['apx'] })
    expect(zielVorschlagen('Apx4', docs)).toEqual({ art: 'dok', ids: ['apx'] })
    expect(zielVorschlagen('TRAINING MANUAL', docs)).toEqual({ art: 'dok', ids: ['tm'] })
  })

  it('Kürzel im Dateinamen oder Titel zählt als ganzes Wort — „TM" steckt nicht in „ATM"', () => {
    const d = [
      { id: 'tm', namen: ['SBX-PKG-01_TM_R0.1.docx'] },
      { id: 'atm', namen: ['ATM procedures'] },
      { id: 'apx', namen: ['SBX-PKG-01 Appendix 4 Line Training R0.1'] },
      { id: 'om', namen: ['Operations Manual Part A'] },
    ]
    expect(zielVorschlagen('TM', d)).toEqual({ art: 'dok', ids: ['tm'] })
    expect(zielVorschlagen('APX 4', d)).toEqual({ art: 'dok', ids: ['apx'] })
    expect(zielVorschlagen('Line Training', d)).toEqual({ art: 'dok', ids: ['apx'] })
    // längere Werte dürfen Teil eines Namens sein
    expect(zielVorschlagen('OperationsManual', d)).toEqual({ art: 'dok', ids: ['om'] })
  })

  it('paketweite Wörter und leere Werte → Paket; Unbekanntes → Quelle fehlt (nicht raten)', () => {
    expect(zielVorschlagen('Schreibweise', docs)).toEqual({ art: 'paket' })
    expect(zielVorschlagen('', docs)).toEqual({ art: 'paket' })
    expect(zielVorschlagen('OSD', docs)).toEqual({ art: 'fehlt' })
    // Zwei Buchstaben sind zu kurz, um als Teil eines Namens zu gelten.
    expect(zielVorschlagen('ap', docs)).toEqual({ art: 'fehlt' })
  })
})
