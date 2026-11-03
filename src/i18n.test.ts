import { describe, expect, it } from 'vitest'
import de from './i18n/de.json'
import en from './i18n/en.json'
import forms from './i18n/forms.json'
import i18n from './i18n/index'

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

describe('Grading-Texte (Audit 11/2026, GRD-20)', () => {
  it('die Zaehler des Grading-Bereichs fuehren beide Formen', () => {
    // „Exports exactly the 1 rows the current filters show." — der Schluessel
    // hatte nur die Grundform. Die Grundform als Einzahl neben _other ginge
    // in i18next zwar auch, die Paarpflicht der Textwachen verlangt aber
    // _one/_other; deshalb hier schon einheitlich.
    const zaehler = [
      'openItems',
      'admin.exportListHint',
      'admin.sessionCount',
      'admin.sessionsCount',
      'admin.recurringWeakCount',
      'admin.otherSetOmitted',
    ]
    for (const k of zaehler) {
      expect(formKeys.has(k), `${k} ohne Mehrzahl`).toBe(false)
      expect(formKeys.has(`${k}_one`) && formKeys.has(`${k}_other`), k).toBe(true)
    }
  })

  it('i18next waehlt die Form auch bei deutscher Oberflaeche richtig', () => {
    // forms gibt es nur auf Englisch; bei „de" kommt der Text aus dem
    // Rueckfall. Die Mehrzahlregel stammt dabei aus „de" — beide Sprachen
    // kennen nur one/other, das Ergebnis muss dasselbe sein.
    for (const lng of ['de', 'en']) {
      const t = i18n.getFixedT(lng, 'forms')
      expect(t('admin.exportListHint', { count: 1 })).toBe('Exports exactly the 1 row the current filters show.')
      expect(t('admin.exportListHint', { count: 3 })).toBe('Exports exactly the 3 rows the current filters show.')
      expect(t('admin.sessionsCount', { count: 1 })).toBe('1 session')
      expect(t('admin.recurringWeakCount', { count: 2 })).toBe('2 recurring weaknesses')
    }
  })

  it('der Aufbewahrungshinweis beschreibt die Regel des Stores', () => {
    // Stand: „one week after creation". Der Store (visibleGradingRecords)
    // rechnet ab dem Erledigen — jüngste Unterschrift der Formularfamilie —
    // und laesst Offenes ohne Frist stehen. Wer die Regel dort aendert,
    // aendert diesen Satz mit.
    const hinweis = (forms as Tree).retentionHint as string
    expect(hinweis).not.toMatch(/creation/i)
    expect(hinweis).toMatch(/one week after completion/)
    expect(hinweis).toMatch(/open ones stay until they are done/)
  })

  it('der Platzhalter der Auswahllisten steht im Namensraum forms', () => {
    // UID-18: „Hinzufügen …" kam aus dem Oberflaechen-Bundle und stand bei
    // deutscher Oberflaeche im sonst englischen Grading-Bereich.
    expect(i18n.getFixedT('de', 'forms')('admin.addValue')).toBe('Add …')
    const editor = quellen.find(([pfad]) => pfad === './pages/admin/FieldOptionsEditor.tsx')?.[1] as string
    expect(editor).toContain("t('forms:admin.addValue')")
    expect(editor).not.toMatch(/t\('admin\./)
    // Die Verteilerlisten der Konfiguration nutzen die gemeinsame ChipListe —
    // jede davon mit den englischen Texten.
    const admin = quellen.find(([pfad]) => pfad === './pages/admin/GradingAdmin.tsx')?.[1] as string
    const listen = admin.match(/<ChipListe\b[\s\S]*?\/>/g) ?? []
    expect(listen.length).toBe(3)
    expect(listen.filter((l) => !/\bformularTexte\b/.test(l))).toEqual([])
  })
})
