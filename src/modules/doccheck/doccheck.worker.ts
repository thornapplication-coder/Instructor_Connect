import { Kern, type LeseAuftrag, type Zusammenfassung } from './kern'
import { pdfjsLaden } from './pdfjsLaden'
import type { ReferenzListe } from './referenz/liste'
import type { Treffer } from './search/suche'
import type { FremdBefund, Ziel } from './recheck/fremdliste'
import type { ReErgebnis } from './recheck/pruefen'

/**
 * Web Worker von DocCheck (Spez. 4.1): Parser, Suchindex, Textvergleich
 * laufen hier, damit die Oberfläche beim Einlesen von 2 600 Seiten nicht
 * stehen bleibt. Diese Datei übersetzt nur Nachrichten — die Arbeit macht
 * der Kern.
 */

export type Anfrage =
  | { typ: 'init'; basis: string }
  | { typ: 'lesen'; auftrag: LeseAuftrag }
  | { typ: 'abbrechen'; id: string }
  | { typ: 'entfernen'; id: string }
  | { typ: 'titel'; id: string; titel: string }
  | { typ: 'suchen'; nr: number; q: string }
  | { typ: 'seite'; nr: number; id: string; seite: number }
  | { typ: 'ocr'; id: string; seiten: { n: number; text: string }[] }
  | { typ: 'paaren'; id: string; daten: Uint8Array }
  | { typ: 'referenzen'; listen: ReferenzListe[] }
  | { typ: 'nachpruefen'; nr: number; auftraege: { befund: FremdBefund; ziel: Ziel }[] }

export type Antwort =
  | { typ: 'fortschritt'; id: string; seite: number; gesamt: number }
  | { typ: 'fertig'; id: string; z: Zusammenfassung }
  | { typ: 'fehler'; id: string; code: string }
  | { typ: 'treffer'; nr: number; treffer: Treffer[] }
  | { typ: 'seite'; nr: number; text: string | null }
  | { typ: 'nachgeprueft'; nr: number; ergebnisse: ReErgebnis[] }

export interface Bereich {
  onmessage: ((e: { data: Anfrage }) => void) | null
  postMessage(a: Antwort): void
}

/** Fehlercodes (DC-…) gehen durch, alles andere wird zu DC-PARSE — kein
 *  Stacktrace mit womöglich Dokumentinhalt in der Oberfläche (Spez. 5.3). */
export function fehlerCode(e: unknown): string {
  const m = (e as Error)?.message ?? ''
  return /^DC-[A-Z0-9-]+$/.test(m) ? m : 'DC-PARSE'
}

export function verbinden(bereich: Bereich, kernFuer: (basis: string) => Kern): void {
  let kern: Kern | null = null
  const k = () => (kern ??= kernFuer(''))
  bereich.onmessage = async ({ data: a }) => {
    switch (a.typ) {
      case 'init':
        kern = kernFuer(a.basis)
        return
      case 'lesen':
        try {
          const z = await k().lesen(a.auftrag, (seite, gesamt) => bereich.postMessage({ typ: 'fortschritt', id: a.auftrag.id, seite, gesamt }))
          bereich.postMessage({ typ: 'fertig', id: a.auftrag.id, z })
        } catch (e) {
          bereich.postMessage({ typ: 'fehler', id: a.auftrag.id, code: fehlerCode(e) })
        }
        return
      case 'abbrechen':
        k().abbrechen(a.id)
        return
      case 'entfernen':
        k().entfernen(a.id)
        return
      case 'titel':
        k().titelSetzen(a.id, a.titel)
        return
      case 'suchen':
        bereich.postMessage({ typ: 'treffer', nr: a.nr, treffer: k().suchen(a.q) })
        return
      case 'seite':
        bereich.postMessage({ typ: 'seite', nr: a.nr, text: k().seitenText(a.id, a.seite) })
        return
      case 'nachpruefen':
        bereich.postMessage({ typ: 'nachgeprueft', nr: a.nr, ergebnisse: k().nachpruefen(a.auftraege) })
        return
      case 'referenzen':
        for (const z of k().referenzenSetzen(a.listen)) bereich.postMessage({ typ: 'fertig', id: z.id, z })
        return
      case 'paaren': {
        const z = await k().paaren(a.id, a.daten)
        if (z) bereich.postMessage({ typ: 'fertig', id: a.id, z })
        return
      }
      case 'ocr': {
        const z = k().ocrEinspielen(a.id, a.seiten)
        if (z) bereich.postMessage({ typ: 'fertig', id: a.id, z })
        return
      }
    }
  }
}

declare const WorkerGlobalScope: unknown
if (typeof WorkerGlobalScope !== 'undefined') {
  verbinden(self as unknown as Bereich, (basis) => new Kern({ pdfjs: pdfjsLaden, standardFontDataUrl: basis ? `${basis}pdf-fonts/` : undefined }))
}
