import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

const MEDIOS = [
  { id: 'transferencia', label: 'Transferencia', icon: '🏦', color: 'var(--cyan)',   bg: 'rgba(0,180,180,0.10)',  borde: 'rgba(0,180,180,0.35)' },
  { id: 'debito',        label: 'Débito',        icon: '💳', color: 'var(--purple)', bg: 'rgba(123,47,190,0.12)', borde: 'rgba(123,47,190,0.4)' },
  { id: 'credito',       label: 'Crédito',       icon: '💳', color: '#AFA9EC',       bg: 'rgba(127,119,221,0.10)', borde: 'rgba(127,119,221,0.35)' },
  { id: 'efectivo',      label: 'Efectivo',      icon: '💵', color: 'var(--green)',  bg: 'rgba(34,197,94,0.10)',  borde: 'rgba(34,197,94,0.35)' },
]
const medioInfo = (id) => MEDIOS.find(m => m.id === id) || { id, label: id || 'sin medio', icon: '·', color: 'var(--muted)', bg: 'rgba(255,255,255,0.04)', borde: 'var(--border)' }

// Helpers de fecha
function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isoMenosDias(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Sustrae los movimientos extra de caja (gastos, propinas, etc) que afectan
// efectivo o cuenta bancaria. Útil para mostrar arriba.
function clasificarMovCaja(m) {
  // categorías que ya están reflejadas en ventas (no sumar dos veces)
  if (m.categoria === 'Venta' || m.categoria === 'Delivery' || m.categoria === 'Insumos') return null
  return m
}

export default function Conciliacion() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [desde, setDesde] = useState(isoMenosDias(2)) // últimos 3 días por defecto
  const [hasta, setHasta] = useState(hoyISO())
  const [expandido, setExpandido] = useState(null) // medio de pago expandido
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [desde, hasta])

  async function load() {
    setLoading(true)
    try {
      const [{ data: ords }, { data: vts }, { data: cja }] = await Promise.all([
        supabase.from('ordenes').select('id, fecha, hora, cliente_nombre, medio_pago, delivery, delivery_tipo')
          .gte('fecha', desde).lte('fecha', hasta).order('fecha').order('hora'),
        supabase.from('ventas').select('id, fecha, litros, precio_venta, receta_nombre, orden_id, delivery')
          .gte('fecha', desde).lte('fecha', hasta),
        supabase.from('caja').select('fecha, monto, categoria, tipo, descripcion')
          .gte('fecha', desde).lte('fecha', hasta),
      ])

      // Map ventas por orden
      const ventasPorOrden = {}
      ;(vts || []).forEach(v => {
        if (!v.orden_id) return
        ;(ventasPorOrden[v.orden_id] = ventasPorOrden[v.orden_id] || []).push(v)
      })

      // Enriquecer órdenes con su total
      const ordenes = (ords || []).map(o => {
        const items = ventasPorOrden[o.id] || []
        const totalItems = items.reduce((s, v) => s + (v.litros || 1) * (v.precio_venta || 0), 0)
        // El delivery cobrado al cliente NO está en ventas — solo en columna delivery
        // de la orden si la cobraste como recargo. Si delivery es costo (lo pagas tú)
        // no entra al ingreso. Por simplicidad, total = items (que es lo que recibe
        // la app como ingreso). El delivery se muestra aparte para que lo veas.
        return { ...o, items, totalItems }
      })

      // Agrupar por medio de pago
      const porMedio = {}
      MEDIOS.forEach(m => { porMedio[m.id] = { total: 0, pedidos: [], delivery: 0 } })
      porMedio['_sin'] = { total: 0, pedidos: [], delivery: 0 }
      ordenes.forEach(o => {
        const key = o.medio_pago || '_sin'
        if (!porMedio[key]) porMedio[key] = { total: 0, pedidos: [], delivery: 0 }
        porMedio[key].total += o.totalItems
        porMedio[key].delivery += parseFloat(o.delivery) || 0
        porMedio[key].pedidos.push(o)
      })

      // Movimientos extra de caja (gastos, otros ingresos no-venta)
      const extras = { entradas: [], salidas: [] }
      ;(cja || []).forEach(m => {
        const cm = clasificarMovCaja(m)
        if (!cm) return
        if (cm.tipo === 'entrada') extras.entradas.push(cm)
        else if (cm.tipo === 'salida') extras.salidas.push(cm)
      })

      setData({ porMedio, extras, totalOrdenes: ordenes.length })
    } catch (e) {
      console.error('Conciliacion - error:', e)
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-title">Conciliación</div>
        <div className="card" style={{ borderColor: 'rgba(196,0,90,0.4)' }}>
          <div className="card-title" style={{ color: 'var(--pink)' }}>Error</div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>{error}</div>
        </div>
      </div>
    )
  }

  // Totales por canal de cobro (banco vs efectivo)
  const totalBanco = data ? (
    (data.porMedio.transferencia?.total || 0) +
    (data.porMedio.debito?.total || 0) +
    (data.porMedio.credito?.total || 0)
  ) : 0
  const totalEfectivo = data ? (data.porMedio.efectivo?.total || 0) : 0
  const totalSinMedio = data ? (data.porMedio._sin?.total || 0) : 0
  const totalGeneral = totalBanco + totalEfectivo + totalSinMedio

  return (
    <div className="page">
      <div className="page-title">Conciliación</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6, marginTop: -12 }}>
        Desglose por medio de pago para cuadrar con tu banco y tu caja física.
      </div>

      {/* Selector de rango */}
      <div className="card" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Desde</div>
            <input type="date" className="form-input" value={desde} onChange={e => setDesde(e.target.value)}
              style={{ fontSize: 13, padding: '6px 8px' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Hasta</div>
            <input type="date" className="form-input" value={hasta} onChange={e => setHasta(e.target.value)}
              style={{ fontSize: 13, padding: '6px 8px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { l: 'Hoy', d: hoyISO(), h: hoyISO() },
            { l: 'Ayer + Hoy', d: isoMenosDias(1), h: hoyISO() },
            { l: 'Últimos 3 días', d: isoMenosDias(2), h: hoyISO() },
            { l: 'Últimos 7 días', d: isoMenosDias(6), h: hoyISO() },
          ].map(p => (
            <button key={p.l}
              onClick={() => { setDesde(p.d); setHasta(p.h) }}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 14,
                background: (desde === p.d && hasta === p.h) ? 'rgba(0,180,180,0.15)' : 'rgba(255,255,255,0.04)',
                color: (desde === p.d && hasta === p.h) ? 'var(--cyan)' : 'var(--muted)',
                border: '1px solid rgba(0,180,180,0.2)', cursor: 'pointer',
              }}>{p.l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Cargando...</div>
      ) : !data || data.totalOrdenes === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--muted)' }}>
          Sin pedidos en el rango seleccionado.
        </div>
      ) : (
        <>
          {/* Resumen banco vs efectivo */}
          <div className="kpi-grid">
            <div className="kpi-card" style={{ background: 'rgba(0,180,180,0.08)', borderColor: 'rgba(0,180,180,0.3)' }}>
              <div className="kpi-label">Debe estar en banco</div>
              <div className="kpi-value cyan">{formatCLP(totalBanco)}</div>
              <div className="kpi-sub">transf + débito + crédito</div>
            </div>
            <div className="kpi-card" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
              <div className="kpi-label">Debe estar en caja</div>
              <div className="kpi-value green">{formatCLP(totalEfectivo)}</div>
              <div className="kpi-sub">efectivo cobrado</div>
            </div>
          </div>

          {totalSinMedio > 0 && (
            <div style={{
              background: 'rgba(196,0,90,0.08)', border: '1px solid rgba(196,0,90,0.35)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, color: 'var(--pink)', fontWeight: 700, marginBottom: 4 }}>
                ⚠️ {formatCLP(totalSinMedio)} sin medio de pago asignado
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Hay {data.porMedio._sin.pedidos.length} pedido(s) sin marcar cómo se pagaron. No se pueden conciliar hasta asignarles medio de pago.
              </div>
            </div>
          )}

          {/* Total general */}
          <div className="card" style={{ textAlign: 'center', padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Ingresos por ventas en el rango
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-strong)', marginTop: 4 }}>
              {formatCLP(totalGeneral)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {data.totalOrdenes} pedido{data.totalOrdenes !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Cards por medio de pago */}
          {[...MEDIOS, { id: '_sin', label: 'Sin medio', icon: '?', color: 'var(--pink)', bg: 'rgba(196,0,90,0.08)', borde: 'rgba(196,0,90,0.35)' }].map(m => {
            const grupo = data.porMedio[m.id]
            if (!grupo || grupo.pedidos.length === 0) return null
            const abierto = expandido === m.id
            return (
              <div key={m.id} className="card" style={{
                background: m.bg, border: `1px solid ${m.borde}`,
                padding: 0, overflow: 'hidden',
              }}>
                <button
                  onClick={() => setExpandido(e => e === m.id ? null : m.id)}
                  style={{
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', color: 'var(--text)',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{m.icon}</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {grupo.pedidos.length} pedido{grupo.pedidos.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{formatCLP(grupo.total)}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{abierto ? '▼' : '▶'}</span>
                  </div>
                </button>
                {abierto && (
                  <div style={{ padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {grupo.pedidos.map(o => (
                      <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                            {o.cliente_nombre || 'Cliente anónimo'}
                          </span>
                          <span style={{ color: m.color, fontWeight: 700 }}>{formatCLP(o.totalItems)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {o.fecha}{o.hora ? ` · ${o.hora}` : ''}
                          {o.items.length > 0 && ' · ' + o.items.map(v => `${v.receta_nombre}${(v.litros||1) !== 1 ? ` ×${v.litros}` : ''}`).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Movimientos extra de caja */}
          {(data.extras.entradas.length > 0 || data.extras.salidas.length > 0) && (
            <div className="card">
              <div className="card-title">Movimientos extra de caja</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
                Estos no vienen de ventas. Súmalos o réstalos cuando contrastes con tu banco/caja.
              </div>
              {data.extras.entradas.map((m, i) => (
                <div key={'e'+i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--text)' }}>+ {m.categoria || 'Entrada'}{m.descripcion ? ` · ${m.descripcion}` : ''}</span>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>+{formatCLP(m.monto)}</span>
                </div>
              ))}
              {data.extras.salidas.map((m, i) => (
                <div key={'s'+i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--text)' }}>− {m.categoria || 'Salida'}{m.descripcion ? ` · ${m.descripcion}` : ''}</span>
                  <span style={{ color: 'var(--pink)', fontWeight: 700 }}>−{formatCLP(m.monto)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ayuda */}
          <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
            💡 Para cuadrar con el banco: revisa que tu cartola muestre exactamente <strong style={{ color: 'var(--cyan)' }}>{formatCLP(totalBanco)}</strong> en transferencias + cargos de débito/crédito en este rango. Si hay diferencia, toca expandir cada medio y comparar pedido por pedido.
          </div>
        </>
      )}
    </div>
  )
}
