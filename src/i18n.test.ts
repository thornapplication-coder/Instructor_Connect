import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import de from './i18n/de.json'
import en from './i18n/en.json'
import forms from './i18n/forms.json'
import i18n from './i18n/index'
import dcDe from './modules/doccheck/i18n/de.json'
import dcEn from './modules/doccheck/i18n/en.json'
import { IMPRINT_DE, IMPRINT_EN } from './sandbox/imprintDefaults'

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

/**
 * Audit 11/2026, MOB-10: Am Telefon brach im Logbuch „Debriefing" von
 * „00:30" ab — die Zeile kommt aus `logbook.parts`, und dort standen
 * normale Leerzeichen zwischen Bezeichnung und Wert. Ein geschuetztes
 * Leerzeichen (U+00A0) haelt jedes Paar zusammen; umbrochen wird an den
 * Trennpunkten.
 */
describe('Logbuch-Zeitzeile haelt Bezeichnung und Wert zusammen (MOB-10)', () => {
  it.each([
    ['de', de],
    ['en', en],
  ])('%s: Briefing, Session und Debriefing mit geschuetztem Leerzeichen', (_, bundle) => {
    const parts = ((bundle as Tree).logbook as Tree).parts as string
    for (const paar of ['Briefing\u00a0{{briefing}}', 'Session\u00a0{{session}}', 'Debriefing\u00a0{{debriefing}}']) expect(parts).toContain(paar)
    // Kein normales Leerzeichen zwischen einer Bezeichnung und ihrem Wert
    expect(parts).not.toMatch(/[A-Za-z] \{\{/)
  })
})

/**
 * Englische Formulartexte tragen ihre Sprache (Audit 11/2026, A11Y-12,
 * WCAG 3.1.2). Dass die Formulare immer englisch sind, ist entschieden; dass
 * die Seite dabei `lang="de"` meldete, nicht — die Sprachausgabe las
 * „Competent" und „Overall Result" mit deutscher Aussprache.
 *
 * Mechanisch: Jede Ansicht mit `forms:`-Texten zeichnet sich selbst als
 * englisch aus (jede `Page` und `TopBar` darin mit `lang="en"`) oder wird nur
 * innerhalb einer solchen Ansicht gezeigt und erbt die Sprache. Dialoge
 * (`Modal`) hängen am <body> und erben nichts — sie geben sie selbst an.
 */
describe('Formularansichten sind als englisch ausgezeichnet (A11Y-12)', () => {
  type Element = { name: string; attribute: Map<string, string | true> }
  function jsxElemente(code: string, datei: string): Element[] {
    const quelle = ts.createSourceFile(datei, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const out: Element[] = []
    const besuchen = (n: ts.Node): void => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const attribute = new Map<string, string | true>()
        for (const a of n.attributes.properties) {
          if (ts.isJsxAttribute(a)) attribute.set(a.name.getText(quelle), a.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : true)
        }
        out.push({ name: n.tagName.getText(quelle), attribute })
      }
      ts.forEachChild(n, besuchen)
    }
    besuchen(quelle)
    return out
  }

  const ansichten = quellen
    .filter(([pfad]) => pfad.endsWith('.tsx'))
    .map(([pfad, inhalt]) => ({ pfad: pfad.replace('./', ''), code: inhalt as string, elemente: jsxElemente(inhalt as string, pfad) }))
  const mitFormularText = ansichten.filter((a) => /['"`]forms:/.test(a.code))
  const traegtEn = (a: (typeof ansichten)[number]) => a.elemente.some((e) => e.attribute.get('lang') === 'en')

  /**
   * Ansichten ohne eigenes `lang`, weil sie nur eingebettet vorkommen —
   * jede mit der Komponente, an der das hängt. `nurMit`: Formulartext nur
   * bei diesem Schalter (die ChipListe ist sonst Oberfläche).
   */
  const EINGEBETTET: Record<string, { komponente: string; nurMit?: string; grund: string }> = {
    'pages/admin/MonthlyReport.tsx': { komponente: 'MonthlyReport', grund: 'Reiter im Grading Tool und im Grading-Bereich des Admin-Panels' },
    'pages/admin/StandardisationReport.tsx': { komponente: 'StandardisationReport', grund: 'Bereich der Grading-Ablage im Admin-Panel' },
    'pages/admin/TraineeHistory.tsx': { komponente: 'TraineeHistory', grund: 'Reiter im Grading Tool und im Grading-Bereich des Admin-Panels' },
    'pages/admin/AuswertungsFilter.tsx': { komponente: 'AuswertungsFilter', grund: 'Filterzeile der Statistik und des Standardisierungsberichts' },
    'pages/admin/FieldOptionsEditor.tsx': { komponente: 'FieldOptionsEditor', grund: 'Formulartyp-Editor der Grading-Konfiguration' },
    'components/SignaturePad.tsx': { komponente: 'SignaturePad', grund: 'Unterschriftsfeld im Formular und in der Formularansicht; die Vollbildfläche liegt im Baum, nicht im Portal' },
    'components/ui.tsx': { komponente: 'ChipListe', nurMit: 'formularTexte', grund: 'englische Listentexte nur mit formularTexte (Verteiler der Grading-Konfiguration)' },
  }

  function istEnglisch(pfad: string, besucht = new Set<string>()): boolean {
    const a = ansichten.find((x) => x.pfad === pfad)
    if (!a) return false
    if (traegtEn(a)) return true
    const eintrag = EINGEBETTET[pfad]
    if (!eintrag || besucht.has(pfad)) return false
    besucht.add(pfad)
    const einbetter = ansichten.filter(
      (x) => x.pfad !== pfad && x.elemente.some((e) => e.name === eintrag.komponente && (!eintrag.nurMit || e.attribute.has(eintrag.nurMit))),
    )
    return einbetter.length > 0 && einbetter.every((x) => istEnglisch(x.pfad, besucht))
  }

  it('findet die Formularansichten überhaupt (sonst prüfte der Test ins Leere)', () => {
    const pfade = mitFormularText.map((a) => a.pfad)
    for (const p of ['pages/Grading.tsx', 'pages/GradingForm.tsx', 'pages/GradingView.tsx', 'pages/admin/GradingAdmin.tsx']) expect(pfade).toContain(p)
  })

  it('jede Ansicht mit forms:-Texten ist englisch ausgezeichnet — selbst oder über ihre Einbettung', () => {
    const ohne = mitFormularText.filter((a) => !istEnglisch(a.pfad)).map((a) => a.pfad)
    expect(ohne).toEqual([])
  })

  it('Seitenrahmen und Kopfleiste der Formularseiten tragen lang="en"', () => {
    const fehlt: string[] = []
    for (const a of mitFormularText.filter(traegtEn)) {
      for (const e of a.elemente) {
        if ((e.name === 'Page' || e.name === 'TopBar') && e.attribute.get('lang') !== 'en') fehlt.push(`${a.pfad}: <${e.name}>`)
      }
    }
    expect(fehlt).toEqual([])
  })

  it('Dialoge in Formularansichten geben ihre Sprache selbst an (Portal, keine Vererbung)', () => {
    const fehlt = mitFormularText
      .filter((a) => istEnglisch(a.pfad))
      .flatMap((a) => a.elemente.filter((e) => e.name === 'Modal' && e.attribute.get('lang') !== 'en').map(() => a.pfad))
    expect(fehlt).toEqual([])
  })

  it('keine Ausnahme ohne Datei oder ohne Formulartext', () => {
    // Eine Ausnahme für eine Ansicht, die es nicht mehr gibt oder die keinen
    // Formulartext mehr zeigt, ist eine Freigabe, die niemand mehr liest.
    const pfade = new Set(mitFormularText.map((a) => a.pfad))
    expect(Object.keys(EINGEBETTET).filter((p) => !pfade.has(p))).toEqual([])
  })
})

/**
 * Abschließende Textwachen über den GANZEN Bestand (Audit 11/2026, TXT-08,
 * TXT-09, TXT-13, GRD-20): App-Oberfläche (de/en), Formulartexte (forms),
 * DocCheck (de/en) und das Impressum ab Werk. Bisher prüfte jedes Paket
 * seine eigenen Schlüssel — was dazwischen lag, fand nur ein Leser:
 * „1 Befunde", „Create 1 users", „Laden Sie …", „„Urgent"".
 */
describe('Textwachen über alle Bundles (Audit 11/2026, TXT-08/09/13, GRD-20)', () => {
  type Familie = 'app' | 'forms' | 'doccheck'
  type Buendel = { name: string; familie: Familie; sprache: 'de' | 'en'; werte: [string, string][] }
  function werte(o: Tree, p = ''): [string, string][] {
    return Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : werte(v, `${p}${k}.`)))
  }
  const BUENDEL: Buendel[] = [
    { name: 'de', familie: 'app', sprache: 'de', werte: werte(de as Tree) },
    { name: 'en', familie: 'app', sprache: 'en', werte: werte(en as Tree) },
    { name: 'forms', familie: 'forms', sprache: 'en', werte: werte(forms as Tree) },
    { name: 'doccheck/de', familie: 'doccheck', sprache: 'de', werte: werte(dcDe as Tree) },
    { name: 'doccheck/en', familie: 'doccheck', sprache: 'en', werte: werte(dcEn as Tree) },
  ]
  /** Das Impressum ab Werk steht auf der öffentlichen Seite — es gilt dasselbe. */
  const IMPRESSUM: Buendel[] = [
    { name: 'impressum/de', familie: 'app', sprache: 'de', werte: [['IMPRINT_DE', IMPRINT_DE]] },
    { name: 'impressum/en', familie: 'app', sprache: 'en', werte: [['IMPRINT_EN', IMPRINT_EN]] },
  ]
  const alle = [...BUENDEL, ...IMPRESSUM]
  const MEHRZAHL = /_(zero|one|two|few|many|other)$/

  it('findet die Bundles (sonst prüfte jede Wache ins Leere)', () => {
    for (const b of BUENDEL) expect(b.werte.length, b.name).toBeGreaterThan(100)
  })

  /**
   * Kein Schlüssel doppelt in einem Objekt. JSON.parse nimmt still den
   * letzten — „chatInfo.members" stand als Grundform UND als _one/_other im
   * selben Block, und wer die Grundform verbesserte, änderte einen Text, den
   * nie jemand sah. Gelesen wird deshalb der Rohtext (die Bundles sind mit
   * einem Schlüssel je Zeile formatiert).
   */
  const rohBundles = import.meta.glob(['./i18n/*.json', './modules/doccheck/i18n/*.json', './modules/doccheck/export/labels.en.json'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  function doppelteSchluessel(roh: string): string[] {
    const stapel: Set<string>[] = [new Set()]
    const doppelt: string[] = []
    roh.split('\n').forEach((zeile, i) => {
      const m = zeile.match(/^\s*"((?:[^"\\]|\\.)+)"\s*:\s*(\{)?/)
      if (m) {
        if (stapel[stapel.length - 1].has(m[1])) doppelt.push(`Zeile ${i + 1}: ${m[1]}`)
        stapel[stapel.length - 1].add(m[1])
        if (m[2] && !/\}\s*,?\s*$/.test(zeile)) stapel.push(new Set())
      } else if (/^\s*\}\s*,?\s*$/.test(zeile)) stapel.pop()
    })
    return doppelt
  }

  it('kein Schlüssel doppelt in einem Objekt', () => {
    expect(Object.keys(rohBundles).length).toBeGreaterThanOrEqual(5)
    const doppelt = Object.entries(rohBundles).flatMap(([pfad, roh]) => doppelteSchluessel(roh as string).map((d) => `${pfad} ${d}`))
    expect(doppelt).toEqual([])
    // Gegenprobe: dieselbe Ebene doppelt wird gefunden, Geschwisterobjekte nicht.
    expect(doppelteSchluessel('{\n  "a": {\n    "x": "1",\n    "x": "2"\n  },\n  "b": {\n    "x": "3"\n  }\n}')).toEqual(['Zeile 4: x'])
  })

  /**
   * (1) Paarpflicht. Ein Wert mit {{count}}, nach dem ein Wort folgt, das
   * sich nach der Zahl richtet („{{count}} Mitglieder"), steht als
   * _one/_other. Steht die Zahl allein — „Einträge ({{count}})",
   * „{{count}}× not competent", „Hidden by {{count}}" —, richtet sich nichts
   * nach ihr. Ausnahmen nur mit Grund.
   */
  const OHNE_PAAR: Record<string, string> = {
    'forms:followUp306PerPilot': 'nur bei mehr als einem Piloten gezeigt (anzahl306 > 1, GradingForm)',
    'forms:followUp306Optional': 'nur bei mehr als einem Piloten gezeigt (anzahl306 > 1, GradingForm)',
    'forms:followUp310PerPilot': 'nur bei mehr als einem Piloten gezeigt (trainees.length > 1, GradingForm)',
  }
  const zahlVorWort = /\{\{\s*count\s*\}\}[\s ]*\p{L}/u

  it('{{count}} vor einem Wort nur in _one/_other-Paaren', () => {
    const fehlt: string[] = []
    for (const b of BUENDEL) {
      const schluessel = new Set(b.werte.map(([k]) => k))
      for (const [k, v] of b.werte) {
        if (!zahlVorWort.test(v) || `${b.familie}:${k}` in OHNE_PAAR) continue
        const basis = k.replace(MEHRZAHL, '')
        if (basis === k || !schluessel.has(`${basis}_one`) || !schluessel.has(`${basis}_other`)) fehlt.push(`${b.name}: ${k} — ${v.slice(0, 60)}`)
      }
    }
    expect(fehlt).toEqual([])
  })

  it('jede Mehrzahlform hat ihre Gegenform (_one ↔ _other)', () => {
    const fehlt: string[] = []
    for (const b of BUENDEL) {
      const schluessel = new Set(b.werte.map(([k]) => k))
      for (const [k] of b.werte) {
        if (!MEHRZAHL.test(k)) continue
        const basis = k.replace(MEHRZAHL, '')
        for (const form of ['_one', '_other']) if (!schluessel.has(basis + form)) fehlt.push(`${b.name}: ${basis + form}`)
      }
    }
    expect([...new Set(fehlt)]).toEqual([])
  })

  it('keine verwaiste Ausnahme der Paarpflicht', () => {
    const da = new Set(BUENDEL.flatMap((b) => b.werte.filter(([, v]) => zahlVorWort.test(v)).map(([k]) => `${b.familie}:${k}`)))
    expect(Object.keys(OHNE_PAAR).filter((k) => !da.has(k))).toEqual([])
  })

  /**
   * Zahl vor einer Mehrzahl, aber nicht über {{count}}: „Texterkennung:
   * {{fertig}} von {{gesamt}} Seiten" — bei einer Seite „1 von 1 Seiten".
   * Welcher Platzhalter eine Zahl ist, steht nirgends; erkannt wird deshalb
   * ein Platzhalter direkt vor einem Wort, das es in diesen Texten nur in der
   * Mehrzahl gibt. Die Liste ist eine Heuristik — wer ein neues Zählwort
   * einführt, nimmt es auf.
   */
  const MEHRZAHLWOERTER = new Set(
    (
      'Seiten Einträge Einträgen Notizen Zeilen Verweise Befunde Dokumente Prüfdokumente Formulare Nachrichten Mitglieder Gruppen ' +
      'Personen Stimmen Tage Monate Stunden Minuten Dateien Punkte Tokens Sessions Noten ' +
      'pages entries notes rows references findings documents forms messages members groups people persons votes days months ' +
      'hours minutes files items users sessions tokens grades'
    ).split(' '),
  )
  /** Platzhalter, die keine Zahl tragen oder deren Wert nie 1 ist. */
  const ZAHL_OHNE_COUNT: Record<string, string> = {
    'forms:std.footnote': 'MIN_GRADES und MIN_SESSIONS sind Konstanten größer 1 (StandardisationReport)',
  }

  it('eine Zahl vor einer Mehrzahl steht in {{count}} (sonst „1 von 1 Seiten")', () => {
    const treffer: string[] = []
    for (const b of alle) {
      for (const [k, v] of b.werte) {
        if (`${b.familie}:${k}` in ZAHL_OHNE_COUNT) continue
        for (const m of v.matchAll(/\{\{\s*(\w+)[^}]*\}\}[\s ]+(\p{L}+)/gu)) {
          if (m[1] !== 'count' && MEHRZAHLWOERTER.has(m[2])) treffer.push(`${b.name}: ${k} — {{${m[1]}}} ${m[2]}`)
        }
      }
    }
    expect(treffer).toEqual([])
  })

  it('keine verwaiste Ausnahme der Zahl-vor-Mehrzahl-Regel', () => {
    const da = new Set(BUENDEL.flatMap((b) => b.werte.map(([k]) => `${b.familie}:${k}`)))
    expect(Object.keys(ZAHL_OHNE_COUNT).filter((k) => !da.has(k))).toEqual([])
  })

  it('i18next wählt die Formen wie erwartet — auch die Nullform', () => {
    const tDe = i18n.getFixedT('de')
    const tEn = i18n.getFixedT('en')
    expect(tDe('chatInfo.members', { count: 1 })).toBe('1 Mitglied')
    expect(tEn('chatInfo.members', { count: 4 })).toBe('4 members')
    expect(tDe('logbook.resultCount', { shown: 0, count: 1 })).toBe('0 von 1 Eintrag sichtbar')
    expect(tDe('chatInfo.deleteGroupConfirm', { name: 'Ground', count: 0 })).toMatch(/keine Nachrichten/)
    expect(tEn('chatInfo.deleteGroupConfirm', { name: 'Ground', count: 1 })).toMatch(/its one message/)
    expect(tEn('chatInfo.deleteGroupConfirm', { name: 'Ground', count: 7 })).toMatch(/all 7 messages/)
  })

  it('(2) kein Notbehelf „(en)", „(s)", „(n)", „(e)", „(innen)"', () => {
    const klammer = /\p{L}\((?:en|e|n|s|es|innen)\)/u
    const treffer = alle.flatMap((b) => b.werte.filter(([, v]) => klammer.test(v)).map(([k]) => `${b.name}: ${k}`))
    expect(treffer).toEqual([])
  })

  /**
   * (3) Anführungszeichen. Deutsch „…“, Englisch “…”, jeweils geschlossen,
   * bevor das nächste öffnet. Im Bestand stand „Urgent", und in englische
   * Remarks fremder Excel-Listen schrieb der Re-Check deutsche Zeichen
   * (TXT-13). Gerade ASCII-" gibt es in keinem Wert — es bricht außerdem
   * jeden CSV-Export, der den Text übernimmt.
   */
  function anfuehrungFehler(text: string, sprache: 'de' | 'en'): string | null {
    const [auf, zu, fremd] = sprache === 'de' ? ['„', '“', '”'] : ['“', '”', '„']
    let offen = -1
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (c === '"') return `gerades Anführungszeichen bei ${i}`
      if (c === fremd) return `${fremd} gehört nicht in ${sprache} (bei ${i})`
      if (c === auf) {
        if (offen >= 0) return `${auf} bei ${offen} nicht geschlossen`
        offen = i
      } else if (c === zu) {
        if (offen < 0) return `${zu} ohne ${auf} bei ${i}`
        offen = -1
      }
    }
    return offen >= 0 ? `${auf} bei ${offen} nicht geschlossen` : null
  }

  it('Anführungszeichen geschlossen und in der Form der Sprache — Oberfläche, Formulare, DocCheck, Impressum', () => {
    const fehler = alle.flatMap((b) =>
      b.werte.flatMap(([k, v]) => {
        const f = anfuehrungFehler(v, b.sprache)
        return f ? [`${b.name}: ${k} — ${f}`] : []
      }),
    )
    expect(fehler).toEqual([])
  })

  it('die Prüfung der Anführungszeichen schlägt an (Gegenprobe)', () => {
    expect(anfuehrungFehler('als „Dringend" markiert', 'de')).toMatch(/gerades/)
    expect(anfuehrungFehler('„offen und „noch eins“', 'de')).toMatch(/nicht geschlossen/)
    expect(anfuehrungFehler('as “Urgent“', 'en')).toMatch(/nicht geschlossen/)
    expect(anfuehrungFehler('„Urgent“', 'en')).toMatch(/gehört nicht/)
    expect(anfuehrungFehler('„# “ beginnt einen Abschnitt, „- “ eine Zeile', 'de')).toBeNull()
  })

  it('(4) die App duzt — keine Sie-Anrede im Imperativ', () => {
    // „Laden Sie das Paket …" war die einzige Anrede in einem sonst
    // duzenden Text (TXT-09). „Sie sind eine Gedächtnisstütze" ist ein
    // Pronomen und bleibt erlaubt; gesucht wird das Verb davor.
    const anrede = /\b\p{Lu}\p{Ll}+en Sie\b/u
    const treffer = alle.filter((b) => b.sprache === 'de').flatMap((b) => b.werte.filter(([, v]) => anrede.test(v)).map(([k]) => `${b.name}: ${k}`))
    expect(treffer).toEqual([])
    expect(anrede.test('Laden Sie das Paket in der linken Spalte')).toBe(true)
  })

  /**
   * (5) Gleicher Wert in de und en heißt meist: nicht übersetzt („Aircraft
   * Type" in der deutschen Oberfläche, TXT-10). Erlaubt nur, wo das Wort in
   * beiden Sprachen dasselbe ist oder bewusst feststeht — je Gruppe ein Grund.
   */
  const GLEICH: { grund: string; schluessel: string[] }[] = [
    {
      grund: 'Modul- und Produktnamen (Kacheln, Reiter) heißen in beiden Sprachen gleich',
      schluessel: [
        'app:home.admin', 'app:admin.title', 'app:chat.title', 'app:feedback.title', 'app:admin.groups', 'app:admin.changelog',
        'app:admin.grading', 'app:admin.feedback', 'app:admin.docCheckHeading', 'app:logbook.title',
        'doccheck:status.sandbox', 'doccheck:tabs.chat', 'doccheck:mobile.chat', 'doccheck:gate.titel',
      ],
    },
    {
      grund: 'Rollen der ATO und Namen der DocCheck-Rechte (Spez. Kap. 5.1) — feste Bezeichnungen, auch im deutschen Hinweistext so zitiert',
      schluessel: [
        'app:roles.superadmin', 'app:roles.group_admin', 'app:roles.training_admin', 'app:chatInfo.admin',
        'app:admin.docCheckAccess', 'app:admin.docCheckAdmin', 'doccheck:auditAction.zugang', 'doccheck:auditAction.admin',
      ],
    },
    {
      grund: 'gleich geschriebene Wörter (Version, Option, Text, Position, Name, Status, Pilot, Team, Revision, Export, Administration, Organisation)',
      schluessel: [
        'app:common.version', 'app:chat.option', 'app:info.body', 'app:contacts.position', 'app:contacts.name', 'app:admin.import.status',
        'app:logbook.pilot', 'app:admin.atoName', 'doccheck:tabs.export', 'doccheck:tabs.admin', 'doccheck:pruefung.name',
        'doccheck:admin.modelName', 'doccheck:findings.col.status', 'doccheck:verwalten.col.status', 'doccheck:recheck.freigabe.status',
        'doccheck:recheck.col.team', 'doccheck:upload.revision', 'doccheck:referenz.rollen.revision', 'doccheck:paket.col.revision',
      ],
    },
    {
      grund: 'Fachbegriffe des Ausbildungsbetriebs (Briefing, Session, Debriefing) — im Logbuch wie im Formular',
      schluessel: ['app:logbook.parts', 'app:logbook.briefing', 'app:logbook.session', 'app:logbook.debriefing'],
    },
    {
      grund: 'Abkürzungen, Dateiformate und Regelwerksbezeichnungen (EASA/OEM) — international feststehend',
      schluessel: [
        'app:feedback.cc', 'doccheck:findings.col.id', 'doccheck:feature.ocr', 'doccheck:export.excel', 'doccheck:export.word',
        'doccheck:export.csv', 'doccheck:export.pptx', 'doccheck:legal.oem', 'doccheck:legal.ir', 'doccheck:legal.amc', 'doccheck:legal.gm',
        'doccheck:typen.OM', 'doccheck:typen.TM', 'doccheck:typen.PLM', 'doccheck:typen.CMM', 'doccheck:typen.AFM', 'doccheck:typen.QRH',
        'doccheck:typen.POH', 'doccheck:typen.SOP', 'doccheck:typen.SUPPLEMENT', 'doccheck:typen.IR', 'doccheck:typen.AMC', 'doccheck:typen.GM',
        'doccheck:punkt.lep',
      ],
    },
    {
      grund: 'Befundsprache: Status, Kategorie und Felder wie im englischen Export und in der fremden Findingliste (Befundtexte sind englisch)',
      schluessel: [
        'doccheck:findings.verified', 'doccheck:findings.partial', 'doccheck:findings.toVerify', 'doccheck:findings.weitere',
        'doccheck:kategorie.Non-Compliance', 'doccheck:recheck.remark',
      ],
    },
    {
      grund: 'Sicherheitswarnung bewusst englisch und in Großbuchstaben — Wortlaut des Meldewegs',
      schluessel: ['app:feedback.safetyWarning'],
    },
  ]
  const gleichErlaubt = new Set(GLEICH.flatMap((g) => g.schluessel))

  it('de und en unterscheiden sich — außer bei den benannten gleichen Wörtern', () => {
    const gleich: string[] = []
    for (const [familie, a, b] of [
      ['app', de, en],
      ['doccheck', dcDe, dcEn],
    ] as const) {
      const enWerte = new Map(werte(b as Tree))
      for (const [k, v] of werte(a as Tree)) if (enWerte.get(k) === v && !gleichErlaubt.has(`${familie}:${k}`)) gleich.push(`${familie}:${k} — ${v}`)
    }
    expect(gleich).toEqual([])
  })

  it('keine verwaiste Ausnahme der Sprachgleichheit', () => {
    const da = new Set<string>()
    for (const [familie, a, b] of [
      ['app', de, en],
      ['doccheck', dcDe, dcEn],
    ] as const) {
      const enWerte = new Map(werte(b as Tree))
      for (const [k, v] of werte(a as Tree)) if (enWerte.get(k) === v) da.add(`${familie}:${k}`)
    }
    expect([...gleichErlaubt].filter((k) => !da.has(k))).toEqual([])
    expect(GLEICH.every((g) => g.grund.length > 10)).toBe(true)
  })
})
