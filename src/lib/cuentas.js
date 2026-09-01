// Lógica pura de la sección Cuentas: saldos, agrupación por contraparte y
// planificación de liquidaciones (compensar + pagar).
//
// ⚠ Nada de esto toca la caja ni los movimientos de dinero de la app. Cuentas
// lleva el registro de deudas y su saldo — sirve para saber cuánto hay que
// mover en el BANCO, no para reflejar plata que entró o salió por la caja.

// ─── Saldos ─────────────────────────────────────────────────────────────────

export function totalAbonado(abonos) {
  return (abonos || []).reduce((s, a) => s + (Number(a.monto) || 0), 0)
}

export function saldoDeuda(deuda, abonos) {
  return Math.max(0, (Number(deuda.monto_total) || 0) - totalAbonado(abonos))
}

// ─── Contrapartes ───────────────────────────────────────────────────────────

export const SIN_CONTRAPARTE = '__sin__'

// "  camilo  " y "Camilo" son la misma persona.
export function claveContraparte(nombre) {
  const limpio = (nombre || '').trim().replace(/\s+/g, ' ')
  return limpio ? limpio.toLowerCase() : SIN_CONTRAPARTE
}

export function nombreContraparte(clave, nombre) {
  return clave === SIN_CONTRAPARTE ? 'Sin contraparte' : (nombre || '').trim().replace(/\s+/g, ' ')
}

// Orden en que conviene ir pagando: primero lo que vence antes; lo que no
// tiene fecha va al final, de lo más antiguo a lo más nuevo.
export function ordenarParaPago(items) {
  return [...items].sort((a, b) => {
    const va = a.fecha_vence, vb = b.fecha_vence
    if (va && vb) return va < vb ? -1 : va > vb ? 1 : 0
    if (va) return -1
    if (vb) return 1
    const ca = a.created_at || '', cb = b.created_at || ''
    return ca < cb ? -1 : ca > cb ? 1 : 0
  })
}

/**
 * Agrupa las deudas activas por contraparte y calcula el neto de cada una.
 * neto > 0 → le debo; neto < 0 → me deben.
 */
export function agruparPorContraparte(deudas, abonosPorDeuda) {
  const mapa = new Map()
  for (const d of deudas) {
    if (d.pagada) continue
    const saldo = saldoDeuda(d, abonosPorDeuda(d.id))
    if (saldo <= 0) continue
    const clave = claveContraparte(d.contraparte)
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        clave,
        nombre: nombreContraparte(clave, d.contraparte),
        porPagar: [], porCobrar: [],
        totalPagar: 0, totalCobrar: 0,
      })
    }
    const g = mapa.get(clave)
    const item = {
      id: d.id, descripcion: d.descripcion, saldo,
      fecha_vence: d.fecha_vence, created_at: d.created_at,
    }
    if (d.tipo === 'cobrar') { g.porCobrar.push(item); g.totalCobrar += saldo }
    else { g.porPagar.push(item); g.totalPagar += saldo }
  }
  return [...mapa.values()]
    .map(g => ({
      ...g,
      porPagar: ordenarParaPago(g.porPagar),
      porCobrar: ordenarParaPago(g.porCobrar),
      neto: g.totalPagar - g.totalCobrar,
      // Se puede cruzar por-cobrar contra por-pagar de la misma persona.
      compensable: Math.min(g.totalPagar, g.totalCobrar),
    }))
    .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto))
}

// ─── Plan de liquidación ────────────────────────────────────────────────────

const suma = (items) => items.reduce((s, i) => s + i.saldo, 0)

// Reparte `monto` sobre la lista (que ya viene ordenada), llenando deuda por
// deuda. Muta los saldos de la copia que recibe.
function aplicar(items, monto) {
  const aplicaciones = []
  let restante = Math.max(0, monto)
  for (const it of items) {
    if (restante <= 0) break
    const usar = Math.min(it.saldo, restante)
    if (usar <= 0) continue
    it.saldo -= usar
    restante -= usar
    aplicaciones.push({ id: it.id, descripcion: it.descripcion, monto: usar, quedaEn: it.saldo })
  }
  return { aplicaciones, excedente: restante }
}

/**
 * Arma el plan de un movimiento con una contraparte:
 *  - compensar: cruza lo que me deben contra lo que debo (no mueve plata).
 *  - pago: monto real que transfiero ('pago') o que recibo ('cobro').
 * Devuelve el detalle de a qué deuda va cada peso y cómo queda el neto.
 */
export function construirPlan({ porPagar, porCobrar, compensar, direccion, montoPago }) {
  const P = porPagar.map(d => ({ ...d }))
  const C = porCobrar.map(d => ({ ...d }))
  const antes = { pagar: suma(P), cobrar: suma(C) }
  antes.neto = antes.pagar - antes.cobrar

  let compensado = 0
  let compPagar = [], compCobrar = []
  if (compensar) {
    compensado = Math.min(antes.pagar, antes.cobrar)
    if (compensado > 0) {
      compPagar = aplicar(P, compensado).aplicaciones
      compCobrar = aplicar(C, compensado).aplicaciones
    }
  }

  const lado = direccion === 'cobro' ? C : P
  const pedido = Math.max(0, Math.round(Number(montoPago) || 0))
  const aplicable = Math.min(pedido, suma(lado))
  const { aplicaciones } = aplicar(lado, aplicable)

  const despues = { pagar: suma(P), cobrar: suma(C) }
  despues.neto = despues.pagar - despues.cobrar

  return {
    compensado, compPagar, compCobrar,
    pago: { direccion, monto: aplicable, aplicaciones, excedente: pedido - aplicable },
    antes, despues,
    // Todo lo que hay que escribir como abono, con el lado al que pertenece.
    liquidadas: [...compPagar, ...compCobrar, ...aplicaciones].filter(a => a.quedaEn === 0),
  }
}

export function textoNeto(neto) {
  if (neto === 0) return 'A mano'
  return neto > 0 ? 'Le debo' : 'Me debe'
}
