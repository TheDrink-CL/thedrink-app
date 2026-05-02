import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularCostoReceta, formatCLP, formatPct } from '../lib/calculos'

// ─── Comparativo: volumen vs rentabilidad ────────────────────────────────────
function RecetasComparativo({ topVolumen, topGanancia }) {
  const [tab, setTab] = useState('volumen')

  if (!topVolumen || topVolumen.length === 0) return null

  const items = tab === 'volumen' ? topVolumen : topGanancia
  const maxVal = tab === 'volumen'
    ? Math.max(...(topVolumen || []).map(([, d]) => d.litros), 1)
    : Math.max(...(topGanancia || []).map(([, d]) => d.ganancia), 1)

  // Detectar si la receta top por volumen es diferente a la top por ganancia
  const topVol = topVolumen?.[0]?.[0]
  const topGan = topGanancia?.[0]?.[0]
  const hayDivergencia = topVol && topGan && topVol !== topGan

  return (
    <div className="card">
      <div className="card-title">Recetas</div>

      {/* Alerta de divergencia */}
      {hayDivergencia && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#f59e0b', lineHeight: 1.6
        }}>
          ⚡ <strong>{topGan}</strong> deja más ganancia que <strong>{topVol}</strong>, aunque se vende menos litros.
          Considera priorizar su producción.
        </div>
      )}

      {/* Toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          { key: 'volumen', label: 'Por litros' },
          { key: 'ganancia', label: 'Por ganancia' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: tab === t.key ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
              color: tab === t.key ? '#000' : 'var(--muted)',
              transition: 'all 0.2s'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {items?.map(([nombre, d], i) => {
        const val = tab === 'volumen' ? d.litros : d.ganancia
        const pct = maxVal > 0 ? val / maxVal : 0
        const margenColor = d.margen >= 0.65 ? 'var(--green)' : d.margen >= 0.50 ? 'var(--cyan)' : 'var(--pink)'
        return (
          <div key={nombre} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: i === 0 ? 'var(--cyan)' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: i === 0 ? '#000' : 'var(--muted)', flexShrink: 0
                }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{nombre}</span>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: tab === 'volumen' ? 'var(--text)' : 'var(--green)' }}>
                  {tab === 'volumen' ? `${d.litros}L` : formatCLP(d.ganancia)}
                </div>
                {d.margen > 0 && (
                  <div style={{ fontSize: 11, color: margenColor }}>{formatPct(d.margen)}</div>
                )}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, width: `${pct * 100}%`,
                background: i === 0
                  ? (tab === 'volumen' ? 'linear-gradient(90deg,var(--cyan),#00e5e5)' : 'linear-gradient(90deg,var(--green),#4ade80)')
                  : 'rgba(255,255,255,0.15)',
                transition: 'width 0.4s'
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [ventas, setVentas] = useState([])
  const [alertasStock, setAlertasStock] = useState([])
  const [transferenciasMes, setTransferenciasMes] = useState(0)
  const [limiteTransferencias, setLimiteTransferencias] = useState(50)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: cfg }, { data: vts }, { data: cja }, { data: cmp }, { data: ins }, { data: ordenes }, { data: recIng }, { data: insumosConPPP }] = await Promise.all([
        supabase.from('config').select('*'),
        supabase.from('ventas').select('*').order('fecha', { ascending: false }),
        supabase.from('caja').select('*'),
        supabase.from('compras').select('precio_total, es_inversion, tipo'),
        supabase.from('insumos').select('nombre, stock_actual, stock_minimo, unidad'),
        supabase.from('ordenes').select('id, fecha, medio_pago, cliente_nombre'),
        supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad, unidad'),
        supabase.from('insumos').select('nombre, costo_ppp'),
      ])

      const config = {}
      cfg?.forEach(c => { config[c.clave] = c.valor })

      // Límite de transferencias desde config, fallback a 50
      const limiteXfer = parseInt(config.limite_transferencias) || 50
      setLimiteTransferencias(limiteXfer)

      // Inversión: solo capital de trabajo (es_inversion=true), excluye activos fijos (tipo='activo_fijo')
      const inversion = cmp?.reduce((s, c) =>
        (c.es_inversion || c.tipo === 'capital_trabajo') && c.tipo !== 'activo_fijo'
          ? s + c.precio_total : s, 0) || config.inversion_total || 120480
      // Activos fijos registrados
      const totalActivosFijos = cmp?.reduce((s, c) =>
        c.tipo === 'activo_fijo' ? s + c.precio_total : s, 0) || 0
      const ingresoTotal = vts?.reduce((s, v) => s + (v.litros * v.precio_venta), 0) || 0
      const litrosTotales = vts?.reduce((s, v) => s + v.litros, 0) || 0

      // ── Costo real por receta usando PPP de insumos ──────────────────────
      const merma = parseFloat(config.merma_pct) || 0.08
      const costoEnvase = parseFloat(config.costo_envase) || 794.6
      // Mapa { receta_nombre → costo_por_litro }
      const costoPorReceta = {}
      const recetasUnicas = [...new Set((recIng || []).map(i => i.receta_nombre))]
      recetasUnicas.forEach(nombre => {
        const ings = (recIng || []).filter(i => i.receta_nombre === nombre && i.insumo_nombre !== 'ENVASE')
        costoPorReceta[nombre] = calcularCostoReceta(ings, insumosConPPP || [], merma, costoEnvase)
      })
      // Costo total acumulado de todas las ventas (usando PPP real)
      const costoTotalReal = (vts || []).reduce((s, v) => {
        const costoUnitario = costoPorReceta[v.receta_nombre] ?? 0
        return s + costoUnitario * v.litros
      }, 0)

      // Saldo caja real
      const totalVentas = vts?.reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0) || 0
      const totalCompras = cmp?.reduce((s, c) => s + (c.es_inversion ? 0 : c.precio_total), 0) || 0
      const movExtraEntradas = cja?.filter(m => m.tipo === 'entrada' && m.categoria !== 'Venta' && m.categoria !== 'Delivery').reduce((s, m) => s + m.monto, 0) || 0
      const movExtraSalidas = cja?.filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos').reduce((s, m) => s + m.monto, 0) || 0
      const saldoCaja = totalVentas - totalCompras + movExtraEntradas - movExtraSalidas

      // Ventas últimos 30 días
      const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
      const vtsMes = vts?.filter(v => new Date(v.fecha) >= hace30) || []
      const ingresoMes = vtsMes.reduce((s, v) => s + (v.litros * v.precio_venta), 0)

      // Ticket por orden
      const totalOrdenes = (ordenes || []).length
      const ticketPromedio = totalOrdenes > 0 ? ingresoTotal / totalOrdenes : 0

      // Ticket mediana — más representativo que el promedio ante outliers
      const ticketsPorOrden = (ordenes || []).map(o => {
        const ventasOrden = (vts || []).filter(v => v.orden_id === o.id)
        return ventasOrden.reduce((s, v) => s + v.litros * v.precio_venta, 0)
      }).filter(t => t > 0).sort((a, b) => a - b)
      const mid = Math.floor(ticketsPorOrden.length / 2)
      const ticketMediana = ticketsPorOrden.length === 0 ? 0
        : ticketsPorOrden.length % 2 !== 0
          ? ticketsPorOrden[mid]
          : (ticketsPorOrden[mid - 1] + ticketsPorOrden[mid]) / 2

      // Clientes recurrentes (han comprado más de 1 vez con nombre registrado)
      const porCliente = {}
      ;(ordenes || []).forEach(o => {
        if (!o.cliente_nombre) return
        const key = o.cliente_nombre.trim().toLowerCase()
        if (!porCliente[key]) porCliente[key] = { nombre: o.cliente_nombre, pedidos: 0 }
        porCliente[key].pedidos++
      })
      const clientesConNombre = Object.values(porCliente)
      const clientesRecurrentes = clientesConNombre.filter(c => c.pedidos > 1)
      const totalClientesNombrados = clientesConNombre.length
      const pctRecurrentes = totalClientesNombrados > 0
        ? clientesRecurrentes.length / totalClientesNombrados
        : 0
      // Top recurrentes (máx 3)
      const topRecurrentes = clientesRecurrentes
        .sort((a, b) => b.pedidos - a.pedidos)
        .slice(0, 3)

      // Top recetas — con costo real, margen y ganancia por litro
      const porReceta = {}
      vts?.forEach(v => {
        if (!porReceta[v.receta_nombre]) porReceta[v.receta_nombre] = { litros: 0, ingreso: 0, costo: 0 }
        porReceta[v.receta_nombre].litros += v.litros
        porReceta[v.receta_nombre].ingreso += v.litros * v.precio_venta
        porReceta[v.receta_nombre].costo += (costoPorReceta[v.receta_nombre] ?? 0) * v.litros
      })
      // Enriquecer con ganancia y margen
      Object.values(porReceta).forEach(r => {
        r.ganancia = r.ingreso - r.costo
        r.margen = r.ingreso > 0 ? r.ganancia / r.ingreso : 0
        r.gananciaPorLitro = r.litros > 0 ? r.ganancia / r.litros : 0
      })
      const topRecetas = Object.entries(porReceta)
        .sort((a, b) => b[1].litros - a[1].litros)
        .slice(0, 5)
      // Top por ganancia (puede diferir del top por volumen)
      const topPorGanancia = Object.entries(porReceta)
        .sort((a, b) => b[1].ganancia - a[1].ganancia)
        .slice(0, 5)

      // Alertas de stock
      const alertas = (ins || []).filter(i =>
        i.stock_actual != null && i.stock_minimo != null && i.stock_actual <= i.stock_minimo
      )
      setAlertasStock(alertas)

      // Transferencias del mes calendario actual
      const ahora = new Date()
      const inicioMes = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-01`
      const transferencias = (ordenes || []).filter(o =>
        o.medio_pago === 'transferencia' && o.fecha >= inicioMes
      ).length
      setTransferenciasMes(transferencias)

      setData({
        inversion, ingresoTotal, litrosTotales, costoTotalReal, saldoCaja, ingresoMes,
        ticketPromedio, ticketMediana, totalOrdenes,
        clientesRecurrentes: clientesRecurrentes.length,
        totalClientesNombrados, pctRecurrentes, topRecurrentes,
        totalActivosFijos, costoPorReceta,
      })
      setVentas({ topRecetas, topPorGanancia, recientes: vts?.slice(0, 5) || [] })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Cargando...</div>

  // Margen calculado con costo real por PPP (no hardcodeado)
  const margenPct = data.ingresoTotal > 0 ? (data.ingresoTotal - data.costoTotalReal) / data.ingresoTotal : 0
  const roi = data.inversion > 0 ? (data.ingresoTotal * margenPct) / data.inversion : 0

  return (
    <div className="page">
      <div className="page-title">The Drink</div>

      {/* Alertas de stock crítico */}
      {alertasStock.length > 0 && (
        <div style={{
          background: 'rgba(196,0,90,0.08)', border: '1px solid rgba(196,0,90,0.35)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 12
        }}>
          <div style={{ fontSize: 11, color: 'var(--pink)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
            ⚠ Stock crítico
          </div>
          {alertasStock.map(i => (
            <div key={i.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 600 }}>{i.nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--pink)' }}>
                {i.stock_actual} {i.unidad} (mín {i.stock_minimo})
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerta transferencias mensuales */}
      {(() => {
        const pct = transferenciasMes / limiteTransferencias
        const restantes = limiteTransferencias - transferenciasMes
        const color = pct >= 1 ? 'var(--pink)' : pct >= 0.8 ? '#f59e0b' : 'var(--cyan)'
        const bg = pct >= 1 ? 'rgba(196,0,90,0.08)' : pct >= 0.8 ? 'rgba(245,158,11,0.08)' : 'rgba(0,180,180,0.06)'
        const border = pct >= 1 ? 'rgba(196,0,90,0.35)' : pct >= 0.8 ? 'rgba(245,158,11,0.35)' : 'rgba(0,180,180,0.2)'
        return (
          <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {pct >= 1 ? '🚫 Límite alcanzado' : pct >= 0.8 ? '⚠ Cerca del límite' : '🏦 Transferencias del mes'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color }}>
                {transferenciasMes}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>/{limiteTransferencias}</span>
              </div>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {pct >= 1
                ? 'Alcanzaste el límite legal. No registres más transferencias este mes.'
                : `Quedan ${restantes} transferencias disponibles este mes.`}
            </div>
          </div>
        )
      })()}

      {/* KPIs principales */}
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
        <div className="kpi-card">
          <div className="kpi-label">Margen bruto</div>
          <div className="kpi-value green">{formatPct(margenPct)}</div>
          <div className="kpi-sub">sobre ventas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">ROI capital trabajo</div>
          <div className="kpi-value">{formatPct(roi)}</div>
          <div className="kpi-sub">recuperado</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Caja disponible</div>
          <div className="kpi-value green">{formatCLP(data.saldoCaja)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Últimos 30 días</div>
          <div className="kpi-value cyan">{formatCLP(data.ingresoMes)}</div>
        </div>
      </div>

      {data.totalActivosFijos > 0 && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Capital de trabajo</div>
            <div className="kpi-value">{formatCLP(data.inversion)}</div>
            <div className="kpi-sub">inversión inicial</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Activos fijos</div>
            <div className="kpi-value" style={{ color: 'var(--cyan)' }}>{formatCLP(data.totalActivosFijos)}</div>
            <div className="kpi-sub">equipos y utensilios</div>
          </div>
        </div>
      )}

      {/* Ticket promedio + Recurrencia */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Ticket típico</div>
          <div className="kpi-value cyan">{formatCLP(data.ticketMediana)}</div>
          <div className="kpi-sub">
            mediana · {data.totalOrdenes} pedidos
            {data.ticketPromedio > 0 && (
              <span style={{ display:'block', color:'var(--muted)', fontSize:10, marginTop:2 }}>
                prom. {formatCLP(data.ticketPromedio)}
              </span>
            )}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Clientes recurrentes</div>
          <div className="kpi-value" style={{ color: data.pctRecurrentes >= 0.3 ? 'var(--green)' : 'var(--text)' }}>
            {data.clientesRecurrentes}
            {data.totalClientesNombrados > 0 && (
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>
                /{data.totalClientesNombrados}
              </span>
            )}
          </div>
          <div className="kpi-sub">
            {data.totalClientesNombrados > 0
              ? `${Math.round(data.pctRecurrentes * 100)}% vuelve`
              : 'registra clientes para ver'}
          </div>
        </div>
      </div>

      {/* Top clientes recurrentes */}
      {data.topRecurrentes.length > 0 && (
        <div className="card">
          <div className="card-title">Clientes frecuentes</div>
          {data.topRecurrentes.map(c => (
            <div className="list-item" key={c.nombre}>
              <div>
                <div className="list-item-name">{c.nombre}</div>
                <div className="list-item-sub">{c.pedidos} pedidos</div>
              </div>
              <div className="list-item-right">
                <div style={{ display: 'flex', gap: 3 }}>
                  {Array.from({ length: Math.min(c.pedidos, 5) }).map((_, i) => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cyan)', opacity: 0.7 + i * 0.06 }} />
                  ))}
                  {c.pedidos > 5 && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>+{c.pedidos - 5}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comparativo rentabilidad vs volumen */}
      <RecetasComparativo topVolumen={ventas.topRecetas} topGanancia={ventas.topPorGanancia} />

      <div className="card">
        <div className="card-title">Últimas ventas</div>

      <div className="card">
        <div className="card-title">Últimas ventas</div>
        {ventas.recientes?.map(v => (
          <div className="list-item" key={v.id}>
            <div>
              <div className="list-item-name">{v.receta_nombre}</div>
              <div className="list-item-sub">{v.fecha} · {v.litros}L</div>
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
