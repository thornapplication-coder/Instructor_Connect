import { formatDate, lokalIso } from '../../../datum'
import { csvDatei } from '../export/csv'
import { xlsxTabellen } from '../parse/xlsx'
import { csvLesen, listeGroessePruefen } from '../referenz/liste'
import type { SitzungsDok } from '../sitzung'
import { befundeLesen, kopfzeileFinden, zielVorschlagen, zuordnungVorschlagen, type FremdBefund, type Rolle, type Ziel, type Zuordnung } from './fremdliste'
import { profilLaden, profilSpeichern } from './profil'
import { remark, STATUS_NAME, zitat, type ReErgebnis, type RemarkSprache, type ReStatus } from './pruefen'
import type { NeuesBlatt, RueckschreibAuftrag, WerteZuordnung } from './rueckschreiben'
import { neueBefundeFuer, type NeuerBefund } from './neueBefunde'
import type { Befund } from '../pruefung/befund'
import type { Korrektur } from '../paket/pruefen'
import type { RecheckEintrag } from '../access'
import type { CsvTrenner } from '../types'

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
  /** Pflicht, wenn vom Vorschlag abgewichen oder „Closed – justification required" bestätigt wird (N11) */
  begruendung?: string
  /** Vorschlag zum Zeitpunkt der Bestätigung — daran misst `nachLauf`, ob sie einen neuen Lauf überlebt */
  vorschlag?: ReStatus
}

export interface ReCheckSitzung {
  datei: string
  blaetter: { name: string; zeilen: string[][]; zeilenNr?: number[] }[]
  /** Originaldatei (nur XLSX) — fürs Rückschreiben; bleibt wie alles hier im Speicher */
  original?: Uint8Array
  blatt: number
  /** Rasterzeile der Kopfzeile; −1: keine erkannt, Befunde ab Zeile 0 (SEC-02) */
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
  /**
   * Stand des Pakets bei der letzten Prüfung (`paketStand`). Fehlt er neben
   * Ergebnissen, wurden Ziele oder Spalten seither geändert: Die Ergebnisse
   * sind veraltet, bleiben aber samt Bestätigungen stehen (DC-02).
   */
  geprueftGegen?: string
}

type Ablage = Pick<Storage, 'getItem' | 'setItem'>

export async function listeLesen(name: string, daten: Uint8Array): Promise<ReCheckSitzung['blaetter']> {
  listeGroessePruefen(daten.byteLength)
  if (/\.xlsx$/i.test(name)) return (await xlsxTabellen(daten)).filter((b) => b.zeilen.length)
  if (/\.(csv|txt)$/i.test(name)) {
    const zeilen = csvLesen(new TextDecoder().decode(daten))
    return zeilen.length ? [{ name, zeilen }] : []
  }
  throw new Error('DC-RECHECK-FORMAT')
}

/**
 * Namen, unter denen eine Fremdliste ein Prüfdokument nennen könnte: das
 * Paketkürzel, Typ, Nummer, Titel, Dateiname.
 *
 * Der Typ ist eine Kategorie, kein Name: Tragen zwei Prüfdokumente „TM",
 * bildete jeder Listenwert „TM" auf beide ab — und ein Befund zum Training
 * Manual galt als geprüft gegen den Anhang (Audit 11/2026, DC-05). Er zählt
 * deshalb nur, wenn genau EIN Prüfdokument ihn trägt.
 */
export function dokNamen(docs: SitzungsDok[]): { id: string; titel: string; namen: string[] }[] {
  const pruef = docs.filter((d) => d.rolle === 'review' && d.status === 'fertig')
  const typen = new Map<string, number>()
  for (const d of pruef) if (d.felder.typ) typen.set(d.felder.typ, (typen.get(d.felder.typ) ?? 0) + 1)
  return pruef.map((d) => ({
    id: d.id,
    titel: d.felder.titel || d.name,
    namen: [d.paket?.kuerzel ?? '', typen.get(d.felder.typ) === 1 ? d.felder.typ : '', d.felder.nummer, d.felder.titel, d.name, d.z?.meta.titel ?? ''].filter(Boolean),
  }))
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
  const profil = kopf >= 0 ? profilLaden(zeilen[kopf], ablage) : null
  const zuordnung = profil ?? (kopf >= 0 ? zuordnungVorschlagen(zeilen[kopf]) : {})
  const befunde = befundeLesen(zeilen, kopf, zuordnung, zeilenNr)
  return { datei, blaetter, ...(original ? { original } : {}), blatt, kopf, zuordnung, ausProfil: !!profil, ziele: zieleFuer(befunde, docs), befunde, ergebnisse: null, bestaetigt: {}, sprache: 'de' }
}

