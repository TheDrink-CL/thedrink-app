// Programa de frascos retornables («Frascos de vuelta», 23-sep-2026).
//
// Reglas (acordadas con Rodrigo):
//   - 6 frascos aceptados = 1 Mojito clásico o un 0.0 (saborizado paga la
//     diferencia de carta). Máximo 1 canje por pedido, con al menos 1 trago
//     pagado. El trago canjeado va a $0 con nota NOTA_CANJE.
//   - El saldo dura 6 meses desde la última devolución.
//   - Cuenta cualquier frasco de 1 L del mismo modelo, con tapa y entero.
//
// Tabla `frascos_movimientos` + vista `frascos_saldo` (migración
// 20260923_frascos_retornables.sql). Una fila por devolución, canje o ajuste;
// el saldo es la suma de `aceptados`.
//
// Stock: solo la DEVOLUCIÓN mueve `Frascos 1lt` (+aceptados), desde el cliente
// vía ajustar_stock, como el resto de los movimientos de venta. El canje no
// toca stock acá: el trago canjeado es una venta y descuenta su frasco e
// ingredientes por el camino normal. El ajuste tampoco (es solo saldo).
import { supabase } from './supabase'
import { aplicarMovimientosStock, mensajeStock } from './inventario'

export const FRASCOS_POR_CANJE = 6
export const NOTA_CANJE = 'canje frascos'
export const RECETA_CANJE = 'Mojito'
export const INSUMO_FRASCO = 'Frascos 1lt'
export const VIGENCIA_MESES = 6

// PostgREST cuando la tabla/vista todavía no existe (migración sin correr).
const esTablaAusente = (error) =>
  error && (error.code === '42P01' || error.code === 'PGRST205' ||
    /does not exist|could not find the table|schema cache/i.test(error.message || ''))

// Canal según cómo sale el pedido: con el auto es intercambio en la puerta;
// retiro es el punto de retiro. Uber/DiDi no traen frascos, pero si alguien
// los entregó igual (ej. los trajo antes) queda como 'otro'.
export function canalDesdeEntrega(deliveryTipo) {
  if (deliveryTipo === 'propio') return 'puerta'
  if (deliveryTipo === 'retiro') return 'punto_retiro'
  return 'otro'
}

export function venceSaldo(ultimaDevolucion) {
  if (!ultimaDevolucion) return null
  const d = new Date(ultimaDevolucion + 'T12:00:00')
  d.setMonth(d.getMonth() + VIGENCIA_MESES)
  return d.toISOString().slice(0, 10)
}

// Normaliza una fila de la vista (o nada) a un objeto siempre usable.
function aSaldo(row) {
  const saldo = Number(row?.saldo) || 0
  const ultima = row?.ultima_devolucion || null
  const vence = venceSaldo(ultima)
  const hoy = new Date().toISOString().slice(0, 10)
  const vencido = !!(vence && vence < hoy && saldo > 0)
  return {
    saldo,
    devueltos: Number(row?.devueltos) || 0,
    rechazados: Number(row?.rechazados) || 0,
    canjes: Number(row?.canjes) || 0,
    ultima_devolucion: ultima,
    vence,
    vencido,
    // Lo que se puede usar para canjear hoy.
    disponible: vencido ? 0 : saldo,
  }
}

export const SALDO_VACIO = aSaldo(null)

// { ok, saldo, sinMigracion }
export async function cargarSaldo(clienteId) {
  if (!clienteId) return { ok: true, saldo: SALDO_VACIO }
  const { data, error } = await supabase
    .from('frascos_saldo').select('*').eq('cliente_id', clienteId).limit(1)
  if (esTablaAusente(error)) return { ok: false, sinMigracion: true, saldo: SALDO_VACIO }
  if (error) return { ok: false, error, saldo: SALDO_VACIO }
  return { ok: true, saldo: aSaldo(data?.[0]) }
}

// Mapa { cliente_id: saldo } para listas (panel de delivery).
export async function cargarSaldos(clienteIds = null) {
  let q = supabase.from('frascos_saldo').select('*')
  if (clienteIds) {
    const ids = [...new Set(clienteIds.filter(Boolean))]
    if (!ids.length) return {}
    q = q.in('cliente_id', ids)
  }
  const { data, error } = await q
  if (error) return {}
  const map = {}
  ;(data || []).forEach(r => { map[r.cliente_id] = aSaldo(r) })
  return map
}

export async function movimientosDeCliente(clienteId) {
  if (!clienteId) return []
  const { data, error } = await supabase
    .from('frascos_movimientos').select('*')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false }).order('id', { ascending: false })
  return error ? [] : (data || [])
}

