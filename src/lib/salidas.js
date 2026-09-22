// ─── Salidas sin venta ───────────────────────────────────────────────────────
// Producto que salió de bodega y nadie pagó: consumo interno, pruebas para
// contenido, desarrollo de recetas, canjes con influencers, roturas.
//
// Reglas (ver supabase/migrations/20260914_salidas_sin_venta.sql):
//   - NO es una venta: no toca `ventas`, `ordenes` ni `caja`.
//   - Descuenta bodega con el mismo motor que una venta (lib/inventario.js).
//   - Se valoriza a COSTO (PPP del momento, con merma y envase), nunca a
//     precio de venta. El número queda congelado en `costo_valorizado`.
//   - En el P&L cae entre margen bruto y margen operativo, por motivo.
//
// Este módulo es puro: no toca la base. Lo usan la página Salidas (para
// valorizar al registrar), rentabilidad.js (para el P&L), Conteo y Stock.

import { calcularCostoReceta, envaseDesdeReceta, leerMerma } from './calculos'

// Orden = orden en que se muestran los chips y las líneas del desglose.
export const MOTIVOS_SALIDA = [
  { id: 'marketing',       label: 'Marketing',       desc: 'Contenido, fotos, reels, degustaciones' },
  { id: 'canje',           label: 'Canje',           desc: 'Influencers, colaboraciones, trueques' },
  { id: 'desarrollo',      label: 'Desarrollo',      desc: 'Pruebas de receta, ajustes de proporciones' },
  { id: 'consumo_interno', label: 'Consumo interno', desc: 'Te lo tomaste tú o el equipo' },
  { id: 'merma',           label: 'Merma',           desc: 'Se rompió, se venció, se derramó' },
]

export const labelMotivo = (id) => MOTIVOS_SALIDA.find(m => m.id === id)?.label || id

// ── Valorización ─────────────────────────────────────────────────────────────
// Cuánto costó lo que salió, en CLP, con la misma fórmula que usa Catálogo
// para el "costo por litro" de una receta (merma sobre insumos fraccionables,
// envase según el formato de la receta).
//
//   salida: { receta_nombre, litros, sin_envase } | { insumo_nombre, cantidad }
//   ctx:    { recetaIngredientes, insumos (con costo_ppp, aplica_merma),
//             recetas (con envase_formato), merma, costoEnvaseLegacy }
export function costoSalida(salida, ctx) {
  const merma = leerMerma(ctx.merma)
  if (salida.receta_nombre) {
    const litros = parseFloat(salida.litros) || 0
    const ings = (ctx.recetaIngredientes || []).filter(
      i => i.receta_nombre === salida.receta_nombre && i.insumo_nombre !== 'ENVASE'
    )
    // Sin envase: la prueba se hizo en la coctelera, el frasco sigue en bodega.
    const envase = salida.sin_envase
      ? 0
      : envaseDesdeReceta(salida.receta_nombre, ctx.recetas || [], ctx.costoEnvaseLegacy)
    return calcularCostoReceta(ings, ctx.insumos || [], merma, envase) * litros
  }
  // Insumo suelto: la cantidad que se declara ya es la real, sin merma.
  const nombre = (salida.insumo_nombre || '').toLowerCase()
  const ins = (ctx.insumos || []).find(i => (i.nombre || '').toLowerCase() === nombre)
  return (parseFloat(ins?.costo_ppp) || 0) * (parseFloat(salida.cantidad) || 0)
}

// ── Agrupación para el P&L ───────────────────────────────────────────────────
// Devuelve { porMotivo: { marketing, canje, ... }, total }. Siempre trae las
// cinco claves (en 0 si no hay nada) para que las pantallas no chequeen nulls.
export function agruparSalidasPorMotivo(salidas = []) {
  const porMotivo = {}
  MOTIVOS_SALIDA.forEach(m => { porMotivo[m.id] = 0 })
  let total = 0
  ;(salidas || []).forEach(s => {
    const v = parseFloat(s.costo_valorizado) || 0
    if (!(s.motivo in porMotivo)) porMotivo[s.motivo] = 0
    porMotivo[s.motivo] += v
    total += v
  })
  return { porMotivo, total }
}

// Texto corto para mostrar el desglose: "marketing $12.000 · canje $8.000".
export function resumenMotivos(porMotivo, formatCLP) {
  return MOTIVOS_SALIDA
    .filter(m => (porMotivo[m.id] || 0) > 0)
    .map(m => `${m.label.toLowerCase()} ${formatCLP(porMotivo[m.id])}`)
    .join(' · ')
}

// ── Agrupar filas en salidas ─────────────────────────────────────────────────
// Las líneas cargadas juntas comparten `grupo_id` (un canje de varios tragos).
// Una fila sin grupo (anterior a la migración 20260915) es una salida de una
// sola línea. Conserva el orden en que vienen las filas (fecha desc). Cada
// salida: { key, fecha, motivo, destinatario, nota, lineas, ids, total }.
export function agruparEnSalidas(filas = []) {
  const grupos = new Map()
  ;(filas || []).forEach(f => {
    const key = f.grupo_id || `fila-${f.id}`
    if (!grupos.has(key)) {
      grupos.set(key, {
        key, fecha: f.fecha, motivo: f.motivo, destinatario: f.destinatario, nota: f.nota,
        lineas: [], ids: [], total: 0,
      })
    }
    const g = grupos.get(key)
    g.lineas.push(f)
    g.ids.push(f.id)
    g.total += parseFloat(f.costo_valorizado) || 0
  })
  return [...grupos.values()]
}

// Descripción humana de qué salió: "1 lt de Mojito" / "200 ml de Gin".
export function describirSalida(s) {
  if (s.receta_nombre) {
    const l = parseFloat(s.litros) || 0
    return `${Number.isInteger(l) ? l : l.toFixed(2)} lt de ${s.receta_nombre}${s.sin_envase ? ' (sin envase)' : ''}`
  }
  const c = parseFloat(s.cantidad) || 0
  return `${Number.isInteger(c) ? c : c.toFixed(2)} ${s.unidad || ''} de ${s.insumo_nombre}`.replace(/\s+/g, ' ')
}
