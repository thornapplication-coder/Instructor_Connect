import { AlertTriangle, CheckCircle2, Clock, X } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Kurze Bestaetigung nach einer Aktion.
 *
 * Die App quittierte fast nichts. Ein abgeschlossenes Grading-Formular sprang
 * wortlos in die Liste zurueck — dass es unterschrieben UND versendet war,
 * unterschied sich fuer den Bedienenden nicht davon, dass es nur gespeichert
 * wurde oder im Ausgangskorb liegt. Dasselbe beim Loeschen einer Notiz, beim
 * Speichern eines Kontakts, beim Herunterladen eines Auszugs: Es passierte
 * etwas Endgueltiges, und die Oberflaeche sagte nichts dazu. Wer unsicher
 * war, drueckte noch einmal.
 *
 * Deshalb hier ein Streifen, der drei Sekunden lang sagt, was passiert ist.
 * Bewusst schlicht gehalten:
 *
 *  - `role="status"` und `aria-live="polite"`: Sprachausgaben lesen die
 *    Bestaetigung vor, ohne den Fokus zu stehlen. Genau dafuer ist die
 *    Meldung da — sie ersetzt die Rueckmeldung, die Sehende aus der
 *    Bildschirmaenderung ziehen.
 *  - Kein Fokusfang, kein Dialog: eine Bestaetigung darf den naechsten
 *    Handgriff nicht aufhalten.
 *  - Ueber der Sandbox-Leiste (`above-sandbox`) und ueber der
 *    Formularleiste, falls die steht — zwei Streifen am unteren Rand
 *    vertragen sich sonst nicht (siehe index.css).
 *
 * Aufgerufen wird sie als Funktion, nicht ueber einen Context: `toast(...)`
 * funktioniert damit auch aus einem Ereignis-Handler heraus, der keinen Hook
 * aufrufen darf.
 */

export type ToastTone = 'ok' | 'wait' | 'bad'

type ToastEintrag = { id: number; text: string; tone: ToastTone }

const HOERER = new Set<(e: ToastEintrag) => void>()
let naechsteId = 1

/** Bestaetigung anzeigen. Aus jedem Modul aufrufbar, auch ausserhalb React. */
export function toast(text: string, tone: ToastTone = 'ok'): void {
  const eintrag = { id: naechsteId++, text, tone }
  HOERER.forEach((h) => h(eintrag))
}

/** Sichtdauer: lang genug zum Lesen, kurz genug, um nicht im Weg zu stehen. */
const DAUER_MS = 3500

export function ToastHost() {
  const [liste, setListe] = useState<ToastEintrag[]>([])

  useEffect(() => {
    const h = (e: ToastEintrag) => {
      // Nur die letzten drei: Wer eine Kette von Folgeformularen abschliesst,
      // haette sonst einen Stapel vor der halben Seite.
      setListe((alt) => [...alt, e].slice(-3))
      window.setTimeout(() => setListe((alt) => alt.filter((x) => x.id !== e.id)), DAUER_MS)
    }
    HOERER.add(h)
    return () => {
      HOERER.delete(h)
    }
  }, [])

  if (liste.length === 0) return null

  const flaeche: Record<ToastTone, string> = {
    ok: 'bg-ok text-okInk',
    wait: 'bg-wait text-waitInk',
    bad: 'bg-bad text-badInk',
  }
  const Symbol = { ok: CheckCircle2, wait: Clock, bad: AlertTriangle }

  return (
    <div
      role="status"
      aria-live="polite"
      className="above-sandbox pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-tight px-4"
    >
      {liste.map((e) => {
        const Icon = Symbol[e.tone]
        return (
          <div
            key={e.id}
            className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-small font-medium shadow-soft ${flaeche[e.tone]}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">{e.text}</span>
            {/* Wegklicken moeglich — die Meldung verschwindet zwar von selbst,
                aber sie sitzt genau dort, wo die naechste Aktion liegen kann. */}
            <button
              onClick={() => setListe((alt) => alt.filter((x) => x.id !== e.id))}
              aria-label="OK"
              className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg opacity-80 transition hover:opacity-100"
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
