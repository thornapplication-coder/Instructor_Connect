import type { GradingRecord } from './types'

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
 * explizit: Sie friert ein, was der Abdruck abdeckt — neue optionale
 * Felder ändern die Abdrücke bestehender Dokumente nicht.
 */
export async function contentFingerprint(r: GradingRecord): Promise<string> {
  const core = {
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
  const bytes = new TextEncoder().encode(JSON.stringify(core))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Kurzform für die Anzeige — eindeutig genug zum Abgleich zweier Ausdrucke. */
export function shortFingerprint(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 16)}`
}
