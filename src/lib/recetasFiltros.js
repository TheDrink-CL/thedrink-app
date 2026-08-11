// ─── Filtros del catálogo de recetas ─────────────────────────────────────────
//
// El catálogo creció (carta + prototipos que el LAB materializa solo) y
// encontrar un trago pasó a ser un scroll largo. Acá se derivan los dos ejes
// que sirven para buscar —destilado base y familia— SIN tocar el esquema: se
// leen de los ingredientes y del nombre, que ya son la fuente de verdad.
//
// POR QUÉ DERIVADO Y NO UNA COLUMNA `categoria`
// Una columna hay que llenarla a mano en cada receta nueva, y los prototipos
// del LAB nacen sin que nadie los toque: quedarían sin etiqueta y
// desaparecerían de los filtros en silencio. Lo derivado siempre clasifica
// algo, y lo que no calza cae en "Otros", a la vista.
//
// LÍMITE CONOCIDO
// La familia sale de palabras en el nombre. Un trago con nombre de fantasía
// que no diga "mojito", "sour", etc. cae en "Otros" hasta que se agregue su
// patrón acá. No se rompe nada: sigue apareciendo en la lista y en la búsqueda
// por texto.

// Minúsculas y sin tildes. Se conservan espacios y signos porque los patrones
// usan límites de palabra (`\bron\b` no debe matchear "Limonada").
export function norm(str = '') {
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
}

export const SIN_ALCOHOL = 'Sin alcohol'
export const OTROS = 'Otros'

// Destilados base. Se matchea contra el nombre del insumo normalizado, no
// contra marcas exactas: así "Ron Bacardí", "Ron Havana" o un pisco nuevo
// entran solos, sin tocar este archivo.
const DESTILADOS = [
  { tipo: 'Ron',     re: /\bron\b/ },
  { tipo: 'Pisco',   re: /\bpisco\b/ },
  { tipo: 'Gin',     re: /\bgin\b/ },
  { tipo: 'Jäger',   re: /\bjager/ },
  { tipo: 'Vodka',   re: /\bvodka\b/ },
  { tipo: 'Tequila', re: /\btequila\b/ },
  { tipo: 'Whisky',  re: /\bwh?isk(y|ey)\b/ },
]

// Familias de trago, en orden de prioridad. "Frozen mojito" tiene que caer en
// Mojito —que es lo que uno busca— y no en una familia propia de un solo item;
// por eso Mojito va antes que Frozen.
const FAMILIAS = [
  { tipo: 'Sour',    re: /\bsour\b/ },
  { tipo: 'Colada',  re: /colada/ },
  { tipo: 'Daikiri', re: /daikiri|daiquiri/ },
  { tipo: 'Mojito',  re: /mojito/ },
  { tipo: 'Tónica',  re: /tonic/ },
  { tipo: 'Frost',   re: /frost/ },
  { tipo: 'Frozen',  re: /frozen/ },
]

// Los energéticos no se llaman "energético" (Tropical Gin, Berry Bomb): se
// reconocen por la lata que llevan dentro.
const RE_ENERGETICA = /red\s*bull|monster|score/

// Orden en que se muestran los chips. Lo que no esté acá va al final,
// alfabético; "Sin alcohol" y "Otros" siempre últimos.
const ORDEN_BASES = ['Ron', 'Pisco', 'Gin', 'Jäger', 'Vodka', 'Tequila', 'Whisky', SIN_ALCOHOL]
const ORDEN_FAMILIAS = ['Mojito', 'Sour', 'Colada', 'Daikiri', 'Tónica', 'Energético', 'Frost', 'Frozen', OTROS]

// El destilado base es el que más volumen aporta, no el primero que aparece:
// un mojito con curazao sigue siendo de ron, y así un añadido alcohólico nunca
// se roba la clasificación.
export function baseDeReceta(ingredientes = []) {
  let mejor = null
  for (const ing of ingredientes) {
    const n = norm(ing.insumo_nombre)
    if (!n) continue
    const d = DESTILADOS.find(x => x.re.test(n))
    if (!d) continue
    const cant = Number(ing.cantidad) || 0
    if (!mejor || cant > mejor.cant) mejor = { tipo: d.tipo, cant }
  }
  return mejor ? mejor.tipo : SIN_ALCOHOL
}

export function familiaDeReceta(nombre, ingredientes = []) {
  const n = norm(nombre)
  const f = FAMILIAS.find(x => x.re.test(n))
  if (f) return f.tipo
  if (ingredientes.some(i => RE_ENERGETICA.test(norm(i.insumo_nombre)))) return 'Energético'
  return OTROS
}

// Clasifica una receta y arma de paso el texto contra el que busca la caja de
// búsqueda: nombre + insumos. Buscar "maracuya" tiene que encontrar tanto
// "Mango Sour" (que la lleva) como "Maracuyá Sour".
export function clasificarReceta(receta, ingredientes = []) {
  const nombre = receta?.nombre || ''
  return {
    base: baseDeReceta(ingredientes),
    familia: familiaDeReceta(nombre, ingredientes),
    busqueda: norm([nombre, receta?.lab_codigo || '', ...ingredientes.map(i => i.insumo_nombre || '')].join(' ')),
  }
}

// Cuenta cuántas recetas hay por valor y las devuelve ordenadas para los chips.
// Solo se listan las que existen: un filtro vacío no aporta y estorba.
export function opcionesConteo(valores, orden) {
  const conteo = new Map()
  valores.forEach(v => conteo.set(v, (conteo.get(v) || 0) + 1))
  return [...conteo.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => {
      const ia = orden.indexOf(a.valor), ib = orden.indexOf(b.valor)
      if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
      return a.valor.localeCompare(b.valor, 'es')
    })
}

export { ORDEN_BASES, ORDEN_FAMILIAS }
