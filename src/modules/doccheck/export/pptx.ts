import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import { dokumentKurz, fundort, fussText, LABELS as L, pruefungenText, SPRACHE, type AmpelZeile, type Datenstand, type ExportBefund } from './datenstand'
import { AKZENT, esc } from './xlsx'

/**
 * PowerPoint-Kurzbriefing (Spez. v1.1 Kap. 10.7): acht Folien 16:9 auf
 * einem Folienmaster; Diagramm nativ und editierbar.
 *
 * Textgrenzen je Platzhalter: Längeres wird mit „…" gekürzt und verweist
 * auf die Befund-ID — die Schrift wird nie automatisch verkleinert, sonst
 * stünde auf Folie 5 einmal 18 pt und einmal 9 pt.
 */

/** Auf `max` Zeichen kürzen; wenn gekürzt, mit Verweis auf die ID. */
export function kuerzen(text: string, max: number, id?: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const hinweis = id ? ` (${L.briefing.seeId} ${id})` : ''
  return `${t.slice(0, Math.max(1, max - 1 - hinweis.length)).trimEnd()}…${hinweis}`
}

/** Höchstlänge der Dokumentangabe auf Folie 1 — zwei Zeilen à 32 pt fett auf 12,1 in (Kap. 10.7). */
export const TITEL_MAX = 90
/** So viel bleibt vom Titel mindestens, auch neben einer langen Revisionsangabe. */
const TITEL_MIN = 20

/**
 * Dokumentangabe der Titelfolie: gekürzt wird der TITEL, mit „…";
 * Revision und Zahl der weiteren Dokumente bleiben ganz — an ihnen erkennt
 * man den Stand. Vorher stand der Titel ungekürzt in einem Feld für eine
 * Zeile und lief in die Aufzählung darunter (Audit 11/2026, EXP-14). Die
 * Schrift bleibt, wie sie ist (Kap. 10.7: nie automatisch verkleinert).
 */
export function titelFolie(d: Pick<Datenstand, 'haupt' | 'dokumente'>, max = TITEL_MAX): string {
  if (!d.haupt) return dokumentKurz(d)
  // Ohne Titel bleibt nur der Rest: „Rev 0.1 + 2 further documents"
  const zusatz = dokumentKurz(d, '')
  return dokumentKurz(d, kuerzen(d.haupt.titel || d.haupt.name, Math.max(TITEL_MIN, max - (zusatz ? zusatz.length + 1 : 0))))
}

/**
 * Höchstlänge der Organisation in der Kopfleiste des Masters: eine Zeile
 * neben „DocCheck Review". Die Organisation ist ein freies Feld der
 * Einstellungen; ungekürzt brach sie in der 0,45 in hohen Kopfleiste
 * dreizeilig über den Rand — dieselbe Ursache wie die Fußzeile (Audit
 * 11/2026, EXP-04, Nachtrag EXPDC#6). Kap. 10.7: Textgrenzen je Platzhalter.
 */
export const KOPF_ORGANISATION_MAX = 40

/** Kopfleiste des Masters: Organisation (gekürzt) · Produkt. */
export function kopfText(d: Pick<Datenstand, 'organisation'>): string {
  return [kuerzen(d.organisation, KOPF_ORGANISATION_MAX), L.product].filter(Boolean).join(' · ')
}

const RANG = { High: 0, Medium: 1, Low: 2 } as const

/**
 * Offene Maßnahmen für „Next Steps" (Folie 7): ohne Low, High zuerst —
 * stabil sortiert, innerhalb einer Priorität also in Export-Reihenfolge.
 * Vorher die ersten acht in Export-Reihenfolge (Dokument → Seite): Ein
 * High im dritten Dokument fiel still weg, Mediums davor standen da
 * (Audit 11/2026, EXP-05). `rest` zählt, was nicht auf die Folie passt.
 */
export function naechsteSchritte(d: Pick<Datenstand, 'befunde'>, max = 8): { zeilen: ExportBefund[]; rest: number } {
  const offen = d.befunde.filter((b) => b.prioritaet !== 'Low').sort((a, b) => RANG[a.prioritaet] - RANG[b.prioritaet])
  return { zeilen: offen.slice(0, max), rest: Math.max(0, offen.length - max) }
}

/**
 * Auffällige Ampeln für Folie 6: Rot vor Gelb, innerhalb einer Farbe reihum
 * über die Dokumente. Vorher die ersten zwölf in Dokumentreihenfolge — alle
 * aus dem ersten Dokument, die roten Punkte der übrigen fehlten (EXP-05).
 */
