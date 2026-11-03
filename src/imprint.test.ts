import { describe, expect, it } from 'vitest'
import { parseImprint } from './imprint'
import { IMPRINT_DE, IMPRINT_EN } from './sandbox/imprintDefaults'

/**
 * Zerlegen des Impressumstextes (Audit 11/2026, TEC-18: lag ohne Test in
 * src/pages/Imprint.tsx). Was der Superadmin eintippt, steht auf der
 * öffentlichen Seite — verschluckter Text fiele niemandem auf.
 */
describe('parseImprint', () => {
  it('Einleitung, Abschnitte mit Überschrift, Absätze und Aufzählungen', () => {
    const text = ['Vorweg.', '', '# 1. Betreiber', 'Absatz eins.', 'Absatz zwei.', '', '- Punkt A', '- Punkt B', 'Danach.', '', '# 2. Zweck', '- Allein'].join('\n')
    expect(parseImprint(text)).toEqual([
      { title: null, blocks: [{ type: 'p', text: 'Vorweg.' }] },
      {
        title: '1. Betreiber',
        blocks: [
          { type: 'p', text: 'Absatz eins.' },
          { type: 'p', text: 'Absatz zwei.' },
          { type: 'ul', items: ['Punkt A', 'Punkt B'] },
          { type: 'p', text: 'Danach.' },
        ],
      },
      { title: '2. Zweck', blocks: [{ type: 'ul', items: ['Allein'] }] },
    ])
  })

  it('eine Leerzeile trennt keine Aufzählung, ein Absatz dazwischen schon', () => {
    expect(parseImprint('# A\n- eins\n\n- zwei\nText\n- drei')[0].blocks).toEqual([
      { type: 'ul', items: ['eins', 'zwei'] },
      { type: 'p', text: 'Text' },
      { type: 'ul', items: ['drei'] },
    ])
  })

  it('ohne Einleitung kein leerer Abschnitt; Leerraum am Rand zählt nicht', () => {
    const teile = parseImprint('\n  # Titel  \n   Text mit Rand   \n')
    expect(teile).toEqual([{ title: 'Titel', blocks: [{ type: 'p', text: 'Text mit Rand' }] }])
  })

  it('leerer Text ergibt nichts; ein „#" ohne Leerzeichen ist Text, keine Überschrift', () => {
    expect(parseImprint('')).toEqual([])
    expect(parseImprint('#hashtag')).toEqual([{ title: null, blocks: [{ type: 'p', text: '#hashtag' }] }])
  })

  it('eine Überschrift ohne Inhalt bleibt stehen', () => {
    expect(parseImprint('# Leer\n# Voll\nText')).toEqual([
      { title: 'Leer', blocks: [] },
      { title: 'Voll', blocks: [{ type: 'p', text: 'Text' }] },
    ])
  })

  it('die Vorgaben verlieren beim Zerlegen keine Zeile', () => {
    for (const vorgabe of [IMPRINT_DE, IMPRINT_EN]) {
      const teile = parseImprint(vorgabe)
      const gezaehlt = teile.reduce(
        (n, s) => n + (s.title === null ? 0 : 1) + s.blocks.reduce((m, b) => m + (b.type === 'p' ? 1 : b.items.length), 0),
        0,
      )
      expect(gezaehlt).toBe(vorgabe.split('\n').filter((z) => z.trim()).length)
      expect(teile.length).toBeGreaterThan(5)
    }
  })
})
