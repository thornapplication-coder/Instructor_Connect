import { describe, expect, it } from 'vitest'
import { byRecent, groupNotes, notePreview, OTHERS, PINNED, searchNotes } from './notes'
import type { Note } from './types'

/**
 * Notizen sind die persoenliche Merkliste. Getestet wird vor allem, WAS in
 * welcher Gruppe landet und in welcher Reihenfolge — daran haengt, ob man
 * die eine Notiz wiederfindet, die man gerade braucht.
 */

const n = (over: Partial<Note> & { id: string }): Note => ({
  authorId: 'u1',
  title: 'Titel',
  body: '',
  pinned: false,
  createdAt: Date.UTC(2026, 7, 1),
  updatedAt: Date.UTC(2026, 7, 1),
  ...over,
})

describe('Reihenfolge', () => {
  it('sortiert nach der letzten AENDERUNG, nicht nach dem Anlegen', () => {
    // Wer eine alte Notiz ergaenzt, hat sie gerade wieder gebraucht — sie
    // gehoert nach oben, nicht dorthin zurueck, wo sie im Mai entstand.
    const alt = n({ id: 'a', createdAt: Date.UTC(2026, 4, 1), updatedAt: Date.UTC(2026, 7, 9) })
    const neu = n({ id: 'b', createdAt: Date.UTC(2026, 7, 8), updatedAt: Date.UTC(2026, 7, 8) })
    expect([neu, alt].sort(byRecent).map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('Suche', () => {
  const liste = [
    n({ id: 'a', title: 'Engine-out wiederholen', body: 'PRO bleibt schwach' }),
    n({ id: 'b', title: 'IOS-Touchscreen', body: 'Neustart hilft' }),
  ]

  it('findet ueber den Titel', () => {
    expect(searchNotes(liste, 'engine').map((x) => x.id)).toEqual(['a'])
  })

  it('findet auch im Text, nicht nur im Titel', () => {
    expect(searchNotes(liste, 'neustart').map((x) => x.id)).toEqual(['b'])
  })

  it('ignoriert Gross- und Kleinschreibung und Leerraum', () => {
    expect(searchNotes(liste, '  PRO ').map((x) => x.id)).toEqual(['a'])
  })

  it('liefert bei leerer Suche alles', () => {
    expect(searchNotes(liste, '   ')).toHaveLength(2)
  })
})

describe('Gruppen', () => {
  it('stellt Angeheftetes ganz nach oben — in eine eigene Gruppe', () => {
    const g = groupNotes([n({ id: 'a' }), n({ id: 'p', pinned: true })])
    expect(g.map((x) => x.key)).toEqual([PINNED, OTHERS])
    expect(g[0].notes.map((x) => x.id)).toEqual(['p'])
    expect(g[1].notes.map((x) => x.id)).toEqual(['a'])
  })

  /**
   * Sonst stuende dieselbe Notiz zweimal in derselben Liste, und beim
   * Loeschen wuesste man nicht, welche man erwischt.
   */
  it('zeigt eine angeheftete Notiz NICHT zusaetzlich weiter unten', () => {
    const g = groupNotes([n({ id: 'p', pinned: true })])
    expect(g).toHaveLength(1)
    expect(g[0].key).toBe(PINNED)
  })

  it('laesst die Gruppe „Angeheftet" weg, solange nichts angeheftet ist', () => {
    expect(groupNotes([n({ id: 'a' })]).map((x) => x.key)).toEqual([OTHERS])
  })

  it('sortiert auch innerhalb einer Gruppe nach der letzten Aenderung', () => {
    const g = groupNotes([
      n({ id: 'alt', updatedAt: Date.UTC(2026, 7, 1) }),
      n({ id: 'neu', updatedAt: Date.UTC(2026, 7, 9) }),
    ])
    expect(g[0].notes.map((x) => x.id)).toEqual(['neu', 'alt'])
  })

  it('sortiert auch die angehefteten untereinander nach der letzten Aenderung', () => {
    const g = groupNotes([
      n({ id: 'p1', pinned: true, updatedAt: Date.UTC(2026, 7, 1) }),
      n({ id: 'p2', pinned: true, updatedAt: Date.UTC(2026, 7, 9) }),
    ])
    expect(g[0].notes.map((x) => x.id)).toEqual(['p2', 'p1'])
  })

  it('gibt bei leerer Liste keine Gruppen zurueck', () => {
    expect(groupNotes([])).toEqual([])
  })
})

describe('Kurzfassung fuer die Liste', () => {
  it('laesst kurze Texte unveraendert', () => {
    expect(notePreview('Kurz und gut')).toBe('Kurz und gut')
  })

  it('macht aus Zeilenumbruechen eine Zeile', () => {
    // Ein Text, der mit einer Aufzaehlung beginnt, sah in der Liste sonst
    // aus wie eine leere Notiz.
    expect(notePreview('\n\n- erstens\n- zweitens')).toBe('- erstens - zweitens')
  })

  it('kuerzt an der Wortgrenze, nicht mitten im Wort', () => {
    const text = 'Alpha Bravo Charlie Delta Echo Foxtrot'
    const kurz = notePreview(text, 20)
    expect(kurz.endsWith('…')).toBe(true)
    expect(text).toContain(kurz.slice(0, -1))
    expect(kurz.slice(0, -1).trim().split(' ').pop()).not.toBe('Cha')
  })

  it('schneidet hart, wenn ein einzelnes Wort laenger ist als die Grenze', () => {
    expect(notePreview('Donaudampfschifffahrtsgesellschaftskapitaen', 10)).toBe('Donaudampf…')
  })
})
