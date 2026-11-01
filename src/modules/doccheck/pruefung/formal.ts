import { datumFinden, revisionFinden } from '../parse/meta'
import { vergleichsform } from '../parse/seitenzuordnung'
import { ampelAus, type Befund, type Fundstelle, type Prioritaet } from './befund'
import { absaetze, befund, fundstelle, kurz, seitenName, verwendeteAbkuerzungen, type PruefKontext } from './kontext'

/**
 * Formalprüfung (Spez. v1.1 Kap. 8.8) — lokal, ohne KI, sofort nach dem
 * Einlesen. Referenz ist das Verfahren zur Dokumentenlenkung der ATO; hier
 * stehen deshalb KEINE erfundenen Regelzitate, nur der Befund und die
 * Fundstelle.
 */

export const FORMAL_PUNKTE = ['revisionsstand', 'lep', 'seiten', 'revisionen', 'inhalt', 'nummerierung', 'querverweise', 'abkuerzungen', 'reste'] as const

type Ergebnis = Omit<Befund, 'id'>

/** Seiten, auf denen ein Abschnitt BEGINNT (Überschrift, kein Verzeichniseintrag). */
export function abschnittSeiten(pages: { text: string }[], synonyme: string[]): number[] {
  const out: number[] = []
  pages.forEach((p, i) => {
    const treffer = p.text.split('\n').some((z) => {
      const t = z.trim().toLowerCase().replace(/^\d+(\.\d+)*\.?\s+/, '')
      // Ein Verzeichniseintrag endet mit einer Seitenzahl.
      return synonyme.some((s) => t === s || (t.startsWith(`${s} `) && !/\d\s*$/.test(t)) || t === `${s}:`)
    })
    if (treffer) out.push(i)
  })
  return out
}

/** Letzte Zahl einer Revisionsangabe („Edition 2 Rev 1.0" → 1, „Revision 3" → 3). */
export function revNummer(rev?: string): number | undefined {
  const m = rev?.match(/\bRev(?:ision)?\.?\s*(\d+(?:\.\d+)?)/i) ?? rev?.match(/(\d+(?:\.\d+)?)\s*$/)
  return m ? Number(m[1]) : undefined
}

/** Lücken und Doppelungen in hierarchischen Nummern („1", „1.1", „1.3"). */
export function nummernPruefen(nummern: string[]): { luecken: string[]; doppelt: string[] } {
  const gesehen = new Set<string>()
  const doppelt: string[] = []
  const letzte = new Map<string, number>()
  const luecken: string[] = []
  for (const n of nummern) {
    if (gesehen.has(n)) doppelt.push(n)
    gesehen.add(n)
    const teile = n.split(/[.-]/)
    const eltern = teile.slice(0, -1).join('.')
    const x = Number(teile[teile.length - 1])
    const vorher = letzte.get(eltern)
    const erwartet = vorher === undefined ? 1 : vorher + 1
    if (x > erwartet) luecken.push(`${eltern ? `${eltern}.` : ''}${erwartet}${x - 1 > erwartet ? `–${eltern ? `${eltern}.` : ''}${x - 1}` : ''}`)
    if (vorher === undefined || x > vorher) letzte.set(eltern, x)
  }
  return { luecken, doppelt }
}

