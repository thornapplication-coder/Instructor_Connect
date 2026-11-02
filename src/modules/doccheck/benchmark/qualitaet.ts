/**
 * Qualitäts-Regressionstest (Spez. v1.1 Kap. 19.1, Nachtrag Kap. 20).
 *
 * Misst die regelbasierten Prüfungen an den synthetischen Abnahmedateien
 * gegen ihre Lösungsschlüssel: Trefferquote (eingebaute Fehler gefunden),
 * Fehlalarmquote (gemeldet, aber nicht eingebaut), dazu für den Re-Check
 * die Trefferquote der Statusvorschläge und die gefundenen Restfundstellen.
 *
 * Die Abnahmetests prüfen jeden Fall einzeln und brechen beim ersten
 * Unterschied ab. Dieser Test beantwortet eine andere Frage: Ist die
 * Prüfung INSGESAMT besser oder schlechter geworden als der festgehaltene
 * Stand (`baseline.json`)? Eine Änderung, die drei Fälle repariert und
 * einen anderen still verliert, fällt hier auf.
 *
 * Die KI-Prüfung ist noch simuliert; sobald es sie gibt, kommen ihre
 * Kennzahlen (Anteil verifizierter Zitate) in dieselbe Tabelle.
 */

/* ---------------------------- Lösungsschlüssel ---------------------------- */

/**
 * SBX-WORD-01: eingebaute Fälle (Abnahme N4.4, N9). `reste` zweimal: das
 * [TBD] ist ein eingebauter Platzhalter (Medium), die nicht angenommene
 * Verschiebung und Formatänderung sind offene Änderungen (High, Audit
 * 11/2026, FRD-15).
 */
export const SBX_WORD_01_ERWARTET = [
  'unsichtbar', 'korrektursprache', 'noProof', 'kopfFuss', 'editionRevision', 'fragmente', 'markierung', 'eigenschaften', 'kompatibilitaet', 'fremdsprache', 'einschuebe', 'platzhalter', 'reste', 'reste',
] as const

/** Fehlalarmfälle: Auszug, der unter diesem Prüfpunkt NIE erscheinen darf. */
export const SBX_WORD_01_FEHLALARME: { punkt: string; muster: RegExp; fall: string }[] = [
  { punkt: 'unsichtbar', muster: /\bItem\b|\bValue\b|Doc No/, fall: 'weiße Schrift in der per Vorlage dunkel schattierten Kopfzeile' },
  { punkt: 'unsichtbar', muster: /Textfeld|text box/i, fall: 'Textfeld auf dem Deckblatt' },
  { punkt: 'unsichtbar', muster: /CONTROLLED COPY|UNCONTROLLED WHEN PRINTED/, fall: 'Textfeld mit Rahmen in Schriftfarbe (Audit 11/2026, FRD-04)' },
  { punkt: 'unsichtbar', muster: /Solo flights/, fall: 'alter Stand einer Formatänderung (w:rPrChange) ist nicht wirksam (Audit 11/2026, FRD-15)' },
  { punkt: 'kopfFuss', muster: /footer1\.xml/, fall: 'Revision nur im Fuß, Edition und Datum im Kopf — keine Variante (Audit 11/2026, FRD-09)' },
  { punkt: 'fragmente', muster: /Table row/, fall: 'Werte der Lenkungstabelle auf dem Deckblatt (Audit 11/2026, FRD-10)' },
  { punkt: 'fremdsprache', muster: /Sandbox-Flugschule/, fall: 'landessprachige Auflösung neben ihrem Kürzel — ein Eigenname (Audit 11/2026, FRD-17)' },
  { punkt: 'platzhalter', muster: /Signature/, fall: 'Unterschriftszeile' },
  { punkt: 'fremdsprache', muster: /Hauptstraße/, fall: 'Adresse mit landessprachigem Straßennamen' },
  { punkt: 'einschuebe', muster: /Hauptstraße/, fall: 'Adresse mit landessprachigem Straßennamen' },
]

/** SBX-WORD-02: Kapitelnummern aus der Liste der Formatvorlage (Audit 11/2026, FRD-01) — eingebaut ist nur der tote Kapitelverweis. */
export const SBX_WORD_02_ERWARTET = ['querverweise'] as const

