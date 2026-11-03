import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import type { Group } from '../types'
import { GroupNameField } from './Admin'

/**
 * Gruppe umbenennen (Ebene 2, Audit 11/2026, VERW-04).
 *
 * Nachgestellt: In „Ground Training" am Ende „ Vienna Base" getippt,
 * gespeichert war „Ground TrainingViennaBase"; alles markieren und
 * Ruecktaste liess den Wert stehen. Das Feld schrieb bei jedem Tastendruck
 * in den Store, und der beschnitt und verwarf. Die Regel selbst prueft
 * gruppen.test.ts — hier geht es darum, WANN sie greift.
 *
 * Der Store ist ersetzt: Das Feld liest nur die Gruppen und ruft renameGroup.
 */

const store = vi.hoisted(() => ({ renameGroup: vi.fn(), groups: [] as Group[] }))

vi.mock('../store', async (original) => {
  const echt = await original<typeof import('../store')>()
  return {
    ...echt,
    useStore: () => ({ state: { groups: store.groups }, renameGroup: store.renameGroup }),
  }
})

const gruppe = (id: string, name: string): Group => ({ id, name, purpose: '', adminIds: [], memberIds: [], retention: null })

beforeEach(async () => {
  await i18n.changeLanguage('de')
  store.renameGroup.mockReset()
  store.groups = [gruppe('g-ground', 'Ground Training'), gruppe('g-defects', 'SIM Defects')]
})

const feld = () => screen.getByRole('textbox', { name: 'Gruppenname' })

describe('Gruppenname mit Entwurf', () => {
  it('laesst einen Mehrwortnamen normal tippen und speichert erst beim Verlassen', async () => {
    const nutzer = userEvent.setup()
    render(<GroupNameField group={store.groups[0]} />)
    await nutzer.click(feld())
    await nutzer.type(feld(), ' Vienna Base')
    expect(feld()).toHaveValue('Ground Training Vienna Base')
    // Kein Schreiben je Tastendruck — genau das hat die Leerzeichen gefressen.
    expect(store.renameGroup).not.toHaveBeenCalled()
    await nutzer.tab()
    expect(store.renameGroup).toHaveBeenCalledTimes(1)
    expect(store.renameGroup).toHaveBeenCalledWith('g-ground', 'Ground Training Vienna Base')
  })

  it('laesst sich leeren und neu tippen; Enter speichert', async () => {
    const nutzer = userEvent.setup()
    render(<GroupNameField group={store.groups[0]} />)
    await nutzer.clear(feld())
    expect(feld()).toHaveValue('')
    await nutzer.type(feld(), 'Ops Team{Enter}')
    expect(store.renameGroup).toHaveBeenCalledWith('g-ground', 'Ops Team')
  })

  it('weist einen leeren Namen beim Verlassen ab, nennt den Grund und steht wieder auf dem alten', async () => {
    const nutzer = userEvent.setup()
    render(<GroupNameField group={store.groups[0]} />)
    await nutzer.clear(feld())
    await nutzer.tab()
    expect(store.renameGroup).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('nicht leer')
    expect(feld()).toHaveValue('Ground Training')
  })

  it('weist einen vergebenen Namen ab — ein doppelter Zwischenstand schluckt aber keine Tastendruecke', async () => {
    const nutzer = userEvent.setup()
    render(<GroupNameField group={store.groups[0]} />)
    await nutzer.clear(feld())
    // „SIM Defects" ist unterwegs kurz vergeben — das Tippen geht trotzdem weiter.
    await nutzer.type(feld(), 'SIM Defects 2')
    expect(feld()).toHaveValue('SIM Defects 2')
    await nutzer.clear(feld())
    await nutzer.type(feld(), 'sim defects')
    await nutzer.tab()
    expect(store.renameGroup).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('gibt es bereits')
    expect(feld()).toHaveValue('Ground Training')
  })

  it('verwirft den Entwurf mit Escape', async () => {
    const nutzer = userEvent.setup()
    render(<GroupNameField group={store.groups[0]} />)
    await nutzer.type(feld(), ' X{Escape}')
    expect(feld()).toHaveValue('Ground Training')
  })
})
