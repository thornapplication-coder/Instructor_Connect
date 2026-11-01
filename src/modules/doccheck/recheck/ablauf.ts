import { csvRow } from '../../../csv'
import { formatDate, formatDateTime } from '../../../datum'
import { xlsxTabellen } from '../parse/xlsx'
import { csvLesen } from '../referenz/liste'
import type { SitzungsDok } from '../sitzung'
import { befundeLesen, kopfzeileFinden, zielVorschlagen, zuordnungVorschlagen, type FremdBefund, type Rolle, type Ziel, type Zuordnung } from './fremdliste'
import { profilLaden, profilSpeichern } from './profil'
import { remark, STATUS_NAME, type ReErgebnis, type RemarkSprache, type ReStatus } from './pruefen'
import type { RueckschreibAuftrag, WerteZuordnung } from './rueckschreiben'

/**
 * Ablauf des Re-Checks (N3.1) als reine Übergänge auf dem Sitzungsstand.
 * Die Fremdliste liegt wie jedes Prüfdokument nur im Speicher des Tabs;
 * was bleibt, ist das Listenprofil (nur Spaltennummern) und je bestätigtem
 * Vorschlag eine Audit-Zeile ohne Inhalt.
 */

export interface Bestaetigung {
  status: ReStatus
  von: string
  at: number
}

export interface ReCheckSitzung {
  datei: string
  blaetter: { name: string; zeilen: string[][]; zeilenNr?: number[] }[]
  /** Originaldatei (nur XLSX) — fürs Rückschreiben; bleibt wie alles hier im Speicher */
  original?: Uint8Array
  blatt: number
  kopf: number
  zuordnung: Zuordnung
  /** Zuordnung kam aus einem gespeicherten Listenprofil */
  ausProfil: boolean
  /** Wert der Spalte „Dokument/Bereich" → Ziel */
  ziele: Record<string, Ziel>
  befunde: FremdBefund[]
  /** null = noch nicht (oder nach einer Änderung nicht mehr) geprüft */
  ergebnisse: ReErgebnis[] | null
  /** Schlüssel: Zeile im Blatt — Nummern einer Fremdliste sind nicht immer eindeutig */
  bestaetigt: Record<number, Bestaetigung>
  sprache: RemarkSprache
  /** Stand des Pakets bei der letzten Prüfung (`paketStand`) */
  geprueftGegen?: string
}

type Ablage = Pick<Storage, 'getItem' | 'setItem'>

export async function listeLesen(name: string, daten: Uint8Array): Promise<ReCheckSitzung['blaetter']> {
  if (/\.xlsx$/i.test(name)) return (await xlsxTabellen(daten)).filter((b) => b.zeilen.length)
  if (/\.(csv|txt)$/i.test(name)) {
    const zeilen = csvLesen(new TextDecoder().decode(daten))
    return zeilen.length ? [{ name, zeilen }] : []
  }
  throw new Error('DC-RECHECK-FORMAT')
}

/** Namen, unter denen eine Fremdliste ein Prüfdokument nennen könnte. */
export function dokNamen(docs: SitzungsDok[]): { id: string; titel: string; namen: string[] }[] {
  return docs
    .filter((d) => d.rolle === 'review' && d.status === 'fertig')
    .map((d) => ({ id: d.id, titel: d.felder.titel || d.name, namen: [d.felder.typ, d.felder.nummer, d.felder.titel, d.name, d.z?.meta.titel ?? ''].filter(Boolean) }))
}

function zieleFuer(befunde: FremdBefund[], docs: SitzungsDok[], alt: Record<string, Ziel> = {}): Record<string, Ziel> {
  const namen = dokNamen(docs)
  const out: Record<string, Ziel> = {}
  for (const b of befunde) if (!(b.dokument in out)) out[b.dokument] = alt[b.dokument] ?? zielVorschlagen(b.dokument, namen)
  return out
}

