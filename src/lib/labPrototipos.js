// ─── Materialización de prototipos del LAB ───────────────────────────────────
//
// Un prototipo se vuelve receta real la primera vez que alguien lo pide. Desde
// ahí el resto de la app lo trata como cualquier otro trago: `descontarStock`
// encuentra sus ingredientes, el costeo lo calcula y los reportes lo cuentan.
//
// Por qué bajo demanda y no las 265 de una: en la práctica se van a pedir unas
// pocas decenas. Crear todas ensuciaría el selector de recetas, el catálogo y
// el ranking con cientos de filas que nunca se vendieron.
//
// Por qué materializar en vez de calcular al vuelo: `inventario.js` es el
// punto único donde se mueve el stock y ya tiene un problema conocido de
// concurrencia. Si el prototipo existe como receta normal, ese archivo no se
// toca — que es exactamente lo que se quiere de un módulo crítico.

import { supabase } from './supabase'
import { construirBuild, nombreLegible, ESQUELETOS } from './labCodigos'

// Trae los ingredientes de las recetas molde que necesita un set de specs.
export async function cargarMoldes(specs) {
  const nombres = new Set()
  specs.forEach(s => {
    const e = ESQUELETOS[s.esq]
    if (!e) return
    if (e.refConFruta) nombres.add(e.refConFruta)
    if (e.refSinFruta) nombres.add(e.refSinFruta)
    if (e.refSinFrutaAlt) Object.values(e.refSinFrutaAlt).forEach(n => nombres.add(n))
  })
  if (!nombres.size) return {}
  const { data } = await supabase
    .from('receta_ingredientes')
    .select('receta_nombre, insumo_nombre, cantidad')
    .in('receta_nombre', [...nombres])
  const porReceta = {}
  ;(data || []).forEach(i => {
    if (!porReceta[i.receta_nombre]) porReceta[i.receta_nombre] = []
    porReceta[i.receta_nombre].push(i)
  })
  return porReceta
}

// Nombre con el que se guarda un prototipo. Lleva el código adentro para que
// sea reconocible en el ranking y no choque con las recetas de la carta.
export function nombreReceta(spec) {
  if (spec.recetaGemela) return spec.recetaGemela
  return `${nombreLegible(spec)} [${spec.codigo}]`
}

// Crea la receta si no existe. Idempotente: si ya está, la devuelve tal cual.
// Devuelve { ok, receta_nombre, creada, motivo }.
export async function asegurarReceta(spec, precioVenta, moldes) {
  // Los gemelos ya son recetas de la carta: no se crea nada.
  if (spec.recetaGemela) {
    return { ok: true, receta_nombre: spec.recetaGemela, creada: false, motivo: null }
  }

  // ¿Ya se materializó antes este mismo código?
  const { data: previa } = await supabase
    .from('recetas').select('nombre').eq('lab_codigo', spec.codigo).maybeSingle()
  if (previa) {
    return { ok: true, receta_nombre: previa.nombre, creada: false, motivo: null }
  }

  const build = construirBuild(spec, moldes)
  if (!build.ok) {
    return { ok: false, receta_nombre: null, creada: false, motivo: build.motivo }
  }

  const nombre = nombreReceta(spec)
  const formato = spec.fmt === '475' ? '475ml' : '1lt'

  const { error: errReceta } = await supabase.from('recetas').insert({
    nombre,
    precio_venta: precioVenta || 0,
    envase_formato: formato,
    precio_addons: 0,
    es_prototipo: true,
    lab_codigo: spec.codigo,
  })
  // 23505 = unique_violation: otro dispositivo la creó entre el select y el
  // insert. No es un error real; se reutiliza la que quedó.
  if (errReceta && errReceta.code !== '23505') {
    return { ok: false, receta_nombre: null, creada: false, motivo: errReceta.message }
  }
  if (errReceta && errReceta.code === '23505') {
    return { ok: true, receta_nombre: nombre, creada: false, motivo: null }
  }

  const { error: errIngs } = await supabase.from('receta_ingredientes').insert(
    build.ingredientes.map(i => ({
      receta_nombre: nombre,
      insumo_nombre: i.insumo_nombre,
      cantidad: i.cantidad,
      unidad: /menta|jengibre/i.test(i.insumo_nombre) ? 'g' : 'ml',
    }))
  )
  if (errIngs) {
    // La receta quedó sin ingredientes: si no se avisa, la venta se registra y
    // el stock no se mueve, en silencio. Mejor fallar fuerte acá.
    return {
      ok: false, receta_nombre: null, creada: false,
      motivo: `receta "${nombre}" creada pero sin ingredientes: ${errIngs.message}`,
    }
  }

  return { ok: true, receta_nombre: nombre, creada: true, motivo: null }
}
