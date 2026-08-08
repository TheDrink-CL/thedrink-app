// ─── Decodificador de códigos del LAB (lab.ncity.live) ───────────────────────
//
// El LAB manda pedidos por WhatsApp con un código exacto por trago:
//
//     RON-MOJ-MAR-1L+CZ   →  Mojito de maracuyá, 1 litro, con curazao
//
// Este módulo traduce ese código a una receta ejecutable: nombre, lista de
// insumos con cantidades y precio. Con eso el bartender sabe cómo armarlo y el
// stock se descuenta bien.
//
// POR QUÉ NO ADIVINAR POR TEXTO
// `ImportarPedido` matchea recetas por similitud difusa (umbral 0.3). Para un
// nombre como "PROTOTIPO #104" eso no funciona: o no matchea, o —peor— le pega
// a una receta parecida y descuenta los insumos equivocados en silencio. Un
// código es exacto: si parsea, es correcto; si no parsea, se sabe.
//
// DE DÓNDE SALEN LAS CANTIDADES
// De `receta_ingredientes`, no de acá. Este archivo solo sabe QUÉ receta usar
// de referencia y qué transformación aplicarle (cambiar la pulpa, sumar un
// añadido). Las cantidades siempre vienen de la base, que es la fuente de
// verdad del negocio.
//
// DEUDA CONOCIDA
// El LAB hoy tiene su propia copia de las recetas escrita a mano en su JS. Si
// alguien edita una receta acá, el LAB no se entera: el descriptor le mentiría
// al cliente y el margen quedaría mal calculado. La solución es generar el LAB
// desde esta base; hasta que eso exista, cualquier cambio de receta hay que
// replicarlo a mano en `Páginas web/app pedidos/deploy/v1/index.html`.

// ─── Diccionarios del código ─────────────────────────────────────────────────

// Los nombres de insumo y receta van EXACTOS como están en la base, con sus
// mayúsculas y sus tildes tal cual (incluido el typo "Púlpa de Arándano"). Un
// nombre que no calce hace que el stock no se descuente, sin lanzar error.
export const FRUTA_POR_CODIGO = {
  MAR: { nombre: 'Maracuyá', insumo: 'Pulpa de Maracuya' },
  FRA: { nombre: 'Frambuesa', insumo: 'Pulpa de Frambuesa' },
  FRU: { nombre: 'Frutilla', insumo: 'Pulpa de frutilla' },
  MAN: { nombre: 'Mango', insumo: 'Pulpa de Mango' },
  PIN: { nombre: 'Piña', insumo: 'Pulpa de Piña' },
  ARA: { nombre: 'Arándano', insumo: 'Púlpa de Arándano' },
}

export const BASE_POR_CODIGO = {
  RON: 'Ron Bacardí',
  PN: 'Pisco',
  PT: 'Pisco Tabernero',
  GIN: 'Gin',
  JGR: 'Jägermeister',
  ZER: 'Sin alcohol',
}