export function blattWaehlen(datei: string, blaetter: ReCheckSitzung['blaetter'], blatt: number, docs: SitzungsDok[], ablage: Ablage, original?: Uint8Array): ReCheckSitzung {
  const zeilen = blaetter[blatt]?.zeilen ?? []
  const zeilenNr = blaetter[blatt]?.zeilenNr
  const kopf = kopfzeileFinden(zeilen)
  const profil = zeilen[kopf] ? profilLaden(zeilen[kopf], ablage) : null
  const zuordnung = profil ?? zuordnungVorschlagen(zeilen[kopf] ?? [])
  const befunde = befundeLesen(zeilen, kopf, zuordnung, zeilenNr)
  return { datei, blaetter, ...(original ? { original } : {}), blatt, kopf, zuordnung, ausProfil: !!profil, ziele: zieleFuer(befunde, docs), befunde, ergebnisse: null, bestaetigt: {}, sprache: 'de' }
}

/** Spalte einer Rolle ändern (null = keine). Eine Spalte gehört höchstens einer Rolle. */
export function zuordnungAendern(r: ReCheckSitzung, rolle: Rolle, spalte: number | null, docs: SitzungsDok[]): ReCheckSitzung {
  const z: Zuordnung = Object.fromEntries(Object.entries(r.zuordnung).filter(([k, v]) => k !== rolle && v !== spalte))
  if (spalte !== null) z[rolle] = spalte
  const befunde = befundeLesen(r.blaetter[r.blatt].zeilen, r.kopf, z, r.blaetter[r.blatt].zeilenNr)
  return { ...r, zuordnung: z, ausProfil: false, befunde, ziele: zieleFuer(befunde, docs, r.ziele), ergebnisse: null, bestaetigt: {} }
}

export function zielAendern(r: ReCheckSitzung, wert: string, ziel: Ziel): ReCheckSitzung {
  return { ...r, ziele: { ...r.ziele, [wert]: ziel }, ergebnisse: null, bestaetigt: {} }
}

/**
 * Kennung des Paketstands: Kommt ein Dokument dazu, läuft OCR oder ändert
 * ein Word-PDF-Paar die Seiten, gelten die Vorschläge nicht mehr — die
 * Oberfläche sagt es, statt sie still zu verwerfen (Bestätigungen hängen dran).
 */
export function paketStand(docs: SitzungsDok[]): string {
  return docs
    .filter((d) => d.rolle === 'review' && d.status === 'fertig' && d.z)
    .map((d) => `${d.id}:${d.z!.zeichen}:${d.z!.ocrSeiten}:${d.z!.seitenQuelle}`)
    .join('|')
}

/** Neu hinzugekommene Prüfdokumente: noch fehlende Quellen erneut vorschlagen. */
export function zieleAuffrischen(r: ReCheckSitzung, docs: SitzungsDok[]): ReCheckSitzung {
  const behalten = Object.fromEntries(Object.entries(r.ziele).filter(([, z]) => z.art !== 'fehlt'))
  const ziele = zieleFuer(r.befunde, docs, behalten)
  return JSON.stringify(ziele) === JSON.stringify(r.ziele) ? r : { ...r, ziele, ergebnisse: null, bestaetigt: {} }
}

/** Zuordnung bestätigt → Profil merken (N3.1 Schritt 2) und Aufträge für den Worker. */
export function auftraege(r: ReCheckSitzung, ablage: Ablage): { befund: FremdBefund; ziel: Ziel }[] {
  const kopf = r.blaetter[r.blatt]?.zeilen[r.kopf]
  if (kopf) profilSpeichern(kopf, r.zuordnung, ablage)
  return r.befunde.map((befund) => ({ befund, ziel: r.ziele[befund.dokument] ?? { art: 'fehlt' } }))
}

export function bestaetigen(r: ReCheckSitzung, zeilen: number[], von: string, at: number): ReCheckSitzung {
  if (!r.ergebnisse) return r
  const neu = { ...r.bestaetigt }
  for (const z of zeilen) {
    const e = r.ergebnisse.find((x) => x.zeile === z)
    if (e) neu[z] = { status: e.status, von, at }
  }
  return { ...r, bestaetigt: neu }
}

export function zuruecknehmen(r: ReCheckSitzung, zeile: number): ReCheckSitzung {
  const { [zeile]: _weg, ...rest } = r.bestaetigt
  return { ...r, bestaetigt: rest }
}

/** Sammelbestätigung (N11): alle noch offenen Vorschläge „Resolved". Nur
 *  die — ein „Not resolved" bestätigt man nicht im Vorbeigehen. */
