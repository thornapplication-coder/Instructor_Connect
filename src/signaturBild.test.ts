import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BILD_H,
  BILD_W,
  DRUCK_BILD_PX,
  DRUCK_ZOOM,
  einpassen,
  istTinte,
  tintenRahmen,
  TEXT_RAND,
  typedBildBreite,
  typedSignatureVermerk,
  umsetzen,
  VERHAELTNIS,
  vermerkImDruckPt,
  VERMERK_PX,
  zuschnitt,
} from './signaturBild'

/**
 * Audit 11/2026, MOB-01 (critical) und SIG-01. Die Faelle stehen fuer das,
 * was der Pruefer im Querformat gemessen hat: Strich weg, transparentes PNG
 * gespeichert, und das Formular strich „The instructor signature is
 * missing." aus der Liste — ein Nachweis mit LEERER Unterschrift.
 */

/** RGBA-Bild w × h, transparent; `tinte` setzt dunkle, deckende Punkte. */
function bild(w: number, h: number, tinte: [number, number][] = [], grund: [number, number, number, number] = [0, 0, 0, 0]) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) d.set(grund, i * 4)
  for (const [x, y] of tinte) d.set([0x16, 0x25, 0x3d, 255], (y * w + x) * 4)
  return d
}

describe('tintenRahmen — Tinte wird gezaehlt, nicht vermutet', () => {
  it('ein leeres, transparentes Bild hat keine Tinte — also keine Unterschrift', () => {
    expect(tintenRahmen(bild(40, 20), 40, 20)).toBeNull()
  })

  it('ein weisses Blatt ebenso (getippte Flaeche ohne Schrift)', () => {
    expect(tintenRahmen(bild(40, 20, [], [255, 255, 255, 255]), 40, 20)).toBeNull()
  })

  it('ein einzelner Punkt ergibt eine 1×1-Box', () => {
    expect(tintenRahmen(bild(40, 20, [[7, 3]]), 40, 20)).toEqual({ x: 7, y: 3, w: 1, h: 1 })
  })

  it('umfasst alle Punkte', () => {
    expect(tintenRahmen(bild(40, 20, [[5, 9], [30, 2], [12, 15]]), 40, 20)).toEqual({ x: 5, y: 2, w: 26, h: 14 })
  })

  it('zaehlt dunkle Schrift auf weissem Grund, aber keine fast durchsichtigen Reste', () => {
    expect(istTinte(0x47, 0x55, 0x69, 255)).toBe(true) // Vermerk-Grau
    expect(istTinte(255, 255, 255, 255)).toBe(false) // Papier
    expect(istTinte(0x16, 0x25, 0x3d, 20)).toBe(false) // Hauch einer Kante
    expect(istTinte(0x16, 0x25, 0x3d, 128)).toBe(true) // halbdeckende Kante zaehlt
  })
})

describe('zuschnitt', () => {
  it('legt den Rand ringsum an', () => {
    expect(zuschnitt({ x: 50, y: 40, w: 20, h: 10 }, 200, 100, 5)).toEqual({ x: 45, y: 35, w: 30, h: 20 })
  })

  it('beschneidet den Rand an den Bildkanten', () => {
    expect(zuschnitt({ x: 2, y: 1, w: 20, h: 10 }, 200, 100, 5)).toEqual({ x: 0, y: 0, w: 27, h: 16 })
    expect(zuschnitt({ x: 190, y: 95, w: 10, h: 5 }, 200, 100, 5)).toEqual({ x: 185, y: 90, w: 15, h: 10 })
  })

  it('erweitert auf 3:1 — eine hohe Unterschrift wird breiter, nicht gestaucht', () => {
    const z = zuschnitt({ x: 90, y: 20, w: 20, h: 40 }, 400, 100, 0, VERHAELTNIS)
    expect(z.w / z.h).toBeCloseTo(3, 1)
    expect(z.h).toBe(40)
    // um die Tinte zentriert
    expect(z.x + z.w / 2).toBeCloseTo(100, 0)
  })

  it('erweitert eine sehr breite Unterschrift in der Hoehe', () => {
    const z = zuschnitt({ x: 10, y: 40, w: 300, h: 20 }, 400, 200, 0, VERHAELTNIS)
    expect(z).toEqual({ x: 10, y: 0, w: 300, h: 100 })
  })

  it('schiebt den Ausschnitt ins Bild, wenn er dort Platz hat', () => {
    // Tinte am linken Rand — der 3:1-Ausschnitt beginnt bei 0, statt links ueberzustehen.
    const z = zuschnitt({ x: 0, y: 0, w: 10, h: 30 }, 400, 30, 0, VERHAELTNIS)
    expect(z).toEqual({ x: 0, y: 0, w: 90, h: 30 })
  })

  it('ragt gleichmaessig ueber, wenn das Bild selbst zu schmal ist', () => {
    // Hochkantes Vollbild: 3:1 passt nicht hinein — die Unterschrift bleibt mittig.
    const z = zuschnitt({ x: 40, y: 100, w: 20, h: 100 }, 100, 400, 0, VERHAELTNIS)
    expect(z).toEqual({ x: -100, y: 100, w: 300, h: 100 })
  })
})

