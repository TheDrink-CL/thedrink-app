// Reconstrucción de movimientos de un insumo. Los casos salen del descuadre
// real del 6-oct-2026 (Red Bull Blue y ron): la suma tiene que llegar al
// stock de la app y los avisos tienen que apuntar a lo que lo explica.
import { reconstruirMovimientos, fechaLocal } from './movimientos'

jest.mock('./supabase', () => ({ supabase: {} }))

const meta = {
  'ron bacardí': { aplica_merma: true, rinde_insumo: null, rinde_factor: null },
  'redbull blue': { aplica_merma: false, rinde_insumo: null, rinde_factor: null },
  'azúcar': { aplica_merma: true, rinde_insumo: 'Goma', rinde_factor: 1.5 },
  'goma': { aplica_merma: true, rinde_insumo: null, rinde_factor: null },
}
const ingredientes = {
  'Berry Bomb': [{ insumo_nombre: 'Redbull blue', cantidad: 1 }, { insumo_nombre: 'Frascos 1lt', cantidad: 1 }],
  'Mojito': [{ insumo_nombre: 'Ron Bacardí', cantidad: 150 }, { insumo_nombre: 'Goma', cantidad: 100 }, { insumo_nombre: 'Frascos 1lt', cantidad: 1 }],
}
const conteo = { stock_real: 30, stock_teorico: 154, created_at: '2026-09-19T23:21:40Z' }

test('fechaLocal usa la hora de Chile', () => {
  expect(fechaLocal('2026-10-07T00:53:00Z')).toBe('2026-10-06')
})

test('sin conteo no inventa un punto de partida', () => {
  const r = reconstruirMovimientos({ nombre: 'Redbull blue', stockApp: 25, conteo: null })
  expect(r.sinConteo).toBe(true)
})

test('Red Bull: conteo − ventas posteriores = stock de la app', () => {
  const r = reconstruirMovimientos({
    nombre: 'Redbull blue', stockApp: 25, conteo, meta, ingredientes,
    ventas: [
      { id: 969, fecha: '2026-09-19', receta_nombre: 'Berry Bomb', litros: 2, created_at: '2026-09-19T22:30:00Z' }, // antes del conteo
      { id: 986, fecha: '2026-09-19', receta_nombre: 'Berry Bomb', litros: 3, created_at: '2026-09-20T00:59:00Z' },
      { id: 1017, fecha: '2026-09-30', receta_nombre: 'Berry Bomb', litros: 1, created_at: '2026-10-07T00:53:00Z' },
      { id: 1014, fecha: '2026-10-06', receta_nombre: 'Berry Bomb', litros: 1, created_at: '2026-10-07T00:52:00Z' },
      { id: 1012, fecha: '2026-10-06', receta_nombre: 'Mojito', litros: 1, created_at: '2026-10-07T00:50:00Z' }, // no lleva Red Bull
    ],
  })
  expect(r.filas.map(f => f.delta)).toEqual([-3, -1, -1])
  expect(r.calculado).toBe(25)
  expect(r.diferencia).toBe(0)
  // Sin merma: aplica_merma=false.
  expect(r.filas[0].saldo).toBe(27)
  // La del 30-sep cargada el 6-oct queda marcada como tardía.
  expect(r.filas.find(f => f.fecha === '2026-09-30').avisos[0]).toMatch(/6 días después/)
})

test('venta de antes del conteo cargada después: aviso fuerte de doble descuento', () => {
  const r = reconstruirMovimientos({
    nombre: 'Redbull blue', stockApp: 29, conteo, meta, ingredientes,
    ventas: [{ id: 1, fecha: '2026-09-18', receta_nombre: 'Berry Bomb', litros: 1, created_at: '2026-09-21T15:00:00Z' }],
  })
  expect(r.filas[0].fuerte).toBe(true)
  expect(r.filas[0].avisos[0]).toMatch(/dos veces/)
})

test('venta guardada como "salió antes del conteo" no descuenta lo contado', () => {
  const r = reconstruirMovimientos({
    nombre: 'Redbull blue', stockApp: 30, conteo, meta, ingredientes,
    ventas: [{ id: 1, fecha: '2026-09-18', receta_nombre: 'Berry Bomb', litros: 1, nota: 'salió antes del conteo', created_at: '2026-10-06T15:00:00Z' }],
  })
  expect(r.filas).toEqual([])
  expect(r.diferencia).toBe(0)
})

