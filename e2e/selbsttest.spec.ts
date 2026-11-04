import { anmelden, expect, gespeicherterStand, SUPERADMIN, test } from './hilfen'

/**
 * Selbsttest im echten Browser (Ebene 3): was Ebene 1 und 2 nur mit
 * Attrappen sehen — der Service Worker beantwortet SELBSTTEST, die Uhr wird
 * gegen den Date-Kopf des Servers geprüft, die DocCheck-Probe läuft durch
 * den echten Worker mit pdf.js, die Fingerabdrücke werden mit WebCrypto
 * nachgerechnet.
 */

const zeile = (page: import('@playwright/test').Page, name: string) => page.locator('main li').filter({ has: page.getByText(name, { exact: true }) })

test('frisches Gerät: kein Fehler — Start ohne Netz, Uhr und DocCheck-Probe in Ordnung', async ({ page }) => {
  await anmelden(page)
  // Einmal neu laden: Erst dann steuert der Service Worker die Seite.
  await page.reload()
  await page.getByRole('button', { name: 'Selbsttest', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Selbsttest' })).toBeVisible()
  const kopf = page.locator('main [role=status]')
  await expect(kopf).not.toContainText('Prüfung läuft', { timeout: 60_000 })
  await expect(kopf).not.toContainText('Fehler')
  await expect(zeile(page, 'Start ohne Netz')).toContainText(/Alle \d+ Dateien liegen bereit/)
  await expect(zeile(page, 'Uhrzeit')).toContainText('Stimmt mit der Serverzeit überein.')
  await expect(zeile(page, 'Programmstand')).toContainText(/Aktuell \(Stand [0-9a-f]{8}\)/)
  await expect(zeile(page, 'Dokumente lesen')).toContainText(/Testdokument in \d+ ms gelesen/)
  await expect(zeile(page, 'Prüfregeln')).toContainText('Der eingebaute Testfehler wurde gefunden.')
  await expect(zeile(page, 'Fingerabdrücke')).toBeVisible()
})

test('ein nach der Unterschrift verändertes Formular wird gefunden und ist mit einem Klick offen', async ({ page }) => {
  await anmelden(page)
  // Die App schreibt erst, wenn sich etwas ändert — ein Tag Zeitraffer der
  // Sandbox ist die kleinste echte Änderung. Danach liegt der Stand in
  // IndexedDB, und es gibt etwas zu verändern.
  await page.getByRole('button', { name: '+1 T', exact: true }).click()
  await expect.poll(async () => (await gespeicherterStand(page).catch(() => null))?.gradingRecords?.length ?? 0, { timeout: 20_000 }).toBeGreaterThan(0)
  // Wie eine nachträgliche Änderung am gespeicherten Datensatz: ein Abdruck,
  // der nicht zum Inhalt passt — direkt in IndexedDB, am Store vorbei.
  const id = await page.evaluate(
    () =>
      new Promise<string>((fertig, fehler) => {
        const rq = indexedDB.open('instructor-connect', 1)
        rq.onerror = () => fehler(rq.error)
        rq.onsuccess = () => {
          const db = rq.result
          const g = db.transaction('kv').objectStore('kv').get('aaa-state')
          g.onerror = () => fehler(g.error)
          g.onsuccess = () => {
            try {
              const roh = JSON.parse(g.result as string)
              const stand = roh.state ?? roh
              const r = stand.gradingRecords.find((x: { status: string }) => x.status === 'signed')
              r.contentHash = '0'.repeat(64)
              r.hashVersion = 4
              const tx = db.transaction('kv', 'readwrite')
              tx.objectStore('kv').put(JSON.stringify(roh), 'aaa-state')
              tx.oncomplete = () => fertig(r.id)
              tx.onerror = () => fehler(tx.error)
            } catch (e) {
              fehler(e)
            }
          }
        }
      }),
  )
  await page.goto('./#/selbsttest')
  await page.reload()
  await expect(zeile(page, 'Fingerabdrücke')).toContainText('1 Formular wurde nach der Unterschrift verändert.', { timeout: 60_000 })
  await expect(page.locator('main [role=status]')).toContainText('1 Fehler')
  await page.getByRole('button', { name: `Formular ${id} öffnen` }).click()
  await expect(page).toHaveURL(new RegExp(`#/grading/${id}$`))
})

test('Kurz-Check beim Start: falsche Geräteuhr → roter Streifen → die Seite nennt die Abweichung', async ({ page }) => {
  await page.clock.setFixedTime(new Date(Date.now() - 3 * 86_400_000))
  await anmelden(page, SUPERADMIN, { startPruefung: true })
  const streifen = page.getByRole('alert').filter({ hasText: 'Selbsttest: Auf diesem Gerät stimmt etwas nicht.' })
  await expect(streifen).toBeVisible({ timeout: 30_000 })
  await streifen.getByRole('button', { name: 'Ansehen' }).click()
  await expect(streifen).toHaveCount(0)
  await expect(zeile(page, 'Uhrzeit')).toContainText('Die Uhr des Geräts geht 3 Tage nach.', { timeout: 60_000 })
})
