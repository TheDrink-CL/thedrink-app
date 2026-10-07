// La ficha arma la cuenta y pone arriba lo que hay que revisar.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import MovimientosInsumo from './MovimientosInsumo'
import { cargarMovimientos } from '../lib/movimientos'

jest.mock('../lib/movimientos', () => ({ cargarMovimientos: jest.fn() }))
global.IS_REACT_ACT_ENVIRONMENT = true

let cont, root
beforeEach(() => { cont = document.createElement('div'); document.body.appendChild(cont); root = createRoot(cont) })
afterEach(() => { act(() => root.unmount()); cont.remove() })

const montar = async (res, insumo = { nombre: 'Ron Bacardí', unidad: 'ml', stock_actual: 1547.2 }) => {
  cargarMovimientos.mockResolvedValue(res)
  await act(async () => { root.render(<MovimientosInsumo insumo={insumo} insumos={[]} onEditar={() => {}} onCerrar={() => {}} />) })
  return cont.textContent
}

test('muestra la cuenta, la diferencia sin explicar y lo que hay que revisar', async () => {
  const t = await montar({
    sinConteo: false,
    inicio: { fecha: '2026-09-19', cantidad: 1000 },
    filas: [
      { ts: 'a', fecha: '2026-09-19', tipo: 'compra', detalle: 'Compra', delta: 1500, saldo: 2500, avisos: ['¿duplicada? hay otra compra igual el mismo día (#263)'], fuerte: true },
      { ts: 'b', fecha: '2026-09-25', tipo: 'venta', detalle: 'Mojito', delta: -162, saldo: 2338, avisos: [], fuerte: false },
    ],
    calculado: 2338, app: 1547.2, diferencia: -790.8,
    pendientes: [{ id: 121, fecha: '2026-09-30', delta: -162, detalle: 'Mojito' }],
  })
  expect(t).toMatch(/Conteo 19-sep/)
  expect(t).toMatch(/2\.338 ml/)
  expect(t).toMatch(/−791 ml.*que ningún registro explica/)
  expect(t).toMatch(/duplicada/)
  expect(t).toMatch(/Comanda #121 pendiente/)
})

test('sin conteo explica cómo empezar', async () => {
  const t = await montar({ sinConteo: true, filas: [], app: 0, pendientes: [] })
  expect(t).toMatch(/nunca se ha contado/)
})

test('si cuadra no muestra diferencia', async () => {
  const t = await montar({
    sinConteo: false, inicio: { fecha: '2026-09-19', cantidad: 30 },
    filas: [], calculado: 30, app: 30, diferencia: 0, pendientes: [],
  }, { nombre: 'Redbull blue', unidad: 'un', stock_actual: 30 })
  expect(t).not.toMatch(/ningún registro explica/)
  expect(t).toMatch(/Nada lo ha movido/)
})
