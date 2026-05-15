// ─────────────────────────────────────────────────────────────────────────────
// Módulo central de RENTABILIDAD
// Un solo lugar que calcula los tres márgenes, para que Dashboard y Análisis
// nunca diverjan. Antes el Dashboard calculaba COGS real desde recetas y
// Análisis mezclaba todas las compras no-inversión: ahora ambos usan esto.
// ─────────────────────────────────────────────────────────────────────────────

import { calcularCostoReceta } from './calculos'

// Tarifa de costo de oportunidad del operador. Si no hay horas registradas o
// la tarifa es 0, el margen neto = margen operativo (no se descuenta nada).
export const COSTO_OPORTUNIDAD_DEFAULT = 0 // $/hora — configurable desde Ajustes

/**
 * Calcula los tres márgenes del negocio.
 *
 * @param {Object} p
 * @param {Array}  p.ventas        filas de `ventas` (litros, precio_venta, receta_nombre, delivery)
 * @param {Array}  p.recetaIngredientes filas de `receta_ingredientes`
 * @param {Array}  p.insumosPPP    filas de `insumos` con { nombre, costo_ppp }
 * @param {Array}  p.gastosCaja    filas de `caja` tipo salida (monto, categoria)
 * @param {Object} p.config        { merma_pct, costo_envase }
 * @param {number} p.horasTrabajadas total de horas registradas (opcional)
 * @param {number} p.costoHora     tarifa $/h del operador (opcional)
 *
 * @returns {Object} desglose completo de rentabilidad
 */
export function calcularRentabilidad({
  ventas = [],
  recetaIngredientes = [],
  insumosPPP = [],
  gastosCaja = [],
  config = {},
  horasTrabajadas = 0,
  costoHora = 0,
}) {
  const merma = parseFloat(config.merma_pct) || 0.08
  const costoEnvase = parseFloat(config.costo_envase) || 794.6

  // ── Ingresos ───────────────────────────────────────────────────────────────
  const ingresos = ventas.reduce((s, v) => s + v.litros * v.precio_venta, 0)

  // ── COGS: costo de insumos consumidos según recetas y PPP ──────────────────
  // (incluye merma y costo de envase, igual que la lógica original del Dashboard)
  const costoPorReceta = {}
  const recetasUnicas = [...new Set(recetaIngredientes.map(i => i.receta_nombre))]
  recetasUnicas.forEach(nombre => {
    const ings = recetaIngredientes.filter(
      i => i.receta_nombre === nombre && i.insumo_nombre !== 'ENVASE'
    )
    costoPorReceta[nombre] = calcularCostoReceta(ings, insumosPPP, merma, costoEnvase)
  })
  const cogs = ventas.reduce((s, v) => {
    const cu = costoPorReceta[v.receta_nombre] || 0
    return s + cu * v.litros
  }, 0)

  // ── Gastos variables operativos (NO son COGS) ──────────────────────────────
  // Publicidad: categoría "Publicidad" en caja
  const publicidad = gastosCaja
    .filter(m => m.categoria === 'Publicidad')
    .reduce((s, m) => s + m.monto, 0)

  // Transporte: costo de delivery pagado, registrado en la columna `delivery`
  // de cada venta (lo que The Drink paga a Uber/Motoboy, no lo que cobra)
  const transporte = ventas.reduce((s, v) => s + (v.delivery || 0), 0)

  // Mermas: ya están contempladas dentro del COGS vía merma_pct. Se expone
  // por separado solo para mostrar el monto estimado al usuario.
  const mermasEstimadas = cogs > 0 ? cogs - cogs / (1 + merma) : 0

  // Otros gastos variables: el resto de salidas de caja que no son insumos
  // ni publicidad (suscripciones, equipamiento menor, otros gastos).
  const otrosGastos = gastosCaja
    .filter(m => m.categoria !== 'Publicidad' && m.categoria !== 'Insumos')
    .reduce((s, m) => s + m.monto, 0)

  // ── Costo de oportunidad del operador ──────────────────────────────────────
  const costoOportunidad = (horasTrabajadas || 0) * (costoHora || 0)
  const tieneCostoOportunidad = costoOportunidad > 0

  // ── Los tres márgenes ──────────────────────────────────────────────────────
  const gananciaBruta = ingresos - cogs
  const margenBruto = ingresos > 0 ? gananciaBruta / ingresos : 0

  const gananciaOperativa = gananciaBruta - publicidad - transporte - otrosGastos
  const margenOperativo = ingresos > 0 ? gananciaOperativa / ingresos : 0

  const gananciaNeta = gananciaOperativa - costoOportunidad
  const margenNeto = ingresos > 0 ? gananciaNeta / ingresos : 0

  return {
    ingresos,
    cogs,
    costoPorReceta,
    // pesos
    gananciaBruta,
    gananciaOperativa,
    gananciaNeta,
    // porcentajes
    margenBruto,
    margenOperativo,
    margenNeto,
    // desglose de gastos
    publicidad,
    transporte,
    mermasEstimadas,
    otrosGastos,
    costoOportunidad,
    tieneCostoOportunidad,
  }
}
