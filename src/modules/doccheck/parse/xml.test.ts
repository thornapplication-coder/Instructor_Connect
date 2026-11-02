import { describe, expect, it } from 'vitest'
import { entitaeten, ohneSteuerzeichen, texteIn, xmlEreignisse, xmlZeichen } from './xml'

describe('XML-Ereignisstrom', () => {
  it('liefert Tags mit Attributen, leere Tags und Text', () => {
    const e = [...xmlEreignisse('<?xml version="1.0"?><a x="1" y=\'2\'><b/>Text &amp; mehr<!-- weg --><![CDATA[<roh>]]></a>')]
    expect(e).toEqual([
      { typ: 'auf', name: 'a', attr: { x: '1', y: '2' }, leer: false },
      { typ: 'auf', name: 'b', attr: {}, leer: true },
      { typ: 'zu', name: 'b' },
      { typ: 'text', text: 'Text & mehr' },
      { typ: 'text', text: '<roh>' },
      { typ: 'zu', name: 'a' },
    ])
  })

  it('dekodiert benannte und numerische Entitäten', () => {
    expect(entitaeten('&lt;&gt;&quot;&apos;&#65;&#x42;')).toBe('<>"\'AB')
  })

  it('texteIn sammelt je Element den Text der Textelemente, Tab und Umbruch als Leerzeichen', () => {
    const xml = '<w:p><w:r><w:t>Hallo</w:t><w:tab/><w:t>Welt</w:t></w:r></w:p><w:p><w:r><w:t>zwei</w:t><w:br/></w:r></w:p>'
    expect(texteIn(xml, 'w:p')).toEqual(['Hallo Welt', 'zwei'])
  })

  it('ungültige Zeichenreferenz wird Ersatzzeichen, statt das Dokument abzubrechen (Sicherheitsprüfung)', () => {
    expect(entitaeten('a&#x110000;b&#65;')).toBe('a\uFFFDbA')
  })
})


describe('Linear auch bei präparierten Teilen (Audit 11/2026, SEC-01)', () => {
  const dauer = (f: () => unknown) => {
    const a = performance.now()
    try {
      f()
    } catch {
      /* Fehler prüft der Test getrennt */
    }
    return performance.now() - a
  }

  it.each([['<!--'], ['<?'], ['<![CDATA[']])('%s × 100 000 ohne Ende: DC-PARSE in unter 500 ms', (stueck) => {
    const xml = '<a>' + stueck.repeat(1e5)
    expect(dauer(() => [...xmlEreignisse(xml)])).toBeLessThan(500)
    expect(() => [...xmlEreignisse(xml)]).toThrow('DC-PARSE')
  })

  it('rohes „<" im Text ist kaputtes XML; zwei Leser zugleich stören sich nicht', () => {
    expect(() => [...xmlEreignisse('<a>1 < 2</a>')]).toThrow('DC-PARSE')
    const a = xmlEreignisse('<x>eins</x>')
    const b = xmlEreignisse('<y>zwei</y>')
    const erst = [a.next().value, b.next().value, a.next().value, b.next().value]
    expect(erst).toEqual([{ typ: 'auf', name: 'x', attr: {}, leer: false }, { typ: 'auf', name: 'y', attr: {}, leer: false }, { typ: 'text', text: 'eins' }, { typ: 'text', text: 'zwei' }])
    expect([...xmlEreignisse('')]).toEqual([])
  })
})

describe('Steuerzeichen gelangen nicht in den Text (Audit 11/2026, SEC-04)', () => {
  it('Zeichenreferenzen auf C0, Ersatzhälften und U+FFFE werden U+FFFD; Tab, LF, CR und Emoji bleiben', () => {
    expect(entitaeten('a&#x2;b')).toBe('a\uFFFDb')
    expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(entitaeten('a&#x2;b&#0;&#11;&#x1F;'))).toBe(false)
    expect(entitaeten('&#9;&#10;&#13;&#x1F600;&#xE000;')).toBe('\t\n\r😀\uE000')
    expect(entitaeten('&#xD800;&#xDFFF;&#xFFFE;&#xFFFF;')).toBe('\uFFFD'.repeat(4))
  })

  it('roh im Text, in Attributen und in CDATA ebenso', () => {
    expect(ohneSteuerzeichen('a\u0002b\u000Bc\td\uFFFF')).toBe('a\uFFFDb\uFFFDc\td\uFFFD')
    expect([...xmlEreignisse('<a x="1\u0007">t\u0001<![CDATA[c\u0002]]></a>')]).toEqual([
      { typ: 'auf', name: 'a', attr: { x: '1\uFFFD' }, leer: false },
      { typ: 'text', text: 't\uFFFD' },
      { typ: 'text', text: 'c\uFFFD' },
      { typ: 'zu', name: 'a' },
    ])
    expect([0x9, 0xa, 0xd, 0x20, 0xfffd, 0x10ffff].every(xmlZeichen)).toBe(true)
    expect([0x0, 0x8, 0xb, 0x1f, 0xd800, 0xfffe, 0x110000].some(xmlZeichen)).toBe(false)
  })
})
