// ─────────────────────────────────────────────────────────────────────────────
// Módulo SALUD DEL NEGOCIO
// Evalúa si el negocio paga el tiempo del operador, considerando:
//   - Ingreso por hora actual vs costo oportunidad ponderado
//   - Tendencia: comparación semana vs semana y mes vs mes
//   - Umbral de crecimiento mensual configurable (default 5%)
//
// Devuelve un veredicto contextual: optimista, estancado, autosostenible, etc.
// ─────────────────────────────────────────────────────────────────────────────

function parseFecha(f) {
  if (!f) return null
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function diasAtrasISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Helpers de bloque (importados aquí para no depender de Horas.js)
function hhmmToMin(s) {
  if (!s) return 0
  const [h, m] = s.split(':').map(Number)
  return h * 60 + (m || 0)
}
function horasBloque(b) {
  if (!b.hora_inicio || !b.hora_fin) return 0
  const mi = hhmmToMin(b.hora_inicio), mf = hhmmToMin(b.hora_fin)
  return mf > mi ? (mf - mi) / 60 : 0
}

/**
 * Calcula ingreso/h y costo oportunidad/h para un rango de fechas dado.
 * Solo considera bloques de horas y ventas que caen en ese rango.
 *
 * @param {Object} p
 * @param {Array}  p.bloques       horas_trabajadas (con persona_id, rol_id)
 * @param {Array}  p.ventas        ventas (con fecha, litros, precio_venta, delivery)
 * @param {Object} p.tarifaDePersona  { id: tarifa } — opcional
 * @param {Object} p.tarifaDeRol      { id: tarifa } — fallback
 * @param {string} p.desde         fecha ISO incluida
 * @param {string} p.hasta         fecha ISO incluida
 */
function calcularPeriodo({ bloques, ventas, tarifaDePersona = {}, tarifaDeRol = {}, desde, hasta }) {
  const blocsRango = bloques.filter(b => b.fecha && b.fecha >= desde && b.fecha <= hasta)
  const vtsRango = ventas.filter(v => v.fecha && v.fecha >= desde && v.fecha <= hasta)

  const horas = blocsRango.reduce((s, b) => s + horasBloque(b), 0)
  const costoOport = blocsRango.reduce((s, b) => {
    const tp = tarifaDePersona[b.persona_id]
    const tarifa = (tp != null && !isNaN(parseFloat(tp))) ? parseFloat(tp) : (tarifaDeRol[b.rol_id] || 0)
    return s + horasBloque(b) * tarifa
  }, 0)
  const ingreso = vtsRango.reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0)

  return {
    horas,
    ingreso,
    costoOport,
    ingresoPorHora: horas > 0 ? ingreso / horas : 0,
    costoOportPorHora: horas > 0 ? costoOport / horas : 0,
  }
}

/**
 * Evalúa la salud del negocio: ¿paga el tiempo? ¿está creciendo? proyección.
 *
 * @param {Object} p mismas keys que calcularPeriodo + umbralCrecimientoMes
 * @returns veredicto + métricas
 */