describe('einpassen', () => {
  it('haelt das Seitenverhaeltnis und zentriert', () => {
    expect(einpassen({ w: 300, h: 100 }, { w: 600, h: 400 })).toEqual({ x: 0, y: 100, w: 600, h: 200 })
    expect(einpassen({ w: 100, h: 100 }, { w: 300, h: 150 })).toEqual({ x: 75, y: 0, w: 150, h: 150 })
  })

  it('vergroessert nicht ueber maxSkala', () => {
    expect(einpassen({ w: 100, h: 50 }, { w: 400, h: 400 }, 1)).toEqual({ x: 150, y: 175, w: 100, h: 50 })
  })

  it('liefert fuer eine leere Quelle einen Punkt in der Mitte statt NaN', () => {
    expect(einpassen({ w: 0, h: 10 }, { w: 40, h: 20 })).toEqual({ x: 20, y: 10, w: 0, h: 0 })
  })
})

describe('umsetzen — der Inhalt wandert mit, statt zu verschwinden', () => {
  it('ein Pixel weniger Hoehe verschiebt die Unterschrift kaum (Umbruch der Kopfzeile)', () => {
    const z = umsetzen({ w: 366, h: 558 }, { w: 366, h: 557 }, { x: 40, y: 200, w: 280, h: 120 })
    expect(z.w).toBe(280)
    expect(z.h).toBe(120)
    expect(Math.abs(z.x - 40)).toBeLessThan(1)
    expect(Math.abs(z.y - 200)).toBeLessThan(1)
  })

  it('zurueck aus dem Vollbild: unverzerrt verkleinert und zentriert', () => {
    const z = umsetzen({ w: 820, h: 290 }, { w: 340, h: 144 }, { x: 100, y: 50, w: 600, h: 180 })
    expect(z.w / z.h).toBeCloseTo(600 / 180, 5)
    expect(z.w).toBeLessThanOrEqual(340)
    expect(z.h).toBeLessThanOrEqual(144)
    expect(z.x).toBeCloseTo((340 - z.w) / 2, 5)
  })

  it('ins Vollbild: gleiche Groesse, gleiche relative Lage', () => {
    const z = umsetzen({ w: 340, h: 144 }, { w: 820, h: 290 }, { x: 70, y: 22, w: 200, h: 100 })
    expect(z).toMatchObject({ w: 200, h: 100 })
    expect(z.x + 100).toBeCloseTo((170 / 340) * 820, 5)
    expect(z.y + 50).toBeCloseTo((72 / 144) * 290, 5)
  })

  it('haelt den Inhalt in der Flaeche, auch wenn seine relative Lage hinausfiele', () => {
    const z = umsetzen({ w: 400, h: 400 }, { w: 400, h: 200 }, { x: 0, y: 300, w: 100, h: 100 })
    expect(z.y + z.h).toBeLessThanOrEqual(200)
  })

  it('ohne bekannte alte Flaeche: zentriert', () => {
    expect(umsetzen({ w: 0, h: 0 }, { w: 100, h: 100 }, { x: 0, y: 0, w: 20, h: 10 })).toEqual({ x: 40, y: 45, w: 20, h: 10 })
  })
})

describe('Vermerk „Typed signature" (SIG-01)', () => {
  it('nennt den uebergebenen Zeitpunkt — samt Zeitversatz der Sandbox — in UTC', () => {
    expect(typedSignatureVermerk(Date.UTC(2026, 10, 1, 23, 30))).toBe('Typed signature · 01.11.2026 23:30 UTC')
    expect(typedSignatureVermerk(Date.UTC(2026, 0, 5, 7, 4))).toBe('Typed signature · 05.01.2026 07:04 UTC')
  })

  it('ist im Bild gross genug: mindestens 0,14 der Bildhoehe', () => {
    expect(VERMERK_PX / BILD_H).toBeGreaterThanOrEqual(0.14)
  })

  it('kommt auf Papier mit mindestens 6 pt an', () => {
    expect(vermerkImDruckPt()).toBeGreaterThanOrEqual(6)
  })

  it('rechnet mit den Druckmassen, die index.css wirklich setzt', () => {
    // Aendert jemand die Druckgroesse der Unterschriften, faellt die
    // 6-pt-Zusage hier auf — nicht erst auf Papier.
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
    const img = css.match(/main img \{[^}]*?\bheight:\s*(\d+)px/)
    // Der Zoom steht als Variable, seit der Blattrand durch ihn geteilt wird
    // (GRD-15/PRT-01) — geprueft werden der Wert UND dass main ihn benutzt.
    const zoom = css.match(/--druck-zoom:\s*([\d.]+)/)
    const mainZoom = css.match(/main \{[^}]*?zoom:\s*([^;]+);/)
    expect(Number(img?.[1])).toBe(DRUCK_BILD_PX)
    expect(Number(zoom?.[1])).toBe(DRUCK_ZOOM)
    expect(mainZoom?.[1].trim()).toBe('var(--druck-zoom)')
  })

  it('das Bild wird breiter statt den Vermerk zu verkleinern', () => {
    expect(typedBildBreite(100)).toBe(BILD_W)
    expect(typedBildBreite(700.2)).toBe(701 + 2 * TEXT_RAND)
  })
})
