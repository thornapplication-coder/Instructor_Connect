import type { GradingRecord } from './types'

/**
 * Fassung des Abdruck-Verfahrens. Sie steht im Datensatz (`hashVersion`),
 * damit ein bereits unterschriebenes Dokument auch nach einer Erweiterung
 * der Feldliste noch mit DEM Verfahren nachgerechnet wird, unter dem es
 * entstanden ist. Ohne diese Kennung hätte jede Ergänzung sämtliche
 * Altbestände auf einen Schlag als „nachträglich geändert" gemeldet — also
 * genau den Alarm ausgelöst, den der Abdruck belegen soll.
 *
 * 1 = Erststand. 2 = zusätzlich `authority` und `extraRecipients`.
 */
export const HASH_VERSION = 2

/**
 * Fingerabdruck des unterschriebenen Dokuments (SHA-256).
 *
 * Eine gezeichnete Unterschrift ist nur ein PNG — nichts band sie bisher
 * an den Inhalt, unter dem sie steht: Wer den Datensatz nachträglich
 * ändert (Noten, Texte, sogar das Unterschriftsbild selbst), erhielt ein
 * Dokument, dem man das nicht ansieht.
 *
 * Beim Unterschreiben wird deshalb dieser Fingerabdruck über die
 * prüfrelevanten Felder samt der Unterschriftsbilder gebildet und im
 * Datensatz gespeichert. Die Ansicht rechnet ihn nach: stimmt er nicht
 * mehr, wurde nach der Unterschrift verändert — und das Dokument sagt es.
 *
 * Kein Ersatz für eine echte qualifizierte Signatur; aber jede spätere
 * Änderung ist damit BELEGBAR statt unsichtbar. Die Feldliste ist bewusst
 * explizit: Sie friert ein, was der Abdruck abdeckt. Erweitert wird sie
 * nur über eine neue `version` — Altbestände rechnen weiter mit ihrer
 * eigenen Fassung nach und melden dadurch keine Änderung, die es nie gab.
 */
export async function contentFingerprint(r: GradingRecord, version: number = HASH_VERSION): Promise<string> {
  const core: Record<string, unknown> = {
    formTypeId: r.formTypeId,
    instructorId: r.instructorId,
    header: r.header,
    trainees: r.trainees,
    competencies: r.competencies ?? null,
    sessionStatus: r.sessionStatus ?? null,
    freeText: r.freeText,
    attendance: r.attendance ?? null,
    signatureInstructor: r.signatureInstructor ?? null,
    signatureTrainee: r.signatureTrainee ?? null,
    signedAt: r.signedAt ?? null,
    instructorSignedAt: r.instructorSignedAt ?? null,
    countersignedAt: r.countersignedAt ?? null,
    lateSignatureBy: r.lateSignatureBy ?? null,
    parentId: r.parentId ?? null,
  }
  // Angehängt, nicht eingefügt: JSON.stringify folgt der Einfügereihenfolge,
  // deshalb ergibt Fassung 1 weiterhin Byte für Byte dieselbe Zeichenkette.
  //
  // Die Behörde (AT.ATO.106 / GBR.ATO.0541) steht im Dokumentkopf und
  // entscheidet, unter welcher Zulassung die Schulung lief — sie war nicht
  // abgedeckt und ließ sich nach der Unterschrift unbemerkt umstellen.
  // Die zusätzlichen Empfänger gehören ebenfalls zum Vorgang.
  if (version >= 2) {
    // Fehlt die Angabe (Altbestand), gilt AT — genau so liest die Anzeige
    // sie auch. Beides muss denselben Abdruck ergeben, sonst haette
    // dieselbe Aussage zwei verschiedene Fingerabdruecke.
    core.authority = r.authority ?? 'AT'
    core.extraRecipients = r.extraRecipients ?? null
  }
  const bytes = new TextEncoder().encode(JSON.stringify(core))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Kurzform für die Anzeige — eindeutig genug zum Abgleich zweier Ausdrucke. */
export function shortFingerprint(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 16)}`
}
