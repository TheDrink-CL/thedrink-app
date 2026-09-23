// Tarifa de envío según el mapa de la carta (carta.ncity.live, «Zonas de
// despacho», julio 2026). El mapa es la única fuente de verdad pública: si
// cambia allá, se cambia acá.
//
// Dentro del borde se cobra lo que dice el mapa. Fuera del borde la carta dice
// «te cotizamos antes de que pidas»: ahí se cobra el Uber real menos un aporte
// fijo por tramo, redondeado a $500 hacia arriba. Revisión del 22/9/2026: los
// pedidos fuera del borde eran el 20% de los envíos y se llevaban el 38% del
// subsidio (se cobraban $4.000 fijos por viajes de $8.000–14.000).
//
// Los tramos son por monto de productos, igual que en la carta.
// Clientes habituales (HABITUAL_MIN_PEDIDOS o más pedidos anteriores): aporte
// doble fuera del borde, y el tramo de 1 trago también tiene aporte. Decisión
// de Rodrigo del 22/9/2026 (casos Vicho, Molly, Angélica).
export const HABITUAL_MIN_PEDIDOS = 3
export const TRAMOS_ENVIO = [
  { desde: 27000, nombre: '3+ tragos · $27.000+', aporte: 3000, aporteHabitual: 6000, zonas: [{ hasta: 8, tarifa: 0 }, { hasta: 15, tarifa: 3000 }] },
  { desde: 18000, nombre: '2 tragos · $18.000+', aporte: 1500, aporteHabitual: 3000, zonas: [{ hasta: 6, tarifa: 3000 }, { hasta: 13, tarifa: 4000 }] },
  { desde: 0, nombre: '1 trago · menos de $18.000', aporte: 0, aporteHabitual: 1500, zonas: [{ hasta: 4, tarifa: 3000 }, { hasta: 8, tarifa: 4000 }] },
]

// Costo Uber estimado por km de ruta: ajuste sobre 65 viajes desde julio 2026
// (r = 0,91). Solo para orientar cuando todavía no hay cotización real.
export const uberEstimado = (km) => Math.round(1481 + 523 * km)

const arriba500 = (n) => Math.ceil(n / 500) * 500

export const tramoDe = (monto) => TRAMOS_ENVIO.find(t => monto >= t.desde)

// Devuelve null si falta el monto o los km.
//   { tramo, dentro, zona?, tarifa, aporte, costoUsado, estimado, siguiente? }
// - dentro: la dirección cae en el mapa; tarifa = la del mapa.
// - fuera: tarifa = Uber (real si se pasó, si no estimado) − aporte, redondeado
//   a 500, y nunca menos que la tarifa del borde.
// - siguiente: cuánto le falta al cliente para el tramo que sigue y qué envío
//   tendría ahí (para ofrecerlo en el mensaje: «si sumas un trago…»).
export function tarifaEnvio(monto, km, costoUber, habitual = false) {
  const m = Number(monto), d = Number(km)
  if (!(m > 0) || !(d > 0)) return null
  const tramo = tramoDe(m)
  const calc = (t) => {
    const zona = t.zonas.find(z => d <= z.hasta)
    if (zona) return { dentro: true, zona, tarifa: zona.tarifa }
    const real = Number(costoUber) > 0
    const costo = real ? Number(costoUber) : uberEstimado(d)
    const borde = t.zonas[t.zonas.length - 1].tarifa
    const aporte = habitual ? t.aporteHabitual : t.aporte
    return { dentro: false, tarifa: Math.max(borde, arriba500(costo - aporte)), costoUsado: costo, estimado: !real, aporte }
  }
  const r = { tramo, habitual, aporte: habitual ? tramo.aporteHabitual : tramo.aporte, ...calc(tramo) }
  const idx = TRAMOS_ENVIO.indexOf(tramo)
  if (idx > 0) {
    const sig = TRAMOS_ENVIO[idx - 1]
    const s = calc(sig)
    if (s.tarifa < r.tarifa) r.siguiente = { tramo: sig, falta: sig.desde - m, tarifa: s.tarifa }
  }
  return r
}
