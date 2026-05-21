// ─────────────────────────────────────────────────────────────────────────────
// Módulo de cálculo financiero MES A MES
// Para cada mes con datos: ingresos, COGS, margen bruto, margen operativo,
// sueldo del operador (split_sueldo_pct del margen op) y reposición.
//
// Usado por la página "Mi Dinero" (P4): tablero mensual y cálculo de runway.
// ─────────────────────────────────────────────────────────────────────────────

import { calcularRentabilidad } from './rentabilidad'

// Devuelve "YYYY-MM" desde una fecha "YYYY-MM-DD"
function mesDe(fechaISO) {
  if (!fechaISO) return null
  return fechaISO.slice(0, 7)
}

// Parsea "YYYY-MM-DD" sin desfase de zona horaria
function parseFecha(f) {
  if (!f) return null
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Genera datos financieros mes a mes desde los registros del negocio.
 *
 * @param {Object} p
 * @param {Array}  p.ventas        filas de `ventas` con fecha, litros, precio_venta, delivery, receta_nombre
 * @param {Array}  p.gastosCaja    filas de `caja` tipo salida con fecha, monto, categoria
 * @param {Array}  p.recetaIngredientes
 * @param {Array}  p.insumosPPP
 * @param {Object} p.config        { merma_pct, costo_envase, split_sueldo_pct, split_reposicion_pct }
 *
 * @returns {Array} array ordenado por mes DESC, cada item:
 *   { mes, ingresos, cogs, margenBruto, margenOperativo,
 *     pctBruto, pctOperativo, sueldo, reposicion, esNegativo }
 */
export function calcularFinanzasMensuales({
  ventas = [],
  gastosCaja = [],
  recetaIngredientes = [],
  insumosPPP = [],
  config = {},
}) {
  const splitSueldo = parseFloat(config.split_sueldo_pct) || 0.45
  const splitReposicion = parseFloat(config.split_reposicion_pct) || 0.55

  // Agrupar ventas por mes
  const ventasPorMes = {}
  ventas.forEach(v => {
    const m = mesDe(v.fecha)
    if (!m) return
    if (!ventasPorMes[m]) ventasPorMes[m] = []
    ventasPorMes[m].push(v)
  })

  // Agrupar gastos por mes
  const gastosPorMes = {}
  gastosCaja.forEach(g => {
    const m = mesDe(g.fecha)
    if (!m) return
    if (!gastosPorMes[m]) gastosPorMes[m] = []
    gastosPorMes[m].push(g)
  })

  // Conjunto de meses que tienen al menos un movimiento
  const meses = new Set([...Object.keys(ventasPorMes), ...Object.keys(gastosPorMes)])

  // Para cada mes, correr el cálculo de rentabilidad acotado a ese mes
  const filas = []
  meses.forEach(mes => {
    const ventasMes = ventasPorMes[mes] || []
    const gastosMes = gastosPorMes[mes] || []
    const rent = calcularRentabilidad({
      ventas: ventasMes,
      recetaIngredientes,
      insumosPPP,
      gastosCaja: gastosMes,
      config,
    })
    // El sueldo del operador es el split aplicado al margen operativo.
    // Si el margen operativo es negativo, el sueldo se trunca a 0 (no se puede
    // pagar un sueldo de un mes con pérdida), pero se marca el flag para que
    // la UI lo señale.
    const margenOp = rent.gananciaOperativa
    const esNegativo = margenOp < 0
    const sueldo = esNegativo ? 0 : margenOp * splitSueldo
    const reposicion = esNegativo ? 0 : margenOp * splitReposicion

    filas.push({
      mes,
      ingresos: rent.ingresos,
      cogs: rent.cogs,
      publicidad: rent.publicidad,
      transporte: rent.transporte,
      otrosGastos: rent.otrosGastos,
      margenBruto: rent.gananciaBruta,
      margenOperativo: margenOp,
      pctBruto: rent.margenBruto,
      pctOperativo: rent.margenOperativo,
      sueldo,
      reposicion,
      esNegativo,
    })
  })

  // Ordenar mes desc
  filas.sort((a, b) => b.mes.localeCompare(a.mes))
  return filas
}

/**
 * Promedio del sueldo de los últimos N meses con datos reales.
 * Útil para el cálculo de runway (no usar el último mes solo, demasiado volátil).
 *
 * @param {Array} filas resultado de calcularFinanzasMensuales
 * @param {number} n número de meses a promediar (default 3)
 */
export function sueldoPromedio(filas, n = 3) {
  if (!filas || filas.length === 0) return 0
  // Excluir el mes corriente porque está incompleto; tomar de los demás
  const mesActual = new Date().toISOString().slice(0, 7)
  const completos = filas.filter(f => f.mes !== mesActual).slice(0, n)
  if (completos.length === 0) return 0
  const suma = completos.reduce((s, f) => s + f.sueldo, 0)
  return suma / completos.length
}

/**
 * Calcula runway simple: cuántos meses cubre el colchón si hay déficit.
 *
 * @param {number} sueldoMensual  ingreso mensual estimado de The Drink
 * @param {number} gasto          gasto personal mensual
 * @param {number} colchon        plata disponible fuera de The Drink
 *
 * @returns {Object} { autosostenible, deficit, mesesAire, superavit }
 */
export function calcularRunway(sueldoMensual, gasto, colchon) {
  const deficit = Math.max(0, gasto - sueldoMensual)
  const superavit = Math.max(0, sueldoMensual - gasto)
  const autosostenible = sueldoMensual >= gasto && gasto > 0
  const mesesAire = autosostenible
    ? Infinity
    : (deficit > 0 ? colchon / deficit : Infinity)
  return { autosostenible, deficit, superavit, mesesAire }
}
