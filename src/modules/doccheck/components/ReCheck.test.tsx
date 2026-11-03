import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { registriereDocCheckTexte } from '../i18n'
import { auftraege, blattWaehlen, listeLesen, nachLauf, type ReCheckSitzung } from '../recheck/ablauf'
import { befundPruefen } from '../recheck/pruefen'
import { sbxFl01, SBX_FL_01_NAME } from '../benchmark/sbx'
import { LEER, setzen, type SitzungsDok } from '../sitzung'
import { ReCheckMobil, ReCheckTab } from './ReCheck'

/**
 * Ebene 2: Re-Check-Ansichten mit vorbereiteter Sitzung (Audit 11/2026).
 *
 * DC-08: Die Zeilen der Vorschlagstabelle gingen nur per Maus auf; im
 * tbody gab es kein einziges fokussierbares Element, Freigabe, Begründung
 * und „Seite anzeigen" waren per Tastatur unerreichbar.
 * DC-09: Die mobile Karte bestätigte „Begründung erforderlich" mit einem
 * Knopf ohne Begründung und zeigte die geforderte Korrektur nicht.
 *
 * Store und Viewer sind ersetzt — die Ansicht braucht nur Nutzer, Uhr und
 * die Audit-Aktion; der Viewer lädt pdf.js.
 */

const s = vi.hoisted(() => ({ audit: vi.fn(), oeffnen: vi.fn(), jetzt: Date.UTC(2026, 10, 2, 9) }))

vi.mock('../../../store', () => ({
  useStore: () => ({
    state: { users: [{ id: 'u-alex', name: 'Alex Beispiel' }] },
    currentUser: { id: 'u-alex' },
    now: () => s.jetzt,
    docCheckRecheckConfirm: s.audit,
    docCheckSettings: { features: {} },
  }),
}))
vi.mock('./Viewer', () => ({ useViewer: () => s.oeffnen }))

const dok = (id: string, typ: string, titel: string): SitzungsDok => ({
  id, rolle: 'review', name: `${id}.docx`, groesse: 1, status: 'fertig', felder: { typ, titel, nummer: '', revision: '1', datum: '', rang: '' }, erkannt: [],
  z: { meta: { titel }, zeichen: 10, ocrSeiten: 0, seitenQuelle: 'approx' } as never,
})
const docs = [dok('tm', 'TM', 'Training Manual'), dok('apx', '', 'Appendix 4')]
const LISTE = 'No.;Area;Finding;Recommendation;Status\n1;TM;"Delete ""Revsion""";Fix spelling;Closed\n2;APX 4;"Delete ""TBD""";;Open\n3;OSD;"Delete ""x""";;Open\n'
const paket = [
  { id: 'tm', titel: 'Training Manual', pages: [{ index: 1, text: 'The Revsion history.' }] },
  { id: 'apx', titel: 'Appendix 4', pages: [{ index: 1, text: 'Nothing here.' }] },
]
const ablage = { getItem: () => null, setItem: () => {} }

async function sitzung(f: (r: ReCheckSitzung) => ReCheckSitzung = (r) => r) {
  const roh = blattWaehlen('fl.csv', await listeLesen('fl.csv', new TextEncoder().encode(LISTE)), 0, docs, ablage)
  const r = nachLauf(roh, auftraege(roh, ablage).map((a) => befundPruefen(a.befund, a.ziel, paket)), docs.map((d) => `${d.id}:10:0:approx`).join('|')).r
  act(() => setzen(() => ({ ...LEER, docs, recheck: f(r) })))
}

beforeAll(async () => {
  registriereDocCheckTexte(i18n)
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  s.audit.mockReset()
  s.jetzt = Date.UTC(2026, 10, 2, 9)
})
afterEach(() => act(() => setzen(() => LEER)))

