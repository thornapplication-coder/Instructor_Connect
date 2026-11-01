import { describe, expect, it } from 'vitest'
import { befund, dok, eingabe } from './beispiel'

describe('Referenz-Datenstand der Export-Tests (Spez. v1.1 Kap. 10.8)', () => {
  it('enthält die geforderten Grenzfälle: Umlaute, Anführungszeichen, Formelanfang, Zeilenumbruch, Paketbefund, To verify', () => {
    const e = eingabe()
    const texte = e.befunde.flatMap((b) => [b.text, ...b.fundstellen.map((f) => f.auszug)]).join('\n')
    expect(texte).toMatch(/[äöüß]/)
    expect(texte).toMatch(/"/)
    expect(texte).toMatch(/^=/m)
    expect(texte).toMatch(/\n/)
    expect(e.befunde.some((b) => !e.dokumente.some((d) => d.id === b.dokId))).toBe(true)
    expect(e.befunde.some((b) => b.verifizierung === 'To verify')).toBe(true)
    expect(dok('x', 'session').sha256).toHaveLength(64)
    expect(befund('A', 'x').status).toBe('Open')
    expect(eingabe({ laufnummer: 3 }).laufnummer).toBe(3)
  })
})