// `refConFruta` / `refSinFruta`: receta existente que se usa de molde.
// `slotFruta`: cuánta pulpa lleva el molde (para reemplazarla por la pedida).
// `gomaPorFruta`: excepciones reales de la carta (la piña es dulce y lleva
// menos goma; la maracuyá y el arándano son ácidos y llevan más).
export const ESQUELETOS = {
  MOJ: {
    nombre: 'Mojito', refConFruta: 'Mojito maracuya', refSinFruta: 'Mojito',
    addons: ['CC', 'CZ', 'JG', 'MT'],
  },
  COL: {
    nombre: 'Colada', refConFruta: 'Mango Colada',
    gomaPorFruta: { PIN: 90 }, addons: ['CZ'],
  },
  DAI: {
    nombre: 'Daikiri', refConFruta: 'Daikiri frambuesa',
    gomaPorFruta: { MAR: 120, ARA: 120 }, addons: ['JG', 'CZ'],
  },
  SOU: {
    nombre: 'Sour', refConFruta: 'Mango Sour', refSinFruta: 'Pisco sour',
    refSinFrutaAlt: { PT: 'Sour Peruano' }, addons: ['AG'],
  },
  ENE: {
    nombre: 'Energético', refConFruta: 'Tropical Gin',
    addons: ['JG', 'CZ', 'MT'],
    // La energética va incluida (1 por trago), no es añadido: por eso viaja
    // como token propio del código y no dentro de `addons`.
    energeticas: ['RY', 'RB'],
  },
  JAG: {
    nombre: 'Mojito Jäger', refConFruta: 'Mojito Jager Maracuyá',
    refSinFruta: 'Mojito Jager', addons: ['MT', 'JG'],
  },
  FZM: {
    nombre: 'Frozen Mojito', refSinFruta: 'Frozen mojito (1lt)',
    addons: ['CC', 'JG'],
  },
  FRS: {
    nombre: 'Frost', refConFruta: 'Berry Frost (1lt)', addons: ['JG'],
  },
  TON: {
    nombre: 'Gin Tónica', refSinFruta: 'Gin Tonic',
    addons: ['LI', 'GM', 'HI', 'PM', 'RR', 'AR', 'AE', 'CO', 'CL', 'CN', 'PJ'],
  },
  VIO: {
    nombre: 'Violetto Tonic', refSinFruta: 'Violetto tonic', addons: [],
  },
}

// Un añadido suma su insumo y reajusta el resto del build. El reajuste depende
// del esqueleto: un mojito con coco baja gas e hielo; una colada con curazao
// baja el ron y la pulpa. Sale de las recetas Mojito Coco Blue, Mojito
// coco-frambuesa y Blue Colada, que ya existen en la carta.
// `FRUTA` es un alias que apunta a la pulpa elegida.
// Energéticas: van incluidas, 1 por trago. El token del código dice cuál, y de
// eso depende qué lata se descuenta del stock. Agregar una variedad es sumarla
// acá y al array `energeticas` del esqueleto.
export const ENERGETICAS = {
  RY: { nombre: 'RedBull Yellow', insumo: 'Redbull yellow' },
  RB: { nombre: 'RedBull Blue', insumo: 'Redbull blue' },
}

export const ADDONS = {
  CC: {
    nombre: 'Crema de coco', insumo: 'Crema de coco', cantidad: 120,
    ajuste: { MOJ: { 'Agua con gas': -15, Hielo: -100 } },
  },
  CZ: {
    nombre: 'Curazao', insumo: 'Curazao', cantidad: 120,
    ajuste: {
      MOJ: { 'Ron Bacardí': -30, 'Agua con gas': -15, Hielo: -100 },
      COL: { 'Ron Bacardí': -30, FRUTA: -60 },
      DEFECTO: { 'Ron Bacardí': -30 },
    },
  },
  JG: { nombre: 'Jengibre', insumo: 'Jengibre', cantidad: 5 },
  MT: { nombre: 'Menta extra', insumo: 'Menta fresca', cantidad: 5 },
  AG: { nombre: 'Angostura extra', insumo: 'Angostura', cantidad: 2.4 },

  // ── Botánicos del gin tónica ───────────────────────────────────────────
  // Van por dashes y se combinan libremente. ⚠ 1 dash = 1 g es provisorio
  // por acuerdo: cuando se mida de verdad se cambia acá y el descuento de
  // stock se ajusta solo.
  // Los nombres deben calzar EXACTO con `insumos.nombre`. Si uno no calza,
  // `aplicarMovimientosStock` no lo encuentra y no descuenta, sin lanzar
  // error. Hay una consulta de verificación en el mensaje del commit.
  LI: { nombre: 'Limón', insumo: 'Jugo limón', cantidad: 20 },
  GM: { nombre: 'Guisante de mariposa', insumo: 'Guisante de mariposa', cantidad: 1 },
  HI: { nombre: 'Hibisco', insumo: 'Hibisco', cantidad: 1 },
  PM: { nombre: 'Pimienta Mix', insumo: 'Pimienta Mix', cantidad: 1 },
  RR: { nombre: 'Rosa Rugosa', insumo: 'Rosa Rugosa', cantidad: 1 },
  AR: { nombre: 'Arándano Rojo', insumo: 'Arándano Rojo', cantidad: 1 },
  AE: { nombre: 'Anís Estrella', insumo: 'Anís Estrella', cantidad: 1 },
  CO: { nombre: 'Semilla Coriandro', insumo: 'Semilla Coriandro', cantidad: 1 },
  CL: { nombre: 'Flor Caléndula', insumo: 'Flor Caléndula', cantidad: 1 },
  // Un solo frasco premezclado en bodega, así que es un solo añadido.
  CN: { nombre: 'Canela + cardamomo', insumo: 'Canela + cardamomo', cantidad: 1 },
  PJ: { nombre: 'Pimienta Jamaica', insumo: 'Pimienta Jamaica', cantidad: 1 },
}

