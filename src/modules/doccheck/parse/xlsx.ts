import { formatDate } from '../../../datum'
import { teilLesen, zipOeffnen } from './zip'
import { aufbereiten } from './aufbereiten'
import { LEERE_LENKUNG, type Rechtscharakter, type Rohdokument } from './model'
import { xmlEreignisse } from './xml'

/**
 * XLSX lesen — eigener Leser über jszip statt SheetJS: Die npm-Fassung von
 * SheetJS (0.18.5) hat bekannte Sicherheitslücken, und die korrigierte gibt
 * es nur über die Herstellerseite. Gelesen wird, was für die Prüfung zählt:
 * je Blatt eine „Seite", je Zeile die Zellen als „A | B | C" (Spez. 7.4).
 * Formeln zählen mit ihrem gespeicherten Ergebnis.
 *
 * Audit 11/2026, FRD-11: Zahlen stehen so da, wie Excel sie ZEIGT — ein
 * Datum ist „02.03.2026", nicht 46083, eine Zeit „14:00", nicht 0,583333 —
 * und leere Zellen behalten ihren Platz. Vorher rutschte nach jeder leeren
 * Zelle der Rest der Zeile nach links, die Summenzeile passte zu keiner
 * Spalte, und die Rechenprüfung prüfte Excel-Listen faktisch nicht.
 */

/** Eingebaute Zahlformate (ECMA-376 18.8.30), soweit sie die Anzeige ändern. Kurzdatum: Hausformat. */
const EINGEBAUT: Record<number, string> = {
  1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%',
  14: 'dd.mm.yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd.mm.yyyy h:mm',
  37: '#,##0', 38: '#,##0', 39: '#,##0.00', 40: '#,##0.00', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0',
}

/** Formatcode je Zellformat-Index (cellXfs, also das s-Attribut der Zelle) aus xl/styles.xml. */
export function zahlformateLesen(stylesXml: string): (string | undefined)[] {
  const eigene = new Map<number, string>()
  const out: (string | undefined)[] = []
  let inXfs = false
  for (const e of xmlEreignisse(stylesXml)) {
    if (e.typ === 'auf' && e.name === 'numFmt') eigene.set(Number(e.attr.numFmtId), e.attr.formatCode ?? '')
    else if (e.typ === 'auf' && e.name === 'cellXfs') inXfs = true
    else if (e.typ === 'zu' && e.name === 'cellXfs') inXfs = false
    else if (e.typ === 'auf' && e.name === 'xf' && inXfs) {
      const id = Number(e.attr.numFmtId ?? 0)
      out.push(eigene.get(id) ?? EINGEBAUT[id])
    }
  }
  return out
}

const zwei = (n: number) => String(n).padStart(2, '0')

/**
 * Ein gespeicherter Zahlwert, wie Excel ihn mit diesem Formatcode zeigt:
 * Datum im Hausformat DD.MM.YYYY (datum.ts), Zeiten 24-stündig, verstrichene
 * Zeit ([h]:mm) über 24 Stunden hinaus, Prozent wie Excel („53%"). Was sich
 * nicht sicher deuten lässt (Bruch, Exponent, Text), bleibt der gespeicherte
 * Wert — ohne Gleitkommarest („0.30000000000000004" → „0.3").
 */
