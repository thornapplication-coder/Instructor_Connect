import {
  AlignmentType,
  BorderStyle,
  Bookmark,
  Document,
  Footer,
  HeadingLevel,
  InternalHyperlink,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
} from 'docx'
import { ampelMatrix, dokumentAngabe, dokumentKurz, fundort, fussText, kennung, LABELS as L, pruefungenText, SPRACHE, type Datenstand } from './datenstand'
import { AKZENT } from './xlsx'

/**
 * Word – vollständiger Prüfbericht (Spez. v1.1 Kap. 10.5), mit docx.js
 * rein programmatisch und deterministisch.
 *
 * Kein Inhaltsverzeichnis-FELD: Word fragte beim Öffnen sonst, ob Felder
 * aktualisiert werden sollen (Kap. 10.1 Nr. 6). Die Inhaltsübersicht sind
 * interne Links auf Textmarken. Seitenzahlen der Fußzeile sind PAGE/NUMPAGES
 * — die rechnet Word ohne Rückfrage.
 */

const FARBE_GESAMT: Record<Datenstand['gesamt'], { text: string; fill: string }> = {
  ready: { text: '067647', fill: 'DCFAE6' },
  afterCorrection: { text: '9C5700', fill: 'FFF4D6' },
  notReady: { text: 'B42318', fill: 'FDECEC' },
  // Nicht bewertbar heißt „wartet" (Texterkennung), nicht „durchgefallen" (DC-03)
  notAssessable: { text: '9C5700', fill: 'FFF4D6' },
}
const FARBE_PRIO: Record<string, { text: string; fill: string }> = {
  High: { text: 'B42318', fill: 'FDECEC' },
  Medium: { text: '9C5700', fill: 'FFF4D6' },
  Low: { text: AKZENT, fill: 'E8EFFA' },
}

/** Ampelfarben wie im Excel (dxf 3–5) */
const FARBE_AMPEL = { ok: FARBE_GESAMT.ready, wait: FARBE_GESAMT.afterCorrection, bad: FARBE_GESAMT.notReady } as const

const linie = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' }
const rahmen = { top: linie, bottom: linie, left: linie, right: linie, insideHorizontal: linie, insideVertical: linie }

const absatz = (text: string, style = 'Body') => new Paragraph({ style, children: [new TextRun(text)] })

type Farbe = { text: string; fill: string }

function zelle(text: string, opts: { kopf?: boolean; breite?: number; farbe?: Farbe; fett?: boolean } = {}): TableCell {
  return new TableCell({
    ...(opts.breite ? { width: { size: opts.breite, type: WidthType.PERCENTAGE } } : {}),
    ...(opts.kopf ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: AKZENT } } : opts.farbe ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: opts.farbe.fill } } : {}),
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: text.split('\n').map((z) => new Paragraph({ style: opts.kopf ? 'TableHeader' : 'TableBody', children: [new TextRun({ text: z, ...(opts.farbe && !opts.kopf ? { color: opts.farbe.text, bold: true } : opts.fett ? { bold: true } : {}) })] })),
  })
}

/** Tabelle mit wiederholter Kopfzeile; Zeilen werden nicht über Seiten getrennt (Kap. 10.5 Nr. 6). */
function tabelle(kopf: string[], zeilen: (string | { text: string; farbe?: Farbe; fett?: boolean })[][], breiten?: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: rahmen,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: kopf.map((k, i) => zelle(k, { kopf: true, breite: breiten?.[i] })) }),
      ...zeilen.map((z) => new TableRow({ cantSplit: true, children: z.map((c, i) => (typeof c === 'string' ? zelle(c, { breite: breiten?.[i] }) : zelle(c.text, { breite: breiten?.[i], farbe: c.farbe, fett: c.fett }))) })),
    ],
  })
}

/**
 * Category × Priority mit Summenzeile und „To verify" — dieselben
 * Kennzahlen wie das Excel-Blatt „Summary". Vorher endete die Tabelle im
 * Bericht ohne Summe, und „To verify" fehlte ganz (Audit 11/2026, EXP-19).
 * Summiert wird `d.zaehlung`, „To verify" ist `d.zuPruefen` — nichts neu
 * gezählt, eine Quelle für beide Formate. Darum steht „To verify" nur in
 * der Summenspalte: Je Priorität rechnet auch Excel es nicht aus.
 */
