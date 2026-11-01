import { describe, expect, it } from 'vitest'
import { pdfjsLaden } from './pdfjsLaden'

describe('pdfjsLaden', () => {
  it('setzt eine LOKALE Worker-Adresse, kein CDN — und lädt nur einmal', async () => {
    const a = await pdfjsLaden()
    const lib = a as unknown as { GlobalWorkerOptions: { workerSrc: string } }
    expect(lib.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs/)
    expect(lib.GlobalWorkerOptions.workerSrc).not.toMatch(/^https?:/)
    expect(await pdfjsLaden()).toBe(a)
  })
})
