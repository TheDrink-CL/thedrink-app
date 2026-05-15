import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularCostoReceta, formatCLP, formatPct } from '../lib/calculos'
import { calcularRentabilidad } from '../lib/rentabilidad'

function RecetasComparativo({ topVolumen, topGanancia }) {
  const [tab, setTab] = useState('volumen')
  if (!topVolumen || topVolumen.length === 0) return null

  var items = tab === 'volumen' ? topVolumen : topGanancia
  var maxVal = tab === 'volumen'
    ? Math.max.apply(null, (topVolumen || []).map(function(e) { return e[1].litros }).concat([1]))
    : Math.max.apply(null, (topGanancia || []).map(function(e) { return e[1].ganancia }).concat([1]))

  var topVol = topVolumen && topVolumen[0] ? topVolumen[0][0] : null
  var topGan = topGanancia && topGanancia[0] ? topGanancia[0][0] : null
  var hayDivergencia = topVol && topGan && topVol !== topGan

  return (
    <div className="card">
      <div className="card-title">Recetas</div>

      {hayDivergencia && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#f59e0b', lineHeight: 1.6 }}>
          <strong>{topGan}</strong> deja mas ganancia que <strong>{topVol}</strong>, aunque se vende menos litros.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[{ key: 'volumen', label: 'Por litros' }, { key: 'ganancia', label: 'Por ganancia' }].map(function(t) {
          return (
            <button key={t.key} onClick={function() { setTab(t.key) }} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tab === t.key ? 'var(--cyan)' : 'rgba(255,255,255,0.06)', color: tab === t.key ? '#000' : 'var(--muted)' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {(items || []).map(function(entry, i) {
        var nombre = entry[0]
        var d = entry[1]
        var val = tab === 'volumen' ? d.litros : d.ganancia
        var pct = maxVal > 0 ? val / maxVal : 0
        var mc = d.margen >= 0.65 ? 'var(--green)' : d.margen >= 0.50 ? 'var(--cyan)' : 'var(--pink)'
        var bg = i === 0 ? (tab === 'volumen' ? 'linear-gradient(90deg,var(--cyan),#00e5e5)' : 'linear-gradient(90deg,var(--green),#4ade80)') : 'rgba(255,255,255,0.15)'
        return (
          <div key={nombre} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? 'var(--cyan)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i === 0 ? '#000' : 'var(--muted)', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{nombre}</span>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: tab === 'volumen' ? 'var(--text)' : 'var(--green)' }}>
                  {tab === 'volumen' ? (d.litros + 'L') : formatCLP(d.ganancia)}
                </div>
                {d.margen > 0 && <div style={{ fontSize: 11, color: mc }}>{formatPct(d.margen)}</div>}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, width: (pct * 100) + '%', background: bg, transition: 'width 0.4s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tooltip cyberpunk reutilizable ─────────────────────────────────────────
// Usa position:fixed + getBoundingClientRect para que la burbuja nunca se
// salga de la pantalla en móvil (se ajusta a los bordes del viewport).
function InfoTip({ texto }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = React.useRef(null)

  const toggle = () => {
    if (abierto) { setAbierto(false); return }
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const margen = 12
    const maxAncho = 260
    const ancho = Math.min(maxAncho, window.innerWidth - margen * 2)
    // Centrar sobre el botón, pero clamp a los bordes del viewport
    let left = rect.left + rect.width / 2 - ancho / 2
    left = Math.max(margen, Math.min(left, window.innerWidth - ancho - margen))
    setPos({ left, top: rect.top, ancho })
    setAbierto(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
          border: '1px solid var(--cyan-dim)', background: 'rgba(0,180,180,0.1)',
          color: 'var(--cyan)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, padding: 0,
        }}
        aria-label="Más información"
      >i</button>
      {abierto && pos && (
        <span style={{
          position: 'fixed', left: pos.left, top: pos.top, zIndex: 300,
          transform: 'translateY(-100%) translateY(-8px)',
          width: pos.ancho, background: 'var(--bg2)', border: '1px solid var(--cyan-dim)',
          borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--text)',
          lineHeight: 1.6, boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
          textTransform: 'none', letterSpacing: 0, fontWeight: 400,
        }}>
          {texto}
        </span>
      )}
    </>
  )
}

// ─── Sección RENTABILIDAD: tres márgenes con label explicativo ──────────────
function Rentabilidad({ r }) {
  if (!r) return null
  const filas = [
    {
      label: 'Margen bruto',
      pct: r.margenBruto,
      pesos: r.gananciaBruta,
      color: 'var(--green)',
      desc: 'Lo que queda después del costo de los insumos (COGS): receta, merma y envase. Es la rentabilidad pura del producto.',
    },
    {
      label: 'Margen operativo',
      pct: r.margenOperativo,
      pesos: r.gananciaOperativa,
      color: 'var(--cyan)',
      desc: 'Margen bruto menos publicidad, transporte/delivery y otros gastos variables. Es lo que deja la operación del día a día.',
    },
    {
      label: 'Margen neto',
      pct: r.margenNeto,
      pesos: r.gananciaNeta,
      color: r.tieneCostoOportunidad ? 'var(--purple)' : 'var(--muted)',
      desc: r.tieneCostoOportunidad
        ? 'Margen operativo menos el costo de oportunidad de tu tiempo como operador. Es la ganancia real considerando tus horas.'
        : 'Margen operativo menos el costo de oportunidad de tu tiempo. Aún no registras horas trabajadas — cuando lo hagas, este número se ajusta.',
    },
  ]
  return (
    <div className="card">
      <div className="card-title">Rentabilidad</div>
      {filas.map((f, i) => (
        <div key={f.label} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingBottom: 10, marginBottom: 10,
          borderBottom: i < filas.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{f.label}</span>
              <InfoTip texto={f.desc} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {formatCLP(f.pesos)} {f.pesos >= 0 ? 'de ganancia' : 'de pérdida'}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: f.color, flexShrink: 0 }}>
            {formatPct(f.pct)}
          </div>
        </div>
      ))}
      <div style={{
        padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
        borderRadius: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7,
      }}>
        💡 El <strong style={{ color: 'var(--green)' }}>bruto</strong> mide tu producto,
        el <strong style={{ color: 'var(--cyan)' }}>operativo</strong> mide tu operación,
        el <strong style={{ color: 'var(--purple)' }}>neto</strong> mide tu negocio completo.
      </div>
    </div>
  )
}

// ─── Rotación de capital de trabajo (antes mal llamado "ROI") ───────────────
function RotacionCapital({ inversion, ingresoTotal, rotacion }) {
  return (
    <div className="kpi-grid">
      <div className="kpi-card" style={{ gridColumn: '1 / -1', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="kpi-label" style={{ marginBottom: 0 }}>Rotación de capital de trabajo</span>
            <InfoTip texto={`Tu capital de trabajo (${formatCLP(inversion)}) ha rotado ${rotacion.toFixed(1)} veces, generando ingresos por ${formatCLP(ingresoTotal)}. No es ROI: mide cuántas veces tu capital "dio la vuelta", no la ganancia neta.`} />
          </div>
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--cyan)' }}>
            {rotacion.toFixed(1)}×
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
          {formatCLP(inversion)} de capital → {formatCLP(ingresoTotal)} en ingresos
        </div>
      </div>
    </div>
  )
}

// ─── PATRIMONIO NETO: pone la caja disponible en contexto ───────────────────
function PatrimonioNeto({ data }) {
  const caja = data.saldoCaja || 0
  const inventario = data.inventarioRotable || 0
  const capitalTrabajo = data.capitalTrabajoStock || 0
  const activosFijos = data.totalActivosFijos || 0
  const patrimonioNeto = caja + inventario + activosFijos
  // "invertido" = lo que Ro puso de su bolsillo (capital de trabajo + equipos)
  const invertido = capitalTrabajo + activosFijos

  const componentes = [
    { label: 'Caja disponible', valor: caja, color: 'var(--green)',
      desc: 'Efectivo líquido disponible hoy.' },
    { label: 'Inventario rotable', valor: inventario, color: 'var(--cyan)',
      desc: 'Valor del stock actual de insumos a costo PPP — se convierte en ventas.' },
    { label: 'Capital de trabajo', valor: capitalTrabajo, color: 'var(--text)',
      desc: 'Envases y capital operativo inicial invertido en el negocio.' },
    { label: 'Activos fijos', valor: activosFijos, color: 'var(--purple)',
      desc: 'Equipos y utensilios — valor que no rota pero es tuyo.' },
  ]

  return (
    <div className="card" style={{ border: '1px solid rgba(34,197,94,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>Patrimonio neto</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>
          {formatCLP(patrimonioNeto)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {componentes.map(c => (
          <div key={c.label} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>{c.label}</span>
              <InfoTip texto={c.desc} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>
              {formatCLP(c.valor)}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '10px 12px', background: 'rgba(34,197,94,0.06)',
        border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8,
        fontSize: 12, color: 'var(--text)', lineHeight: 1.7,
      }}>
        Has invertido <strong style={{ color: 'var(--text-strong)' }}>{formatCLP(invertido)}</strong> y
        construido <strong style={{ color: 'var(--green)' }}>{formatCLP(patrimonioNeto)}</strong> de valor.
        {invertido > 0 && patrimonioNeto > invertido && (
          <span> Eso es <strong style={{ color: 'var(--green)' }}>{formatCLP(patrimonioNeto - invertido)}</strong> de valor creado por encima de lo que pusiste.</span>
        )}
        <span style={{ display: 'block', marginTop: 4, color: 'var(--muted)', fontSize: 11 }}>
          La caja baja no significa pérdida: parte de tu dinero está en stock y equipos, no en efectivo.
        </span>
      </div>
    </div>
  )
}

const META_SEMANAL_DEFAULT = 250000 // $250k por semana como meta base

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [ventas, setVentas] = useState([])
  const [alertasStock, setAlertasStock] = useState([])
  const [transferenciasMes, setTransferenciasMes] = useState(0)
  const [limiteTransferencias, setLimiteTransferencias] = useState(50)
  const [loading, setLoading] = useState(true)
  const [metaSemanal, setMetaSemanal] = useState(() => {
    const saved = localStorage.getItem('meta_semanal')
    return saved ? parseInt(saved) : META_SEMANAL_DEFAULT
  })
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [metaInput, setMetaInput] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: cfg }, { data: vts }, { data: cja }, { data: cmp }, { data: ins }, { data: ordenes }, { data: recIng }, { data: insumosConPPP }] = await Promise.all([
        supabase.from('config').select('*'),
        supabase.from('ventas').select('*').order('fecha', { ascending: false }),
        supabase.from('caja').select('*'),
        supabase.from('compras').select('precio_total, es_inversion, tipo'),
        supabase.from('insumos').select('nombre, stock_actual, stock_minimo, unidad, costo_ppp'),
        supabase.from('ordenes').select('id, fecha, medio_pago, cliente_nombre'),
        supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad, unidad'),
        supabase.from('insumos').select('nombre, costo_ppp'),
      ])

      const config = {}
      cfg?.forEach(c => { config[c.clave] = c.valor })

      const limiteXfer = parseInt(config.limite_transferencias) || 50
      setLimiteTransferencias(limiteXfer)

      const inversion = cmp?.reduce((s, c) =>
        (c.es_inversion || c.tipo === 'capital_trabajo') && c.tipo !== 'activo_fijo'
          ? s + c.precio_total : s, 0) || config.inversion_total || 120480
      const totalActivosFijos = cmp?.reduce((s, c) =>
        c.tipo === 'activo_fijo' ? s + c.precio_total : s, 0) || 0
      const ingresoTotal = vts?.reduce((s, v) => s + (v.litros * v.precio_venta), 0) || 0
      const litrosTotales = vts?.reduce((s, v) => s + v.litros, 0) || 0

      const merma = parseFloat(config.merma_pct) || 0.08
      const costoEnvase = parseFloat(config.costo_envase) || 794.6
      const costoPorReceta = {}
      const recetasUnicas = [...new Set((recIng || []).map(i => i.receta_nombre))]
      recetasUnicas.forEach(nombre => {
        const ings = (recIng || []).filter(i => i.receta_nombre === nombre && i.insumo_nombre !== 'ENVASE')
        costoPorReceta[nombre] = calcularCostoReceta(ings, insumosConPPP || [], merma, costoEnvase)
      })
      const costoTotalReal = (vts || []).reduce((s, v) => {
        const cu = costoPorReceta[v.receta_nombre] || 0
        return s + cu * v.litros
      }, 0)

      // ── Rentabilidad: tres márgenes desde el módulo central ──────────────
      const gastosCajaSalida = (cja || []).filter(m => m.tipo === 'salida')
      const horasTrabajadas = parseFloat(config.horas_trabajadas_total) || 0
      const costoHora = parseFloat(config.costo_hora_operador) || 0
      const rentabilidad = calcularRentabilidad({
        ventas: vts || [],
        recetaIngredientes: recIng || [],
        insumosPPP: insumosConPPP || [],
        gastosCaja: gastosCajaSalida,
        config: { merma_pct: merma, costo_envase: costoEnvase },
        horasTrabajadas,
        costoHora,
      })

      // ── Inventario rotable: valor del stock actual de insumos a costo PPP ──
      const inventarioRotable = (ins || []).reduce((s, i) => {
        const stock = parseFloat(i.stock_actual) || 0
        const ppp = parseFloat(i.costo_ppp) || 0
        return s + stock * ppp
      }, 0)
      // capital de trabajo (envases / capital operativo) = misma `inversion`
      const capitalTrabajoStock = inversion

      const totalVentas = vts?.reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0) || 0
      const totalCompras = cmp?.reduce((s, c) => s + (c.es_inversion ? 0 : c.precio_total), 0) || 0
      const movExtraEntradas = cja?.filter(m => m.tipo === 'entrada' && m.categoria !== 'Venta' && m.categoria !== 'Delivery').reduce((s, m) => s + m.monto, 0) || 0
      const movExtraSalidas = cja?.filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos').reduce((s, m) => s + m.monto, 0) || 0
      const saldoCaja = totalVentas - totalCompras + movExtraEntradas - movExtraSalidas

      const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
      const vtsMes = vts?.filter(v => new Date(v.fecha) >= hace30) || []
      const ingresoMes = vtsMes.reduce((s, v) => s + (v.litros * v.precio_venta), 0)

      const totalOrdenes = (ordenes || []).length
      const ticketPromedio = totalOrdenes > 0 ? ingresoTotal / totalOrdenes : 0

      const ticketsPorOrden = (ordenes || []).map(o => {
        const vo = (vts || []).filter(v => v.orden_id === o.id)
        return vo.reduce((s, v) => s + v.litros * v.precio_venta, 0)
      }).filter(t => t > 0).sort((a, b) => a - b)
      const mid = Math.floor(ticketsPorOrden.length / 2)
      const ticketMediana = ticketsPorOrden.length === 0 ? 0
        : ticketsPorOrden.length % 2 !== 0
          ? ticketsPorOrden[mid]
          : (ticketsPorOrden[mid - 1] + ticketsPorOrden[mid]) / 2

      const porCliente = {}
      ;(ordenes || []).forEach(o => {
        if (!o.cliente_nombre) return
        const key = o.cliente_nombre.trim().toLowerCase()
        if (!porCliente[key]) porCliente[key] = { nombre: o.cliente_nombre, pedidos: 0, gastado: 0 }
        porCliente[key].pedidos++
        // sumar gasto de este pedido
        const ventasOrden = (vts || []).filter(v => v.orden_id === o.id)
        porCliente[key].gastado += ventasOrden.reduce((s, v) => s + v.litros * v.precio_venta, 0)
      })
      const clientesConNombre = Object.values(porCliente)
      const clientesRecurrentes = clientesConNombre.filter(c => c.pedidos > 1)
      const totalClientesNombrados = clientesConNombre.length
      const pctRecurrentes = totalClientesNombrados > 0 ? clientesRecurrentes.length / totalClientesNombrados : 0
      const topRecurrentes = clientesRecurrentes.sort((a, b) => b.gastado - a.gastado).slice(0, 5)

      // Semana actual vs semana anterior
      const hoyDate = new Date()
      const hace7 = new Date(hoyDate); hace7.setDate(hoyDate.getDate() - 7)
      const hace14 = new Date(hoyDate); hace14.setDate(hoyDate.getDate() - 14)
      const ingresoSemAct = (vts || []).filter(v => new Date(v.fecha) >= hace7).reduce((s, v) => s + v.litros * v.precio_venta, 0)
      const ingresoSemAnt = (vts || []).filter(v => new Date(v.fecha) >= hace14 && new Date(v.fecha) < hace7).reduce((s, v) => s + v.litros * v.precio_venta, 0)
      const deltaSem = ingresoSemAnt > 0 ? (ingresoSemAct - ingresoSemAnt) / ingresoSemAnt : null

      // Canal más activo (desde que se registra origen)
      const porOrigen = {}
      ;(vts || []).filter(v => v.origen).forEach(v => {
        porOrigen[v.origen] = (porOrigen[v.origen] || 0) + v.litros * v.precio_venta
      })
      const canalTop = Object.entries(porOrigen).sort((a, b) => b[1] - a[1])[0] || null

      // Próximo evento de alta venta
      const EVENTOS_PROX = [
        { fecha: '2026-05-15', label: 'Quincena mayo', tipo: 'pago' },
        { fecha: '2026-05-21', label: 'Gloria Navales', tipo: 'feriado' },
        { fecha: '2026-05-30', label: 'Fin de mes', tipo: 'pago' },
        { fecha: '2026-06-15', label: 'Quincena junio', tipo: 'pago' },
        { fecha: '2026-06-29', label: 'San Pedro y San Pablo', tipo: 'feriado' },
        { fecha: '2026-07-16', label: 'Virgen del Carmen', tipo: 'feriado' },
        { fecha: '2026-09-18', label: 'Fiestas Patrias', tipo: 'feriado' },
      ]
      const hoyStr = hoyDate.toISOString().slice(0, 10)
      const proximoEvento = EVENTOS_PROX.find(e => e.fecha > hoyStr) || null
      let diasHastaEvento = null
      if (proximoEvento) {
        const [ey, em, ed] = proximoEvento.fecha.split('-').map(Number)
        const evDate = new Date(ey, em - 1, ed)
        diasHastaEvento = Math.ceil((evDate - hoyDate) / (1000 * 60 * 60 * 24))
      }

      const porReceta = {}
      vts?.forEach(v => {
        if (!porReceta[v.receta_nombre]) porReceta[v.receta_nombre] = { litros: 0, ingreso: 0, costo: 0 }
        porReceta[v.receta_nombre].litros += v.litros
        porReceta[v.receta_nombre].ingreso += v.litros * v.precio_venta
        porReceta[v.receta_nombre].costo += (costoPorReceta[v.receta_nombre] || 0) * v.litros
      })
      Object.values(porReceta).forEach(r => {
        r.ganancia = r.ingreso - r.costo
        r.margen = r.ingreso > 0 ? r.ganancia / r.ingreso : 0
      })
      const topRecetas = Object.entries(porReceta).sort((a, b) => b[1].litros - a[1].litros).slice(0, 5)
      const topPorGanancia = Object.entries(porReceta).sort((a, b) => b[1].ganancia - a[1].ganancia).slice(0, 5)

      const alertas = (ins || []).filter(i => i.stock_actual != null && i.stock_minimo != null && i.stock_actual <= i.stock_minimo)
      setAlertasStock(alertas)

      const ahora = new Date()
      const inicioMes = ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0') + '-01'
      const transferencias = (ordenes || []).filter(o => o.medio_pago === 'transferencia' && o.fecha >= inicioMes).length
      setTransferenciasMes(transferencias)

      setData({ inversion, ingresoTotal, litrosTotales, costoTotalReal, saldoCaja, ingresoMes, ticketPromedio, ticketMediana, totalOrdenes, clientesRecurrentes: clientesRecurrentes.length, totalClientesNombrados, pctRecurrentes, topRecurrentes, totalActivosFijos, ingresoSemAct, ingresoSemAnt, deltaSem, canalTop, proximoEvento, diasHastaEvento, rentabilidad, inventarioRotable, capitalTrabajoStock })
      setVentas({ topRecetas, topPorGanancia, recientes: vts?.slice(0, 5) || [] })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Cargando...</div>

  // Rotación de capital de trabajo: cuántas veces el capital de trabajo
  // "dio la vuelta" en ingresos. NO es ROI (no descuenta costos): es rotación.
  const rotacionCapital = data.inversion > 0 ? data.ingresoTotal / data.inversion : 0

  const pctXfer = transferenciasMes / limiteTransferencias
  const restantesXfer = limiteTransferencias - transferenciasMes
  const colorXfer = pctXfer >= 1 ? 'var(--pink)' : pctXfer >= 0.8 ? '#f59e0b' : 'var(--cyan)'
  const bgXfer = pctXfer >= 1 ? 'rgba(196,0,90,0.08)' : pctXfer >= 0.8 ? 'rgba(245,158,11,0.08)' : 'rgba(0,180,180,0.06)'
  const borderXfer = pctXfer >= 1 ? 'rgba(196,0,90,0.35)' : pctXfer >= 0.8 ? 'rgba(245,158,11,0.35)' : 'rgba(0,180,180,0.2)'
  const labelXfer = pctXfer >= 1 ? 'Limite alcanzado' : pctXfer >= 0.8 ? 'Cerca del limite' : 'Transferencias del mes'
  const msgXfer = pctXfer >= 1 ? 'Alcanzaste el limite. No registres mas transferencias este mes.' : 'Quedan ' + restantesXfer + ' transferencias disponibles.'
  const barXfer = Math.min(100, pctXfer * 100) + '%'

  // Contexto nacional: zona de pago / feriado
  const hoyDash = new Date()
  const diaMesDash = hoyDash.getDate()
  const enZonaPagoDash = (diaMesDash >= 28) || (diaMesDash <= 5)
  const enQuincenadaDash = (diaMesDash >= 13 && diaMesDash <= 17)
  const FERIADOS_DASH = {
    '2026-05-21': 'Gloria Navales',
    '2026-06-29': 'San Pedro y San Pablo',
    '2026-07-16': 'Virgen del Carmen',
    '2026-09-18': 'Fiestas Patrias',
    '2026-09-19': 'Glorias del Ejército',
    '2026-12-25': 'Navidad',
  }
  const keyHoyDash = hoyDash.toISOString().slice(0, 10)
  const mananaD = new Date(hoyDash); mananaD.setDate(hoyDash.getDate() + 1)
  const keyManDash = mananaD.toISOString().slice(0, 10)
  const feriadoHoyDash = FERIADOS_DASH[keyHoyDash]
  const feriadoManDash = FERIADOS_DASH[keyManDash]

  const bannerCtx = feriadoHoyDash
    ? { msg: `🎉 Hoy es ${feriadoHoyDash} — feriado. Días así promedias $74.000. ¿Tenés stock?`, color: 'rgba(127,119,221,0.12)', borde: 'rgba(127,119,221,0.4)', txt: '#AFA9EC' }
    : feriadoManDash
    ? { msg: `🎉 Mañana es ${feriadoManDash} — víspera de feriado. Buen momento para activar Instagram hoy.`, color: 'rgba(127,119,221,0.08)', borde: 'rgba(127,119,221,0.25)', txt: '#AFA9EC' }
    : enZonaPagoDash
    ? { msg: `💵 Zona de sueldos (día ${diaMesDash}) — tu inicio de mes promedia 4× más que días normales. Activa.`, color: 'rgba(16,185,129,0.08)', borde: 'rgba(16,185,129,0.3)', txt: '#10b981' }
    : enQuincenadaDash
    ? { msg: `💵 Quincena (día ${diaMesDash}) — segundo peak del mes. Considera pautar.`, color: 'rgba(245,158,11,0.08)', borde: 'rgba(245,158,11,0.3)', txt: '#f59e0b' }
    : null

  return (
    <div className="page">
      <div className="page-title">The Drink</div>

      {bannerCtx && (
        <div style={{ background: bannerCtx.color, border: `1px solid ${bannerCtx.borde}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: bannerCtx.txt, lineHeight: 1.6, fontWeight: 600 }}>
          {bannerCtx.msg}
        </div>
      )}

      {alertasStock.length > 0 && (
        <div style={{ background: 'rgba(196,0,90,0.08)', border: '1px solid rgba(196,0,90,0.35)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--pink)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
            Stock critico
          </div>
          {alertasStock.map(i => (
            <div key={i.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 600 }}>{i.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--pink)' }}>{i.stock_actual} {i.unidad} (min {i.stock_minimo})</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: bgXfer, border: '1px solid ' + borderXfer, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: colorXfer, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>{labelXfer}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: colorXfer }}>
            {transferenciasMes}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>/{limiteTransferencias}</span>
          </div>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: barXfer, background: colorXfer, borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{msgXfer}</div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Ingresos totales</div>
          <div className="kpi-value cyan">{formatCLP(data.ingresoTotal)}</div>
          <div className="kpi-sub">acumulado</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Litros vendidos</div>
          <div className="kpi-value">{data.litrosTotales}L</div>
          <div className="kpi-sub">total</div>
        </div>
      </div>

      {/* ── RENTABILIDAD: tres márgenes con explicación ──────────────────── */}
      <Rentabilidad r={data.rentabilidad} />

      {/* ── Rotación de capital de trabajo (antes "ROI capital trabajo") ─── */}
      <RotacionCapital
        inversion={data.inversion}
        ingresoTotal={data.ingresoTotal}
        rotacion={rotacionCapital}
      />

      {/* ── PATRIMONIO NETO: la caja en contexto ───────────────────────── */}
      <PatrimonioNeto data={data} />

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Ultimos 30 dias</div>
          <div className="kpi-value cyan">{formatCLP(data.ingresoMes)}</div>
          <div className="kpi-sub">ingresos del mes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Caja disponible</div>
          <div className="kpi-value green">{formatCLP(data.saldoCaja)}</div>
          <div className="kpi-sub">efectivo líquido hoy</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Ticket tipico</div>
          <div className="kpi-value cyan">{formatCLP(data.ticketMediana)}</div>
          <div className="kpi-sub">
            {'mediana . ' + data.totalOrdenes + ' pedidos'}
            {data.ticketPromedio > 0 && (
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>
                {'prom. ' + formatCLP(data.ticketPromedio)}
              </span>
            )}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Clientes recurrentes</div>
          <div className="kpi-value" style={{ color: data.pctRecurrentes >= 0.3 ? 'var(--green)' : 'var(--text)' }}>
            {data.clientesRecurrentes}
            {data.totalClientesNombrados > 0 && (
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>{'/' + data.totalClientesNombrados}</span>
            )}
          </div>
          <div className="kpi-sub">
            {data.totalClientesNombrados > 0 ? (Math.round(data.pctRecurrentes * 100) + '% vuelve') : 'registra clientes para ver'}
          </div>
        </div>
      </div>

      {/* Meta semanal */}
      {(() => {
        const pctMeta = metaSemanal > 0 ? Math.min(1, data.ingresoSemAct / metaSemanal) : 0
        const colorMeta = pctMeta >= 1 ? 'var(--green)' : pctMeta >= 0.7 ? 'var(--cyan)' : pctMeta >= 0.4 ? '#f59e0b' : 'var(--pink)'
        const falta = Math.max(0, metaSemanal - data.ingresoSemAct)
        return (
          <div style={{ background: 'rgba(0,180,180,0.05)', border: '1px solid rgba(0,180,180,0.18)', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Meta semana
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: colorMeta }}>
                  {Math.round(pctMeta * 100)}%
                </div>
                {editandoMeta ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="number" value={metaInput}
                      onChange={e => setMetaInput(e.target.value)}
                      style={{ width: 90, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '3px 8px', fontSize: 12 }}
                      placeholder="ej: 300000" />
                    <button onClick={() => {
                      const v = parseInt(metaInput)
                      if (v > 0) { setMetaSemanal(v); localStorage.setItem('meta_semanal', v) }
                      setEditandoMeta(false)
                    }} style={{ background: 'var(--cyan)', border: 'none', borderRadius: 6, color: '#000', padding: '3px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>OK</button>
                    <button onClick={() => setEditandoMeta(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
                  </div>
                ) : (
                  <button onClick={() => { setMetaInput(String(metaSemanal)); setEditandoMeta(true) }}
                    style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>
                    {formatCLP(metaSemanal)}
                  </button>
                )}
              </div>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${pctMeta * 100}%`, background: colorMeta, borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {pctMeta >= 1
                ? `✅ Meta superada · ${formatCLP(data.ingresoSemAct - metaSemanal)} extra`
                : `Faltan ${formatCLP(falta)} · ${data.deltaSem !== null ? (data.deltaSem >= 0 ? `↑ ${(data.deltaSem*100).toFixed(0)}% vs sem. ant.` : `↓ ${Math.abs(data.deltaSem*100).toFixed(0)}% vs sem. ant.`) : ''}`}
            </div>
          </div>
        )
      })()}

      {/* Semana actual vs anterior */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Esta semana</div>
          <div className="kpi-value cyan">{formatCLP(data.ingresoSemAct)}</div>
          <div className="kpi-sub" style={{ color: data.deltaSem === null ? 'var(--muted)' : data.deltaSem >= 0 ? 'var(--green)' : 'var(--pink)' }}>
            {data.deltaSem === null ? 'sin semana anterior'
              : data.deltaSem >= 0
              ? `↑ ${(data.deltaSem * 100).toFixed(0)}% vs semana pasada`
              : `↓ ${Math.abs((data.deltaSem * 100).toFixed(0))}% vs semana pasada`}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Semana anterior</div>
          <div className="kpi-value">{formatCLP(data.ingresoSemAnt)}</div>
          <div className="kpi-sub">últimos 7–14 días</div>
        </div>
      </div>

      {/* Canal top + próximo evento */}
      {(data.canalTop || data.proximoEvento) && (
        <div className="kpi-grid">
          {data.canalTop && (
            <div className="kpi-card">
              <div className="kpi-label">Canal top</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>
                {data.canalTop[0] === 'Instagram' ? '📱' : data.canalTop[0] === 'Referido' ? '🤝' : data.canalTop[0] === 'Cliente habitual' ? '⭐' : '•'} {data.canalTop[0]}
              </div>
              <div className="kpi-sub">{formatCLP(data.canalTop[1])} acumulado</div>
            </div>
          )}
          {data.proximoEvento && (
            <div className="kpi-card" style={{ background: data.proximoEvento.tipo === 'feriado' ? 'rgba(127,119,221,0.08)' : 'rgba(16,185,129,0.08)', borderColor: data.proximoEvento.tipo === 'feriado' ? 'rgba(127,119,221,0.3)' : 'rgba(16,185,129,0.3)' }}>
              <div className="kpi-label">{data.proximoEvento.tipo === 'feriado' ? '🎉 Próximo feriado' : '💵 Próximo pico'}</div>
              <div className="kpi-value" style={{ fontSize: 18, color: data.proximoEvento.tipo === 'feriado' ? '#AFA9EC' : '#10b981' }}>{data.proximoEvento.label}</div>
              <div className="kpi-sub">en {data.diasHastaEvento} días · pautar antes</div>
            </div>
          )}
        </div>
      )}

      {data.topRecurrentes.length > 0 && (
        <div className="card">
          <div className="card-title">Top clientes</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Por gasto acumulado · Toca un nombre en Ventas para ver su perfil completo.</div>
          {data.topRecurrentes.map((c, idx) => (
            <div className="list-item" key={c.nombre}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: idx === 0 ? 'var(--cyan)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: idx === 0 ? '#000' : 'var(--muted)', flexShrink: 0 }}>{idx + 1}</span>
                <div>
                  <div className="list-item-name">{c.nombre}</div>
                  <div className="list-item-sub">{c.pedidos} pedidos</div>
                </div>
              </div>
              <div className="list-item-right">
                <div className="list-item-value" style={{ color: idx === 0 ? 'var(--green)' : 'var(--text)' }}>{formatCLP(c.gastado)}</div>
                {c.pedidos >= 3 && <div style={{ fontSize: 10, color: '#f59e0b' }}>⭐ VIP</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <RecetasComparativo topVolumen={ventas.topRecetas} topGanancia={ventas.topPorGanancia} />

      <div className="card">
        <div className="card-title">Ultimas ventas</div>
        {(ventas.recientes || []).map(v => (
          <div className="list-item" key={v.id}>
            <div>
              <div className="list-item-name">{v.receta_nombre}</div>
              <div className="list-item-sub">{v.fecha} - {v.litros}L</div>
            </div>
            <div className="list-item-right">
              <div className="list-item-value">{formatCLP(v.litros * v.precio_venta)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