// Añadidos que se miden en gramos; el resto va en ml. Se usa al crear
// `receta_ingredientes` de un prototipo nuevo.
const ADDONS_EN_GRAMOS = new Set(
  ['JG', 'MT', 'GM', 'HI', 'PM', 'RR', 'AR', 'AE', 'CO', 'CL', 'CN', 'PJ'])

// Combinaciones que YA son una receta publicada. Se resuelven directo, sin
// derivar nada: menos superficie de error y el nombre le queda al cliente.
export const GEMELOS = {
  'RON-MOJ-NAT-1L': 'Mojito',
  'RON-MOJ-MAN-1L': 'Mojito mango',
  'RON-MOJ-FRU-1L': 'Mojito frutilla',
  'RON-MOJ-PIN-1L': 'Mojito piña',
  'RON-MOJ-FRA-1L': 'Mojito frambuesa',
  'RON-MOJ-MAR-1L': 'Mojito maracuya',
  'RON-MOJ-ARA-1L': 'Mojito Arándano',
  'RON-MOJ-FRA-1L+CC': 'Mojito coco-frambuesa',
  'RON-MOJ-NAT-1L+CC+CZ': 'Mojito Coco Blue',
  'RON-COL-PIN-1L': 'Piña Colada',
  'RON-COL-MAN-1L': 'Mango Colada',
  'RON-COL-FRU-1L': 'Frutilla Colada',
  'RON-COL-PIN-1L+CZ': 'Blue Colada',
  'RON-DAI-FRA-1L': 'Daikiri frambuesa',
  'RON-DAI-FRU-1L': 'Daikiri frutilla',
  'RON-DAI-MAN-1L': 'Daikiri mango',
  'RON-DAI-MAR-1L': 'Daikiri maracuya',
  'PN-SOU-NAT-475': 'Pisco sour',
  'PT-SOU-NAT-475': 'Sour Peruano',
  'PN-SOU-MAN-475': 'Mango Sour',
  'PT-SOU-MAR-475': 'Maracuyá Sour',
  'GIN-TON-NAT-1L': 'Gin Tonic',
  'GIN-ENE-MAR-1L+RY': 'Tropical Gin',
  'GIN-ENE-FRA-1L+RB': 'Berry Bomb',
  'JGR-JAG-NAT-1L': 'Mojito Jager',
  'JGR-JAG-MAR-1L': 'Mojito Jager Maracuyá',
  'ZER-FZM-NAT-1L': 'Frozen mojito (1lt)',
  'ZER-FRS-FRU-1L': 'Berry Frost (1lt)',
  'ZER-VIO-NAT-1L': 'Violetto tonic',
}

// Detecta un código dentro de una línea de texto pegada del chat.
export const REGEX_CODIGO = /\b([A-Z]{2,3})-([A-Z]{3})-([A-Z]{3})-(1L|475)((?:\+[A-Z]{2})*)\b/

// ─── Parseo ──────────────────────────────────────────────────────────────────

