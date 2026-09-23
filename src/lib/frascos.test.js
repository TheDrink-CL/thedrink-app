// Lógica del programa de frascos. Supabase e inventario van simulados: lo que
// se prueba es qué filas quedan y cuánto stock se mueve.
import {
  validarCanje, resumenOrden, venceSaldo, canalDesdeEntrega, guardarFrascosOrden,
} from './frascos'
import { aplicarMovimientosStock } from './inventario'

let mockTabla = []
let mockFallaInsert = false

jest.mock('./inventario', () => ({
  aplicarMovimientosStock: jest.fn(async () => ({ ok: true, fallidos: [], faltantes: [], negativos: [] })),
  mensajeStock: jest.fn(() => null),
}))

jest.mock('./supabase', () => {
  const query = (filtro = () => true) => ({
    eq: (col, val) => query(r => filtro(r) && r[col] === val),
    then: (res) => res({ data: mockTabla.filter(filtro), error: null }),
  })
  return {
    supabase: {
      from: () => ({
        select: () => query(),
        delete: () => ({
          eq: (col, val) => { mockTabla = mockTabla.filter(r => r[col] !== val); return Promise.resolve({ error: null }) },
        }),
        insert: (filas) => {
          if (mockFallaInsert) return Promise.resolve({ error: { message: 'falló' } })
          mockTabla.push(...filas)
          return Promise.resolve({ error: null })
        },
      }),
    },
  }
})

const movStock = () => aplicarMovimientosStock.mock.calls.map(c => c[0]['Frascos 1lt'])

beforeEach(() => { mockTabla = []; mockFallaInsert = false; aplicarMovimientosStock.mockClear() })

test('canje: alcanza con saldo + frascos de hoy, máximo 1 por pedido', () => {
  expect(validarCanje({ disponible: 4, aceptadosHoy: 2, canjes: 1 })).toBeNull()
  expect(validarCanje({ disponible: 4, aceptadosHoy: 1, canjes: 1 })).toMatch(/necesita 6/)
  expect(validarCanje({ disponible: 12, aceptadosHoy: 0, canjes: 2 })).toMatch(/Máximo 1/)
  expect(validarCanje({ disponible: 0, aceptadosHoy: 3, canjes: 0 })).toBeNull()
})

test('resumen y neto de un pedido', () => {
  const r = resumenOrden([
    { tipo: 'devolucion', aceptados: 3, rechazados: 1 },
    { tipo: 'canje', aceptados: -6, rechazados: 0 },
  ])
  expect(r).toEqual({ aceptados: 3, rechazados: 1, canjes: 1, neto: -3 })
})

test('vigencia de 6 meses y canal', () => {
  expect(venceSaldo('2026-10-30')).toBe('2027-04-30')
  expect(venceSaldo(null)).toBeNull()
  expect(canalDesdeEntrega('propio')).toBe('puerta')
  expect(canalDesdeEntrega('retiro')).toBe('punto_retiro')
  expect(canalDesdeEntrega('uber')).toBe('otro')
})

test('pedido nuevo: devolución + canje, stock solo por los aceptados', async () => {
  const r = await guardarFrascosOrden({ ordenId: 1, clienteId: 'c', fecha: '2026-11-02', aceptados: 3, rechazados: 1, canal: 'puerta', canjes: 1 })
  expect(r.ok).toBe(true)
  expect(mockTabla.map(f => [f.tipo, f.aceptados])).toEqual([['devolucion', 3], ['canje', -6]])
  expect(movStock()).toEqual([3])
})

test('editar: el stock se mueve por la diferencia, no dos veces', async () => {
  await guardarFrascosOrden({ ordenId: 1, clienteId: 'c', fecha: 'f', aceptados: 3 })
  await guardarFrascosOrden({ ordenId: 1, clienteId: 'c', fecha: 'f', aceptados: 5 })
  expect(mockTabla).toHaveLength(1)
  expect(mockTabla[0].aceptados).toBe(5)
  expect(movStock()).toEqual([3, 2])
})

test('borrar pedido: quita las filas y devuelve el stock', async () => {
  await guardarFrascosOrden({ ordenId: 1, clienteId: 'c', fecha: 'f', aceptados: 4 })
  await guardarFrascosOrden({ ordenId: 2, clienteId: 'c', fecha: 'f', aceptados: 2 })
  const r = await guardarFrascosOrden({ ordenId: 1, clienteId: null })
  expect(r.ok).toBe(true)
  expect(mockTabla.map(f => f.orden_id)).toEqual([2])
  expect(movStock()).toEqual([4, 2, -4])
})

test('pedido sin frascos no toca nada', async () => {
  const r = await guardarFrascosOrden({ ordenId: 9, clienteId: null })
  expect(r.ok).toBe(true)
  expect(movStock()).toEqual([])
})

test('si falla el insert al editar, el stock queda como la tabla', async () => {
  await guardarFrascosOrden({ ordenId: 1, clienteId: 'c', fecha: 'f', aceptados: 3 })
  mockFallaInsert = true
  const r = await guardarFrascosOrden({ ordenId: 1, clienteId: 'c', fecha: 'f', aceptados: 5 })
  expect(r.ok).toBe(false)
  expect(mockTabla).toHaveLength(0)
  expect(movStock()).toEqual([3, -3])
})