/** Fehlalarmfälle von SBX-WORD-02 — wie bei SBX-WORD-01: Auszug, der unter diesem Prüfpunkt NIE erscheinen darf. */
export const SBX_WORD_02_FEHLALARME: { punkt: string; muster: RegExp; fall: string }[] = [
  { punkt: 'inhalt', muster: /Entry without matching heading: \d/, fall: 'Verzeichniseintrag mit Nummer, Überschrift per Liste nummeriert' },
  { punkt: 'inhalt', muster: /Heading missing in table of contents: Foreword/, fall: 'Überschrift ohne Nummer (numId 0) gegen Eintrag ohne Nummer' },
  { punkt: 'querverweise', muster: /Section (1\.1|2\.1)\b/, fall: 'gültiger Verweis auf ein automatisch nummeriertes Kapitel' },
  { punkt: 'querverweise', muster: /see 2\.1\.1/, fall: 'gültiger Kurzverweis ohne Schlüsselwort (Audit 11/2026, FRD-14)' },
  { punkt: 'nummerierung', muster: /Table/, fall: 'Revisionszelle „Table 2 amended" ist keine Beschriftung (Audit 11/2026, FRD-18)' },
]

/**
 * Fehlalarmfälle von SBX-FORMAL-01 (beide Varianten). Die eingebauten
 * Fehler stehen als Prüfpunkte in `SBX_FORMAL_01_FEHLER`; ein Fehlalarm
 * unter einem Prüfpunkt, der ohnehin einen Befund hat, fiele dort nicht auf.
 */
export const SBX_FORMAL_01_FEHLALARME: { punkt: string; muster: RegExp; fall: string }[] = [
  { punkt: 'abkuerzungen', muster: /\bNOTE\b/, fall: 'Hinweiswort „NOTE:" ist kein Kürzel (Audit 11/2026, FRD-16)' },
  { punkt: 'querverweise', muster: /see 2\.1\b/, fall: 'gültiger Kurzverweis „see 2.1" (Audit 11/2026, FRD-14)' },
]

/** SBX-PDF-02: Lesereihenfolge (Audit 11/2026, FRD-05) — eingebaut ist nur „QRH" ohne Listeneintrag. */
export const SBX_PDF_02_ERWARTET = ['abkuerzungen'] as const

/** Fehlalarmfälle von SBX-PDF-02: Folgen einer spaltenweise gelesenen Tabelle oder zerlegter Kopf-/Fußzeilen. */
export const SBX_PDF_02_FEHLALARME: { punkt: string; muster: RegExp; fall: string }[] = [
  { punkt: 'abkuerzungen', muster: /Used but not in the list: (?!QRH\b)|Listed but never used/, fall: 'zweispaltige Abkürzungstabelle als Spalten gelesen' },
  { punkt: 'seiten', muster: /./, fall: 'geteilte Fußzeile „Datum … Page n of 4" zerlegt' },
  { punkt: 'revisionsstand', muster: /./, fall: 'geteilte Kopfzeile „Titel … Revision 0" zerlegt' },
]

/** SBX-PKG-01: Paketbefunde als „Dokument Prüfpunkt" (Abnahme N1.3, N2.3, N7). */
export const SBX_PKG_01_ERWARTET = [
  'ANX 2B gegenfassung', 'ANX 2B geschwister', 'ANX 2B geschwister', 'ANX 2B hierarchie', 'ANX 3 liste', 'APX 5 stand',
  'TM liste', 'TM liste', 'TM verweise', 'TM verweise', 'TM verweise', 'TM verweise',
]

/** SBX-EAR-01: fünf Regelwerksbefunde (je zwei in Part-ORA und Part-FCL Subpart J, Audit 11/2026 FRD-12), sieben verifizierte Verweise (Abnahme N8). */
export const SBX_EAR_01_ERWARTET = ['absaetze', 'absaetze', 'regelids', 'regelids', 'quelle']

/* -------------------------------- Kennzahlen ------------------------------ */

export interface Satz {
  name: string
  /** Anzahl eingebauter Fehler */
  erwartet: number
  /** davon gefunden */
  getroffen: number
  /** alle Meldungen */
  befunde: number
  /** Meldungen ohne eingebauten Fehler */
  fehlalarme: number
}

/**
 * Gefundene Schlüssel gegen erwartete, als Multimenge: Wer einen Fehler
 * zweimal erwartet, muss ihn zweimal finden. Mehrfachmeldungen DESSELBEN
 * eingebauten Fehlers (z. B. ein Platzhalter als Textmarker UND als Rest)
 * sind kein Fehlalarm — gezählt wird nur, was zu keinem Schlüssel passt.
 */
