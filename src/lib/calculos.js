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
    const pppEnvase = insumoMap[insumoEnvase]
    if (pppEnvase != null && pppEnvase > 0) {
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

// Fecha de corte del nuevo manejo de delivery. Desde esta fecha, el costo de
// delivery (lo que se paga a Uber/motoboy) se descuenta del saldo de caja, y el
// cobro al cliente se suma. Antes de esta fecha el delivery se manejaba distinto
// (cobro como movimiento manual en caja, costo pagado por fuera), y esos meses
// ya estan conciliados con el banco: NO se recalculan.
export const FECHA_CORTE_DELIVERY = '2026-07-01'
