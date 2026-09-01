// ─── Módulo central de inventario ────────────────────────────────────────────
// Única fuente de verdad para mover `insumos.stock_actual`. Toda venta, compra
// o ajuste que deba tocar el stock pasa por aquí, para que los tres puntos de
// la app (página Ventas, conversión de Comandas y registro de Compras) usen
// exactamente la misma lógica.
//
// NOTA sobre concurrencia: el patrón aquí es "leer stock_actual → sumar delta →
// escribir". Si dos dispositivos guardan a la vez sobre el mismo insumo, una
// escritura puede pisar a la otra y perderse un movimiento. Para volverlo
// atómico habría que mover el ajuste a un RPC/trigger en Supabase. Por ahora se
// mantiene en cliente para no introducir una migración de base.

import { supabase } from './supabase'

// Fallback si `config.merma_pct` no está en la base. La merma REAL se lee de
// config vía cargarMerma(): si el dueño la cambia en Ajustes, el costeo y el
// descuento de bodega tienen que moverse juntos o los márgenes dejan de cuadrar.
const MERMA_DEFAULT = 0.08

// Lee la merma configurada. Se cachea por sesión: cambiarla es raro y esto se
// llama en cada venta.
let _mermaCache = null
export async function cargarMerma() {
  if (_mermaCache != null) return _mermaCache
  const { data } = await supabase.from('config').select('clave, valor').eq('clave', 'merma_pct')
  const v = parseFloat(data?.[0]?.valor)
  _mermaCache = Number.isFinite(v) ? v : MERMA_DEFAULT
  return _mermaCache
}

// ─── Movimientos por VENTAS ──────────────────────────────────────────────────
// Calcula cuánto descontar/reintegrar de cada insumo para un set de ítems.
// `signo`: -1 para descontar (venta nueva), +1 para reintegrar (venta borrada/editada).
// Aplica merma del 8% al INSUMO al descontar; al reintegrar se devuelve el mismo
// monto que se descontó originalmente (con merma incluida) para que el reverso
// sea exacto. ENVASE se cuenta como un insumo más, EXCEPTO si la venta tiene
// "envase devuelto" (en cuyo caso el frasco vuelve al stock al instante).
// Acepta opcionalmente `insumosMap` = { nombre.toLowerCase: { aplica_merma } }.
// Si un insumo tiene aplica_merma=false, su descuento no se infla con merma.
export function calcularMovimientosStock(itemsValidos, ingredientesPorReceta, signo, insumosMap = {}, merma = MERMA_DEFAULT) {
  const movs = {} // { insumo_nombre: cantidad (con signo) }
  itemsValidos.forEach(it => {
    const litros = parseFloat(it.litros) || 1
    const devuelve = !!it.devuelve_envase || it.nota === 'envase devuelto'
    const ingsReceta = ingredientesPorReceta[it.receta_nombre] || []
    ingsReceta.forEach(ing => {
      // "Envase" abarca el legacy 'ENVASE' y cualquier insumo 'Frascos *'.
      const nombre = ing.insumo_nombre || ''
      const esEnvase = nombre === 'ENVASE' || nombre.startsWith('Frascos ')
      // Si el cliente devuelve el envase, no se descuenta ni se reintegra.
      if (esEnvase && devuelve) return
      // Merma aplica a insumos consumibles fraccionables. Se excluye:
      // - Cualquier envase/frasco (reutilizable).
      // - Insumos marcados aplica_merma=false en BD (latas cerradas, etc.).
      const meta = insumosMap[nombre.toLowerCase()]
      const aplicaMermaInsumo = meta ? meta.aplica_merma !== false : true
      const factorMerma = (esEnvase || !aplicaMermaInsumo) ? 1 : (1 + merma)
      const cantidad = ing.cantidad * litros * factorMerma
      movs[nombre] = (movs[nombre] || 0) + cantidad * signo
    })
  })
  return movs
}

// Aplica un set de movimientos al stock (puede ser mezcla de + y -).
//
// Devuelve { ok, fallidos, faltantes, truncados }:
//   - faltantes: insumos que NO existen con ese nombre exacto en la tabla. Antes
//     se ignoraban en silencio: el `.in()` no los devolvía, no se actualizaba
//     nada, y el toast decía "guardado ✓" con la bodega intacta. Es la causa más
//     probable del descuadre entre lo comprado y lo que hay en bodega.
//   - truncados: el descuento pedía más de lo que había y se cortó en 0. Importa
//     avisar porque el reverso (reintegrarStock) devuelve el monto COMPLETO, así
//     que cada ciclo descontar→borrar infla el inventario con producto que no existe.
// `fallidos` incluye faltantes y errores de update, así los callers que ya miran
// ese campo avisan sin cambiar nada.
export async function aplicarMovimientosStock(movs) {
  const nombresInsumos = Object.keys(movs).filter(n => movs[n] !== 0)
  if (nombresInsumos.length === 0) return { ok: true, fallidos: [], faltantes: [], truncados: [] }
  const { data: stocks, error } = await supabase
    .from('insumos')
    .select('nombre, stock_actual')
    .in('nombre', nombresInsumos)
  if (error || !stocks) {
    return { ok: false, fallidos: nombresInsumos, faltantes: [], truncados: [] }
  }

  const encontrados = new Set(stocks.map(s => s.nombre))
  const faltantes = nombresInsumos.filter(n => !encontrados.has(n))

  const truncados = []
  const resultados = await Promise.all(stocks.map(ins => {
    const delta = movs[ins.nombre] || 0
    const bruto = (ins.stock_actual || 0) + delta
    const nuevo = Math.max(0, bruto)
    if (bruto < 0) truncados.push({ nombre: ins.nombre, faltante: -bruto })
    return supabase.from('insumos').update({ stock_actual: nuevo }).eq('nombre', ins.nombre)
      .then(r => ({ nombre: ins.nombre, error: r.error }))
  }))

  const conError = resultados.filter(r => r.error).map(r => r.nombre)
  const fallidos = [...faltantes, ...conError]
  return { ok: fallidos.length === 0, fallidos, faltantes, truncados }
}

