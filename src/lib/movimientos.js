// ─── Movimientos de un insumo desde su último conteo ─────────────────────────
//
// La base guarda solo `insumos.stock_actual`, el número final: no hay un log
// de movimientos. Cuando el conteo físico no cuadra con la app, la pregunta
// es "¿qué movió este insumo desde que lo contamos?", y hasta ahora la
// respuesta salía cruzando a mano conteos, compras, ventas y salidas.
//
// Esto la reconstruye con las MISMAS reglas que mueven el stock
// (calcularMovimientosStock: receta × litros × merma, frasco, sticker y
// bombillas; azúcar → goma; bolsa por pedido; devolución de frascos), así
// que la suma tiene que llegar al stock que muestra la app. Si no llega, la
// diferencia es algo que no dejó registro: una edición a mano en Stock, una
// receta cambiada después de vender, o un pedido editado que venía de antes
// del conteo.
//
// Además marca lo que suele explicar un descuadre: compras que parecen
// duplicadas o con un precio que no calza, ventas cargadas tarde (sobre todo
// las de ANTES del conteo cargadas DESPUÉS, que se descuentan dos veces) y
// comandas pendientes que todavía no descuentan nada.

import { supabase } from './supabase'
import {
  calcularMovimientosStock, enrutarMovimientos, armarIngredientesPorReceta,
  cargarInsumosMeta, cargarMerma, tieneNotaAntesConteo,
} from './inventario'
import { INSUMO_FRASCO } from './frascos'

const BOLSAS = 'Bolsas plásticas'
const TZ = 'America/Santiago'

// 'YYYY-MM-DD' en hora de Chile. `fecha` en ventas y compras es la fecha del
// negocio; `created_at` es UTC: un pedido de las 22:00 cae al día siguiente.
export const fechaLocal = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: TZ })

const diasEntre = (desde, hasta) =>
  Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000)

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Cuánto mueve una venta o una salida a `nombre`, ya enrutado (azúcar → goma).
function deltaDe(items, signo, nombre, ctx) {
  const movs = calcularMovimientosStock(items, ctx.ingredientes, signo, ctx.meta, ctx.merma)
  return enrutarMovimientos(movs, ctx.meta)[nombre] || 0
}

// Avisos de una compra mirando todas las compras del mismo insumo.
function avisosCompra(c, todas) {
  const avisos = []
  const gemela = todas.find(o => o.id !== c.id && o.insumo_nombre === c.insumo_nombre &&
    o.fecha === c.fecha && Number(o.cantidad) === Number(c.cantidad))
  if (gemela) avisos.push(`¿duplicada? hay otra compra igual el mismo día (#${gemela.id})`)
  const unit = (x) => Number(x.precio_total) / Number(x.cantidad)
  const otras = todas
    .filter(o => o.id !== c.id && o.insumo_nombre === c.insumo_nombre && Number(o.cantidad) > 0 && Number(o.precio_total) > 0)
    .map(unit)
  if (otras.length >= 2 && Number(c.cantidad) > 0 && Number(c.precio_total) > 0) {
    const ref = mediana(otras)
    const r = unit(c) / ref
    if (r < 0.6 || r > 1.67) {
      avisos.push(`precio raro: $${fmt(unit(c))} por unidad, lo habitual es ~$${fmt(ref)}. Revisa la cantidad o el precio`)
    }
  }
  return avisos
}

const fmt = (n) => {
  const a = Math.abs(n)
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2
  return Number(n.toFixed(d)).toLocaleString('es-CL')
}

