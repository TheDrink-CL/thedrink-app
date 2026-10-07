import { montoVenta, resumenClientes, ingresoSemana, clavesDeCliente } from './metricas'

test('montoVenta: ingreso_total manda, si no litros × precio', () => {
  expect(montoVenta({ ingreso_total: '7650', litros: 1, precio_venta: 9000 })).toBe(7650)
  expect(montoVenta({ litros: 2, precio_venta: 9000 })).toBe(18000)
})

test('el mismo cliente con y sin ficha cuenta una vez', () => {
  const ordenes = [
    { id: 1, cliente_id: 'a', cliente_nombre: 'Valentina', fecha: '2026-09-26' },
    { id: 2, cliente_id: null, cliente_nombre: 'valentina ', fecha: '2026-09-27' },
    { id: 3, cliente_id: null, cliente_nombre: 'Ruben Tranamil', fecha: '2026-09-30' },
    { id: 4, cliente_id: null, cliente_nombre: '', fecha: '2026-09-30' },
  ]
  const r = resumenClientes(ordenes, [{ orden_id: 1, litros: 1, precio_venta: 9000 }, { orden_id: 2, litros: 2, precio_venta: 9000 }])
  expect(r.unicos).toBe(2)
  expect(r.recurrentes).toBe(1)
  expect(r.lista.find(c => c.clave === 'id:a')).toMatchObject({ pedidos: 2, gastado: 27000, primera: { fecha: '2026-09-26' } })
})

test('un nombre con dos fichas distintas no se adivina', () => {
  const clave = clavesDeCliente([
    { cliente_id: 'a', cliente_nombre: 'Catalina' },
    { cliente_id: 'b', cliente_nombre: 'Catalina' },
  ])
  expect(clave({ cliente_id: null, cliente_nombre: 'Catalina' })).toBe('n:catalina')
})

test('semana lunes a domingo; la pasada también "a esta altura"', () => {
  const hoy = new Date(2026, 9, 6) // martes 6-oct
  const v = (fecha, monto) => ({ fecha, litros: 1, precio_venta: monto })
  const r = ingresoSemana([
    v('2026-10-05', 10000), v('2026-10-06', 36000),   // esta semana
    v('2026-09-29', 20000), v('2026-09-30', 21000),   // lun y mar pasados... y mié
    v('2026-10-01', 50000), v('2026-09-27', 99999),   // jueves pasado; domingo antepasado
  ], hoy)
  expect(r.desde).toBe('2026-10-05')
  expect(r.actual).toBe(46000)
  expect(r.pasadaCompleta).toBe(91000)
  expect(r.pasadaALaFecha).toBe(20000)
})
