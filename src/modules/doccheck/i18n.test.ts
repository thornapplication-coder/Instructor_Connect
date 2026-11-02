import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import de from './i18n/de.json'
import en from './i18n/en.json'
import { NAMENSRAUM, registriereDocCheckTexte } from './i18n'

type Baum = { [k: string]: string | Baum }
const flach = (o: Baum, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : flach(v, `${p}${k}.`)))

// Quelltext des Moduls — benutzte Schluessel muessen existieren.
const quellen = import.meta.glob('./**/*.tsx', { query: '?raw', import: 'default', eager: true })
// Alle Module außer Tests — dort entstehen die Fehlercodes.
const logik = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })

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

  it('jeder geworfene Fehlercode hat seinen Text unter fehler, in de und en (Audit 11/2026, DC-16)', () => {
    // Vorher fehlten DC-ZIP-GROSS (Zip-Bombe) und eine eigene Meldung für
    // leere Dateien: Die Karte zeigte „Datei konnte nicht gelesen werden"
    // bzw. „Format nicht erkannt", und niemand erfuhr, warum.
    // Geprüft werden feste Codes in `new Error(…)`; zusammengesetzte
    // (`DC-REQ-${…}`) zeigt der Verbindungstest als Code an.
    const ohneText: Record<string, string> = {
      'DC-ABORTED': 'Abbruch durch den Nutzer — die Karte verschwindet, es gibt nichts zu melden',
      'DC-PROBE': 'absichtlicher Absturz für die Fehlergrenze; die Hülle zeigt den Code (docCheck.errorCode)',
      'DC-NO-BACKEND': 'nur im Verbindungstest des Admin-Reiters, der den Code selbst zeigt (admin.error)',
      'DC-XLSX-STYLES': 'nur beim Rückschreiben; gemeldet mit recheck.rs.fehler',
      'DC-XLSX-SHEET': 'nur beim Rückschreiben; gemeldet mit recheck.rs.fehler',
      'DC-RECHECK-FORMAT': 'nur beim Laden einer Fremdliste; gemeldet mit recheck.format (mit Dateiname)',
    }
    const geworfen = new Set<string>()
    for (const code of Object.values(logik) as string[])
      for (const [, args] of code.matchAll(/new Error\(([^)]*)\)/g)) for (const [, c] of args.matchAll(/['"`](DC-[A-Z][A-Z0-9-]*)['"`]/g)) geworfen.add(c)
    // Die Suche selbst muss greifen — sonst wäre der Wächter still grün.
    expect(geworfen).toContain('DC-ZIP-GROSS')
    expect(geworfen).toContain('DC-PDF-PASSWORD')
    const fehlt = [...geworfen].filter((c) => !(c in ohneText)).flatMap((c) => (['de', 'en'] as const).filter((l) => !({ de, en }[l].fehler as Record<string, string>)[c]).map((l) => `${l}: fehler.${c}`))
    expect(fehlt).toEqual([])
    // Keine Ausnahme für einen Code, den es nicht mehr gibt
    expect(Object.keys(ohneText).filter((c) => !geworfen.has(c))).toEqual([])
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
