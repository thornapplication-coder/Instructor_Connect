import type { Vergleichsdokument } from './parse/duplikat'
import { SANDBOX_DOKUMENTE } from './library'
import { abonnieren, aktualisiert, dateiAblegen, dateiEntfernen, entfernen, fehler, fertig, fortschritt, lesenZustand, neu, setzen, type Rolle } from './sitzung'
import type { PruefSchalter, Zusammenfassung } from './kern'
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
 * Wie lange auf die Antwort des Workers zu einer Word-PDF-Paarung gewartet
 * wird. Ohne Grenze blieb ein hängender Worker (oder einer, der das Dokument
 * nicht mehr kennt und deshalb gar nicht antwortet) für immer im Zustand
 * „Gleiche ab …", und beim Hochladen wartete die Meldung abgelehnter
 * Dateien mit (Audit 11/2026, Runde 3). Die Zeit wächst mit der Datei: Das
 * Lesen des PDF-Texts dauert etwa proportional zur Seitenzahl, und die
 * wächst grob mit der Größe. 60 s Sockel decken Worker- und pdf.js-Start,
 * 4 s je angefangenem MB sind großzügig (ein MB Handbuch-PDF sind etwa zehn
 * Seiten, gelesen werden mehrere je Sekunde); höchstens 10 min.
 */
export const PAAR_ZEIT_SOCKEL = 60_000
export const PAAR_ZEIT_JE_MB = 4_000
export const PAAR_ZEIT_MAX = 600_000

export function paarZeitgrenze(bytes: number): number {
  return Math.min(PAAR_ZEIT_MAX, PAAR_ZEIT_SOCKEL + Math.ceil(Math.max(0, bytes) / 1_048_576) * PAAR_ZEIT_JE_MB)
}

/**
 * Word-PDF-Paar (Nachtrag N5): Das PDF wird KEIN eigenes Dokument, sondern
 * liefert dem DOCX die Seitenzahlen. Die Datei bleibt für den Viewer liegen
 * (`<id>#pdf`) — so zeigt „Seite ansehen" Words Seite, nicht die Näherung.
 *
 * `'zeit'`: keine Antwort binnen `paarZeitgrenze`. Das DOCX bleibt, wie
 * es ist — gelesen, mit geschätzten Seiten, nutzbar. Antwortet der Worker
 * doch noch, übernimmt der dauerhafte Hörer in `DocCheckApp` das Ergebnis
 * wie jede andere Aktualisierung aus dem Worker; hier wartet dann niemand
 * mehr, und die Datei für den Viewer liegt dafür schon bereit. Eine
 * überholte Paarung verwirft der Kern selbst (`Kern.paaren`).
 *
 * `'entfernt'`: Das Dokument verließ die Sitzung, während gewartet wurde
 * (entfernt, abgemeldet, Nutzerwechsel). Dann wartet niemand weiter, und es
 * gibt nichts zu melden — die Zeitgrenze hätte sonst Minuten später „keine
 * Antwort" zu einem Dokument gesagt, das es nicht mehr gibt, nach dem
 * Abmelden mit seinem Namen vor dem nächsten Nutzer (Gegenprüfung Audit
 * 11/2026, Runde 3).
 */
export async function pdfDazulegen(id: string, pdf: Datei, v: Pick<Verbindung, 'paaren' | 'beiOcr'>, warten = paarZeitgrenze(pdf.size)): Promise<Zusammenfassung | 'zeit' | 'entfernt'> {
  const daten = new Uint8Array(await pdf.arrayBuffer())
  dateiAblegen(`${id}#pdf`, daten)
  return new Promise((ok) => {
    const ende = (r: Zusammenfassung | 'zeit' | 'entfernt') => {
      clearTimeout(uhr)
      abOcr()
      abSitzung()
      ok(r)
    }
    const uhr = setTimeout(() => ende('zeit'), warten)
    const abOcr = v.beiOcr((z) => {
      if (z.id !== id) return
      // Erst abmelden, dann einspielen: `setzen` ruft den Sitzungshörer unten sofort auf
      abSitzung()
      setzen((s) => aktualisiert(s, z))
      ende(z)
    })
    const abSitzung = abonnieren(() => {
      if (!lesenZustand().docs.some((d) => d.id === id)) ende('entfernt')
    })
    v.paaren(id, daten)
  })
}