describe('Re-Check-Tabelle per Tastatur (Audit 11/2026, DC-08)', () => {
  it('jede Zeile hat einen Knopf; per Tab erreichbar, Enter klappt auf, Status und Begründung folgen', async () => {
    await sitzung()
    const user = userEvent.setup()
    render(<ReCheckTab />)
    const knoepfe = screen.getAllByRole('button', { name: /aufklappen/ })
    expect(knoepfe).toHaveLength(3)
    expect(knoepfe[0]).toHaveAttribute('aria-expanded', 'false')
    expect(knoepfe[0]).toHaveAttribute('aria-controls', 'rc-1')

    // Nur mit der Tastatur: Tab bis zum ersten Zeilenknopf — vorher sprang Tab über die Tabelle hinweg
    for (let i = 0; i < 80 && document.activeElement !== knoepfe[0]; i++) await user.tab()
    expect(knoepfe[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(knoepfe[0]).toHaveAttribute('aria-expanded', 'true')
    const bereich = document.getElementById('rc-1')!
    expect(bereich).not.toBeNull()

    // Weiter mit Tab: „Seite anzeigen" (Rest im TM), dann die Status-Auswahl der Freigabe
    const status = within(bereich).getByRole('combobox', { name: 'Status' })
    for (let i = 0; i < 10 && document.activeElement !== status; i++) await user.tab()
    expect(status).toHaveFocus()
    // Abweichender Status → Begründung ist Pflicht und das nächste Feld
    await user.selectOptions(status, 'resolved')
    await user.tab()
    const begruendung = within(bereich).getByRole('textbox', { name: 'Begründung' })
    expect(begruendung).toHaveFocus()
    const knopf = within(bereich).getByRole('button', { name: /bestätigen/ })
    expect(knopf).toBeDisabled()
    await user.keyboard('Wording changed in Rev 2')
    await user.tab()
    expect(knopf).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(s.audit).toHaveBeenCalledWith('fl.csv', [{ ref: '1', zeile: 2, status: 'Resolved' }])
  })

  it('Spaltenänderung behält die Bestätigungen; der Hinweis „veraltet" erscheint (DC-02)', async () => {
    await sitzung((r) => ({ ...r, bestaetigt: { 2: { status: 'resolved', von: 'u-alex', at: 1, vorschlag: 'resolved' } } }))
    const user = userEvent.setup()
    render(<ReCheckTab />)
    expect(screen.queryByText(/Paket oder Zuordnung haben sich/)).toBeNull()
    const frage = vi.spyOn(window, 'confirm')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team-Kommentar' }), '4')
    // keine Bestätigung geht verloren → keine Rückfrage
    expect(frage).not.toHaveBeenCalled()
    expect(screen.getByText(/Paket oder Zuordnung haben sich/)).toBeInTheDocument()
    expect(screen.getAllByText('von Alex Beispiel')).toHaveLength(1)
    // Befundspalte weg: die Bestätigung ginge verloren → erst fragen; „Abbrechen" ändert nichts
    frage.mockReturnValueOnce(false)
    await user.selectOptions(screen.getByRole('combobox', { name: /Befundtext/ }), '')
    expect(frage).toHaveBeenCalledWith('Dabei geht 1 Bestätigung verloren. Trotzdem fortfahren?')
    expect(screen.getAllByText('von Alex Beispiel')).toHaveLength(1)
    frage.mockRestore()
  })
})

describe('Re-Check-Ziele (Audit 11/2026, DC-05, DC-02)', () => {
  it('ein Listenwert für mehrere Dokumente steht als „Mehrere", nicht als das erste; eine Wahl macht den Stand veraltet', async () => {
    await sitzung((r) => ({ ...r, ziele: { ...r.ziele, TM: { art: 'dok', ids: ['tm', 'apx'] } } }))
    const user = userEvent.setup()
    render(<ReCheckTab />)
    // vorher: „Training Manual" — geprüft wurde aber auch gegen den Anhang
    const tm = screen.getByRole('combobox', { name: 'Prüfen gegen: TM' })
    expect(tm).toHaveValue('mehrere')
    expect(within(tm).getByRole('option', { selected: true })).toHaveTextContent('Mehrere: Training Manual, Appendix 4')
    expect(screen.getByRole('combobox', { name: 'Prüfen gegen: APX 4' })).toHaveValue('apx')
    expect(screen.queryByText(/Paket oder Zuordnung haben sich/)).toBeNull()
    await user.selectOptions(tm, 'tm')
    expect(tm).toHaveValue('tm')
    expect(within(tm).queryByRole('option', { name: /^Mehrere/ })).toBeNull()
    expect(screen.getByText(/Paket oder Zuordnung haben sich/)).toBeInTheDocument()
  })
})

describe('Rückschreiben erst nach erneutem Prüfen (Gegenprüfung Audit 11/2026, DC-02)', () => {
  it('veraltete Vorschläge: Knopf gesperrt mit Grund; aktueller Stand: frei', async () => {
    const daten = await sbxFl01()
    const stand = docs.map((d) => `${d.id}:10:0:approx`).join('|')
    const roh = blattWaehlen(SBX_FL_01_NAME, await listeLesen(SBX_FL_01_NAME, daten), 0, docs, ablage, daten)
    const r = nachLauf(roh, auftraege(roh, ablage).map((a) => befundPruefen(a.befund, a.ziel, paket)), stand).r
    const z = r.befunde[0].zeile
    const bestaetigt = { ...r, bestaetigt: { [z]: { status: r.ergebnisse!.find((e) => e.zeile === z)!.status, von: 'u-alex', at: 1, vorschlag: r.ergebnisse!.find((e) => e.zeile === z)!.status } } }
    // Ziel nach dem Lauf geändert: Ergebnisse und Bestätigung stehen noch (DC-02), aber sie galten dem alten Ziel
    act(() => setzen(() => ({ ...LEER, docs, recheck: { ...bestaetigt, geprueftGegen: undefined } })))
    const { unmount } = render(<ReCheckTab />)
    const knopf = await screen.findByRole('button', { name: 'Neue Excel-Datei erzeugen' })
    // erst, wenn die Werteliste gelesen ist — vorher ist der Knopf ohnehin gesperrt
    await vi.waitFor(() => expect(within(screen.getByRole('combobox', { name: '„Behoben“ schreibt' })).getAllByRole('option').length).toBeGreaterThan(1))
    expect(knopf).toBeDisabled()
    expect(screen.getByText(/Erst erneut prüfen/)).toBeInTheDocument()
    unmount()
    act(() => setzen(() => ({ ...LEER, docs, recheck: bestaetigt })))
    render(<ReCheckTab />)
    // frei, sobald die Werteliste der Liste gelesen ist
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Neue Excel-Datei erzeugen' })).toBeEnabled())
    expect(screen.queryByText(/Erst erneut prüfen/)).toBeNull()
  })
})

describe('Re-Check mobil (Audit 11/2026, DC-09)', () => {
  it('„Begründung erforderlich" nur mit Begründung; die geforderte Korrektur steht auf der Karte', async () => {
    await sitzung((r) => ({ ...r, ergebnisse: r.ergebnisse!.map((e) => (e.zeile === 1 ? { ...e, status: 'justify' as const } : e)) }))
    const user = userEvent.setup()
    render(<ReCheckMobil />)
    // Empfehlung unter dem Befund — vorher stand nur „Delete "Revsion""
    expect(screen.getByText('Fix spelling')).toBeInTheDocument()
    // Kein einfacher Knopf für die justify-Zeile: Freigabe mit Begründungsfeld, gesperrt bis 5 Zeichen
    const feld = screen.getByRole('textbox', { name: 'Begründung' })
    const knopf = screen.getByRole('button', { name: /„Begründung erforderlich“ bestätigen/ })
    expect(knopf).toBeDisabled()
    await user.type(feld, 'Accepted by CMM')
    await user.click(knopf)
    expect(s.audit).toHaveBeenCalledWith('fl.csv', [{ ref: '1', zeile: 2, status: 'Closed – justification required' }])
    // bestätigt: Die Karte verschwindet aus „Nur unbestätigte", ohne Filter steht sie mit Namen da
    expect(screen.queryByRole('textbox', { name: 'Begründung' })).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Nur unbestätigte Vorschläge' }))
    expect(screen.getByText('von Alex Beispiel')).toBeInTheDocument()
  })
})

describe('Re-Check-Datum in Ortszeit (Audit 11/2026, EXM-01)', () => {
  // Nachgestellt wie beim Prüfer: Wien, 02.11.2026 00:30 — in UTC noch der 01.11.
  let vorher: string | undefined
  beforeEach(() => {
    vorher = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
    s.jetzt = Date.parse('2026-11-01T23:30:00Z')
  })
  afterEach(() => {
    if (vorher === undefined) delete process.env.TZ
    else process.env.TZ = vorher
    vi.restoreAllMocks()
  })

  it('Remark in der Zeile und die CSV tragen den Tag des Nutzers, nicht den UTC-Tag', async () => {
    await sitzung()
    const user = userEvent.setup()
    render(<ReCheckTab />)
    await user.click(screen.getAllByRole('button', { name: /aufklappen/ })[0])
    expect(document.getElementById('rc-1')!.textContent).toContain('(Re-Check 02.11.2026)')
    expect(document.getElementById('rc-1')!.textContent).not.toContain('01.11.2026')

    // CSV: Dateiname und Remark-Spalte — vorher „…_recheck_2026-11-01.csv" und „(Re-Check 01.11.2026)"
    const blobs: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => (blobs.push(b as Blob), 'blob:x'))
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const namen: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      namen.push(this.download)
    })
    await user.click(screen.getByRole('button', { name: /CSV/ }))
    expect(namen).toEqual(['fl_recheck_2026-11-02.csv'])
    // jsdom kennt Blob.text() nicht
    const csv = await new Promise<string>((ok) => {
      const f = new FileReader()
      f.onload = () => ok(f.result as string)
      f.readAsText(blobs[0])
    })
    expect(csv).toContain('(Re-Check 02.11.2026)')
    expect(csv).not.toContain('01.11.2026')
  })

  it('mobil: derselbe Tag im Remark der Karte', async () => {
    await sitzung()
    const user = userEvent.setup()
    render(<ReCheckMobil />)
    await user.click(screen.getAllByRole('button', { name: 'Remark' })[0])
    expect(document.body.textContent).toContain('(Re-Check 02.11.2026)')
    expect(document.body.textContent).not.toContain('01.11.2026')
  })
})
