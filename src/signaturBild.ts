/**
 * Rechenregeln der Unterschriftsflaeche (`SignaturePad`) — ohne Canvas,
 * damit sie auf Ebene 1 pruefbar sind.
 *
 * Audit 11/2026, MOB-01 (critical): Die Vollbild-Unterschrift loeschte den
 * Strich und speicherte ein verfaelschtes Bild im gesperrten Nachweis.
 * Jede Groessenaenderung leerte das Canvas, das Neuzeichnen kam asynchron
 * mit veralteten Massen (Doppelfigur im kleinen Feld), im Querformat blieb
 * gar nichts — gespeichert wurde trotzdem ein transparentes PNG, und das
 * Formular hielt es fuer eine Unterschrift. Gespeichert wurde ausserdem das
 * ganze hohe Canvas: Im Nachweis stand die Unterschrift winzig.
 *
 * Daraus die Regeln hier: Tinte wird GEZAEHLT, nicht vermutet
 * (`tintenRahmen`); was gespeichert wird, ist auf die Tinte zugeschnitten
 * und hat ein festes Seitenverhaeltnis (`zuschnitt`); bei einer
 * Groessenaenderung wandert der vorhandene Inhalt synchron mit
 * (`umsetzen`), statt neu geladen zu werden.
 */

export interface Groesse {
  w: number
  h: number
}

export interface Box extends Groesse {
  x: number
  y: number
}

/**
 * Seitenverhaeltnis des gespeicherten Bilds. Die Anzeige im Nachweis ist ein
 * breites, flaches Feld (h-24 ueber die halbe Kartenbreite, im Druck 54 px
 * hoch); ein hochkantes Bild stand dort als Briefmarke.
 */
export const VERHAELTNIS = 3

/** Rand um die Tinte beim Zuschnitt, in CSS-Pixeln. */
export const RAND_PX = 12

/** Hoehe des getippten Unterschriftsbilds (CSS-Pixel vor Pixeldichte). */
export const BILD_H = 160
/** Mindestbreite des getippten Bilds; ein laengerer Vermerk verbreitert es. */
export const BILD_W = 600
/** Innenabstand des getippten Bilds links und rechts. */
export const TEXT_RAND = 20

/**
 * Schriftgroesse des Vermerks „Typed signature" im getippten Bild.
 *
 * Audit 11/2026, SIG-01: 13 px auf 160 px Bildhoehe — im Druck (54 px hoch,
 * dazu `zoom: 0.75` in index.css) blieben davon rund 2,5 pt, auf Papier war
 * nicht zu erkennen, dass die Unterschrift getippt war. Der Planer schlug
 * 24 px vor; nachgerechnet ergibt das erst 4,6 pt. Fuer die zugesagten
 * 6 pt (forms:typedHint: „marked as ‚Typed signature' with a timestamp")
 * braucht es ein Fuenftel der Bildhoehe — siehe `vermerkImDruckPt`.
 */
export const VERMERK_PX = 32

/** Hoehe der Unterschriftsbilder im Ausdruck (`main img` in index.css). */
export const DRUCK_BILD_PX = 54
/** Verkleinerung des Druckbereichs (`--druck-zoom`, `main { zoom }` in index.css). */
export const DRUCK_ZOOM = 0.75

/** Wie gross der Vermerk auf Papier ankommt, in Punkt (1 CSS-px = 0,75 pt). */
export function vermerkImDruckPt(): number {
  return (VERMERK_PX / BILD_H) * DRUCK_BILD_PX * DRUCK_ZOOM * 0.75
}

/** Breite des getippten Bilds: mindestens `BILD_W`, sonst so breit, dass der
 *  Vermerk in voller Groesse passt — verkleinert waere er wieder unleserlich. */
export function typedBildBreite(vermerkBreite: number): number {
  return Math.max(BILD_W, Math.ceil(vermerkBreite) + 2 * TEXT_RAND)
}

/**
 * Text des Vermerks — mit dem Zeitpunkt, den der Aufrufer uebergibt.
 *
 * Der Stempel kam aus `new Date()` und ignorierte damit den Zeitversatz der
 * Sandbox (SIG-01). UTC bleibt, ausdruecklich benannt: Ein eingebrannter
 * Stempel ohne Zone waere mehrdeutig. Das Datum folgt der Schreibweise der
 * App (DD.MM.YYYY, siehe datum.ts).
 */
export function typedSignatureVermerk(ms: number): string {
  const d = new Date(ms)
  const z = (n: number) => String(n).padStart(2, '0')
  return `Typed signature · ${z(d.getUTCDate())}.${z(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())} UTC`
}

