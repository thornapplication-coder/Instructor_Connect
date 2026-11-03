import { describe, expect, it } from 'vitest'
import config from '../tailwind.config.js'

/**
 * Die Skalen sind nur so viel wert, wie sie eingehalten werden.
 *
 * Im Bestand standen 448 Schriftgroessen als Einzelwerte im Markup —
 * 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 17, 19, 20 px, dazu die
 * Tailwind-Standardnamen. Vierzehn Stufen im Bereich von drei Millimetern.
 * Das entstand nicht aus Absicht, sondern Stelle fuer Stelle: Wer eine
 * neue Zeile schrieb, waehlte die Groesse nach Augenmass und traf dabei
 * jedes Mal knapp daneben.
 *
 * Genau so wuerde es wieder entstehen. Deshalb bewachen diese Tests die
 * Skalen mechanisch, nicht per Absprache:
 *
 *  - `text-[13px]` und Verwandte sind verboten. Wer eine Groesse braucht,
 *    nimmt eine Stufe (`text-small`) oder begruendet eine neue in
 *    tailwind.config.js.
 *  - Die Tailwind-Standardnamen (`text-sm`, `text-xs`, …) existieren nicht
 *    mehr, weil die Skala den Standard ersetzt statt ihn zu erweitern.
 *    Eine vergessene Stelle waere sonst still ohne Groessenangabe.
 *  - Senkrechte Stapel laufen ueber die vier Abstandsstufen, nicht ueber
 *    die acht Zwischenwerte, die vorher nebeneinander standen.
 *
 * Zwei Ausnahmen sind eingebaut und benannt: die rohe CSS-Regel fuer die
 * Querformat-Drucktabelle (laeuft nicht ueber eine Klasse) und
 * `tailwind.config.js` selbst, wo die Stufen ja definiert werden.
 */

// Quelltext ueber Vite einlesen — der Glob erfasst automatisch jede neue Datei.
const module = import.meta.glob('./**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true })
const dateien = Object.entries(module).filter(([pfad]) => !pfad.endsWith('.test.ts'))

/** Fundstellen eines Musters mit Datei und Zeile — die Meldung soll den Weg zeigen. */
function fundstellen(muster: RegExp): string[] {
  const treffer: string[] = []
  for (const [pfad, inhalt] of dateien) {
    // index.css traegt die einzige begruendete Ausnahme (siehe oben).
    if (pfad.endsWith('index.css')) continue
    ;(inhalt as string).split('\n').forEach((zeile, i) => {
      if (muster.test(zeile)) treffer.push(`${pfad}:${i + 1}  ${zeile.trim().slice(0, 90)}`)
    })
  }
  return treffer
}

const STUFEN = ['fine', 'micro', 'small', 'body', 'lead', 'head', 'title', 'display', 'hero', 'mega', 'giant']
const ABSTAENDE = ['tight', 'stack', 'section', 'major']

describe('Schriftskala', () => {
  it('ersetzt den Tailwind-Standard, statt ihn zu erweitern', () => {
    // Stuende fontSize unter `extend`, bliebe `text-sm` gueltig — eine
    // uebersehene Stelle faende dann still eine Groesse und niemand merkte es.
    expect(Object.keys(config.theme.fontSize)).toEqual(STUFEN)
    expect(config.theme.extend).not.toHaveProperty('fontSize')
  })

  it('haelt genau die elf Stufen bereit', () => {
    expect(config.theme.fontSize).toEqual({
      fine: '9.5px',
      micro: '12px',
      small: '13px',
      body: '14px',
      lead: '15px',
      head: '17px',
      title: '20px',
      display: '24px',
      hero: '30px',
      mega: '36px',
      giant: '48px',
    })
  })

  it('kennt keine Groesse als Einzelwert im Markup', () => {
    expect(fundstellen(/text-\[[0-9.]+(px|rem|em)\]/)).toEqual([])
  })

  it('kennt keinen Tailwind-Standardnamen mehr', () => {
    expect(fundstellen(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)).toEqual([])
  })
})

/**
 * Klassen, die es gar nicht gibt.
 *
 * `bg-line/8` sah aus wie eine gueltige Angabe und erzeugte im gebauten CSS
 * genau nichts: Tailwind kennt als Opazitaetsstufe nur die Werte seiner
 * Skala (5, 10, 20, …) oder eckige Klammern. Die Folge war unsichtbar und
 * langlebig — `Badge tone="dim"`, der haeufigste Ton der einzigen Pille der
 * App, stand monatelang ohne Flaeche da, und niemandem fiel auf, dass dort
 * eine Flaeche fehlt statt bewusst zu fehlen.
 *
 * Derselbe Fehler steckte in `border-line/12`. Er faellt nur auf, wenn man
 * ihn mechanisch sucht.
 */
describe('Opazitaetsstufen', () => {
  // Die Stufen aus Tailwinds Standardskala. Alles andere braucht eckige
  // Klammern — und eine Begruendung, warum es die Stufe nicht tut.
  const ERLAUBT = new Set(['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95', '100'])

  it('benutzt keine Stufe, die Tailwind nicht kennt', () => {
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      for (const m of (inhalt as string).matchAll(/\b(?:bg|text|border|ring|divide|from|to|via)-[a-zA-Z]+\/([0-9]+)\b/g)) {
        if (!ERLAUBT.has(m[1])) treffer.push(`${pfad}  ${m[0]}`)
      }
    }
    expect(treffer).toEqual([])
  })
})

