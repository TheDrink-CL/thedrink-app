// ─── Módulo central de inventario ────────────────────────────────────────────
// Única fuente de verdad para mover `insumos.stock_actual` desde el cliente:
// ventas (página Ventas y conversión de Comandas) y salidas sin venta.
//
// Las COMPRAS ya no pasan por aquí: el trigger `compras_stock_trg`
// (migración 20260919_stock_atomico) suma al insertar, resta al borrar y
// ajusta la diferencia al editar. Antes lo hacían el trigger histórico Y el
// cliente, y cada compra entraba dos veces a bodega. Desde 20260921 el mismo
// trigger manda la compra de un insumo que "rinde" otro (Azúcar → Goma × 1,5)
// directo al destino: ver «Insumos que rinden otro» más abajo.
//
// La resta la hace la base (RPC `ajustar_stock`, un solo UPDATE atómico), no
// el navegador: dos dispositivos guardando a la vez ya no se pisan. Y no se
// corta en 0: un stock negativo es información ("se vendió más de lo que la
// app sabía que había" = falta registrar una compra o el conteo estaba mal),
// no algo que esconder. Cortarlo en 0 creaba stock fantasma: el descuento se
// truncaba pero el reintegro al editar/borrar el pedido devolvía el monto
// completo.

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

// ─── Insumos que "rinden" otro (Azúcar → Goma) ───────────────────────────────
// `insumos.rinde_insumo` / `rinde_factor` (migración 20260921): un insumo que
// se compra pero no se stockea. Azúcar rinde Goma × 1,5: la compra de azúcar
// entra a bodega como goma (lo hace el trigger de compras en la base) y el
// PPP de la goma se deriva del del azúcar (trigger en `insumos`). Del lado
// del cliente el azúcar solo existe en Compras: Stock, Conteo, Salidas y las
// recetas trabajan con la goma. Un movimiento que igual nombre al azúcar se
// enruta acá a la goma, para que no quede stock escondido en un insumo que
// nadie mira.

// Los que sí están en bodega: todo menos los que rinden otro.
export const insumosEnBodega = (insumos) => (insumos || []).filter(i => !i.rinde_insumo)

// Los que se compran: todo menos los que se obtienen de otro. La goma no se
// compra, se compra azúcar; una compra de goma le pisaría el PPP derivado.
export const insumosQueSeCompran = (insumos) => {
  const derivados = new Set((insumos || []).map(i => i.rinde_insumo).filter(Boolean))
  return (insumos || []).filter(i => !derivados.has(i.nombre))
}

// { nombre: delta } → lo mismo, con los insumos que rinden otro sumados en su
// destino y multiplicados por el factor.
function enrutarMovimientos(movs, insumosMap) {
  const out = {}
  Object.entries(movs).forEach(([nombre, delta]) => {
    const meta = insumosMap[nombre.toLowerCase()]
    const destino = meta?.rinde_insumo || nombre
    const factor = meta?.rinde_insumo ? (meta.rinde_factor || 1) : 1
    out[destino] = (out[destino] || 0) + delta * factor
  })
  return out
}

// ─── Movimientos por VENTAS ──────────────────────────────────────────────────
// Empaque que sale con CADA unidad (frasco) aparte de la receta: el sticker y
// las 2 bombillas. Es una regla global, no una fila en cada una de las 40
// recetas. Hasta el 19-sep la hacía un trigger en `ventas` que nunca los
// devolvía al editar/borrar y que los cobraba dos veces a las recetas que ya
// los listaban. Si una receta los trae como ingrediente explícito, manda la
// receta. Sin merma: un sticker no se derrama.
export const EMPAQUE_POR_UNIDAD = { 'Stickers': 1, 'Bombillas': 2 }

