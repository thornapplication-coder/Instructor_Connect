/**
 * Zwei Tabs, zwei Änderungen — beide bleiben (Audit 11/2026, TEC-13).
 *
 * Der Tab-Abgleich ersetzte bisher den GESAMTEN Stand durch den jüngeren.
 * Ablauf aus dem Audit: Tab A ändert etwas, die Sicherung wartet 400 ms;
 * währenddessen ändert Tab B etwas anderes und verwirft A's Ruf als „älter";
 * B schreibt seinen Stand, A übernimmt ihn — A's Änderung ist weg, lautlos,
 * auch nach dem Neuladen. Der Code-Kommentar beschrieb genau das als Lösung.
 *
 * Jetzt wird zusammengeführt, mit drei Ständen:
 *  - `basis`: der jüngste Stand, den beide Tabs gemeinsam haben
 *    (`basisWaehlen`, unten),
 *  - `eigen`: der Stand dieses Tabs,
 *  - `fremd`: der eben empfangene Stand des anderen Tabs.
 *
 * Regeln — je Datensatz einer Liste mit `id`, je Schlüssel eines Objekts,
 * sonst für den Wert als Ganzes:
 *  - nur fremd geändert (auch gelöscht oder neu) → fremd,
 *  - nur eigen geändert (auch gelöscht oder neu) → eigen,
 *  - beide geändert → eigen; aber eine ÄNDERUNG schlägt eine LÖSCHUNG, von
 *    welcher Seite auch immer: Eine verlorene Änderung an einem Nachweis
 *    wiegt schwerer als ein Datensatz, den man noch einmal löscht.
 *
 * Ein Datensatz bleibt dabei ganz — Felder zweier Fassungen werden nie
 * gemischt: Unterschrift, Inhalt und Fingerabdruck eines Formulars gehören
 * zusammen, eine Mischung wäre ein Blatt, das so nie jemand unterschrieben
 * hat.
 */

type Objekt = Record<string, unknown>

const istObjekt = (v: unknown): v is Objekt => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Inhaltsgleich? `undefined`-Felder zählen als fehlend — der fremde Stand
 * kommt durch JSON, das sie weglässt; der eigene trägt sie mitunter
 * (`mailError: undefined`). Sonst hieße jeder solche Datensatz „geändert".
 */
export function gleich(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!gleich(a[i], b[i])) return false
    return true
  }
  if (!istObjekt(a) || !istObjekt(b)) return false
  const ka = Object.keys(a).filter((k) => a[k] !== undefined)
  const kb = Object.keys(b).filter((k) => b[k] !== undefined)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (!gleich(a[k], b[k])) return false
  return true
}

/** Eine Liste von Datensätzen mit eindeutiger `id`? Nur dann wird je Datensatz zusammengeführt. */
function idListe(...listen: unknown[]): boolean {
  let eintraege = 0
  for (const l of listen) {
    if (l === undefined) continue
    if (!Array.isArray(l)) return false
    const ids = new Set<string>()
    for (const x of l) {
      if (!istObjekt(x) || typeof x.id !== 'string' || ids.has(x.id)) return false
      ids.add(x.id)
    }
    eintraege += l.length
  }
  return eintraege > 0
}

interface Lauf {
  /** Steht im Ergebnis etwas, das der fremde Stand nicht hat? Dann muss dieser Tab schreiben. */
  mitEigenem: boolean
}

/**
 * Ein Wert als Ganzes — ein Datensatz, eine Zahl, eine Liste ohne `id`.
 * Hier fällt die Entscheidung; tiefer wird nicht geschaut.
 */
function ganz(b: unknown, e: unknown, f: unknown, lauf: Lauf): unknown {
  // Eigen unverändert: der andere Tab hat das letzte Wort (auch fürs Löschen).
  if (e === b || (e !== undefined && b !== undefined && gleich(e, b))) return f
  // Fremd unverändert: unsere Änderung gilt — und muss geschrieben werden.
  if (f === b || (f !== undefined && b !== undefined && gleich(f, b))) {
    lauf.mitEigenem = true
    return e
  }
  // Beide geändert. Eine Änderung schlägt eine Löschung, in beide Richtungen;
  // sonst gilt die eigene Fassung.
  if (e === undefined) return f
  if (f === undefined || !gleich(e, f)) lauf.mitEigenem = true
  return e
}