describe('Abstandsskala', () => {
  it('haelt genau die vier Stufen bereit', () => {
    expect(config.theme.extend.spacing).toEqual({ tight: '6px', stack: '12px', section: '20px', major: '32px' })
  })

  it('stapelt senkrecht nur ueber die Stufen', () => {
    // space-y-0 bleibt erlaubt: „kein Abstand" ist keine Stufe, sondern
    // das Abschalten des Stapels (Raster uebernimmt).
    const erlaubt = new Set([...ABSTAENDE, '0', 'reverse'])
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      for (const m of (inhalt as string).matchAll(/\bspace-y-([a-z0-9.]+)/g)) {
        if (!erlaubt.has(m[1])) treffer.push(`${pfad}  ${m[0]}`)
      }
    }
    expect(treffer).toEqual([])
  })
})

/**
 * Deckkraft ist kein Zustand.
 *
 * Deaktivierte Nutzer (opacity-55), erledigtes Feedback (opacity-80) und
 * abgelaufene Infos (opacity-60) waren per Deckkraft gedaempft — und mit
 * ihnen alles darin: E-Mail-Zeile 2,7:1, „Erledigt" 3,1:1, Gueltigkeit
 * 3,1:1. Die Karten blieben bedienbar, die Ausnahme fuer inaktive
 * Bedienelemente griff also nicht (Audit 11/2026, VERW-17/A11Y-06/KERN-12).
 * Dieselbe Daempfung hatte DocCheck schon einmal verworfen.
 *
 * Erlaubt bleiben Varianten (`disabled:`, `hover:`, `group-hover:` …) und
 * die Endwerte 0/100, die nichts daempfen. Ausnahmen stehen unten mit Grund.
 */
/** Kommentarzeilen nennen verbotene Klassen gerade, um sie zu verbieten. */
const istKommentar = (zeile: string) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(zeile)

