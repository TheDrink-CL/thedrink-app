// Calcula costo total por litro de una receta dado el PPP actual de insumos.
//
// `costoEnvase` puede ser:
//   - Un número fijo (compatibilidad legacy con `config.costo_envase`).
//   - Un objeto receta { envase_formato: '1lt' | '475ml' | null } — en cuyo
//     caso el costo se resuelve mirando el PPP del insumo correspondiente.
//
// Si se pasa una receta y existe el insumo del formato indicado, se usa su
// PPP actualizado. Si no, cae al valor numérico legacy (794.6 por defecto).
export function calcularCostoReceta(ingredientes, insumos, merma = 0.08, costoEnvase = 794.6) {
  const insumoMap = {}
  insumos.forEach(i => { insumoMap[i.nombre.toLowerCase()] = i.costo_ppp })

  let costoInsumos = 0
  ingredientes.forEach(ing => {
    const ppp = insumoMap[ing.insumo_nombre.toLowerCase()] || 0
    costoInsumos += ing.cantidad * ppp
  })

  const costoConMerma = costoInsumos * (1 + merma)

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

export function formatCLP(n) {
  if (n == null) return '$0'
  return '$' + Math.round(n).toLocaleString('es-CL')
}

export function formatPct(n) {
  if (n == null) return '0%'
  return (n * 100).toFixed(1) + '%'
}
