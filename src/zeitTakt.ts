import { useCallback, useSyncExternalStore } from 'react'
import { RETENTION_MS, type Group, type Message, type Poll, type RetentionKey } from './types'

/**
 * Zeit, ohne die ganze App neu zu zeichnen.
 *
 * Bisher erzeugte der Store alle fünf Sekunden einen neuen Zustand — auch
 * ohne jede Änderung —, und damit zeichnete JEDE Ansicht neu. Nachgemessen
 * mit einem Jahr Daten (3000 Nachrichten, 500 Formulare, CPU gedrosselt):
 * im Chat ein Long Task von 120–270 ms je Takt, mitten ins Tippen und
 * Unterschreiben (Audit 11/2026, TEC-10). Gebraucht wurde der Takt nur für
 * das, was die ZEIT ändert: abgelaufene Nachrichten und Umfragen, Gültigkeit
 * von Info-Einträgen, Datumsanzeigen. Dafür gibt es jetzt zwei schmale Wege:
 *
 *  1. `naechsteZeitgrenze`: Der Store weiß, WANN sich etwas aus seinem
 *     Bestand durch Zeitablauf ändert — die nächste Nachricht läuft ab, eine
 *     Umfrage schließt, der Tag wechselt. Genau dann (und nur dann) rechnet
 *     er seine zeitabhängigen Sichten neu.
 *  2. `useJetzt(ms)`: Eine Ansicht, die selbst mit der Uhr rechnet (etwa
 *     „neu" für 14 Tage ab Veröffentlichung), abonniert einen eigenen Takt.
 *     Neu gezeichnet wird dann nur sie.
 */

export interface ZeitBestand {
  messages: readonly Pick<Message, 'groupId' | 'createdAt'>[]
  polls: readonly Pick<Poll, 'groupId' | 'createdAt' | 'validUntil'>[]
  groups: readonly Pick<Group, 'id' | 'retention'>[]
  defaultRetention: RetentionKey
}

/** Beginn des nächsten Tages (lokale Zeit) nach `jetzt`. */
export function naechsteMitternacht(jetzt: number): number {
  const d = new Date(jetzt)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

/**
 * Der nächste Zeitpunkt NACH `jetzt`, an dem eine zeitabhängige Sicht des
 * Stores anders aussieht:
 *
 *  - eine Nachricht oder Umfrage fällt aus der Aufbewahrungsfrist ihrer
 *    Gruppe (dieselbe Regel wie `visibleMessages`: sichtbar, solange
 *    `jetzt − createdAt < Frist`);
 *  - eine Umfrage erreicht ihr `validUntil` (ab dann geschlossen);
 *  - der Tag wechselt — daran hängen Info-Gültigkeit (`validFrom`/
 *    `validUntil` sind Tage), die Wochenfrist der Formularliste und jede
 *    Datumsanzeige („heute 14:05" wird zu „Mo").
 *
 * Mitternacht steht immer in der Liste; das Ergebnis liegt also höchstens
 * einen Tag entfernt — auch für `setTimeout` (Grenze ~24,8 Tage) kein
 * Problem.
 *
 * @param jetzt Zeit, mit der der Store rechnet (Gerät + Sandbox-Zeitversatz)
 */
export function naechsteZeitgrenze(b: ZeitBestand, jetzt: number): number {
  let grenze = naechsteMitternacht(jetzt)
  const frist = new Map(b.groups.map((g) => [g.id, RETENTION_MS[g.retention ?? b.defaultRetention]]))
  const nimm = (t: number | undefined) => {
    if (t !== undefined && Number.isFinite(t) && t > jetzt && t < grenze) grenze = t
  }
  for (const m of b.messages) {
    const f = frist.get(m.groupId)
    // Ohne Gruppe zeigt der Store die Nachricht gar nicht — keine Grenze.
    if (f !== undefined) nimm(m.createdAt + f)
  }
  for (const p of b.polls) {
    const f = frist.get(p.groupId)
    if (f !== undefined) nimm(p.createdAt + f)
    nimm(p.validUntil)
  }
  return grenze
}

/* ===================== Takt für einzelne Ansichten ===================== */

interface Takt {
  zeit: number
  hoerer: Set<() => void>
  iv?: ReturnType<typeof setInterval>
}

/** Ein Takt je Intervall — zehn Ansichten mit 60 s teilen sich einen Zeitgeber. */
const takte = new Map<number, Takt>()

function taktFuer(ms: number): Takt {
  let t = takte.get(ms)
  if (!t) {
    t = { zeit: Date.now(), hoerer: new Set() }
    takte.set(ms, t)
  }
  return t
}

/** Den Takt `ms` abonnieren. Liefert die Abmeldung; der letzte Abmelder hält den Zeitgeber an. */
export function jetztAbonnieren(ms: number, hoerer: () => void): () => void {
  const t = taktFuer(ms)
  if (t.hoerer.size === 0) {
    // Ein ruhender Takt kann veraltet sein — der erste Abonnent bekommt die
    // aktuelle Zeit, nicht die vom letzten Abonnenten vor einer Stunde.
    if (Date.now() - t.zeit >= ms) t.zeit = Date.now()
    t.iv = setInterval(() => {
      t.zeit = Date.now()
      for (const h of [...t.hoerer]) h()
    }, ms)
  }
  t.hoerer.add(hoerer)
  return () => {
    t.hoerer.delete(hoerer)
    if (t.hoerer.size === 0) {
      clearInterval(t.iv)
      takte.delete(ms)
    }
  }
}

/** Stand des Takts `ms` — bleibt zwischen zwei Schlägen gleich (sonst zeichnete React endlos). */
export function jetztStand(ms: number): number {
  return taktFuer(ms).zeit
}

/**
 * Die Gerätezeit, aufgefrischt alle `intervallMs`. Nur die Ansicht, die den
 * Hook ruft, zeichnet im Takt neu. Den Sandbox-Zeitversatz rechnet weiter
 * `now()` aus dem Store ein; der Hook sorgt nur dafür, dass neu gerechnet
 * wird.
 */
export function useJetzt(intervallMs: number): number {
  const abonnieren = useCallback((hoerer: () => void) => jetztAbonnieren(intervallMs, hoerer), [intervallMs])
  const stand = useCallback(() => jetztStand(intervallMs), [intervallMs])
  return useSyncExternalStore(abonnieren, stand)
}
