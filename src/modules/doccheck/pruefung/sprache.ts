/**
 * Spracherkennung je Absatz (Nachtrag N9) — lokal, ohne Bibliothek.
 *
 * Funktionswörter statt Trigramm-Tabellen: Der Fall aus dem Anlass ist ein
 * landessprachiger Arbeitskommentar in einem englischen Handbuch. Den
 * erkennt man zuverlässig an „und", „nicht", „bitte", „der" — und zwar
 * schon ab drei Wörtern, wo Trigramm-Statistik noch rät. Fachbegriffe
 * (OEM-Englisch, Abkürzungen) zählen für keine Sprache und verfälschen
 * das Ergebnis deshalb nicht.
 */

export type Sprache = 'en' | 'de' | 'es' | 'it' | 'fr'

const FUNKTIONSWOERTER: Record<Sprache, string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'in', 'for', 'with', 'on', 'be', 'are', 'this', 'that', 'by', 'or', 'as', 'at', 'from', 'shall', 'should', 'must', 'will', 'not', 'an', 'it', 'if', 'all', 'when', 'which', 'has', 'have'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'für', 'ein', 'eine', 'den', 'dem', 'des', 'zu', 'auf', 'im', 'sich', 'von', 'wird', 'werden', 'auch', 'noch', 'bitte', 'hier', 'oder', 'aber', 'wenn', 'bei', 'nach', 'sind', 'muss', 'soll', 'wir', 'ich'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'por', 'para', 'con', 'una', 'un', 'es', 'del', 'se', 'no', 'al', 'como', 'este', 'esta', 'pero', 'más', 'está'],
  it: ['il', 'lo', 'la', 'gli', 'le', 'di', 'che', 'e', 'per', 'non', 'una', 'un', 'sono', 'del', 'della', 'con', 'si', 'questo', 'questa', 'anche', 'ma', 'come', 'nel', 'è'],
  fr: ['le', 'la', 'les', 'des', 'et', 'est', 'pour', 'dans', 'une', 'un', 'du', 'que', 'qui', 'pas', 'sur', 'au', 'avec', 'ce', 'cette', 'sont', 'mais', 'ou'],
}

const SATZ: Record<Sprache, Set<string>> = Object.fromEntries(Object.entries(FUNKTIONSWOERTER).map(([k, v]) => [k, new Set(v)])) as Record<Sprache, Set<string>>

/** Sonderzeichen, die eine Sprache verraten — zählen wie ein Funktionswort. */
const ZEICHEN: [RegExp, Sprache][] = [
  [/[äöüß]/i, 'de'],
  [/[ñ¿¡]/i, 'es'],
  [/[àèìòù]/i, 'it'],
  [/[çœêâî]/i, 'fr'],
]

export function woerter(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}]+/gu) ?? []
}

/**
 * Sprache eines Absatzes oder null (zu kurz, kein klares Ergebnis).
 * Klar heißt: die beste Sprache hat mindestens zwei Treffer UND doppelt so
 * viele wie die zweitbeste.
 */
export function spracheVon(text: string, minWoerter = 3): Sprache | null {
  const w = woerter(text)
  if (w.length < minWoerter) return null
  const punkte: Record<Sprache, number> = { en: 0, de: 0, es: 0, it: 0, fr: 0 }
  for (const x of w) for (const s of Object.keys(SATZ) as Sprache[]) if (SATZ[s].has(x)) punkte[s]++
  for (const [re, s] of ZEICHEN) punkte[s] += (text.match(new RegExp(re.source, 'gi')) ?? []).length
  const rang = (Object.entries(punkte) as [Sprache, number][]).sort((a, b) => b[1] - a[1])
  const [erste, zweite] = rang
  if (erste[1] < 2 || erste[1] < 2 * zweite[1]) return null
  return erste[0]
}

