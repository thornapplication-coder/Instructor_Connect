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

const TOKEN = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export function entitaeten(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e === 'lt') return '<'
    if (e === 'gt') return '>'
    if (e === 'amp') return '&'
    if (e === 'quot') return '"'
    if (e === 'apos') return "'"
    const code = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return String.fromCodePoint(code)
  })
}

export function* xmlEreignisse(xml: string): Generator<XmlEreignis> {
  for (const m of xml.matchAll(TOKEN)) {
    if (m[1] !== undefined) yield { typ: 'text', text: m[1] }
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