describe('Deckkraft', () => {
  // Datei → Grund. Der Grund lautet nicht „sieht ruhiger aus".
  const AUSNAHMEN: Record<string, string> = {
    // Beschriftung eines gesperrten Kaestchens (disabled): WCAG 1.4.3 nimmt
    // inaktive Bedienelemente vom Kontrast aus.
    './modules/doccheck/components/AdminTab.tsx': 'inaktives Bedienelement',
    './modules/doccheck/components/Tabs.tsx': 'inaktives Bedienelement',
  }

  it('daempft in Seiten und Modulen nichts per opacity-<n>', () => {
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      if (!/^\.\/(pages|modules)\//.test(pfad) || AUSNAHMEN[pfad]) continue
      ;(inhalt as string).split('\n').forEach((zeile, i) => {
        if (istKommentar(zeile)) return
        // Ohne Variante davor: `disabled:opacity-40` bleibt erlaubt.
        for (const m of zeile.matchAll(/(?<![\w:/-])opacity-(\d+)\b/g)) {
          if (m[1] !== '0' && m[1] !== '100') treffer.push(`${pfad}:${i + 1}  ${m[0]}`)
        }
      })
    }
    expect(treffer).toEqual([])
  })

  it('fuehrt keine Ausnahme fuer eine Datei, die gar nicht mehr daempft', () => {
    // Sonst bliebe die Ausnahme stehen, wenn die Stelle laengst behoben ist,
    // und deckte die naechste neue Daempfung in derselben Datei mit.
    for (const pfad of Object.keys(AUSNAHMEN)) {
      const inhalt = dateien.find(([p]) => p === pfad)?.[1] as string | undefined
      expect(inhalt, pfad).toMatch(/(?<![\w:/-])opacity-(?!0\b|100\b)\d+/)
    }
  })

  /*
   * Dieselbe Daempfung als Deckkraftstufe an der Schriftfarbe: „Löschen" im
   * Logbuch (`text-danger/80`) lag im Dunkelmodus bei 4,06:1, „ausstehend"
   * in der Kontrollliste der Instructor Info bei 4,4:1 (dunkel) bzw. 4,3:1
   * (hell) — die Tonfarbe allein erreicht 6,2:1 (Audit 11/2026, UID-15).
   * Gilt ueberall, nicht nur in Seiten: Auch eine Komponente traegt Text.
   * Varianten (`hover:`, `placeholder:` …) bleiben wie oben erlaubt.
   */
  it('gibt Schrift keine Deckkraftstufe (text-<ton>/<n>)', () => {
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      ;(inhalt as string).split('\n').forEach((zeile, i) => {
        if (istKommentar(zeile)) return
        for (const m of zeile.matchAll(/(?<![\w:/-])text-[a-z]+(?:-[a-z]+)*\/\d+\b/g)) treffer.push(`${pfad}:${i + 1}  ${m[0]}`)
      })
    }
    expect(treffer).toEqual([])
  })
})

/**
 * Statusmarken kommen aus `Badge` (CLAUDE.md) — keine Handpille.
 *
 * Farbige Schrift auf eigener 15-%-Flaeche lag nachgemessen bei 3,4–4,3:1.
 * Badge traegt die Farbe deshalb in Flaeche und Rand, die Schrift bleibt
 * ink. Im Feedback standen trotzdem „Dringend" und „Erledigt" als
 * handgebaute Pillen daneben (VERW-17/A11Y-06). Erkannt wird das Muster
 * selbst: Flaeche `bg-<ton>/15` und Schrift `text-<ton>` in einer Zeile,
 * jeweils ohne Variante (hover: ist eine Rueckmeldung, kein Zustand).
 */
describe('Statusmarken', () => {
  it('baut keine Pille aus Tonflaeche und Tonschrift von Hand', () => {
    const flaeche = /(?<![\w:/-])bg-(ok|danger|wait|bad)\/15\b/
    const schrift = /(?<![\w:/-])text-(ok|danger|wait|bad)\b/
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      ;(inhalt as string).split('\n').forEach((zeile, i) => {
        if (!istKommentar(zeile) && flaeche.test(zeile) && schrift.test(zeile)) treffer.push(`${pfad}:${i + 1}  ${zeile.trim().slice(0, 90)}`)
      })
    }
    expect(treffer).toEqual([])
  })
})

/**
 * Farben kommen aus den Tokens (tailwind.config.js), nicht als Farbwert.
 *
 * Die Chat-Sperre trug `accent-[#e05252]`, obwohl es `danger` gibt — ein
 * fester Wert folgt weder dem dunklen Thema noch einer spaeteren
 * Farbkorrektur (Audit 11/2026, VERW-21). Ausnahmen stehen mit Grund.
 */
