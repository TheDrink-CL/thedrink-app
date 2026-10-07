// ─── Una métrica = una función ───────────────────────────────────────────────
//
// El 6-oct la misma cifra salía distinta según la pantalla: 145 clientes en
// Inicio (por nombre), 151 en Panel (por ficha) y 160 en Clientes (fichas,
// con o sin pedidos); "esta semana" era $67.000 en Inicio (últimos 7 días) y
// $46.000 en Panel (desde el lunes). Las dos definiciones eran razonables;
// el problema era llamarlas igual. Acá queda una sola de cada una, y las
// pantallas la usan en vez de recalcularla.

// Sin importar dashboardMetrics (que usa este archivo): mismas reglas de fecha.
const parseFecha = (f) => { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d) }
const lunesDe = (f) => { const d = parseFecha(f); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d) }

// Monto de una línea de venta. `ingreso_total` manda si viene (es lo que se
// cobró); si no, litros × precio.
export const montoVenta = (v) =>
  parseFloat(v.ingreso_total) || (parseFloat(v.litros) || 0) * (parseFloat(v.precio_venta) || 0)

const normNombre = (s) => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

// Quién es el cliente de una orden: su ficha si la tiene; si no, su nombre,
// salvo que ese nombre corresponda a UNA sola ficha en otras órdenes (la
// misma persona registrada antes sin elegirla de la lista).
export function clavesDeCliente(ordenes) {
  const idsPorNombre = {}
  ;(ordenes || []).forEach(o => {
    if (!o.cliente_id) return
    const n = normNombre(o.cliente_nombre)
    if (!n) return
    ;(idsPorNombre[n] = idsPorNombre[n] || new Set()).add(o.cliente_id)
  })
  return (o) => {
    if (o.cliente_id) return 'id:' + o.cliente_id
    const n = normNombre(o.cliente_nombre)
    if (!n) return null
    const ids = idsPorNombre[n]
    return ids && ids.size === 1 ? 'id:' + [...ids][0] : 'n:' + n
  }
}

// Clientes con al menos un pedido (las fichas sin pedidos no cuentan).
// { unicos, recurrentes, tasa, lista: [{ clave, nombre, pedidos, gastado, primera }] }
export function resumenClientes(ordenes, ventas = []) {
  const clave = clavesDeCliente(ordenes)
  const montoOrden = {}
  ;(ventas || []).forEach(v => { if (v.orden_id) montoOrden[v.orden_id] = (montoOrden[v.orden_id] || 0) + montoVenta(v) })
  const por = {}
  ;(ordenes || []).forEach(o => {
    const k = clave(o)
    if (!k) return
    const c = por[k] || (por[k] = { clave: k, nombre: o.cliente_nombre, pedidos: 0, gastado: 0, primera: null })
    c.pedidos++
    c.gastado += montoOrden[o.id] || 0
    if (o.fecha && (!c.primera || o.fecha < c.primera.fecha)) c.primera = { fecha: o.fecha, origen: o.origen }
  })
  const lista = Object.values(por)
  const recurrentes = lista.filter(c => c.pedidos >= 2).length
  return { unicos: lista.length, recurrentes, tasa: lista.length ? recurrentes / lista.length : 0, lista }
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// La semana es de lunes a domingo, como en Panel. Para comparar una semana en
// curso con la pasada se usa la pasada "a esta altura" (mismo día de la
// semana): comparar el martes contra una semana entera siempre da −60%.
// { desde, actual, pasadaCompleta, pasadaALaFecha }
export function ingresoSemana(ventas, hoy = new Date()) {
  const hoyISO = iso(hoy)
  const lunes = lunesDe(hoyISO)
  const l = parseFecha(lunes)
  const lunesAnt = new Date(l); lunesAnt.setDate(l.getDate() - 7)
  const mismoDiaAnt = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 7)
  const desdeAnt = iso(lunesAnt)
  const hastaAntFecha = iso(mismoDiaAnt)
  let actual = 0, pasadaCompleta = 0, pasadaALaFecha = 0
  ;(ventas || []).forEach(v => {
    if (!v.fecha) return
    const m = montoVenta(v)
    if (v.fecha >= lunes && v.fecha <= hoyISO) actual += m
    else if (v.fecha >= desdeAnt && v.fecha < lunes) {
      pasadaCompleta += m
      if (v.fecha <= hastaAntFecha) pasadaALaFecha += m
    }
  })
  return { desde: lunes, actual, pasadaCompleta, pasadaALaFecha }
}
