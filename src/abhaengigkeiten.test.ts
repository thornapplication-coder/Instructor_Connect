import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Ein Bundler für Build UND Tests (Audit 11/2026, CIG-05).
 *
 * Gebaut wurde mit Vite 5, getestet mit Vite 8: vitest brachte seine eigene
 * Fassung verschachtelt mit (`node_modules/vitest/node_modules/vite`), und
 * das React-Plugin lief in den Tests außerhalb seines Peer-Bereichs — mit
 * neun Warnzeilen je Lauf und ignorierten JSX-Optionen. Die Tests prüften
 * den Code damit durch eine andere Transform-Kette als die ausgelieferte.
 *
 * Gelesen wird das Lockfile, weil `npm ci` genau diesen Stand installiert.
 * Wer eine Abhängigkeit hebt, die wieder eine eigene Vite-Fassung verlangt,
 * sieht es hier — nicht erst an einer Abweichung zwischen Test und Build.
 */
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')) as {
  packages: Record<string, { version?: string; peerDependencies?: Record<string, string> }>
}
const pakete = lock.packages

/** Erfüllt `version` einen Bereich aus `^X.Y.Z`-Alternativen (die Form, die hier vorkommt)? */
function imBereich(version: string, bereich: string): boolean {
  const [ma, mi, pa] = version.split('.').map(Number)
  return bereich.split('||').some((alt) => {
    const m = alt.trim().match(/^\^(\d+)\.(\d+)\.(\d+)$/)
    if (!m) throw new Error(`Bereich nicht auswertbar: ${alt}`)
    const [a, b, c] = m.slice(1).map(Number)
    return ma === a && (mi > b || (mi === b && pa >= c))
  })
}

describe('Werkzeugkette (Audit 11/2026, CIG-05)', () => {
  it('genau eine Vite-Fassung im Lockfile, keine verschachtelte', () => {
    const vite = Object.keys(pakete).filter((p) => p === 'node_modules/vite' || p.endsWith('/node_modules/vite'))
    expect(vite).toEqual(['node_modules/vite'])
  })

  it('jedes Paket, das Vite als Peer verlangt, liegt mit der installierten Fassung im Bereich', () => {
    const vite = pakete['node_modules/vite'].version!
    const ausserhalb = Object.entries(pakete)
      .filter(([, p]) => p.peerDependencies?.vite)
      .filter(([, p]) => !imBereich(vite, p.peerDependencies!.vite))
      .map(([name, p]) => `${name} verlangt ${p.peerDependencies!.vite}`)
    expect(ausserhalb).toEqual([])
    // Die Prüfung muss überhaupt etwas finden — sonst prüft sie ins Leere.
    expect(Object.keys(pakete).filter((p) => pakete[p].peerDependencies?.vite)).toContain('node_modules/@vitejs/plugin-react')
  })

  it('Bereichsprüfung', () => {
    expect(imBereich('7.3.7', '^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0')).toBe(true)
    expect(imBereich('8.2.1', '^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0')).toBe(false)
    expect(imBereich('4.1.0', '^4.2.0')).toBe(false)
    expect(imBereich('4.2.1', '^4.2.3')).toBe(false)
    expect(() => imBereich('7.0.0', '>=7')).toThrow('nicht auswertbar')
  })
})
