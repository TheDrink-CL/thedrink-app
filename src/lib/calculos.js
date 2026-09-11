// Calcula costo total por litro de una receta dado el PPP actual de insumos.
//
// `costoEnvase` puede ser:
//   - Un número fijo (compatibilidad legacy con `config.costo_envase`).
//   - Un objeto receta { envase_formato: '1lt' | '475ml' | null } — en cuyo
//     caso el costo se resuelve mirando el PPP del insumo correspondiente.
//
// Insumos con `aplica_merma = false` (Red Bull, frascos, etc.) suman al costo
// sin el factor (1 + merma). El resto sí se ajusta por merma.
export function calcularCostoReceta(ingredientes, insumos, merma = 0.08, costoEnvase = 794.6) {
  const insumoMap = {}
  insumos.forEach(i => {
    insumoMap[i.nombre.toLowerCase()] = {
      ppp: i.costo_ppp || 0,
      aplicaMerma: i.aplica_merma !== false, // default true si no viene la flag
    }
  })

  let costoConMerma = 0
  let costoInsumosBase = 0   // suma de los insumos con merma (sin el factor)
  ingredientes.forEach(ing => {
    const meta = insumoMap[ing.insumo_nombre.toLowerCase()]
    const ppp = meta?.ppp || 0
    const aplica = meta ? meta.aplicaMerma : true
    const sub = ing.cantidad * ppp
    if (aplica) {
      costoInsumosBase += sub
      costoConMerma += sub * (1 + merma)
    } else {
      costoConMerma += sub
    }
  })

  // Resolver el costo del envase
  let costoEnvaseFinal = 794.6
  if (typeof costoEnvase === 'number') {
    costoEnvaseFinal = costoEnvase
  } else if (costoEnvase && typeof costoEnvase === 'object') {
    // Se pasó un objeto { envase_formato, costoLegacy }
    const formato = costoEnvase.envase_formato
    const insumoEnvase = formato === '475ml' ? 'frascos 475ml' : 'frascos 1lt'
    // insumoMap guarda objetos { ppp, aplicaMerma }, no números: hay que sacar
    // el .ppp. Comparar el objeto contra 0 daba siempre false y TODAS las recetas
    // caían al costoLegacy, así que el frasco de 475ml se cobraba como uno de 1lt.
    const pppEnvase = insumoMap[insumoEnvase]?.ppp || 0
    if (pppEnvase > 0) {
      costoEnvaseFinal = pppEnvase
    } else if (costoEnvase.costoLegacy != null) {
      costoEnvaseFinal = costoEnvase.costoLegacy
    }
  }

  return costoConMerma + costoEnvaseFinal
}

// Helper: dado un nombre de receta y la lista de recetas, devuelve el objeto
// listo para pasar como `costoEnvase` a calcularCostoReceta. Útil para no
// repetir la lógica en cada caller.
export function envaseDesdeReceta(recetaNombre, recetas, costoLegacy = 794.6) {
  const r = (recetas || []).find(x => x.nombre === recetaNombre)
  return {
    envase_formato: r?.envase_formato || '1lt',
    costoLegacy,
  }
}

// ── Atribución de canal Instagram Ads ────────────────────────────────────────
// Históricamente el origen se registraba como 'Instagram'; hoy se separa en
// 'IG Pauta' e 'IG Orgánico'. Para ROI/CAC de pauta se cuentan 'IG Pauta' y el
// legacy 'Instagram' (de la época en que solo existía pauta). Un solo lugar
// para que Caja y Análisis nunca diverjan.
export const ORIGENES_IG_ADS = ['Instagram', 'IG Pauta']
export const esOrigenIGAds = (o) => ORIGENES_IG_ADS.includes(o)

export function formatCLP(n) {
  if (n == null) return '$0'
  return '$' + Math.round(n).toLocaleString('es-CL')
}

export function formatPct(n) {
  if (n == null) return '0%'
  return (n * 100).toFixed(1) + '%'
}

// ─── Enriquecer ventas con datos de delivery de su orden ─────────────────────
// El COSTO de delivery (`delivery`) y el COBRO al cliente (`delivery_cobrado`)
// viven en la tabla `ordenes`, no en cada fila de `ventas` (las filas de venta
// guardan delivery: 0). Esta función copia ambos valores desde la orden a UNA
// sola fila de venta por orden (la primera), para no contar el delivery N veces
// cuando una orden tiene varios productos. Devuelve una copia de las ventas.
//
// `ordenes` = filas con { id, delivery, delivery_cobrado }.
export function enriquecerVentasConDelivery(ventas = [], ordenes = []) {
  const mapa = {}
  ;(ordenes || []).forEach(o => {
    mapa[o.id] = {
      delivery: parseFloat(o.delivery) || 0,
      delivery_cobrado: parseFloat(o.delivery_cobrado) || 0,
    }
  })
  const vistaPorOrden = {} // para asignar el delivery solo a la primera fila de cada orden
  return (ventas || []).map(v => {
    const info = mapa[v.orden_id]
    if (!info || vistaPorOrden[v.orden_id]) {
      // Sin orden conocida, o ya asignamos el delivery a otra fila de esta orden.
      return { ...v, delivery: 0, delivery_cobrado: 0 }
    }
    vistaPorOrden[v.orden_id] = true
    return { ...v, delivery: info.delivery, delivery_cobrado: info.delivery_cobrado }
  })
}

