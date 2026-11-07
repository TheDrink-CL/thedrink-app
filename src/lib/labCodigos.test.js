import { parsearMensajeLab, prototiposSinCodigo, esSoloNumeroPrototipo, urlResolver } from './labCodigos'

const MENSAJE_LAB = `▸ PEDIDO THE DRINK

1×  PROTOTIPO #4375
    Daikiri Frambuesa-Frutilla · 1lt · + jugo de naranja
    RON-DAI-FRA.FRU-1L+NJ
    $8.300

SUBTOTAL  $8.300

▣ ENVIADO DESDE NCITY_LAB // lab.ncity.live`

describe('prototiposSinCodigo', () => {
  test('reconoce el número solo, con o sin la palabra prototipo', () => {
    expect(prototiposSinCodigo('4375')).toEqual(['4375'])
    expect(prototiposSinCodigo('#4375')).toEqual(['4375'])
    expect(prototiposSinCodigo('PROTOTIPO #4375')).toEqual(['4375'])
    expect(prototiposSinCodigo('prototipo 4375')).toEqual(['4375'])
  })

  test('lo encuentra dentro de un chat escrito a mano, sin repetirlo', () => {
    expect(prototiposSinCodigo('hola, quiero el Prototipo #4375\nel PROTOTIPO #4375 y el PROTOTIPO #104'))
      .toEqual(['4375', '104'])
  })

  test('un mensaje del LAB trae el código: no hay nada que avisar', () => {
    expect(prototiposSinCodigo(MENSAJE_LAB)).toEqual([])
    expect(prototiposSinCodigo('PROTOTIPO #4375 · RON-DAI-FRA.FRU-1L+NJ')).toEqual([])
  })

  test('avisa solo del que viene sin código cuando hay de los dos', () => {
    expect(prototiposSinCodigo(`${MENSAJE_LAB}\ny también el PROTOTIPO #104`)).toEqual(['104'])
  })

  test('un número suelto en medio de un chat no es un prototipo', () => {
    expect(prototiposSinCodigo('-2 mojitos\ncalle falsa 4375\ncel 912345678')).toEqual([])
    expect(prototiposSinCodigo('912345678')).toEqual([])
    expect(prototiposSinCodigo('')).toEqual([])
  })
})

test('esSoloNumeroPrototipo distingue un número de un pedido con más texto', () => {
  expect(esSoloNumeroPrototipo('PROTOTIPO #4375')).toBe(true)
  expect(esSoloNumeroPrototipo('4375')).toBe(true)
  expect(esSoloNumeroPrototipo('quiero el PROTOTIPO #4375')).toBe(false)
})

test('el link al Resolver lleva el número', () => {
  expect(urlResolver('4375')).toBe('https://lab.ncity.live/staff/?q=4375')
})

test('el código con su precio se importa completo', () => {
  const r = parsearMensajeLab('RON-DAI-FRA.FRU-1L+NJ $8.300')
  expect(r.items[0].codigo).toBe('RON-DAI-FRA.FRU-1L+NJ')
  expect(r.items[0].precio_venta).toBe(8300)
})