/**
 * Ist dieser Bildpunkt Tinte? Deckend genug UND dunkel genug: Die gezeichnete
 * Flaeche ist transparent mit dunkler Tinte, das getippte Bild weiss mit
 * dunkler Schrift — beides muss dieselbe Antwort geben. Halbtransparente
 * Kantenpixel zaehlen mit, sonst schnitte der Zuschnitt die Striche an.
 */
export function istTinte(r: number, g: number, b: number, a: number): boolean {
  return a >= 40 && (r + g + b) / 3 < 200
}

/**
 * Rechteck um alle Tintenpunkte (RGBA-Daten wie aus `getImageData`) — oder
 * `null`, wenn es keine gibt. `null` heisst: KEINE Unterschrift, auch wenn
 * ein PNG entstuende.
 */
export function tintenRahmen(data: ArrayLike<number>, w: number, h: number): Box | null {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    const zeile = y * w * 4
    for (let x = 0; x < w; x++) {
      const i = zeile + x * 4
      if (!istTinte(data[i], data[i + 1], data[i + 2], data[i + 3])) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

const klemmen = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/**
 * Ausschnitt um die Tinte: `rand` ringsum, an den Bildkanten beschnitten.
 *
 * Mit `verhaeltnis` wird der Ausschnitt danach auf dieses Seitenverhaeltnis
 * erweitert (Breite : Hoehe), um die Tinte zentriert. Passt er ins Bild,
 * wird er hineingeschoben; ist das Bild dafuer zu klein, ragt er
 * gleichmaessig ueber — der Rest des gespeicherten Bilds bleibt transparent.
 */
export function zuschnitt(box: Box, w: number, h: number, rand: number, verhaeltnis?: number): Box {
  const x0 = Math.max(0, box.x - rand)
  const y0 = Math.max(0, box.y - rand)
  const x1 = Math.min(w, box.x + box.w + rand)
  const y1 = Math.min(h, box.y + box.h + rand)
  let cw = x1 - x0
  let ch = y1 - y0
  if (!verhaeltnis) return { x: x0, y: y0, w: cw, h: ch }
  if (cw / ch < verhaeltnis) cw = Math.round(ch * verhaeltnis)
  else ch = Math.round(cw / verhaeltnis)
  const lage = (mitte: number, laenge: number, grenze: number) => {
    const start = mitte - laenge / 2
    return Math.round(laenge <= grenze ? klemmen(start, 0, grenze - laenge) : start)
  }
  return { x: lage((x0 + x1) / 2, cw, w), y: lage((y0 + y1) / 2, ch, h), w: cw, h: ch }
}

/**
 * Quelle zentriert und unverzerrt in das Ziel einpassen („contain").
 * `maxSkala` begrenzt das Vergroessern — ein Strich wird beim Umzug in eine
 * groessere Flaeche nicht dicker und unscharf aufgeblasen.
 */
export function einpassen(quelle: Groesse, ziel: Groesse, maxSkala = Infinity): Box {
  if (quelle.w <= 0 || quelle.h <= 0) return { x: ziel.w / 2, y: ziel.h / 2, w: 0, h: 0 }
  const f = Math.min(ziel.w / quelle.w, ziel.h / quelle.h, maxSkala)
  const w = quelle.w * f
  const h = quelle.h * f
  return { x: (ziel.w - w) / 2, y: (ziel.h - h) / 2, w, h }
}

/**
 * Wohin der vorhandene Inhalt wandert, wenn sich die Flaeche aendert.
 *
 * Passt er in voller Groesse, bleibt er gleich gross und behaelt seine
 * relative Lage — beim Umbruch einer Kopfzeile verschiebt sich die
 * Unterschrift so um Bruchteile eines Pixels statt zu springen, und beim
 * Wechsel ins Vollbild steht sie dort, wo sie war. Passt er nicht (zurueck
 * aus dem Vollbild, Drehen), wird er unverzerrt verkleinert und zentriert.
 */
export function umsetzen(alt: Groesse, neu: Groesse, inhalt: Box): Box {
  if (inhalt.w > neu.w || inhalt.h > neu.h || alt.w <= 0 || alt.h <= 0) {
    return einpassen(inhalt, neu, 1)
  }
  const mitteX = ((inhalt.x + inhalt.w / 2) / alt.w) * neu.w
  const mitteY = ((inhalt.y + inhalt.h / 2) / alt.h) * neu.h
  return {
    x: klemmen(mitteX - inhalt.w / 2, 0, neu.w - inhalt.w),
    y: klemmen(mitteY - inhalt.h / 2, 0, neu.h - inhalt.h),
    w: inhalt.w,
    h: inhalt.h,
  }
}