describe('Farbwerte', () => {
  const AUSNAHMEN: Record<string, string> = {
    // Warnstreifen der Sandbox: bewusst ausserhalb des Themas und in hell
    // wie dunkel gleich, damit er nie wie App-Inhalt aussieht.
    './components/SandboxBar.tsx': 'ausserhalb des Themas',
    // Geraeterahmen der Vorschau: Farbe der Hardware, nicht der App.
    './pages/DevicePreview.tsx': 'Hardwarefarbe',
  }

  it('benutzt in Klassen keinen Farbwert in eckigen Klammern', () => {
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      if (AUSNAHMEN[pfad]) continue
      ;(inhalt as string).split('\n').forEach((zeile, i) => {
        if (istKommentar(zeile)) return
        for (const m of zeile.matchAll(/\b[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/g)) treffer.push(`${pfad}:${i + 1}  ${m[0]}`)
      })
    }
    expect(treffer).toEqual([])
  })

  it('fuehrt keine Ausnahme fuer eine Datei ohne Farbwert', () => {
    for (const pfad of Object.keys(AUSNAHMEN)) {
      const inhalt = dateien.find(([p]) => p === pfad)?.[1] as string | undefined
      expect(inhalt, pfad).toMatch(/\b[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/)
    }
  })
})

/**
 * Status- und Notentöne kommen aus den Tokens (ok, wait, bad, danger …),
 * nicht aus der Tailwind-Palette.
 *
 * Audit 11/2026, UID-08/UID-19: Auf dem Grading-Dashboard stand „offen/fehlt"
 * in drei Farben — text-warm, das Orange der Ampel und `text-amber-500`, das
 * auf der Karte bei 2,1:1 lag. Die Flottenmatrix tönte mit
 * emerald/amber/red je /20; im Dunkelmodus wurde das Amber auf Dunkelblau
 * zu Grau-Oliv. Rohe Palettenfarben kennen kein Thema und keine
 * Kontrastprüfung. Varianten (`hover:`, `dark:`) zählen mit — sie sind
 * genauso roh. Ausnahmen stehen mit Grund.
 */
describe('Palettenfarben', () => {
  const PALETTE =
    /\b(?:bg|text|border|ring|divide|outline|from|to|via|fill|stroke|decoration|accent|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g
  const AUSNAHMEN: Record<string, string> = {
    // Sandbox-Leiste und der Sandbox-Code beim Anmelden: bewusst ausserhalb
    // des Themas und in hell wie dunkel gleich, damit sie nie wie
    // App-Inhalt aussehen (siehe „Farbwerte").
    './components/SandboxBar.tsx': 'ausserhalb des Themas',
    './pages/Login.tsx': 'Sandbox-Hinweis, Gestalt der Sandbox-Leiste',
    // Notenfarben nach Spez. 5.3 (gradeColor) und das Urteil Competent /
    // Not Competent im Formular: Vollflaechen mit weisser Schrift in BEIDEN
    // Themen. Die Status-Tokens werden im Dunkelmodus hell und truegen dort
    // keine weisse Schrift.
    // Die Regel steht seit TEC-18 in gradingRules.ts statt in Grading.tsx
    // — deshalb prüft die Wache auch die Logik-Module direkt unter src/.
    './gradingRules.ts': 'Notenfarben Spez. 5.3, Vollflaeche',
    './pages/GradingForm.tsx': 'Urteilsflaeche wie die Notenfarben',
  }

  it('benutzt in Seiten, Modulen, Bausteinen und Logik-Modulen keine rohe Palettenfarbe', () => {
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      if (!/^\.\/((pages|modules|components)\/|[^/]+\.tsx?$)/.test(pfad) || AUSNAHMEN[pfad]) continue
      ;(inhalt as string).split('\n').forEach((zeile, i) => {
        if (istKommentar(zeile)) return
        for (const m of zeile.matchAll(PALETTE)) treffer.push(`${pfad}:${i + 1}  ${m[0]}`)
      })
    }
    expect(treffer).toEqual([])
  })

  it('fuehrt keine Ausnahme fuer eine Datei ohne Palettenfarbe', () => {
    for (const pfad of Object.keys(AUSNAHMEN)) {
      const inhalt = dateien.find(([p]) => p === pfad)?.[1] as string | undefined
      expect(inhalt, pfad).toMatch(PALETTE)
    }
  })
})

/**
 * Breite an einem Vollbreite-Feld wirkt nicht.
 *
 * Audit 11/2026, UID-17: `selectCls` und `inputCls` tragen `w-full`, und im
 * gebauten CSS steht `.w-full` hinter `.w-auto`, `.w-24`, `.w-28` — eine
 * angehängte Breite verlor IMMER. Der Standardisierungsbericht zeigte drei
 * bildschirmbreite Auswahlfelder untereinander, die Kürzelfelder der
 * Grading-Konfiguration waren so breit wie die Karte. Wer eine eigene
 * Breite braucht, nimmt `selectInlineCls`/`inputInlineCls`. `!w-…` setzt
 * sich durch und bleibt erlaubt.
 */
describe('Feldbreiten', () => {
  it('haengt an selectCls/inputCls keine eigene Breite', () => {
    const muster = /\$\{(?:selectCls|inputCls)\}[^`]*?(?<![\w!-])w-[\w./[\]-]+/g
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      ;(inhalt as string).split('\n').forEach((zeile, i) => {
        if (istKommentar(zeile)) return
        for (const m of zeile.matchAll(muster)) treffer.push(`${pfad}:${i + 1}  ${m[0]}`)
      })
    }
    expect(treffer).toEqual([])
  })

  it('erkennt das Muster — und laesst min-w-, max-w- und !w- durch', () => {
    const muster = /\$\{(?:selectCls|inputCls)\}[^`]*?(?<![\w!-])w-[\w./[\]-]+/
    expect('className={`${selectCls} w-auto`}').toMatch(muster)
    expect('className={`${inputCls} w-24 font-mono`}').toMatch(muster)
    expect('className={`${inputCls} min-w-40 flex-1`}').not.toMatch(muster)
    expect('className={`${inputCls} max-w-xs`}').not.toMatch(muster)
    expect('className={`${selectCls} !w-auto !py-1.5`}').not.toMatch(muster)
  })
})

/**
 * Karten haben einen Innenabstand.
 *
 * Audit 11/2026, UID-03: `Card` bringt bewusst keinen eigenen mit — die
 * Aufrufstelle waehlt p-3, p-4 oder p-5 —, und im Admin-Logbuch stand ein
 * nacktes `<Card>`: Ueberschrift, Filter, Tabelle und Summenzeile klebten
 * an der Kante, die Karte sah kaputt aus. Jede Karte in Seiten und Modulen
 * nennt deshalb einen Innenabstand OHNE Variante (`sm:p-5` allein liesse
 * das Telefon ohne). Eine Liste, deren Zeilen ihn selbst tragen, schreibt
 * `p-0` hin — sichtbar entschieden statt vergessen. Ein className, der kein
 * fester Text ist, laesst sich nicht pruefen und zaehlt als fehlend.
 */
describe('Karten', () => {
  /** Ende eines JSX-Tags: `>` in `=>` oder in geschweiften Klammern zaehlt nicht. */
  function tagEnde(s: string, ab: number): number {
    let tiefe = 0
    let zitat: string | null = null
    for (let i = ab; i < s.length; i++) {
      const c = s[i]
      if (zitat) {
        if (c === zitat) zitat = null
      } else if (tiefe === 0 && (c === '"' || c === "'" || c === '`')) zitat = c
      else if (c === '{') tiefe++
      else if (c === '}') tiefe--
      else if (c === '>' && tiefe === 0) return i
    }
    return s.length
  }

  /** Zeilen (ab 1), an denen ein `<Card …>` ohne Innenabstand beginnt. */
  function ohneInnenabstand(inhalt: string): number[] {
    const zeilen: number[] = []
    for (const m of inhalt.matchAll(/<Card(?=[\s>/])/g)) {
      const attribute = inhalt.slice(m.index + m[0].length, tagEnde(inhalt, m.index + m[0].length))
      const klasse = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(attribute)
      const text = klasse ? (klasse[1] ?? klasse[2]) : ''
      if (!/(?<![\w:/-])p[xytrbl]?-[\w.[\]-]+/.test(text)) zeilen.push(inhalt.slice(0, m.index).split('\n').length)
    }
    return zeilen
  }

  it('jede Karte in Seiten und Modulen hat einen Innenabstand', () => {
    const treffer: string[] = []
    for (const [pfad, inhalt] of dateien) {
      if (!/^\.\/(pages|modules)\/.*\.tsx$/.test(pfad)) continue
      for (const z of ohneInnenabstand(inhalt as string)) treffer.push(`${pfad}:${z}`)
    }
    expect(treffer).toEqual([])
  })

  it('erkennt das Muster — auch hinter einem Pfeil im onClick, und nur bei Card selbst', () => {
    expect(ohneInnenabstand('<Card>\n  x\n</Card>')).toEqual([1])
    expect(ohneInnenabstand('<Card className="space-y-stack">')).toEqual([1])
    expect(ohneInnenabstand('<Card className="sm:p-5">')).toEqual([1])
    expect(ohneInnenabstand('<Card className={klasse}>')).toEqual([1])
    expect(ohneInnenabstand('<Card onClick={() => go(1)} label="x" className="p-4">')).toEqual([])
    expect(ohneInnenabstand('<Card className={`p-3 ${aktiv ? "" : "border-dashed"}`}>')).toEqual([])
    expect(ohneInnenabstand('<Card className="divide-y p-0">')).toEqual([])
    expect(ohneInnenabstand('<Card className="px-4 py-3">')).toEqual([])
    expect(ohneInnenabstand('<CardGrid>\n<CardHeading>')).toEqual([])
  })
})