export function kategorienZeilen(d: Pick<Datenstand, 'zaehlung' | 'zuPruefen'>): string[][] {
  const zeilen = L.categories.map((k) => {
    const z = d.zaehlung[k as keyof Datenstand['zaehlung']]
    return [k, ...L.priorities.map((p) => z[p as 'High']), L.priorities.reduce((n, p) => n + z[p as 'High'], 0)]
  })
  const summe = (i: number) => zeilen.reduce((n, z) => n + (z[i] as number), 0)
  return [
    ...zeilen.map((z) => z.map(String)),
    [L.summary.total, ...L.priorities.map((_, i) => String(summe(i + 1))), String(summe(L.priorities.length + 1))],
    [L.summary.toVerify, ...L.priorities.map(() => ''), String(d.zuPruefen)],
  ]
}

/**
 * Höchstzahl Dokumentspalten je Ampel-Matrix: 7 × 9 % lassen auf A4 hoch
 * „Yellow" und „DOC10" ungebrochen und dem Prüfpunkt gut ein Drittel der
 * Breite. Mehr Dokumente → eine weitere Matrix für die nächsten.
 */
const MATRIX_SPALTEN = 7

/**
 * Ampel der Prüfpunkte als Matrix (Spez. 10.5 Nr. 4): eine Zeile je
 * Prüfpunkt, eine Spalte je Prüfdokument mit dem ID-Präfix als Kopf, darunter
 * die Legende. Vorher eine Zeile je Dokument × Prüfpunkt — bei einem Paket
 * acht Seiten mitten in der Executive Summary (Audit 11/2026, EXP-10).
 */
function ampelTabellen(d: Datenstand): (Table | Paragraph)[] {
  const m = ampelMatrix(d)
  if (!m.zeilen.length) return []
  const tabellen: (Table | Paragraph)[] = [absatz(L.summary.formal, 'Caption')]
  for (let von = 0; von < m.spalten.length; von += MATRIX_SPALTEN) {
    const spalten = m.spalten.slice(von, von + MATRIX_SPALTEN)
    const breite = Math.min(12, Math.floor(63 / spalten.length))
    tabellen.push(
      tabelle(
        [L.report.checkpoint, ...spalten.map((s) => s.kuerzel)],
        m.zeilen.map((z) => [
          `${z.gruppe} – ${z.punkt}`,
          ...z.ampeln.slice(von, von + MATRIX_SPALTEN).map((a) => (a === null ? L.report.notRun : a === 'na' ? L.report.notApplicableShort : { text: L.ampel[a], farbe: FARBE_AMPEL[a] })),
        ]),
        [100 - breite * spalten.length, ...spalten.map(() => breite)],
      ),
    )
  }
  tabellen.push(absatz(`${m.spalten.map((s) => `${s.kuerzel} = ${s.dokument}`).join(' · ')}. ${L.report.matrixLegend}`, 'Caption'))
  return tabellen
}

/** Überschrift mit Textmarke — Ziel der Links in „Contents". */
const ueberschrift = (text: string, anker: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) =>
  new Paragraph({ heading: level, children: [new Bookmark({ id: anker, children: [new TextRun(text)] })] })

/**
 * Fußzeile: `fussText` ist auf `FUSS_MAX` gekürzt, die Export-ID steht
 * also in der ersten Zeile, Seitenzahl und Disclaimer brechen dahinter um.
 * Vorher lief die ungekürzte Angabe über eine Zeile hinaus und Word trennte
 * die ID am Bindestrich („DC-|2026-…", Audit 11/2026, EXP-19). Die ID bleibt
 * mit gewöhnlichen Bindestrichen geschrieben — gesucht wird sie wie im Excel.
 */
function fuss(d: Datenstand): Footer {
  return new Footer({
    children: [
      new Paragraph({
        style: 'Footer',
        children: [new TextRun(`${fussText(d)} · Page `), new TextRun({ children: [PageNumber.CURRENT] }), new TextRun(' of '), new TextRun({ children: [PageNumber.TOTAL_PAGES] }), new TextRun(` · ${L.disclaimer}`)],
      }),
    ],
  })
}

const ABSCHNITTE = [
  ['control', L.report.control],
  ['executive', L.report.executive],
  ['top5', L.summary.top5.replace(/^Top 5 critical findings$/, 'Top 5 Critical Findings')],
  ['findings', L.report.findingsSection],
  ['matrix', L.report.matrix],
  ['sources', L.report.sources],
  ['method', L.report.method],
  ['approval', L.report.approval],
] as const

