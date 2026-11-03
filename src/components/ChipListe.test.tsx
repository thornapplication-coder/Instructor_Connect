import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { ChipListe } from './ui'

/**
 * Bearbeitbare Chip-Liste (Ebene 2, Audit 11/2026, MOB-05, A11Y-04, A11Y-07,
 * TEC-09, VERW-18).
 *
 * Nachgestellt: 37 Loeschknoepfe zu je 13 px in den Einstellungen; Enter auf
 * „Delete: ATR 42/72" liess den Fokus auf <body> fallen; das „+" hatte keinen
 * Namen; „General" liess sich loeschen und kam beim Start zurueck; ein noch
 * verwendetes Muster sprang still ans Listenende.
 */

const onChange = vi.fn()

function Liste(props: Partial<Parameters<typeof ChipListe>[0]> & { start: string[] }) {
  const { start, ...rest } = props
  const [werte, setWerte] = useState(start)
  return (
    <ChipListe
      label="Muster"
      values={werte}
      onChange={(v) => {
        onChange(v)
        setWerte(v)
      }}
      {...rest}
    />
  )
}

const loeschen = (wert: string) => screen.getByRole('button', { name: `Löschen: ${wert}` })
const eingabe = () => screen.getByRole('textbox', { name: 'Muster' })

beforeEach(async () => {
  await i18n.changeLanguage('de')
  onChange.mockReset()
})