/**
 * Spalte einer Rolle ändern (null = keine). Eine Spalte gehört höchstens einer Rolle.
 *
 * Ergebnisse und Bestätigungen bleiben, soweit ihre Zeile noch ein Befund
 * ist; der Stand gilt als veraltet, und der nächste Lauf (`nachLauf`)
 * entscheidet, welche Bestätigung trägt. Vorher verwarf jede Spaltenänderung
 * ALLE Bestätigungen still (Audit 11/2026, DC-02). Eine Zeile, die nach der
 * neuen Zuordnung kein Befund mehr ist, nimmt ihre mit — wie viele das sind,
 * sagt `verlorenBei`, damit die Oberfläche vorher fragt.
 */
export function zuordnungAendern(r: ReCheckSitzung, rolle: Rolle, spalte: number | null, docs: SitzungsDok[]): ReCheckSitzung {
  const z: Zuordnung = Object.fromEntries(Object.entries(r.zuordnung).filter(([k, v]) => k !== rolle && v !== spalte))
  if (spalte !== null) z[rolle] = spalte
  const befunde = befundeLesen(r.blaetter[r.blatt].zeilen, r.kopf, z, r.blaetter[r.blatt].zeilenNr)
  const bleibt = new Set(befunde.map((b) => b.zeile))
  const ergebnisse = r.ergebnisse ? r.ergebnisse.filter((e) => bleibt.has(e.zeile)) : null
  const bestaetigt = Object.fromEntries(Object.entries(r.bestaetigt).filter(([zeile]) => bleibt.has(Number(zeile))))
  return { ...r, zuordnung: z, ausProfil: false, befunde, ziele: zieleFuer(befunde, docs, r.ziele), ergebnisse, bestaetigt, geprueftGegen: undefined }
}

/**
 * Ziel eines Listenwerts ändern: Die Vorschläge sind damit veraltet, die
 * Bestätigungen bleiben bis zum nächsten Lauf (Audit 11/2026, DC-02 — vorher
 * waren sie mit einem Griff in die Auswahl weg, ohne Hinweis).
 */
export function zielAendern(r: ReCheckSitzung, wert: string, ziel: Ziel): ReCheckSitzung {
  return { ...r, ziele: { ...r.ziele, [wert]: ziel }, geprueftGegen: undefined }
}

/** Wie viele Bestätigungen ein Übergang von `alt` nach `neu` kostet — Grundlage der Rückfrage vor Spalten-, Blatt- oder Listenwechsel. */
export function verlorenBei(alt: ReCheckSitzung | undefined, neu: ReCheckSitzung | undefined): number {
  return Object.keys(alt?.bestaetigt ?? {}).filter((z) => !neu?.bestaetigt[Number(z)]).length
}

/**
 * Stammen die Vorschläge von vor der letzten Änderung an Paket, Zielen oder
 * Spalten? Dann zeigt die Oberfläche den Hinweis und schreibt NICHT in die
 * Fremdliste zurück. Seit die Ergebnisse nach einer Zieländerung stehen
 * bleiben (DC-02), ginge sonst ein Remark „Behoben" mit Fundstellen aus dem
 * ALTEN Zieldokument in die Liste des Teams — vorher war nach einer
 * Zieländerung gar kein Ergebnis da (Gegenprüfung Audit 11/2026).
 */
