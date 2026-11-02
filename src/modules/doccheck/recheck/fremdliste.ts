import { vergleichsform } from '../parse/seitenzuordnung'

/**
 * Fremde Findinglisten (Nachtrag N3.1): eigene Excel des Teams, Liste
 * einer Behörde, Audit-Liste. Jede hat ihr eigenes Layout — DocCheck
 * schlägt die Spaltenzuordnung vor, die Person bestätigt.
 */

export type Rolle = 'id' | 'dokument' | 'seite' | 'kapitel' | 'befund' | 'empfehlung' | 'status' | 'kommentar' | 'verantwortlich' | 'prioritaet'

/** `prioritaet` zuletzt: Sie wird nur fürs Blatt „New findings" gebraucht (N3.5) und darf keiner anderen Rolle eine Spalte wegnehmen. */
export const ROLLEN: Rolle[] = ['id', 'dokument', 'seite', 'kapitel', 'befund', 'empfehlung', 'status', 'kommentar', 'verantwortlich', 'prioritaet']

/** Synonyme der Spaltenköpfe in Vergleichsform (deutsch und englisch). */
export const SYNONYME: Record<Rolle, string[]> = {
  id: ['nr', 'no', 'id', 'findingno', 'findingnr', 'lfdnr', 'nummer', 'number', 'ref', 'reference'],
  dokument: ['dokument', 'document', 'bereich', 'area', 'manual', 'doc', 'handbuch', 'betroffenesdokument'],
  seite: ['seite', 'page', 'pg', 'seiten', 'pages'],
  kapitel: ['kapitel', 'chapter', 'section', 'abschnitt', 'para', 'paragraph'],
  befund: ['befund', 'finding', 'beschreibung', 'description', 'observation', 'feststellung', 'issue', 'findingdescription'],
  empfehlung: ['empfehlung', 'recommendation', 'korrektur', 'correction', 'proposal', 'vorschlag', 'action', 'korrekturvorschlag', 'proposedcorrection'],
  status: ['status', 'statuscompliance', 'state', 'zustand', 'compliancestatus'],
  kommentar: ['kommentar', 'comment', 'comments', 'remark', 'bemerkung', 'teamcomment', 'antwort', 'response', 'stellungnahme'],
  verantwortlich: ['verantwortlich', 'responsible', 'owner', 'zustaendig', 'zuständig'],
  prioritaet: ['priorität', 'prioritaet', 'priority', 'prio', 'severity', 'schweregrad', 'kritikalität', 'criticality'],
}

export type Zuordnung = Partial<Record<Rolle, number>>

export function zuordnungVorschlagen(kopf: string[]): Zuordnung {
  const formen = kopf.map(vergleichsform)
  const out: Zuordnung = {}
  const vergeben = new Set<number>()
  for (const r of ROLLEN) {
    // Erst exakte Synonyme, dann „beginnt mit" (z. B. „Status Compliance 2026").
    let i = formen.findIndex((f, k) => !vergeben.has(k) && SYNONYME[r].includes(f))
    if (i < 0) i = formen.findIndex((f, k) => !vergeben.has(k) && f.length > 2 && SYNONYME[r].some((s) => s.length > 2 && f.startsWith(s)))
    if (i >= 0) {
      out[r] = i
      vergeben.add(i)
    }
  }
  return out
}

/**
 * Kopfzeile: die erste der ersten zehn Zeilen, in der Befund UND eine weitere
 * Rolle erkannt werden; -1, wenn keine.
 *
 * Vorher galt ohne Treffer Zeile 0 als Kopf — bei einer Liste ohne
 * Kopfzeile also die erste BEFUNDZEILE: Sie wurde nie geprüft, und ihr Text
 * landete als Schlüssel des Listenprofils dauerhaft im Browser, auch über
 * das Abmelden hinaus (Audit 11/2026, SEC-02). Mit -1 liest `befundeLesen`
 * ab Zeile 0, und die Spalten ordnet der Nutzer zu, statt dass geraten wird.
 */
export function kopfzeileFinden(zeilen: string[][]): number {
  return zeilen.slice(0, 10).findIndex((z) => {
    const v = zuordnungVorschlagen(z)
    return v.befund !== undefined && Object.keys(v).length >= 2
  })
}

export interface FremdBefund {
  /** Nummer aus der Liste, sonst „Zeile n" */
  ref: string
  /** Rasterzeile (0-basiert, leere Zeilen übersprungen) — Schlüssel in der Sitzung */
  zeile: number
  /** Zeile in Excel (ab 1) — fürs Rückschreiben; fehlt bei CSV */
  excelZeile?: number
  dokument: string
  seite: string
  kapitel: string
  befund: string
  empfehlung: string
  teamStatus: string
  kommentar: string
  verantwortlich: string
}

