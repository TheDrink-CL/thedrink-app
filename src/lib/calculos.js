// Calcula costo total por litro de una receta dado el PPP actual de insumos
export function calcularCostoReceta(ingredientes, insumos, merma = 0.08, costoEnvase = 794.6) {
  const insumoMap = {}
  insumos.forEach(i => { insumoMap[i.nombre.toLowerCase()] = i.costo_ppp })

  let costoInsumos = 0
  ingredientes.forEach(ing => {
    const ppp = insumoMap[ing.insumo_nombre.toLowerCase()] || 0
    costoInsumos += ing.cantidad * ppp
  })

  const costoConMerma = costoInsumos * (1 + merma)
  return costoConMerma + costoEnvase
}

export function formatCLP(n) {
  if (n == null) return '$0'
  return '$' + Math.round(n).toLocaleString('es-CL')
}

export function formatPct(n) {
  if (n == null) return '0%'
  return (n * 100).toFixed(1) + '%'
}
