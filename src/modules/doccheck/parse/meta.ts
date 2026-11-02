/**
 * Metadaten aus Deckblatt und ersten Seiten erkennen (Spez. 6.10).
 *
 * Erkannte Werte sind Vorschläge: Die Oberfläche markiert sie als
 * „erkannt", der Nutzer bestätigt. Deshalb lieber einen Wert nicht finden
 * als einen falschen finden — ein falsch erkanntes Datum, das niemand
 * prüft, steht sonst im Bericht.
 */

export interface ErkannteMeta {
  titel?: string
  nummer?: string
  revision?: string
  datum?: string // YYYY-MM-DD
  typ?: string
}

const MONATE: Record<string, number> = {
  jan: 1, january: 1, januar: 1, jänner: 1, feb: 2, february: 2, februar: 2, mar: 3, march: 3, mär: 3, märz: 3, apr: 4, april: 4,
  may: 5, mai: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, dez: 12, dezember: 12,
}

const iso = (j: number, m: number, t: number) => {
  if (j < 1950 || j > 2100 || m < 1 || m > 12 || t < 1 || t > 31) return undefined
  const d = new Date(Date.UTC(j, m - 1, t))
  if (d.getUTCMonth() !== m - 1) return undefined // 31.02. gibt es nicht
  return `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`
}

/**
 * Gängige Datumsformate. Bewusst NICHT: MM/DD/YYYY und DD/MM/YYYY — „03/04/2026"
 * ist ohne Herkunft nicht eindeutig, und ein vertauschtes Datum ist schlimmer
 * als keins.
 */
export function datumFinden(text: string): string | undefined {
  const kandidaten: { i: number; d?: string }[] = []
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) kandidaten.push({ i: m.index!, d: iso(+m[1], +m[2], +m[3]) })
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) kandidaten.push({ i: m.index!, d: iso(+m[3], +m[2], +m[1]) })
  for (const m of text.matchAll(/\b(\d{1,2})[\s-]+([A-Za-zäÄ]{3,9})\.?[\s-]+(\d{4})\b/g)) {
    const mo = MONATE[m[2].toLowerCase()]
    if (mo) kandidaten.push({ i: m.index!, d: iso(+m[3], mo, +m[1]) })
  }
  for (const m of text.matchAll(/\b([A-Za-zäÄ]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})\b/g)) {
    const mo = MONATE[m[1].toLowerCase()]
    if (mo) kandidaten.push({ i: m.index!, d: iso(+m[3], mo, +m[2]) })
  }
  return kandidaten.filter((k) => k.d).sort((a, b) => a.i - b.i)[0]?.d
}

/** „Rev. 0.0", „Revision 3", „Edition 1", „Issue 3", „Ed. 2 Rev. 1" — Schlüsselwort bleibt erhalten. */
export function revisionFinden(text: string): string | undefined {
  const m = text.match(/\b(Edition|Ed\.|Issue|Revision|Rev\.?)\s*(?:No\.?|Nr\.?|Number)?\s*:?\s*([0-9]+(?:[.-][0-9]+)*[A-Z]?|[A-Z](?![a-z]))(?:\s*,?\s*(Rev(?:ision)?\.?)\s*:?\s*([0-9]+(?:\.[0-9]+)*))?/)
  if (!m) return undefined
  const wort = (w: string) => (w === 'Revision' ? w : w.startsWith('Rev') ? 'Rev' : w === 'Ed.' ? 'Edition' : w)
  const teil1 = `${wort(m[1])} ${m[2]}`
  return m[3] ? `${teil1} ${wort(m[3])} ${m[4]}` : teil1
}

/**
 * Revision aus dem Dateinamen — Rückfall, wenn das Deckblatt keine nennt.
 * „TM_E2R0.1.docx" → „Edition 2 Rev 0.1", „OMM Rev 3.pdf" / „PLM_R0.1.pdf"
 * → „Rev 0.1". Vorher erschien „Revision ist Pflicht" rot, obwohl die
 * Revision im Namen stand (UX-Prüfung 01.11.2026). „R" nur nach einem
 * Trenner und direkt vor der Zahl: „Report 2" ist keine Revision.
 */
export function revisionAusDateiname(name: string): string | undefined {
  const stamm = name.replace(/\.[a-z0-9]{2,5}$/i, '')
  const er = stamm.match(/(?:^|[\s_.-])E(?:d(?:ition)?)?[\s_-]?(\d+)[\s_-]?R(?:ev)?[\s_-]?(\d+(?:\.\d+)*)(?=$|[\s_-])/i)
  if (er) return `Edition ${er[1]} Rev ${er[2]}`
  const r = stamm.match(/(?:^|[\s_.-])(?:Rev(?:ision)?\.?|R)[\s_-]?(\d+(?:\.\d+)*)(?=$|[\s_-])/i)
  return r ? `Rev ${r[1]}` : undefined
}

const NUMMER_WORT = /\b(?:Doc(?:ument)?\.?\s*(?:No\.?|Nr\.?|Number|ID)|P\/N|Part\s*No\.?|Manual\s*No\.?|Reference|Ref\.)\s*:?\s*/gi
// Der Wert in Großbuchstaben und mit mindestens einer Ziffer — das Schlüsselwort
// darf beliebig geschrieben sein. Vorher galt die Groß-/Kleinschreibung für
// beides nicht, und aus „Exercise reference list:" wurde die Nummer „list"
// (Audit 11/2026, DC-06).
const NUMMER_WERT = /^(?=[A-Z0-9\-./]*\d)[A-Z0-9][A-Z0-9\-./]{2,}/

