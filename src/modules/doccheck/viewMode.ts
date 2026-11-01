import { useEffect, useState } from 'react'

/**
 * Desktop-Modus oder Ansichtsmodus (Spez. 3.8)?
 *
 * Entscheidend ist der primäre Eingang, NICHT die Breite: Ein iPad im
 * Querformat ist breit genug für drei Spalten, aber ein Prüflauf über
 * 2 600 Seiten OEM-Handbuch mit Parser, OCR und Suchindex sprengt den
 * Gerätespeicher. Deshalb `pointer: coarse`.
 *
 * Bewusst eine EIGENE Abfrage und keine Änderung an `useIsDesktop`: Dort
 * ist die Breite die richtige Frage (das Admin-Panel soll am iPad
 * erreichbar sein, siehe Kommentar dort). Beide Regeln gelten nebeneinander,
 * jede für ihren Bereich.
 */
export const ANSICHT_QUERY = '(pointer: coarse)'

export function istAnsichtsmodus(mm: (q: string) => { matches: boolean } = (q) => window.matchMedia(q)): boolean {
  return mm(ANSICHT_QUERY).matches
}

export function useAnsichtsmodus(): boolean {
  const [ansicht, setAnsicht] = useState(() => istAnsichtsmodus())
  useEffect(() => {
    const mq = window.matchMedia(ANSICHT_QUERY)
    const onChange = () => setAnsicht(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return ansicht
}
