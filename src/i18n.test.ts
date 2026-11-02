import { describe, expect, it } from 'vitest'
import de from './i18n/de.json'
import en from './i18n/en.json'
import forms from './i18n/forms.json'

/**
 * Die Sprachregel der App ist mechanisch abgesichert, nicht durch Disziplin:
 * Alles, was auf einem Formular, einem Bericht oder im Behördenexport landet,
 * liegt im Namensraum `forms` — und den gibt es NUR auf Englisch.
 *
 * Diese Tests bewachen genau das. Sie fielen um, sobald
 *  - jemand einen `forms:`-Schlüssel benutzt, den es nicht gibt (im Betrieb
 *    stünde dann der nackte Schlüssel auf einem Nachweisdokument),
 *  - eine deutsche Fassung der Formulartexte auftaucht,
 *  - die Oberflächen-Bundles auseinanderlaufen (ein Schlüssel nur in einer
 *    Sprache heißt: eine der beiden Fassungen zeigt Englisch, wo Deutsch
 *    stehen soll — oder umgekehrt).
 */

type Tree = { [k: string]: string | Tree }

function flatten(o: Tree, p = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : flatten(v, `${p}${k}.`)))
}

const formKeys = new Set(flatten(forms as Tree))
// Quelltext ueber Vite einlesen — kein Node-Dateizugriff noetig, und der
// Glob erfasst automatisch jede neue Datei.
const module = import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
const quellen = Object.entries(module).filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))
const code = quellen.map(([, inhalt]) => inhalt as string)

describe('Namensraum forms — nur Englisch, keine zweite Fassung', () => {
  it('kennt keine deutsche Fassung der Formulartexte', () => {
    // `grading` lag frueher im Uebersetzungs-Bundle und war damit uebersetzbar.
    expect(Object.keys(de)).not.toContain('grading')
    expect(Object.keys(en)).not.toContain('grading')
    expect(formKeys.size).toBeGreaterThan(200)
  })

  it('jeder fest geschriebene forms:-Schluessel existiert', () => {
    const benutzt = new Set<string>()
    for (const s of code) for (const m of s.matchAll(/['"`]forms:([a-zA-Z0-9_.]+)['"`]/g)) benutzt.add(m[1])
    const fehlend = [...benutzt].filter((k) => !formKeys.has(k) && !formKeys.has(`${k}_other`))
    expect(fehlend).toEqual([])
    expect(benutzt.size).toBeGreaterThan(50)
  })

  it('auch die zusammengesetzten Schluessel treffen einen Praefix', () => {
    // Formen wie t(`forms:traffic.${c}`) — geprueft wird, dass es unter dem
    // festen Teil ueberhaupt Schluessel gibt. Ein vertippter Praefix faellt
    // damit auf, auch wenn der variable Teil erst zur Laufzeit feststeht.
    const praefixe = new Set<string>()
    for (const s of code) for (const m of s.matchAll(/`forms:([a-zA-Z0-9_.]*)\$\{/g)) praefixe.add(m[1])
    const leer = [...praefixe].filter((p) => ![...formKeys].some((k) => k.startsWith(p)))
    expect(leer).toEqual([])
  })
})

describe('Oberflaechen-Bundles laufen nicht auseinander', () => {
  it('de und en fuehren dieselben Schluessel', () => {
    const a = flatten(en as Tree).sort()
    const b = flatten(de as Tree).sort()
    expect(b.filter((k) => !a.includes(k))).toEqual([])
    expect(a.filter((k) => !b.includes(k))).toEqual([])
  })
})

describe('Oberflaechen-Schluessel existieren (Audit 11/2026, VERW-13, TXT-02)', () => {
  it("jeder fest geschriebene t('…')-Schluessel steht im App-Bundle", () => {
    // Die Import-Vorschau zeigte als Spaltenkopf „admin.name" — den Schluessel
    // gab es nie. Geprueft wurden bisher nur forms:-Schluessel und die
    // Gleichheit von de und en; ein Schluessel, der in BEIDEN fehlt, fiel
    // durch. DocCheck fuehrt einen eigenen Namensraum und prueft ihn in
    // modules/doccheck/i18n.test.ts; seine Huelle (index.tsx) nutzt bewusst
    // das App-Bundle und gehoert deshalb hierher.
    const bekannt = new Set(flatten(de as Tree))
    const gibt = (k: string) => bekannt.has(k) || bekannt.has(`${k}_one`) || bekannt.has(`${k}_other`)
    const benutzt: string[] = []
    const fehlt: string[] = []
    for (const [pfad, inhalt] of quellen) {
      if (pfad.startsWith('./modules/doccheck/') && pfad !== './modules/doccheck/index.tsx') continue
      // Ohne „:" — Schluessel mit Namensraum (forms:) prueft der Block oben.
      for (const m of (inhalt as string).matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) {
        benutzt.push(m[1])
        if (!gibt(m[1])) fehlt.push(`${pfad}: ${m[1]}`)
      }
    }
    expect(fehlt).toEqual([])
    // Die Suche selbst muss greifen — sonst waere der Waechter still gruen.
    expect(benutzt.length).toBeGreaterThan(300)
    expect(benutzt).toContain('contacts.name')
  })
})

describe('Zaehler mit echter Ein- und Mehrzahl (Audit 11/2026, TXT-08, Teil Verwaltung)', () => {
  function werte(o: Tree, p = ''): [string, string][] {
    return Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : werte(v, `${p}${k}.`)))
  }

  it('kein Wert behilft sich mit „Person(en)" oder „person(s)"', () => {
    // Die Verwaltung meldete „Bei 1 Person(en) nicht ausgeführt" und
    // „Create 1 users". i18next kennt _one/_other — die Klammer ist eine
    // Notloesung, die bei jeder Zahl falsch aussieht. Die Pruefung ueber alle
    // Bundles samt DocCheck und die Paarpflicht folgen mit den Textwachen.
    const klammer = /\p{L}\((?:en|e|n|s|es)\)/u
    const treffer = [...werte(de as Tree), ...werte(en as Tree), ...werte(forms as Tree)]
      .filter(([, v]) => klammer.test(v))
      .map(([k, v]) => `${k}: ${v}`)
    expect(treffer).toEqual([])
  })

  it('die Zaehler der Verwaltung fuehren beide Formen', () => {
    const bekannt = new Set(flatten(de as Tree))
    const zaehler = [
      'admin.import.run',
      'admin.import.created',
      'admin.bulk.confirm',
      'admin.bulk.skippedHidden',
      'admin.bulk.skippedLastAircraft',
      'admin.bulk.skippedViaRole',
      'admin.bulk.skippedLastGroup',
    ]
    for (const k of zaehler) {
      expect(bekannt.has(k), `${k} ohne Mehrzahl`).toBe(false)
      expect(bekannt.has(`${k}_one`) && bekannt.has(`${k}_other`), k).toBe(true)
    }
  })
})