export function formalPruefung(k: PruefKontext): { befunde: Ergebnis[]; ampel: Record<string, 'ok' | 'wait' | 'bad' | 'na'> } {
  const { roh, regeln } = k
  const pages = roh.pages
  const out: Ergebnis[] = []
  const na: string[] = []
  const neu = (pruefpunkt: string, kategorie: Befund['kategorie'], prioritaet: Prioritaet, text: string, fundstellen: Fundstelle[], anleitung?: string) =>
    out.push(befund(k, { quelle: 'formal', pruefpunkt, kategorie, prioritaet, text, fundstellen, ...(anleitung ? { anleitung } : {}) }))
  const alle = absaetze(roh)
  const istPdf = roh.format === 'pdf'

  /* 1 Revisionsstand — Kopf-/Fußzeilen aller Seiten identisch, passend zum Deckblatt */
  if (istPdf && pages.some((p) => p.rand?.length)) {
    const werte = pages.map((p) => {
      const t = (p.rand ?? []).join(' | ')
      return { p, rev: revisionFinden(t), datum: datumFinden(t) }
    })
    const mehrheit = (f: 'rev' | 'datum') => {
      const z = new Map<string, number>()
      for (const w of werte) if (w[f]) z.set(w[f]!, (z.get(w[f]!) ?? 0) + 1)
      return [...z].sort((a, b) => b[1] - a[1])[0]?.[0]
    }
    const rev = mehrheit('rev')
    const datum = mehrheit('datum')
    const abweichend = werte.filter((w) => (rev && w.rev && w.rev !== rev) || (datum && w.datum && w.datum !== datum))
    const fs: Fundstelle[] = abweichend.map((w) => ({ seite: seitenName(w.p), auszug: `${w.rev ?? '—'} / ${w.datum ?? '—'} (majority: ${rev ?? '—'} / ${datum ?? '—'})` }))
    if (rev && k.meta.revision && revNummer(rev) !== revNummer(k.meta.revision)) fs.unshift({ seite: seitenName(pages[0]), ort: 'Cover', auszug: `Cover: ${k.meta.revision}, headers/footers: ${rev}` })
    if (fs.length) neu('revisionsstand', 'Document Control', 'Medium', `Revision/date in headers and footers is not identical on all pages or does not match the cover (${fs.length} deviation(s)).`, fs, 'revisionsstand')
  } else na.push('revisionsstand')

  /* 2 List of Effective Pages — gegen die tatsächlichen Seiten */
  const lep = abschnittSeiten(pages, regeln.abschnitte.lep)
  const labels = pages.map((p) => p.label).filter((l): l is string => !!l)
  if (istPdf && lep.length && labels.length >= 3) {
    const lepText = vergleichsform(lep.map((i) => pages[i].text).join(' '))
    const fehlend = pages.filter((p) => p.label && !lepText.includes(vergleichsform(p.label)))
    const vorhanden = new Set(labels.map(vergleichsform))
    // Nur innerhalb einer Zeile: „Pages⏎Page 1" ist keine Seitenangabe.
    const ueber = [...new Set(lep.flatMap((i) => pages[i].text.match(/(?:\b[\w.-]+[ \t]+)?\bPage[ \t]*\d+\b/gi) ?? []))].filter((x) => !vorhanden.has(vergleichsform(x)))
    const fs = [...fehlend.map((p) => ({ seite: seitenName(pages[lep[0]]), auszug: `Missing in LEP: ${p.label}` })), ...ueber.map((x) => ({ seite: seitenName(pages[lep[0]]), auszug: `Listed in LEP but not in document: ${x}` }))]
    if (fs.length) neu('lep', 'Document Control', 'Medium', `List of Effective Pages does not match the actual pages (${fehlend.length} missing, ${ueber.length} surplus).`, fs, 'lep')
  } else na.push('lep')

  /* 3 Seitennummerierung — Lücken, Doppelungen, „Page x of y" */
  if (labels.length >= 3 && !roh.word) {
    const fs: Fundstelle[] = []
    const vonGesamt = pages.map((p) => p.label?.match(/(\d+)\s*(?:of|von|\/|\|)\s*(\d+)\s*$/i)).filter(Boolean) as RegExpMatchArray[]
    if (vonGesamt.length >= 3) {
      const gesamt = new Set(vonGesamt.map((m) => Number(m[2])))
      if (gesamt.size > 1) fs.push({ auszug: `Different totals in "x of y": ${[...gesamt].join(', ')}` })
    }
    const gruppen = new Map<string, { n: number; p: (typeof pages)[number] }[]>()
    for (const p of pages) {
      const m = p.label?.match(/^(.*?)(\d+)(?:\s*(?:of|von|\/|\|)\s*\d+)?\s*$/i)
      if (!m) continue
      gruppen.set(m[1], [...(gruppen.get(m[1]) ?? []), { n: Number(m[2]), p }])
    }
    for (const [prefix, liste] of gruppen) {
      for (let i = 1; i < liste.length; i++) {
        const a = liste[i - 1].n
        const b = liste[i].n
        if (b === a) fs.push({ seite: seitenName(liste[i].p), auszug: `Duplicate page number: ${prefix}${b}` })
        else if (b > a + 1) fs.push({ seite: seitenName(liste[i].p), auszug: `Gap: ${prefix}${a + 1}${b - 1 > a + 1 ? `–${b - 1}` : ''} missing` })
      }
    }
    if (fs.length) neu('seiten', 'Document Control', 'Medium', `Page numbering has gaps, duplicates or inconsistent totals (${fs.length}).`, fs, 'seiten')
  } else na.push('seiten')

  /* 4 Revisionsverzeichnis / Highlights of Change */
  const revVz = abschnittSeiten(pages, regeln.abschnitte.revisionen)
  const docRev = revNummer(k.meta.revision)
  if (revVz.length && docRev !== undefined) {
    const eintraege = revVz.flatMap((i) => pages[i].text.split('\n')).map((z) => z.match(/^\s*(?:Rev(?:ision)?\.?\s*)?(\d+(?:\.\d+)?)\s*[|\s]+.*?(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+\p{L}+\s+\d{4})/iu)).filter(Boolean) as RegExpMatchArray[]
    const letzte = eintraege.length ? Math.max(...eintraege.map((m) => Number(m[1]))) : undefined
    if (letzte !== undefined && letzte !== docRev) neu('revisionen', 'Document Control', 'Medium', `Last entry in the record of revisions (${letzte}) does not match the document revision (${k.meta.revision}).`, [{ seite: seitenName(pages[revVz[0]]), auszug: kurz(eintraege[eintraege.length - 1][0]) }], 'revisionen')
  }
  if (docRev !== undefined && docRev > 0 && !abschnittSeiten(pages, regeln.abschnitte.hoc).length) {
    neu('revisionen', 'Document Control', 'Medium', `Document is at revision ${k.meta.revision} but contains no highlights of change.`, [{ seite: seitenName(pages[0]), auszug: k.meta.revision ?? '' }], 'revisionen')
  }
  if (!revVz.length && (docRev === undefined || docRev === 0)) na.push('revisionen')

  /* 5 Inhaltsverzeichnis — Einträge gegen die Überschriften */
  const ueberschriften = roh.outline.map((o) => o.titel)
  const formU = new Set(ueberschriften.map(vergleichsform))
  if (roh.word?.toc.length) {
    const tocFormen = roh.word.toc.map((t) => vergleichsform(t.titel))
    const maxEbene = Math.max(...roh.word.toc.map((t) => t.ebene))
    const fs: Fundstelle[] = [
      ...roh.word.toc.filter((t) => !formU.has(vergleichsform(t.titel))).map((t) => ({ ort: 'Table of contents', auszug: `Entry without matching heading: ${t.titel}` })),
      ...roh.outline.filter((o) => o.ebene <= maxEbene && !tocFormen.includes(vergleichsform(o.titel))).map((o) => ({ ort: 'Headings', auszug: `Heading missing in table of contents: ${o.titel}` })),
    ]
    if (fs.length) neu('inhalt', 'Inconsistency', 'Low', `Table of contents does not match the headings (${fs.length}). DOCX: compared by title only.`, fs, 'inhalt')
  } else {
    const tocSeiten = abschnittSeiten(pages, regeln.abschnitte.inhalt)
    const eintraege = tocSeiten.flatMap((i) => pages[i].text.split('\n').map((z) => z.match(/^(\d+(?:\.\d+)*)\.?\s+(.+?)[\s.…]+(\d{1,4})\s*$/)).filter(Boolean)) as RegExpMatchArray[]
    if (eintraege.length >= 2 && ueberschriften.length) {
      const nurZahlen = pages.every((p) => !p.label || /^\d+$/.test(p.label))
      const fs: Fundstelle[] = []
      for (const m of eintraege) {
        const titel = `${m[1]} ${m[2].trim()}`
        const o = roh.outline.find((x) => vergleichsform(x.titel) === vergleichsform(titel))
        if (!o) fs.push({ seite: seitenName(pages[tocSeiten[0]]), auszug: `Entry without matching heading: ${titel}` })
        else if (nurZahlen && Number(m[3]) !== o.vonSeite && Number(m[3]) !== Number(pages[o.vonSeite - 1]?.label)) fs.push({ seite: seitenName(pages[tocSeiten[0]]), auszug: `${titel}: listed on page ${m[3]}, found on page ${seitenName(pages[o.vonSeite - 1])}` })
      }
      if (fs.length) neu('inhalt', 'Inconsistency', 'Low', `Table of contents does not match the headings (${fs.length}).`, fs, 'inhalt')
    } else na.push('inhalt')
  }

  /* 6 Nummerierung — Überschriften, Abbildungen, Tabellen */
  const nummernU = ueberschriften.map((t) => t.match(/^(\d+(?:\.\d+)*)\s/)?.[1]).filter((x): x is string => !!x)
  const fsNr: Fundstelle[] = []
  if (nummernU.length >= 2) {
    const r = nummernPruefen(nummernU)
    fsNr.push(...r.luecken.map((l) => ({ ort: 'Headings', auszug: `Gap in heading numbering: ${l} missing` })), ...r.doppelt.map((d) => ({ ort: 'Headings', auszug: `Duplicate heading number: ${d}` })))
  }
  for (const art of ['Figure', 'Table']) {
    const re = art === 'Figure' ? /^(?:Figure|Fig\.|Abbildung|Abb\.)\s+(\d+(?:[.-]\d+)*)/i : /^(?:Table|Tabelle|Tab\.)\s+(\d+(?:[.-]\d+)*)/i
    const unterschriften = alle.map((a) => ({ a, m: a.text.match(re) })).filter((x) => x.m)
    // Ein Verweis im Fließtext („Table 3 shows …") ist keine Beschriftung — nur kurze Zeilen zählen.
    const nr = unterschriften.filter((x) => x.a.text.length <= 120).map((x) => x.m![1].replace(/-/g, '.'))
    if (nr.length >= 2) {
      const r = nummernPruefen(nr)
      fsNr.push(...r.luecken.map((l) => ({ auszug: `${art} numbering gap: ${art} ${l} missing` })), ...r.doppelt.map((d) => ({ ...fundstelle(unterschriften.find((x) => x.m![1].replace(/-/g, '.') === d)!.a), auszug: `Duplicate ${art.toLowerCase()} number: ${art} ${d}` })))
    }
  }
  if (fsNr.length) neu('nummerierung', 'Editorial', 'Low', `Numbering of headings, figures or tables has gaps or duplicates (${fsNr.length}).`, fsNr, 'nummerierung')

  /* 7 Querverweise — existiert das Ziel? */
  const kapitel = new Set(nummernU)
  const anhaenge = new Set(alle.flatMap((a) => [...a.text.matchAll(/^(?:Appendix|Annex|Anhang|Anlage)\s+([A-Z0-9]+)/gi)].map((m) => m[1].toUpperCase())))
  const bilder = new Set(alle.filter((a) => a.text.length <= 120).map((a) => a.text.match(/^(?:Figure|Fig\.|Abbildung|Abb\.)\s+(\d+(?:[.-]\d+)*)/i)?.[1]?.replace(/-/g, '.')).filter(Boolean) as string[])
  const tabellen = new Set(alle.filter((a) => a.text.length <= 120).map((a) => a.text.match(/^(?:Table|Tabelle|Tab\.)\s+(\d+(?:[.-]\d+)*)/i)?.[1]?.replace(/-/g, '.')).filter(Boolean) as string[])
  const fsVerweis: Fundstelle[] = []
  for (const a of alle) {
    for (const m of a.text.matchAll(/\b(?:see|refer to|refer|siehe|gemäß)\s+(chapter|section|para(?:graph)?|appendix|annex|figure|fig\.|table|kapitel|abschnitt|anhang|abbildung|abb\.|tabelle)\s+([A-Z]?\d+(?:\.\d+)*[A-Z]?|[A-Z])\b/gi)) {
      const art = m[1].toLowerCase()
      const ziel = m[2].replace(/-/g, '.')
      const ok = /^(chapter|section|para|paragraph|kapitel|abschnitt)$/.test(art)
        ? kapitel.size === 0 || kapitel.has(ziel) || [...kapitel].some((n) => n.startsWith(`${ziel}.`))
        : /^(appendix|annex|anhang)$/.test(art)
          ? anhaenge.size === 0 || anhaenge.has(ziel.toUpperCase())
          : /^(figure|fig\.|abbildung|abb\.)$/.test(art)
            ? bilder.size === 0 || bilder.has(ziel)
            : tabellen.size === 0 || tabellen.has(ziel)
      if (!ok) fsVerweis.push(fundstelle(a, `${m[0]} — target not found`))
    }
  }
  if (fsVerweis.length) neu('querverweise', 'Inconsistency', 'Medium', `Cross-references point to targets that do not exist in the document (${fsVerweis.length}).`, fsVerweis, 'querverweise')
  if (!kapitel.size && !anhaenge.size && !bilder.size && !tabellen.size) na.push('querverweise')

  /* 8 Abkürzungen — Liste gegen Verwendung */
  const abkSeiten = abschnittSeiten(pages, regeln.abschnitte.abkuerzungen)
  if (abkSeiten.length) {
    const EINTRAG = /^\s*([A-Z][A-Z0-9/&]{1,9})\s*(?:\||–|-|:|\t|\s{2,}|\s)\s*([A-Za-z].{2,})$/
    // Folgeseiten gehören nur dazu, wenn sie überwiegend aus Einträgen
    // bestehen — sonst zählte der Text danach als Liste, und jede dort
    // benutzte Abkürzung erschiene als „nie verwendet".
    const istListe = (x: number) => {
      const z = pages[x]?.text.split('\n').filter((l) => l.trim()) ?? []
      return z.length > 0 && z.filter((l) => EINTRAG.test(l)).length / z.length >= 0.6
    }
    const listenSeiten = new Set(abkSeiten.flatMap((i) => [i, ...(istListe(i + 1) ? [i + 1, ...(istListe(i + 2) ? [i + 2] : [])] : [])]))
    const liste = new Map<string, string>()
    for (const i of listenSeiten) {
      for (const z of pages[i].text.split('\n')) {
        const m = z.match(EINTRAG)
        if (m) liste.set(m[1], m[2])
      }
    }
    const verwendet = verwendeteAbkuerzungen(roh, listenSeiten)
    const ohneEintrag = [...verwendet].filter(([t]) => !liste.has(t))
    const unbenutzt = [...liste.keys()].filter((t) => !verwendet.has(t) && !pages.some((p, i) => !listenSeiten.has(i) && p.text.includes(t)))
    const fs = [...ohneEintrag.map(([t, s]) => ({ seite: s, auszug: `Used but not in the list: ${t}` })), ...unbenutzt.map((t) => ({ seite: seitenName(pages[abkSeiten[0]]), auszug: `Listed but never used: ${t}` }))]
    if (fs.length) neu('abkuerzungen', 'Editorial', 'Low', `Abbreviation list does not match the text (${ohneEintrag.length} without entry, ${unbenutzt.length} unused).`, fs, 'abkuerzungen')
  } else na.push('abkuerzungen')

  /* 9 Reste aus der Bearbeitung */
  const fsHoch: Fundstelle[] = []
  const fsMittel: Fundstelle[] = []
  for (const r of regeln.reste) {
    const re = new RegExp(r.muster, `g${r.flags ?? ''}`)
    for (const a of alle) for (const m of a.text.matchAll(re)) (r.prioritaet === 'High' ? fsHoch : fsMittel).push(fundstelle(a, `${m[0]} — ${a.text}`))
  }
  const l = roh.lenkung
  if (l.aenderungen.length) fsHoch.push(...l.aenderungen.map((x) => ({ ort: 'Tracked change', auszug: kurz(`${x.art === 'ins' ? 'Inserted' : 'Deleted'}${x.autor ? ` by ${x.autor}` : ''}: ${x.text}`) })))
  if (l.kommentare.length) fsHoch.push(...l.kommentare.map((x) => ({ ort: 'Comment', auszug: kurz(`${x.autor ? `${x.autor}: ` : ''}${x.text}`) })))
  if (fsHoch.length) neu('reste', 'Document Control', 'High', `Unresolved editing remnants: open tracked changes, comments or broken field references (${fsHoch.length}).`, fsHoch, 'resteHoch')
  if (fsMittel.length) neu('reste', 'Editorial', 'Medium', `Editing remnants such as TBD, XXX, [insert …], DRAFT (${fsMittel.length}).`, fsMittel, 'reste')

  return { befunde: out, ampel: ampelAus([...FORMAL_PUNKTE], out as Befund[], na) }
}
