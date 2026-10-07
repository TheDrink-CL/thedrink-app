// ─── Cierre de comandas ──────────────────────────────────────────────────────
//
// Hay dos puertas para un pedido, a propósito: en hora punta entra como
// comanda (Importar WA, LAB) y la TV la muestra para preparar; con poca venta
// se registra directo en Ventas. Las dos terminan en una venta, pero hasta el
// 6-oct nada las unía: si el pedido entraba como comanda y la venta se cargaba
// en Ventas, la comanda quedaba "pendiente" para siempre (la #121 llevaba seis
// días en la TV con la venta ya registrada) y una comanda archivada sin venta
// era un pedido que nunca descontó stock ni sumó a caja.
//
// Reglas:
//   · Al registrar una venta se busca la comanda abierta del mismo cliente
//     (ficha, teléfono o nombre) y se cierra con ella.
//   · Cerrar = vincular `venta_orden_id`. Si ya se preparó (`listo`) o es
//     vieja, además se archiva. Si se está preparando ahora, sigue en la TV
//     hasta que toquen LISTO, y ahí se archiva sola.
//   · Archivar una comanda SIN venta pide confirmación (ComandasPendientes).

import { supabase } from './supabase'

// Una comanda con más de esto ya no se está preparando: es un pedido que
// quedó abierto. Se archiva al vincularla, no se deja en la TV.
export const HORAS_COMANDA_VIEJA = 6

export const ESTADOS_ABIERTOS = ['pendiente', 'listo']

const ultimos8 = (tel) => {
  const d = (tel || '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-8) : null
}
const normNombre = (s) => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

export const comandaAbierta = (c) => ESTADOS_ABIERTOS.includes(c.estado) && !c.venta_orden_id

// Comandas abiertas que pueden ser este pedido, la más probable primero.
// Calza por ficha, por teléfono (últimos 8 dígitos) o por nombre exacto; se
// ordena por cuántas recetas comparte con la venta y luego por antigüedad.
export function comandasDelPedido(comandas, { clienteId, telefono, nombre, recetas = [] }) {
  const u8 = ultimos8(telefono)
  const n = normNombre(nombre)
  if (!clienteId && !u8 && !n) return []
  const enVenta = new Set(recetas.filter(Boolean))
  return (comandas || [])
    .filter(comandaAbierta)
    .filter(c =>
      (clienteId && c.cliente_id === clienteId) ||
      (u8 && ultimos8(c.cliente_telefono) === u8) ||
      (n && normNombre(c.cliente_nombre) === n))
    .map(c => ({
      c,
      comunes: (c.items || []).filter(it => enVenta.has(it.receta_nombre)).length,
    }))
    .sort((a, b) => b.comunes - a.comunes || (a.c.created_at < b.c.created_at ? -1 : 1))
    .map(x => x.c)
}

// Qué se le escribe a la comanda al cerrarla con la venta `ordenId`.
export function cambiosAlCerrar(comanda, ordenId, ahora = new Date()) {
  const horas = (ahora - new Date(comanda.created_at)) / 3600000
  const archivar = comanda.estado === 'listo' || horas >= HORAS_COMANDA_VIEJA
  return archivar ? { venta_orden_id: ordenId, estado: 'archivado' } : { venta_orden_id: ordenId }
}

export async function cerrarComanda(comanda, ordenId) {
  const { error } = await supabase.from('comandas').update(cambiosAlCerrar(comanda, ordenId)).eq('id', comanda.id)
  return { ok: !error, error }
}

// Estado al tocar LISTO en la TV: si la venta ya está, la comanda terminó.
export const estadoAlTerminar = (comanda) => (comanda?.venta_orden_id ? 'archivado' : 'listo')

export async function cargarComandasAbiertas() {
  const { data } = await supabase.from('comandas').select('*')
    .in('estado', ESTADOS_ABIERTOS).is('venta_orden_id', null)
    .order('created_at', { ascending: true })
  return data || []
}

// "hace 3 h", "hace 6 días": para que se reconozca de qué pedido se habla.
export function haceCuanto(ts, ahora = new Date()) {
  const min = Math.max(0, Math.round((ahora - new Date(ts)) / 60000))
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}
