import { describe, expect, it } from 'vitest'
import { planBulk } from './bulkUsers'
import type { User } from './types'

/**
 * An der Sammelbearbeitung haengen zwei Zusagen, die man beim Klicken nicht
 * sehen kann — deshalb stehen sie hier auf dem Pruefstand:
 *
 *  1. Der gemeldete Zaehler ist ehrlich: Gezaehlt wird, was sich WIRKLICH
 *     aendert. Zaehlte er die Auswahl, meldete „20 geaendert" auch dann
 *     Erfolg, wenn nur zwei betroffen waren — und die falsche Auswahl fiele
 *     niemandem auf.
 *  2. Man kann sich nicht aussperren: weder sich selbst noch den letzten
 *     aktiven Superadmin. Beides wird uebersprungen UND benannt; ein stilles
 *     Verweigern waere genauso schlecht wie ein stilles Ausfuehren.
 */

const u = (p: Partial<User> & { id: string }): User =>
  ({
    name: p.id,
    email: `${p.id}@aviationacademy.at`,
    phone: '',
    role: 'member',
    canEditDirectory: false,
    canGrade: false,
    isTrainee: false,
    aircraftTypes: [],
    active: true,
    ...p,
  }) as User

describe('Sammelbearbeitung', () => {
  it('zaehlt nur, was sich wirklich aendert', () => {
    const users = [u({ id: 'a', canGrade: false }), u({ id: 'b', canGrade: true }), u({ id: 'c', canGrade: false })]
    const plan = planBulk(users, ['a', 'b', 'c'], { art: 'canGrade', wert: true }, 'admin')
    // b hat das Recht bereits — es waere gelogen, ihn mitzuzaehlen.
    expect(plan.patches.map((p) => p.id)).toEqual(['a', 'c'])
    expect(plan.patches[0].patch).toEqual({ canGrade: true })
  })

  it('laesst Nutzer ausserhalb der Auswahl unberuehrt', () => {
    const users = [u({ id: 'a' }), u({ id: 'b' })]
    expect(planBulk(users, ['a'], { art: 'isTrainee', wert: true }, 'admin').patches.map((p) => p.id)).toEqual(['a'])
  })

  it('deaktiviert einen nicht selbst — und sagt warum', () => {
    const users = [u({ id: 'ich', role: 'superadmin' }), u({ id: 'b', role: 'superadmin' })]
    const plan = planBulk(users, ['ich', 'b'], { art: 'active', wert: false }, 'ich')
    expect(plan.uebersprungen).toEqual([{ id: 'ich', grund: 'selbst' }])
    expect(plan.patches.map((p) => p.id)).toEqual(['b'])
  })

  it('schuetzt den letzten aktiven Superadmin', () => {
    // Sonst kaeme niemand mehr in die Verwaltung der ATO.
    const users = [u({ id: 'chef', role: 'superadmin' }), u({ id: 'alt', role: 'superadmin', active: false }), u({ id: 'm' })]
    const plan = planBulk(users, ['chef', 'm'], { art: 'active', wert: false }, 'anderer')
    expect(plan.uebersprungen).toEqual([{ id: 'chef', grund: 'letzterSuperadmin' }])
    expect(plan.patches.map((p) => p.id)).toEqual(['m'])
  })

  it('laesst einen Superadmin gehen, solange ein zweiter aktiv bleibt', () => {
    const users = [u({ id: 'a', role: 'superadmin' }), u({ id: 'b', role: 'superadmin' })]
    const plan = planBulk(users, ['a'], { art: 'active', wert: false }, 'anderer')
    expect(plan.uebersprungen).toEqual([])
    expect(plan.patches).toEqual([{ id: 'a', patch: { active: false } }])
  })

  it('schuetzt nur beim Deaktivieren, nicht beim Aktivieren', () => {
    const users = [u({ id: 'ich', role: 'superadmin', active: false })]
    expect(planBulk(users, ['ich'], { art: 'active', wert: true }, 'ich').patches).toEqual([
      { id: 'ich', patch: { active: true } },
    ])
  })

  it('haengt ein Muster an und haelt die Liste sortiert', () => {
    const users = [u({ id: 'a', aircraftTypes: ['CL30'] })]
    expect(planBulk(users, ['a'], { art: 'aircraft', wert: 'add', typ: 'C560 XLS+' }, 'admin').patches).toEqual([
      { id: 'a', patch: { aircraftTypes: ['C560 XLS+', 'CL30'] } },
    ])
  })

  it('zaehlt ein schon zugewiesenes Muster nicht noch einmal', () => {
    const users = [u({ id: 'a', aircraftTypes: ['CL30'] })]
    expect(planBulk(users, ['a'], { art: 'aircraft', wert: 'add', typ: 'CL30' }, 'admin').patches).toEqual([])
  })

  it('entfernt ein Muster und laesst die uebrigen stehen', () => {
    const users = [u({ id: 'a', aircraftTypes: ['C560 XLS+', 'CL30'] }), u({ id: 'b', aircraftTypes: ['CL30'] })]
    const plan = planBulk(users, ['a', 'b'], { art: 'aircraft', wert: 'remove', typ: 'C560 XLS+' }, 'admin')
    expect(plan.patches).toEqual([{ id: 'a', patch: { aircraftTypes: ['CL30'] } }])
  })

  it('kommt mit einem Nutzer ohne Musterliste zurecht', () => {
    // Altbestand: `aircraftTypes` konnte fehlen.
    const users = [{ ...u({ id: 'a' }), aircraftTypes: undefined } as unknown as User]
    expect(planBulk(users, ['a'], { art: 'aircraft', wert: 'add', typ: 'CL30' }, 'admin').patches).toEqual([
      { id: 'a', patch: { aircraftTypes: ['CL30'] } },
    ])
  })

  it('behandelt die Chat-Sperre wie einen Schalter, auch wenn sie fehlt', () => {
    const users = [u({ id: 'a' })]
    expect(planBulk(users, ['a'], { art: 'chatBlocked', wert: false }, 'admin').patches).toEqual([])
    expect(planBulk(users, ['a'], { art: 'chatBlocked', wert: true }, 'admin').patches).toEqual([
      { id: 'a', patch: { chatBlocked: true } },
    ])
  })

  it('setzt das Verzeichnisrecht gesammelt', () => {
    const users = [u({ id: 'a', canEditDirectory: true }), u({ id: 'b' })]
    expect(planBulk(users, ['a', 'b'], { art: 'canEditDirectory', wert: true }, 'admin').patches.map((p) => p.id)).toEqual(['b'])
  })
})