// Devuelve null si el código no es válido. No lanza: quien llama decide qué
// hacer con un pedido que no se pudo decodificar.
export function parsearCodigo(texto) {
  if (!texto) return null
  const m = String(texto).toUpperCase().match(REGEX_CODIGO)
  if (!m) return null
  const [, base, esq, fru, fmt, addonsRaw] = m
  if (!BASE_POR_CODIGO[base]) return null
  if (!ESQUELETOS[esq]) return null
  if (fru !== 'NAT' && !FRUTA_POR_CODIGO[fru]) return null

  const tokens = addonsRaw ? addonsRaw.split('+').filter(Boolean) : []
  const E = ESQUELETOS[esq]

  // Coherencia fruta ↔ esqueleto: un gin tónica con fruta o una colada sin
  // ella no existen. Antes pasaban el parseo y reventaban recién al construir;
  // mejor rechazarlos acá, donde el motivo es claro.
  if (fru !== 'NAT' && !E.refConFruta) return null
  if (fru === 'NAT' && !E.refSinFruta) return null

  // La energética viaja como token igual que un añadido, pero no lo es: va
  // incluida y define qué lata se descuenta. Se separa antes de validar.
  const energeticas = tokens.filter(t => ENERGETICAS[t])
  const addons = tokens.filter(t => !ENERGETICAS[t])

  if (energeticas.length > 1) return null
  const energetica = energeticas[0] || null
  if (energetica && !(E.energeticas || []).includes(energetica)) return null
  // Un esqueleto que lleva energética SIEMPRE debe traerla en el código: si
  // falta, no se sabe qué lata descontar y adivinarla sería inventar stock.
  if ((E.energeticas || []).length && !energetica) return null

  for (const a of addons) if (!ADDONS[a]) return null
  // Un añadido que ese esqueleto no admite es señal de código corrupto.
  for (const a of addons) if (!E.addons.includes(a)) return null

  const codigo = [base, esq, fru, fmt].join('-')
    + (energetica ? '+' + energetica : '')
    + addons.map(a => '+' + a).join('')
  return {
    codigo,
    base, esq, fmt,
    fruta: fru === 'NAT' ? null : fru,
    energetica,
    addons,
    esGemelo: !!GEMELOS[codigo],
    recetaGemela: GEMELOS[codigo] || null,
  }
}

// ─── Construcción del build ──────────────────────────────────────────────────

