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