export function auffaelligeAmpeln(d: Pick<Datenstand, 'ampeln'>, max = 12): { zeilen: AmpelZeile[]; rest: number } {
  const reihum = (farbe: AmpelZeile['ampel']) => {
    const jeDokument = new Map<string, AmpelZeile[]>()
    for (const a of d.ampeln) if (a.ampel === farbe) jeDokument.set(a.dokument, [...(jeDokument.get(a.dokument) ?? []), a])
    const listen = [...jeDokument.values()]
    const out: AmpelZeile[] = []
    const lang = Math.max(0, ...listen.map((l) => l.length))
    for (let i = 0; i < lang; i++) for (const l of listen) if (l[i]) out.push(l[i])
    return out
  }
  const alle = [...reihum('bad'), ...reihum('wait')]
  return { zeilen: alle.slice(0, max), rest: Math.max(0, alle.length - max) }
}

/**
 * Wertachse des Diagramms auf Folie 4. Sie zählt Befunde, beginnt also bei 0
 * und kennt nur ganze Zahlen. Ohne Vorgabe teilten PowerPoint und
 * LibreOffice kleine Zähler in Zehntel (0, 0.1 … 1) (Audit 11/2026, EXP-21).
 * Bis 10 Befunde je Kategorie in Einerschritten; darüber wählt das
 * Programm die Schritte, das Format „0" lässt keine Nachkommastelle zu.
 * Gezählt wird der ganze Balken — die Prioritäten stehen gestapelt.
 */
export function wertachse(d: Pick<Datenstand, 'zaehlung'>): { valAxisMinVal: number; valAxisLabelFormatCode: string; valAxisMajorUnit?: number } {
  const hoechstens = Math.max(0, ...Object.values(d.zaehlung).map((z) => Object.values(z).reduce((n, x) => n + x, 0)))
  return { valAxisMinVal: 0, valAxisLabelFormatCode: '0', ...(hoechstens <= 10 ? { valAxisMajorUnit: 1 } : {}) }
}

/**
 * Folie 6, wenn keine Ampel rot oder gelb ist: was grün bzw. nicht
 * anwendbar war, ohne „0 ×"-Teile. Lief gar kein Prüfpunkt, sagt sie das —
 * vorher stand dort „0 × Green, 0 × Not applicable" (EXP-21).
 */
export function ampelOhneAuffaelliges(d: Pick<Datenstand, 'ampeln'>): string {
  if (!d.ampeln.length) return L.briefing.noChecks
  return (['ok', 'na'] as const)
    .map((a) => ({ n: d.ampeln.filter((x) => x.ampel === a).length, text: L.ampel[a] }))
    .filter((x) => x.n)
    .map((x) => `${x.n} × ${x.text}`)
    .join(', ')
}

/** Letzte Tabellenzeile bei Überlauf: was fehlt und wo es steht — nie still abgeschnitten (Kap. 10.7). */
const restText = (rest: number, d: Pick<Datenstand, 'exportId'>) => L.briefing.more.replace('{n}', String(rest)).replace('{id}', d.exportId)

const MASTER = 'DOCCHECK'
/** Name des Titelplatzhalters im Master */
const TITEL = 'titel'
const SCHRIFT = 'Arial'
const DUNKEL = '1D2939'
const GRAU = '475467'
const AMPEL_FARBE = { ok: '067647', wait: '9C5700', bad: 'B42318', na: GRAU } as const

/**
 * Die acht Folien und ihre Titel (für `nacharbeiten`). Folientitel stehen im
 * Titelplatzhalter des Masters (Kap. 10.7: feste Platzhalter) — als freies
 * Textfeld hießen die Folien in Gliederung, Barrierefreiheitsprüfung und
 * PDF-Lesezeichen nur „Slide 1…8" (Audit 11/2026, EXM-08).
 */
