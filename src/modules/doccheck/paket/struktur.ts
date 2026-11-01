import { vergleichsform } from '../parse/seitenzuordnung'

/**
 * Dokumentpaket mit Hierarchie (Nachtrag N1): Kürzel, Ebene, Geschwister-
 * gruppe und Variante je Prüfdokument. Vorbelegt aus Dateiname und Titel,
 * als „erkannt" markiert — bestätigt wird von Hand (N1.1).
 */

export interface PaketAngaben {
  kuerzel: string
  /** 1 = höchste Stufe (TM), 2 = Appendix, 3 = Annex */
  ebene: number
  /** Geschwistergruppe (N2) — gleicher Wert = gleiche Gruppe */
  gruppe: string
  /** Fassung innerhalb der Gruppe, z. B. „MP", „SP", „A" */
  variante: string
  erkannt: boolean
}

const PRAEFIX: [RegExp, string, number][] = [
  [/\b(?:TM|training\s*manual)\b/i, 'TM', 1],
  [/\b(?:APX|APPENDIX)[\s_-]*(\d+[A-Z]?|[A-Z])\b/i, 'APX', 2],
  [/\b(?:ANX|ANNEX)[\s_-]*(\d+[A-Z]?|[A-Z])\b/i, 'ANX', 3],
]

/** Dateiname ohne Endung, Trenner als Leerzeichen — „SBX_TM_R0.1.docx" → „SBX TM R0.1". */
const lesbar = (s: string) => s.replace(/\.(docx|pdf|xlsx)$/i, '').replace(/_/g, ' ')

/**
 * Vorbelegung. Der Dateiname geht vor dem Titel: Er ist in Paketen die
 * stabilere Konvention („1_TM", „2_APX4"); der Titel springt ein, wenn der
 * Name nichts hergibt. Ein Ziffern-Präfix („2_…") setzt die Ebene.
 */
export function vorbelegen(name: string, titel = ''): PaketAngaben {
  let kuerzel = ''
  let ebene = 0
  for (const quelle of [lesbar(name), titel]) {
    for (const [re, k, e] of PRAEFIX) {
      const m = quelle.match(re)
      if (m) {
        kuerzel = m[1] ? `${k} ${m[1].toUpperCase()}` : k
        ebene = e
        break
      }
    }
    if (kuerzel) break
  }
  const ziffer = name.match(/^(\d)[_\s-]/)
  if (ziffer) ebene = Number(ziffer[1])
  const v = `${lesbar(name)} ${titel}`.match(/\b(MP|SP)\b|\bvariant(?:e)?\s+([A-D])\b/i)
  return { kuerzel, ebene: ebene || 1, gruppe: '', variante: v ? (v[1] ?? v[2]).toUpperCase() : '', erkannt: !!kuerzel }
}

/**
 * Geschwistergruppen vorschlagen: gleiche Ebene, und entweder dasselbe
 * Kürzel mit unterschiedlicher Variante oder Kürzel, die sich nur im
 * letzten Buchstaben unterscheiden („ANX 2A"/„ANX 2B"). Eine Gruppe aus
 * einem Dokument ist keine.
 */
export function gruppenVorschlagen(docs: { id: string; a: PaketAngaben }[]): Record<string, string> {
  const stamm = (k: string) => k.replace(/(\d)[A-Z]$/i, '$1')
  const basis = (a: PaketAngaben) => `${a.ebene}|${vergleichsform(stamm(a.kuerzel))}`
  const zaehler = new Map<string, number>()
  for (const d of docs) if (d.a.kuerzel) zaehler.set(basis(d.a), (zaehler.get(basis(d.a)) ?? 0) + 1)
  const out: Record<string, string> = {}
  for (const d of docs) {
    if (!d.a.kuerzel || (zaehler.get(basis(d.a)) ?? 0) < 2) continue
    out[d.id] = stamm(d.a.kuerzel)
  }
  return out
}

/** Variante aus dem Kürzel ableiten, wenn sonst keine erkannt wurde („ANX 2B" → „B"). */
export function varianteAusKuerzel(kuerzel: string): string {
  return kuerzel.match(/\d([A-Z])$/i)?.[1].toUpperCase() ?? ''
}