export function nummerFinden(text: string): string | undefined {
  for (const m of text.matchAll(NUMMER_WORT)) {
    const w = text.slice(m.index! + m[0].length).match(NUMMER_WERT)?.[0].replace(/[./-]+$/, '')
    // „Reference 2.1" ist ein Kapitelverweis, keine Dokumentnummer
    if (w && w.length >= 3 && !/^\d+(\.\d+)+$/.test(w)) return w
  }
  return undefined
}

const TITEL_WORT = /\b(manual|handbook|guide|procedures?|checklist|programme|program|handbuch|syllabus|reference)\b/i

/** Überschriften von Verzeichnissen — sie stehen oben auf der Seite, sind aber nicht der Titel (DC-06). */
const VERZEICHNIS = /^(table of contents|contents|inhalt|inhaltsverzeichnis|list of effective pages|record of revisions|index)\s*:?$/i

/** Zeile, die als Titel bzw. Deckblattangabe taugt: kein Verzeichniskopf, keine Tabellenzeile mit drei und mehr Zellen (Kopf einer Excel-Liste). */
function kopfzeile(z: string): boolean {
  return !VERZEICHNIS.test(z.trim()) && (z.match(/ \| /g) ?? []).length < 2
}

export function titelFinden(zeilen: string[]): string | undefined {
  const brauchbar = zeilen
    .filter(kopfzeile)
    .map((z) => z.replace(/\s*\|\s*/g, ' ').trim())
    .filter((z) => z.length >= 8 && z.length <= 120 && /[A-Za-z]{3}/.test(z) && !revisionFinden(z) && !datumFinden(z) && !nummerFinden(z))
    // Einträge eines Inhaltsverzeichnisses („4 Normal Procedures 5") sind
    // keine Titel — gefunden beim Browsertest mit SBX-PAGE-01.
    .filter((z) => !/^\d+(\.\d+)*\.?\s+\S.*?[\s.\u2026]\d{1,4}$/.test(z))
  return brauchbar.find((z) => TITEL_WORT.test(z)) ?? brauchbar[0]
}

const TYPEN: [RegExp, string][] = [
  [/\bpilot learning manual\b|\bPLM\b/i, 'PLM'],
  [/\boperations manual\b|\bOM-?[A-D]?\b/i, 'OM'],
  [/\btraining manual\b|\bTM\b/i, 'TM'],
  [/\bcompliance monitoring manual\b|\bCMM\b/i, 'CMM'],
  [/\bflight manual\b|\bAFM\b/i, 'AFM'],
  [/\bquick reference\b|\bQRH\b/i, 'QRH'],
  [/\bpilot'?s? operating handbook\b|\bPOH\b/i, 'POH'],
  [/\bstandard operating procedures\b|\bSOP\b/i, 'SOP'],
  [/\bpilot'?s guide\b|\bavionics\b|\bG\d{3,4}\b/i, 'AVIONICS'],
  [/\beasy access rules\b|\bimplementing rules?\b/i, 'IR'],
  [/\bchecklist\b|\bform\b|\bformular\b/i, 'FORM'],
]

export function typFinden(text: string): string | undefined {
  return TYPEN.find(([re]) => re.test(text))?.[1]
}

/** Wie viele Zeilen der ersten Seite als Deckblatt für den Typ gelten — mehr ist schon Fließtext. */
export const DECKBLATT_ZEILEN = 3

/**
 * Alle Felder aus den ersten Seiten (und, bei DOCX, den Eigenschaften).
 * Eigenschaften gehen vor: Sie hat jemand bewusst eingetragen.
 */
export function metaErkennen(ersteSeiten: string[], eigenschaften: Record<string, string> = {}, dateiname = ''): ErkannteMeta {
  const text = ersteSeiten.join('\n')
  const zeilen = ersteSeiten[0]?.split('\n') ?? []
  const titel = eigenschaften.title?.trim() || titelFinden(zeilen)
  const deckblatt = zeilen.filter((z) => z.trim() && kopfzeile(z)).slice(0, DECKBLATT_ZEILEN).join('\n')
  return {
    titel,
    nummer: eigenschaften.docNumber?.trim() || nummerFinden(text),
    revision: eigenschaften.revision?.trim() || revisionFinden(text),
    datum: datumFinden(text),
    // Der Titel sagt, was das Dokument IST; der Fließtext nur, was es
    // erwähnt. „Training manual" in einem EASA-Auszug macht ihn nicht zum
    // TM, „See TM chapter 2.1" einen Appendix ebenso wenig — und der so
    // „erkannte" Typ ging bis in die Befund-IDs (Audit 11/2026, DC-06).
    // Deshalb nur Titel, Betreff, Dateiname und die obersten Zeilen.
    typ: typFinden(titel ?? '') ?? typFinden(eigenschaften.subject ?? '') ?? typFinden(dateiname.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_.]+/g, ' ')) ?? typFinden(deckblatt),
  }
}
