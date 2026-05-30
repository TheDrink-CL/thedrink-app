// ─────────────────────────────────────────────────────────────────────────────
// Módulo de TIMING de comandas programadas
// El countdown de una comanda programada debe arrancar
//   inicio = hora_objetivo − tiempo_prep − tiempo_delivery
// para que cuando termines de preparar, puedas salir y llegar a tiempo.
//
// tiempo_delivery se resuelve por prioridad:
//   1. tiempo_delivery_min explícito en la comanda
//   2. distancia_km del cliente × min_por_km + buffer
//   3. 0 (retiro o sin info)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estima el tiempo de delivery en minutos.
 * @param {Object} p
 * @param {number|null|undefined} p.tiempoExplicito   minutos manualmente puestos
 * @param {number|null|undefined} p.distanciaKm        km del cliente (opcional)
 * @param {Object} p.config                            { delivery_min_por_km, delivery_buffer_min }
 * @returns {number} minutos estimados de delivery (≥ 0)
 */
export function estimarTiempoDelivery({ tiempoExplicito, distanciaKm, config = {} }) {
  if (tiempoExplicito != null && tiempoExplicito !== '') {
    const n = parseFloat(tiempoExplicito)
    if (!isNaN(n) && n >= 0) return Math.round(n)
  }
  const km = parseFloat(distanciaKm)
  if (!isNaN(km) && km > 0) {
    const porKm = parseFloat(config.delivery_min_por_km) || 2
    const buffer = parseFloat(config.delivery_buffer_min) || 10
    return Math.round(km * porKm + buffer)
  }
  return 0
}

/**
 * Calcula cuántos minutos antes de la hora objetivo debe arrancar el countdown.
 * @param {Object} config { prep_minutos, delivery_min_por_km, delivery_buffer_min }
 * @param {Object} comanda comanda con tiempo_delivery_min y opcionalmente
 *                          distancia_km del cliente vinculado.
 * @returns {number} minutos totales de ventana de preparación
 */
export function ventanaCountdownMin({ config = {}, tiempoDeliveryExplicito, distanciaKmCliente }) {
  const prep = parseFloat(config.prep_minutos) || 30
  const delivery = estimarTiempoDelivery({
    tiempoExplicito: tiempoDeliveryExplicito,
    distanciaKm: distanciaKmCliente,
    config,
  })
  return prep + delivery
}
