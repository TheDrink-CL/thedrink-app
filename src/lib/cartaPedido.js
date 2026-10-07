// ─── Pedidos que llegan desde la carta web (carta.ncity.live) ────────────────
//
// La carta arma un mensaje fijo de WhatsApp (pedidoTexto() en
// `Páginas web/Carta/deploy/<versión>/index.html`):
//
//   Hola The Drink, vengo de la carta — quiero pedir:
//
//   ▸ 1x Mojito Clásico
//        $8.000
//   ▸ 2x Mojito Sabores · Piña
//        $9.000 c/u = $18.000
//   ▸ PROMO Mojito 5 x $25.000: −$5.000
//
//   PRODUCTOS: $26.000
//   DESPACHO (Quilicura): GRATIS o fuera de zona — según dirección
//   PASE DE BIENVENIDA: es mi primer pedido
//   Tengo código de descuento: NEON-…
//
// El parser genérico de Importar WA no lo entendía (no conoce «▸») y, por
// similitud, «Mojito Sabores · Piña» se parecía más a «Mojito» que a
// «Mojito piña». Acá el nombre de la carta se traduce a la receta con
// reglas exactas; si no calza, el ítem queda sin receta para elegirla a
// mano, nunca adivinado.
//
// ⚠ Los nombres de la carta viven en dos lugares: acá y en RECETAS del HTML
// de la carta. Si cambias uno, cambia el otro.

export const esMensajeCarta = (texto) => /vengo de la carta/i.test(texto || '')

const norm = (s = '') => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()

// Nombre de carta (sin sabor) → receta, cuando no son iguales.
const ALIAS = {
  'mojito clasico': 'Mojito',
  'mojito coco frambuesa': 'Mojito coco-frambuesa',
  'margarita clasica': 'Margarita',
  'pisco sour peruano': 'Sour Peruano',
  'mojito frozen 0 0': 'Frozen mojito (1lt)',
  'berry frost 0 0': 'Berry Frost (1lt)',
  'violetto tonic 0 0': 'Violetto tonic',
}

// Cards con sabores: cómo se llama la receta de cada sabor.
const CON_SABOR = {
  'mojito sabores': (s) => `Mojito ${s}`,
  'daikiri sabores': (s) => `Daikiri ${s}`,
  'margarita sabores': (s) => `Margarita ${s.replace(/\s*\(.*\)$/, '')}`, // «Blue (curaçao)» → Blue
  'colada': (s) => `${s} Colada`,
}

// «Mojito Sabores · Piña» → «Mojito piña» (la receta tal como está en la base),
// o null si no hay una receta con ese nombre.
export function recetaDeCarta(nombreCarta, recetas) {
  const [base, sabor] = (nombreCarta || '').split('·').map(s => s.trim())
  const kBase = norm(base)
  let candidato
  if (sabor && CON_SABOR[kBase]) candidato = CON_SABOR[kBase](sabor)
  else candidato = ALIAS[kBase] || base
  const k = norm(candidato)
  return (recetas || []).find(r => norm(r.nombre) === k) || null
}

const pesos = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0

// Devuelve null si el texto no es de la carta. Si lo es:
//   { items: [{ cantidad, etiqueta, receta_nombre, precio_venta }], notas: [] }
// `precio_venta` es el precio unitario que vio el cliente en la carta.
export function parsearMensajeCarta(texto, recetas) {
  if (!esMensajeCarta(texto)) return null
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []
  const notas = []
  lineas.forEach((l, i) => {
    const promo = l.match(/^▸\s*(PROMO\b.*)$/i)
    if (promo) { notas.push(promo[1]); return }
    const it = l.match(/^▸\s*(\d+)\s*[x×]\s*(.+)$/i)
    if (it) {
      const etiqueta = it[2].trim()
      // La línea siguiente trae el precio: «$9.000» o «$9.000 c/u = $18.000».
      const p = (lineas[i + 1] || '').match(/^\$\s*([\d.]+)/)
      const receta = recetaDeCarta(etiqueta, recetas)
      items.push({
        cantidad: parseInt(it[1], 10),
        etiqueta,
        receta_nombre: receta ? receta.nombre : '',
        precio_venta: p ? pesos(p[1]) : (receta ? receta.precio_venta : ''),
      })
      return
    }
    const despacho = l.match(/^DESPACHO\s*(?:\(([^)]+)\))?\s*:\s*(.+)$/i)
    if (despacho) { notas.push(`Despacho${despacho[1] ? ' ' + despacho[1] : ''}: ${despacho[2]}`); return }
    if (/^PASE DE BIENVENIDA/i.test(l)) { notas.push('Pase de bienvenida: dice que es su primer pedido'); return }
    const cod = l.match(/c[oó]digo de descuento:\s*(\S+)/i)
    if (cod) notas.push(`Código de descuento: ${cod[1]}`)
  })
  return { items, notas }
}