export function abgleichen(name: string, erwartet: readonly string[], gefunden: readonly string[], fehlalarmFaelle = 0): Satz {
  const offen = new Map<string, number>()
  for (const e of erwartet) offen.set(e, (offen.get(e) ?? 0) + 1)
  let getroffen = 0
  let fremd = 0
  const bekannt = new Set(erwartet)
  for (const g of gefunden) {
    const n = offen.get(g) ?? 0
    if (n > 0) {
      getroffen++
      offen.set(g, n - 1)
    } else if (!bekannt.has(g)) fremd++
  }
  return { name, erwartet: erwartet.length, getroffen, befunde: gefunden.length, fehlalarme: fremd + fehlalarmFaelle }
}

export interface Kennzahlen {
  saetze: Satz[]
  trefferquote: number
  fehlalarmquote: number
  /** Re-Check: richtige Statusvorschläge / alle */
  statusquote: number
  /** Re-Check: Befunde mit erwartetem Rest, bei denen ein Rest gefunden wurde */
  restquote: number
}

const quote = (a: number, b: number) => (b === 0 ? 1 : Math.round((a / b) * 1000) / 1000)

export function kennzahlen(saetze: Satz[], recheck: { richtig: number; gesamt: number; restGefunden: number; restErwartet: number }): Kennzahlen {
  const summe = (k: keyof Omit<Satz, 'name'>) => saetze.reduce((n, s) => n + s[k], 0)
  return {
    saetze,
    trefferquote: quote(summe('getroffen'), summe('erwartet')),
    // Fehlalarmquote ohne Meldungen ist 0, nicht 100 %
    fehlalarmquote: summe('befunde') === 0 ? 0 : quote(summe('fehlalarme'), summe('befunde')),
    statusquote: quote(recheck.richtig, recheck.gesamt),
    restquote: quote(recheck.restGefunden, recheck.restErwartet),
  }
}

/* -------------------------------- Bewertung ------------------------------- */

export type Urteil = 'besser' | 'gleich' | 'schlechter' | 'gesunken'

export interface Vergleich {
  metrik: string
  alt: number
  neu: number
  urteil: Urteil
}

/** Kap. 19.1: ab 10 Prozentpunkten Verschlechterung „Qualität gesunken". */
export const SCHWELLE = 0.1

/**
 * Jede Kennzahl gegen die Baseline. Fehlalarme: kleiner ist besser.
 * „schlechter" heißt hier schon jede Verschlechterung — die Prüfung ist
 * regelbasiert und deterministisch; anders als bei der KI gibt es kein
 * Rauschen, hinter dem sich ein Verlust verstecken dürfte.
 */
export function bewerten(neu: Kennzahlen, alt: Pick<Kennzahlen, 'trefferquote' | 'fehlalarmquote' | 'statusquote' | 'restquote'>): Vergleich[] {
  const metriken: [keyof typeof alt, boolean][] = [
    ['trefferquote', true],
    ['statusquote', true],
    ['restquote', true],
    ['fehlalarmquote', false],
  ]
  return metriken.map(([m, hoeherBesser]) => {
    const d = Math.round((neu[m] - alt[m]) * 1000) / 1000
    const gut = hoeherBesser ? d : -d
    const urteil: Urteil = gut > 0 ? 'besser' : gut === 0 ? 'gleich' : -gut >= SCHWELLE ? 'gesunken' : 'schlechter'
    return { metrik: m, alt: alt[m], neu: neu[m], urteil }
  })
}

const prozent = (x: number) => `${Math.round(x * 100)} %`

/** Changelog-Zeile nach Kap. 19.1. */
export function bericht(k: Kennzahlen): string {
  return `DocCheck · Benchmark: Trefferquote ${prozent(k.trefferquote)}, Fehlalarme ${prozent(k.fehlalarmquote)}, Re-Check-Status ${prozent(k.statusquote)}, Restfundstellen ${prozent(k.restquote)}`
}

/** Tabelle je Satz — für die Ausgabe im Testlauf. */
export function tabelle(k: Kennzahlen): string {
  const zeilen = k.saetze.map((s) => `${s.name.padEnd(16)} ${String(s.getroffen).padStart(3)}/${String(s.erwartet).padEnd(3)} gefunden · ${String(s.fehlalarme).padStart(2)} Fehlalarm(e) bei ${s.befunde} Meldungen`)
  return [...zeilen, bericht(k)].join('\n')
}
