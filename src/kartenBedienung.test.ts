import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Bedienelemente in klickbaren Karten (Audit 11/2026, TA-01, high).
 *
 * `Card` mit `onClick` und `label` (ui.tsx) legt einen Knopf ueber die ganze
 * Karte und nimmt dem Inhalt die Zeigerereignisse (`pointer-events-none`) —
 * sonst zoege Vorlesesoftware den Inhalt zum Namen des Knopfes zusammen.
 * Ein Knopf IN der Karte muss sich die Ereignisse zurueckholen
 * (`pointer-events-auto`) und ueber der Flaeche liegen (positioniert). Das
 * PDF-Symbol in der Ablage des Training Admin hatte nur `relative z-10`:
 * Jeder Maus- und Fingertipp fiel auf die Zeile, es oeffnete sich die
 * Formularansicht statt des PDF. Per Tastatur ging es — deshalb fiel es
 * nicht auf, und jsdom wendet kein CSS an. Diese Wache liest deshalb den
 * Quelltext: fuer JEDES Bedienelement in jeder solchen Karte.
 *
 * Den echten Klick prueft Ebene 3 (e2e/druck.spec.ts).
 */

const quellen = Object.entries(import.meta.glob('./**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>).filter(
  ([pfad]) => !pfad.endsWith('.test.tsx'),
)

/** Elemente, die Klicks annehmen sollen. */
const BEDIENBAR = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'Button'])
/** Attribute, die ein beliebiges Element bedienbar machen. */
const HANDLER = new Set(['onClick', 'onChange', 'onPointerDown', 'onMouseDown', 'href'])

interface Fund {
  ort: string
  ok: boolean
}

function attributNamen(attrs: ts.JsxAttributes): string[] {
  return attrs.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText())
}

function klassen(attrs: ts.JsxAttributes): string {
  const k = attrs.properties.filter(ts.isJsxAttribute).find((a) => a.name.getText() === 'className')
  return k?.initializer ? k.initializer.getText() : ''
}

/** Bedienelemente innerhalb jeder `<Card onClick label>` einer Datei. */
function pruefe(pfad: string, text: string): { karten: number; funde: Fund[] } {
  const quelle = ts.createSourceFile(pfad, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const zeile = (n: ts.Node) => quelle.getLineAndCharacterOfPosition(n.getStart()).line + 1
  let karten = 0
  const funde: Fund[] = []

  const imInhalt = (n: ts.Node, pfadKlassen: string[]) => {
    let tag: string | null = null
    let attrs: ts.JsxAttributes | null = null
    if (ts.isJsxElement(n)) {
      tag = n.openingElement.tagName.getText()
      attrs = n.openingElement.attributes
    } else if (ts.isJsxSelfClosingElement(n)) {
      tag = n.tagName.getText()
      attrs = n.attributes
    }
    const kette = attrs ? [...pfadKlassen, klassen(attrs)] : pfadKlassen
    if (tag && attrs && (BEDIENBAR.has(tag) || attributNamen(attrs).some((a) => HANDLER.has(a)))) {
      // Die naechstgelegene Angabe zu pointer-events gilt (sie erbt sich);
      // positioniert muss das Element selbst oder ein Vorfahr in der Karte sein.
      const zeiger = kette
        .flatMap((k) => k.match(/\bpointer-events-(auto|none)\b/g) ?? [])
        .slice(-1)[0]
      const positioniert = kette.some((k) => /(^|[\s"'`])(relative|absolute|fixed|sticky)\b/.test(k))
      funde.push({ ort: `${pfad.replace('./', 'src/')}:${zeile(n)} <${tag}>`, ok: zeiger === 'pointer-events-auto' && positioniert })
    }
    ts.forEachChild(n, (k) => imInhalt(k, kette))
  }

  const besuche = (n: ts.Node) => {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'Card') {
      const namen = attributNamen(n.openingElement.attributes)
      if (namen.includes('onClick') && namen.includes('label')) {
        karten++
        n.children.forEach((k) => imInhalt(k, []))
      }
    }
    ts.forEachChild(n, besuche)
  }
  besuche(quelle)
  return { karten, funde }
}

describe('Bedienelemente in klickbaren Karten nehmen Klicks an', () => {
  const ergebnis = quellen.map(([pfad, text]) => pruefe(pfad, text))
  const funde = ergebnis.flatMap((e) => e.funde)

  it('findet ueberhaupt Karten und Bedienelemente (sonst prueft die Wache ins Leere)', () => {
    expect(ergebnis.reduce((s, e) => s + e.karten, 0)).toBeGreaterThanOrEqual(4)
    // Darunter das PDF-Symbol der Ablage des Training Admin.
    expect(funde.length).toBeGreaterThanOrEqual(5)
  })

  it('jedes traegt pointer-events-auto und liegt positioniert ueber der Karte', () => {
    expect(funde.filter((f) => !f.ok).map((f) => f.ort)).toEqual([])
  })

  it('erkennt den Fehler von TA-01 (Gegenprobe am Muster)', () => {
    const muster = `export const X = () => (
      <Card onClick={() => {}} label="Zeile">
        <span>Text</span>
        <button className="relative z-10 flex">PDF</button>
        <div className="pointer-events-auto relative z-10"><button className="flex">Weg</button></div>
        <div className="pointer-events-auto"><a href="#">ohne Position</a></div>
        <div className="pointer-events-auto relative"><button className="pointer-events-none">aus</button></div>
      </Card>
    )`
    const { karten, funde: f } = pruefe('./muster.tsx', muster)
    expect(karten).toBe(1)
    expect(f.map((x) => [x.ort.replace(/^src\/muster\.tsx:/, ''), x.ok])).toEqual([
      ['4 <button>', false],
      ['5 <button>', true],
      ['6 <a>', false],
      ['7 <button>', false],
    ])
  })
})