export function evaluarSaludNegocio({
  bloques = [],
  ventas = [],
  tarifaDePersona = {},
  tarifaDeRol = {},
  umbralCrecimientoMes = 0.05,
}) {
  const hoy = new Date()
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`

  // ── Periodos comparativos ────────────────────────────────────────────────
  // Semana actual (últimos 7 días) vs semana anterior (días 8-14)
  const sem1Desde = diasAtrasISO(6)
  const sem2Desde = diasAtrasISO(13), sem2Hasta = diasAtrasISO(7)

  // Mes actual (últimos 30 días) vs mes anterior (días 31-60)
  const mes1Desde = diasAtrasISO(29)
  const mes2Desde = diasAtrasISO(59), mes2Hasta = diasAtrasISO(30)

  const semActual = calcularPeriodo({ bloques, ventas, tarifaDePersona, tarifaDeRol, desde: sem1Desde, hasta: hoyISO })
  const semAnterior = calcularPeriodo({ bloques, ventas, tarifaDePersona, tarifaDeRol, desde: sem2Desde, hasta: sem2Hasta })
  const mesActual = calcularPeriodo({ bloques, ventas, tarifaDePersona, tarifaDeRol, desde: mes1Desde, hasta: hoyISO })
  const mesAnterior = calcularPeriodo({ bloques, ventas, tarifaDePersona, tarifaDeRol, desde: mes2Desde, hasta: mes2Hasta })

  // ── Crecimiento del ingreso/h ────────────────────────────────────────────
  const crecimientoSemana = semAnterior.ingresoPorHora > 0
    ? (semActual.ingresoPorHora - semAnterior.ingresoPorHora) / semAnterior.ingresoPorHora
    : null
  const crecimientoMes = mesAnterior.ingresoPorHora > 0
    ? (mesActual.ingresoPorHora - mesAnterior.ingresoPorHora) / mesAnterior.ingresoPorHora
    : null

  // ── Proyección: cuántos meses hasta cubrir la tarifa ─────────────────────
  // Solo aplica si hoy no cubre, hay crecimiento mensual positivo y tarifa > 0
  let mesesParaCubrir = null
  if (mesActual.costoOportPorHora > 0 &&
      mesActual.ingresoPorHora > 0 &&
      mesActual.ingresoPorHora < mesActual.costoOportPorHora &&
      crecimientoMes != null && crecimientoMes > 0) {
    // ingreso/h × (1 + crec)^m = tarifa → m = log(tarifa/ingreso) / log(1+crec)
    mesesParaCubrir = Math.log(mesActual.costoOportPorHora / mesActual.ingresoPorHora) / Math.log(1 + crecimientoMes)
  }

  // ── Veredicto contextual ─────────────────────────────────────────────────
  const cubreHoy = mesActual.ingresoPorHora >= mesActual.costoOportPorHora && mesActual.costoOportPorHora > 0
  const datosInsuficientes = mesActual.horas === 0 || mesActual.ingresoPorHora === 0
  const creceMes = crecimientoMes != null && crecimientoMes >= umbralCrecimientoMes
  const decreceMes = crecimientoMes != null && crecimientoMes < -0.02 // -2% se considera caída

  let veredicto, color, mensaje
  if (datosInsuficientes) {
    veredicto = 'sin_datos'
    color = 'var(--muted)'
    mensaje = 'Aún no hay datos suficientes. Registra horas regularmente para evaluar la salud del negocio.'
  } else if (cubreHoy) {
    if (decreceMes) {
      veredicto = 'autosostenible_en_riesgo'
      color = '#f59e0b'
      mensaje = 'Aún cubres tu costo oportunidad, pero tu ingreso/h está cayendo. Revisa qué cambió.'
    } else {
      veredicto = 'autosostenible'
      color = 'var(--green)'
      mensaje = '✓ El negocio paga tu tiempo. Foco en sostener y escalar.'
    }
  } else {
    // No cubre todavía
    if (creceMes) {
      veredicto = 'optimista'
      color = 'var(--cyan)'
      mensaje = mesesParaCubrir != null
        ? `🚀 Aún no cubre tu tarifa, pero crece ${(crecimientoMes*100).toFixed(0)}%/mes. A este ritmo, cubrirías tu costo oportunidad en ~${Math.ceil(mesesParaCubrir)} meses.`
        : `🚀 Aún no cubre tu tarifa, pero crece ${(crecimientoMes*100).toFixed(0)}%/mes. Mantén el rumbo.`
    } else if (decreceMes) {
      veredicto = 'retrocede'
      color = 'var(--pink)'
      mensaje = `📉 Tu ingreso/h está cayendo (${(crecimientoMes*100).toFixed(0)}%/mes). Atención: revisa qué cambió y considera ajustes.`
    } else {
      veredicto = 'estancado'
      color = 'var(--pink)'
      const crecTxt = crecimientoMes != null ? `(${(crecimientoMes*100).toFixed(0)}%/mes)` : ''
      mensaje = `⚠️ El negocio está estancado bajo tu tarifa ${crecTxt}. Esto requiere repensar: precio, mix de productos, costos, o si el modelo necesita cambio.`
    }
  }

  return {
    veredicto,
    color,
    mensaje,
    cubreHoy,
    datosInsuficientes,
    mesActual,
    mesAnterior,
    semActual,
    semAnterior,
    crecimientoSemana,
    crecimientoMes,
    mesesParaCubrir,
    umbralCrecimientoMes,
  }
}
