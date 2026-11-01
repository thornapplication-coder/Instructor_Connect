/**
 * Synthetische PDF-Dateien für Tests, Benchmark und Sandbox.
 *
 * Kap. 19: „Fixtures: nur synthetische Dokumente." Statt Beispiel-PDFs im
 * Repo abzulegen, entstehen sie hier aus Text — mit echten Koordinaten,
 * damit Zeilenaufbau, Spalten, Kopf- und Fußzeilen wirklich geprüft
 * werden. Erzeugt wird ein minimales, gültiges PDF 1.4 mit Helvetica.
 */

export interface PdfText {
  text: string
  x: number
  y: number
  groesse?: number
}

export interface PdfSeitenInhalt {
  texte: PdfText[]
  /** Zeichnet ein 1×1-Bild — für OCR-Kandidaten. */
  bild?: boolean
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

export function pdfBauen(seiten: PdfSeitenInhalt[], opts: { titel?: string; datum?: string } = {}): Uint8Array {
  const objekte: string[] = []
  const neu = (inhalt: string) => {
    objekte.push(inhalt)
    return objekte.length
  }
  const katalog = neu('') // Platzhalter
  const seitenBaum = neu('')
  const schrift = neu('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const bild = neu('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\u0080\nendstream')
  const kinder: number[] = []
  for (const s of seiten) {
    const ops = s.texte.map((t) => `BT /F1 ${t.groesse ?? 10} Tf ${t.x} ${t.y} Td (${esc(t.text)}) Tj ET`)
    if (s.bild) ops.push('q 200 0 0 200 100 300 cm /Im1 Do Q')
    const strom = ops.join('\n')
    const inhalt = neu(`<< /Length ${strom.length} >>\nstream\n${strom}\nendstream`)
    kinder.push(neu(`<< /Type /Page /Parent ${seitenBaum} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${schrift} 0 R >> /XObject << /Im1 ${bild} 0 R >> >> /Contents ${inhalt} 0 R >>`))
  }
  objekte[katalog - 1] = `<< /Type /Catalog /Pages ${seitenBaum} 0 R >>`
  objekte[seitenBaum - 1] = `<< /Type /Pages /Kids [${kinder.map((k) => `${k} 0 R`).join(' ')}] /Count ${kinder.length} >>`
  const infoTeile = [opts.titel ? `/Title (${esc(opts.titel)})` : '', opts.datum ? `/ModDate (${opts.datum})` : ''].filter(Boolean)
  const info = infoTeile.length ? neu(`<< ${infoTeile.join(' ')} >>`) : 0

  let out = '%PDF-1.4\n'
  const versatz: number[] = []
  objekte.forEach((o, i) => {
    versatz.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`
  for (const v of versatz) out += `${String(v).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objekte.length + 1} /Root ${katalog} 0 R${info ? ` /Info ${info} 0 R` : ''} >>\nstartxref\n${xref}\n%%EOF\n`
  // Latin-1: Ein Zeichen = ein Byte, sonst stimmen die xref-Versätze nicht.
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff)
}

/** Fließtext in Zeilen auf einer Seite setzen (linksbündig, von oben). */
export function textSeite(zeilen: string[], opts: { x?: number; oben?: number; abstand?: number; groesse?: number } = {}): PdfText[] {
  const { x = 60, oben = 780, abstand = 14, groesse = 10 } = opts
  return zeilen.map((text, i) => ({ text, x, y: oben - i * abstand, groesse }))
}
