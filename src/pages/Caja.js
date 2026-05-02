import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

function ConfirmModal({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24
    }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 320, width: '100%' }}>
        <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 20, lineHeight: 1.5 }}>{mensaje}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary btn-sm" style={{ flex: 1, background: 'var(--pink)' }} onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

const CATEGORIAS_SALIDA = [
  'Publicidad', 'Equipamiento', 'Suscripciones', 'Otro gasto'
]
const CATEGORIAS_ENTRADA = [
  'Venta', 'Delivery', 'Aporte socio', 'Otro ingreso'
]

function agruparPorMes(items, getDate, getValue) {
  const meses = {}
  items.forEach(item => {
    const fecha = getDate(item)
    if (!fecha) return
    const mes = fecha.slice(0, 7)
    if (!meses[mes]) meses[mes] = 0
    meses[mes] += getValue(item)
  })
  return meses
}

function labelMes(yyyymm) {
  const [y, m] = yyyymm.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return meses[parseInt(m, 10) - 1] + ' ' + y
}

function TabPublicidad({ movimientos, ventas }) {
  const gastosPub = movimientos.filter(m => m.tipo === 'salida' && m.categoria === 'Publicidad')
  const totalPub = gastosPub.reduce((s, m) => s + m.monto, 0)

  const pubPorMes = agruparPorMes(gastosPub, m => m.fecha, m => m.monto)
  const ventasPorMes = agruparPorMes(ventas, v => v.fecha, v => (v.litros * v.precio_venta))

  const todosLosMeses = [...new Set([...Object.keys(pubPorMes), ...Object.keys(ventasPorMes)])].sort().reverse()

  const totalVentas = ventas.reduce((s, v) => s + (v.litros * v.precio_venta), 0)
  const roiGlobal = totalPub > 0 ? totalVentas / totalPub : null

  if (gastosPub.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>Sin gastos de publicidad registrados</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
          Registra gastos con categoría "Publicidad" en Movimientos para ver el análisis aquí.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total en publicidad</div>
          <div className="kpi-value" style={{ color: 'var(--pink)', fontSize: 22 }}>{formatCLP(totalPub)}</div>
          <div className="kpi-sub">acumulado</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Ventas por $1 en ads</div>
          <div className="kpi-value" style={{ color: roiGlobal >= 5 ? 'var(--green)' : roiGlobal >= 2 ? 'var(--cyan)' : 'var(--pink)', fontSize: 22 }}>
            {roiGlobal != null ? ('$' + roiGlobal.toFixed(1)) : '—'}
          </div>
          <div className="kpi-sub">ROI publicidad</div>
        </div>
      </div>

      <div style={{ background: 'rgba(0,180,180,0.05)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
          {roiGlobal != null && roiGlobal >= 5 && '✅ Buen retorno — por cada $1 en publicidad generas más de $5 en ventas.'}
          {roiGlobal != null && roiGlobal >= 2 && roiGlobal < 5 && '🔸 Retorno moderado — considera optimizar campañas o subir el ticket promedio.'}
          {roiGlobal != null && roiGlobal < 2 && '⚠ Retorno bajo — las ventas no cubren bien el gasto en publicidad. Evalúa pausar o redirigir.'}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Publicidad vs Ventas por mes</div>
        {todosLosMeses.map(mes => {
          const pub = pubPorMes[mes] || 0
          const vtas = ventasPorMes[mes] || 0
          const roi = pub > 0 ? vtas / pub : null
          const maxVal = Math.max(pub, vtas) || 1
          return (
            <div key={mes} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{labelMes(mes)}</div>
                {roi != null && (
                  <div style={{ fontSize: 12, color: roi >= 5 ? 'var(--green)' : roi >= 2 ? 'var(--cyan)' : 'var(--pink)', fontWeight: 700 }}>
                    ROI {roi.toFixed(1)}x
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Publicidad</div>
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: 'var(--pink)', width: (pub / maxVal * 100) + '%' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pink)', marginTop: 3, fontWeight: 600 }}>{formatCLP(pub)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ventas</div>
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: 'var(--green)', width: (vtas / maxVal * 100) + '%' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 3, fontWeight: 600 }}>{formatCLP(vtas)}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-title">Detalle gastos en publicidad</div>
        {gastosPub.map(m => (
          <div className="list-item" key={m.id}>
            <div>
              <div className="list-item-name" style={{ fontSize: 14 }}>{m.descripcion}</div>
              <div className="list-item-sub">{m.fecha}</div>
            </div>
            <div style={{ color: 'var(--pink)', fontWeight: 700, fontSize: 14 }}>-{formatCLP(m.monto)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Caja() {
  const [movimientos, setMovimientos] = useState([])
  const [ventas, setVentas] = useState([])
  const [saldo, setSaldo] = useState(0)
  const [form, setForm] = useState({
    fecha: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })(),
    tipo: 'entrada',
    categoria: 'Venta',
    monto: '',
    descripcion: ''
  })
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [confirmar, setConfirmar] = useState(null)
  const [vistaTab, setVistaTab] = useState('movimientos')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: mov }, { data: vts }, { data: compras }] = await Promise.all([
      supabase.from('caja').select('*').order('fecha', { ascending: false }),
      supabase.from('ventas').select('litros, precio_venta, delivery, fecha'),
      supabase.from('compras').select('precio_total, es_inversion'),
    ])

    setMovimientos(mov || [])
    setVentas(vts || [])

    const totalVentas = (vts || []).reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0)
    const totalCompras = (compras || []).reduce((s, c) => s + (c.es_inversion ? 0 : c.precio_total), 0)
    const movExtraEntradas = (mov || []).filter(m => m.tipo === 'entrada' && m.categoria !== 'Venta' && m.categoria !== 'Delivery').reduce((s, m) => s + m.monto, 0)
    const movExtraSalidas = (mov || []).filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos').reduce((s, m) => s + m.monto, 0)

    setSaldo(totalVentas - totalCompras + movExtraEntradas - movExtraSalidas)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleEliminar = async (id) => {
    await supabase.from('caja').delete().eq('id', id)
    showToast('Movimiento eliminado')
    setConfirmar(null)
    loadData()
  }

  const handleTipo = (tipo) => {
    setForm(f => ({ ...f, tipo, categoria: tipo === 'entrada' ? 'Venta' : 'Publicidad' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.monto || !form.descripcion) return
    setLoading(true)
    const { error } = await supabase.from('caja').insert({
      fecha: form.fecha,
      tipo: form.tipo,
      categoria: form.categoria,
      monto: parseFloat(form.monto),
      descripcion: form.descripcion
    })
    if (!error) {
      showToast('Movimiento registrado')
      setForm(f => ({ ...f, monto: '', descripcion: '' }))
      loadData()
    }
    setLoading(false)
  }

  const gastosPorCategoria = movimientos
    .filter(m => m.tipo === 'salida')
    .reduce((acc, m) => {
      const cat = m.categoria || 'Otro gasto'
      acc[cat] = (acc[cat] || 0) + m.monto
      return acc
    }, {})

  const movFiltrados = filtro === 'todos' ? movimientos : movimientos.filter(m => m.tipo === filtro)
  const categorias = form.tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SALIDA

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {confirmar && (
        <ConfirmModal
          mensaje={`¿Eliminar "${confirmar.descripcion}" (${confirmar.tipo === 'entrada' ? '+' : '-'}${formatCLP(confirmar.monto)})?`}
          onConfirm={() => handleEliminar(confirmar.id)}
          onCancel={() => setConfirmar(null)}
        />
      )}
      <div className="page-title">Caja</div>

      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card">
          <div className="kpi-label">Saldo disponible</div>
          <div className="kpi-value" style={{ color: saldo >= 0 ? 'var(--green)' : 'var(--pink)', fontSize: 26 }}>
            {formatCLP(saldo)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total gastos</div>
          <div className="kpi-value" style={{ fontSize: 22, color: 'var(--text-strong)' }}>
            {formatCLP(movimientos.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0))}
          </div>
        </div>
      </div>

      <div className="toggle-row" style={{ marginBottom: 16 }}>
        <button
          className={`toggle-btn ${vistaTab === 'movimientos' ? 'active-entrada' : ''}`}
          onClick={() => setVistaTab('movimientos')}>
          Movimientos
        </button>
        <button
          className={`toggle-btn ${vistaTab === 'publicidad' ? 'active-entrada' : ''}`}
          onClick={() => setVistaTab('publicidad')}>
          Publicidad
        </button>
      </div>

      {vistaTab === 'publicidad' && (
        <TabPublicidad movimientos={movimientos} ventas={ventas} />
      )}

      {vistaTab === 'movimientos' && (
        <>
          {Object.keys(gastosPorCategoria).length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Gastos por categoría</div>
              {Object.entries(gastosPorCategoria)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, total]) => (
                  <div className="list-item" key={cat}>
                    <div className="list-item-name" style={{ fontSize: 14 }}>{cat}</div>
                    <div className="list-item-value" style={{ color: 'var(--pink)', fontSize: 14 }}>
                      {formatCLP(total)}
                    </div>
                  </div>
                ))}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="card">
              <div className="toggle-row">
                <button type="button"
                  className={`toggle-btn ${form.tipo === 'entrada' ? 'active-entrada' : ''}`}
                  onClick={() => handleTipo('entrada')}>
                  + Ingreso
                </button>
                <button type="button"
                  className={`toggle-btn ${form.tipo === 'salida' ? 'active-salida' : ''}`}
                  onClick={() => handleTipo('salida')}>
                  - Gasto
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-select" value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input type="date" className="form-input" value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Monto ($)</label>
                  <input type="number" className="form-input" value={form.monto}
                    placeholder="ej: 5000"
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input type="text" className="form-input" value={form.descripcion}
                  placeholder={form.tipo === 'salida' ? 'ej: Uber a entrega, pauta Instagram...' : 'ej: Venta Mojito maracuya'}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </form>

          <div className="section-divider">Historial</div>
          <div className="toggle-row">
            {['todos', 'entrada', 'salida'].map(f => (
              <button key={f}
                className={`toggle-btn ${filtro === f ? (f === 'entrada' ? 'active-entrada' : f === 'salida' ? 'active-salida' : 'active-entrada') : ''}`}
                onClick={() => setFiltro(f)}
                style={{ fontSize: 12 }}>
                {f === 'todos' ? 'Todos' : f === 'entrada' ? 'Ingresos' : 'Gastos'}
              </button>
            ))}
          </div>

          <div className="card">
            {movFiltrados.length === 0 && (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Sin movimientos</div>
            )}
            {movFiltrados.map(m => (
              <div className="list-item" key={m.id} style={{ gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-item-name">{m.descripcion}</div>
                  <div className="list-item-sub">
                    {m.fecha}
                    {m.categoria && <span style={{ marginLeft: 6, color: 'var(--muted)' }}>· {m.categoria}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: m.tipo === 'entrada' ? 'var(--green)' : 'var(--pink)' }}>
                    {m.tipo === 'entrada' ? '+' : '-'}{formatCLP(m.monto)}
                  </div>
                  <button onClick={() => setConfirmar(m)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
