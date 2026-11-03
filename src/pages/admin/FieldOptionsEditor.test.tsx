import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import type { FormField } from '../../types'
import { FieldOptionsEditor } from './FieldOptionsEditor'

/**
 * Auswahlwerte der Grading-Konfiguration (Ebene 2, Audit 11/2026,
 * GRD-17/A11Y-02).
 *
 * Nachgestellt: In „AAA Neusiedl" End gedrückt und „XY" getippt — gespeichert
 * war „AAA NeusiedlX", der Fokus lag auf <body>. Der Wert war zugleich der
 * React-Schlüssel, jeder Tastendruck hängte das Feld neu ein. Felder ohne
 * Namen, Löschknöpfe ohne Namen und 12 px groß.
 */

const onChange = vi.fn()

const feld = (options: string[]): FormField => ({ key: 'location', label: 'Location', type: 'select', options, required: false })

function Editor({ start }: { start: string[] }) {
  const [options, setOptions] = useState(start)
  return (
    <FieldOptionsEditor
      field={feld(options)}
      onChange={(v) => {
        onChange(v)
        setOptions(v)
      }}
    />
  )
}

const wert = (n: number) => screen.getByRole('textbox', { name: `Location: value ${n}` })
const loeschen = (v: string) => screen.getByRole('button', { name: `Delete: ${v}` })

beforeEach(async () => {
  await i18n.changeLanguage('de')
  onChange.mockReset()
})

describe('FieldOptionsEditor — umbenennen in einem Zug', () => {
  it('tippt durchgehend weiter, der Fokus bleibt im Feld', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['AAA Neusiedl', 'LOWW']} />)
    const f = wert(1)
    await nutzer.type(f, 'XY')
    expect(f).toHaveValue('AAA NeusiedlXY')
    expect(document.activeElement).toBe(f)
    // Übernommen wird erst beim Verlassen — kein Speichern je Zeichen.
    expect(onChange).not.toHaveBeenCalled()
    await nutzer.tab()
    expect(onChange).toHaveBeenLastCalledWith(['AAA NeusiedlXY', 'LOWW'])
  })

  it('übernimmt mit Enter und behält den Fokus', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['AAA Neusiedl', 'LOWW']} />)
    const f = wert(2)
    await nutzer.type(f, 'G{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['AAA Neusiedl', 'LOWWG'])
    expect(wert(2)).toHaveValue('LOWWG')
    expect(document.activeElement).toBe(wert(2))
  })

  it('Escape verwirft den Entwurf', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['LOWW']} />)
    await nutzer.type(wert(1), 'X{Escape}')
    expect(wert(1)).toHaveValue('LOWW')
    await nutzer.tab()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('lehnt eine Dublette ab, sagt warum und stellt den Wert wieder her', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['AAA Neusiedl', 'LOWW']} />)
    await nutzer.clear(wert(2))
    await nutzer.type(wert(2), 'aaa neusiedl{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('“AAA Neusiedl” is already in this list.')
    expect(wert(2)).toHaveValue('LOWW')
  })

  it('lehnt einen leeren Wert ab', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['LOWW']} />)
    await nutzer.clear(wert(1))
    await nutzer.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('A value cannot be empty')
    expect(wert(1)).toHaveValue('LOWW')
  })
})

describe('FieldOptionsEditor — Namen und Trefferflächen', () => {
  it('jedes Feld und jeder Löschknopf trägt einen Namen, der Knopf 44 px', () => {
    render(<Editor start={['AAA Neusiedl', 'LOWW']} />)
    expect(wert(1)).toHaveValue('AAA Neusiedl')
    expect(loeschen('AAA Neusiedl')).toHaveClass('h-11', 'w-11')
    expect(screen.getByRole('button', { name: /Delete: LOWW/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a value to Location' })).toBeInTheDocument()
  })

  it('löscht genau den Eintrag und lässt den Fokus auf dem Knopf derselben Stelle', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['A', 'B', 'C']} />)
    await nutzer.click(loeschen('A'))
    expect(onChange).toHaveBeenLastCalledWith(['B', 'C'])
    expect(document.activeElement).toBe(loeschen('B'))
  })

  it('nach dem letzten Eintrag geht der Fokus ins Eingabefeld statt auf <body>', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['A', 'B']} />)
    await nutzer.click(loeschen('B'))
    expect(onChange).toHaveBeenLastCalledWith(['A'])
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Add a value to Location' }))
  })
})

describe('FieldOptionsEditor — hinzufügen', () => {
  it('fügt an und leert das Feld', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['LOWW']} />)
    await nutzer.type(screen.getByRole('textbox', { name: 'Add a value to Location' }), 'LOWG{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['LOWW', 'LOWG'])
    expect(screen.getByRole('textbox', { name: 'Add a value to Location' })).toHaveValue('')
  })

  it('lehnt eine Dublette ab und lässt die Eingabe stehen', async () => {
    const nutzer = userEvent.setup()
    render(<Editor start={['LOWW']} />)
    const neu = screen.getByRole('textbox', { name: 'Add a value to Location' })
    await nutzer.type(neu, 'loww')
    await nutzer.click(screen.getByRole('button', { name: 'Add a value to Location' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(neu).toHaveValue('loww')
    expect(screen.getByRole('alert')).toHaveTextContent('“LOWW” is already in this list.')
  })

  it('zeigt das Muster nicht als Liste — es wird zentral gepflegt', () => {
    render(<FieldOptionsEditor field={{ key: 'aircraftType', label: 'Aircraft Type', type: 'select', options: ['CL30'], required: true }} onChange={onChange} />)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('FieldOptionsEditor — Platzhalter englisch wie der Bereich (Audit 11/2026, UID-18)', () => {
  it('zeigt bei deutscher Oberfläche „Add …", nicht „Hinzufügen …"', () => {
    // beforeEach stellt die Oberfläche auf Deutsch. Der Platzhalter kam als
    // einziger Text aus dem Oberflächen-Bundle und stand deutsch zwischen
    // englischen Beschriftungen.
    render(<Editor start={['LOWW']} />)
    expect(screen.getByRole('textbox', { name: 'Add a value to Location' })).toHaveAttribute('placeholder', 'Add …')
  })
})