/** Ein Wert im Gefüge: Objekte je Schlüssel, Listen mit `id` je Datensatz, alles andere als Ganzes. */
function entscheiden(b: unknown, e: unknown, f: unknown, lauf: Lauf): unknown {
  // Der häufigste Fall, ohne jeden Vergleich: Hier hat dieser Tab nichts
  // angefasst (gleiche Referenz wie in der Basis).
  if (e === b) return f
  // Zwei Tabs, die verschiedene Chats als gelesen markieren, ändern beide
  // `seen` — aber nicht dasselbe. Deshalb je Schlüssel.
  if (istObjekt(e) && istObjekt(f) && (b === undefined || istObjekt(b))) return objekt(b, e, f, lauf)
  // Nur wenn beide Seiten die Liste noch haben — fehlt sie einer ganz, ist
  // das eine Entscheidung über den Wert als Ganzes.
  if (Array.isArray(e) && Array.isArray(f) && idListe(b, e, f)) return liste(b as Objekt[] | undefined, e as Objekt[], f as Objekt[], lauf)
  return ganz(b, e, f, lauf)
}

function objekt(b: Objekt | undefined, e: Objekt, f: Objekt, lauf: Lauf, tabEigen: ReadonlySet<string> = new Set()): Objekt {
  const aus: Objekt = {}
  for (const k of new Set([...Object.keys(f), ...Object.keys(e)])) {
    const v = tabEigen.has(k) ? e[k] : entscheiden(b?.[k], e[k], f[k], lauf)
    if (v !== undefined) aus[k] = v
  }
  return aus
}

/** Je Datensatz nach `id`, jeder als Ganzes. Reihenfolge: wie im fremden Stand, eigene neue dahinter. */
function liste(b: Objekt[] | undefined, e: Objekt[], f: Objekt[], lauf: Lauf): Objekt[] {
  const nachId = (l: Objekt[] | undefined) => new Map((l ?? []).map((x) => [x.id as string, x]))
  const bb = nachId(b)
  const ee = nachId(e)
  const ff = nachId(f)
  const aus: Objekt[] = []
  for (const id of new Set([...ff.keys(), ...ee.keys()])) {
    const v = ganz(bb.get(id), ee.get(id), ff.get(id), lauf)
    if (v !== undefined) aus.push(v as Objekt)
  }
  return aus
}

/**
 * Den Stand eines anderen Tabs mit dem eigenen zusammenführen.
 *
 * Liefert den neuen Stand und ob darin Eigenes steht, das der andere Tab
 * noch nicht hat — dann muss dieser Tab ihn schreiben, sonst läge im
 * Speicher der fremde Stand ohne die eigene Änderung. Umgekehrt darf ein
 * Tab, der nichts beizutragen hat, NICHT schreiben: Zwei Tabs, die sich
 * gegenseitig denselben Stand zurufen, kämen nie zur Ruhe.
 *
 * @param tabEigen Schlüssel, die jeder Tab für sich hat (Anmeldung,
 *                 Sandbox-Zeitversatz) — sie bleiben immer eigen und zählen
 *                 nicht als Beitrag.
 */
export function standZusammenfuehren<T extends object>(basis: T, eigen: T, fremd: T, tabEigen: readonly (keyof T & string)[] = []): { stand: T; mitEigenem: boolean } {
  const lauf: Lauf = { mitEigenem: false }
  const stand = objekt(basis as Objekt, eigen as Objekt, fremd as Objekt, lauf, new Set(tabEigen))
  return { stand: stand as T, mitEigenem: lauf.mitEigenem }
}

/* ===================== Die richtige Basis ===================== */

/** Was ein Tab über einen Stand weiß, den er geschrieben oder empfangen hat. */
export interface Stammstand<T> {
  stand: T
  /** je Tab: die id des letzten Stands, den der Absender von dort übernommen hatte */
  basen: Readonly<Record<string, string>>
}

