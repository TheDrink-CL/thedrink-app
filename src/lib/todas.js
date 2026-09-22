// Trae TODAS las filas de una consulta, de a páginas.
//
// PostgREST (Supabase) corta cada respuesta en 1000 filas sin avisar. Las
// pantallas que calculan el saldo de caja sumaban ventas/ordenes/compras/caja
// completas: al pasar las 1000 ventas cada una habría perdido filas distintas
// (Inicio ordena por fecha, las otras no) y los saldos se habrían separado.
//
// Uso: todas(supabase.from('ventas').select('fecha, litros'))
// Devuelve { data, error } como una consulta normal. Agrega `id` como último
// criterio de orden para que las páginas no se pisen ni dejen huecos.
export async function todas(consulta, porPagina = 1000) {
  const q = consulta.order('id', { ascending: true })
  const filas = []
  for (let desde = 0; ; ) {
    const { data, error } = await q.range(desde, desde + porPagina - 1)
    if (error) return { data: filas.length ? filas : null, error }
    if (!data || data.length === 0) return { data: filas, error: null }
    filas.push(...data)
    // Se avanza por lo que llegó, no por porPagina: si el servidor tiene un
    // tope menor que 1000, igual se recorren todas.
    desde += data.length
  }
}
