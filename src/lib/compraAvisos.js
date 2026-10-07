// ─── Avisos de una compra ────────────────────────────────────────────────────
// Una sola regla para dos momentos: al registrar la compra (Compras) y al
// revisar un descuadre (ficha de movimientos en Stock). Salió de las dos
// compras de ron del 6-oct: una cargada dos veces el 19-sep y otra de 3.000
// ml por $14.550 ($4,85/ml contra ~$14,5 de siempre).
//
// El precio se compara contra la MEDIANA de las otras compras del insumo, no
// contra el PPP: el PPP ya está movido por las compras malas (el del ron bajó
// a $6,48 justo por esa compra), así que contra él una compra mala parece
// casi normal.

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const fmtPrecio = (n) => {
  const a = Math.abs(n)
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2
  return Number(n.toFixed(d)).toLocaleString('es-CL')
}

// Fuera de este rango contra la mediana, el precio "no calza".
export const RANGO_PRECIO = [0.6, 1.67]

// `compra`: { id?, fecha, insumo_nombre, cantidad, precio_total }.
// `todas`: las compras ya guardadas (puede incluir a la misma, se ignora).
// Devuelve una lista de textos; vacía si no hay nada raro.
export function avisosDeCompra(compra, todas) {
  const avisos = []
  const cant = Number(compra.cantidad)
  const total = Number(compra.precio_total)
  const delInsumo = (todas || []).filter(o => o.id !== compra.id && o.insumo_nombre === compra.insumo_nombre)

  const gemela = delInsumo.find(o => o.fecha === compra.fecha && Number(o.cantidad) === cant)
  if (gemela) avisos.push(`¿duplicada? hay otra compra igual el mismo día (#${gemela.id})`)

  const unit = (x) => Number(x.precio_total) / Number(x.cantidad)
  const otras = delInsumo.filter(o => Number(o.cantidad) > 0 && Number(o.precio_total) > 0).map(unit)
  if (otras.length >= 2 && cant > 0 && total > 0) {
    const ref = mediana(otras)
    const r = (total / cant) / ref
    if (r < RANGO_PRECIO[0] || r > RANGO_PRECIO[1]) {
      avisos.push(`precio raro: $${fmtPrecio(total / cant)} por unidad, lo habitual es ~$${fmtPrecio(ref)}. Revisa la cantidad o el precio`)
    }
  }
  return avisos
}
