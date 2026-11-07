import { parsearMensajeLab, referenciasPrototipo, urlResolver } from './labCodigos'

const MENSAJE_LAB = `▸ PEDIDO THE DRINK

1×  PROTOTIPO #4375
    Daikiri Frambuesa-Frutilla · 1lt · + jugo de naranja
    RON-DAI-FRA.FRU-1L+NJ
    $8.300

SUBTOTAL  $8.300

▣ ENVIADO DESDE NCITY_LAB // lab.ncity.live`

describe('referenciasPrototipo', () => {
  const numeros = texto => referenciasPrototipo(texto).refs

  test('reconoce el número solo, con o sin la palabra prototipo', () => {
    for (const texto of ['4375', '#4375', 'PROTOTIPO #4375', 'prototipo 4375', 'Prototipo N° 4375'])
      expect(numeros(texto)).toEqual([{ numero: '4375', cantidad: 1 }])
  })

  test('entiende la cantidad escrita a mano', () => {
    expect(numeros('-1 Prototipo 4375')).toEqual([{ numero: '4375', cantidad: 1 }])
    expect(numeros('-2 Prototipo 4375')).toEqual([{ numero: '4375', cantidad: 2 }])
    expect(numeros('3x prototipo #4375')).toEqual([{ numero: '4375', cantidad: 3 }])
    expect(numeros('prototipo 4375 x2')).toEqual([{ numero: '4375', cantidad: 2 }])
  })

  test('saca la línea del prototipo y deja el resto del pedido', () => {
    const r = referenciasPrototipo('-2 mojitos\n-1 Prototipo 4375\ncalle falsa 123')
    expect(r.refs).toEqual([{ numero: '4375', cantidad: 1 }])
    expect(r.resto).toBe('-2 mojitos\ncalle falsa 123')
  })

  test('no repite un número mencionado dos veces', () => {
    expect(numeros('quiero el Prototipo #4375\nel PROTOTIPO #4375 y el PROTOTIPO #104').map(r => r.numero))
      .toEqual(['4375', '104'])
  })

  test('un mensaje del LAB trae el código: no se toca', () => {
    expect(referenciasPrototipo(MENSAJE_LAB)).toEqual({ refs: [], resto: MENSAJE_LAB })
    expect(numeros('PROTOTIPO #4375 · RON-DAI-FRA.FRU-1L+NJ')).toEqual([])
  })

  test('toma solo el que viene sin código cuando hay de los dos', () => {
    const r = referenciasPrototipo(MENSAJE_LAB + '\ny también el PROTOTIPO #104')
    expect(r.refs).toEqual([{ numero: '104', cantidad: 1 }])
    expect(r.resto).toBe(MENSAJE_LAB)
  })

  test('un número suelto en medio de un chat no es un prototipo', () => {
    expect(numeros('-2 mojitos\ncalle falsa 4375\ncel 912345678')).toEqual([])
    expect(numeros('912345678')).toEqual([])
    expect(numeros('')).toEqual([])
  })
})

test('el link al Resolver lleva el número', () => {
  expect(urlResolver('4375')).toBe('https://lab.ncity.live/staff/?q=4375')
})

test('el código con su precio se importa completo', () => {
  const r = parsearMensajeLab('RON-DAI-FRA.FRU-1L+NJ $8.300')
  expect(r.items[0].codigo).toBe('RON-DAI-FRA.FRU-1L+NJ')
  expect(r.items[0].precio_venta).toBe(8300)
})