export function folien(d: Datenstand): { praesentation: PptxGenJS; titel: string[] } {
  const p = new PptxGenJS()
  p.layout = 'LAYOUT_WIDE'
  // Eigenschaften fachlich statt der Vorgaben „PptxGenJS Presentation" und Firma „PptxGenJS" (Audit 11/2026, EXM-03).
  // Die Firma maskiert pptxgenjs nicht selbst — „GmbH & Co KG" machte app.xml ungültig
  p.author = 'DocCheck'
  p.title = `${L.briefing.title} ${d.exportId}`
  p.subject = `${L.product} – ${dokumentKurz(d)}`
  p.company = esc(d.organisation)
  p.defineSlideMaster({
    title: MASTER,
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: AKZENT } } },
      // Links bündig wie bisher — der Titelstil des Masters von pptxgenjs zentriert
      // Längster Folientitel („Findings by Category and Priority", 22 pt fett) braucht gut 6 in — daneben 4,8 in für die Kopfleiste
      { placeholder: { options: { name: TITEL, type: 'title', x: 0.4, y: 0.12, w: 7.8, h: 0.5, fontFace: SCHRIFT, fontSize: 22, bold: true, color: 'FFFFFF', align: 'left', valign: 'middle' }, text: '' } },
      { text: { text: kopfText(d), options: { x: 8.3, y: 0.1, w: 4.8, h: 0.55, align: 'right', valign: 'middle', fontFace: SCHRIFT, fontSize: 11, color: 'FFFFFF' } } },
      // Fußzeile gekürzt wie in Excel und Word (fussText, EXP-04) — bei langem Titel brach sie sonst zweizeilig bis an den Folienrand (Nachtrag EXPDC#6)
      { text: { text: `${fussText(d)} · ${L.disclaimer}`, options: { x: 0.4, y: 7.05, w: 11.6, h: 0.3, fontFace: SCHRIFT, fontSize: 8, color: GRAU } } },
    ],
    slideNumber: { x: 12.4, y: 7.05, w: 0.6, h: 0.3, fontFace: SCHRIFT, fontSize: 8, color: GRAU, align: 'right' },
  })
  const titel: string[] = []
  const folie = (t: string) => {
    const s = p.addSlide({ masterName: MASTER })
    // Lage und Schrift kommen aus dem Platzhalter; 22 pt fest, nie automatisch verkleinert
    s.addText(t, { placeholder: TITEL, fit: 'none' })
    titel.push(t)
    return s
  }
  const text = (s: PptxGenJS.Slide, zeilen: string[], y = 1.1, h = 5.6, groesse = 16) =>
    s.addText(
      zeilen.map((z) => ({ text: z, options: { bullet: true, breakLine: true } })),
      { x: 0.6, y, w: 12.1, h, fontFace: SCHRIFT, fontSize: groesse, color: DUNKEL, valign: 'top', fit: 'none' },
    )
  const z = (t: string) => ({ text: t })
  const kopf = (zellen: string[]) => zellen.map((z) => ({ text: z, options: { bold: true, color: 'FFFFFF', fill: { color: AKZENT } } }))
  const tabelle = { x: 0.6, y: 1.1, w: 12.1, fontFace: SCHRIFT, fontSize: 11, color: DUNKEL, border: { type: 'solid' as const, pt: 0.5, color: 'D0D5DD' }, valign: 'top' as const }
  // Dieselbe Angabe wie Fußzeile und Kennung: Hauptdokument, Revision, weitere Dokumente (EXP-08) — der Titel gekürzt (EXP-14)
  const dokument = titelFolie(d)
  const nachPrio = (pr: string) => d.befunde.filter((b) => b.prioritaet === pr).length

  // 1 Titel
  const f1 = folie(L.briefing.title)
  // Feld für zwei Zeilen à 32 pt (TITEL_MAX) — vorher 0,9 in für eine Zeile, die Aufzählung schloss direkt an
  f1.addText(dokument, { x: 0.6, y: 2.0, w: 12.1, h: 1.25, fontFace: SCHRIFT, fontSize: 32, bold: true, color: AKZENT, valign: 'top', fit: 'none' })
  text(f1, [`${L.ident.reviewDate}: ${d.datum}`, `${L.ident.reviewedBy}: ${[d.pruefer.name, d.pruefer.funktion].filter(Boolean).join(', ')}`, ...(d.organisation ? [`${L.ident.organisation}: ${d.organisation}`] : []), `${L.ident.exportId}: ${d.exportId}`], 3.35, 2.6, 18)

  // 2 Scope & Basis
  const masters = d.dokumente.filter((x) => x.rolle !== 'review')
  text(folie(L.briefing.scope), [
    `${L.ident.document}: ${kuerzen(d.dokumente.filter((x) => x.rolle === 'review').map((x) => [x.titel || x.name, x.revision].filter(Boolean).join(' ')).join('; ') || '—', 160)}`,
    `${L.ident.reviewType}: ${L.reviewType[d.art]}`,
    // Was wirklich lief — nicht die feste Liste aller Prüfungen (EXP-01/DC-12)
    `${L.ident.checks}: ${pruefungenText(d)}`,
    `${L.ident.library}: ${d.bibliothek}`,
    `${L.ident.masters}: ${kuerzen(masters.map((x) => [x.titel || x.name, x.revision].filter(Boolean).join(' ')).join('; ') || '—', 160)}`,
    `${L.ident.models}: ${L.noModel}`,
  ])

  // 3 Overall Assessment: große Statusanzeige + Kennzahl-Kacheln
  const f3 = folie(L.briefing.overall)
  const farbe = d.gesamt === 'ready' ? AMPEL_FARBE.ok : d.gesamt === 'afterCorrection' || d.gesamt === 'notAssessable' ? AMPEL_FARBE.wait : AMPEL_FARBE.bad
  f3.addText(L.overall[d.gesamt], { x: 0.6, y: 1.2, w: 12.1, h: 1.2, fontFace: SCHRIFT, fontSize: 30, bold: true, color: farbe, align: 'center', fill: { color: 'F2F4F7' }, fit: 'none' })
  const werte = [d.befunde.length, nachPrio('High'), nachPrio('Medium'), nachPrio('Low'), d.zuPruefen]
  L.briefing.tiles.forEach((titel, i) => {
    f3.addText(
      [
        { text: String(werte[i]), options: { fontSize: 36, bold: true, breakLine: true } },
        { text: titel, options: { fontSize: 14 } },
      ],
      { x: 0.6 + i * 2.48, y: 3.0, w: 2.3, h: 1.8, fontFace: SCHRIFT, color: DUNKEL, align: 'center', valign: 'middle', fill: { color: 'F2F4F7' }, fit: 'none' },
    )
  })
  f3.addText(kuerzen(L.overallBasis, 220), { x: 0.6, y: 5.2, w: 12.1, h: 1.0, fontFace: SCHRIFT, fontSize: 12, color: GRAU, fit: 'none' })

  // 4 Diagramm nativ: Category × Priority. Liegende Balken zeichnet PowerPoint
  // von unten nach oben — umgekehrt übergeben, damit die Reihenfolge wie in
  // Excel und Word oben beginnt. Ohne Befunde kein leeres Diagramm, sondern
  // derselbe Hinweis wie auf Folie 5 und 7 (EXP-21)
  const kategorien = [...L.categories].reverse()
  const f4 = folie(L.briefing.byCategory)
  if (d.befunde.length)
    f4.addChart(
      p.ChartType.bar,
      L.priorities.map((pr) => ({ name: pr, labels: kategorien, values: kategorien.map((k) => d.zaehlung[k as keyof Datenstand['zaehlung']][pr as 'High']) })),
      { x: 0.6, y: 1.1, w: 12.1, h: 5.7, barDir: 'bar', barGrouping: 'stacked', chartColors: ['B42318', 'F79009', AKZENT], showLegend: true, legendPos: 'b', catAxisLabelFontFace: SCHRIFT, valAxisLabelFontFace: SCHRIFT, legendFontFace: SCHRIFT, ...wertachse(d) },
    )
  else text(f4, [L.summary.noFindings])

  // 5 Top 5
  const nachId = new Map(d.befunde.map((b) => [b.id, b]))
  const f5 = folie(L.briefing.top5)
  if (d.top5.length)
    // „Location" wie im Word-Bericht, Kapitel UND Seite — vorher hieß die Spalte „Chapter" und zeigte meist die Seite (TXT-16).
    // Das Dokument steckt im ID-Präfix; 45 Zeichen sind zwei Zeilen der 2-in-Spalte
    f5.addTable([kopf([L.columns[0], L.report.location, L.columns[16], L.columns[17]]), ...d.top5.map((id) => nachId.get(id)!).map((b) => [z(b.id), z(kuerzen(fundort(b), 45)), z(kuerzen(b.spalten[16], 140, b.id)), z(kuerzen(b.spalten[17], 140, b.id))])], { ...tabelle, colW: [1.3, 2.0, 4.4, 4.4] })
  else text(f5, [L.summary.noFindings])

  const restZeile = (rest: number, spalten: number) => (rest ? [[{ text: restText(rest, d), options: { colspan: spalten, italic: true, color: GRAU } }]] : [])

  // 6 Formal & Document Control: Rot vor Gelb, reihum über die Dokumente, Rest gezählt (EXP-05)
  const f6 = folie(L.briefing.formal)
  const auffaellig = auffaelligeAmpeln(d)
  if (auffaellig.zeilen.length)
    f6.addTable([kopf([L.columns[1], L.report.checkpoint, L.columns[23]]), ...auffaellig.zeilen.map((a) => [z(kuerzen(a.dokument, 40)), z(kuerzen(`${a.gruppe} – ${a.punkt}`, 60)), { text: L.ampel[a.ampel], options: { bold: true, color: AMPEL_FARBE[a.ampel] } }]), ...restZeile(auffaellig.rest, 3)], { ...tabelle, colW: [4.0, 6.1, 2.0] })
  else text(f6, [ampelOhneAuffaelliges(d)])

  // 7 Next Steps: noch niemandem zugewiesen; High zuerst, Rest gezählt (EXP-05)
  const offen = naechsteSchritte(d)
  const f7 = folie(L.briefing.next)
  if (offen.zeilen.length) f7.addTable([kopf([L.columns[0], L.columns[16], L.columns[21], L.columns[22]]), ...offen.zeilen.map((b) => [z(b.id), z(kuerzen(b.spalten[16], 110, b.id)), z(b.spalten[21] || L.briefing.nextEmpty), z(b.spalten[22] || L.briefing.nextEmpty)]), ...restZeile(offen.rest, 4)], { ...tabelle, colW: [1.3, 6.8, 2.0, 2.0] })
  else text(f7, [L.summary.noFindings])

  // 8 Method & Disclaimer
  text(folie(L.briefing.method), [L.sources.methodText, L.sources.hierarchyText, L.report.limitations, L.disclaimer], 1.1, 5.6, 15)
  return { praesentation: p, titel }
}

