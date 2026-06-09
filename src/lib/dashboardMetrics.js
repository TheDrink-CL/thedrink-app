// ─────────────────────────────────────────────────────────────────────────────
// Métricas deterministas para la vista INDICADORES.
// Todo se calcula aquí (nunca con IA). Reutiliza calculos.js para costos y
// la atribución de pauta IG, para no divergir del resto de la app.
//
// Semántica de datos (ver prompt-dashboard-thedrink-v2.md):
// - ventas.delivery   = costo PAGADO a un tercero (no es cobro al cliente)
// - caja 'Delivery'   = cobro de delivery al cliente (entrada)
// - origen legacy 'Instagram' cuenta como pauta vía esOrigenIGAds
// ─────────────────────────────────────────────────────────────────────────────

import { calcularCostoReceta, envaseDesdeReceta, esOrigenIGAds } from './calculos'

// Parsea 'YYYY-MM-DD' sin desfase de zona horaria
export function parseFecha(f) {
  if (!f) return null
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Lunes de la semana de una fecha (clave de agrupación lunes-domingo)
export function lunesDe(fechaISO) {
  const d = parseFecha(fechaISO)
  if (!d) return null
  const offset = (d.getDay() + 6) % 7 // lun=0 ... dom=6
  d.setDate(d.getDate() - offset)
  return toISO(d)
}

export function labelSemana(lunesISO) {
  const d = parseFecha(lunesISO)
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d.getDate()} ${meses[d.getMonth()]}`
}

// Clasificación de canal para las series
export function canalDe(origen) {
  if (!origen) return 'sinOrigen'
  if (origen === 'Cliente habitual') return 'habitual'
  if (esOrigenIGAds(origen)) return 'pauta'
  return 'otros'
}

export const CANAL_META = {
  habitual:  { label: 'Habituales',  color: 'var(--green)' },
  pauta:     { label: 'Pauta IG',    color: 'var(--pink)' },
  otros:     { label: 'Otros',       color: 'var(--cyan)' },
  sinOrigen: { label: 'Sin origen',  color: 'rgba(255,255,255,0.25)' },
}

/**
 * Calcula todas las métricas del panel de indicadores.
 * Entradas: filas crudas de Supabase. Salida: objeto listo para la UI
 * (y para serializar como JSON a la futura llamada de insights con IA).
 */
export function calcularMetricasDashboard({
  ventas = [],
  ordenes = [],
  caja = [],
  compras = [],
  recetas = [],
  recetaIngredientes = [],
  insumos = [],
  config = {},
}) {
  const merma = parseFloat(config.merma_pct) || 0.08
  const costoEnvaseLegacy = parseFloat(config.costo_envase) || 794.6

  // ── KPIs globales ──────────────────────────────────────────────────────────
  const ingresoTotal = ventas.reduce((s, v) => s + (parseFloat(v.ingreso_total) || v.litros * v.precio_venta), 0)
  const litrosTotal = ventas.reduce((s, v) => s + (parseFloat(v.litros) || 0), 0)
  const precioPorLitro = litrosTotal > 0 ? ingresoTotal / litrosTotal : 0

  // Ticket promedio por orden (excluye ventas legacy sin orden_id)
  const porOrden = {}
  let ventasSinOrden = 0
  ventas.forEach(v => {
    if (!v.orden_id) { ventasSinOrden++; return }
    porOrden[v.orden_id] = (porOrden[v.orden_id] || 0) + (parseFloat(v.ingreso_total) || v.litros * v.precio_venta)
  })
  const tickets = Object.values(porOrden)
  const ticketPromedio = tickets.length > 0 ? tickets.reduce((s, t) => s + t, 0) / tickets.length : 0

  // ── Series semanales por canal + gasto pauta ──────────────────────────────
  const semanas = {}
  const getSemana = (key) => {
    if (!semanas[key]) semanas[key] = { habitual: 0, pauta: 0, otros: 0, sinOrigen: 0, total: 0, gastoPauta: 0, ordenesNuevas: 0, ordenesRecurrentes: 0, clientesNuevos: 0 }
    return semanas[key]
  }
  ventas.forEach(v => {
    const key = lunesDe(v.fecha)
    if (!key) return
    const w = getSemana(key)
    const monto = parseFloat(v.ingreso_total) || v.litros * v.precio_venta
    w[canalDe(v.origen)] += monto
    w.total += monto
  })
  caja.filter(m => m.tipo === 'salida' && m.categoria === 'Publicidad').forEach(m => {
    const key = lunesDe(m.fecha)
    if (key) getSemana(key).gastoPauta += m.monto
  })

  // ── Clientes: primera orden, nuevos vs recurrentes, recompra ──────────────
  const primeraOrden = {}   // cliente_id -> { fecha, origen }
  const ordenesPorCliente = {}
  const ordenesValidas = ordenes.filter(o => o.cliente_id && o.fecha)
  ordenesValidas.forEach(o => {
    ordenesPorCliente[o.cliente_id] = (ordenesPorCliente[o.cliente_id] || 0) + 1
    if (!primeraOrden[o.cliente_id] || o.fecha < primeraOrden[o.cliente_id].fecha) {
      primeraOrden[o.cliente_id] = { fecha: o.fecha, origen: o.origen }
    }
  })
  ordenesValidas.forEach(o => {
    const key = lunesDe(o.fecha)
    if (!key) return
    const w = getSemana(key)
    if (primeraOrden[o.cliente_id].fecha === o.fecha) w.ordenesNuevas++
    else w.ordenesRecurrentes++
  })
  Object.values(primeraOrden).forEach(p => {
    const key = lunesDe(p.fecha)
    if (key) getSemana(key).clientesNuevos++
  })

  const clientesUnicos = Object.keys(ordenesPorCliente).length
  const clientesRecompra = Object.values(ordenesPorCliente).filter(n => n >= 2).length
  const tasaRecompra = clientesUnicos > 0 ? clientesRecompra / clientesUnicos : 0

  // ── ROAS por semana + CAC del período ──────────────────────────────────────
  const semanasOrdenadas = Object.keys(semanas).sort() // asc
  semanasOrdenadas.forEach(key => {
    const w = semanas[key]
    w.roas = w.gastoPauta > 0 ? w.pauta / w.gastoPauta : null
  })

  const gastoPautaTotal = caja
    .filter(m => m.tipo === 'salida' && m.categoria === 'Publicidad')
    .reduce((s, m) => s + m.monto, 0)
  const clientesNuevosPauta = Object.values(primeraOrden).filter(p => esOrigenIGAds(p.origen)).length
  const cac = clientesNuevosPauta > 0 && gastoPautaTotal > 0 ? gastoPautaTotal / clientesNuevosPauta : null
  const roasGlobal = gastoPautaTotal > 0
    ? ventas.filter(v => esOrigenIGAds(v.origen)).reduce((s, v) => s + (parseFloat(v.ingreso_total) || v.litros * v.precio_venta), 0) / gastoPautaTotal
    : null

  // ── Ingreso por día de la semana ───────────────────────────────────────────
  const porDia = [0, 0, 0, 0, 0, 0, 0] // lun..dom
  ventas.forEach(v => {
    const d = parseFecha(v.fecha)
    if (!d) return
    porDia[(d.getDay() + 6) % 7] += parseFloat(v.ingreso_total) || v.litros * v.precio_venta
  })

  // ── Dona: origen del ingreso acumulado ─────────────────────────────────────
  const dona = { habitual: 0, pauta: 0, otros: 0, sinOrigen: 0 }
  ventas.forEach(v => {
    dona[canalDe(v.origen)] += parseFloat(v.ingreso_total) || v.litros * v.precio_venta
  })

  // ── Margen $/litro por receta (teórico, vía calculos.js) ──────────────────
  const ventasPorReceta = {}
  ventas.forEach(v => {
    if (!ventasPorReceta[v.receta_nombre]) ventasPorReceta[v.receta_nombre] = { litros: 0, ingreso: 0 }
    ventasPorReceta[v.receta_nombre].litros += parseFloat(v.litros) || 0
    ventasPorReceta[v.receta_nombre].ingreso += parseFloat(v.ingreso_total) || v.litros * v.precio_venta
  })
  const margenPorReceta = Object.entries(ventasPorReceta)
    .filter(([nombre]) => nombre && nombre !== 'ENVASE')
    .map(([nombre, d]) => {
      const ings = recetaIngredientes.filter(i => i.receta_nombre === nombre && i.insumo_nombre !== 'ENVASE')
      const costoLitro = ings.length > 0
        ? calcularCostoReceta(ings, insumos, merma, envaseDesdeReceta(nombre, recetas, costoEnvaseLegacy))
        : null
      const precioLitro = d.litros > 0 ? d.ingreso / d.litros : 0
      const margenLitro = costoLitro != null ? precioLitro - costoLitro : null
      return {
        nombre,
        litros: d.litros,
        ingreso: d.ingreso,
        costoLitro,
        margenLitro,
        margenPct: margenLitro != null && precioLitro > 0 ? margenLitro / precioLitro : null,
        semaforo: margenLitro == null ? 'gris' : margenLitro > 5500 ? 'verde' : margenLitro >= 4800 ? 'ambar' : 'rojo',
      }
    })
    .sort((a, b) => b.ingreso - a.ingreso)

  const conMargen = margenPorReceta.filter(r => r.margenLitro != null && r.litros > 0)
  const litrosConMargen = conMargen.reduce((s, r) => s + r.litros, 0)
  const margenPonderado = litrosConMargen > 0
    ? conMargen.reduce((s, r) => s + r.margenLitro * r.litros, 0) / litrosConMargen
    : null

  // ── Ratio compras insumos / ingreso por mes ────────────────────────────────
  const insumosPorMes = {}
  compras.filter(c => c.tipo === 'insumo' && !c.es_inversion).forEach(c => {
    const mes = (c.fecha || '').slice(0, 7)
    if (mes) insumosPorMes[mes] = (insumosPorMes[mes] || 0) + c.precio_total
  })
  const ingresoPorMes = {}
  ventas.forEach(v => {
    const mes = (v.fecha || '').slice(0, 7)
    if (mes) ingresoPorMes[mes] = (ingresoPorMes[mes] || 0) + (parseFloat(v.ingreso_total) || v.litros * v.precio_venta)
  })
  const mesActual = toISO(new Date()).slice(0, 7)
  const ratioInsumosMes = (ingresoPorMes[mesActual] || 0) > 0
    ? (insumosPorMes[mesActual] || 0) / ingresoPorMes[mesActual]
    : null

  // ── Semáforos "Dónde poner el ojo" ─────────────────────────────────────────
  // Se evalúan sobre la ÚLTIMA SEMANA COMPLETA (la actual está en curso y
  // sesgaría todo a rojo un día lunes).
  const hoy = toISO(new Date())
  const semanaActualKey = lunesDe(hoy)
  const completas = semanasOrdenadas.filter(k => k !== semanaActualKey)
  const ult = completas.length > 0 ? semanas[completas[completas.length - 1]] : null
  const ant = completas.length > 1 ? semanas[completas[completas.length - 2]] : null

  const sem = (estado, valor, detalle) => ({ estado, valor, detalle })
  const semaforos = {
    gastoPauta: ult == null ? sem('gris', null, 'sin datos')
      : ult.gastoPauta < 25000 ? sem('rojo', ult.gastoPauta, 'bajo el piso de $25K')
      : ult.gastoPauta < 50000 ? sem('ambar', ult.gastoPauta, 'bajo la meta de $50-60K')
      : sem('verde', ult.gastoPauta, 'dentro de meta'),
    roas: ult == null || ult.roas == null ? sem('gris', null, 'sin pauta esa semana')
      : ult.roas < 3 && ant && ant.roas != null && ant.roas < 3 ? sem('rojo', ult.roas, '<3x dos semanas seguidas')
      : ult.roas < 3 ? sem('ambar', ult.roas, '<3x esta semana, vigilar')
      : sem('verde', ult.roas, '≥3x'),
    habituales: ult == null ? sem('gris', null, 'sin datos')
      : ult.habitual < 100000 && ant && ant.habitual < 100000 ? sem('rojo', ult.habitual, '<$100K dos semanas seguidas')
      : ult.habitual < 100000 ? sem('ambar', ult.habitual, '<$100K esta semana')
      : sem('verde', ult.habitual, '≥$100K'),
    clientesNuevos: ult == null ? sem('gris', null, 'sin datos')
      : ult.clientesNuevos < 10 ? sem('ambar', ult.clientesNuevos, 'bajo la meta de 10')
      : sem('verde', ult.clientesNuevos, '≥10'),
    ticket: ticketPromedio === 0 ? sem('gris', null, 'sin datos')
      : ticketPromedio < 17500 ? sem('ambar', ticketPromedio, 'bajo la meta de $17.500')
      : sem('verde', ticketPromedio, '≥$17.500'),
    recompra: clientesUnicos === 0 ? sem('gris', null, 'sin datos')
      : tasaRecompra < 0.30 ? sem('ambar', tasaRecompra, 'bajo el 30%')
      : tasaRecompra < 0.35 ? sem('ambar', tasaRecompra, 'cerca de la meta del 35%')
      : sem('verde', tasaRecompra, '≥35%'),
    ratioInsumos: ratioInsumosMes == null ? sem('gris', null, 'sin ventas este mes')
      : ratioInsumosMes > 0.55 ? sem('rojo', ratioInsumosMes, '>55% del ingreso')
      : ratioInsumosMes > 0.50 ? sem('ambar', ratioInsumosMes, 'sobre el 50%')
      : sem('verde', ratioInsumosMes, '≤50%'),
  }

  return {
    // KPIs
    ingresoTotal, litrosTotal, nVentas: ventas.length, precioPorLitro,
    ticketPromedio, ventasSinOrden,
    // series
    semanas, semanasOrdenadas, semanaActualKey,
    porDia, dona,
    // canal / pauta
    gastoPautaTotal, roasGlobal, cac, clientesNuevosPauta,
    // clientes
    clientesUnicos, tasaRecompra,
    // margen
    margenPorReceta, margenPonderado,
    // costos
    insumosPorMes, ingresoPorMes, ratioInsumosMes, mesActual,
    // semáforos
    semaforos,
  }
}
