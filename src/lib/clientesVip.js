// Determina si un cliente es VIP con el mismo criterio usado en Clientes.js
// (PerfilModal) y alertas.js: tag que contiene "vip" (case-insensitive) o
// 3+ pedidos en `ordenes`, matcheando por cliente_id o por cliente_nombre
// normalizado (trim + lowercase).

function normalizar(s) {
  return (s || '').trim().toLowerCase()
}

export function construirEsVip(clientes = [], ordenes = []) {
  const tagPorId = {}
  const tagPorNombre = {}
  clientes.forEach(c => {
    if (c.id != null) tagPorId[c.id] = (c.tag || '').toLowerCase()
    const key = normalizar(c.nombre)
    if (key) tagPorNombre[key] = (c.tag || '').toLowerCase()
  })

  return (comanda) => {
    const id = comanda.cliente_id
    const nombreKey = normalizar(comanda.cliente_nombre)
    if (!id && !nombreKey) return false

    const tag = (id != null && tagPorId[id]) || tagPorNombre[nombreKey] || ''
    if (tag.includes('vip')) return true

    // Si hay `cliente_id`, ese es el vínculo real y el nombre no suma: contar
    // también por nombre mezclaba homónimos que son personas distintas y los
    // volvía VIP a los dos. El nombre solo se usa cuando no hay id.
    const pedidos = ordenes.filter(o => (id != null
      ? o.cliente_id === id
      : (nombreKey && !o.cliente_id && normalizar(o.cliente_nombre) === nombreKey))
    ).length
    return pedidos >= 3
  }
}