export async function movimientosDeOrden(ordenId) {
  if (!ordenId) return []
  const { data, error } = await supabase
    .from('frascos_movimientos').select('*').eq('orden_id', ordenId)
  return error ? [] : (data || [])
}

// Resumen de lo que un pedido ya tiene registrado (para el modal de edición).
export function resumenOrden(movs) {
  const dev = (movs || []).filter(m => m.tipo === 'devolucion')
  return {
    aceptados: dev.reduce((s, m) => s + (m.aceptados || 0), 0),
    rechazados: dev.reduce((s, m) => s + (m.rechazados || 0), 0),
    canjes: (movs || []).filter(m => m.tipo === 'canje').length,
    // Lo que este pedido suma al saldo (devolución − canjes). Sirve para
    // reconstruir el saldo "antes de este pedido" al editarlo.
    neto: (movs || []).reduce((s, m) => s + (m.aceptados || 0), 0),
  }
}

// ¿Alcanza el saldo para los canjes del pedido? `disponible` es el saldo
// usable ANTES de este pedido; los frascos de hoy suman antes de canjear.
export function validarCanje({ disponible, aceptadosHoy, canjes }) {
  if (canjes > 1) return 'Máximo 1 canje de frascos por pedido.'
  const total = (disponible || 0) + (aceptadosHoy || 0)
  if (canjes > 0 && total < FRASCOS_POR_CANJE * canjes) {
    return `El canje necesita ${FRASCOS_POR_CANJE} frascos y hay ${total}.`
  }
  return null
}

async function moverStockFrascos(delta) {
  if (!delta) return null
  const res = await aplicarMovimientosStock({ [INSUMO_FRASCO]: delta })
  return mensajeStock(res)
}

// Deja los movimientos de un pedido exactamente como se indica (borra los que
// tenía y crea los nuevos) y ajusta el stock por la diferencia de aceptados.
// Con todo en 0 equivale a borrarlos (usar antes de borrar el pedido).
// Devuelve { ok, error, avisoStock }.
export async function guardarFrascosOrden({ ordenId, clienteId, fecha, aceptados = 0, rechazados = 0, canal = 'otro', canjes = 0 }) {
  const previos = await movimientosDeOrden(ordenId)
  const antes = resumenOrden(previos).aceptados

  const filas = []
  if (clienteId && (aceptados > 0 || rechazados > 0)) {
    filas.push({ cliente_id: clienteId, orden_id: ordenId, fecha, tipo: 'devolucion', aceptados, rechazados, canal })
  }
  if (clienteId) {
    for (let i = 0; i < canjes; i++) {
      filas.push({ cliente_id: clienteId, orden_id: ordenId, fecha, tipo: 'canje', aceptados: -FRASCOS_POR_CANJE, rechazados: 0, canal })
    }
  }
  if (previos.length === 0 && filas.length === 0) return { ok: true }

  if (previos.length) {
    const { error } = await supabase.from('frascos_movimientos').delete().eq('orden_id', ordenId)
    if (error) return { ok: false, error }
  }
  if (filas.length) {
    const { error } = await supabase.from('frascos_movimientos').insert(filas)
    if (error) {
      // Se borraron los previos y no entraron los nuevos: devolver el stock
      // de lo que había, así el inventario calza con lo que queda en la tabla.
      const avisoStock = await moverStockFrascos(-antes)
      return { ok: false, error, avisoStock }
    }
  }
  const nuevos = clienteId ? aceptados : 0
  const avisoStock = await moverStockFrascos(nuevos - antes)
  return { ok: true, avisoStock }
}

// Devolución sin pedido (punto de retiro) o ajuste manual desde la ficha.
// Solo la devolución mueve stock.
export async function registrarMovimientoSuelto({ clienteId, tipo, aceptados = 0, rechazados = 0, canal = null, nota = null }) {
  const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const { error } = await supabase.from('frascos_movimientos').insert({
    cliente_id: clienteId, orden_id: null, fecha, tipo, aceptados, rechazados, canal, nota: nota || null,
  })
  if (error) return { ok: false, error }
  const avisoStock = tipo === 'devolucion' ? await moverStockFrascos(aceptados) : null
  return { ok: true, avisoStock }
}

export async function borrarMovimientoSuelto(mov) {
  const { error } = await supabase.from('frascos_movimientos').delete().eq('id', mov.id)
  if (error) return { ok: false, error }
  const avisoStock = mov.tipo === 'devolucion' ? await moverStockFrascos(-(mov.aceptados || 0)) : null
  return { ok: true, avisoStock }
}
