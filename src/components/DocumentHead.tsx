/**
 * Kopf eines gedruckten Berichts: Absender (ATO, Zulassung), Titel,
 * Bereichszeile (Zeitraum, Flotte, Behörde) und Stempel (wann, von wem).
 *
 * Audit 11/2026, RPT-01: Den Kopf hatte nur der Standardisierungsbericht,
 * von Hand geschrieben. Die Statistik — ausdrücklich fürs Querformat
 * gestaltet — druckte ohne ATO, Titel und Zeitpunkt; ein solcher Ausdruck
 * ist keiner Organisation und keinem Stand zuzuordnen, und genau daran
 * scheitern Audits. Beide Berichte nehmen jetzt diese Komponente.
 *
 * Ohne Logik: Was in den Zeilen steht (welche Zulassung, welcher Bereich),
 * rechnen `briefkopfZulassung` und `berichtsKennung` in gradingStats.ts.
 */
export function DocumentHead({
  absender,
  titel,
  bereich,
  stempel,
  nurDruck = false,
}: {
  /** z. B. [ATO-Name, Zulassung] — leere Teile entfallen */
  absender: readonly (string | null | undefined)[]
  titel: string
  bereich: string
  stempel: string
  /** Nur im Ausdruck: Auf dem Bildschirm sagen die Auswahlfelder dasselbe. */
  nurDruck?: boolean
}) {
  return (
    <div className={`border-b-2 border-line/60 pb-2 ${nurDruck ? 'hidden print:block' : ''}`}>
      <p className="text-micro font-semibold uppercase tracking-wide">{absender.filter(Boolean).join(' · ')}</p>
      <h2 className="text-title font-bold tracking-tight">{titel}</h2>
      <p className="mt-1 flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-micro text-dim">
        <span>{bereich}</span>
        <span>{stempel}</span>
      </p>
    </div>
  )
}