export function berichtAbschnitte(d: Datenstand): ISectionOptions[] {
  const footers = { default: fuss(d) }
  const nachId = new Map(d.befunde.map((b) => [b.id, b]))
  const g = FARBE_GESAMT[d.gesamt]

  const deckblatt: ISectionOptions = {
    footers,
    children: [
      ...(d.organisation ? [absatz(d.organisation, 'Caption')] : []),
      new Paragraph({ style: 'Title', children: [new TextRun(L.report.title)] }),
      // Hauptdokument und Zahl der weiteren — wie Kennung und Fußzeile (EXP-08)
      absatz(dokumentAngabe(d) || 'Package'),
      absatz(`${L.ident.reviewDate}: ${d.datum}`),
      absatz(`${L.ident.reviewedBy}: ${[d.pruefer.name, d.pruefer.funktion].filter(Boolean).join(', ')}`),
      new Paragraph({ text: '' }),
      tabelle([L.ident.overall], [[{ text: L.overall[d.gesamt], farbe: g }]]),
      new Paragraph({ text: '' }),
      absatz(L.disclaimer, 'Disclaimer'),
    ],
  }

  const top5 = d.top5.map((id) => nachId.get(id)!)
  const hauptteil: ISectionOptions = {
    footers,
    children: [
      ueberschrift(L.report.control, 'control'),
      tabelle(['Field', 'Value'], kennung(d), [30, 70]),
      ueberschrift(L.report.history, 'history', HeadingLevel.HEADING_2),
      // Zeitpunkt mit Uhrzeit und Versatz — zwei Exporte desselben Tages unterscheiden sich sonst nur an der Laufnummer (EXP-19)
      tabelle([L.ident.exportId, 'Timestamp', L.ident.versions], [[d.exportId, d.zeit, `InstructorConnect ${d.appVersion} · Layout ${d.layout}`]], [30, 35, 35]),
      ueberschrift(L.report.contents, 'contents'),
      ...ABSCHNITTE.map(([anker, titel]) => new Paragraph({ style: 'Body', children: [new InternalHyperlink({ anchor: anker, children: [new TextRun({ text: titel, color: AKZENT, underline: {} })] })] })),
      ueberschrift(L.report.executive, 'executive'),
      absatz(`${L.report.scope}: ${pruefungenText(d)}. ${L.ident.library}: ${d.bibliothek}.`),
      absatz(`${L.ident.overall}: ${L.overall[d.gesamt]}. ${L.report.rationale}: ${L.overallBasis}`),
      tabelle(
        ['Category', ...L.priorities, L.summary.total],
        // Total und To verify fett wie im Excel; als Tabellenzeilen bleiben sie bei der Tabelle, auch am Seitenende
        kategorienZeilen(d).map((z, i) => (i >= L.categories.length ? z.map((text) => ({ text, fett: true })) : z)),
        [40, 15, 15, 15, 15],
      ),
      new Paragraph({ text: '' }),
      ...ampelTabellen(d),
      ueberschrift('Top 5 Critical Findings', 'top5'),
      top5.length
        ? tabelle(
            // Köpfe aus labels.en.json wie auf der Folie (TXT-16); Location hier mit Dokument, die Spalte ist breiter
            [L.columns[0], L.report.location, L.columns[16], L.columns[17], L.columns[8]],
            top5.map((b) => [b.id, [b.spalten[1], fundort(b)].filter(Boolean).join(' · '), b.spalten[16], b.spalten[17], b.spalten[8]]),
            // ID und „Reference" brauchen 12 %: bei 10 % brach „DOC3-001" am Bindestrich und der Kopf „Referenc|e" (EXP-19).
            // Die IDs selbst bleiben unverändert (kein geschützter Bindestrich) — sonst fände man sie im Excel nicht wieder
            [12, 18, 30, 28, 12],
          )
        : absatz(L.summary.noFindings),
    ],
  }

  // Befunde nach Kapitel gruppiert, A4 quer
  const gruppen = new Map<string, typeof d.befunde>()
  for (const b of d.befunde) {
    const k = `${b.spalten[1]} — ${b.spalten[4] || L.report.noChapter}`
    gruppen.set(k, [...(gruppen.get(k) ?? []), b])
  }
  const befunde: ISectionOptions = {
    footers,
    properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
    children: [
      ueberschrift(L.report.findingsSection, 'findings'),
      ...(d.befunde.length ? [] : [absatz(L.summary.noFindings)]),
      ...[...gruppen].flatMap(([k, bs]) => [
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(k)] }),
        tabelle(
          L.report.findingsColumns,
          bs.map((b) => [
            b.id,
            // Kapitel, Stelle darin (Tabellenzelle, Textfeld) und Seite — die Gruppe nennt nur das Kapitel (Nachtrag TXT#1)
            [b.spalten[4], b.spalten[6], b.spalten[5]].filter(Boolean).join(' / '),
            b.spalten[7],
            [b.spalten[8], b.spalten[9]].filter(Boolean).join(' '),
            b.spalten[16],
            b.spalten[17],
            { text: b.prioritaet, farbe: FARBE_PRIO[b.prioritaet] },
            b.spalten[23],
            b.spalten[19],
          ]),
          [8, 10, 15, 8, 20, 20, 6, 5, 8],
        ),
      ]),
    ],
  }

  const schluss: ISectionOptions = {
    footers,
    children: [
      ...(d.art === 'revision' ? [ueberschrift('Revision Review', 'revision'), absatz('Revision comparison and HoC draft are part of phase 9 and not included in this report.')] : []),
      ueberschrift(L.report.matrix, 'matrix'),
      absatz(L.matrix.notGenerated),
      ueberschrift(L.report.sources, 'sources'),
      tabelle(
        ['Source', 'Type', 'Title', 'Revision', 'SHA-256'],
        d.dokumente.map((x) => [x.rolle === 'review' ? L.sourceKinds.review : x.rolle === 'master' ? L.sourceKinds.library : L.sourceKinds.session, x.typ, x.titel || x.name, x.revision, x.sha256.slice(0, 12)]),
        [22, 10, 38, 15, 15],
      ),
      ueberschrift(L.report.method, 'method'),
      absatz(L.sources.methodText),
      absatz(L.sources.hierarchyText),
      absatz(L.report.limitations),
      ueberschrift(L.report.approval, 'approval'),
      tabelle(['', ...L.report.approvalFields], [L.report.reviewedBy, L.report.approvedBy].map((r) => [r, '', '', '', '\n\n'])),
      new Paragraph({ text: '' }),
      absatz(L.disclaimer, 'Disclaimer'),
    ],
  }
  return [deckblatt, hauptteil, befunde, schluss]
}

