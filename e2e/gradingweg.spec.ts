import { readFileSync } from 'node:fs'
import { formatDate } from '../src/datum'
import { BRIEFING_STD_MIN, DEBRIEFING_STD_MIN, formatDauer, parseDauer } from '../src/logbook'
import { anmelden, expect, gespeicherterStand, test, unterschreiben } from './hilfen'

/**
 * Der Grading-Weg als EIN Durchgang (Ebene 3) — Audit 11/2026,
 * R3-GRADINGWEG (Entscheidung des Nutzers vom 03.11.2026):
 *
 *   Formular → Pflichtfelder → Unterschriften → Absenden → Quittung →
 *   Liste und Ablage („completed: signed and sent") → Logbuch des
 *   Instruktors (mit Zeit) → Forms-CSV des Behördenexports.
 *
 * Die Teile lagen verstreut (formular.spec.ts bis zum Absenden, druck.spec.ts
 * ab der Ablage), und jeder Teil begann mit einem Stand, den der vorige nie
 * hergestellt hatte. Ob das abgesendete Blatt dort ankommt, wo der
 * Instruktor seine Stunden und die ATO ihren Nachweis sucht, sagte keiner
 * davon. Die Regeln dahinter prüft Ebene 1 (gradingRules, logbook,
 * gradingExport); hier, dass die Ansichten sie mit DEMSELBEN Blatt benutzen.
 *
 * Gesucht wird über Rollen, Beschriftungen und Sprungziele, nicht über das
 * Layout. Die Aussagen, um die es geht (Stand der Leiste, Ampel, Quittung,
 * Prüfvermerk, Exportknopf), kommen aus `forms.json` — eine neue
 * Formulierung bricht den Weg nicht, ein falscher Schlüssel schon. Briefing
 * und Debriefing kommen aus `src/logbook.ts`: Ändert sich die Regel, folgt
 * die Erwartung.
 */

const FORMS = JSON.parse(readFileSync(new URL('../src/i18n/forms.json', import.meta.url), 'utf8')) as {
  allDone: string
  traffic: { green: string }
  toast: { signedAndSent: string }
  fingerprintOk: string
  admin: { export_records: string }
}

/** Synthetischer Pilot, den es im Sandbox-Bestand nicht gibt. */
const PILOT = 'Greta Durchgang'
const PF = '01:30'
const PM = '01:30'

/** CSV nach RFC 4180 mit Semikolon (src/csv.ts), BOM vorneweg. */
function csvTabelle(text: string): string[][] {
  const zeilen: string[][] = []
  let zeile: string[] = []
  let feld = ''
  let inQ = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') {
        feld += '"'
        i++
      } else if (c === '"') inQ = false
      else feld += c
    } else if (c === '"') inQ = true
    else if (c === ';') {
      zeile.push(feld)
      feld = ''
    } else if (c === '\n') {
      zeile.push(feld.replace(/\r$/, ''))
      zeilen.push(zeile)
      zeile = []
      feld = ''
    } else feld += c
  }
  if (feld || zeile.length) zeilen.push([...zeile, feld])
  return zeilen
}

/**
 * Zeitpunkt in Wiener Ortszeit wie `formatDateTime` (DD.MM.YYYY HH:MM) —
 * unabhängig von der Zone der Maschine, auf der der Test läuft. Der Browser
 * rechnet in Wien (playwright.config.ts); stünde im Export UTC, fiele es
 * hier auf (R3-E2E-ZEITZONE).
 */
