/**
 * Angefangene Grading-Formulare wiederfinden.
 *
 * Ein Entwurf lag lange unsichtbar in `localStorage`: Nach dem Neuladen
 * landete man auf der leeren Typauswahl, die Liste zeigte nichts — im
 * Zweifel begann eine halbe Stunde Bewertung von vorn.
 *
 * Gelesen wird derselbe Schlüssel, den das Formular schreibt
 * (`entwurfSchluessel`): `aaa-draft-[<user>]-<bezug>-<typ>`. `<bezug>` ist
 * `new` bei einem neuen Blatt oder die Kennung des Ausgangsblatts, wenn es
 * ein Folgeformular ist (306/310). Gesucht wird deshalb über den Nutzer und
 * nicht über `new` — sonst tauchte ein angefangenes 306 hier nie auf, obwohl
 * es genau das Blatt ist, an das man erinnert werden will.
 *
 * Die Funktion lag als Hilfsfunktion in `Grading.tsx` und war damit von der
 * Testpflicht befreit — beide Wachen des Projekts globen auf `src/*.ts`. Die
 * Dateiendung ist kein Grund; deshalb steht sie jetzt hier.
 */
import { decodeChain, encodeChain, type FollowUpStep } from './folgeKette'
import { isFollowUpType } from './gradingRules'

export type Draft = {
  /** Der localStorage-Schlüssel — Grundlage fürs Öffnen und Verwerfen. */
  key: string
  formTypeId: string
  /** `new` oder die Kennung des Ausgangsblatts (306/310) — ohne sie öffnet
   *  „Fortsetzen" ein Formular unter einem anderen Schlüssel (GRD-01). */
  bezug: string
  /** Rest der Folgeformular-Kette, wie das Formular sie gesichert hat. */
  kette: FollowUpStep[]
  /** Wer bewertet wird; leer, wenn noch niemand eingetragen ist. */
  wer: string
  /** Wie viele Noten schon gesetzt sind … */
  noten: number
  /** … von wie vielen insgesamt. */
  gesamt: number
}

/** Rohform eines gespeicherten Entwurfs — bewusst tolerant gelesen. */
type RohEntwurf = Eingabestand & {
  /** `encodeChain` der offenen Folgeformulare hinter diesem */
  next?: unknown
  /** Was die Vorbelegung eingetragen hatte, als der Entwurf gesichert wurde (GRD-10). */
  basis?: unknown
}

/** Der Teil eines Formularstands, der ueber „eigene Eingabe" entscheidet. */
export type Eingabestand = {
  header?: Record<string, unknown>
  trainees?: {
    traineeName?: string
    grades?: { grade: number | 'NO' | null; comment?: string }[]
    positiveComment?: string
    developmentComment?: string
    summaryComment?: string
    overall?: unknown
  }[]
  freeText?: Record<string, unknown>
  attendance?: { name?: string }[]
  sessionStatus?: unknown
  authority?: unknown
}

