import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import de from './i18n/de.json'
import en from './i18n/en.json'
import { NAMENSRAUM, registriereDocCheckTexte } from './i18n'
import { SPALTEN } from './referenz/liste'

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

  it('jede Spaltenrolle der Referenzlisten hat ihre Beschriftung (Spaltenwahl, Audit 11/2026, DC-13)', () => {
    // Die Ansicht setzt den Schlüssel zusammen — die statische Suche oben sieht ihn nicht
    const rollen = [...new Set(Object.values(SPALTEN).flatMap((r) => Object.keys(r)))]
    for (const b of [de, en]) expect(Object.keys((b.referenz as Baum).rollen as Baum).sort()).toEqual(rollen.sort())
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

  it('Ein- und Mehrzahl stimmen auch bei der ZWEITEN Zahl eines Satzes (Audit 11/2026, TXT-08)', async () => {
    // Gewählt wurde nach der Zahl der Dokumente — bei einem Befund stand
    // „1 Prüfdokument geprüft: 1 Befunde", im Export „Prüfdokument(en)"
    const i = createInstance()
    await i.init({ lng: 'de', resources: {} })
    registriereDocCheckTexte(i)
    const de_ = i.getFixedT('de', NAMENSRAUM)
    const en_ = i.getFixedT('en', NAMENSRAUM)
    const stand = (t: typeof de_, dok: number, bef: number) => t('pruefung.regel.stand', { count: dok, befundeText: t('pruefungKurz.befunde', { count: bef }), hoch: 0 })
    expect(stand(de_, 1, 1)).toBe('1 Prüfdokument geprüft: 1 Befund, davon 0 hoch.')
    expect(stand(de_, 2, 5)).toBe('2 Prüfdokumente geprüft: 5 Befunde, davon 0 hoch.')
    expect(stand(en_, 1, 1)).toBe('1 document under review checked: 1 finding, 0 high.')
    const exp = (t: typeof de_, bef: number, dok: number) => t('export.stand', { count: bef, dokumenteText: t('export.dokumente', { count: dok }) })
    expect(exp(de_, 5, 1)).toMatch(/^5 Befunde aus 1 Prüfdokument – /)
    expect(exp(de_, 1, 3)).toMatch(/^1 Befund aus 3 Prüfdokumenten – /)
    expect(exp(en_, 1, 2)).toMatch(/^1 finding from 2 documents under review – /)
    // Ein einzelner neuer Befund hieß „Nummern F-013 bis F-013"
    expect(de_('recheck.rs.neuNummern', { count: 1, von: 'F-013', bis: 'F-013' })).toMatch(/^Nummer F-013, /)
    expect(en_('recheck.rs.neuNummern', { count: 2, von: 'F-013', bis: 'F-014' })).toMatch(/^Numbers F-013 to F-014, /)
  })

  it('keine Notbehelfe für die Mehrzahl und keine Sie-Anrede in den DocCheck-Texten (Audit 11/2026, TXT-08/TXT-09)', () => {
    const werte = (b: Baum, p = ''): [string, string][] => Object.entries(b).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : werte(v, `${p}${k}.`)))
    for (const b of [de, en]) {
      expect(werte(b as Baum).filter(([, v]) => /\((en|s|n)\)/.test(v))).toEqual([])
      // {{count}} nur in Schlüsseln mit Pluralform — sonst „1 Befunde"
      expect(werte(b as Baum).filter(([k, v]) => v.includes('{{count}}') && !/_(one|other)$/.test(k))).toEqual([])
    }
    // Die App duzt; einzige Anrede war „Laden Sie das Paket …"
    expect(werte(de as Baum).filter(([, v]) => /\b\p{Lu}\p{Ll}+en Sie\b/u.test(v))).toEqual([])
  })

  it('ein Name je Sache: Reiter und mobiles Segment gleich, „Re-check" nur für Fremdlisten (Audit 11/2026, TXT-10/TXT-11)', () => {
    for (const b of [de, en]) {
      expect(b.tabs.findings).toBe(b.mobile.befunde)
      expect(b.tabs.recheck).toBe(b.mobile.recheck)
    }
    // Revisionsempfehlungen standen im Englischen als „Re-checks" direkt neben dem Re-Check der Fremdlisten
    for (const v of [en.mobile.nachpruefungen, en.mobile.startOnDesktop, en.rev.empfehlungen]) expect(v).not.toMatch(/re-?check/i)
    // Knopf als Handlung, nicht als Zustand (DC-16); deutsche Oberfläche deutsch (TXT-10)
    expect(de.verwalten.bestaetigen).toBe('Stand bestätigen')
    expect(de.paket.uebersicht).not.toBe(en.paket.uebersicht)
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
