import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Fehlergrenze: Ein Fehler beim Rendern bleibt in ihrem Bereich.
 *
 * Bisher gab es keine einzige in der App — ein Wurf irgendwo im Baum
 * nahm die ganze Seite mit, Startseite und Sandbox-Leiste inklusive.
 * Eingefuehrt fuer DocCheck (Spez. 3.2: „Ein Fehler in DocCheck darf
 * InstructorConnect nie beeintraechtigen"), aber bewusst allgemein
 * gehalten: Auch ein Ladefehler eines nachgeladenen Teils (Netz weg beim
 * Oeffnen der Kachel) landet hier, nicht in einer weissen Seite.
 *
 * Ausserhalb von DocCheck gab es lange keine — jeder Renderfehler machte die
 * App weiss (Audit 11/2026, TEC-07). Jetzt liegen in App.tsx zwei: eine um
 * die Seiten (die Huelle bleibt stehen) und eine um die ganze App.
 */
export class ErrorBoundary extends Component<
  {
    children: ReactNode
    fallback: (fehler: Error, zuruecksetzen: () => void) => ReactNode
    onError?: (fehler: Error, info: ErrorInfo) => void
    /**
     * Ändert sich dieser Wert, gilt der Fehler als erledigt. Die Grenze um
     * die Seiten (App.tsx) bekommt die Route: Wer nach einem Absturz über
     * Zurück oder ein Lesezeichen woandershin geht, sieht dort die neue
     * Seite — nicht weiter die Fehlermeldung der alten.
     */
    zuruecksetzenBei?: unknown
  },
  { fehler: Error | null }
> {
  state = { fehler: null as Error | null }

  static getDerivedStateFromError(fehler: Error) {
    return { fehler }
  }

  componentDidCatch(fehler: Error, info: ErrorInfo) {
    this.props.onError?.(fehler, info)
  }

  componentDidUpdate(vorher: { zuruecksetzenBei?: unknown }) {
    if (this.state.fehler && vorher.zuruecksetzenBei !== this.props.zuruecksetzenBei) this.setState({ fehler: null })
  }

  zuruecksetzen = () => this.setState({ fehler: null })

  render() {
    return this.state.fehler ? this.props.fallback(this.state.fehler, this.zuruecksetzen) : this.props.children
  }
}
