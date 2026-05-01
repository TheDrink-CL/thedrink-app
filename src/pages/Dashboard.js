import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP, formatPct } from '../lib/calculos'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [ventas, setVentas] = useState([])
  const [alertasStock, setAlertasStock] = useState([])
  const [transferenciasMes, setTransferenciasMes] = useState(0)
  const [loading, setLoading] = useState(true)

  const LIMITE_TRANSFERENCIAS = 50

  useEffect(() => {
    async function load() {
      const [{ data: cfg }, { data: vts }, { data: cja }, { data: cmp }, { data: ins }, { data: ordenes }] = await Promise.all([
        supabase.from('config').select('*'),
        supabase.from('ventas').select('*').order('fecha', { ascending: false }),
        supabase.from('caja').select('*'),
        supabase.from('compras').select('precio_total, es_inversion'),
        supabase.from('insumos').select('nombre, stock_actual, stock_minimo, unidad'),
        supabase.from('ordenes').select('id, fecha, medio_pago, cliente_nombre'),
      ])

      const config = {}
      cfg?.forEach(c => { config[c.clave] = c.valor })

      const inversion = config.inversion_total || 120480
      const ingresoTotal = vts?.reduce((s, v) => s + (v.litros * v.precio_venta), 0) || 0
      const litrosTotales = vts?.reduce((s, v) => s + v.litros, 0) || 0

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

      // Ticket promedio por orden
      const totalOrdenes = (ordenes || []).length
      const ticketPromedio = totalOrdenes > 0 ? ingresoTotal / totalOrdenes : 0

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

      // Top recetas
      const porReceta = {}
      vts?.forEach(v => {
        if (!porReceta[v.receta_nombre]) porReceta[v.receta_nombre] = { litros: 0, ingreso: 0 }
        porReceta[v.receta_nombre].litros += v.litros
        porReceta[v.receta_nombre].ingreso += v.litros * v.precio_venta
      })
      const topRecetas = Object.entries(porReceta)
        .sort((a, b) => b[1].litros - a[1].litros)
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
        inversion, ingresoTotal, litrosTotales, saldoCaja, ingresoMes,
        ticketPromedio, totalOrdenes,
        clientesRecurrentes: clientesRecurrentes.length,
        totalClientesNombrados, pctRecurrentes, topRecurrentes,
      })
      setVentas({ topRecetas, recientes: vts?.slice(0, 5) || [] })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Cargando...</div>

  const margenPct = data.ingresoTotal > 0 ? (data.ingresoTotal - data.litrosTotales * 3128) / data.ingresoTotal : 0
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
        const pct = transferenciasMes / LIMITE_TRANSFERENCIAS
        const restantes = LIMITE_TRANSFERENCIAS - transferenciasMes
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
                {transferenciasMes}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>/{LIMITE_TRANSFERENCIAS}</span>
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
          <div className="kpi-label">ROI inversión</div>
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

      {/* Ticket promedio + Recurrencia */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Ticket promedio</div>
          <div className="kpi-value cyan">{formatCLP(data.ticketPromedio)}</div>
          <div className="kpi-sub">{data.totalOrdenes} pedidos totales</div>
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

      <div className="card">
        <div className="card-title">Top recetas (litros)</div>
        {ventas.topRecetas?.map(([nombre, d]) => (
          <div className="list-item" key={nombre}>
            <div>
              <div className="list-item-name">{nombre}</div>
              <div className="list-item-sub">{formatCLP(d.ingreso)}</div>
            </div>
            <div className="list-item-right">
              <div className="list-item-value">{d.litros}L</div>
            </div>
          </div>
        ))}
      </div>

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