function wienerZeit(ms: number): string {
  const teile = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms)
  const p = Object.fromEntries(teile.map((x) => [x.type, x.value]))
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`
}

test('308A in einem Durchgang: absenden, quittiert, in Liste, Ablage, Logbuch und Behörden-CSV', async ({ page }) => {
  await anmelden(page)
  // Kein Plausibilitäts- oder Verlassen-Dialog auf dem ganzen Weg: Jede
  // Rückfrage hiesse, dass etwas als unvollständig oder unplausibel galt.
  const fragen: string[] = []
  page.on('dialog', (d) => {
    fragen.push(d.message())
    void d.dismiss()
  })

  // ── 1. Formular anlegen, Kopf ausfüllen ─────────────────────────────────
  await page.goto('/#/grading/new')
  await page.getByLabel('Form type').selectOption('308A')
  await page.getByRole('textbox', { name: 'Student name' }).fill(PILOT)
  const muster = page.getByLabel('Aircraft Type *')
  if (!(await muster.inputValue())) await muster.selectOption({ index: 1 })
  const event = page.getByLabel('Event *')
  if (!(await event.inputValue())) await event.selectOption({ index: 1 })
  const geraet = page.getByRole('group', { name: 'Training Device *' }).getByRole('button', { name: /FFS$/ })
  if ((await geraet.getAttribute('aria-pressed')) !== 'true') await geraet.click()
  await expect(geraet).toHaveAttribute('aria-pressed', 'true')
  // Vorbelegt: der Schulungstag in Ortszeit (lokalerTag).
  const datum = await page.getByLabel('Date *').inputValue()
  expect(datum).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  const flugzeug = await muster.inputValue()
  const ereignis = await event.inputValue()
  await page.getByRole('button', { name: /Continue to grading/ }).click()

  // ── 2. Bewerten: jede Kompetenz 3, Zusammenfassung, Ergebnis, Session ──
  const leiste = page.getByRole('region', { name: 'Form progress and send' })
  await expect(leiste).toBeVisible()
  const drei = page.getByRole('main').getByRole('button', { name: /: 3$/ })
  const kompetenzen = await drei.count()
  expect(kompetenzen, 'Kompetenzen des 308A').toBeGreaterThan(0)
  for (let i = 0; i < kompetenzen; i++) await drei.nth(i).click()
  await page.getByLabel('Positive aspects *').fill('Stable approaches, clear callouts')
  await page.getByLabel('Development areas *').fill('Workload management in the hold')
  await page.getByLabel('Summary *', { exact: true }).fill('Standard reached for the session')
  await page.getByRole('group', { name: 'Overall Result *' }).getByRole('button', { name: 'Competent', exact: true }).click()
  await page.getByRole('group', { name: 'Session status *' }).getByRole('button', { name: 'Completed', exact: true }).click()
  // Session-Daten — erst nach der Bewertung erfasst, sie tragen die Zeit ins Logbuch.
  await page.getByLabel('Flight Time PF *').selectOption(PF)
  await page.getByLabel('Flight Time PM *').selectOption(PM)

  // ── 3. Unterschriften: Instruktor, dann Pilot ───────────────────────────
  const flaechen = page.locator('#unterschriften canvas')
  await expect(flaechen).toHaveCount(2)
  await unterschreiben(page, flaechen.nth(0))
  await unterschreiben(page, flaechen.nth(1))

  // ── 4. Absenden → Quittung ──────────────────────────────────────────────
  // Leiste und Absendeprüfung sind EINE Liste (openItems): nichts mehr offen.
  await expect(leiste).toContainText(FORMS.allDone)
  const senden = leiste.getByRole('button', { name: /Complete and send/ })
  await expect(senden).toBeEnabled()
  await senden.click()
  // Die Quittung kommt erst, wenn der Stand geschrieben ist (R3-SPEICHERQUITTUNG)
  // — deshalb steht das Blatt danach OHNE Warten in IndexedDB.
  await expect(page.getByRole('status').filter({ hasText: FORMS.toast.signedAndSent })).toBeVisible()
  await expect(page).toHaveURL(/#\/grading$/)
  const gespeichert = await gespeicherterStand(page)
  const blatt = gespeichert.gradingRecords.find((r) => r.formTypeId === '308A' && r.trainees.some((tr) => tr.traineeName === PILOT))
  expect(blatt, 'abgesendetes Blatt in IndexedDB').toBeDefined()
  expect(blatt).toMatchObject({ status: 'signed', mailStatus: 'sent', authority: 'AT', sessionStatus: 'completed' })
  expect(blatt!.trainees[0].overall).toBe('competent')
  expect(blatt!.contentHash).toBeTruthy()
  expect(blatt!.signedAt).toBeGreaterThan(0)
  const instruktor = gespeichert.users.find((u) => u.id === blatt!.instructorId)!
  // Kein Entwurf bleibt zurück — sonst stünde „Draft · 308A" über dem Nachweis.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('aaa-draft-')))).toEqual([])

  // ── 5. Eigene Liste: grün, auch nach dem Neuladen ───────────────────────
  const zeile = page.getByRole('button', { name: `308A · ${PILOT} · ${formatDate(datum)}`, exact: true })
  // Die Karte ist der Rahmen um ihren Knopf (Card in ui.tsx): dort steht die Ampel.
  const ampelGruen = (knopf: typeof zeile) => knopf.locator('xpath=..').getByRole('img', { name: FORMS.traffic.green, exact: true })
  await expect(ampelGruen(zeile)).toBeVisible()
  await page.reload()
  await expect(ampelGruen(zeile)).toBeVisible()

  // ── 6. Logbuch des Instruktors: der Eintrag mit seiner Zeit ─────────────
  await page.goto('/#/logbook')
  await page.getByRole('textbox', { name: 'Pilot', exact: true }).fill(PILOT)
  const sessionMin = parseDauer(PF) + parseDauer(PM)
  const eintrag = page.getByRole('main').locator('section').filter({ hasText: PILOT })
  await expect(eintrag).toHaveCount(1)
  await expect(eintrag).toContainText(formatDate(datum))
  await expect(eintrag).toContainText('308A')
  await expect(eintrag).toContainText(flugzeug)
  await expect(eintrag).toContainText(formatDauer(BRIEFING_STD_MIN + sessionMin + DEBRIEFING_STD_MIN))
  await expect(eintrag).toContainText(`Session ${formatDauer(sessionMin)}`)

  // ── 7. Ablage der ATO: grün, Fingerabdruck geprüft ──────────────────────
  await page.goto('/#/admin/grading/records')
  const ablage = page.getByRole('button', { name: new RegExp(`^308A · ${PILOT} · `) })
  await expect(ampelGruen(ablage)).toBeVisible()

  // ── 8. Forms-CSV des Behördenexports: genau eine Zeile, dieselben Belege ─
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: FORMS.admin.export_records }).click()])
  const tabelle = csvTabelle(readFileSync((await download.path())!, 'utf8'))
  const kopf = tabelle.find((z) => z[0] === 'Form' && z.includes('Fingerprint'))!
  expect(kopf, 'Spaltenkopf der Forms-CSV').toBeDefined()
  const zeilen = tabelle
    .slice(tabelle.indexOf(kopf) + 1)
    .map((z) => Object.fromEntries(kopf.map((spalte, i) => [spalte, z[i] ?? ''])))
    .filter((z) => z.Trainee === PILOT)
  expect(zeilen).toHaveLength(1)
  expect(zeilen[0]).toMatchObject({
    Form: '308A',
    Instructor: instruktor.name,
    AircraftType: flugzeug,
    Device: 'FFS',
    Date: formatDate(datum),
    Event: ereignis,
    Overall: 'competent',
    Session: 'completed',
    Status: 'signed',
    Authority: 'AT',
    SignedAt: wienerZeit(blatt!.signedAt!),
    Fingerprint: blatt!.contentHash,
    FollowUpTo: '',
    Avg: '3,00',
  })

  // Das Blatt aus der Ablage geöffnet: Der Inhalt entspricht dem unterschriebenen.
  await ablage.click()
  await expect(page).toHaveURL(new RegExp(`#/grading/${blatt!.id}$`))
  await expect(page.getByText(FORMS.fingerprintOk)).toBeVisible()

  expect(fragen).toEqual([])
})
