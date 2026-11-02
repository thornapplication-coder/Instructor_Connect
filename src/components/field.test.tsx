import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Ankreuzknopf, Button, Field, inputCls, selectCls } from './ui'

/**
 * Bausteine des Grading-Formulars, an denen Barrierefreiheitsbefunde hingen
 * (Audit 11/2026). Ebene 2: Rolle, Name und Zustand sind Eigenschaften des
 * DOM; ob der Fokus im Bild bleibt, braucht Layout und steht in e2e/.
 */

describe('Field als Gruppe (GTY-12, A11Y-16)', () => {
  it('trägt id, Rolle, Namen, Beanstandung und Beschreibung an der Gruppe', () => {
    render(
      <>
        <Field label="Training Device *" group id="field-trainingDevice" invalid describedBy="feld-fehler">
          <button>FFS</button>
        </Field>
        <p id="feld-fehler">Required field missing: Training Device</p>
      </>,
    )
    const gruppe = screen.getByRole('group', { name: 'Training Device *' })
    expect(gruppe).toHaveAttribute('id', 'field-trainingDevice')
    expect(gruppe).toHaveAttribute('aria-invalid', 'true')
    expect(gruppe).toHaveAccessibleDescription('Required field missing: Training Device')
    // Sprungziel auch ohne Knopf — aber nicht in der Tab-Reihenfolge.
    expect(gruppe).toHaveAttribute('tabindex', '-1')
    // Sichtbar, nicht nur vorgelesen: Die Gruppe hat keinen Rand, die Beschriftung wird rot.
    expect(screen.getByText('Training Device *')).toHaveClass('text-danger')
  })

  it('ohne Beanstandung kein aria-invalid, ohne id kein tabindex', () => {
    render(
      <Field label="Event" group>
        <button>LOFT</button>
      </Field>,
    )
    const gruppe = screen.getByRole('group', { name: 'Event' })
    expect(gruppe).not.toHaveAttribute('aria-invalid')
    expect(gruppe).not.toHaveAttribute('tabindex')
    expect(screen.getByText('Event')).not.toHaveClass('text-danger')
    // Der Knopf behält seinen eigenen Namen (der Grund für `group`).
    expect(screen.getByRole('button', { name: 'LOFT' })).toBeInTheDocument()
  })

  it('als einzelnes Feld beschriftet das <label> das Bedienelement', () => {
    render(
      <Field label="Date *">
        <input />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Date *' })).toBeInTheDocument()
  })
})

describe('Eingabefelder zeigen ihre Beanstandung auch ohne Sprachausgabe (A11Y-16)', () => {
  it('roter Rand bei aria-invalid, an Text- und Auswahlfeldern', () => {
    // Die Meldung stand weit unten; das Feld selbst sah aus wie jedes andere.
    expect(inputCls).toContain('aria-[invalid=true]:border-danger')
    expect(selectCls).toContain('aria-[invalid=true]:border-danger')
  })
})

describe('Ankreuzknopf (A11Y-08)', () => {
  it('Zustand als aria-pressed, die Glyphe gehört nicht zum Namen', () => {
    const klick = vi.fn()
    render(
      <div role="group" aria-label="Trainee seat">
        <Ankreuzknopf an onClick={klick}>
          Left
        </Ankreuzknopf>
        <Ankreuzknopf an={false} onClick={klick}>
          Right
        </Ankreuzknopf>
      </div>,
    )
    // Vorher: „☒ Left" / „☐ Right", ohne pressed und ohne Gruppennamen.
    const gruppe = screen.getByRole('group', { name: 'Trainee seat' })
    expect(gruppe).toContainElement(screen.getByRole('button', { name: 'Left', pressed: true }))
    expect(screen.getByRole('button', { name: 'Right', pressed: false })).toHaveTextContent('☐ Right')
    fireEvent.click(screen.getByRole('button', { name: 'Right' }))
    expect(klick).toHaveBeenCalledTimes(1)
  })
})

describe('Button mit Symbol (A11Y-07)', () => {
  it('trägt seinen Namen über `label`', () => {
    render(
      <Button label="Add recipient">
        <svg aria-hidden />
      </Button>,
    )
    // Vorher angesagt als bloße „Schaltfläche".
    expect(screen.getByRole('button', { name: 'Add recipient' })).toBeInTheDocument()
  })
})