export function istVeraltet(r: ReCheckSitzung | undefined, stand: string): boolean {
  return !!r?.ergebnisse && r.geprueftGegen !== stand
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

/**
 * Neu hinzugekommene Prüfdokumente: noch fehlende Quellen erneut vorschlagen.
 * Ergebnisse und Bestätigungen bleiben stehen, der Stand gilt als veraltet.
 * Vorher löschte schon das Hochladen eines weiteren Dokuments alle
 * Bestätigungen ohne Hinweis — nachgestellt: 8 bestätigt, nach dem Upload 0
 * (Audit 11/2026, DC-02). Was davon den nächsten Lauf nicht übersteht, zählt
 * und meldet `nachLauf`.
 */
export function zieleAuffrischen(r: ReCheckSitzung, docs: SitzungsDok[]): ReCheckSitzung {
  const behalten = Object.fromEntries(Object.entries(r.ziele).filter(([, z]) => z.art !== 'fehlt'))
  const ziele = zieleFuer(r.befunde, docs, behalten)
  return JSON.stringify(ziele) === JSON.stringify(r.ziele) ? r : { ...r, ziele, geprueftGegen: undefined }
}

/**
 * Zuordnung bestätigt → Profil merken (N3.1 Schritt 2) und Aufträge für den
 * Worker. Ohne Kopfzeile kein Profil: Woran sollte man die Liste beim
 * nächsten Mal erkennen, wenn nicht an einer Befundzeile (SEC-02)?
 */
export function auftraege(r: ReCheckSitzung, ablage: Ablage): { befund: FremdBefund; ziel: Ziel }[] {
  const kopf = r.kopf >= 0 ? r.blaetter[r.blatt]?.zeilen[r.kopf] : undefined
  if (kopf) profilSpeichern(kopf, r.zuordnung, ablage)
  return r.befunde.map((befund) => ({ befund, ziel: r.ziele[befund.dokument] ?? { art: 'fehlt' } }))
}

/**
 * Zeilen, die sich ohne Begründung bestätigen lassen: mit Ergebnis und nicht
 * „Closed – justification required". Die Begründungspflicht (N11) steht
 * damit HIER, nicht in einer Ansicht — die mobile Karte bot einen Knopf, der
 * „Begründung erforderlich" ohne Begründung bestätigte, und die Zeile ging
 * so ins Rückschreiben und in die CSV (Audit 11/2026, DC-09).
 */
export function ohneBegruendung(r: ReCheckSitzung, zeilen: number[]): number[] {
  return zeilen.filter((z) => r.ergebnisse?.some((e) => e.zeile === z && e.status !== 'justify'))
}

/**
 * Was eine Bestätigung ans Audit gibt: Nummer, Zeile der Liste (Excel-Zeile,
 * bei CSV ab 1) und Status. Die Zeile braucht `recheckAudit` als Ersatz,
 * wenn die Nummernspalte keine Nummer enthält (Audit 11/2026, SEC-06).
 */
export function auditEintraege(r: ReCheckSitzung, zeilen: { zeile: number; status: ReStatus }[]): RecheckEintrag[] {
  return zeilen.flatMap(({ zeile, status }) => {
    const b = r.befunde.find((x) => x.zeile === zeile)
    return b ? [{ ref: b.ref, zeile: b.excelZeile ?? b.zeile + 1, status: STATUS_NAME[status] }] : []
  })
}

export function bestaetigen(r: ReCheckSitzung, zeilen: number[], von: string, at: number): ReCheckSitzung {
  if (!r.ergebnisse) return r
  const neu = { ...r.bestaetigt }
  for (const z of ohneBegruendung(r, zeilen)) {
    const e = r.ergebnisse.find((x) => x.zeile === z)!
    neu[z] = { status: e.status, von, at, vorschlag: e.status }
  }
  return { ...r, bestaetigt: neu }
}

/**
 * Einzelbestätigung mit eigenem Status (N11): Die Person ist nicht an den
 * Vorschlag gebunden. Weicht sie ab — oder bestätigt sie „Closed –
 * justification required" —, ist eine Begründung Pflicht; sie steht im
 * Export und im Remark der zurückgeschriebenen Liste.
 */
export function bestaetigenMit(r: ReCheckSitzung, zeile: number, von: string, at: number, status: ReStatus, begruendung: string): ReCheckSitzung | 'begruendungFehlt' | 'unbekannt' {
  const e = r.ergebnisse?.find((x) => x.zeile === zeile)
  if (!e) return 'unbekannt'
  const text = begruendung.trim()
  if ((status !== e.status || status === 'justify') && text.length < 5) return 'begruendungFehlt'
  return { ...r, bestaetigt: { ...r.bestaetigt, [zeile]: { status, von, at, vorschlag: e.status, ...(text ? { begruendung: text } : {}) } } }
}

/**
 * Neuer Prüflauf: Eine Bestätigung bleibt, solange der Vorschlag für ihre
 * Zeile derselbe ist, auf den sie sich bezog. Vorher löschte „Erneut
 * prüfen" ALLE Bestätigungen ohne Rückfrage (UX-Prüfung 01.11.2026) —
 * stundenlange Freigabearbeit war mit einem Klick weg. Hat sich der
 * Vorschlag geändert, wäre die alte Freigabe eine Freigabe für etwas
 * anderes; sie fällt weg und wird gezählt, damit die Oberfläche es sagt.
 */
export function nachLauf(r: ReCheckSitzung, ergebnisse: ReErgebnis[], stand: string): { r: ReCheckSitzung; aufgehoben: number } {
  const bestaetigt: Record<number, Bestaetigung> = {}
  let aufgehoben = 0
  for (const [z, ok] of Object.entries(r.bestaetigt)) {
    const e = ergebnisse.find((x) => x.zeile === Number(z))
    if (e && ok.vorschlag === e.status) bestaetigt[Number(z)] = ok
    else aufgehoben++
  }
  return { r: { ...r, ergebnisse, geprueftGegen: stand, bestaetigt }, aufgehoben }
}

/** Remark samt Bestätigung: Bei Abweichung oder Begründung steht beides dabei. */
export function remarkBestaetigt(e: ReErgebnis, ok: Bestaetigung | undefined, datum: string, sprache: RemarkSprache): string {
  const basis = remark(e, datum, sprache)
  if (!ok || (ok.status === e.status && !ok.begruendung)) return basis
  const de = sprache === 'de'
  // Anführung je Sprache wie im übrigen Remark (EXP-20/TXT-13)
  const kopf = ok.status !== e.status ? (de ? `Abweichend bestätigt als ${zitat(STATUS_NAME[ok.status], 'de')}` : `Confirmed as ${zitat(STATUS_NAME[ok.status], 'en')} (deviating from the proposal)`) : de ? 'Bestätigt' : 'Confirmed'
  return `${basis}\n${kopf}${ok.begruendung ? (de ? ` – Begründung: ${ok.begruendung}` : ` – justification: ${ok.begruendung}`) : ''}`
}

export function zuruecknehmen(r: ReCheckSitzung, zeile: number): ReCheckSitzung {
  const { [zeile]: _weg, ...rest } = r.bestaetigt
  return { ...r, bestaetigt: rest }
}

/**
 * Sammelbestätigung (N11): „alle Resolved MIT NACHWEIS". Ein „Resolved",
 * das nur auf dem Fehlen eines Zitats beruht (`nurAbwesend`), gehört nicht
 * dazu — das prüft jemand einzeln. Und ein „Not resolved" bestätigt man
 * ohnehin nicht im Vorbeigehen.
 */
export function sammelKandidaten(r: ReCheckSitzung): number[] {
  return (r.ergebnisse ?? []).filter((e) => e.status === 'resolved' && e.grund !== 'nurAbwesend' && !r.bestaetigt[e.zeile]).map((e) => e.zeile)
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
 *
 * Dieselbe Form wie die Befund-CSV (`csvDatei`: BOM, alles gequotet, CRLF,
 * Umbrüche → „ / ", eingestellter Trenner) und das Datum ISO in Ortszeit.
 * Vorher entstand sie mit dem App-Helfer — LF, Umbrüche im Remark und
 * „01.11.2026 20:35" in einer englisch beschrifteten Spalte (Audit 11/2026,
 * EXP-17).
 */
export function csvExport(r: ReCheckSitzung, datum: string, name: (id: string) => string, trenner: CsvTrenner = ';'): string {
  // N11: „Confirmed by / on" — wer und wann, beides.
  const kopf = ['Row', 'No.', 'Document', 'Page (list)', 'Team status', 'Proposed status', 'Deviation', 'Confirmed status', 'Confirmed by', 'Confirmed on', 'Justification', 'Remark']
  const reihen = (r.ergebnisse ?? []).map((e) => {
    const b = r.befunde.find((x) => x.zeile === e.zeile)!
    const ok = r.bestaetigt[e.zeile]
    return [String(b.excelZeile ?? e.zeile + 1), b.ref, b.dokument, b.seite, b.teamStatus, STATUS_NAME[e.status], e.abweichung ? 'yes' : '', ok ? STATUS_NAME[ok.status] : '', ok ? name(ok.von) : '', ok ? lokalIso(ok.at).slice(0, 16).replace('T', ' ') : '', ok?.begruendung ?? '', remarkBestaetigt(e, ok, datum, r.sprache)]
  })
  return csvDatei([kopf, ...reihen], trenner)
}

/* ----------------------------- Rückschreiben ----------------------------- */

/** Geht das Rückschreiben? Nur bei XLSX mit Originaldatei und Excel-Zeilen. */
/**
 * Rückschreiben braucht eine Kopfzeile: Die Remark-Spalte bekommt dort ihren
 * Titel, und das Blatt „New findings" übernimmt Kopf und Regeln aus DERSELBEN
 * Zeile. Ohne Kopf stünde der Titel über einer Befundzeile (SEC-02).
 */
export function kannZurueckschreiben(r: ReCheckSitzung): boolean {
  return r.kopf >= 0 && !!r.original && !!r.blaetter[r.blatt]?.zeilenNr && !!r.ergebnisse
}

/**
 * Beschriftung der Spaltenauswahl: der Kopf der Spalte, ohne Kopfzeile ein
 * Beispiel aus der ersten Befundzeile (`beispiel: true`) — nur zur Anzeige,
 * gespeichert wird davon nichts (SEC-02). So breit wie die breiteste Zeile,
 * damit auch eine Spalte ohne Kopfzelle wählbar ist.
 */
export function spaltenWahl(r: ReCheckSitzung): { text: string; beispiel: boolean }[] {
  const zeilen = r.blaetter[r.blatt]?.zeilen ?? []
  const quelle = r.kopf >= 0 ? zeilen[r.kopf] : zeilen[0] ?? []
  const breite = Math.max(0, ...zeilen.map((z) => z.length))
  return Array.from({ length: breite }, (_, i) => ({ text: (quelle[i] ?? '').trim(), beispiel: r.kopf < 0 }))
}

/**
 * Auftrag fürs Rückschreiben (N3.5). Geschrieben werden NUR bestätigte
 * Vorschläge (N11) — ein Vorschlag im Original des Teams sähe aus wie eine
 * Entscheidung. Der Status folgt der Werteliste der Fremdliste; ohne
 * passenden Wert bleibt die Zelle, und der Remark sagt, was gilt.
 */
export function rueckschreibAuftrag(r: ReCheckSitzung, werte: WerteZuordnung, datum: string, neu?: NeuesBlatt): RueckschreibAuftrag {
  const b = r.blaetter[r.blatt]
  const zeilen = (r.ergebnisse ?? [])
    .filter((e) => r.bestaetigt[e.zeile])
    .map((e) => {
      const f = r.befunde.find((x) => x.zeile === e.zeile)!
      return { excelZeile: f.excelZeile!, status: werte[r.bestaetigt[e.zeile].status], remark: remarkBestaetigt(e, r.bestaetigt[e.zeile], datum, r.sprache) }
    })
    .filter((z) => z.excelZeile)
  return {
    blatt: b.name,
    kopfZeile: b.zeilenNr![r.kopf],
    ...(r.zuordnung.status !== undefined ? { statusSpalte: r.zuordnung.status } : {}),
    remarkTitel: r.sprache === 'de' ? `Remark Re-Check ${formatDate(datum.slice(0, 10))}` : `Remark re-check ${datum.slice(0, 10)}`,
    zeilen,
    ...(neu && neu.zeilen.length ? { neu } : {}),
  }
}

/** Neue Befunde für diese Liste (N3.1 Schritt 6): nummeriert, ohne Restfundstellen alter Befunde, bezeichnet wie in der Liste, sonst mit dem Paketkürzel. */
export function neueBefunde(r: ReCheckSitzung, befunde: Befund[], docs: SitzungsDok[] = []): { liste: NeuerBefund[]; ausgenommen: number } {
  const kuerzel = Object.fromEntries(docs.flatMap((d) => (d.paket?.kuerzel ? [[d.id, d.paket.kuerzel]] : [])))
  return neueBefundeFuer(befunde, r.ergebnisse ?? [], r.befunde.map((b) => b.ref), r.ziele, kuerzel)
}

/**
 * Blatt „New findings" im Spaltenschema der Liste: Was die Liste als Spalte
 * hat (Nummer, Dokument, Seite, Kapitel, Befund, Priorität), steht dort;
 * Status ist der „offen"-Wert ihrer Werteliste, damit das Dropdown passt.
 * Was sie nicht hat, kommt rechts dazu — Kategorie und Verifizierung immer,
 * die Priorität nur, wenn die Liste keine eigene Spalte dafür führt.
 * Spaltenköpfe und Werte sind englisch, wie der Export.
 */
export function neuesBlatt(r: ReCheckSitzung, liste: NeuerBefund[], werte: WerteZuordnung, datum: string): NeuesBlatt {
  const z = r.zuordnung
  const breite = Math.max(1, ...r.blaetter[r.blatt].zeilen.map((x) => x.length))
  const prioSpalte = z.prioritaet ?? breite
  const zusatzKopf = [...(z.prioritaet === undefined ? ['Priority'] : []), 'Category', 'Verification']
  const kat = breite + (z.prioritaet === undefined ? 1 : 0)
  const zeilen = liste.map((n) => {
    const w: Record<number, string> = {}
    const setze = (rolle: Rolle, wert: string) => {
      if (z[rolle] !== undefined) w[z[rolle]!] = wert
    }
    setze('id', n.nr)
    setze('dokument', n.dokument)
    setze('seite', n.seite)
    setze('kapitel', n.kapitel)
    setze('befund', n.befund)
    if (werte.open) setze('status', werte.open)
    w[prioSpalte] = n.prioritaet
    w[kat] = n.kategorie
    w[kat + 1] = n.verifizierung
    return w
  })
  return {
    name: r.sprache === 'de' ? 'Neue Findings' : 'New findings',
    titel: `New findings – re-check ${datum.slice(0, 10)} – ${r.datei}`,
    zusatzKopf,
    zeilen,
    prio: { spalte: prioSpalte, hoch: 'High', mittel: 'Medium', niedrig: 'Low' },
  }
}

/**
 * Korrekturen für die Fix-Propagation (N2.1): Im Zieldokument ist der alte
 * Text weg, also muss er auch aus dessen Geschwistern verschwunden sein.
 * Nur BESTÄTIGTE Vorschläge (N11) — ein unbestätigter Vorschlag ist noch
 * keine Feststellung, aus der DocCheck weitere Befunde ableiten dürfte.
 * Das stand so in der Doku; der Code nahm bis zur Fachprüfung vom
 * 01.11.2026 auch unbestätigte.
 */
export function korrekturen(r: ReCheckSitzung | undefined): Korrektur[] {
  // Ziele oder Spalten seit dem Lauf geändert (DC-02: Ergebnisse bleiben
  // dann stehen): Die Feststellung „im Zieldokument weg" galt dem ALTEN Ziel
  // und darf erst nach dem nächsten Lauf auf ein anderes Dokument wirken.
  if (!r?.ergebnisse || r.geprueftGegen === undefined) return []
  return r.ergebnisse.flatMap((e) => {
    const ok = r.bestaetigt[e.zeile]
    if (!ok || (ok.status !== 'resolved' && ok.status !== 'partial')) return []
    if (e.grund !== 'wegUndDa' && e.grund !== 'restAnderesDok') return []
    const b = r.befunde.find((x) => x.zeile === e.zeile)!
    const ziel = r.ziele[b.dokument]
    if (ziel?.art !== 'dok') return []
    return ziel.ids.flatMap((dokId) => e.anweisung.weg.map((weg) => ({ ref: b.ref, dokId, weg })))
  })
}

