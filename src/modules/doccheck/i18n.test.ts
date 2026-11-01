import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import de from './i18n/de.json'
import en from './i18n/en.json'
import { NAMENSRAUM, registriereDocCheckTexte } from './i18n'

type Baum = { [k: string]: string | Baum }
const flach = (o: Baum, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : flach(v, `${p}${k}.`)))

// Quelltext des Moduls — benutzte Schluessel muessen existieren.
const quellen = import.meta.glob('./**/*.tsx', { query: '?raw', import: 'default', eager: true })

describe('DocCheck-Texte', () => {
  it('de und en fuehren dieselben Schluessel', () => {
    expect(flach(de as Baum).sort()).toEqual(flach(en as Baum).sort())
  })

  it('kein leerer Text', () => {
    for (const b of [de, en]) {
      const leer = flach(b as Baum).filter((k) => !k.split('.').reduce<unknown>((o, s) => (o as Baum)[s], b))
      expect(leer).toEqual([])
    }
  })

  it("jeder statisch benutzte t('…')-Schluessel einer Modul-Ansicht existiert", () => {
    const bekannt = new Set(flach(en as Baum))
    const fehlt: string[] = []
    for (const [pfad, code] of Object.entries(quellen)) {
      // index.tsx ist die Huelle und nutzt bewusst das App-Bundle.
      if (pfad.endsWith('/index.tsx') || pfad.endsWith('.test.tsx')) continue
      // Pluralformen (i18next): „x_one"/„x_other" erfüllen den Schlüssel „x".
      for (const m of (code as string).matchAll(/\bt\('([a-zA-Z.]+)'/g)) if (!bekannt.has(m[1]) && !bekannt.has(`${m[1]}_other`)) fehlt.push(`${pfad}: ${m[1]}`)
    }
    expect(fehlt).toEqual([])
  })

  it('traegt den Namensraum genau einmal ein, in beiden Sprachen', async () => {
    const i = createInstance()
    await i.init({ lng: 'de', resources: {} })
    expect(registriereDocCheckTexte(i)).toBe(true)
    expect(registriereDocCheckTexte(i)).toBe(false)
    expect(i.getFixedT('de', NAMENSRAUM)('tabs.pruefung')).toBe('Prüfung')
    expect(i.getFixedT('en', NAMENSRAUM)('tabs.pruefung')).toBe('Review')
  })
})
