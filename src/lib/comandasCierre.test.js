// Una venta cierra la comanda del mismo pedido, venga por la puerta que venga.
import { comandasDelPedido, cambiosAlCerrar, estadoAlTerminar, haceCuanto } from './comandasCierre'

jest.mock('./supabase', () => ({ supabase: {} }))

// La #121 real: Ruben, pendiente desde el 30-sep, con la venta cargada en Ventas.
const ruben = {
  id: 121, estado: 'pendiente', venta_orden_id: null, created_at: '2026-09-30T18:39:00Z',
  cliente_id: null, cliente_nombre: 'Ruben Tranamil', cliente_telefono: '964810655',
  items: [{ receta_nombre: 'Berry Bomb', cantidad: 1 }, { receta_nombre: 'Mojito Coco Blue', cantidad: 1 }],
}

test('calza por teléfono aunque venga con otro formato', () => {
  const r = comandasDelPedido([ruben], { telefono: '+56 9 6481 0655', recetas: ['Berry Bomb'] })
  expect(r.map(c => c.id)).toEqual([121])
})

test('calza por ficha y por nombre (sin tildes ni mayúsculas)', () => {
  expect(comandasDelPedido([{ ...ruben, cliente_id: 'u1' }], { clienteId: 'u1' })).toHaveLength(1)
  expect(comandasDelPedido([ruben], { nombre: '  ruben  tranamil ' })).toHaveLength(1)
})

test('no toca comandas ya cerradas ni de otro cliente', () => {
  const comandas = [
    { ...ruben, id: 1, venta_orden_id: 99 },
    { ...ruben, id: 2, estado: 'archivado' },
    { ...ruben, id: 3, cliente_nombre: 'Otra persona', cliente_telefono: '911111111' },
  ]
  expect(comandasDelPedido(comandas, { nombre: 'Ruben Tranamil', telefono: '964810655' })).toEqual([])
  expect(comandasDelPedido([ruben], {})).toEqual([])
})

test('con dos comandas del cliente, primero la que comparte más recetas', () => {
  const otra = { ...ruben, id: 130, created_at: '2026-10-01T10:00:00Z', items: [{ receta_nombre: 'Mojito', cantidad: 1 }] }
  const r = comandasDelPedido([otra, ruben], { nombre: 'Ruben Tranamil', recetas: ['Berry Bomb', 'Mojito Coco Blue'] })
  expect(r.map(c => c.id)).toEqual([121, 130])
})

test('cerrar: lista o vieja se archiva; la que se está preparando sigue en la TV', () => {
  const ahora = new Date('2026-10-06T22:00:00Z')
  expect(cambiosAlCerrar(ruben, 500, ahora)).toEqual({ venta_orden_id: 500, estado: 'archivado' })
  expect(cambiosAlCerrar({ ...ruben, estado: 'listo', created_at: '2026-10-06T21:50:00Z' }, 500, ahora))
    .toEqual({ venta_orden_id: 500, estado: 'archivado' })
  expect(cambiosAlCerrar({ ...ruben, created_at: '2026-10-06T21:30:00Z' }, 500, ahora))
    .toEqual({ venta_orden_id: 500 })
})

test('LISTO en la TV archiva si la venta ya está', () => {
  expect(estadoAlTerminar({ venta_orden_id: 5 })).toBe('archivado')
  expect(estadoAlTerminar({ venta_orden_id: null })).toBe('listo')
})

test('haceCuanto', () => {
  const ahora = new Date('2026-10-06T22:00:00Z')
  expect(haceCuanto('2026-10-06T21:45:00Z', ahora)).toBe('hace 15 min')
  expect(haceCuanto('2026-10-06T19:00:00Z', ahora)).toBe('hace 3 h')
  expect(haceCuanto('2026-09-30T18:39:00Z', ahora)).toBe('hace 6 días')
})
