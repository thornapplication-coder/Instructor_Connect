import { teilLesen as zipTeilLesen, zipOeffnen } from './zip'
import { LEERE_LENKUNG, type Lenkung, type Rechtscharakter, type Rohdokument, type WordExtrakt, type WortAbschnitt } from './model'
import { seitenAusEinheiten, tocEintrag, tocZuordnung } from './seitenzuordnung'
import { stileLesen } from './wordStile'
import { teilLesen } from './wordTeil'
import { entitaeten, xmlEreignisse } from './xml'

/**
 * DOCX lesen — ein Leseweg über jszip und die XML-Teile (Entscheidung
 * gegen mammoth: Es verwirft nicht angenommene Änderungen und Kommentare,
 * und beides braucht die Dokumentenlenkung).
 *
 * Seit Nachtrag v1.2 entsteht dabei zusätzlich der Word-Extrakt: wirksame
 * Laufeigenschaften, Abschnitte mit Kopf-/Fußzeilen, Inhaltsverzeichnis,
 * Eigenschaften. Er ist Grundlage für den Word-Technik-Check (N4) und die
 * Seitenzuordnung (N5).
 */

/** styleId → Gliederungsebene — für Aufrufer, die nur die Ebenen brauchen. */
export function ueberschriftStile(stylesXml: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [id, s] of stileLesen(stylesXml).stile) if (s.ebene && s.ebene >= 1 && s.ebene <= 9) out.set(id, s.ebene)
  return out
}

/** Eigenschaften aus docProps/core.xml, docProps/custom.xml und docProps/app.xml. */
export function eigenschaftenLesen(coreXml?: string, customXml?: string, appXml?: string): Record<string, string> {
  const out: Record<string, string> = {}
  const feld = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]
  if (coreXml) {
    // Direkt per Muster: Der Kern ist flach, und Element- und Textknoten
    // heißen hier gleich (dc:title enthält unmittelbar Text).
    for (const [tag, k] of [['dc:title', 'title'], ['dc:subject', 'subject'], ['dc:creator', 'creator'], ['cp:lastModifiedBy', 'lastModifiedBy'], ['dcterms:modified', 'modified']] as const) {
      const v = feld(coreXml, tag)
      if (v?.trim()) out[k] = entitaeten(v).trim()
    }
    // cp:revision ist der Speicherzähler von Word, NICHT die Dokumentrevision
    // — bewusst ignoriert.
  }
  if (appXml) {
    const p = feld(appXml, 'Pages')
    if (p && /^\d+$/.test(p.trim())) out.pages = p.trim()
  }
  if (customXml) {
    let name: string | null = null
    let wert = ''
    for (const e of xmlEreignisse(customXml)) {
      if (e.typ === 'auf' && e.name === 'property') {
        name = e.attr.name ?? null
        wert = ''
      } else if (e.typ === 'text' && name) wert += e.text
      else if (e.typ === 'zu' && e.name === 'property' && name) {
        const n = name.toLowerCase().replace(/[\s_-]/g, '')
        if (/^(revision|rev|edition|issue)/.test(n)) out.revision = wert.trim()
        else if (/^(doc(ument)?(no|nr|number|id)|partno)/.test(n)) out.docNumber = wert.trim()
        name = null
      }
    }
  }
  return out
}