/**
 * Welcher Stand ist der jüngste, den beide Tabs gemeinsam haben?
 *
 * Daran hängt alles: Mit einer zu ALTEN Basis sieht eine Änderung, die der
 * andere Tab längst kannte und danach weiterbearbeitet hat, wie ein Konflikt
 * aus — und die eigene, ältere Fassung gewänne. Der Alltag dazu: einen
 * Eintrag in Tab A bearbeiten, in Tab B weiterbearbeiten. Mit einer zu
 * JUNGEN Basis (etwa dem eigenen, gerade geschriebenen Stand, den der andere
 * noch gar nicht hat) sieht die eigene Änderung wie unverändert aus — und
 * der fremde Stand ohne sie gewänne. Genau das passiert, wenn beide Tabs
 * fast gleichzeitig schreiben, bei großen Ständen also schon im Fenster des
 * Audits (TEC-13).
 *
 * Deshalb sagt jeder Stand, den ein Tab ausruft, welche Stände er von wem
 * übernommen hatte (`basen`). Kandidaten für die Basis:
 *  - der eigene geschriebene Stand, den der Absender übernommen hatte,
 *  - der vorige Stand desselben Absenders (seine Stände bauen aufeinander
 *    auf).
 * Beide sind gemeinsame Vorfahren; genommen wird der jüngere. Kennt dieser
 * Tab keinen von beiden (eben gestartet, ältere Fassung), bleibt der Stand,
 * mit dem er gestartet ist.
 *
 * @param ich          id dieses Tabs
 * @param fremdBasen   `basen` des empfangenen Stands
 * @param geschrieben  eigene geschriebene Stände nach id
 * @param vorher       voriger Stand desselben Absenders, falls bekannt
 * @param start        der Stand, mit dem dieser Tab begonnen hat
 */
export function basisWaehlen<T>(
  ich: string,
  fremdBasen: Readonly<Record<string, string>> | undefined,
  geschrieben: ReadonlyMap<string, Stammstand<T>>,
  vorher: Stammstand<T> | undefined,
  start: T,
): T {
  const meinerDort = fremdBasen?.[ich]
  const eigener = meinerDort !== undefined ? geschrieben.get(meinerDort) : undefined
  if (!eigener) return vorher?.stand ?? start
  // Kannte der Absender unseren Stand schon, als er seinen vorigen schrieb,
  // dann enthält der vorige ihn bereits — und ist der jüngere.
  if (vorher && vorher.basen[ich] === meinerDort) return vorher.stand
  return eigener.stand
}

/* ===================== Kopf des ausgerufenen Stands ===================== */

/** Wer einen Stand geschrieben hat und worauf er aufbaut. */
export interface StandKopf {
  /** id des schreibenden Tabs */
  von?: string
  /** id dieses Stands */
  id?: string
  basen: Record<string, string>
}

const istTextMap = (v: unknown): v is Record<string, string> => istObjekt(v) && Object.values(v).every((x) => typeof x === 'string')

/**
 * Den gesicherten bzw. ausgerufenen Stand bauen: Kopf ZUERST, der Zustand
 * zuletzt. So lässt sich der Kopf beim Start lesen, ohne den ganzen Stand
 * (mit Unterschriftsbildern bis 20 MB) ein zweites Mal zu parsen.
 */
export function standNachricht(version: number, at: number, kopf: StandKopf, zustandJson: string): string {
  const k: Objekt = { v: version, at }
  if (kopf.von !== undefined) k.von = kopf.von
  if (kopf.id !== undefined) k.id = kopf.id
  k.basen = kopf.basen
  return `${JSON.stringify(k).slice(0, -1)},"state":${zustandJson}}`
}

/**
 * Den Kopf eines gesicherten Stands lesen — nur den Teil vor `"state":`.
 * Ein älterer Stand (Zustand vorn, kein Kopf) oder etwas Unlesbares ergibt
 * einen leeren Kopf: Dann kennt dieser Tab eben keine Basis.
 */
export function kopfLesen(raw: string | null): StandKopf {
  const leer: StandKopf = { basen: {} }
  const ende = raw?.indexOf('"state":') ?? -1
  if (!raw || ende < 0) return leer
  try {
    const k = JSON.parse(`${raw.slice(0, ende).replace(/,\s*$/, '')}}`) as Objekt
    return {
      ...(typeof k.von === 'string' ? { von: k.von } : {}),
      ...(typeof k.id === 'string' ? { id: k.id } : {}),
      basen: istTextMap(k.basen) ? k.basen : {},
    }
  } catch {
    return leer
  }
}

/** Den Kopf eines empfangenen (schon geparsten) Stands prüfen — er kommt von außen. */
export function kopfAus(nachricht: Objekt): StandKopf {
  return {
    ...(typeof nachricht.von === 'string' ? { von: nachricht.von } : {}),
    ...(typeof nachricht.id === 'string' ? { id: nachricht.id } : {}),
    basen: istTextMap(nachricht.basen) ? nachricht.basen : {},
  }
}