// Reconstrucción pura. Recibe todo ya cargado y devuelve:
//   { sinConteo, inicio: { ts, fecha, cantidad }, filas, calculado, app,
//     diferencia, pendientes }
// Cada fila: { ts, fecha, tipo, detalle, delta, saldo, avisos, fuerte }.
// `fuerte` marca el aviso que casi seguro explica parte del descuadre.
export function reconstruirMovimientos({
  nombre, stockApp, conteo, compras = [], comprasHistoricas = null, ventas = [],
  salidas = [], ordenes = [], frascos = [], comandasPendientes = [],
  ingredientes = {}, meta = {}, merma = 0.08,
}) {
  const app = Number(stockApp) || 0
  if (!conteo) return { sinConteo: true, filas: [], app, pendientes: [] }

  const ctx = { ingredientes, meta, merma }
  const desde = conteo.created_at
  const fechaConteo = fechaLocal(desde)
  const despues = (x) => x.created_at > desde
  const historicas = comprasHistoricas || compras
  const filas = []

  // Compras: las del insumo y las de uno que rinde en él (azúcar → goma).
  compras.filter(despues).forEach(c => {
    const m = meta[(c.insumo_nombre || '').toLowerCase()]
    const directo = c.insumo_nombre === nombre
    const rinde = m?.rinde_insumo === nombre
    if (!directo && !rinde) return
    const factor = rinde ? (m.rinde_factor || 1) : 1
    const avisos = avisosCompra(c, historicas)
    filas.push({
      ts: c.created_at, fecha: c.fecha, tipo: 'compra',
      detalle: rinde ? `Compra de ${c.insumo_nombre.toLowerCase()} (${fmt(Number(c.cantidad))} × ${factor})` : 'Compra',
      delta: Number(c.cantidad) * factor, avisos, fuerte: avisos.length > 0,
    })
  })

  ventas.filter(despues).forEach(v => {
    // Guardada como "salió antes del conteo": no descontó lo que este conteo
    // ya había medido (inventario.js, «Ventas y conteos»).
    if (tieneNotaAntesConteo(v.nota) && v.fecha && v.fecha <= fechaConteo) return
    const delta = deltaDe([v], -1, nombre, ctx)
    if (!delta) return
    const avisos = []
    let fuerte = false
    const cargada = fechaLocal(v.created_at)
    if (v.fecha && v.fecha < fechaConteo) {
      avisos.push(`es del ${v.fecha}, antes del conteo, y se cargó después: si ya había salido cuando contaste, se descontó dos veces`)
      fuerte = true
    } else if (v.fecha && diasEntre(v.fecha, cargada) >= 2) {
      avisos.push(`cargada ${diasEntre(v.fecha, cargada)} días después (el ${cargada})`)
    }
    const l = parseFloat(v.litros) || 1
    filas.push({
      ts: v.created_at, fecha: v.fecha, tipo: 'venta',
      detalle: `${v.receta_nombre}${l !== 1 ? ` × ${l}` : ''}${v.nota ? ` · ${v.nota}` : ''}`,
      delta, avisos, fuerte,
    })
  })

  salidas.filter(despues).forEach(s => {
    let delta
    if (s.receta_nombre) {
      delta = deltaDe([{ receta_nombre: s.receta_nombre, litros: parseFloat(s.litros) || 1, sin_envase: !!s.sin_envase }], -1, nombre, ctx)
    } else {
      // Insumo suelto: lo declarado, sin merma (ajustarStockPorSalidas).
      delta = enrutarMovimientos({ [s.insumo_nombre]: -(parseFloat(s.cantidad) || 0) }, meta)[nombre] || 0
    }
    if (!delta) return
    const motivo = (s.motivo || 'salida').replace(/_/g, ' ')
    filas.push({
      ts: s.created_at, fecha: s.fecha, tipo: 'salida',
      detalle: `Salida sin venta (${motivo}): ${s.receta_nombre || s.insumo_nombre}`,
      delta, avisos: [], fuerte: false,
    })
  })

  // Trigger trigger_bolsa_orden: −1 por pedido.
  if (nombre === BOLSAS) {
    ordenes.filter(despues).forEach(o => filas.push({
      ts: o.created_at, fecha: o.fecha, tipo: 'bolsa',
      detalle: `Pedido #${o.id}`, delta: -1, avisos: [], fuerte: false,
    }))
  }

  // Devolución de frascos: +aceptados a Frascos 1lt (lib/frascos.js).
  if (nombre === INSUMO_FRASCO) {
    frascos.filter(f => despues(f) && f.tipo === 'devolucion' && Number(f.aceptados) > 0).forEach(f => filas.push({
      ts: f.created_at, fecha: f.fecha, tipo: 'devolucion',
      detalle: 'Devolución de frascos', delta: Number(f.aceptados), avisos: [], fuerte: false,
    }))
  }

  filas.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
  let saldo = Number(conteo.stock_real) || 0
  filas.forEach(f => { saldo += f.delta; f.saldo = saldo })

  // Comandas que piden algo con este insumo y todavía no son venta: el
  // producto puede haber salido ya, pero la bodega aún no lo sabe.
  const pendientes = comandasPendientes.map(c => {
    const items = (c.items || []).filter(i => i.receta_nombre).map(i => ({
      receta_nombre: i.receta_nombre, litros: parseFloat(i.cantidad) || 1,
    }))
    const delta = items.length ? deltaDe(items, -1, nombre, ctx) : 0
    return delta ? { id: c.id, fecha: fechaLocal(c.created_at), delta, detalle: items.map(i => i.receta_nombre).join(', ') } : null
  }).filter(Boolean)

  const calculado = saldo
  return {
    sinConteo: false,
    inicio: { ts: desde, fecha: fechaConteo, cantidad: Number(conteo.stock_real) || 0, teorico: Number(conteo.stock_teorico) },
    filas, calculado, app,
    diferencia: app - calculado,
    pendientes,
  }
}

