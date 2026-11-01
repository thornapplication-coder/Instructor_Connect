import PptxGenJS from 'pptxgenjs'
import { fussText, LABELS as L, type Datenstand } from './datenstand'
import { AKZENT } from './xlsx'

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

const MASTER = 'DOCCHECK'
const SCHRIFT = 'Arial'
const DUNKEL = '1D2939'
const GRAU = '475467'
const AMPEL_FARBE = { ok: '067647', wait: '9C5700', bad: 'B42318', na: GRAU } as const

export function folien(d: Datenstand): PptxGenJS {
  const p = new PptxGenJS()
  p.layout = 'LAYOUT_WIDE'
  p.author = 'DocCheck'
  p.title = `${L.briefing.title} ${d.exportId}`
  p.defineSlideMaster({
    title: MASTER,
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: AKZENT } } },
      { text: { text: [d.organisation, L.product].filter(Boolean).join(' · '), options: { x: 9.3, y: 0.15, w: 3.8, h: 0.45, align: 'right', fontFace: SCHRIFT, fontSize: 11, color: 'FFFFFF' } } },
      { text: { text: `${fussText(d)} · ${L.disclaimer}`, options: { x: 0.4, y: 7.05, w: 11.6, h: 0.3, fontFace: SCHRIFT, fontSize: 8, color: GRAU } } },
    ],
    slideNumber: { x: 12.4, y: 7.05, w: 0.6, h: 0.3, fontFace: SCHRIFT, fontSize: 8, color: GRAU, align: 'right' },
  })
  const folie = (titel: string) => {
    const s = p.addSlide({ masterName: MASTER })
    s.addText(titel, { x: 0.4, y: 0.12, w: 8.8, h: 0.5, fontFace: SCHRIFT, fontSize: 22, bold: true, color: 'FFFFFF', fit: 'none' })
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
  const h = d.haupt
  const dokument = h ? [h.titel || h.name, h.revision].filter(Boolean).join(' ') : 'Package'
  const nachPrio = (pr: string) => d.befunde.filter((b) => b.prioritaet === pr).length

  // 1 Titel
  const f1 = folie(L.briefing.title)
  f1.addText(dokument, { x: 0.6, y: 2.0, w: 12.1, h: 0.9, fontFace: SCHRIFT, fontSize: 32, bold: true, color: AKZENT, fit: 'none' })
  text(f1, [`${L.ident.reviewDate}: ${d.datum}`, `${L.ident.reviewedBy}: ${[d.pruefer.name, d.pruefer.funktion].filter(Boolean).join(', ')}`, ...(d.organisation ? [`${L.ident.organisation}: ${d.organisation}`] : []), `${L.ident.exportId}: ${d.exportId}`], 3.2, 2.6, 18)

  // 2 Scope & Basis
  const masters = d.dokumente.filter((x) => x.rolle !== 'review')
  text(folie(L.briefing.scope), [
    `${L.ident.document}: ${kuerzen(d.dokumente.filter((x) => x.rolle === 'review').map((x) => [x.titel || x.name, x.revision].filter(Boolean).join(' ')).join('; ') || '—', 160)}`,
    `${L.ident.reviewType}: ${L.reviewType[d.art]}`,
    `${L.ident.checks}: ${L.checks.join(', ')}`,
    `${L.ident.library}: ${d.bibliothek}`,
    `${L.ident.masters}: ${kuerzen(masters.map((x) => [x.titel || x.name, x.revision].filter(Boolean).join(' ')).join('; ') || '—', 160)}`,
    `${L.ident.models}: ${L.noModel}`,
  ])

  // 3 Overall Assessment: große Statusanzeige + Kennzahl-Kacheln
  const f3 = folie(L.briefing.overall)
  const farbe = d.gesamt === 'ready' ? AMPEL_FARBE.ok : d.gesamt === 'afterCorrection' ? AMPEL_FARBE.wait : AMPEL_FARBE.bad
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
  // Excel und Word oben beginnt
  const kategorien = [...L.categories].reverse()
  folie(L.briefing.byCategory).addChart(
    p.ChartType.bar,
    L.priorities.map((pr) => ({ name: pr, labels: kategorien, values: kategorien.map((k) => d.zaehlung[k as keyof Datenstand['zaehlung']][pr as 'High']) })),
    { x: 0.6, y: 1.1, w: 12.1, h: 5.7, barDir: 'bar', barGrouping: 'stacked', chartColors: ['B42318', 'F79009', AKZENT], showLegend: true, legendPos: 'b', catAxisLabelFontFace: SCHRIFT, valAxisLabelFontFace: SCHRIFT, legendFontFace: SCHRIFT },
  )

  // 5 Top 5
  const nachId = new Map(d.befunde.map((b) => [b.id, b]))
  const f5 = folie(L.briefing.top5)
  if (d.top5.length)
    f5.addTable([kopf(['ID', 'Chapter', 'Finding', 'Proposed Correction']), ...d.top5.map((id) => nachId.get(id)!).map((b) => [z(b.id), z(kuerzen(b.spalten[4] || b.spalten[5], 30)), z(kuerzen(b.spalten[16], 140, b.id)), z(kuerzen(b.spalten[17], 140, b.id))])], { ...tabelle, colW: [1.3, 2.0, 4.4, 4.4] })
  else text(f5, [L.summary.noFindings])

  // 6 Formal & Document Control
  const f6 = folie(L.briefing.formal)
  const auffaellig = d.ampeln.filter((a) => a.ampel === 'bad' || a.ampel === 'wait').slice(0, 12)
  if (auffaellig.length)
    f6.addTable([kopf(['Document', 'Checkpoint', 'Status']), ...auffaellig.map((a) => [z(kuerzen(a.dokument, 40)), z(kuerzen(`${a.gruppe} – ${a.punkt}`, 60)), { text: L.ampel[a.ampel], options: { bold: true, color: AMPEL_FARBE[a.ampel] } }])], { ...tabelle, colW: [4.0, 6.1, 2.0] })
  else text(f6, [`${d.ampeln.filter((a) => a.ampel === 'ok').length} × ${L.ampel.ok}, ${d.ampeln.filter((a) => a.ampel === 'na').length} × ${L.ampel.na}`])

  // 7 Next Steps: noch niemandem zugewiesen
  const offen = d.befunde.filter((b) => b.prioritaet !== 'Low').slice(0, 8)
  const f7 = folie(L.briefing.next)
  if (offen.length) f7.addTable([kopf(['ID', 'Finding', 'Responsible', 'Due Date']), ...offen.map((b) => [z(b.id), z(kuerzen(b.spalten[16], 110, b.id)), z(b.spalten[21] || L.briefing.nextEmpty), z(b.spalten[22] || L.briefing.nextEmpty)])], { ...tabelle, colW: [1.3, 6.8, 2.0, 2.0] })
  else text(f7, [L.summary.noFindings])

  // 8 Method & Disclaimer
  text(folie(L.briefing.method), [L.sources.methodText, L.sources.hierarchyText, L.report.limitations, L.disclaimer], 1.1, 5.6, 15)
  return p
}

export async function pptxExport(d: Datenstand): Promise<Uint8Array> {
  return (await folien(d).write({ outputType: 'uint8array' })) as Uint8Array
}
