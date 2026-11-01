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

/** SBX-WORD-01: eingebaute Fälle (Abnahme N4.4, N9). `reste`: das [TBD] ist ein eingebauter Platzhalter. */
export const SBX_WORD_01_ERWARTET = [
  'unsichtbar', 'korrektursprache', 'noProof', 'kopfFuss', 'editionRevision', 'fragmente', 'markierung', 'eigenschaften', 'kompatibilitaet', 'fremdsprache', 'einschuebe', 'platzhalter', 'reste',
] as const

/** Fehlalarmfälle: Auszug, der unter diesem Prüfpunkt NIE erscheinen darf. */
export const SBX_WORD_01_FEHLALARME: { punkt: string; muster: RegExp; fall: string }[] = [
  { punkt: 'unsichtbar', muster: /\bItem\b|\bValue\b|Doc No/, fall: 'weiße Schrift in der per Vorlage dunkel schattierten Kopfzeile' },
  { punkt: 'unsichtbar', muster: /Textfeld|text box/i, fall: 'Textfeld auf dem Deckblatt' },
  { punkt: 'platzhalter', muster: /Signature/, fall: 'Unterschriftszeile' },
  { punkt: 'fremdsprache', muster: /Hauptstraße/, fall: 'Adresse mit landessprachigem Straßennamen' },
  { punkt: 'einschuebe', muster: /Hauptstraße/, fall: 'Adresse mit landessprachigem Straßennamen' },
]

/** SBX-PKG-01: Paketbefunde als „Dokument Prüfpunkt" (Abnahme N1.3, N2.3, N7). */
export const SBX_PKG_01_ERWARTET = [
  'ANX 2B gegenfassung', 'ANX 2B geschwister', 'ANX 2B geschwister', 'ANX 2B hierarchie', 'ANX 3 liste', 'APX 5 stand',
  'TM liste', 'TM liste', 'TM verweise', 'TM verweise', 'TM verweise', 'TM verweise',
]

/** SBX-EAR-01: drei Regelwerksbefunde, fünf verifizierte Verweise (Abnahme N8). */
export const SBX_EAR_01_ERWARTET = ['absaetze', 'regelids', 'quelle']

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