// Carga los ingredientes de las recetas que aparecen en estos ítems.
// Además, inyecta automáticamente el insumo del frasco según el
// `envase_formato` de la receta. Así no hay que crear filas "ENVASE" para
// cada receta nueva en `receta_ingredientes` — el formato de la receta es
// la fuente de verdad.
export async function cargarIngredientes(itemsValidos) {
  const nombresRecetas = [...new Set(itemsValidos.map(it => it.receta_nombre))]
  if (nombresRecetas.length === 0) return {}
  const [{ data: ings }, { data: recetasMeta }] = await Promise.all([
    supabase
      .from('receta_ingredientes')
      .select('receta_nombre, insumo_nombre, cantidad')
      .in('receta_nombre', nombresRecetas),
    supabase
      .from('recetas')
      .select('nombre, envase_formato')
      .in('nombre', nombresRecetas),
  ])
  const porReceta = {}
  ;(ings || []).forEach(i => {
    if (!porReceta[i.receta_nombre]) porReceta[i.receta_nombre] = []
    porReceta[i.receta_nombre].push(i)
  })
  // Inyectar frasco según envase_formato (si no está ya como ingrediente).
  ;(recetasMeta || []).forEach(r => {
    const lista = porReceta[r.nombre] || []
    const yaTieneFrasco = lista.some(x => (x.insumo_nombre || '').startsWith('Frascos '))
    if (yaTieneFrasco) return
    const formato = r.envase_formato || '1lt'
    const insumoEnvase = formato === '475ml' ? 'Frascos 475ml' : 'Frascos 1lt'
    lista.push({ receta_nombre: r.nombre, insumo_nombre: insumoEnvase, cantidad: 1 })
    porReceta[r.nombre] = lista
  })
  return porReceta
}

// Carga la flag aplica_merma de todos los insumos relevantes.
// Devuelve un map { nombre.toLowerCase: { aplica_merma } }.
export async function cargarInsumosMeta() {
  const { data } = await supabase.from('insumos').select('nombre, aplica_merma')
  const map = {}
  ;(data || []).forEach(i => {
    map[(i.nombre || '').toLowerCase()] = { aplica_merma: i.aplica_merma !== false }
  })
  return map
}

// Descuenta ingredientes del stock al registrar una venta (api pública).
export async function descontarStock(itemsValidos) {
  const [ingredientes, insumosMap, merma] = await Promise.all([
    cargarIngredientes(itemsValidos),
    cargarInsumosMeta(),
    cargarMerma(),
  ])
  const movs = calcularMovimientosStock(itemsValidos, ingredientes, -1, insumosMap, merma)
  return aplicarMovimientosStock(movs)
}

// Reintegra stock cuando se borra o edita una venta (lo opuesto a descontar).
export async function reintegrarStock(itemsAnteriores) {
  const [ingredientes, insumosMap, merma] = await Promise.all([
    cargarIngredientes(itemsAnteriores),
    cargarInsumosMeta(),
    cargarMerma(),
  ])
  const movs = calcularMovimientosStock(itemsAnteriores, ingredientes, +1, insumosMap, merma)
  return aplicarMovimientosStock(movs)
}

// Arma el aviso para el operador a partir del resultado de aplicarMovimientosStock.
// Devuelve null si no hay nada que avisar. Un insumo "no está en bodega" casi
// siempre es un nombre que no calza exacto entre la receta y la tabla insumos.
export function mensajeStock(res) {
  if (!res) return null
  const partes = []
  if (res.faltantes?.length) {
    partes.push(`no están en bodega (revisa que el nombre calce exacto): ${res.faltantes.join(', ')}`)
  }
  const conError = (res.fallidos || []).filter(n => !(res.faltantes || []).includes(n))
  if (conError.length) partes.push(`no se pudieron actualizar: ${conError.join(', ')}`)
  if (res.truncados?.length) {
    const d = res.truncados.map(t => `${t.nombre} (faltaban ${Math.round(t.faltante)})`).join(', ')
    partes.push(`quedaron en 0 porque no alcanzaba el stock: ${d}`)
  }
  return partes.length ? partes.join(' · ') : null
}

// ─── Movimientos por COMPRAS ─────────────────────────────────────────────────
// Una compra de insumo SUMA `cantidad` al stock de ese insumo. Solo aplica a
// compras de tipo 'insumo' (los activos fijos no son inventario). `signo` es +1
// al registrar y -1 al revertir (editar/borrar una compra).
export async function ajustarStockPorCompra(insumoNombre, cantidad, signo = 1) {
  const qty = parseFloat(cantidad)
  if (!insumoNombre || !qty || isNaN(qty)) return { ok: true, fallidos: [] }
  return aplicarMovimientosStock({ [insumoNombre]: qty * signo })
}
