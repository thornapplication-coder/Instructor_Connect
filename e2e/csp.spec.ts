import { cspFuer } from '../src/csp'
import { cspAbweisungen, expect, test } from './hilfen'

/** Richtlinie als Tabelle: Anweisung → Quellen. */
const anweisungen = (csp: string) => Object.fromEntries(csp.split('; ').map((a) => [a.split(' ')[0], a.split(' ').slice(1).join(' ')]))

test('die ausgelieferte Seite trägt die CSP, und die Wache sieht, was sie abweist (Audit 11/2026, SEC-07)', async ({ browser, baseURL }) => {
  // Eigener Kontext: Hier SOLL eine Abweisung entstehen — die automatische
  // Wache des Standard-Kontexts ließe den Test daran scheitern.
  const context = await browser.newContext({ baseURL })
  const abgewiesen = await cspAbweisungen(context)
  try {
    const page = await context.newPage()
    await page.goto('/')
    // Gebaut, nicht in vite dev: Die Richtlinie steht als erstes im Kopf.
    // connect-src hängt am Backend (VITE_SUPABASE_URL) und bleibt außen vor.
    const meta = page.locator('head > meta:first-child[http-equiv="Content-Security-Policy"]')
    await expect(meta).toHaveCount(1)
    const { 'connect-src': _ist, ...ist } = anweisungen((await meta.getAttribute('content'))!)
    const { 'connect-src': _soll, ...soll } = anweisungen(cspFuer(null))
    expect(ist).toEqual(soll)

    // Gegenprobe der Wache: Ein eingeschleustes Inline-Skript und ein Abruf
    // nach außen laufen nicht, und beide Abweisungen kommen an. Bliebe die
    // Liste hier leer, prüfte die Wache in allen anderen Wegen ins Leere —
    // genau das war mit dem Suchwort „Refused to" der Fall.
    expect(abgewiesen).toEqual([])
    await page.evaluate(() => {
      const s = document.createElement('script')
      s.textContent = 'window.__icCsp = 1'
      document.head.append(s)
    })
    expect(await page.evaluate(() => (window as unknown as { __icCsp?: number }).__icCsp)).toBeUndefined()
    expect(await page.evaluate(() => fetch('https://example.org/abfluss').then(() => 'durch', () => 'gesperrt'))).toBe('gesperrt')
    await expect.poll(() => abgewiesen.filter((m) => m.startsWith('CSP-Verstoß:'))).toEqual(['CSP-Verstoß: script-src-elem inline', 'CSP-Verstoß: connect-src https://example.org/abfluss'])
  } finally {
    await context.close()
  }
})