describe('ChipListe — Namen und Trefferflaeche', () => {
  it('jeder Loeschknopf und das „+" tragen einen Namen', () => {
    render(<Liste start={['ATR 42/72', 'CL30']} />)
    expect(loeschen('ATR 42/72')).toBeInTheDocument()
    expect(loeschen('CL30')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hinzufügen: Muster' })).toBeInTheDocument()
  })

  it('der Loeschknopf hat 44 px Flaeche (h-11 w-11)', () => {
    render(<Liste start={['CL30']} />)
    expect(loeschen('CL30')).toHaveClass('h-11', 'w-11')
  })
})

describe('ChipListe — Fokus nach dem Loeschen (A11Y-04)', () => {
  it('geht auf den naechsten Loeschknopf', async () => {
    const nutzer = userEvent.setup()
    render(<Liste start={['ATR 42/72', 'CL30', 'EMB505']} />)
    loeschen('CL30').focus()
    await nutzer.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(['ATR 42/72', 'EMB505'])
    expect(loeschen('EMB505')).toHaveFocus()
  })

  it('beim letzten Eintrag auf den vorigen', async () => {
    const nutzer = userEvent.setup()
    render(<Liste start={['ATR 42/72', 'CL30']} />)
    await nutzer.click(loeschen('CL30'))
    expect(loeschen('ATR 42/72')).toHaveFocus()
  })

  it('ohne Nachbarn ins Eingabefeld', async () => {
    const nutzer = userEvent.setup()
    render(<Liste start={['CL30']} />)
    await nutzer.click(loeschen('CL30'))
    expect(onChange).toHaveBeenCalledWith([])
    expect(eingabe()).toHaveFocus()
  })

  it('ueberspringt feste Eintraege — sie haben keinen Knopf', async () => {
    const nutzer = userEvent.setup()
    render(<Liste start={['Safety', 'General']} fest={['General']} />)
    await nutzer.click(loeschen('Safety'))
    expect(eingabe()).toHaveFocus()
  })
})

describe('ChipListe — feste Eintraege (TEC-09)', () => {
  it('ein fester Eintrag hat keinen Loeschknopf, der Hinweis steht darunter', () => {
    render(<Liste start={['General', 'Safety']} fest={['General']} festHinweis="General bleibt." />)
    expect(screen.queryByRole('button', { name: 'Löschen: General' })).toBeNull()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(loeschen('Safety')).toBeInTheDocument()
    expect(screen.getByText('General bleibt.')).toBeInTheDocument()
  })

  it('ohne festen Eintrag in der Liste kein Hinweis', () => {
    render(<Liste start={['Safety']} fest={[]} festHinweis="General bleibt." />)
    expect(screen.queryByText('General bleibt.')).toBeNull()
  })
})

describe('ChipListe — abgelehntes Entfernen nennt den Grund (VERW-18)', () => {
  it('pruefeEntfernen: Meldung, kein onChange, Fokus bleibt auf dem Knopf', async () => {
    const nutzer = userEvent.setup()
    render(<Liste start={['CL30', 'EMB505']} pruefeEntfernen={(v) => (v === 'CL30' ? 'CL30 bleibt: noch verwendet von 2 Gruppen.' : null)} />)
    await nutzer.click(loeschen('CL30'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('CL30 bleibt: noch verwendet von 2 Gruppen.')
    expect(loeschen('CL30')).toHaveFocus()
    // Die Meldung gilt dem Loeschen, nicht der Eingabe.
    expect(eingabe()).not.toHaveAttribute('aria-invalid')
    // Was frei ist, geht weiter — und die Meldung verschwindet.
    await nutzer.click(loeschen('EMB505'))
    expect(onChange).toHaveBeenCalledWith(['CL30'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('vorAenderung = false bricht ab (Rueckfrage verneint)', async () => {
    const nutzer = userEvent.setup()
    const vorAenderung = vi.fn(() => false)
    render(<Liste start={['example.test']} vorAenderung={vorAenderung} />)
    await nutzer.click(loeschen('example.test'))
    expect(vorAenderung).toHaveBeenCalledWith([], 'example.test')
    expect(onChange).not.toHaveBeenCalled()
    expect(loeschen('example.test')).toHaveFocus()
  })
})

describe('ChipListe — Hinzufuegen', () => {
  it('normalisiert, verwirft Doppelte und beanstandet Ungueltiges am Feld', async () => {
    const nutzer = userEvent.setup()
    const normalisiere = (roh: string) => (roh.includes(' ') ? null : roh.toLowerCase())
    render(<Liste start={['a.test']} normalisiere={normalisiere} ungueltig="Ungültig." />)
    await nutzer.type(eingabe(), 'B.Test{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['a.test', 'b.test'])
    expect(eingabe()).toHaveValue('')
    // Bewusst geaendert (Nachtrag VERW#3): Eine Dublette verschwand vorher
    // still aus dem Feld. Jetzt bleibt der Entwurf stehen, und die Meldung
    // nennt den vorhandenen Eintrag.
    await nutzer.type(eingabe(), 'A.TEST{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('„a.test“ steht schon in der Liste.')
    await nutzer.clear(eingabe())
    await nutzer.type(eingabe(), 'x y')
    await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen: Muster' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ungültig.')
    expect(eingabe()).toHaveAttribute('aria-invalid', 'true')
    expect(eingabe()).toHaveValue('x y')
    await nutzer.type(eingabe(), 'z')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('nimmt keinen Wert doppelt, der sich nur in Schreibweise unterscheidet — und sagt es (Nachtrag VERW#3)', async () => {
    // Ohne `normalisiere` (Muster, Kategorien): „CL30" und „cl30" standen
    // vorher beide in der Liste — fuer die Musterregel zwei Muster.
    const nutzer = userEvent.setup()
    render(<Liste start={['ATR 42/72', 'CL30']} />)
    await nutzer.type(eingabe(), 'cl30{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('„CL30“ steht schon in der Liste.')
    expect(eingabe()).toHaveAttribute('aria-invalid', 'true')
    expect(eingabe()).toHaveValue('cl30')
    // Exakt gleich: dieselbe Meldung statt eines stillen Leerens.
    await nutzer.clear(eingabe())
    await nutzer.type(eingabe(), 'ATR 42/72{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('„ATR 42/72“ steht schon in der Liste.')
    // Weitertippen nimmt die Meldung zurueck; ein neuer Wert geht durch.
    await nutzer.clear(eingabe())
    expect(screen.queryByRole('alert')).toBeNull()
    await nutzer.type(eingabe(), 'C560 XLS+{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['ATR 42/72', 'CL30', 'C560 XLS+'])
    expect(eingabe()).toHaveValue('')
  })

  it('leere Eingabe tut nichts; abgelehnte Rueckfrage laesst den Entwurf stehen', async () => {
    const nutzer = userEvent.setup()
    render(<Liste start={[]} vorAenderung={() => false} />)
    await nutzer.click(screen.getByRole('button', { name: 'Hinzufügen: Muster' }))
    await nutzer.type(eingabe(), 'CL30{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(eingabe()).toHaveValue('CL30')
  })
})

describe('ChipListe — Texte des Grading-Bereichs (Audit 11/2026, UID-18)', () => {
  it('ohne formularTexte folgt die Liste der Oberflaeche', () => {
    render(<Liste start={['CL30']} />)
    expect(eingabe()).toHaveAttribute('placeholder', 'Hinzufügen …')
  })

  it('mit formularTexte englisch, auch bei deutscher Oberflaeche', async () => {
    // Die Verteilerlisten der Grading-Konfiguration zeigten „Hinzufügen …"
    // im sonst englischen Bereich; Knopfnamen und die Doppelt-Meldung kamen
    // ebenfalls aus dem deutschen Bundle.
    const nutzer = userEvent.setup()
    render(<Liste start={['ops@example.test']} formularTexte />)
    expect(eingabe()).toHaveAttribute('placeholder', 'Add …')
    expect(screen.getByRole('button', { name: 'Delete: ops@example.test' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Löschen/ })).toBeNull()
    await nutzer.type(eingabe(), 'OPS@example.test')
    await nutzer.click(screen.getByRole('button', { name: 'Add a value to Muster' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('“ops@example.test” is already in this list.')
  })
})