export async function hochladen(
  dateien: Datei[],
  rolle: Rolle,
  v: Pick<Verbindung, 'lesen' | 'titel'> & Partial<Pick<Verbindung, 'paaren' | 'beiOcr' | 'entfernen'>>,
  jetzt: () => number = () => Date.now(),
  opts: { paaren?: boolean; pruefen?: PruefSchalter } = {},
): Promise<{ abgelehnt: { name: string; grund: 'format' | 'groesse' }[]; ohneAntwort: string[] }> {
  const abgelehnt: { name: string; grund: 'format' | 'groesse' }[] = []
  /** DOCX, deren Word-PDF-Paarung nicht rechtzeitig antwortete — gelesen sind sie trotzdem */
  const ohneAntwort: string[] = []
  const laeufe: Promise<void>[] = []
  // Gleichnamige DOCX/PDF im selben Hochladen sind ein Word-PDF-Paar — aber
  // nur, wenn beide angenommen werden: Ein zu großes DOCX nahm sein PDF sonst
  // spurlos mit, und ein zu großes PDF umging als Paarling die Größengrenze
  // (Audit 11/2026, DC-07).
  const paare = new Map<Datei, Datei>()
  if (opts.paaren !== false && v.paaren && v.beiOcr) {
    for (const d of dateien) {
      if (!/\.docx$/i.test(d.name) || annehmbar(d) !== 'ok') continue
      const pdf = dateien.find((x) => /\.pdf$/i.test(x.name) && stamm(x.name) === stamm(d.name) && annehmbar(x) === 'ok')
      if (pdf) paare.set(d, pdf)
    }
  }
  /** Ohne gelesenes DOCX wird sein PDF ein eigenes Prüfdokument — vorher verschwand es ohne Karte und ohne Meldung (DC-07). */
  const pdfAllein = async (pdf: Datei) => {
    const r = await hochladen([pdf], rolle, v, jetzt, { ...opts, paaren: false })
    abgelehnt.push(...r.abgelehnt)
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
              ...(rolle === 'review' ? { pruefen: opts.pruefen ?? { formal: true, word: true, rechnen: true } } : {}),
            },
            (seite, gesamt) => {
              const t = jetzt()
              if (seite !== gesamt && t - zuletzt < MELDE_TAKT) return
              zuletzt = t
              setzen((s) => fortschritt(s, id, seite, gesamt))
            },
          )
          // Inzwischen entfernt (oder abgemeldet)? Dann nicht wieder aufnehmen.
          const jetztDa = lesenZustand().docs.find((d) => d.id === id)
          if (!jetztDa) return
          // Abgebrochen, aber der Worker war schon fertig, als die Nachricht
          // ankam: Das Ergebnis wird verworfen — auch im Worker, sonst fände
          // die Suche ein Dokument, das es auf dem Bildschirm nicht gibt
          // (Gegenprüfung Audit 11/2026, DC-01).
          if (jetztDa.abbruch) throw new Error('DC-ABORTED')
          setzen((s) => fertig(s, id, z))
          const titel = lesenZustand().docs.find((d) => d.id === id)?.felder.titel
          if (titel) v.titel(id, titel)
          const pdf = paare.get(f)
          if (pdf && z.format === 'docx') {
            if ((await pdfDazulegen(id, pdf, v as Pick<Verbindung, 'paaren' | 'beiOcr'>)) === 'zeit') ohneAntwort.push(f.name)
          } else if (pdf) await pdfAllein(pdf)
        } catch (e) {
          const code = (e as Error).message
          if (code === 'DC-ABORTED') {
            // Abgebrochen ist das Paar: Das PDF gehörte zum DOCX und geht mit
            v.entfernen?.(id)
            setzen((s) => entfernen(s, id))
            dateiEntfernen(id)
          } else {
            setzen((s) => fehler(s, id, /^DC-/.test(code) ? code : 'DC-PARSE'))
            const pdf = paare.get(f)
            if (pdf) await pdfAllein(pdf)
          }
        }
      })(),
    )
  }
  await Promise.all(laeufe)
  return { abgelehnt, ohneAntwort }
}