export async function docxLesen(daten: Uint8Array | ArrayBuffer, vorgabe?: Rechtscharakter): Promise<Rohdokument> {
  const zip = await zipOeffnen(daten)
  const lies = (pfad: string) => zipTeilLesen(zip, pfad)
  const doc = await lies('word/document.xml')
  if (!doc) throw new Error('DC-DOCX-INVALID')
  const stile = stileLesen((await lies('word/styles.xml')) ?? '')

  const haupt = teilLesen(doc, { teil: 'word/document.xml', ort: 'body', stile, startNr: 0 })
  const absaetze = [...haupt.absaetze]
  const laeufe = [...haupt.laeufe]

  // Beziehungen: rId → Datei der Kopf-/Fußzeile.
  const rels = new Map<string, string>()
  for (const e of xmlEreignisse((await lies('word/_rels/document.xml.rels')) ?? '')) {
    if (e.typ === 'auf' && e.name === 'Relationship') rels.set(e.attr.Id, `word/${(e.attr.Target ?? '').replace(/^\/?word\//, '')}`)
  }

  // ALLE Kopf-/Fußzeilen-Teile lesen — auch die, die kein Abschnitt
  // verwendet (Nachtrag N4: alte Reste mit falschem Datum).
  const kopfFussText = new Map<string, string>()
  const lenkung: Lenkung = { ...LEERE_LENKUNG, ...haupt.lenkung, kommentare: [], kopfzeilen: [], fusszeilen: [], eigenschaften: {} }
  for (const pfad of Object.keys(zip.files).sort()) {
    const m = pfad.match(/^word\/(header|footer)\d*\.xml$/)
    if (!m) continue
    const teil = teilLesen((await lies(pfad))!, { teil: pfad, ort: m[1] === 'header' ? 'kopf' : 'fuss', stile, startNr: absaetze.length })
    absaetze.push(...teil.absaetze)
    laeufe.push(...teil.laeufe)
    const text = teil.absaetze.map((a) => a.text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')
    kopfFussText.set(pfad, text)
    if (text) (m[1] === 'header' ? lenkung.kopfzeilen : lenkung.fusszeilen).push(text)
  }
  const verwendet = new Set<string>()
  const abschnitte: WortAbschnitt[] = haupt.sektionen.map((s, i) => {
    const auf = (r: { typ: string; rid: string }) => {
      const teil = rels.get(r.rid) ?? r.rid
      verwendet.add(teil)
      return { typ: r.typ, teil, text: kopfFussText.get(teil) ?? '' }
    }
    return { nr: i + 1, kopf: s.kopf.map(auf), fuss: s.fuss.map(auf) }
  })

  const komm = await lies('word/comments.xml')
  if (komm) {
    let autor: string | undefined
    let text = ''
    let inT = false
    for (const e of xmlEreignisse(komm)) {
      if (e.typ === 'auf' && e.name === 'w:comment') { autor = e.attr['w:author']; text = '' }
      else if (e.typ === 'auf' && e.name === 'w:t') inT = true
      else if (e.typ === 'zu' && e.name === 'w:t') inT = false
      else if (e.typ === 'auf' && e.name === 'w:p' && text) text += ' '
      else if (e.typ === 'text' && inT) text += e.text
      else if (e.typ === 'zu' && e.name === 'w:comment') lenkung.kommentare.push({ autor, text: text.trim() })
    }
  }
  const eig = eigenschaftenLesen(await lies('docProps/core.xml'), await lies('docProps/custom.xml'), await lies('docProps/app.xml'))
  lenkung.eigenschaften = Object.fromEntries(Object.entries(eig).filter(([k]) => ['title', 'subject', 'revision', 'docNumber'].includes(k)))

  const einstellungen = (await lies('word/settings.xml')) ?? ''
  const kompat = einstellungen.match(/w:name="compatibilityMode"[^>]*w:val="(\d+)"/) ?? einstellungen.match(/w:val="(\d+)"[^>]*w:name="compatibilityMode"/)
  const hintergrund = doc.match(/<w:background[^>]*w:color="([0-9A-Fa-f]{6})"/)?.[1]?.toUpperCase()

  const toc = absaetze.filter((a) => a.ort === 'body' && a.toc).map((a) => ({ ...tocEintrag(a.text), ebene: a.toc! }))
  const word: WordExtrakt = {
    absaetze,
    laeufe,
    abschnitte,
    verwaisteKopfFuss: [...kopfFussText.keys()].filter((k) => !verwendet.has(k)),
    standard: stile.standard,
    ...(kompat ? { kompatibilitaet: Number(kompat[1]) } : {}),
    ...(hintergrund ? { seitenhintergrund: hintergrund } : {}),
    eigenschaften: {
      title: eig.title,
      creator: eig.creator,
      lastModifiedBy: eig.lastModifiedBy,
      modified: eig.modified,
      ...(eig.pages ? { seiten: Number(eig.pages) } : {}),
    },
    toc,
  }

  // Seiten: über das Inhaltsverzeichnis, wenn es taugt — sonst nach Words
  // Umbruchmarken, ausdrücklich als Näherung.
  // TOC-Einträge selbst stehen nicht als Inhalt in der Abbildung: Ihre
  // Überschriften-Texte würden sonst den Ankerabgleich verwirren.
  const einheiten = haupt.einheiten
  const perToc = tocZuordnung(einheiten, toc, word.eigenschaften.seiten)
  const { pages, outline } = perToc
    ? seitenAusEinheiten(einheiten, perToc, (n) => `S. ${n} (±1)`, vorgabe)
    : seitenAusEinheiten(einheiten, einheiten.map((e) => e.seite), (n) => `ca. ${n}`, vorgabe)
  return {
    format: 'docx',
    pages,
    outline,
    lenkung,
    ocrKandidaten: [],
    tabellen: haupt.tabellen,
    word,
    einheiten,
    seitenQuelle: perToc ? 'toc_mapping' : 'approx',
  }
}
