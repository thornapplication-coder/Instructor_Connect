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
const code = Object.entries(module)
  .filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))
  .map(([, inhalt]) => inhalt as string)

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