// ── Delivery adelantado con plata personal ───────────────────────────────────
// Uber Eats se cobra de la cuenta del negocio (la misma donde entran los pagos):
// esa plata ya salio sola, no hay nada que retirar. DiDi solo acepta tarjeta
// bancaria personal, asi que ese costo lo adelanta el dueno y el negocio se lo
// debe. El KPI "Por pagarte" de Caja usa esta lista; si manana otra app se paga
// igual, se agrega aca y el KPI la toma sola.
export const TIPOS_DELIVERY_ADELANTADO = ['didi']
export const esDeliveryAdelantado = (t) => TIPOS_DELIVERY_ADELANTADO.includes(t)

// Fecha de corte del nuevo manejo de delivery. Desde esta fecha, el costo de
// delivery (lo que se paga a Uber/motoboy) se descuenta del saldo de caja, y el
// cobro al cliente se suma. Antes de esta fecha el delivery se manejaba distinto
// (cobro como movimiento manual en caja, costo pagado por fuera), y esos meses
// ya estan conciliados con el banco: NO se recalculan.
export const FECHA_CORTE_DELIVERY = '2026-07-01'

// ── Saldo de caja: LA fórmula ────────────────────────────────────────────────
// Único lugar donde se calcula el saldo disponible. La usan Caja, Inicio
// (Dashboard), MiDinero, CaminoAlBar y Proyecciones: si cambia cómo se cuenta
// la plata, se cambia acá y en ningún otro lado. Antes estaba copiada a mano en
// las cinco pantallas y divergió dos veces (jun y sep 2026); la última vez Caja
// mostró ~$500k menos que Inicio por restar el costo de delivery dos veces.
//
//   saldo = ventas (litros × precio)
//         + delivery cobrado al cliente      (órdenes desde FECHA_CORTE_DELIVERY)
//         − costo de delivery (Uber/DiDi)    (órdenes desde FECHA_CORTE_DELIVERY)
//         − compras que no son inversión
//         + entradas manuales de caja, salvo 'Venta'   (ya está en `ventas`)
//         − salidas manuales de caja, salvo 'Insumos'  (ya está en `compras`)
//
// `ventas.delivery` NO se resta. Es una columna legacy del primer mes (abr 2026):
// solo 4 filas la tienen y ese mismo costo está registrado como salida de caja
// "Transporte / Uber" — restarla dejaba esos $12.286 contados dos veces. Desde
// que existen órdenes el costo vive en `ordenes.delivery` y se resta arriba.
// Las órdenes previas al corte no se tocan: ese delivery se pagó por fuera y
// esos meses ya están conciliados con el banco.
//
// Recibe las filas crudas de Supabase, sin enriquecer:
//   ventas  { litros, precio_venta }        ordenes { fecha, delivery, delivery_cobrado }
//   compras { precio_total, es_inversion }  caja    { tipo, categoria, monto }
export function calcularSaldoCaja({ ventas = [], ordenes = [], compras = [], caja = [] }) {
  const n = (x) => parseFloat(x) || 0
  const totalVentas = (ventas || []).reduce((s, v) => s + n(v.litros) * n(v.precio_venta), 0)
  const ordCorte = (ordenes || []).filter(o => (o.fecha || '') >= FECHA_CORTE_DELIVERY)
  const deliveryCobrado = ordCorte.reduce((s, o) => s + n(o.delivery_cobrado), 0)
  const costoDelivery = ordCorte.reduce((s, o) => s + n(o.delivery), 0)
  const totalCompras = (compras || []).reduce((s, c) => s + (c.es_inversion ? 0 : n(c.precio_total)), 0)
  const entradasManuales = (caja || []).filter(m => m.tipo === 'entrada' && m.categoria !== 'Venta').reduce((s, m) => s + n(m.monto), 0)
  const salidasManuales = (caja || []).filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos').reduce((s, m) => s + n(m.monto), 0)
  return totalVentas + deliveryCobrado - costoDelivery - totalCompras + entradasManuales - salidasManuales
}
