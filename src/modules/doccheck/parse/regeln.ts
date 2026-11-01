import type { Rechtscharakter } from './model'

/**
 * Regel-IDs des EASA-Regelwerks erkennen (Spez. 7.5).
 *
 * Die Muster der Spezifikation erfassen „ORA.ATO.230" und „AMC1
 * ORA.ATO.230(a)", aber nicht die zweigliedrigen IDs aus Part-FCL und
 * Part-MED („FCL.625", „MED.B.001") und nicht die Certification
 * Specifications. Sie sind hier ergänzt — mit fester Präfixliste, damit
 * „FIG.123" oder „REV.001" kein Regelverweis wird.
 */

const PRAEFIX_KURZ = 'FCL|MED|SERA|ARA|ORA|ORO|CAT|SPA|NCC|NCO|SPO|DTO|ATO|ADR|ATCO|FSTD'
const KLAMMERN = '(?:\\([a-z0-9]+\\))*'

export const AMC_GM = new RegExp(`\\b(?:AMC|GM)\\d*\\s+(?:[A-Z]{2,4}(?:\\.[A-Z]{1,4})*\\.\\d{3}[A-Z]?|CS[- ][A-Z]+(?:\\([A-Z]\\))?\\.?\\d*)${KLAMMERN}`, 'g')
export const IR = new RegExp(`\\b(?:[A-Z]{3}\\.[A-Z]{3,4}\\.\\d{3}[A-Z]?|(?:${PRAEFIX_KURZ})\\.(?:[A-Z]\\.)?\\d{3}[A-Z]?)${KLAMMERN}`, 'g')
export const CS = /\bCS-[A-Z]+(?:\([A-Z]\))?(?:\s+[A-Z]+\.\d+[A-Z]?)?/g

/** Alle Regel-IDs einer Seite, ohne Dubletten, in Reihenfolge des Auftretens. */
export function regelIds(text: string): string[] {
  const treffer: { i: number; s: string }[] = []
  const amcGm = [...text.matchAll(AMC_GM)].map((m) => ({ i: m.index!, s: m[0].replace(/\s+/g, ' ') }))
  treffer.push(...amcGm)
  // Ein IR-Treffer INNERHALB eines AMC/GM-Treffers ist derselbe Verweis —
  // „AMC1 ORA.ATO.230" soll nicht zusätzlich als „ORA.ATO.230" zählen.
  const innen = (i: number) => amcGm.some((a) => i >= a.i && i < a.i + a.s.length)
  for (const m of text.matchAll(IR)) if (!innen(m.index!)) treffer.push({ i: m.index!, s: m[0] })
  for (const m of text.matchAll(CS)) if (!innen(m.index!)) treffer.push({ i: m.index!, s: m[0] })
  return [...new Set(treffer.sort((a, b) => a.i - b.i).map((t) => t.s))]
}

/**
 * Rechtscharakter einer Seite: Was steht als Überschrift am Zeilenanfang?
 * Eine IR-Seite zitiert oft AMC und umgekehrt — entscheidend ist, was die
 * Seite SELBST ist, nicht was sie erwähnt. Ohne Regelüberschrift gilt der
 * Charakter des Dokuments (z. B. OEM).
 */
export function rechtscharakter(text: string, vorgabe?: Rechtscharakter): Rechtscharakter | undefined {
  const zaehler: Record<string, number> = {}
  for (const zeile of text.split('\n')) {
    const z = zeile.trim()
    let art: Rechtscharakter | null = null
    if (/^AMC\d*\s/.test(z)) art = 'AMC'
    else if (/^GM\d*\s/.test(z)) art = 'GM'
    else if (/^CS[- ]/.test(z)) art = 'CS'
    else if (new RegExp(`^${IR.source}`).test(z)) art = 'IR'
    if (art) zaehler[art] = (zaehler[art] ?? 0) + 1
  }
  const arten = Object.keys(zaehler) as Rechtscharakter[]
  if (arten.length === 0) return vorgabe
  if (arten.length > 1) return 'mixed'
  return arten[0]
}
