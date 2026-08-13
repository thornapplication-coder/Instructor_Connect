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
 *  3. Die Aktion wirkt NUR auf das, was auf dem Bildschirm steht. Die Auswahl
 *     ist eine Liste von Kennungen und ueberlebt jeden Filterwechsel — ohne
 *     diese Regel traf „Deaktivieren" Konten, die in dem Moment niemand sah.
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
    const plan = planBulk(users, users, ['a', 'b', 'c'], { art: 'canGrade', wert: true }, 'admin')
    // b hat das Recht bereits — es waere gelogen, ihn mitzuzaehlen.
    expect(plan.patches.map((p) => p.id)).toEqual(['a', 'c'])
    expect(plan.patches[0].patch).toEqual({ canGrade: true })
  })

  it('laesst Nutzer ausserhalb der Auswahl unberuehrt', () => {
    const users = [u({ id: 'a' }), u({ id: 'b' })]
    expect(planBulk(users, users, ['a'], { art: 'isTrainee', wert: true }, 'admin').patches.map((p) => p.id)).toEqual(['a'])
  })

  it('deaktiviert einen nicht selbst — und sagt warum', () => {
    const users = [u({ id: 'ich', role: 'superadmin' }), u({ id: 'b', role: 'superadmin' })]
    const plan = planBulk(users, users, ['ich', 'b'], { art: 'active', wert: false }, 'ich')
    expect(plan.uebersprungen).toEqual([{ id: 'ich', grund: 'selbst' }])
    expect(plan.patches.map((p) => p.id)).toEqual(['b'])
  })

  it('schuetzt den letzten aktiven Superadmin', () => {
    // Sonst kaeme niemand mehr in die Verwaltung der ATO.
    const users = [u({ id: 'chef', role: 'superadmin' }), u({ id: 'alt', role: 'superadmin', active: false }), u({ id: 'm' })]
    const plan = planBulk(users, users, ['chef', 'm'], { art: 'active', wert: false }, 'anderer')
    expect(plan.uebersprungen).toEqual([{ id: 'chef', grund: 'letzterSuperadmin' }])
    expect(plan.patches.map((p) => p.id)).toEqual(['m'])
  })

  it('laesst einen Superadmin gehen, solange ein zweiter aktiv bleibt', () => {
    const users = [u({ id: 'a', role: 'superadmin' }), u({ id: 'b', role: 'superadmin' })]
    const plan = planBulk(users, users, ['a'], { art: 'active', wert: false }, 'anderer')
    expect(plan.uebersprungen).toEqual([])
    expect(plan.patches).toEqual([{ id: 'a', patch: { active: false } }])
  })

  it('schuetzt nur beim Deaktivieren, nicht beim Aktivieren', () => {
    const users = [u({ id: 'ich', role: 'superadmin', active: false })]
    expect(planBulk(users, users, ['ich'], { art: 'active', wert: true }, 'ich').patches).toEqual([
      { id: 'ich', patch: { active: true } },
    ])
  })

  it('haengt ein Muster an und haelt die Liste sortiert', () => {
    const users = [u({ id: 'a', aircraftTypes: ['CL30'] })]
    expect(planBulk(users, users, ['a'], { art: 'aircraft', wert: 'add', typ: 'C560 XLS+' }, 'admin').patches).toEqual([
      { id: 'a', patch: { aircraftTypes: ['C560 XLS+', 'CL30'] } },
    ])
  })

  it('zaehlt ein schon zugewiesenes Muster nicht noch einmal', () => {
    const users = [u({ id: 'a', aircraftTypes: ['CL30'] })]
    expect(planBulk(users, users, ['a'], { art: 'aircraft', wert: 'add', typ: 'CL30' }, 'admin').patches).toEqual([])
  })

  it('entfernt ein Muster und laesst die uebrigen stehen', () => {
    const users = [u({ id: 'a', aircraftTypes: ['C560 XLS+', 'CL30'] }), u({ id: 'b', aircraftTypes: ['CL30'] })]
    const plan = planBulk(users, users, ['a', 'b'], { art: 'aircraft', wert: 'remove', typ: 'C560 XLS+' }, 'admin')
    expect(plan.patches).toEqual([{ id: 'a', patch: { aircraftTypes: ['CL30'] } }])
  })

  it('kommt mit einem Nutzer ohne Musterliste zurecht', () => {
    // Altbestand: `aircraftTypes` konnte fehlen.
    const users = [{ ...u({ id: 'a' }), aircraftTypes: undefined } as unknown as User]
    expect(planBulk(users, users, ['a'], { art: 'aircraft', wert: 'add', typ: 'CL30' }, 'admin').patches).toEqual([
      { id: 'a', patch: { aircraftTypes: ['CL30'] } },
    ])
  })

  it('behandelt die Chat-Sperre wie einen Schalter, auch wenn sie fehlt', () => {
    const users = [u({ id: 'a' })]
    expect(planBulk(users, users, ['a'], { art: 'chatBlocked', wert: false }, 'admin').patches).toEqual([])
    expect(planBulk(users, users, ['a'], { art: 'chatBlocked', wert: true }, 'admin').patches).toEqual([
      { id: 'a', patch: { chatBlocked: true } },
    ])
  })

  it('setzt das Verzeichnisrecht gesammelt', () => {
    const users = [u({ id: 'a', canEditDirectory: true }), u({ id: 'b' })]
    expect(planBulk(users, users, ['a', 'b'], { art: 'canEditDirectory', wert: true }, 'admin').patches.map((p) => p.id)).toEqual(['b'])
  })

  describe('Nur was sichtbar ist', () => {
    const alle = [u({ id: 'a' }), u({ id: 'b' }), u({ id: 'c' })]

    it('laesst eine Auswahl liegen, die der Filter ausgeblendet hat', () => {
      // Der gemeldete Fall: 100 Member ausgewaehlt, dann auf „Superadmin"
      // gefiltert, dann „Deaktivieren". Sichtbar ist nur noch `a`.
      const plan = planBulk(alle, [alle[0]], ['a', 'b', 'c'], { art: 'isTrainee', wert: true }, 'admin')
      expect(plan.patches.map((p) => p.id)).toEqual(['a'])
      expect(plan.uebersprungen).toEqual([
        { id: 'b', grund: 'nichtSichtbar' },
        { id: 'c', grund: 'nichtSichtbar' },
      ])
    })

    it('tut gar nichts, wenn nichts Ausgewaehltes sichtbar ist', () => {
      const plan = planBulk(alle, [], ['a', 'b'], { art: 'active', wert: false }, 'admin')
      expect(plan.patches).toEqual([])
      expect(plan.uebersprungen.every((x) => x.grund === 'nichtSichtbar')).toBe(true)
    })

    it('zaehlt den letzten Superadmin am Gesamtbestand, nicht an der Ansicht', () => {
      /* Sonst kippte der Schutz mit dem Filter: Steht nur ein Superadmin in
         der gefilterten Liste, waehrend im Bestand ein zweiter aktiv ist,
         duerfte er gehen — und umgekehrt. Beide Richtungen hier. */
      const zwei = [u({ id: 's1', role: 'superadmin' }), u({ id: 's2', role: 'superadmin' }), u({ id: 'm' })]
      // Nur s1 sichtbar, s2 aktiv im Bestand → s1 darf gehen.
      expect(planBulk(zwei, [zwei[0]], ['s1'], { art: 'active', wert: false }, 'admin').patches).toEqual([
        { id: 's1', patch: { active: false } },
      ])
      // s2 im Bestand inaktiv → s1 ist der letzte, auch wenn die Ansicht das
      // nicht zeigt.
      const einer = [u({ id: 's1', role: 'superadmin' }), u({ id: 's2', role: 'superadmin', active: false })]
      expect(planBulk(einer, [einer[0]], ['s1'], { art: 'active', wert: false }, 'admin').uebersprungen).toEqual([
        { id: 's1', grund: 'letzterSuperadmin' },
      ])
    })

    it('haelt auch bei zwei gleichzeitig gewaehlten Superadmins einen aktiv', () => {
      /* Der Fall, dem die Tests oben auswichen: Sie setzten `eigeneId` auf
         jemanden ausserhalb der Liste. Hier ist der Bedienende einer der
         beiden — so wie im Betrieb, denn der Benutzerbereich steht nur
         Superadmins offen. Geprueft wird die Rechnung des Plans, nicht die
         zweite Sperre im Store. */
      const zwei = [u({ id: 'ich', role: 'superadmin' }), u({ id: 'kollege', role: 'superadmin' })]
      const plan = planBulk(zwei, zwei, ['ich', 'kollege'], { art: 'active', wert: false }, 'ich')
      expect(plan.uebersprungen).toEqual([{ id: 'ich', grund: 'selbst' }])
      // `kollege` faellt — der Bedienende selbst bleibt aktiv, die Verwaltung
      // damit erreichbar.
      expect(plan.patches).toEqual([{ id: 'kollege', patch: { active: false } }])
    })
  })
})
