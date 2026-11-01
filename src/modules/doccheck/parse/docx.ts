import JSZip from 'jszip'
import { aufbereiten } from './aufbereiten'
import { LEERE_LENKUNG, type Rechtscharakter, type Lenkung, type OutlineNode, type Rohdokument } from './model'
import { entitaeten, texteIn, xmlEreignisse } from './xml'

/**
 * DOCX lesen — ein Leseweg über jszip und die XML-Teile (Entscheidung
 * gegen mammoth: Es verwirft nicht angenommene Änderungen und Kommentare,
 * und beides braucht die Dokumentenlenkung).
 *
 * Seiten gibt es in DOCX nicht; gezählt wird über ausdrückliche
 * Seitenumbrüche und `w:lastRenderedPageBreak` — eine Näherung, deshalb
 * „ca." in der Bezeichnung (Spez. 7.3). Die eigentliche Verortung ist der
 * Abschnittspfad aus den Überschriften.
 */

/** styleId → Gliederungsebene (1-basiert) aus styles.xml. */
export function ueberschriftStile(stylesXml: string): Map<string, number> {
  const out = new Map<string, number>()
  let id: string | null = null
  let name = ''
  let ebene: number | null = null
  for (const e of xmlEreignisse(stylesXml)) {
    if (e.typ === 'auf' && e.name === 'w:style') {
      id = e.attr['w:styleId'] ?? null
      name = ''
      ebene = null
    } else if (e.typ === 'auf' && e.name === 'w:name' && id) name = e.attr['w:val'] ?? ''
    else if (e.typ === 'auf' && e.name === 'w:outlineLvl' && id) ebene = Number(e.attr['w:val']) + 1
    else if (e.typ === 'zu' && e.name === 'w:style' && id) {
      const ausName = name.match(/^heading\s*(\d)$/i)
      const lvl = ebene ?? (ausName ? Number(ausName[1]) : null)
      if (lvl && lvl >= 1 && lvl <= 9) out.set(id, lvl)
      id = null
    }
  }
  return out
}

