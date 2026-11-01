import JSZip from 'jszip'
import { aufbereiten } from './aufbereiten'
import { LEERE_LENKUNG, type Rechtscharakter, type Rohdokument } from './model'
import { xmlEreignisse } from './xml'

/**
 * XLSX lesen — eigener Leser über jszip statt SheetJS: Die npm-Fassung von
 * SheetJS (0.18.5) hat bekannte Sicherheitslücken, und die korrigierte gibt
 * es nur über die Herstellerseite. Gelesen wird, was für die Prüfung zählt:
 * je Blatt eine „Seite", je Zeile die Zellen als „A | B | C" (Spez. 7.4).
 * Formeln zählen mit ihrem gespeicherten Ergebnis.
 */

export function geteilteTexte(xml: string): string[] {
  const out: string[] = []
  let aktuell: string | null = null
  let inT = false
  let inRph = 0
  for (const e of xmlEreignisse(xml)) {
    if (e.typ === 'auf' && e.name === 'si') aktuell = ''
    else if (e.typ === 'zu' && e.name === 'si') { out.push(aktuell ?? ''); aktuell = null }
    // Phonetische Hilfen (rPh) sind kein Zellinhalt.
    else if (e.typ === 'auf' && e.name === 'rPh') inRph++
    else if (e.typ === 'zu' && e.name === 'rPh') inRph--
    else if (e.typ === 'auf' && e.name === 't') inT = true
    else if (e.typ === 'zu' && e.name === 't') inT = false
    else if (e.typ === 'text' && inT && !inRph && aktuell !== null) aktuell += e.text
  }
  return out
}

/** Zeilen eines Blatts als Zellwerte. */
export function blattZeilen(xml: string, geteilt: string[]): string[] {
  const zeilen: string[] = []
  let reihe: string[] | null = null
  let typ = ''
  let wert = ''
  let sammeln = false
  for (const e of xmlEreignisse(xml)) {
    if (e.typ === 'auf' && e.name === 'row') reihe = []
    else if (e.typ === 'zu' && e.name === 'row') { if (reihe?.some(Boolean)) zeilen.push(reihe.filter(Boolean).join(' | ')); reihe = null }
    else if (e.typ === 'auf' && e.name === 'c') { typ = e.attr.t ?? 'n'; wert = '' }
    else if (e.typ === 'zu' && e.name === 'c') {
      const w = typ === 's' ? (geteilt[Number(wert)] ?? '') : typ === 'b' ? (wert === '1' ? 'TRUE' : 'FALSE') : wert
      reihe?.push(w.replace(/\s+/g, ' ').trim())
    } else if (e.typ === 'auf' && (e.name === 'v' || e.name === 't')) sammeln = true
    else if (e.typ === 'zu' && (e.name === 'v' || e.name === 't')) sammeln = false
    else if (e.typ === 'text' && sammeln) wert += e.text
  }
  return zeilen
}

export async function xlsxLesen(daten: Uint8Array | ArrayBuffer, vorgabe?: Rechtscharakter): Promise<Rohdokument> {
  const zip = await JSZip.loadAsync(daten)
  const lies = async (pfad: string) => zip.file(pfad)?.async('string')
  const mappe = await lies('xl/workbook.xml')
  if (!mappe) throw new Error('DC-XLSX-INVALID')
  const rels = (await lies('xl/_rels/workbook.xml.rels')) ?? ''
  const ziele = new Map<string, string>()
  for (const e of xmlEreignisse(rels)) if (e.typ === 'auf' && e.name === 'Relationship') ziele.set(e.attr.Id, e.attr.Target)
  const blaetter: { name: string; pfad: string }[] = []
  for (const e of xmlEreignisse(mappe)) {
    if (e.typ === 'auf' && e.name === 'sheet') {
      const ziel = ziele.get(e.attr['r:id'] ?? '') ?? ''
      blaetter.push({ name: e.attr.name ?? `Sheet${blaetter.length + 1}`, pfad: ziel.startsWith('/') ? ziel.slice(1) : `xl/${ziel}` })
    }
  }
  const geteilt = geteilteTexte((await lies('xl/sharedStrings.xml')) ?? '')
  const roh: string[][] = []
  for (const b of blaetter) roh.push(blattZeilen((await lies(b.pfad)) ?? '', geteilt))
  const { pages } = aufbereiten(roh, { vorgabe, kopfFuss: false, labels: blaetter.map((b) => b.name) })
  return { format: 'xlsx', pages, outline: [], lenkung: { ...LEERE_LENKUNG }, ocrKandidaten: [], tabellen: blaetter.length }
}