// Calcula cuánto descontar/reintegrar de cada insumo para un set de ítems.
// `signo`: -1 para descontar (venta nueva), +1 para reintegrar (venta borrada/editada).
// Aplica merma del 8% al INSUMO al descontar; al reintegrar se devuelve el mismo
// monto que se descontó originalmente (con merma incluida) para que el reverso
// sea exacto. Cada ítem puede traer:
//   - devuelve_envase / nota 'envase devuelto': el frasco vuelve al instante,
//     así que no se descuenta ni se reintegra. El sticker y las bombillas se
//     fueron igual.
//   - sin_envase (salidas sin venta, prueba en coctelera): no hubo frasco, ni
//     sticker, ni bombillas. Solo el líquido.
// Acepta opcionalmente `insumosMap` = { nombre.toLowerCase: { aplica_merma } }.
// Si un insumo tiene aplica_merma=false, su descuento no se infla con merma.
export function calcularMovimientosStock(itemsValidos, ingredientesPorReceta, signo, insumosMap = {}, merma = MERMA_DEFAULT) {
  const movs = {} // { insumo_nombre: cantidad (con signo) }
  itemsValidos.forEach(it => {
    const litros = parseFloat(it.litros) || 1
    const devuelve = !!it.devuelve_envase || it.nota === 'envase devuelto'
    const sinEnvase = !!it.sin_envase
    const ingsReceta = ingredientesPorReceta[it.receta_nombre] || []
    ingsReceta.forEach(ing => {
      // "Envase" abarca el legacy 'ENVASE' y cualquier insumo 'Frascos *'.
      const nombre = ing.insumo_nombre || ''
      const esEnvase = nombre === 'ENVASE' || nombre.startsWith('Frascos ')
      const esEmpaque = Object.prototype.hasOwnProperty.call(EMPAQUE_POR_UNIDAD, nombre)
      if (esEnvase && (devuelve || sinEnvase)) return
      if (esEmpaque && sinEnvase) return
      // Merma aplica a insumos consumibles fraccionables. Se excluye:
      // - Cualquier envase/frasco (reutilizable) y el empaque (unidades enteras).
      // - Insumos marcados aplica_merma=false en BD (latas cerradas, etc.).
      const meta = insumosMap[nombre.toLowerCase()]
      const aplicaMermaInsumo = meta ? meta.aplica_merma !== false : true
      const factorMerma = (esEnvase || esEmpaque || !aplicaMermaInsumo) ? 1 : (1 + merma)
      const cantidad = ing.cantidad * litros * factorMerma
      movs[nombre] = (movs[nombre] || 0) + cantidad * signo
    })
    if (sinEnvase) return
    Object.entries(EMPAQUE_POR_UNIDAD).forEach(([nombre, porUnidad]) => {
      if (ingsReceta.some(ing => ing.insumo_nombre === nombre)) return
      movs[nombre] = (movs[nombre] || 0) + porUnidad * litros * signo
    })
  })
  return movs
}

// Aplica un set de movimientos al stock (puede ser mezcla de + y -).
//
// Devuelve { ok, fallidos, faltantes, negativos }:
//   - faltantes: insumos que NO existen con ese nombre exacto en la tabla. Antes
//     se ignoraban en silencio: no se actualizaba nada y el toast decía
//     "guardado ✓" con la bodega intacta. Casi siempre es un nombre que no
//     calza exacto entre la receta y la tabla insumos.
//   - negativos: insumos que quedaron bajo 0 después de descontar. No es un
//     error del movimiento (se descontó lo que correspondía); es un aviso de
//     que la bodega no tenía registrado lo que realmente había.
// `fallidos` incluye faltantes y errores de update, así los callers que ya miran
// ese campo avisan sin cambiar nada.
const RES_VACIO = { ok: true, fallidos: [], faltantes: [], negativos: [] }

// PostgREST responde así cuando el RPC todavía no existe (migración sin correr).
const esRpcAusente = (error) =>
  error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''))

// `insumosMap` (de cargarInsumosMeta) es opcional: si no viene, se carga acá.
// Los movimientos se enrutan primero (Azúcar → Goma); lo que llega a la base
// ya nombra solo insumos que están en bodega.
export async function aplicarMovimientosStock(movsPedidos, insumosMap = null) {
  const meta = insumosMap || await cargarInsumosMeta()
  const movs = enrutarMovimientos(movsPedidos, meta)
  const nombresInsumos = Object.keys(movs).filter(n => movs[n] !== 0)
  if (nombresInsumos.length === 0) return { ...RES_VACIO }
  const payload = {}
  nombresInsumos.forEach(n => { payload[n] = movs[n] })

  const { data, error } = await supabase.rpc('ajustar_stock', { movs: payload })
  if (esRpcAusente(error)) return aplicarMovimientosStockLegacy(movs)
  if (error || !data) {
    return { ok: false, fallidos: nombresInsumos, faltantes: [], negativos: [] }
  }
  return armarResultado(nombresInsumos, movs, data.map(r => ({ nombre: r.nombre, stock: parseFloat(r.stock_actual) })), [])
}

// Camino viejo (leer → sumar → escribir), solo mientras `ajustar_stock` no
// exista en la base. Sin el corte en 0, por la misma razón que el RPC.
async function aplicarMovimientosStockLegacy(movs) {
  const nombresInsumos = Object.keys(movs).filter(n => movs[n] !== 0)
  const { data: stocks, error } = await supabase
    .from('insumos')
    .select('nombre, stock_actual')
    .in('nombre', nombresInsumos)
  if (error || !stocks) {
    return { ok: false, fallidos: nombresInsumos, faltantes: [], negativos: [] }
  }
  const resultados = await Promise.all(stocks.map(ins => {
    const nuevo = (parseFloat(ins.stock_actual) || 0) + (movs[ins.nombre] || 0)
    return supabase.from('insumos').update({ stock_actual: nuevo }).eq('nombre', ins.nombre)
      .then(r => ({ nombre: ins.nombre, stock: nuevo, error: r.error }))
  }))
  return armarResultado(
    nombresInsumos, movs,
    resultados.filter(r => !r.error),
    resultados.filter(r => r.error).map(r => r.nombre),
  )
}