export function bericht(d: Datenstand): Document {
  const lauf = { font: 'Arial' }
  return new Document({
    // Eigenschaften fachlich — „Zuletzt geändert von" stand sonst auf der Vorgabe „Un-named" (Audit 11/2026, EXM-03)
    creator: 'DocCheck',
    lastModifiedBy: 'DocCheck',
    title: `${L.report.title} ${d.exportId}`,
    subject: `${L.product} – ${dokumentKurz(d)}`,
    description: L.disclaimer,
    styles: {
      default: {
        // Sprache in der Dokumentvorgabe (w:lang in rPrDefault): sonst prüft Word bzw. LibreOffice gegen die eigene Bearbeitungssprache, und das PDF trägt sie (EXM-02)
        document: { run: { ...lauf, size: 20, language: { value: SPRACHE } } },
        // Gliederungsebenen: LibreOffice erkennt Überschriften nur daran — ohne sie kein Navigator und keine PDF-Lesezeichen (EXM-07).
        // Mit dem Folgenden zusammen wie Heading3: Seit die Ampel-Matrix die Executive Summary füllt, stand
        // „Top 5 Critical Findings" allein am Seitenende und die Tabelle auf der nächsten Seite (Gegenprüfung P7)
        heading1: { run: { ...lauf, size: 28, bold: true, color: AKZENT }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true, outlineLevel: 0 } },
        heading2: { run: { ...lauf, size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, outlineLevel: 1 } },
        heading3: { run: { ...lauf, size: 21, bold: true }, paragraph: { spacing: { before: 200, after: 60 }, keepNext: true, outlineLevel: 2 } },
      },
      paragraphStyles: [
        { id: 'Title', name: 'Title', run: { ...lauf, size: 48, bold: true, color: AKZENT }, paragraph: { spacing: { before: 2400, after: 240 } } },
        { id: 'Body', name: 'Body', run: { ...lauf, size: 20 }, paragraph: { spacing: { after: 100 } } },
        { id: 'TableHeader', name: 'Table Header', run: { ...lauf, size: 17, bold: true, color: 'FFFFFF' } },
        { id: 'TableBody', name: 'Table Body', run: { ...lauf, size: 17 } },
        { id: 'Caption', name: 'Caption', run: { ...lauf, size: 18, color: '475467' } },
        { id: 'Disclaimer', name: 'Disclaimer', run: { ...lauf, size: 18, italics: true, color: '475467' }, paragraph: { alignment: AlignmentType.LEFT } },
        { id: 'Footer', name: 'Footer', run: { ...lauf, size: 14, color: '475467' } },
      ],
    },
    sections: berichtAbschnitte(d),
  })
}

export async function docxExport(d: Datenstand): Promise<Uint8Array> {
  return new Uint8Array(await (await Packer.toBlob(bericht(d))).arrayBuffer())
}
