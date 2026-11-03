/**
 * Quittungen erst nach dem Speichern.
 *
 * Audit 11/2026, R3-SPEICHERQUITTUNG (TEC-12, zweiter Teil): „Notiz
 * gespeichert" erschien im selben Moment wie der Klick. Gesichert wurde
 * 400 ms später — und scheiterte das (Ablage voll, IndexedDB gesperrt),
 * stand der grüne Streifen neben dem roten Speicherstreifen. Wer nur den
 * grünen gelesen hatte, legte das Gerät weg; beim nächsten Neuladen war die
 * Änderung fort.
 *
 * Deshalb EIN Weg für alle endgültigen Aktionen (speichern, löschen,
 * absenden): erst warten, bis der Store geschrieben hat, dann melden — bei
 * Erfolg die Quittung, sonst eine Fehlermeldung, die sagt, dass die
 * Änderung nicht gespeichert ist. Der rote Speicherstreifen (TEC-12 Teil 1)
 * bleibt daneben bestehen; er meldet den Dauerzustand, diese Meldung den
 * einzelnen Handgriff.
 *
 * Reine Logik: Wie geschrieben und wie gemeldet wird, kommt von außen
 * (`gesichert` aus dem Store, `toast` aus Toast.tsx — zusammengesteckt in
 * `useQuittung`). Kein spürbarer Verzug im Normalfall: Der Store schreibt
 * für eine Quittung sofort statt nach seinem Zeitgeber, und IndexedDB
 * antwortet in Millisekunden.
 */

export type QuittungsTon = 'ok' | 'wait' | 'bad'
export type Melden = (text: string, ton: QuittungsTon) => void

/**
 * Wie lange eine Quittung höchstens auf das Schreiben wartet. Dieselbe Größe
 * wie beim Lesen (`LESE_ZEITGRENZE_MS` in persist.ts): Ein Schreibvorgang
 * dauert Millisekunden — drei Sekunden ohne Antwort sind ein Ausfall, und
 * wer so lange nichts hört, hält die Aktion für gelungen.
 */
export const SICHERN_ZEITGRENZE_MS = 3000

export interface Quittung {
  /** Wartet auf das Schreiben: `true` gesichert, `false` gescheitert. */
  sichern: () => Promise<boolean>
  melden: Melden
  /** Die Quittung bei Erfolg */
  text: string
  /** Ton der Quittung — `wait` für „gespeichert, aber …" */
  ton?: QuittungsTon
  /** Die Meldung, wenn das Schreiben scheitert oder nicht antwortet */
  fehlerText: string
  zeitgrenzeMs?: number
}

/**
 * Melden, was wirklich geschehen ist: die Quittung erst nach gelungenem
 * Schreiben, sonst die Fehlermeldung (Ton `bad`). Eine Zeitüberschreitung
 * zählt als gescheitert — „vielleicht gespeichert" ist für einen Nachweis
 * keine Auskunft. Liefert, ob gesichert wurde.
 */
export async function quittieren(q: Quittung): Promise<boolean> {
  let zeitgeber: ReturnType<typeof setTimeout> | undefined
  const zeitUm = new Promise<false>((resolve) => {
    zeitgeber = setTimeout(() => resolve(false), q.zeitgrenzeMs ?? SICHERN_ZEITGRENZE_MS)
  })
  let ok: boolean
  try {
    ok = await Promise.race([q.sichern(), zeitUm])
  } catch {
    // Ein Wurf beim Sichern ist ein gescheitertes Sichern, kein Absturz der Ansicht.
    ok = false
  } finally {
    clearTimeout(zeitgeber)
  }
  if (ok) q.melden(q.text, q.ton ?? 'ok')
  else q.melden(q.fehlerText, 'bad')
  return ok
}
