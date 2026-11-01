import { describe, expect, it } from 'vitest'
import { exakteSchluessel, istExakt, stuecke, Suchindex, CHUNK, UEBERLAPPUNG } from './suche'

const afm = {
  id: 'afm',
  titel: 'AFM CL30',
  pages: [
    { index: 1, label: '2-01', text: 'CAS messages\nBATT 1 OFF BUS (amber): battery 1 disconnected from bus.\nBATT 2 OFF BUS (amber).', sectionPath: ['2 Electrical'] },
    { index: 2, label: '3-05', text: 'Limitations\nMaximum operating speed 320 KIAS.\nFlap extension 155 KIAS.' },
  ],
}
const ora = {
  id: 'ora',
  titel: 'Part-ORA',
  pages: [{ index: 7, text: 'AMC1 ORA.ATO.230(a) Training manual\nThe training manual should contain…', regRefs: ['AMC1 ORA.ATO.230(a)'] }],
}

describe('Suchindex (Abnahme Phase 2)', () => {
  const idx = new Suchindex()
  idx.hinzufuegen(afm)
  idx.hinzufuegen(ora)

  it('findet „BATT 1 OFF BUS" exakt — und NICHT die Seite mit nur „BATT 2 OFF BUS"', () => {
    const t = idx.suchen('BATT 1 OFF BUS')
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ docId: 'afm', seite: 1, label: '2-01', exakt: true })
    expect(t[0].ausschnitt).toContain('BATT 1 OFF BUS')
  })

  it('findet „AMC1 ORA.ATO.230" auch im Unterabsatz (a)', () => {
    const t = idx.suchen('AMC1 ORA.ATO.230')
    expect(t[0]).toMatchObject({ docId: 'ora', seite: 7, exakt: true })
  })

  it('Zahl mit Einheit exakt: „155 KIAS"', () => {
    expect(idx.suchen('155 KIAS').map((x) => [x.seite, x.exakt])).toEqual([[2, true]])
  })

  it('Volltext unscharf und mit Wortanfang, ohne doppelte Seiten', () => {
    const t = idx.suchen('battery disconected')
    expect(t[0]).toMatchObject({ docId: 'afm', seite: 1, exakt: false })
    expect(idx.suchen('limitat').map((x) => x.seite)).toEqual([2])
  })

  it('leere Anfrage, Entfernen und erneutes Hinzufügen', () => {
    expect(idx.suchen('  ')).toEqual([])
    idx.entfernen('afm')
    expect(idx.suchen('BATT 1 OFF BUS')).toEqual([])
    expect(idx.anzahlDokumente).toBe(1)
    idx.entfernen('gibt-es-nicht')
    idx.hinzufuegen(afm)
    idx.hinzufuegen(afm) // doppelt hinzufügen ersetzt
    expect(idx.suchen('BATT 1 OFF BUS')).toHaveLength(1)
    expect(idx.anzahlDokumente).toBe(2)
  })
})

describe('Bausteine', () => {
  it('teilt lange Seiten in überlappende Stücke, ohne etwas auszulassen', () => {
    const text = Array.from({ length: 3000 }, (_, i) => String.fromCharCode(65 + (i % 26))).join('')
    const s = stuecke(text)
    expect(s.length).toBe(3)
    expect(s.every((x) => x.length <= CHUNK)).toBe(true)
    // Jedes Stück beginnt mit den letzten UEBERLAPPUNG Zeichen des vorigen.
    expect(s[1].startsWith(s[0].slice(-UEBERLAPPUNG))).toBe(true)
    expect(text.endsWith(s[2])).toBe(true)
    expect(stuecke('kurz')).toEqual(['kurz'])
  })

  it('exakte Schlüssel und Erkennung exakter Anfragen', () => {
    expect(exakteSchluessel('BATT 1 OFF BUS at 155 kias per AMC1 ORA.ATO.230(a)')).toEqual(
      expect.arrayContaining(['BATT', 'OFF', 'BUS', '155 KIAS', 'AMC1 ORA.ATO.230(a)', 'AMC1 ORA.ATO.230']),
    )
    expect(istExakt('BATT 1 OFF BUS')).toBe(true)
    expect(istExakt('155 KIAS')).toBe(true)
    expect(istExakt('FCL.625')).toBe(true)
    expect(istExakt('battery bus')).toBe(false)
    expect(istExakt('BATT')).toBe(false)
  })
})

describe('Grenzfälle der Suche', () => {
  it('lange Seite: Treffer im Überlappungsbereich zählt die Seite nur einmal', () => {
    const idx = new Suchindex()
    const text = 'x '.repeat(CHUNK / 2 - UEBERLAPPUNG / 4) + 'BATT 1 OFF BUS ' + 'y '.repeat(CHUNK)
    idx.hinzufuegen({ id: 'l', titel: 'Lang', pages: [{ index: 1, text }] })
    expect(idx.suchen('BATT 1 OFF BUS')).toHaveLength(1)
  })

  it('gemischte Anfrage: Großbuchstaben ohne wörtliche Phrase fallen auf die Volltextsuche zurück', () => {
    const idx = new Suchindex()
    idx.hinzufuegen({ id: 'a', titel: 'A', pages: [{ index: 1, text: 'The BATT switch controls the battery.' }, { index: 2, text: 'BATT OFF procedure' }] })
    const t = idx.suchen('BATT battery')
    expect(t.map((x) => [x.seite, x.exakt])).toEqual([[1, false]])
  })
})
