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
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: (fehler: Error, zuruecksetzen: () => void) => ReactNode; onError?: (fehler: Error, info: ErrorInfo) => void },
  { fehler: Error | null }
> {
  state = { fehler: null as Error | null }

  static getDerivedStateFromError(fehler: Error) {
    return { fehler }
  }

  componentDidCatch(fehler: Error, info: ErrorInfo) {
    this.props.onError?.(fehler, info)
  }

  zuruecksetzen = () => this.setState({ fehler: null })

  render() {
    return this.state.fehler ? this.props.fallback(this.state.fehler, this.zuruecksetzen) : this.props.children
  }
}