/** Eigenschaften aus docProps/core.xml und docProps/custom.xml. */
export function eigenschaftenLesen(coreXml?: string, customXml?: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (coreXml) {
    // Direkt per Muster: Der Kern ist flach, und Element- und Textknoten
    // heißen hier gleich (dc:title enthält unmittelbar Text).
    const feld = (tag: string) => coreXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]
    const t = feld('dc:title')
    if (t?.trim()) out.title = entitaeten(t).trim()
    const s = feld('dc:subject')
    if (s?.trim()) out.subject = entitaeten(s).trim()
    // cp:revision ist der Speicherzähler von Word, NICHT die Dokumentrevision
    // — bewusst ignoriert.
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

interface Absatz {
  text: string
  ebene: number | null
}

export async function docxLesen(daten: Uint8Array | ArrayBuffer, vorgabe?: Rechtscharakter): Promise<Rohdokument> {
  const zip = await JSZip.loadAsync(daten)
  const lies = async (pfad: string) => zip.file(pfad)?.async('string')
  const doc = await lies('word/document.xml')
  if (!doc) throw new Error('DC-DOCX-INVALID')
  const stile = ueberschriftStile((await lies('word/styles.xml')) ?? '')

  const lenkung: Lenkung = { ...LEERE_LENKUNG, aenderungen: [], kommentare: [], kopfzeilen: [], fusszeilen: [], textfelder: [], eigenschaften: {} }
  const seiten: Absatz[][] = [[]]
  let tabellen = 0

  // Zustand des Durchlaufs
  let absatz: Absatz | null = null
  let ins: { autor?: string; text: string } | null = null
  let del: { autor?: string; text: string } | null = null
  let inText = false
  let inDelText = false
  let txbx = 0
  let fallback = 0
  let tabTiefe = 0
  let zelle: string | null = null
  let reihe: string[] | null = null
  let rand = false
  let textSeitUmbruch = true

  const umbruch = () => {
    // Doppelte Umbrüche ohne Text dazwischen (ausdrücklicher Umbruch, danach
    // Words „zuletzt gerendert"-Marke) sind EIN Seitenwechsel.
    if (textSeitUmbruch) return
    if (absatz && absatz.text.trim()) {
      seiten[seiten.length - 1].push({ ...absatz })
      absatz = { text: '', ebene: absatz.ebene }
    }
    seiten.push([])
    textSeitUmbruch = true
  }

  for (const e of xmlEreignisse(doc)) {
    if (e.typ === 'auf') {
      // mc:Fallback wiederholt den Inhalt von mc:Choice (Textfelder!) — einmal reicht.
      if (e.name === 'mc:Fallback') fallback++
      if (fallback) continue
      switch (e.name) {
        case 'w:txbxContent': txbx++; break
        case 'w:tbl': if (!txbx) { if (tabTiefe === 0) tabellen++; tabTiefe++ } break
        case 'w:tr': if (!txbx) reihe = []; break
        case 'w:tc': if (!txbx) zelle = ''; break
        case 'w:p': absatz = { text: '', ebene: null }; rand = false; break
        case 'w:pStyle': if (absatz) absatz.ebene = stile.get(e.attr['w:val'] ?? '') ?? null; break
        case 'w:pBdr': rand = true; break
        case 'w:ins': ins = { autor: e.attr['w:author'], text: '' }; break
        case 'w:del': del = { autor: e.attr['w:author'], text: '' }; break
        case 'w:t': inText = true; break
        case 'w:delText': inDelText = true; break
        case 'w:tab': if (absatz && !del) absatz.text += '\t'; break
        case 'w:br': if (e.attr['w:type'] === 'page' && !txbx && !tabTiefe) umbruch(); else if (absatz && !del) absatz.text += ' '; break
        case 'w:lastRenderedPageBreak': if (!txbx && !tabTiefe) umbruch(); break
      }
      // Revisionsbalken: ein Absatzrahmen links oder rechts.
      if (rand && (e.name === 'w:left' || e.name === 'w:right')) {
        lenkung.revisionsbalken++
        rand = false
      }
    } else if (e.typ === 'zu') {
      if (e.name === 'mc:Fallback') { fallback--; continue }
      if (fallback) continue
      switch (e.name) {
        case 'w:t': inText = false; break
        case 'w:delText': inDelText = false; break
        case 'w:pBdr': rand = false; break
        case 'w:ins': if (ins?.text.trim()) lenkung.aenderungen.push({ art: 'ins', text: ins.text.trim(), autor: ins.autor }); ins = null; break
        case 'w:del': if (del?.text.trim()) lenkung.aenderungen.push({ art: 'del', text: del.text.trim(), autor: del.autor }); del = null; break
        case 'w:p': {
          const a = absatz as Absatz | null
          absatz = null
          if (!a) break
          const t = a.text.replace(/[ \t]+/g, ' ').trim()
          if (txbx) { if (t) lenkung.textfelder.push(t); break }
          if (zelle !== null) { zelle = `${zelle} ${t}`.trim(); break }
          if (t) { seiten[seiten.length - 1].push({ text: t, ebene: a.ebene }); textSeitUmbruch = false }
          break
        }
        case 'w:tc': if (reihe && zelle !== null) reihe.push(zelle); zelle = null; break
        case 'w:tr': if (reihe?.some((z) => z)) { seiten[seiten.length - 1].push({ text: reihe.join(' | '), ebene: null }); textSeitUmbruch = false } reihe = null; break
        case 'w:tbl': if (!txbx) tabTiefe--; break
        case 'w:txbxContent': txbx--; break
      }
    } else if (inText && absatz) {
      absatz.text += e.text
      if (ins) ins.text += e.text
    } else if (inDelText && del) del.text += e.text
  }

  // Kopf-/Fußzeilen und Kommentare stehen in eigenen Teilen.
  for (const pfad of Object.keys(zip.files).sort()) {
    const m = pfad.match(/^word\/(header|footer)\d*\.xml$/)
    if (!m) continue
    const texte = texteIn((await lies(pfad))!, 'w:p').filter(Boolean)
    ;(m[1] === 'header' ? lenkung.kopfzeilen : lenkung.fusszeilen).push(...texte)
  }
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
  lenkung.eigenschaften = eigenschaftenLesen(await lies('docProps/core.xml'), await lies('docProps/custom.xml'))

  // Abschnittspfade aus den echten Überschriften — nicht aus der Zahlen-
  // Heuristik, die für PDF gebraucht wird.
  const gefuellt = seiten.filter((s, i) => s.length || i === 0)
  let pfad: string[] = []
  const outline: OutlineNode[] = []
  const pfade = gefuellt.map((absaetze, i) => {
    for (const a of absaetze) {
      if (!a.ebene) continue
      pfad = [...pfad.slice(0, a.ebene - 1), a.text]
      outline.push({ titel: a.text, ebene: a.ebene, vonSeite: i + 1 })
    }
    return [...pfad]
  })
  const { pages } = aufbereiten(
    gefuellt.map((s) => s.map((a) => a.text)),
    { vorgabe, kopfFuss: false, labels: gefuellt.map((_, i) => `ca. ${i + 1}`) },
  )
  pages.forEach((p, i) => {
    if (pfade[i].length) p.sectionPath = pfade[i]
    else delete p.sectionPath
  })
  return { format: 'docx', pages, outline, lenkung, ocrKandidaten: [], tabellen }
}