test('ron: merma, salidas, compra duplicada y precio raro', () => {
  const compras = [
    { id: 250, fecha: '2026-09-01', insumo_nombre: 'Ron Bacardí', cantidad: 1000, precio_total: 14500, created_at: '2026-09-01T12:00:00Z' },
    { id: 262, fecha: '2026-09-12', insumo_nombre: 'Ron Bacardí', cantidad: 1400, precio_total: 19000, created_at: '2026-09-13T01:26:00Z' },
    { id: 263, fecha: '2026-09-19', insumo_nombre: 'Ron Bacardí', cantidad: 1500, precio_total: 21779, created_at: '2026-09-19T22:56:00Z' },
    { id: 264, fecha: '2026-09-19', insumo_nombre: 'Ron Bacardí', cantidad: 1500, precio_total: 22029, created_at: '2026-09-20T01:13:00Z' },
    { id: 276, fecha: '2026-09-22', insumo_nombre: 'Ron Bacardí', cantidad: 3000, precio_total: 14550, created_at: '2026-09-23T02:27:00Z' },
  ]
  const r = reconstruirMovimientos({
    nombre: 'Ron Bacardí', stockApp: 1000 + 1500 + 3000 - 162 - 162, meta, ingredientes, compras,
    conteo: { stock_real: 1000, created_at: '2026-09-19T23:21:40Z' },
    ventas: [{ id: 1, fecha: '2026-09-25', receta_nombre: 'Mojito', litros: 1, created_at: '2026-09-25T22:00:00Z' }],
    salidas: [{ id: 2, fecha: '2026-09-26', motivo: 'consumo_interno', receta_nombre: 'Mojito', litros: 1, created_at: '2026-09-26T22:00:00Z' }],
  })
  // Solo entran las compras posteriores al conteo.
  expect(r.filas.filter(f => f.tipo === 'compra').map(f => f.delta)).toEqual([1500, 3000])
  expect(r.filas.find(f => f.tipo === 'venta').delta).toBeCloseTo(-162)
  expect(r.filas.find(f => f.tipo === 'salida').detalle).toMatch(/consumo interno/)
  expect(r.diferencia).toBeCloseTo(0)
  const [c264, c276] = r.filas.filter(f => f.tipo === 'compra')
  expect(c264.avisos.join()).toMatch(/duplicada.*#263/)
  expect(c276.avisos.join()).toMatch(/precio raro/)
})

test('una edición a mano en Stock aparece como diferencia sin explicar', () => {
  const r = reconstruirMovimientos({ nombre: 'Redbull blue', stockApp: 40, conteo, meta, ingredientes })
  expect(r.diferencia).toBe(10)
})

test('compra de azúcar entra a la goma × 1,5', () => {
  const r = reconstruirMovimientos({
    nombre: 'Goma', stockApp: 1500 - 108, meta, ingredientes,
    conteo: { stock_real: 0, created_at: '2026-09-19T23:21:40Z' },
    compras: [{ id: 1, fecha: '2026-09-20', insumo_nombre: 'Azúcar', cantidad: 1000, precio_total: 1200, created_at: '2026-09-20T12:00:00Z' }],
    ventas: [{ id: 1, fecha: '2026-09-21', receta_nombre: 'Mojito', litros: 1, created_at: '2026-09-21T12:00:00Z' }],
  })
  expect(r.filas.map(f => f.delta)).toEqual([1500, -108])
  expect(r.diferencia).toBeCloseTo(0)
})

test('comandas pendientes que usan el insumo se listan aparte', () => {
  const r = reconstruirMovimientos({
    nombre: 'Redbull blue', stockApp: 30, conteo, meta, ingredientes,
    comandasPendientes: [
      { id: 121, created_at: '2026-09-30T18:39:00Z', items: [{ receta_nombre: 'Berry Bomb', cantidad: 1 }, { receta_nombre: 'Mojito', cantidad: 1 }] },
      { id: 122, created_at: '2026-09-30T18:40:00Z', items: [{ receta_nombre: 'Mojito', cantidad: 2 }] },
    ],
  })
  expect(r.pendientes).toEqual([{ id: 121, fecha: '2026-09-30', delta: -1, detalle: 'Berry Bomb, Mojito' }])
})
