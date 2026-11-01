import { bindestrichWoerter, zeilenVerbinden } from './bindestrich'
import { abschnittsPfade } from './gliederung'
import { kopfFussEntfernen } from './kopfFuss'
import type { DocPage, OutlineNode, Rechtscharakter } from './model'
import { rechtscharakter, regelIds } from './regeln'

/**
 * Gemeinsamer Weg von Rohzeilen zu Seiten — für PDF, DOCX und XLSX gleich.
 *
 * Eine Normalisierung je Format liefe auseinander: Die Suche fände
 * „go-around" im PDF und „goaround" im DOCX desselben Handbuchs.
 */
export function aufbereiten(
  rohSeiten: string[][],
  opts: { vorgabe?: Rechtscharakter; labels?: (string | undefined)[]; kopfFuss?: boolean; ocr?: Set<number> },
): { pages: DocPage[]; outline: OutlineNode[]; entfernt: string[] } {
  const kf = opts.kopfFuss === false ? { seiten: rohSeiten, labels: rohSeiten.map(() => undefined), entfernt: [], rand: rohSeiten.map(() => [] as string[]) } : kopfFussEntfernen(rohSeiten)
  // Die Bindestrich-Heuristik schaut ins GANZE Dokument: „go-around" auf
  // Seite 400 entscheidet über den Zeilenumbruch auf Seite 12.
  const echte = bindestrichWoerter(kf.seiten.flat())
  const texte = kf.seiten.map((zeilen) => zeilenVerbinden(zeilen, echte))
  const { pfade, outline } = abschnittsPfade(texte)
  const pages = texte.map((text, i): DocPage => {
    const label = opts.labels?.[i] ?? kf.labels[i]
    const refs = regelIds(text)
    const lt = rechtscharakter(text, opts.vorgabe)
    return {
      index: i + 1,
      ...(label ? { label } : {}),
      text,
      ...(pfade[i].length ? { sectionPath: pfade[i] } : {}),
      ...(refs.length ? { regRefs: refs } : {}),
      ...(lt ? { legalType: lt } : {}),
      ...(opts.ocr?.has(i + 1) ? { isOcr: true } : {}),
      ...(kf.rand[i]?.length ? { rand: kf.rand[i] } : {}),
    }
  })
  return { pages, outline, entfernt: kf.entfernt }
}
