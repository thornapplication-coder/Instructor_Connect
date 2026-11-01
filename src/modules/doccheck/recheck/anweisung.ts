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
  /**
   * Der beanstandete Text stammt NUR aus einem Zitat ohne Handlungswort
   * („"The FI shall hold a CPL" is incorrect"). Dann beweist sein Fehlen
   * nicht, dass der Mangel behoben ist — nur, dass der Satz anders lautet.
   */
  ausZitat: boolean
}

const Q = '[„"“”\'‚‘’«»]'
/**
 * Ein Zitat beginnt und endet NICHT innerhalb eines Wortes: Der Apostroph
 * in „examiner's" oder „doesn't" ist kein Anführungszeichen (Fachprüfung
 * 01.11.2026 — vorher wurde daraus die Suche nach „s checklist doesn").
 */
const Z = `(?<![\\p{L}\\p{N}])${Q}([^„"“”'‚‘’«»]{2,160}?)${Q}(?![\\p{L}\\p{N}])`
const ZITAT = new RegExp(Z, 'gu')
const zitate = (s: string) => [...s.matchAll(ZITAT)].map((m) => m[1].trim()).filter(Boolean)

const ERSETZEN = [
  new RegExp(`(?:replace|ersetze[n]?|ändern?|aendern?|change|korrigiere[n]?|correct)\\s+${Z}\\s+(?:with|by|to|durch|in|zu|into)\\s+${Z}`, 'giu'),
  new RegExp(`${Z}\\s*(?:→|->|=>|⇒)\\s*${Z}`, 'gu'),
  new RegExp(`${Z}\\s+(?:should read|soll(?:te)? lauten|richtig:?|korrekt:?)\\s+${Z}`, 'giu'),
]
const STATT = new RegExp(`${Z}\\s+(?:instead of|statt|anstatt|anstelle von|rather than)\\s+${Z}`, 'giu')
const WEG = new RegExp(`(?:delete|remove|streichen|entfernen|löschen|loeschen|weglassen)\\s+${Z}|${Z}\\s+(?:streichen|entfernen|löschen|loeschen|is obsolete|ist veraltet)`, 'giu')
const DA = new RegExp(`(?:add|insert|ergänze[n]?|einfügen|einfuegen|hinzufügen|aufnehmen|include)\\s+${Z}|${Z}\\s+(?:ergänzen|einfügen|hinzufügen|aufnehmen|added|eingefügt|ergänzt)`, 'giu')

const EMPFEHLUNG = /\b(evtl\.?|eventuell|könnte|koennte|ggf\.?|gegebenenfalls|could|consider|might|optional(?:ly)?|suggest(?:ion|ed)?|empfehlen|empfehlung:|may want)\b/i
/**
 * Als Empfehlung gilt ein Befund nur, wenn die EMPFEHLUNGSSPALTE so
 * formuliert ist oder der Befund so BEGINNT („Evtl. …", „Could …"). Ein
 * „could" mitten im Befund („… could lead to a finding") macht aus einer
 * Pflichtkorrektur keine Empfehlung (Fachprüfung 01.11.2026).
 */
const EMPFEHLUNG_ANFANG = new RegExp(`^\\s*(?:\\S+\\s+){0,2}?${EMPFEHLUNG.source}`, 'i')
const PFEIL = /→|->|=>|⇒/
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
  let ausZitat = false
  if (!weg.size && !da.size) {
    // Prosa mit Pfeil („'check list' → bitte einheitlich 'checklist'"):
    // links der beanstandete Text, rechts die Korrektur
    const mitPfeil = [b.befund, b.empfehlung].find((t) => PFEIL.test(t) && zitate(t).length >= 2)
    if (mitPfeil) {
      const [links, rechts] = mitPfeil.split(PFEIL)
      for (const z of zitate(links)) weg.add(z)
      for (const z of zitate(rechts)) da.add(z)
    } else {
      // Ein Zitat im Befund ohne Verb meint den beanstandeten Text.
      for (const z of zitate(b.befund)) weg.add(z)
      ausZitat = weg.size > 0
    }
  }
  // Was das Team als ergänzt meldet, muss dastehen (N3.1: Behauptung prüfen).
  const teamBehauptet = BEHAUPTUNG.test(b.kommentar)
  if (teamBehauptet) for (const m of b.kommentar.matchAll(DA)) da.add((m[1] ?? m[2]).trim())
  for (const x of da) weg.delete(x)
  return { weg: [...weg], da: [...da], nurEmpfehlung: EMPFEHLUNG.test(b.empfehlung) || EMPFEHLUNG_ANFANG.test(b.befund), teamBehauptet, ausZitat }
}