/** Dokumentsprache: Mehrheit der erkannten Absätze, nach Textmenge gewichtet. */
export function dokumentSprache(absaetze: string[]): Sprache | null {
  const menge: Partial<Record<Sprache, number>> = {}
  for (const a of absaetze) {
    const s = spracheVon(a)
    if (s) menge[s] = (menge[s] ?? 0) + a.length
  }
  const best = (Object.entries(menge) as [Sprache, number][]).sort((a, b) => b[1] - a[1])[0]
  return best?.[0] ?? null
}

/** Adressen (Straßennamen in Landessprache) sind keine fremdsprachigen Reste. */
export function istAdresse(text: string, strassenWoerter: string[]): boolean {
  const t = text.toLowerCase()
  const plz = /\b[A-Z]?-?\d{4,5}\s+\p{Lu}/u.test(text)
  const strasse = strassenWoerter.some((w) => new RegExp(`\\p{L}*${w}\\s*\\d`, 'u').test(t))
  return plz || strasse
}

/** Als Zitat gekennzeichnet: ganz in Anführungszeichen. */
export function istZitat(text: string): boolean {
  return /^\s*["„“«‚'].*["“”»‘']\s*$/s.test(text)
}

/** Einzelne landessprachige Wörter in einem Absatz der Dokumentsprache (N9: Niedrig). */
export function einschuebe(text: string, liste: string[]): string[] {
  // Groß-/Kleinschreibung zählt: „Seite" (Nomen) ja, „seite" kommt nicht vor;
  // „und" klein. Englische Homographen sind in der Liste bewusst nicht drin.
  const menge = new Set(liste)
  return [...new Set((text.match(/[\p{L}]+/gu) ?? []).filter((w) => menge.has(w)))]
}

/** Kleine Bindewörter, die in Eigennamen klein bleiben („Rules of the Air"). */
const BINDEWOERTER = new Set(['of', 'the', 'and', 'for', 'on', 'in', 'to', 'at', 'by', 'de', 'du', 'des', 'der', 'die', 'das', 'und', 'von', 'für', 'la', 'le', 'les', 'el', 'del', 'di', 'della', 'y', 'e', 'et'])

/**
 * Eigenname wie „Standardised European Rules of the Air" (Nachtrag N9:
 * Eigennamen sind ausgenommen, Audit 11/2026, FRD-17): zwei bis sechs
 * Wörter, kein Satzende, jedes Wort groß außer kleinen Bindewörtern — einen
 * Satz mit Verb schreibt so niemand. Nicht für Deutsch: Dort sind alle
 * Nomen groß, und „Hinweise für den Flugbetrieb" ist ein deutscher Rest in
 * einem englischen Handbuch, kein Name.
 */
export function istEigenname(text: string): boolean {
  const t = text.trim()
  if (/[.!?;:](?:\s|$)/.test(t) || spracheVon(t) === 'de') return false
  const w = t.split(/\s+/).map((x) => x.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '')).filter((x) => x && !/^\d/.test(x))
  if (w.length < 2 || w.length > 6) return false
  const gross = w.filter((x) => /^\p{Lu}/u.test(x)).length
  return gross >= 2 && w.every((x) => /^\p{Lu}/u.test(x) || BINDEWOERTER.has(x.toLowerCase()))
}

/**
 * Löst der Text das Kürzel auf? Die Anfangsbuchstaben seiner Wörter
 * enthalten die Buchstaben des Kürzels der Reihe nach, der erste passt zum
 * ersten: „SERA" ↔ „Standardised European Rules of the Air", „EASA" ↔
 * „European Union Aviation Safety Agency". Eine Auflösung in einer
 * Abkürzungsliste ist so erkennbar — ein Arbeitskommentar neben einem
 * Kürzel („MMO | Bitte noch prüfen …") nicht (FRD-17).
 */
export function loestAuf(kuerzel: string, text: string): boolean {
  const k = kuerzel.replace(/[^\p{L}]/gu, '').toLowerCase()
  const anfaenge = (text.match(/\p{L}+/gu) ?? []).map((x) => x[0].toLowerCase())
  if (k.length < 2 || anfaenge[0] !== k[0]) return false
  let i = 0
  for (const a of anfaenge) if (a === k[i]) i++
  return i >= k.length
}