// `ingredientesPorReceta`: { nombre_receta: [{ insumo_nombre, cantidad }] }
// tal como lo devuelve `receta_ingredientes`. Se pasa por parámetro para que
// esta función sea pura y testeable sin base de datos.
//
// Devuelve { ok, ingredientes, motivo } — `motivo` explica por qué no se pudo
// cuando ok === false, para poder mostrárselo a quien ingresa el pedido.
export function construirBuild(spec, ingredientesPorReceta) {
  if (!spec) return { ok: false, ingredientes: [], motivo: 'código inválido' }
  const esq = ESQUELETOS[spec.esq]

  // Receta molde: la que tiene fruta si el pedido lleva fruta.
  let ref = spec.fruta ? esq.refConFruta : esq.refSinFruta
  if (!spec.fruta && esq.refSinFrutaAlt && esq.refSinFrutaAlt[spec.base])
    ref = esq.refSinFrutaAlt[spec.base]
  if (!ref) return { ok: false, ingredientes: [], motivo: `${esq.nombre} no admite esa combinación` }

  const molde = ingredientesPorReceta[ref]
  if (!molde || !molde.length)
    return { ok: false, ingredientes: [], motivo: `falta la receta de referencia "${ref}" en la base` }

  // Copia editable
  let build = molde.map(i => ({
    insumo_nombre: i.insumo_nombre,
    cantidad: Number(i.cantidad),
    unidad: i.unidad || 'ml',
  }))

  // 1. Cambiar el destilado si el código pide otra variante (pisco nacional
  //    vs Tabernero). El molde trae uno de los dos.
  const destilado = BASE_POR_CODIGO[spec.base]
  if (spec.base === 'PN' || spec.base === 'PT') {
    build.forEach(i => {
      if (i.insumo_nombre === 'Pisco' || i.insumo_nombre === 'Pisco Tabernero')
        i.insumo_nombre = destilado
    })
  }

  // 2. Cambiar la pulpa por la pedida. El molde puede traer más de una (el
  //    Berry Frost mezcla frutilla y frambuesa): se colapsan en una sola,
  //    sumando las cantidades, que es como lo modela el LAB.
  if (spec.fruta) {
    const pulpas = build.filter(i => /^p[uú]lpa de /i.test(i.insumo_nombre))
    const totalPulpa = pulpas.reduce((s, i) => s + i.cantidad, 0)
    build = build.filter(i => !/^p[uú]lpa de /i.test(i.insumo_nombre))
    build.push({ insumo_nombre: FRUTA_POR_CODIGO[spec.fruta].insumo, cantidad: totalPulpa })
  }

  // 2b. Cambiar la lata por la pedida. El molde trae una sola; si no se
  //     reemplaza, se descuenta del stock la energética equivocada.
  if (spec.energetica) {
    const objetivo = ENERGETICAS[spec.energetica].insumo
    const cans = Object.values(ENERGETICAS).map(e => e.insumo)
    build.forEach(i => { if (cans.includes(i.insumo_nombre)) i.insumo_nombre = objetivo })
  }

  // 3. Excepciones de goma que ya existen en la carta
  if (esq.gomaPorFruta && spec.fruta && esq.gomaPorFruta[spec.fruta] != null) {
    const goma = build.find(i => i.insumo_nombre === 'Goma')
    if (goma) goma.cantidad = esq.gomaPorFruta[spec.fruta]
  }

  // 4. Añadidos: suman su insumo y reajustan el resto
  for (const cod of spec.addons) {
    const A = ADDONS[cod]
    const ya = build.find(i => i.insumo_nombre === A.insumo)
    if (ya) ya.cantidad += A.cantidad
    else build.push({
      insumo_nombre: A.insumo,
      cantidad: A.cantidad,
      unidad: ADDONS_EN_GRAMOS.has(cod) ? 'g' : 'ml',
    })

    const ajuste = A.ajuste ? (A.ajuste[spec.esq] || A.ajuste.DEFECTO) : null
    if (!ajuste) continue
    for (const clave in ajuste) {
      const nombreReal = clave === 'FRUTA'
        ? (spec.fruta ? FRUTA_POR_CODIGO[spec.fruta].insumo : null)
        : clave
      if (!nombreReal) continue
      const t = build.find(i => i.insumo_nombre === nombreReal)
      if (t) t.cantidad = Math.max(0, t.cantidad + ajuste[clave])
    }
  }

  return { ok: true, ingredientes: build.filter(i => i.cantidad > 0), motivo: null }
}

// Nombre legible para mostrarle al bartender y guardar como receta.
export function nombreLegible(spec) {
  if (!spec) return ''
  if (spec.recetaGemela) return spec.recetaGemela
  const esq = ESQUELETOS[spec.esq]
  let n = esq.nombre
  if (spec.base === 'PT') n += ' Peruano'
  if (spec.fruta) n += ' ' + FRUTA_POR_CODIGO[spec.fruta].nombre
  if (spec.energetica) n += ' · ' + ENERGETICAS[spec.energetica].nombre
  const ad = spec.addons.map(a => ADDONS[a].nombre.toLowerCase())
  if (ad.length) n += ' + ' + ad.join(', ')
  return n
}

// ─── Parseo del mensaje completo del LAB ─────────────────────────────────────
//
// El LAB manda algo así:
//
//     ▸ PEDIDO THE DRINK
//
//     2×  MOJITO MARACUYÁ
//         Mojito Maracuyá · 1lt
//         RON-MOJ-MAR-1L
//         $18.000
//
//     SUBTOTAL  $18.000
//     DESPACHO  Providencia: $4.000
//     TOTAL     $22.000
//
//     ▣ ENVIADO DESDE NCITY_LAB // lab.ncity.live
//
// El ancla es la línea del código, no el nombre: el nombre puede ser
// "PROTOTIPO #104" y no significar nada para el parser difuso.

const aNumero = s => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0

