/**
 * Schlanker XML-Leser für die Office-Formate.
 *
 * Im Web Worker gibt es keinen DOMParser. Office-XML ist aber maschinell
 * erzeugt und flach genug, dass ein Ereignisstrom (Tag auf, Tag zu, Text)
 * reicht — mehr braucht weder der DOCX- noch der XLSX-Leser.
 */

export type XmlEreignis =
  | { typ: 'auf'; name: string; attr: Record<string, string>; leer: boolean }
  | { typ: 'zu'; name: string }
  | { typ: 'text'; text: string }

const TOKEN = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/** Zeichen, die XML 1.0 erlaubt: Tab, LF, CR und ab U+0020 — ohne Ersatzhälften und U+FFFE/U+FFFF. */
export function xmlZeichen(code: number): boolean {
  return code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff)
}

// Roh im Text: C0-Steuerzeichen außer Tab/LF/CR und U+FFFE/U+FFFF (Ersatzhälften
// liefert TextDecoder nie, die kommen nur über Zeichenreferenzen).
const VERBOTEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

/** Verbotene Zeichen → U+FFFD. */
export function ohneSteuerzeichen(s: string): string {
  return s.replace(VERBOTEN, '\uFFFD')
}

export function entitaeten(s: string): string {
  return ohneSteuerzeichen(s).replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e === 'lt') return '<'
    if (e === 'gt') return '>'
    if (e === 'amp') return '&'
    if (e === 'quot') return '"'
    if (e === 'apos') return "'"
    const code = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    // Ungültige Zeichenreferenz (&#x110000;) → Ersatzzeichen. Vorher brach
    // ein einziges solches Zeichen das ganze Dokument ab (RangeError). Ebenso
    // Steuerzeichen (&#x2;) und Ersatzhälften: Sie standen sonst im
    // Dokumenttext und machten jede Ausgabe, die ihn als XML schreibt,
    // ungültig — PowerPoint-Folien, Excel-Blätter (Audit 11/2026, SEC-04).
    return xmlZeichen(code) ? String.fromCodePoint(code) : '\uFFFD'
  })
}

/**
 * Jede Stelle wird genau EINMAL versucht (Sticky-Regex): Passt dort kein
 * Baustein, ist das XML kaputt — Office schreibt nie ein rohes „<" in Text.
 * Vorher suchte matchAll ab dem nächsten Zeichen weiter, und jedes
 * unbeendete „<!--", „<?" oder „<![CDATA[" lief einmal bis zum Textende:
 * 2,4 KB gepackt hielten den Worker sekundenlang, eine Fremdliste den Tab
 * fast eine halbe Minute fest (Audit 11/2026, SEC-01).
 */
export function* xmlEreignisse(xml: string): Generator<XmlEreignis> {
  // Je Aufruf eine eigene Regex — lastIndex darf nicht zwischen zwei
  // gleichzeitig laufenden Lesern geteilt werden.
  const token = new RegExp(TOKEN.source, 'y')
  while (token.lastIndex < xml.length) {
    const m = token.exec(xml)
    if (!m) throw new Error('DC-PARSE')
    if (m[1] !== undefined) yield { typ: 'text', text: ohneSteuerzeichen(m[1]) }
    else if (m[3]) {
      if (m[2] === '/') {
        yield { typ: 'zu', name: m[3] }
        continue
      }
      const attr: Record<string, string> = {}
      for (const a of (m[4] ?? '').matchAll(ATTR)) attr[a[1]] = entitaeten(a[2] ?? a[3] ?? '')
      const leer = m[5] === '/'
      yield { typ: 'auf', name: m[3], attr, leer }
      if (leer) yield { typ: 'zu', name: m[3] }
    } else if (m[6] !== undefined) yield { typ: 'text', text: entitaeten(m[6]) }
  }
}

/** Gesamter Text innerhalb bestimmter Elemente, je Element ein Eintrag. */
export function texteIn(xml: string, element: string, textElemente: string[] = ['w:t']): string[] {
  const out: string[] = []
  let tiefe = 0
  let inText = 0
  let puffer = ''
  for (const e of xmlEreignisse(xml)) {
    if (e.typ === 'auf' && e.name === element) {
      if (tiefe === 0) puffer = ''
      tiefe++
    } else if (e.typ === 'zu' && e.name === element) {
      tiefe--
      if (tiefe === 0) out.push(puffer.replace(/\s+/g, ' ').trim())
    } else if (tiefe > 0 && e.typ === 'auf' && textElemente.includes(e.name)) inText++
    else if (tiefe > 0 && e.typ === 'zu' && textElemente.includes(e.name)) inText--
    else if (tiefe > 0 && e.typ === 'auf' && (e.name === 'w:tab' || e.name === 'w:br')) puffer += ' '
    else if (tiefe > 0 && inText > 0 && e.typ === 'text') puffer += e.text
  }
  return out
}
