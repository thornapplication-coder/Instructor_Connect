/**
 * Prüfanweisung aus Befund, Empfehlung und Team-Kommentar (N3.1 Schritt 4):
 * Was muss im Dokument NICHT mehr stehen, was MUSS stehen?
 *
 * Regelbasiert erkannt werden die üblichen Formen — Zitate in
 * Anführungszeichen, „ersetzen X durch Y", „Y statt X", „X → Y",
 * „X streichen", „Y ergänzen". Was sich so nicht greifen lässt, bleibt für
 * die KI-Prüfung (später) und ist bis dahin „Not verifiable" — ehrlich
 * statt geraten.
 */

export interface Anweisung {
  /** Text, der verschwunden sein muss */
  weg: string[]
  /** Text, der vorhanden sein muss */
  da: string[]
  /** nur als Empfehlung formuliert („evtl.", „could") */
  nurEmpfehlung: boolean
  /** Team-Kommentar behauptet eine Korrektur („added", „erledigt") */
  teamBehauptet: boolean
}

const Q = '[„"“”\'‚‘’«»]'
const ZITAT = new RegExp(`${Q}([^„"“”'‚‘’«»]{2,160}?)${Q}`, 'g')
const zitate = (s: string) => [...s.matchAll(ZITAT)].map((m) => m[1].trim()).filter(Boolean)
const Z = `${Q}([^„"“”'‚‘’«»]{2,160}?)${Q}`

const ERSETZEN = [
  new RegExp(`(?:replace|ersetze[n]?|ändern?|aendern?|change|korrigiere[n]?|correct)\\s+${Z}\\s+(?:with|by|to|durch|in|zu|into)\\s+${Z}`, 'gi'),
  new RegExp(`${Z}\\s*(?:→|->|=>|⇒)\\s*${Z}`, 'g'),
  new RegExp(`${Z}\\s+(?:should read|soll(?:te)? lauten|richtig:?|korrekt:?)\\s+${Z}`, 'gi'),
]
const STATT = new RegExp(`${Z}\\s+(?:instead of|statt|anstatt|anstelle von|rather than)\\s+${Z}`, 'gi')
const WEG = new RegExp(`(?:delete|remove|streichen|entfernen|löschen|loeschen|weglassen)\\s+${Z}|${Z}\\s+(?:streichen|entfernen|löschen|loeschen|is obsolete|ist veraltet)`, 'gi')
const DA = new RegExp(`(?:add|insert|ergänze[n]?|einfügen|einfuegen|hinzufügen|aufnehmen|include)\\s+${Z}|${Z}\\s+(?:ergänzen|einfügen|hinzufügen|aufnehmen|added|eingefügt|ergänzt)`, 'gi')

const EMPFEHLUNG = /\b(evtl\.?|eventuell|könnte|koennte|ggf\.?|gegebenenfalls|could|consider|might|optional(?:ly)?|suggest(?:ion|ed)?|empfehlen|empfehlung:|may want)\b/i
const BEHAUPTUNG = /\b(added|removed|deleted|corrected|changed|updated|done|fixed|implemented|erledigt|eingefügt|ergänzt|entfernt|gelöscht|korrigiert|geändert|angepasst|umgesetzt|eingearbeitet|behoben)\b/i

export function anweisungAus(b: { befund: string; empfehlung: string; kommentar: string }): Anweisung {
  const weg = new Set<string>()
  const da = new Set<string>()
  const texte = [b.befund, b.empfehlung]
  for (const t of texte) {
    for (const re of ERSETZEN) for (const m of t.matchAll(re)) { weg.add(m[1].trim()); da.add(m[2].trim()) }
    for (const m of t.matchAll(STATT)) { da.add(m[1].trim()); weg.add(m[2].trim()) }
    for (const m of t.matchAll(WEG)) weg.add((m[1] ?? m[2]).trim())
    for (const m of t.matchAll(DA)) da.add((m[1] ?? m[2]).trim())
  }
  // Ein Zitat im Befund ohne Verb meint den beanstandeten Text.
  if (!weg.size && !da.size) for (const z of zitate(b.befund)) weg.add(z)
  // Was das Team als ergänzt meldet, muss dastehen (N3.1: Behauptung prüfen).
  const teamBehauptet = BEHAUPTUNG.test(b.kommentar)
  if (teamBehauptet) for (const m of b.kommentar.matchAll(DA)) da.add((m[1] ?? m[2]).trim())
  for (const x of da) weg.delete(x)
  return { weg: [...weg], da: [...da], nurEmpfehlung: EMPFEHLUNG.test(`${b.befund} ${b.empfehlung}`), teamBehauptet }
}