export function sammelKandidaten(r: ReCheckSitzung): number[] {
  return (r.ergebnisse ?? []).filter((e) => e.status === 'resolved' && !r.bestaetigt[e.zeile]).map((e) => e.zeile)
}

export interface Filter {
  status: ReStatus | 'alle'
  dok: string | 'alle'
  nurAbweichung: boolean
}

export interface Zeile {
  befund: FremdBefund
  ergebnis: ReErgebnis
}

export function zeilen(r: ReCheckSitzung, f: Filter): Zeile[] {
  if (!r.ergebnisse) return []
  return r.befunde
    .map((befund) => ({ befund, ergebnis: r.ergebnisse!.find((e) => e.zeile === befund.zeile)! }))
    .filter(({ befund, ergebnis }) => ergebnis && (f.status === 'alle' || ergebnis.status === f.status) && (f.dok === 'alle' || befund.dokument === f.dok) && (!f.nurAbweichung || ergebnis.abweichung))
}

export function zaehlen(r: ReCheckSitzung): Record<ReStatus, number> {
  const n: Record<ReStatus, number> = { resolved: 0, partial: 0, open: 0, unverifiable: 0, justify: 0 }
  for (const e of r.ergebnisse ?? []) n[e.status]++
  return n
}

/**
 * Export der Vorschläge als CSV (bis das Rückschreiben in die
 * Originaldatei, N3.5, steht). Kopf englisch wie jeder DocCheck-Export;
 * Remarks in der gewählten Sprache.
 */
export function csvExport(r: ReCheckSitzung, datum: string, name: (id: string) => string): string {
  // N11: „Confirmed by / on" — wer und wann, beides.
  const kopf = ['Row', 'No.', 'Document', 'Page (list)', 'Team status', 'Proposed status', 'Deviation', 'Confirmed status', 'Confirmed by', 'Confirmed on', 'Remark']
  const reihen = (r.ergebnisse ?? []).map((e) => {
    const b = r.befunde.find((x) => x.zeile === e.zeile)!
    const ok = r.bestaetigt[e.zeile]
    return csvRow([b.excelZeile ?? e.zeile + 1, b.ref, b.dokument, b.seite, b.teamStatus, STATUS_NAME[e.status], e.abweichung ? 'yes' : '', ok ? STATUS_NAME[ok.status] : '', ok ? name(ok.von) : '', ok ? formatDateTime(ok.at) : '', remark(e, datum, r.sprache)])
  })
  return [csvRow(kopf), ...reihen].join('')
}

/* ----------------------------- Rückschreiben ----------------------------- */

/** Geht das Rückschreiben? Nur bei XLSX mit Originaldatei und Excel-Zeilen. */
export function kannZurueckschreiben(r: ReCheckSitzung): boolean {
  return !!r.original && !!r.blaetter[r.blatt]?.zeilenNr && !!r.ergebnisse
}

/**
 * Auftrag fürs Rückschreiben (N3.5). Geschrieben werden NUR bestätigte
 * Vorschläge (N11) — ein Vorschlag im Original des Teams sähe aus wie eine
 * Entscheidung. Der Status folgt der Werteliste der Fremdliste; ohne
 * passenden Wert bleibt die Zelle, und der Remark sagt, was gilt.
 */
export function rueckschreibAuftrag(r: ReCheckSitzung, werte: WerteZuordnung, datum: string): RueckschreibAuftrag {
  const b = r.blaetter[r.blatt]
  const zeilen = (r.ergebnisse ?? [])
    .filter((e) => r.bestaetigt[e.zeile])
    .map((e) => {
      const f = r.befunde.find((x) => x.zeile === e.zeile)!
      return { excelZeile: f.excelZeile!, status: werte[r.bestaetigt[e.zeile].status], remark: remark(e, datum, r.sprache) }
    })
    .filter((z) => z.excelZeile)
  return {
    blatt: b.name,
    kopfZeile: b.zeilenNr![r.kopf],
    ...(r.zuordnung.status !== undefined ? { statusSpalte: r.zuordnung.status } : {}),
    remarkTitel: r.sprache === 'de' ? `Remark Re-Check ${formatDate(datum.slice(0, 10))}` : `Remark re-check ${datum.slice(0, 10)}`,
    zeilen,
  }
}