export function parsearMensajeLab(texto) {
  if (!texto) return null
  const T = String(texto)
  const lineas = T.split('\n').map(l => l.trim())
  const items = []

  const RE_CANT = /^(\d+)\s*[×xX]\s*(.*)$/
  // Al pegar desde WhatsApp los saltos de línea a veces se colapsan y el trago
  // entero queda en una sola línea. Por eso el nombre se limpia de código y
  // precio: si no, arrastra "PT-SOU-FRU-475+AG $7.300" pegado al nombre.
  const limpiarEtiqueta = t => String(t || '')
    .replace(REGEX_CODIGO, '')
    .replace(/\$[\d.]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[·\-–]\s*$/, '')
    .trim()

  // Se barre el texto COMPLETO buscando códigos, no línea por línea: al pegar
  // desde WhatsApp los saltos pueden desaparecer del todo y quedar los tres
  // tragos en un solo renglón. Con búsqueda por línea solo se veía el primero.
  const RE_TODOS = new RegExp(REGEX_CODIGO.source, 'g')
  const hallados = []
  let m
  while ((m = RE_TODOS.exec(T)) !== null) {
    hallados.push({ raw: m[0], desde: m.index, hasta: m.index + m[0].length })
  }

  hallados.forEach((h, k) => {
    const spec = parsearCodigo(h.raw)
    if (!spec) return
    // Cada trago ocupa el tramo entre el código anterior y el suyo; el precio
    // queda en el tramo siguiente. Así los límites no dependen de los saltos.
    const antes = T.slice(k === 0 ? 0 : hallados[k - 1].hasta, h.desde)
    const despues = T.slice(h.hasta, hallados[k + 1] ? hallados[k + 1].desde : T.length)

    // La cantidad es el ÚLTIMO "N×" antes del código: si hubiera varios, el
    // más cercano es el de este trago.
    let cantidad = 1, etiqueta = antes
    const cants = [...antes.matchAll(/(\d+)\s*[×xX]\s*/g)]
    if (cants.length) {
      const u = cants[cants.length - 1]
      cantidad = parseInt(u[1], 10) || 1
      etiqueta = antes.slice(u.index + u[0].length)
    }
    const precio = despues.match(/\$[\d.]+/)
    const precioLinea = precio ? aNumero(precio[0]) : 0

    // Nombre corto para la comanda: el descriptor completo ("Energético
    // Frambuesa · RedBull Yellow · 1lt") ocupaba varias líneas en la TV y el
    // bartender lo que necesita leer es el build, no el nombre.
    const limpia = limpiarEtiqueta(etiqueta)
    const proto = limpia.match(/PROTOTIPO\s*#\s*(\d+)/i)
    items.push({
      cantidad,
      etiqueta: spec.recetaGemela
        || (proto ? `PROTOTIPO #${proto[1]}` : (limpia || nombreLegible(spec))),
      codigo: spec.codigo,
      spec,
      // precio unitario: el mensaje trae el total de la línea
      precio_venta: cantidad > 0 && precioLinea ? Math.round(precioLinea / cantidad) : 0,
    })
  })

  if (!items.length) return null

  // Despacho: "DESPACHO  Providencia: $4.000" | "...: GRATIS" | "...: fuera de cobertura"
  let despacho = null
  for (const l of lineas) {
    const m = l.match(/^DESPACHO\s+(.+)$/i)
    if (!m) continue
    const resto = m[1].trim()
    const mm = resto.match(/^(.+?):\s*(.+)$/)
    const comuna = mm ? mm[1].trim() : null
    const valor = mm ? mm[2].trim() : resto
    despacho = {
      comuna,
      texto: resto,
      // solo hay monto que cobrar si el LAB mostró una cifra o GRATIS
      monto: /gratis/i.test(valor) ? 0 : (/\$/.test(valor) ? aNumero(valor) : null),
    }
    break
  }

  return { items, despacho, esLab: /NCITY_LAB/i.test(texto) }
}

// Texto de una línea por insumo, para la comanda del bartender.
export function buildLegible(ingredientes) {
  return (ingredientes || [])
    .map(i => `${i.insumo_nombre} ${Number(i.cantidad) % 1 === 0 ? i.cantidad : i.cantidad.toFixed(1)}`)
    .join(' · ')
}
