/**
 * Teile eines Dateinamens, zwischen denen eine Zeile umbrechen darf: jeweils
 * NACH „_", „-" und „.". Die Ansicht setzt dazwischen ein `<wbr>`.
 *
 * In der 15rem-Spalte (bewusste Layoutentscheidung) brach ein Dateiname mit
 * `break-all` an beliebiger Stelle — „SBX-WORD-01 _TM_E2R0.d ocx" (Audit
 * 11/2026, UID-05). Ein Dateiname hat keine Leerzeichen, für den Browser ist
 * er EIN Wort; die Trennzeichen sind die Stellen, an denen ein Mensch ihn
 * liest. Erst wenn ein einzelner Teil breiter ist als die Spalte, bricht
 * `break-words` ihn notgedrungen im Wort.
 *
 * Mehrere Trennzeichen hintereinander („a__b") und ein führendes („.env")
 * bleiben bei ihrem Wort — ein Teil, der nur aus Trennzeichen besteht, wäre
 * eine Zeile ohne Inhalt. Die Endung bleibt beim Teil davor: „docx" allein
 * in der letzten Zeile sah nachgemessen (1440 px) wie ein Rest aus.
 */
export function umbruchStellen(name: string): string[] {
  const roh = name.match(/[_.-]*[^_.-]+[_.-]*|[_.-]+/g) ?? [name]
  // Ein Punkt zwischen Ziffern gehört zur Zahl: „R0.1" brach sonst zu
  // „R0." / „1.docx" um (Gegenprüfung Audit 11/2026, UID-05).
  const teile: string[] = []
  for (const t of roh) {
    if (teile.length && /\d\.$/.test(teile.at(-1)!) && /^\d/.test(t)) teile[teile.length - 1] += t
    else teile.push(t)
  }
  const letzter = teile.at(-1)!
  if (teile.length > 1 && teile.at(-2)!.endsWith('.') && /^[\p{L}\p{N}]{1,5}$/u.test(letzter)) {
    return [...teile.slice(0, -2), teile.at(-2)! + letzter]
  }
  return teile
}