export function zahlZeigen(wert: string, code: string | undefined, datum1904 = false): string {
  const v = Number(wert)
  if (wert.trim() === '' || !Number.isFinite(v)) return wert
  const roh = Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(15)))
  if (!code) return roh
  // Erster Abschnitt (positive Zahlen), ohne Literale, Escapes, Füllzeichen, Farben und Gebietsschema
  const c = (code.split(';')[0] ?? '').replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/[_*]./g, '').replace(/\[(?![hms]+\])[^\]]*\]/gi, '').trim()
  if (!c || /general|@|E[+-]|\?/i.test(c)) return roh
  const zeit = /h|s|\[m+\]/i.test(c)
  const datum = /[dy]/i.test(c) || (/m/i.test(c) && !zeit)
  if (datum || zeit) {
    if (v < 0) return roh
    const mitSek = /s/i.test(c)
    // Gerundet auf die kleinste angezeigte Einheit — 0,5833333 Tage sind 14:00
    const einheit = mitSek ? 1 : 60
    const gesamt = Math.round((v * 86400) / einheit) * einheit
    const tage = Math.floor(gesamt / 86400)
    const rest = gesamt - tage * 86400
    const [h, m, s] = [Math.floor(rest / 3600), Math.floor((rest % 3600) / 60), rest % 60]
    const sek = mitSek ? `:${zwei(s)}` : ''
    if (!datum) {
      if (/\[h+\]/i.test(c)) return `${Math.floor(gesamt / 3600)}:${zwei(m)}${sek}`
      if (/\[m+\]/i.test(c)) return `${Math.floor(gesamt / 60)}:${zwei(s)}`
      if (!/h/i.test(c)) return `${zwei(m)}:${zwei(s)}`
      return `${/hh/i.test(c) ? zwei(h) : h}:${zwei(m)}${sek}`
    }
    // Seriell → Kalendertag; Excel zählt den 29.02.1900 mit, den es nicht gab
    const basis = datum1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, tage < 61 ? 31 : 30)
    const iso = new Date(basis + tage * 86400000).toISOString().slice(0, 10)
    return /h/i.test(c) ? `${formatDate(iso)} ${zwei(h)}:${zwei(m)}` : formatDate(iso)
  }
  const nachkomma = c.match(/\.([0#]+)/)?.[1] ?? ''
  const fest = (nachkomma.match(/0/g) ?? []).length
  if (c.includes('%')) return `${zahlText(v * 100, fest, nachkomma.length)}%`
  if (/[0#]/.test(c)) return zahlText(v, fest, nachkomma.length)
  return roh
}

/** Gerundet auf `stellen`, mindestens `fest` Nachkommastellen — ohne Tausendertrenner (die läse die Rechenprüfung als Dezimalkomma). */
function zahlText(v: number, fest: number, stellen: number): string {
  // Kaufmännisch gerundet wie Excel: 0,5345 → 53,45 % → „53.5%", nicht 53.4 (Gleitkommarest)
  const f = 10 ** stellen
  const t = (Math.round(Number((v * f).toPrecision(15))) / f).toFixed(stellen)
  if (!t.includes('.')) return t
  const [ganz, nach] = t.split('.')
  const gekuerzt = nach.replace(/0+$/, '').padEnd(fest, '0')
  return gekuerzt ? `${ganz}.${gekuerzt}` : ganz
}

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

export async function xlsxLesen(daten: Uint8Array | ArrayBuffer, vorgabe?: Rechtscharakter, signal?: AbortSignal): Promise<Rohdokument> {
  const zip = await zipOeffnen(daten)
  // Abbrechen (DC-01): nach jedem entpackten Teil, also je Blatt
  const lies = async (pfad: string) => {
    const xml = await teilLesen(zip, pfad)
    if (signal?.aborted) throw new Error('DC-ABORTED')
    return xml
  }
  const mappe = await lies('xl/workbook.xml')
  if (!mappe) throw new Error('DC-XLSX-INVALID')
  const rels = (await lies('xl/_rels/workbook.xml.rels')) ?? ''
  const ziele = new Map<string, string>()
  for (const e of xmlEreignisse(rels)) if (e.typ === 'auf' && e.name === 'Relationship') ziele.set(e.attr.Id, e.attr.Target)
  const blaetter: { name: string; pfad: string }[] = []
  // Datumszählung ab 1904 (ältere Mac-Dateien) — aus demselben Ereignisstrom, nicht per Muster über das XML
  let datum1904 = false
  for (const e of xmlEreignisse(mappe)) {
    if (e.typ === 'auf' && e.name === 'workbookPr') datum1904 = /^(1|true)$/i.test(e.attr.date1904 ?? '')
    if (e.typ === 'auf' && e.name === 'sheet') {
      const ziel = ziele.get(e.attr['r:id'] ?? '') ?? ''
      blaetter.push({ name: e.attr.name ?? `Sheet${blaetter.length + 1}`, pfad: ziel.startsWith('/') ? ziel.slice(1) : `xl/${ziel}` })
    }
  }
  const geteilt = geteilteTexte((await lies('xl/sharedStrings.xml')) ?? '')
  const formate = { codes: zahlformateLesen((await lies('xl/styles.xml')) ?? ''), datum1904 }
  const roh: string[][] = []
  for (const b of blaetter) {
    const nr: number[] = []
    roh.push(rasterZeilen(blattRaster((await lies(b.pfad)) ?? '', geteilt, nr, formate), nr))
  }
  const { pages } = aufbereiten(roh, { vorgabe, kopfFuss: false, labels: blaetter.map((b) => b.name) })
  return { format: 'xlsx', pages, outline: [], lenkung: { ...LEERE_LENKUNG }, ocrKandidaten: [], tabellen: blaetter.length }
}

/**
 * Raster → Textzeilen „A | B | C" (FRD-11). Leere Randspalten fallen weg;
 * Zeilen mit mindestens zwei Werten werden auf die volle Breite aufgefüllt,
 * damit jede Spalte an ihrem Platz bleibt — auch nach leeren Zellen und in
 * der Summenzeile. Eine Zeile mit nur einem Wert (Titel, Hinweis) ist Text,
 * keine Tabellenzeile. Wo Excel-Zeilen fehlen, steht eine Leerzeile: Zwei
 * Tabellen untereinander bleiben zwei Tabellen.
 */
export function rasterZeilen(raster: string[][], nummern: number[] = []): string[] {
  // Belegte Spalten per Schleife: Math.min(...belegt) brach ab etwa 150 000
  // Zellen mit „Maximum call stack size exceeded" ab — ein großes Blatt war
  // dann unlesbar (gefunden bei DC-01, große Dateien).
  let von = Infinity
  let bis = -1
  for (const z of raster) z.forEach((c, i) => {
    if (!c) return
    if (i < von) von = i
    if (i > bis) bis = i
  })
  if (bis < 0) return []
  const out: string[] = []
  raster.forEach((z, i) => {
    if (i > 0 && nummern[i] !== undefined && nummern[i - 1] !== undefined && nummern[i] - nummern[i - 1] > 1) out.push('')
    const zellen = Array.from({ length: bis - von + 1 }, (_, k) => z[von + k] ?? '')
    const werte = zellen.filter(Boolean)
    out.push(werte.length >= 2 ? zellen.join(' | ') : werte[0])
  })
  return out
}

/** Spaltenindex aus einer Zellreferenz („C12" → 2). */
export function spalte(ref: string): number {
  const b = ref.match(/^[A-Z]+/)?.[0] ?? 'A'
  return [...b].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
}

/**
 * Ein Blatt als Zellraster — leere Zellen bleiben leer, Spalten stehen an
 * ihrem Platz. Leere ZEILEN fallen weg; wer zurückschreiben will, braucht
 * deshalb die Excel-Zeilennummer je Rasterzeile (`nummern`, ab 1).
 */
export function blattRaster(xml: string, geteilt: string[], nummern?: number[], formate?: { codes: (string | undefined)[]; datum1904?: boolean }): string[][] {
  const zeilen: string[][] = []
  let reihe: string[] | null = null
  let zeilenNr = 0
  let typ = ''
  let wert = ''
  let ref = ''
  let stil = 0
  let sammeln = false
  for (const e of xmlEreignisse(xml)) {
    if (e.typ === 'auf' && e.name === 'row') {
      reihe = []
      // Ohne r-Attribut zählt Excel fortlaufend weiter.
      zeilenNr = e.attr.r ? Number(e.attr.r) : zeilenNr + 1
    } else if (e.typ === 'zu' && e.name === 'row') {
      if (reihe?.some((z) => z?.trim())) {
        zeilen.push(Array.from(reihe, (z) => z ?? ''))
        nummern?.push(zeilenNr)
      }
      reihe = null
    } else if (e.typ === 'auf' && e.name === 'c') { typ = e.attr.t ?? 'n'; wert = ''; ref = e.attr.r ?? ''; stil = Number(e.attr.s ?? 0) }
    else if (e.typ === 'zu' && e.name === 'c' && reihe) {
      // Mit Zahlformaten (Prüfdokument): wie Excel zeigt; ohne (Fremd-/Referenzlisten): gespeicherter Wert
      const zahl = formate && typ === 'n' ? zahlZeigen(wert, formate.codes[stil], formate.datum1904) : formate && typ === 'd' && /^\d{4}-\d{2}-\d{2}/.test(wert) ? formatDate(wert.slice(0, 10)) : wert
      const w = typ === 's' ? (geteilt[Number(wert)] ?? '') : typ === 'b' ? (wert === '1' ? 'TRUE' : 'FALSE') : zahl
      reihe[ref ? spalte(ref) : reihe.length] = w.replace(/\s+/g, ' ').trim()
    } else if (e.typ === 'auf' && (e.name === 'v' || e.name === 't')) sammeln = true
    else if (e.typ === 'zu' && (e.name === 'v' || e.name === 't')) sammeln = false
    else if (e.typ === 'text' && sammeln) wert += e.text
  }
  return zeilen
}

/** Alle Blätter als Raster (Referenzlisten, Fremdlisten) — mit Excel-Zeilennummern. */
export async function xlsxTabellen(daten: Uint8Array | ArrayBuffer): Promise<{ name: string; zeilen: string[][]; zeilenNr: number[] }[]> {
  const zip = await zipOeffnen(daten)
  const lies = (pfad: string) => teilLesen(zip, pfad)
  const mappe = await lies('xl/workbook.xml')
  if (!mappe) throw new Error('DC-XLSX-INVALID')
  const ziele = new Map<string, string>()
  for (const e of xmlEreignisse((await lies('xl/_rels/workbook.xml.rels')) ?? '')) if (e.typ === 'auf' && e.name === 'Relationship') ziele.set(e.attr.Id, e.attr.Target)
  const geteilt = geteilteTexte((await lies('xl/sharedStrings.xml')) ?? '')
  const out: { name: string; zeilen: string[][]; zeilenNr: number[] }[] = []
  for (const e of xmlEreignisse(mappe)) {
    if (e.typ !== 'auf' || e.name !== 'sheet') continue
    const ziel = ziele.get(e.attr['r:id'] ?? '') ?? ''
    const pfad = ziel.startsWith('/') ? ziel.slice(1) : `xl/${ziel}`
    const zeilenNr: number[] = []
    out.push({ name: e.attr.name ?? `Sheet${out.length + 1}`, zeilen: blattRaster((await lies(pfad)) ?? '', geteilt, zeilenNr), zeilenNr })
  }
  return out
}