/** Was das Formular von sich aus eingetragen hat — Massstab fuer `hatEigeneEingaben`. */
export type Vorbelegt = {
  header?: Record<string, unknown>
  freeText?: Record<string, unknown>
  authority?: unknown
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const objekt = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Weicht ein Feld-Satz von seiner Vorbelegung ab? Leer und fehlend sind gleich. */
function weichtAb(stand: unknown, basis: unknown): boolean {
  const s = objekt(stand)
  const b = objekt(basis)
  return [...new Set([...Object.keys(s), ...Object.keys(b)])].some((k) => text(s[k]) !== text(b[k]))
}

/**
 * Hat der Nutzer selbst etwas eingetragen — oder steht nur die Vorbelegung da?
 *
 * Audit 11/2026, GRD-10/TEC-05: Als „ungesichert" galt jedes Formular mit
 * IRGENDEINEM Kopfwert, und die Vorbelegung setzt immer mindestens das
 * Datum. Bloßes Oeffnen hinterliess damit einen Entwurf („Draft · 308A" in
 * der Liste), fragte beim Verlassen nach, blockierte Neuladen und bot beim
 * naechsten Mal „A draft of this form was restored." an. Die Vorbelegung ist
 * ein Vorschlag, keine Eingabe: Gezaehlt wird nur, was von ihr abweicht —
 * im Kopf und in den Freitexten (die ein 306 aus dem Elternblatt vorbefuellt),
 * dazu jede Eingabe zu einem Piloten, eine Session, ein Anwesender und eine
 * umgestellte Behoerde. Wer ein vorbelegtes Datum aendert oder loescht, hat
 * etwas eingegeben.
 *
 * Position und Sitz des Piloten zaehlen nicht: Sie haben einen Vorgabewert
 * und zwei Knoepfe — wer nur sie umstellt, verliert beim Verlassen nichts,
 * was eine Rueckfrage lohnt.
 */
export function hatEigeneEingaben(stand: Eingabestand, vorbelegt: Vorbelegt): boolean {
  if (weichtAb(stand.header, vorbelegt.header) || weichtAb(stand.freeText, vorbelegt.freeText)) return true
  const pilot = (stand.trainees ?? []).some(
    (tr) =>
      text(tr.traineeName) ||
      (tr.grades ?? []).some((g) => g.grade !== null && g.grade !== undefined) ||
      (tr.grades ?? []).some((g) => text(g.comment)) ||
      text(tr.positiveComment) ||
      text(tr.developmentComment) ||
      text(tr.summaryComment) ||
      (tr.overall !== null && tr.overall !== undefined),
  )
  if (pilot) return true
  if ((stand.attendance ?? []).some((a) => text(a.name))) return true
  if (stand.sessionStatus !== null && stand.sessionStatus !== undefined) return true
  return vorbelegt.authority !== undefined && stand.authority !== undefined && stand.authority !== vorbelegt.authority
}

/**
 * Felder, die das Formular VOR dieser Fassung von sich aus belegte — fuer
 * Entwuerfe ohne gesicherte Vorbelegung (Altbestand). Ein solcher Entwurf,
 * der nichts anderes enthaelt, ist ein Phantom aus blossem Oeffnen.
 */
const ALT_VORBELEGT = ['date', 'aircraftType', 'trainingDevice', 'instructorQual', 'instructorSeat']

/**
 * Traegt ein gesicherter Entwurf eigene Eingaben? Massstab ist die
 * Vorbelegung, die er selbst mitgesichert hat; fehlt sie (Altbestand), die
 * Felder, die das Formular damals vorbelegte, und die Behoerde AT. Eine
 * Folgeformular-Vorbefuellung aus dem Elternblatt (Name, Freitext) laesst
 * sich im Altbestand nicht erkennen — solche Entwuerfe bleiben stehen;
 * geloescht wird nur, was sicher nichts enthaelt.
 */
export function entwurfMitEingaben(d: RohEntwurf): boolean {
  const gesichert = objekt(d.basis)
  const kopf = objekt(d.header)
  const basis: Vorbelegt = d.basis
    ? gesichert
    : { header: Object.fromEntries(ALT_VORBELEGT.filter((k) => k in kopf).map((k) => [k, kopf[k]])), authority: 'AT' }
  return hatEigeneEingaben(d, basis)
}

/** Anfang JEDES Entwurfsschlüssels, alter wie neuer Form (e2e sucht danach). */
const PRAEFIX = 'aaa-draft-'

/**
 * Schlüssel eines Entwurfs: `aaa-draft-[<nutzer>]-<bezug>-<typ>`.
 *
 * Audit 11/2026, R3-ENTWURFSPRAEFIX: Der Schlüssel hieß
 * `aaa-draft-<nutzer>-<bezug>-<typ>`, gesucht wurde mit `startsWith` nach
 * `aaa-draft-<nutzer>-`. Nutzerkennungen tragen selbst Bindestriche
 * („u-patrick") — für Nutzer „u" passte damit auch jeder Entwurf von
 * „u-x" (oder „u-patrick"): Auf einem geteilten iPad sah der eine die
 * Bewertungen des anderen, samt Pilotennamen und Noten. Jetzt steht die
 * Kennung kodiert in Klammern: `encodeURIComponent` kodiert „[" und „]",
 * die schließende Klammer trennt also eindeutig, und gelesen wird die
 * Kennung GANZ verglichen. Der Rest bleibt wie er war (`-<bezug>-<typ>`).
 */
export function entwurfSchluessel(userId: string, bezug: string, typ: string): string {
  return `${PRAEFIX}[${encodeURIComponent(userId)}]-${bezug}-${typ}`
}

/** Zerlegt einen Schlüssel der neuen Form — `null` für alles andere. */
export function entwurfZerlegen(key: string): { userId: string; bezug: string; typ: string } | null {
  if (!key.startsWith(`${PRAEFIX}[`)) return null
  const zu = key.indexOf(']', PRAEFIX.length + 1)
  if (zu < 0 || key[zu + 1] !== '-') return null
  let userId: string
  try {
    userId = decodeURIComponent(key.slice(PRAEFIX.length + 1, zu))
  } catch {
    return null
  }
  return { userId, ...bezugUndTyp(key.slice(zu + 2)) }
}

/**
 * `<bezug>-<typ>` zerlegen. Kennungen tragen selbst Bindestriche
 * („gr-1793571773598-1") — der Typ steht hinter dem LETZTEN Strich, der
 * Bezug ist alles davor (GRD-01). Ohne Bezugsteil: ein neues Blatt.
 */
function bezugUndTyp(rest: string): { bezug: string; typ: string } {
  const strich = rest.lastIndexOf('-')
  return { bezug: rest.slice(0, Math.max(strich, 0)) || 'new', typ: rest.slice(strich + 1) }
}

/** Alter Schlüssel `aaa-draft-<nutzer>-<bezug>-<typ>` — nur noch zum Übernehmen. */
const altSchluessel = (userId: string, bezug: string, typ: string) => `${PRAEFIX}${userId}-${bezug}-${typ}`

/**
 * Entwürfe im alten Schlüssel in die neue Form bringen — nichts verlieren.
 *
 * Im alten Schlüssel ist nicht zu erkennen, wo die Kennung endet. Er gehört
 * deshalb dem LÄNGSTEN bekannten Nutzer, dessen Kennung samt „-" vorne
 * steht: „aaa-draft-u-x-new-308A" ist der von „u-x", nicht der von „u" mit
 * dem Bezug „x-new". Nutzer werden nie gelöscht, nur deaktiviert — die Liste
 * aller Kennungen ist also vollständig. Passt keiner, bleibt der Eintrag
 * unangetastet liegen und wird niemandem gezeigt.
 *
 * Ohne Marke wie in migrateState: Das Umschreiben ist wiederholbar (ein
 * übernommener Schlüssel ist danach weg), und ein während eines Updates noch
 * offener Tab der Vorversion kann weiter alte Schlüssel schreiben — die
 * fängt der nächste Lauf auf. Steht unter dem neuen Schlüssel schon etwas,
 * bleibt der alte Eintrag liegen, statt eines der beiden zu überschreiben.
 */
export function alteEntwuerfeUebernehmen(speicher: Storage, nutzerIds: readonly string[]): void {
  const laengsteZuerst = [...nutzerIds].sort((a, b) => b.length - a.length)
  for (const k of Object.keys(speicher)) {
    if (!k.startsWith(PRAEFIX) || k.startsWith(`${PRAEFIX}[`)) continue
    const nutzer = laengsteZuerst.find((u) => k.startsWith(`${PRAEFIX}${u}-`))
    if (nutzer === undefined) continue
    const { bezug, typ } = bezugUndTyp(k.slice(PRAEFIX.length + nutzer.length + 1))
    const neu = entwurfSchluessel(nutzer, bezug, typ)
    const wert = speicher.getItem(k)
    if (wert === null || speicher.getItem(neu) !== null) continue
    speicher.setItem(neu, wert)
    speicher.removeItem(k)
  }
}

/**
 * Den Entwurf eines Formulars lesen — auch einen, der noch unter dem alten
 * Schlüssel liegt (dann gleich übernommen). Der alte Schlüssel wird hier
 * GENAU nachgeschlagen, nicht per Präfix: Für den eigenen Nutzer, Bezug und
 * Typ ist er eindeutig.
 */
export function entwurfLesen(speicher: Storage, userId: string, bezug: string, typ: string): string | null {
  const neu = entwurfSchluessel(userId, bezug, typ)
  const vorhanden = speicher.getItem(neu)
  if (vorhanden !== null) return vorhanden
  const alt = altSchluessel(userId, bezug, typ)
  const altWert = speicher.getItem(alt)
  if (altWert === null) return null
  speicher.setItem(neu, altWert)
  speicher.removeItem(alt)
  return altWert
}

/**
 * Die Entwürfe EINES Nutzers.
 *
 * @param nutzerIds alle bekannten Nutzerkennungen — nur damit lassen sich
 *   Entwürfe im alten Schlüssel ihrem Nutzer zuordnen (alteEntwuerfeUebernehmen)
 */
export function readDrafts(userId: string, nutzerIds: readonly string[], speicher: Storage = localStorage): Draft[] {
  try {
    alteEntwuerfeUebernehmen(speicher, nutzerIds.includes(userId) ? nutzerIds : [...nutzerIds, userId])
    const phantome: string[] = []
    const liste = Object.keys(speicher)
      .map((k) => ({ k, teile: entwurfZerlegen(k) }))
      // Die Kennung GANZ vergleichen — nicht per Präfix (R3-ENTWURFSPRAEFIX).
      .filter((x): x is { k: string; teile: NonNullable<ReturnType<typeof entwurfZerlegen>> } => x.teile?.userId === userId)
      .map(({ k, teile }): Draft | null => {
        // Ein beschädigter Eintrag darf nicht die ganze Liste kosten: Der
        // Entwurf ist dann verloren, die übrigen sind es nicht.
        let d: RohEntwurf = {}
        const roh = speicher.getItem(k)
        try {
          const gelesen: unknown = JSON.parse(roh ?? '')
          d = objekt(gelesen) as RohEntwurf
          // Lesbar und ohne eigene Eingabe: ein Phantom aus blossem Oeffnen
          // (GRD-10) — nicht zeigen und gleich aufraeumen. Was sich nicht
          // lesen laesst, bleibt stehen: Ob darin etwas steckte, weiss
          // niemand, und Loeschen ist endgueltig.
          if (!entwurfMitEingaben(d)) {
            phantome.push(k)
            return null
          }
        } catch {
          d = {}
        }
        const trainees = d.trainees ?? []
        return {
          key: k,
          formTypeId: teile.typ,
          // Audit 11/2026, GRD-01: Der Bezug ging hier verloren, „Fortsetzen"
          // oeffnete das 310 ohne Elternblatt — unter einem anderen Schluessel,
          // also leer, und gespeichert ohne parentId (entwurfZerlegen).
          bezug: teile.bezug,
          kette: typeof d.next === 'string' ? decodeChain(d.next) : [],
          wer: trainees.map((x) => x.traineeName?.trim()).filter(Boolean).join(', ') || text(objekt(d.header).traineeName),
          noten: trainees.reduce((n, x) => n + (x.grades ?? []).filter((g) => g.grade !== null).length, 0),
          gesamt: trainees.reduce((n, x) => n + (x.grades ?? []).length, 0),
        }
      })
      .filter((d): d is Draft => d !== null)
    for (const k of phantome) {
      try {
        speicher.removeItem(k)
      } catch {
        /* nicht entfernbar: bleibt unsichtbar, beim naechsten Lesen neuer Versuch */
      }
    }
    return liste
  } catch {
    // Ohne localStorage (private Fenster mit gesperrtem Speicher) gibt es
    // keine Entwürfe — das ist kein Fehler, nur nichts zu zeigen.
    return []
  }
}

/**
 * Adresse, unter der ein Entwurf weitergeht — mit Elternblatt und Kette.
 *
 * Audit 11/2026, GRD-01: Die Liste sprang nach `/grading/new?type=310`. Das
 * Formular suchte dann `…-new-310`, fand nichts, und das neu ausgefuellte 310
 * hing an keinem Blatt — die Pflicht des Elternblatts blieb gelb. Ein Bezug
 * gehoert nur an Folgeformulare; an jedem anderen Typ wuerde ihn das Formular
 * ohnehin verwerfen.
 */
export function fortsetzenAdresse(d: Pick<Draft, 'formTypeId' | 'bezug' | 'kette'>): string {
  const teile = [`type=${d.formTypeId}`]
  if (d.bezug !== 'new' && isFollowUpType(d.formTypeId)) {
    teile.push(`parent=${d.bezug}`)
    if (d.kette.length > 0) teile.push(`next=${encodeChain(d.kette)}`)
  }
  return `/grading/new?${teile.join('&')}`
}

/**
 * Kurze Zeitangabe für Listen: heute die Uhrzeit, in der letzten Woche der
 * Wochentag, davor das Datum.
 *
 * Die Chatliste nannte an dieser Stelle die Aufbewahrungsfrist — eine
 * Angabe, die für jede Gruppe gleich war und deshalb nichts unterschied.
 * Was man in einer Liste sucht, ist „wann zuletzt".
 */
export function kurzeZeit(ts: number, lng: string, jetzt: number): string {
  const locale = lng === 'de' ? 'de-AT' : 'en-GB'
  const tagMs = 24 * 3600_000
  const heute = new Date(jetzt).setHours(0, 0, 0, 0)
  if (ts >= heute) return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (ts >= heute - 6 * tagMs) return new Date(ts).toLocaleDateString(locale, { weekday: 'short' })
  // App-weites Datumsformat DD.MM.YYYY — in beiden Sprachen. Vorher kam hier
  // das Gebietsschema zum Zug, und Englisch zeigte 20/07 statt 20.07.2026.
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