function armarResultado(pedidos, movs, actualizados, conError) {
  const ok = new Set(actualizados.map(r => r.nombre))
  const faltantes = pedidos.filter(n => !ok.has(n) && !conError.includes(n))
  // Solo avisa el negativo cuando ESTE movimiento descontó: reintegrar un
  // pedido sobre un stock ya negativo no es noticia nueva.
  const negativos = actualizados
    .filter(r => r.stock < 0 && (movs[r.nombre] || 0) < 0)
    .map(r => ({ nombre: r.nombre, stock: r.stock }))
  const fallidos = [...faltantes, ...conError]
  return { ok: fallidos.length === 0, fallidos, faltantes, negativos }
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

// Carga las flags de todos los insumos: merma y a qué insumo rinden.
// Devuelve un map { nombre.toLowerCase: { aplica_merma, rinde_insumo, rinde_factor } }.
export async function cargarInsumosMeta() {
  const { data } = await supabase.from('insumos').select('nombre, aplica_merma, rinde_insumo, rinde_factor')
  const map = {}
  ;(data || []).forEach(i => {
    map[(i.nombre || '').toLowerCase()] = {
      aplica_merma: i.aplica_merma !== false,
      rinde_insumo: i.rinde_insumo || null,
      rinde_factor: parseFloat(i.rinde_factor) || null,
    }
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
  return aplicarMovimientosStock(movs, insumosMap)
}

// Reintegra stock cuando se borra o edita una venta (lo opuesto a descontar).
export async function reintegrarStock(itemsAnteriores) {
  const [ingredientes, insumosMap, merma] = await Promise.all([
    cargarIngredientes(itemsAnteriores),
    cargarInsumosMeta(),
    cargarMerma(),
  ])
  const movs = calcularMovimientosStock(itemsAnteriores, ingredientes, +1, insumosMap, merma)
  return aplicarMovimientosStock(movs, insumosMap)
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
  if (res.negativos?.length) {
    const d = res.negativos.map(t => `${t.nombre} (${Math.round(t.stock)})`).join(', ')
    partes.push(`quedaron en negativo, falta registrar compra o corregir el stock: ${d}`)
  }
  return partes.length ? partes.join(' · ') : null
}

// ─── Movimientos por SALIDAS SIN VENTA ───────────────────────────────────────
// Producto que salió y nadie pagó (consumo interno, marketing, desarrollo,
// canje, merma). Ver lib/salidas.js. Una línea por receta se descuenta EXACTO
// igual que una venta (merma incluida, frasco, sticker y bombillas; con
// `sin_envase` solo el líquido). Una línea de insumo suelto
// descuenta la cantidad declarada tal cual, sin merma: lo que se declara ya es
// lo que realmente salió. `signo` -1 al registrar, +1 al borrar la salida.
//
// Recibe TODAS las líneas de una salida y las aplica en (a lo más) dos
// escrituras: una para las recetas y una para los insumos sueltos. Se agrupan
// para que dos líneas del mismo insumo se sumen antes de ir a la base (y
// porque el camino viejo, leer→sumar→escribir, las haría pisarse).
export async function ajustarStockPorSalidas(lineas, signo = -1) {
  const vacio = { ...RES_VACIO }
  const porReceta = (lineas || [])
    .filter(l => l.receta_nombre)
    .map(l => ({
      receta_nombre: l.receta_nombre,
      litros: parseFloat(l.litros) || 1,
      sin_envase: !!l.sin_envase,
    }))
  const movsInsumo = {}
  ;(lineas || []).filter(l => !l.receta_nombre && l.insumo_nombre).forEach(l => {
    const qty = parseFloat(l.cantidad)
    if (!qty || isNaN(qty)) return
    movsInsumo[l.insumo_nombre] = (movsInsumo[l.insumo_nombre] || 0) + qty * signo
  })

  const resultados = []
  if (porReceta.length > 0) {
    resultados.push(await (signo < 0 ? descontarStock(porReceta) : reintegrarStock(porReceta)))
  }
  if (Object.keys(movsInsumo).length > 0) {
    resultados.push(await aplicarMovimientosStock(movsInsumo))
  }
  if (resultados.length === 0) return vacio
  return resultados.reduce((acc, r) => ({
    ok: acc.ok && !!r.ok,
    fallidos: [...acc.fallidos, ...(r.fallidos || [])],
    faltantes: [...acc.faltantes, ...(r.faltantes || [])],
    negativos: [...acc.negativos, ...(r.negativos || [])],
  }), vacio)
}

// Atajo para una salida de una sola línea.
export async function ajustarStockPorSalida(salida, signo = -1) {
  return ajustarStockPorSalidas([salida], signo)
}
