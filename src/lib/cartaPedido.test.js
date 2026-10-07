// Mensajes de la carta web → ítems con su receta exacta.
import { esMensajeCarta, parsearMensajeCarta, recetaDeCarta } from './cartaPedido'

// Nombres tal como están en la base (selector de Ventas, 6-oct-2026).
const recetas = [
  'Berry Bomb', 'Berry Bomb 0.0', 'Berry Frost (1lt)', 'Blue Colada', 'Daikiri frambuesa',
  'Daikiri frutilla', 'Daikiri mango', 'Daikiri maracuya', 'Frozen mojito (1lt)', 'Frutilla Colada',
  'Gin Tonic', 'Mango Colada', 'Mango Sour', 'Maracuyá Sour', 'Margarita', 'Margarita Blue',
  'Margarita Frutilla', 'Margarita Mango', 'Margarita Maracuyá', 'Mojito', 'Mojito Arándano',
  'Mojito Coco Blue', 'Mojito coco-frambuesa', 'Mojito frambuesa', 'Mojito frutilla', 'Mojito Jager',
  'Mojito Jager Maracuyá', 'Mojito mango', 'Mojito maracuya', 'Mojito piña', 'Piña Colada',
  'Pisco sour', 'Sour Peruano', 'Tropical Gin', 'Violetto tonic',
].map(nombre => ({ nombre, precio_venta: 9000 }))

const MENSAJE = `Hola The Drink, vengo de la carta — quiero pedir:

▸ 1x Mojito Clásico
     $8.000
▸ 1x Berry Bomb
     $12.000
▸ 1x Mojito Coco Blue
     $9.000
▸ 1x Mojito Sabores · Piña
     $9.000

PRODUCTOS: $38.000
DESPACHO (Quilicura): GRATIS o fuera de zona — según dirección

PASE DE BIENVENIDA: es mi primer pedido

(precios tomados de carta.ncity.live)`

test('el pedido real del 6-oct sale con las cuatro recetas y sus precios', () => {
  const r = parsearMensajeCarta(MENSAJE, recetas)
  expect(r.items.map(i => [i.cantidad, i.receta_nombre, i.precio_venta])).toEqual([
    [1, 'Mojito', 8000],
    [1, 'Berry Bomb', 12000],
    [1, 'Mojito Coco Blue', 9000],
    [1, 'Mojito piña', 9000],
  ])
  expect(r.notas).toEqual([
    'Despacho Quilicura: GRATIS o fuera de zona — según dirección',
    'Pase de bienvenida: dice que es su primer pedido',
  ])
})

test('cantidad mayor a 1: precio unitario, no el subtotal; promo y código como nota', () => {
  const r = parsearMensajeCarta(`Hola The Drink, vengo de la carta — quiero pedir:
▸ 5x Mojito Sabores · Maracuyá
     $9.000 c/u = $45.000
▸ PROMO Mojito 5 x $40.000: −$5.000
DESPACHO: falta indicar la comuna
Tengo código de descuento: NEON-0610-ABC`, recetas)
  expect(r.items).toEqual([{ cantidad: 5, etiqueta: 'Mojito Sabores · Maracuyá', receta_nombre: 'Mojito maracuya', precio_venta: 9000 }])
  expect(r.notas).toEqual([
    'PROMO Mojito 5 x $40.000: −$5.000',
    'Despacho: falta indicar la comuna',
    'Código de descuento: NEON-0610-ABC',
  ])
})

test.each([
  ['Mojito Clásico', 'Mojito'],
  ['Mojito Sabores · Arándano', 'Mojito Arándano'],
  ['Mojito Coco Frambuesa', 'Mojito coco-frambuesa'],
  ['Mojito Jäger', 'Mojito Jager'],
  ['Mojito Jäger Maracuyá', 'Mojito Jager Maracuyá'],
  ['Colada · Piña', 'Piña Colada'],
  ['Colada · Blue', 'Blue Colada'],
  ['Daikiri Sabores · Maracuyá', 'Daikiri maracuya'],
  ['Margarita Clásica', 'Margarita'],
  ['Margarita Sabores · Blue (curaçao)', 'Margarita Blue'],
  ['Pisco Sour', 'Pisco sour'],
  ['Pisco Sour Peruano', 'Sour Peruano'],
  ['Maracuyá Sour', 'Maracuyá Sour'],
  ['Mojito Frozen 0.0', 'Frozen mojito (1lt)'],
  ['Berry Frost 0.0', 'Berry Frost (1lt)'],
  ['Violetto Tonic 0.0', 'Violetto tonic'],
  ['Berry Bomb 0.0', 'Berry Bomb 0.0'],
])('%s → %s', (carta, receta) => {
  expect(recetaDeCarta(carta, recetas)?.nombre).toBe(receta)
})

test('un nombre que no existe queda sin receta, no adivinado', () => {
  expect(recetaDeCarta('Mojito Sabores · Kiwi', recetas)).toBeNull()
  const r = parsearMensajeCarta('vengo de la carta\n▸ 1x Trago Nuevo\n     $9.000', recetas)
  expect(r.items[0]).toEqual({ cantidad: 1, etiqueta: 'Trago Nuevo', receta_nombre: '', precio_venta: 9000 })
})

test('un chat normal no es de la carta', () => {
  expect(esMensajeCarta('hola quiero 2 mojitos')).toBe(false)
  expect(parsearMensajeCarta('hola quiero 2 mojitos', recetas)).toBeNull()
})