/** Anwendung in den Dateieigenschaften — wie im Excel-Export */
const ANWENDUNG = 'DocCheck'

/**
 * Nacharbeit an der fertigen Datei: Was pptxgenjs fest hineinschreibt und
 * sich nicht einstellen lässt, wird als Zeichenkette ersetzt — wie beim
 * Rückschreiben, nichts wird neu serialisiert.
 * - Sprache: „en-US" auch dort, wo keine Option hinreicht (Foliennummer,
 *   Tabellenabsätze, Diagramm, Master-Vorgabe, Notizen). Ein `lang` je
 *   Textfeld hätte diese Stellen gelassen und jedem Lauf zusätzlich
 *   `altLang="en-US"` angehängt (EXM-02).
 * - app.xml: „Slide 1…8" als Folientitel → die echten Titel; Anwendung
 *   „Microsoft Office PowerPoint" → DocCheck (EXM-03/EXM-08).
 * - Diagramm-Mappe (eingebettetes Excel): Autor „PptxGenJS", Anwendung
 *   „Microsoft Macintosh Excel" → DocCheck (EXM-03).
 */
export async function nacharbeiten(datei: Uint8Array, titel: string[]): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(datei)
  const ersetzen = async (z: JSZip, pfad: string, f: (xml: string) => string) => z.file(pfad, f(await z.file(pfad)!.async('string')))
  const eigenschaften = (xml: string) =>
    xml
      .replace(/<Application>[^<]*<\/Application>/, `<Application>${ANWENDUNG}</Application>`)
      .replace(/<(dc:creator|cp:lastModifiedBy)>PptxGenJS<\/\1>/g, `<$1>${ANWENDUNG}</$1>`)

  for (const pfad of Object.keys(zip.files)) {
    if (/^ppt\/.*\.xml$/.test(pfad)) await ersetzen(zip, pfad, (xml) => xml.replace(/(\s)lang="en-US"/g, `$1lang="${SPRACHE}"`))
    if (/^ppt\/embeddings\/[^/]+\.xlsx$/.test(pfad)) {
      const mappe = await JSZip.loadAsync(await zip.file(pfad)!.async('uint8array'))
      for (const teil of ['docProps/core.xml', 'docProps/app.xml']) await ersetzen(mappe, teil, eigenschaften)
      zip.file(pfad, await mappe.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))
    }
  }
  // Eine Folie ohne bekannten Titel behält „Slide n" — lieber die Vorgabe als ein leerer Eintrag
  await ersetzen(zip, 'docProps/app.xml', (xml) =>
    eigenschaften(xml).replace(/<vt:lpstr>Slide (\d+)<\/vt:lpstr>/g, (alt, n: string) => {
      const t = titel[Number(n) - 1]
      return t === undefined ? alt : `<vt:lpstr>${esc(t)}</vt:lpstr>`
    }),
  )
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function pptxExport(d: Datenstand): Promise<Uint8Array> {
  const { praesentation, titel } = folien(d)
  return nacharbeiten((await praesentation.write({ outputType: 'uint8array' })) as Uint8Array, titel)
}
