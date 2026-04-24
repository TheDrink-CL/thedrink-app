import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP, formatPct } from '../lib/calculos'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: cfg }, { data: vts }, { data: cja }] = await Promise.all([
        supabase.from('config').select('*'),
        supabase.from('ventas').select('*').order('fecha', { ascending: false }),
        supabase.from('caja').select('*'),
      ])

      const config = {}
      cfg?.forEach(c => { config[c.clave] = c.valor })

      const inversion = config.inversion_total || 120480
      const ingresoTotal = vts?.reduce((s, v) => s + (v.litros * v.precio_venta), 0) || 0
      const litrosTotales = vts?.reduce((s, v) => s + v.litros, 0) || 0
      const ingresoPromLitro = litrosTotales > 0 ? ingresoTotal / litrosTotales : 0

      // Saldo caja
      const saldoCaja = cja?.reduce((s, m) => {
        return m.tipo === 'entrada' ? s + m.monto : s - m.monto
      }, 0) || 0

      // Ventas últimos 30 días
      const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
      const vtsMes = vts?.filter(v => new Date(v.fecha) >= hace30) || []
      const ingresoMes = vtsMes.reduce((s, v) => s + (v.litros * v.precio_venta), 0)

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

      setData({ inversion, ingresoTotal, litrosTotales, ingresoPromLitro, saldoCaja, ingresoMes })
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
