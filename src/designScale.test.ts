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