// Carga todo lo necesario para un insumo y lo reconstruye.
export async function cargarMovimientos(insumo, insumos) {
  const nombre = insumo.nombre
  const { data: lineas } = await supabase
    .from('conteo_lineas')
    .select('stock_real, stock_teorico, created_at')
    .eq('insumo_nombre', nombre)
    .order('created_at', { ascending: false })
    .limit(1)
  const conteo = lineas?.[0] || null
  if (!conteo) return reconstruirMovimientos({ nombre, stockApp: insumo.stock_actual, conteo: null })

  // Insumos cuyas compras entran a este (el propio y los que rinden en él).
  const fuentes = [nombre, ...(insumos || []).filter(i => i.rinde_insumo === nombre).map(i => i.nombre)]
  const desde = conteo.created_at

  const [
    { data: compras }, { data: ventas }, { data: salidas }, { data: ordenes },
    { data: frascos }, { data: comandas }, { data: ings }, { data: recetasMeta },
    meta, merma,
  ] = await Promise.all([
    // Todas las compras de estos insumos: las viejas sirven para saber qué
    // precio es normal y para encontrar duplicadas.
    supabase.from('compras').select('id, fecha, insumo_nombre, cantidad, precio_total, created_at').in('insumo_nombre', fuentes),
    supabase.from('ventas').select('id, fecha, receta_nombre, litros, nota, created_at').gt('created_at', desde).limit(5000),
    supabase.from('salidas_stock').select('id, fecha, motivo, receta_nombre, litros, sin_envase, insumo_nombre, cantidad, created_at').gt('created_at', desde),
    nombre === BOLSAS
      ? supabase.from('ordenes').select('id, fecha, created_at').gt('created_at', desde)
      : Promise.resolve({ data: [] }),
    nombre === INSUMO_FRASCO
      ? supabase.from('frascos_movimientos').select('fecha, tipo, aceptados, created_at').gt('created_at', desde)
      : Promise.resolve({ data: [] }),
    // Abiertas: preparándose o ya preparadas, pero sin venta todavía.
    supabase.from('comandas').select('id, created_at, items').in('estado', ['pendiente', 'listo']).is('venta_orden_id', null),
    supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad'),
    supabase.from('recetas').select('nombre, envase_formato'),
    cargarInsumosMeta(),
    cargarMerma(),
  ])

  return reconstruirMovimientos({
    nombre, stockApp: insumo.stock_actual, conteo,
    compras: compras || [], ventas: ventas || [], salidas: salidas || [],
    ordenes: ordenes || [], frascos: frascos || [], comandasPendientes: comandas || [],
    ingredientes: armarIngredientesPorReceta(ings, recetasMeta), meta, merma,
  })
}
