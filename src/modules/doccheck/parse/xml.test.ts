import { describe, expect, it } from 'vitest'
import { entitaeten, texteIn, xmlEreignisse } from './xml'

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
})
