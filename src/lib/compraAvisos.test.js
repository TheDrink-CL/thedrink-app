// Las dos compras de ron del 6-oct, vistas al registrarlas.
import { avisosDeCompra } from './compraAvisos'

const ron = (id, fecha, cantidad, precio_total) => ({ id, fecha, insumo_nombre: 'Ron Bacardí', cantidad, precio_total })
const historicas = [
  ron(250, '2026-09-01', 1000, 14500),
  ron(262, '2026-09-12', 1400, 19000),
  ron(263, '2026-09-19', 1500, 21779),
]

test('una compra normal no avisa', () => {
  expect(avisosDeCompra({ fecha: '2026-10-06', insumo_nombre: 'Ron Bacardí', cantidad: 1000, precio_total: 14000 }, historicas)).toEqual([])
})

test('la misma cantidad el mismo día: posible duplicada', () => {
  const a = avisosDeCompra({ fecha: '2026-09-19', insumo_nombre: 'Ron Bacardí', cantidad: 1500, precio_total: 22029 }, historicas)
  expect(a).toEqual(['¿duplicada? hay otra compra igual el mismo día (#263)'])
})

test('3.000 ml por $14.550: precio raro contra la mediana, no contra el PPP', () => {
  const a = avisosDeCompra({ fecha: '2026-09-22', insumo_nombre: 'Ron Bacardí', cantidad: 3000, precio_total: 14550 }, historicas)
  expect(a).toHaveLength(1)
  expect(a[0]).toMatch(/precio raro: \$4,85 por unidad, lo habitual es ~\$14,\d/)
})

test('con menos de 2 compras anteriores no opina del precio', () => {
  expect(avisosDeCompra({ fecha: '2026-10-06', insumo_nombre: 'Ron Bacardí', cantidad: 3000, precio_total: 14550 }, historicas.slice(0, 1))).toEqual([])
})

test('al revisar una compra guardada, no se compara consigo misma', () => {
  expect(avisosDeCompra(historicas[2], historicas)).toEqual([])
})
