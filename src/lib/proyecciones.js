// ─────────────────────────────────────────────────────────────────────────────
// Módulo de PROYECCIONES
// Calcula el ritmo histórico real del negocio y proyecta a futuro.
// Lo usan: "Camino al Bar" (proyección de capital a 18 meses) y la vista
// "Proyecciones" (3 escenarios a 30/60/90 días).
//
// Principio: NO inventar números. Todo parte del promedio histórico real.
// ─────────────────────────────────────────────────────────────────────────────

import { calcularRentabilidad } from './rentabilidad'

// Parsea "YYYY-MM-DD" sin desfase de zona horaria
function parseFecha(f) {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Calcula el ritmo histórico del negocio: ingreso y utilidad promedio por día,
 * a partir de las ventas reales registradas.
 *
 * @param {Array}  ventas             filas de `ventas`
 * @param {Object} rentabilidad       resultado de calcularRentabilidad() — para sacar
 *                                    el margen operativo histórico
 * @returns {Object} { diasActivos, ingresoDiario, utilidadDiaria, ingresoMensual,
 *                      utilidadMensual, margenOperativo }
 */
export function calcularRitmo(ventas = [], rentabilidad = null) {
  if (!ventas.length) {
    return {
      diasActivos: 0, ingresoDiario: 0, utilidadDiaria: 0,
      ingresoMensual: 0, utilidadMensual: 0, margenOperativo: 0,
    }
  }

  // Rango de días entre la primera y la última venta (mínimo 1)
  const fechas = ventas.map(v => parseFecha(v.fecha).getTime())
  const min = Math.min(...fechas)
  const max = Math.max(...fechas)
  const diasCalendario = Math.max(1, Math.round((max - min) / (1000 * 60 * 60 * 24)) + 1)

  const ingresoTotal = ventas.reduce((s, v) => s + v.litros * v.precio_venta, 0)
  const ingresoDiario = ingresoTotal / diasCalendario
  const ingresoMensual = ingresoDiario * 30

  // Margen operativo: si viene la rentabilidad la usamos, si no asumimos 0
  const margenOperativo = rentabilidad && rentabilidad.margenOperativo != null
    ? rentabilidad.margenOperativo
    : 0
  const utilidadDiaria = ingresoDiario * margenOperativo
  const utilidadMensual = utilidadDiaria * 30

  return {
    diasActivos: diasCalendario,
    ingresoDiario,
    utilidadDiaria,
    ingresoMensual,
    utilidadMensual,
    margenOperativo,
  }
}

/**
 * Proyecta el capital acumulado a N meses según el ritmo actual.
 * Usado por "Camino al Bar" para el indicador de capital.
 *
 * @param {number} patrimonioActual   patrimonio neto de hoy
 * @param {number} utilidadMensual    utilidad operativa mensual histórica
 * @param {number} meses              horizonte (ej: 18)
 * @returns {number} capital proyectado
 */
export function proyectarCapital(patrimonioActual, utilidadMensual, meses) {
  return patrimonioActual + utilidadMensual * meses
}

/**
 * Genera los 3 escenarios de proyección financiera a 30/60/90 días.
 *
 * @param {Object} p
 * @param {Object} p.ritmo            resultado de calcularRitmo()
 * @param {number} p.cajaActual       caja disponible hoy
 * @param {number} p.inventarioActual valor del inventario rotable hoy
 * @param {number} p.patrimonioActual patrimonio neto hoy
 * @param {number} p.gastoFijoMensual gasto fijo estimado mensual (para punto de equilibrio)
 * @returns {Object} { optimista, realista, conservador } — cada uno con [30,60,90]
 */
export function generarEscenarios({
  ritmo,
  cajaActual = 0,
  inventarioActual = 0,
  patrimonioActual = 0,
  gastoFijoMensual = 0,
}) {
  // Factores de crecimiento mensual por escenario
  const ESCENARIOS = {
    optimista:    { label: 'Optimista',    factorMensual: 1.20, desc: 'Crecimiento 20% mensual' },
    realista:     { label: 'Realista',     factorMensual: 1.00, desc: 'Mantiene el ritmo actual' },
    conservador:  { label: 'Conservador',  factorMensual: 0.70, desc: 'Caída 30% (invierno chileno)' },
  }

  const hitos = [30, 60, 90]

  const construir = ({ factorMensual }) => {
    return hitos.map(dias => {
      const meses = dias / 30
      // Ingreso/utilidad acumulada aplicando el factor compuesto mes a mes.
      // Si factor=1 es lineal; si !=1 es geométrico.
      let ingresoAcum = 0
      let utilidadAcum = 0
      for (let m = 1; m <= Math.ceil(meses); m++) {
        const fraccionMes = Math.min(1, meses - (m - 1))
        const factor = Math.pow(factorMensual, m - 1)
        ingresoAcum += ritmo.ingresoMensual * factor * fraccionMes
        utilidadAcum += ritmo.utilidadMensual * factor * fraccionMes
      }

      const cashProyectado = cajaActual + utilidadAcum
      // El inventario se asume estable (se repone lo que se consume); en el
      // escenario optimista crece proporcional al ritmo de ventas.
      const inventarioProyectado = factorMensual > 1
        ? inventarioActual * Math.pow(factorMensual, meses)
        : inventarioActual
      const patrimonioProyectado = patrimonioActual + utilidadAcum

      return {
        dias,
        ingresoAcumulado: ingresoAcum,
        utilidadAcumulada: utilidadAcum,
        cash: cashProyectado,
        inventario: inventarioProyectado,
        patrimonio: patrimonioProyectado,
      }
    })
  }

  // Punto de equilibrio mensual: cuánto hay que vender para cubrir el gasto fijo,
  // dado el margen operativo histórico. Si margen <= 0, no es calculable.
  const puntoEquilibrioMensual = ritmo.margenOperativo > 0
    ? gastoFijoMensual / ritmo.margenOperativo
    : null

  return {
    optimista:    { ...ESCENARIOS.optimista,    hitos: construir(ESCENARIOS.optimista) },
    realista:     { ...ESCENARIOS.realista,     hitos: construir(ESCENARIOS.realista) },
    conservador:  { ...ESCENARIOS.conservador,  hitos: construir(ESCENARIOS.conservador) },
    puntoEquilibrioMensual,
  }
}

// Re-export por conveniencia para quien importe solo este módulo
export { calcularRentabilidad }
