import type { Vergleichsdokument } from './parse/duplikat'
import { SANDBOX_DOKUMENTE } from './library'
import { aktualisiert, dateiAblegen, dateiEntfernen, entfernen, fehler, fertig, fortschritt, lesenZustand, neu, setzen, type Rolle } from './sitzung'
import type { Zusammenfassung } from './kern'
import type { Verbindung } from './verbindung'

/**
 * Hochladen von Prüf- und Sitzungsdokumenten: annehmen, an den Worker
 * geben, Fortschritt und Ergebnis in die Sitzung schreiben.
 */

/** Obergrenze im Browser. Die Bibliothek erlaubt 500 MB je Datei
 *  (Spez. 4.3) — mehr hält kein Tab sicher im Speicher. */
export const MAX_BYTES = 500 * 1024 * 1024
export const ENDUNGEN = ['.pdf', '.docx', '.xlsx']

/** Fortschritt höchstens alle so viele Millisekunden in die Oberfläche —
 *  2 600 Einzelmeldungen ließen sonst die Seite ruckeln. */
export const MELDE_TAKT = 120

let zaehler = 0
const neueId = () => `dc-${Date.now().toString(36)}-${(zaehler++).toString(36)}`

/** Bibliotheksbestand für die Duplikat-Prüfung — auch archivierte (Spez. 6.10). */
export function bibliotheksVergleich(): Vergleichsdokument[] {
  return SANDBOX_DOKUMENTE.map((d) => ({ id: d.id, bezeichnung: `${d.typ} ${d.revision}`, herkunft: 'library', nummer: d.nummer, revision: d.revision }))
}

export function sitzungsVergleich(): Vergleichsdokument[] {
  return lesenZustand()
    .docs.filter((d) => d.z)
    .map((d) => ({ id: d.id, bezeichnung: d.felder.titel || d.name, herkunft: d.rolle === 'review' ? 'review' : 'session', sha256: d.z!.sha256, nummer: d.felder.nummer, revision: d.felder.revision }))
}

export function annehmbar(datei: { name: string; size: number }): 'ok' | 'format' | 'groesse' {
  if (!ENDUNGEN.some((e) => datei.name.toLowerCase().endsWith(e))) return 'format'
  if (datei.size > MAX_BYTES) return 'groesse'
  return 'ok'
}

type Datei = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }

/** Dateiname ohne Endung, klein — „PLM_E1R0.docx" und „plm_e1r0.PDF" gehören zusammen. */
export const stamm = (name: string) => name.replace(/\.[^.]+$/, '').trim().toLowerCase()

/**
 * Word-PDF-Paar (Nachtrag N5): Das PDF wird KEIN eigenes Dokument, sondern
 * liefert dem DOCX die Seitenzahlen. Die Datei bleibt für den Viewer liegen
 * (`<id>#pdf`) — so zeigt „Seite ansehen" Words Seite, nicht die Näherung.
 */
export async function pdfDazulegen(id: string, pdf: Datei, v: Pick<Verbindung, 'paaren' | 'beiOcr'>): Promise<Zusammenfassung> {
  const daten = new Uint8Array(await pdf.arrayBuffer())
  dateiAblegen(`${id}#pdf`, daten)
  return new Promise((ok) => {
    const ab = v.beiOcr((z) => {
      if (z.id !== id) return
      ab()
      setzen((s) => aktualisiert(s, z))
      ok(z)
    })
    v.paaren(id, daten)
  })
}

export async function hochladen(
  dateien: Datei[],
  rolle: Rolle,
  v: Pick<Verbindung, 'lesen' | 'titel'> & Partial<Pick<Verbindung, 'paaren' | 'beiOcr'>>,
  jetzt: () => number = () => Date.now(),
  opts: { paaren?: boolean; pruefen?: { formal: boolean; word: boolean } } = {},
): Promise<{ abgelehnt: { name: string; grund: 'format' | 'groesse' }[] }> {
  const abgelehnt: { name: string; grund: 'format' | 'groesse' }[] = []
  const laeufe: Promise<void>[] = []
  // Gleichnamige DOCX/PDF im selben Hochladen sind ein Word-PDF-Paar.
  const paare = new Map<Datei, Datei>()
  if (opts.paaren !== false && v.paaren && v.beiOcr) {
    for (const d of dateien) {
      if (!/\.docx$/i.test(d.name)) continue
      const pdf = dateien.find((x) => /\.pdf$/i.test(x.name) && stamm(x.name) === stamm(d.name))
      if (pdf) paare.set(d, pdf)
    }
  }
  const alsPaar = new Set(paare.values())
  for (const f of dateien) {
    if (alsPaar.has(f)) continue
    const grund = annehmbar(f)
    if (grund !== 'ok') {
      abgelehnt.push({ name: f.name, grund })
      continue
    }
    const id = neueId()
    setzen((z) => neu(z, { id, rolle, name: f.name, groesse: f.size }))
    laeufe.push(
      (async () => {
        try {
          const daten = new Uint8Array(await f.arrayBuffer())
          dateiAblegen(id, daten)
          let zuletzt = -Infinity
          const z = await v.lesen(
            {
              id,
              name: f.name,
              daten,
              vorgabe: rolle === 'master' ? 'OEM' : undefined,
              bestand: [...bibliotheksVergleich(), ...sitzungsVergleich()],
              // Geprüft werden nur Prüfdokumente — ein Sitzungs-Master ist
              // Referenz, kein Gegenstand der Einreichung.
              ...(rolle === 'review' ? { pruefen: opts.pruefen ?? { formal: true, word: true } } : {}),
            },
            (seite, gesamt) => {
              const t = jetzt()
              if (seite !== gesamt && t - zuletzt < MELDE_TAKT) return
              zuletzt = t
              setzen((s) => fortschritt(s, id, seite, gesamt))
            },
          )
          // Inzwischen entfernt (oder abgemeldet)? Dann nicht wieder aufnehmen.
          if (!lesenZustand().docs.some((d) => d.id === id)) return
          setzen((s) => fertig(s, id, z))
          const titel = lesenZustand().docs.find((d) => d.id === id)?.felder.titel
          if (titel) v.titel(id, titel)
          const pdf = paare.get(f)
          if (pdf && z.format === 'docx') await pdfDazulegen(id, pdf, v as Pick<Verbindung, 'paaren' | 'beiOcr'>)
        } catch (e) {
          const code = (e as Error).message
          if (code === 'DC-ABORTED') {
            setzen((s) => entfernen(s, id))
            dateiEntfernen(id)
          } else setzen((s) => fehler(s, id, /^DC-/.test(code) ? code : 'DC-PARSE'))
        }
      })(),
    )
  }
  await Promise.all(laeufe)
  return { abgelehnt }
}
