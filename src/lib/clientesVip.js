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

    const pedidos = ordenes.filter(o =>
      (id != null && o.cliente_id === id) || (nombreKey && normalizar(o.cliente_nombre) === nombreKey)
    ).length
    return pedidos >= 3
  }
}
