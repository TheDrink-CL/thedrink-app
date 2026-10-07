// Ventas y conteos: lo que un conteo ya midió no se descuenta ni se devuelve
// otra vez. Supabase simulado: conteo_lineas, recetas y el RPC ajustar_stock.
import {
  descontarStock, reintegrarStock, momentoVenta, insumosContadosDespues,
  insumosAbsorbidosPorConteo, NOTA_ANTES_CONTEO,
} from './inventario'

const mockConteoLineas = [
  { insumo_nombre: 'Ron Bacardí', created_at: '2026-09-19T23:21:40Z' },
  { insumo_nombre: 'Redbull blue', created_at: '2026-09-19T23:21:40Z' },
]
const mockRpc = []

jest.mock('./supabase', () => {
  const tablas = {
    conteo_lineas: () => mockConteoLineas,
    receta_ingredientes: () => [
      { receta_nombre: 'Mojito', insumo_nombre: 'Ron Bacardí', cantidad: 150 },
      { receta_nombre: 'Mojito', insumo_nombre: 'Goma', cantidad: 100 },
    ],
    recetas: () => [{ nombre: 'Mojito', envase_formato: '1lt' }],
    insumos: () => [{ nombre: 'Ron Bacardí' }, { nombre: 'Goma' }, { nombre: 'Frascos 1lt', aplica_merma: false }],
    config: () => [{ clave: 'merma_pct', valor: '0.08' }],
  }
  const query = (tabla, filtro = () => true) => {
    const q = {
      select: () => q,
      in: () => q,
      eq: () => q,
      gt: (col, val) => query(tabla, r => filtro(r) && r[col] > val),
      then: (res) => res({ data: tablas[tabla]().filter(filtro), error: null }),
    }
    return q
  }
  return {
    supabase: {
      from: (t) => query(t),
      rpc: (fn, args) => {
        mockRpc.push(args.movs)
        return Promise.resolve({ data: Object.keys(args.movs).map(n => ({ nombre: n, stock_actual: 100 })), error: null })
      },
    },
  }
})

beforeEach(() => { mockRpc.length = 0 })

test('momentoVenta: fecha y hora locales; sin hora, el final del día', () => {
  expect(momentoVenta('2026-09-30', '20:39:00').getHours()).toBe(20)
  expect(momentoVenta('2026-09-30', '').getHours()).toBe(23)
})

test('insumosContadosDespues', async () => {
  const r = await insumosContadosDespues('2026-09-19T12:00:00Z')
  expect([...r.nombres].sort()).toEqual(['Redbull blue', 'Ron Bacardí'])
  expect(r.ultimo).toBe('2026-09-19T23:21:40Z')
  expect((await insumosContadosDespues('2026-09-20T00:00:00Z')).nombres.size).toBe(0)
})

test('descontar excluyendo lo contado: el ron no se toca, la goma y el frasco sí', async () => {
  await descontarStock([{ receta_nombre: 'Mojito', litros: 1 }], { excluir: new Set(['Ron Bacardí']) })
  expect(mockRpc[0]['Ron Bacardí']).toBeUndefined()
  expect(mockRpc[0].Goma).toBeCloseTo(-108)
  expect(mockRpc[0]['Frascos 1lt']).toBe(-1)
})

test('sin excluir, descuenta todo como siempre', async () => {
  await reintegrarStock([{ receta_nombre: 'Mojito', litros: 1 }])
  expect(mockRpc[0]['Ron Bacardí']).toBeCloseTo(162)
})

test('pedido registrado antes del conteo: borrarlo no devuelve lo contado', async () => {
  const orden = { fecha: '2026-09-18', hora: '21:00', ventas: [{ created_at: '2026-09-18T23:00:00Z', nota: null }] }
  expect([...(await insumosAbsorbidosPorConteo(orden))].sort()).toEqual(['Redbull blue', 'Ron Bacardí'])
})

test('pedido registrado después del conteo: se devuelve todo', async () => {
  const orden = { fecha: '2026-09-25', hora: '21:00', ventas: [{ created_at: '2026-09-26T01:00:00Z', nota: null }] }
  expect((await insumosAbsorbidosPorConteo(orden)).size).toBe(0)
})

test('guardado como "salió antes del conteo": el corte es el momento de la venta', async () => {
  const orden = {
    fecha: '2026-09-18', hora: '21:00',
    ventas: [{ created_at: '2026-10-06T23:00:00Z', nota: 'NEON -15% · ' + NOTA_ANTES_CONTEO }],
  }
  expect((await insumosAbsorbidosPorConteo(orden)).has('Ron Bacardí')).toBe(true)
})

// ─── Temporada y alertas ────────────────────────────────────────────────────
test('alerta solo con mínimo > 0 y si está activo; negativo aparte', () => {
  const { enAlertaDeStock, stockNegativo, insumosEnBodega, recetasFueraDeTemporada } = require('./inventario')
  expect(enAlertaDeStock({ stock_actual: 0, stock_minimo: 0 })).toBe(false)          // Agua tónica 0/0
  expect(enAlertaDeStock({ stock_actual: 4, stock_minimo: 24 })).toBe(true)          // Redbull yellow
  expect(enAlertaDeStock({ stock_actual: 4, stock_minimo: 24, activo: false })).toBe(false)
  expect(stockNegativo({ stock_actual: -842, activo: false })).toBe(false)            // pipeño fuera de temporada
  expect(stockNegativo({ stock_actual: -6216 })).toBe(true)                           // hielo
  const insumos = [{ nombre: 'Pipeño', activo: false }, { nombre: 'Ron Bacardí' }, { nombre: 'Azúcar', rinde_insumo: 'Goma' }]
  expect(insumosEnBodega(insumos).map(i => i.nombre)).toEqual(['Ron Bacardí'])
  const ri = [{ receta_nombre: 'Terremoto (normal)', insumo_nombre: 'Pipeño' }, { receta_nombre: 'Mojito', insumo_nombre: 'Ron Bacardí' }]
  expect([...recetasFueraDeTemporada(ri, insumos)]).toEqual(['Terremoto (normal)'])
})
