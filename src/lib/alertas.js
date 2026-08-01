// ─────────────────────────────────────────────────────────────────────────────
// Módulo de generación de ALERTAS proactivas
// Las alertas no se almacenan: se generan en cada carga desde los datos del
// negocio. La tabla `alertas_leidas` guarda solo qué claves ya fueron vistas.
//
// Cada alerta tiene una `clave` estable que sirve para marcarla como leída
// y evitar re-mostrarla. Si la alerta cambia (ej: stock crítico hoy vs ayer)
// la clave incluye la fecha o el dato variable.
// ─────────────────────────────────────────────────────────────────────────────

// Parsea "YYYY-MM-DD" sin desfase de zona horaria
function parseFecha(f) {
  if (!f) return null
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const FERIADOS_CL = {
  '2026-05-21': 'Gloria Navales',
  '2026-06-29': 'San Pedro y San Pablo',
  '2026-07-16': 'Virgen del Carmen',
  '2026-09-18': 'Fiestas Patrias',
  '2026-09-19': 'Glorias del Ejército',
  '2026-12-25': 'Navidad',
}

/**
 * Genera el set completo de alertas activas del negocio.
 *
 * @param {Object} p
 * @param {Array}  p.ventas        filas de `ventas`
 * @param {Array}  p.ordenes       filas de `ordenes`
 * @param {Array}  p.clientes      filas de `clientes` (incluir estado_contacto)
 * @param {Array}  p.insumos       filas de `insumos` con stock_actual y stock_minimo
 * @param {Array}  p.gastosPub     gastos de caja categoría Publicidad
 * @param {Array}  p.recetaIng     receta_ingredientes (para calcular días de stock)
 * @param {Object} p.config        { alerta_cliente_dias, alerta_stock_dias, alerta_sin_pauta_dias }
 * @returns {Array} lista de alertas { clave, tipo, severidad, titulo, detalle, fecha, accion }
 */
export function generarAlertas({
  ventas = [], ordenes = [], clientes = [], insumos = [],
  gastosPub = [], recetaIng = [], config = {},
}) {
  const hoy = new Date()
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`
  const alertas = []

  const diasClienteFrio = parseInt(config.alerta_cliente_dias) || 14
  const diasStockBajo = parseInt(config.alerta_stock_dias) || 5
  const diasSinPauta = parseInt(config.alerta_sin_pauta_dias) || 5

  // ── 1. CLIENTE VIP FRÍO ───────────────────────────────────────────────────
  // VIP = cliente con tag VIP o con 3+ pedidos. Si no ha comprado en N días,
  // se sugiere contactarlo.
  const pedidosPorCliente = {}
  ordenes.forEach(o => {
    const key = (o.cliente_nombre || '').trim().toLowerCase()
    if (!key) return
    if (!pedidosPorCliente[key]) pedidosPorCliente[key] = { count: 0, ultima: null, nombre: o.cliente_nombre }
    pedidosPorCliente[key].count += 1
    if (!pedidosPorCliente[key].ultima || o.fecha > pedidosPorCliente[key].ultima) {
      pedidosPorCliente[key].ultima = o.fecha
    }
  })
  const tagPorCliente = {}
  const estadoPorCliente = {}
  clientes.forEach(c => {
    const key = (c.nombre || '').trim().toLowerCase()
    tagPorCliente[key] = c.tag || ''
    estadoPorCliente[key] = c.estado_contacto || null
  })

  Object.entries(pedidosPorCliente).forEach(([key, d]) => {
    // No sugerir reactivar a clientes vetados por fraude ('excluido') ni a
    // quienes se marcó explícitamente 'no_contactar' — el punto de esta
    // alerta es pedir que se le escriba, lo que contradice ambos estados.
    const estadoCliente = estadoPorCliente[key]
    if (estadoCliente === 'excluido' || estadoCliente === 'no_contactar') return
    const tag = (tagPorCliente[key] || '').toLowerCase()
    const esVIP = tag.includes('vip') || d.count >= 3
    if (!esVIP) return
    if (!d.ultima) return
    const dias = Math.floor((hoy - parseFecha(d.ultima)) / (1000 * 60 * 60 * 24))
    if (dias >= diasClienteFrio) {
      alertas.push({
        clave: `cliente_frio:${key}:${d.ultima}`,
        tipo: 'cliente_frio',
        severidad: dias >= diasClienteFrio * 2 ? 'alta' : 'media',
        titulo: `${d.nombre} no compra hace ${dias} días`,
        detalle: `Cliente recurrente (${d.count} pedidos) — considera contactarlo por WhatsApp para reactivar.`,
        fecha: d.ultima,
        icono: '👤',
      })
    }
  })

  // ── 2. STOCK BAJO ─────────────────────────────────────────────────────────
  // Para cada insumo, estimamos días de stock = stock_actual / consumo_diario.
  // Consumo diario se calcula de los últimos 30 días según las recetas.
  if (recetaIng.length > 0 && insumos.length > 0 && ventas.length > 0) {
    const hace30 = new Date(hoy); hace30.setDate(hoy.getDate() - 30)
    const ventas30 = ventas.filter(v => v.fecha && parseFecha(v.fecha) >= hace30)
    const diasPeriodo = Math.max(1, Math.round((hoy - hace30) / (1000 * 60 * 60 * 24)))

    // Consumo total por insumo en los últimos 30 días
    const consumoInsumo = {}
    ventas30.forEach(v => {
      const ings = recetaIng.filter(r => r.receta_nombre === v.receta_nombre)
      ings.forEach(ing => {
        const usado = ing.cantidad * (parseFloat(v.litros) || 1) * 1.08 // con merma
        consumoInsumo[ing.insumo_nombre] = (consumoInsumo[ing.insumo_nombre] || 0) + usado
      })
    })

    insumos.forEach(i => {
      const consumoTotal = consumoInsumo[i.nombre] || 0
      if (consumoTotal === 0) return
      const consumoDiario = consumoTotal / diasPeriodo
      const stock = parseFloat(i.stock_actual) || 0
      const diasRestantes = stock / consumoDiario
      if (diasRestantes < diasStockBajo) {
        alertas.push({
          clave: `stock_bajo:${i.nombre}:${hoyISO}`,
          tipo: 'stock_bajo',
          severidad: diasRestantes < 2 ? 'alta' : 'media',
          titulo: `Stock de ${i.nombre} alcanza solo para ${Math.floor(diasRestantes)} día${Math.floor(diasRestantes) !== 1 ? 's' : ''}`,
          detalle: `Tienes ${stock.toFixed(1)} ${i.unidad || 'u'} y consumes ~${consumoDiario.toFixed(1)} ${i.unidad || 'u'}/día. Considera comprar.`,
          fecha: hoyISO,
          icono: '📦',
        })
      }
    })
  }

  // ── 3. DÍA HISTÓRICO BUENO ────────────────────────────────────────────────
  // Inicio/fin de mes (zona de sueldos), quincena, víspera de feriado.
  // Solo se muestra si es realmente hoy o mañana, para no ser ruido.
  const diaMes = hoy.getDate()
  const diaSem = hoy.getDay() // 0=Dom, 4=Jue, 5=Vie
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1)
  const mananaISO = `${manana.getFullYear()}-${String(manana.getMonth()+1).padStart(2,'0')}-${String(manana.getDate()).padStart(2,'0')}`

  if (diaMes >= 28 || diaMes <= 5) {
    alertas.push({
      clave: `dia_historico:zona_sueldo:${hoyISO}`,
      tipo: 'dia_historico',
      severidad: 'baja',
      titulo: 'Estás en zona de sueldos',
      detalle: `Día ${diaMes} del mes — tus datos muestran 4× más ventas en estos días. Considera activar publicidad.`,
      fecha: hoyISO,
      icono: '💵',
    })
  } else if (diaMes >= 13 && diaMes <= 17) {
    alertas.push({
      clave: `dia_historico:quincena:${hoyISO}`,
      tipo: 'dia_historico',
      severidad: 'baja',
      titulo: 'Quincena — segundo peak del mes',
      detalle: `Día ${diaMes} — buen momento para pautar.`,
      fecha: hoyISO,
      icono: '💵',
    })
  } else if ((diaSem === 4 || diaSem === 5) && diaMes >= 11 && diaMes <= 15) {
    alertas.push({
      clave: `dia_historico:jue_pre_quincena:${hoyISO}`,
      tipo: 'dia_historico',
      severidad: 'baja',
      titulo: 'Jueves antes de quincena',
      detalle: 'Histórico: día bueno para activar marketing.',
      fecha: hoyISO,
      icono: '📅',
    })
  }

  if (FERIADOS_CL[mananaISO]) {
    alertas.push({
      clave: `dia_historico:vispera:${mananaISO}`,
      tipo: 'dia_historico',
      severidad: 'media',
      titulo: `Mañana es ${FERIADOS_CL[mananaISO]}`,
      detalle: 'Víspera de feriado: pautar hoy maximiza ventas del día.',
      fecha: hoyISO,
      icono: '🎉',
    })
  }

  // ── 4. SIN PAUTAR ─────────────────────────────────────────────────────────
  if (gastosPub.length > 0) {
    const ultimaPauta = gastosPub.reduce((max, m) => m.fecha > max ? m.fecha : max, gastosPub[0].fecha)
    const dias = Math.floor((hoy - parseFecha(ultimaPauta)) / (1000 * 60 * 60 * 24))
    if (dias >= diasSinPauta) {
      alertas.push({
        clave: `sin_pautar:${ultimaPauta}`,
        tipo: 'sin_pautar',
        severidad: dias >= diasSinPauta * 2 ? 'media' : 'baja',
        titulo: `Llevas ${dias} días sin pautar`,
        detalle: 'La audiencia se enfría. Revisa el semáforo de publicidad antes de activar.',
        fecha: ultimaPauta,
        icono: '📣',
      })
    }
  }

  // Ordenar por severidad (alta > media > baja) y fecha
  const ordenSev = { alta: 0, media: 1, baja: 2 }
  alertas.sort((a, b) => {
    const sa = ordenSev[a.severidad] ?? 9
    const sb = ordenSev[b.severidad] ?? 9
    if (sa !== sb) return sa - sb
    return (b.fecha || '').localeCompare(a.fecha || '')
  })

  return alertas
}