/** `kopf` −1: Liste ohne Kopfzeile, Befunde ab der ersten Zeile. */
export function befundeLesen(zeilen: string[][], kopf: number, z: Zuordnung, zeilenNr?: number[]): FremdBefund[] {
  const zelle = (row: string[], r: Rolle) => (z[r] !== undefined ? (row[z[r]!] ?? '').trim() : '')
  return zeilen
    .slice(kopf + 1)
    .map((row, i) => ({ row, zeile: kopf + 1 + i }))
    .filter(({ row }) => zelle(row, 'befund') || zelle(row, 'empfehlung'))
    .map(({ row, zeile }) => ({
      ref: zelle(row, 'id') || `#${zeilenNr?.[zeile] ?? zeile + 1}`,
      zeile,
      ...(zeilenNr?.[zeile] ? { excelZeile: zeilenNr[zeile] } : {}),
      dokument: zelle(row, 'dokument'),
      seite: zelle(row, 'seite'),
      kapitel: zelle(row, 'kapitel'),
      befund: zelle(row, 'befund'),
      empfehlung: zelle(row, 'empfehlung'),
      teamStatus: zelle(row, 'status'),
      kommentar: zelle(row, 'kommentar'),
      verantwortlich: zelle(row, 'verantwortlich'),
    }))
}

/* --------------------------- Dokumentzuordnung --------------------------- */

/** Wohin ein Wert der Spalte „Dokument/Bereich" zeigt (N3.1 Schritt 3). */
export type Ziel = { art: 'dok'; ids: string[] } | { art: 'paket' } | { art: 'fehlt' }

/** Werte, die kein Dokument meinen, sondern das ganze Paket. */
const PAKETWEIT = ['schreibweise', 'spelling', 'allgemein', 'general', 'alle', 'all', 'gesamt', 'paket', 'package', 'terminologie', 'terminology', 'layout', 'formal', 'diverse', 'various']

/** Normalform für Dokumentbezeichnungen: „APPENDIX 4" = „APX 4" = „Apx4". */
export function dokForm(s: string): string {
  return vergleichsform(s).replace(/appendix|apx/g, 'apx').replace(/annex|anx|anhang|anlage/g, 'anx').replace(/trainingmanual/g, 'tm')
}

/**
 * Normalformen aufeinanderfolgender Wörter (bis drei) eines Namens:
 * „SBX-PKG-01_TM_R0.1.docx" enthält „tm", „SBX Appendix 4 R0.1" enthält
 * „apx4". Ganze Wörter statt Teilzeichenketten — sonst steckte „TM" in
 * jedem „ATM".
 */
function fenster(name: string): string[] {
  const w = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const out: string[] = []
  for (let k = 1; k <= 3; k++) for (let i = 0; i + k <= w.length; i++) out.push(dokForm(w.slice(i, i + k).join('')))
  return out
}

/**
 * Vorschlag je Wert: passt er zu einem Prüfdokument (Kürzel, Titel,
 * Dateiname), wird es dieses; paketweite Wörter → Paket; sonst „Quelle
 * fehlt" — etwa „OSD", wenn das OSD nicht geladen ist. Raten wäre schlimmer:
 * ein Befund, der gegen das falsche Dokument geprüft wird, gilt als behoben.
 *
 * Treffer in drei Stufen, die genaueste gewinnt: ein Name, der ganz dem
 * Wert entspricht (Kürzel „TM"), dann ein ganzes Wort im Namen (Fenster,
 * etwa im Dateinamen), dann ein Teil eines längeren Namens. Vorher zählten
 * alle gleich, und ein Anhang, dessen Titel „TM" erwähnt, kam für den
 * Listenwert „TM" neben dem Training Manual mit (Audit 11/2026, DC-05).
 */
export function zielVorschlagen(wert: string, docs: { id: string; namen: string[] }[]): Ziel {
  const f = dokForm(wert)
  if (!f || PAKETWEIT.includes(vergleichsform(wert))) return { art: 'paket' }
  const stufen: ((n: string) => boolean)[] = [(n) => dokForm(n) === f, (n) => fenster(n).includes(f), (n) => f.length >= 5 && dokForm(n).includes(f)]
  for (const passt of stufen) {
    const treffer = docs.filter((d) => d.namen.some(passt))
    if (treffer.length) return { art: 'dok', ids: treffer.map((d) => d.id) }
  }
  return { art: 'fehlt' }
}
