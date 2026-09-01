import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP, enriquecerVentasConDelivery, FECHA_CORTE_DELIVERY, esDeliveryAdelantado } from '../lib/calculos'

// La pestaña "Publicidad" se eliminó (jun 2026): duplicaba el análisis de pauta
// que ahora vive en Indicadores (ROAS semanal) y Análisis (origen de clientes),
// y su ROI estaba mal calculado (dividía TODAS las ventas por el gasto en pauta).

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
  'Publicidad', 'Personal', 'Equipamiento', 'Suscripciones', 'Otro gasto'
]
const CATEGORIAS_ENTRADA = [
  'Otro ingreso', 'Aporte socio', 'Delivery', 'Venta'
]

export default function Caja() {
  const [movimientos, setMovimientos] = useState([])
  const [saldo, setSaldo] = useState(0)
  const [uberPorRetirar, setUberPorRetirar] = useState(0)
  const [form, setForm] = useState({
    fecha: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })(),
    tipo: 'entrada',
    // NO 'Venta' por defecto: el saldo excluye esa categoría (las ventas vienen
    // de la tabla `ventas`), así que un ingreso registrado con el default puesto
    // aparecía en verde en el historial y no movía el saldo. Parecía que la app
    // se comía la plata.
    categoria: 'Otro ingreso',
    monto: '',
    descripcion: ''
  })
  const [toast, setToast] = useState('')
  const [errorForm, setErrorForm] = useState('')
  const [loading, setLoading] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [confirmar, setConfirmar] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: mov }, { data: vts }, { data: compras }, { data: ordenes }] = await Promise.all([
      supabase.from('caja').select('*').order('fecha', { ascending: false }),
      supabase.from('ventas').select('litros, precio_venta, delivery, orden_id'),
      supabase.from('compras').select('precio_total, es_inversion'),
      supabase.from('ordenes').select('id, fecha, delivery, delivery_cobrado, delivery_tipo'),
    ])

    setMovimientos(mov || [])

    // Enriquecer ventas con el delivery (costo) y cobro de su orden, igual que
    // el Dashboard, para que ambas pantallas muestren el MISMO saldo. El costo
    // de delivery vive en `ordenes`, no en las filas de `ventas`.
    const vtsEnr = enriquecerVentasConDelivery(vts || [], ordenes || [])
    // Usar vtsEnr, no vts: era la razón de que Caja y Dashboard mostraran saldos
    // distintos. Además, las 4 ventas legacy sin orden_id traen `delivery` en la
    // fila Y ese mismo costo está como salida "Transporte / Uber" en caja, así
    // que el saldo lo restaba dos veces. enriquecerVentasConDelivery deja esas
    // filas en 0 y el costo queda contado una sola vez, desde su movimiento.
    const totalVentas = vtsEnr.reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0)
    // Delivery desde el corte: se suma el cobro al cliente y se resta el costo (Uber/motoboy).
    const ordCorte = (ordenes || []).filter(o => o.fecha >= FECHA_CORTE_DELIVERY)
    const totalDeliveryCobrado = ordCorte.reduce((s, o) => s + (parseFloat(o.delivery_cobrado) || 0), 0)
    const totalCostoDelivery = ordCorte.reduce((s, o) => s + (parseFloat(o.delivery) || 0), 0)
    const totalCompras = (compras || []).reduce((s, c) => s + (c.es_inversion ? 0 : c.precio_total), 0)
    // Entradas manuales: se excluye 'Venta' (ya viene de la tabla ventas).
    // 'Delivery' SÍ suma — es el cobro al cliente y no existe en ninguna otra tabla
    // (ventas.delivery es lo que se PAGA a terceros, no lo que se cobra).
    const movExtraEntradas = (mov || []).filter(m => m.tipo === 'entrada' && m.categoria !== 'Venta').reduce((s, m) => s + m.monto, 0)
    const movExtraSalidas = (mov || []).filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos').reduce((s, m) => s + m.monto, 0)

    setSaldo(totalVentas + totalDeliveryCobrado - totalCostoDelivery - totalCompras + movExtraEntradas - movExtraSalidas)

    // Por pagarte: costo de delivery del mes en curso que saliÓ de la tarjeta
    // personal (DiDi), no de la cuenta del negocio. Uber se cobra de la misma
    // cuenta donde entran los pagos, así que esa plata ya salió sola y NO hay
    // nada que retirar por esos pedidos: incluirla inflaba el KPI.
    // Mes local (no UTC): con toISOString() el mes se resetea antes de tiempo
    // en husos horarios detrás de UTC (ej. Chile), cortando el KPI de golpe.
    const hoyLocal = new Date()
    const mesActual = `${hoyLocal.getFullYear()}-${String(hoyLocal.getMonth() + 1).padStart(2, '0')}` // 'YYYY-MM'
    const adelantadoMes = ordCorte
      .filter(ord => (ord.fecha || '').slice(0, 7) === mesActual && esDeliveryAdelantado(ord.delivery_tipo))
      .reduce((s, ord) => s + (parseFloat(ord.delivery) || 0), 0)
    setUberPorRetirar(adelantadoMes)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleEliminar = async (id) => {
    const { error } = await supabase.from('caja').delete().eq('id', id)
    setConfirmar(null)
    if (error) { showToast(`No se pudo eliminar: ${error.message}`); return }
    showToast('Movimiento eliminado')
    loadData()
  }

  const handleTipo = (tipo) => {
    setForm(f => ({ ...f, tipo, categoria: tipo === 'entrada' ? 'Otro ingreso' : 'Publicidad' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorForm('')
    if (!form.monto || !form.descripcion) {
      setErrorForm('Completa el monto y la descripción')
      return
    }
    if (!(parseFloat(form.monto) > 0)) {
      setErrorForm('El monto debe ser mayor a 0')
      return
    }
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
    } else {
      const esSesionExpirada = /JWT/i.test(error.message || '') || error.code === '401' || error.code === 'PGRST301' || error.code === '42501'
      setErrorForm(esSesionExpirada
        ? 'Tu sesión expiró — recarga la página y vuelve a entrar'
        : `No se pudo registrar: ${error.message}`)
    }
    setLoading(false)
  }

  // Se excluye la categoría legacy 'Insumos': ya viene de la tabla `compras` y
  // el cálculo de saldo (arriba) también la excluye a propósito para no
  // duplicarla. Si se incluyera aquí, este número no cuadraría con el saldo.
  const gastosPorCategoria = movimientos
    .filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos')
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
            {/* Excluye categoría legacy 'Insumos': ya viene de `compras` y el saldo la excluye también */}
            {formatCLP(movimientos.filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos').reduce((s, m) => s + m.monto, 0))}
          </div>
        </div>
        {uberPorRetirar > 0 && (
          <div className="kpi-card">
            <div className="kpi-label">Por pagarte — delivery (mes)</div>
            <div className="kpi-value" style={{ fontSize: 22, color: 'var(--cyan)' }}>
              {formatCLP(uberPorRetirar)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Delivery que pagaste con tu tarjeta (DiDi), ya descontado del saldo. Sácalo a tu cuenta para reembolsarte.
            </div>
          </div>
        )}
      </div>

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
                onChange={e => { setForm(f => ({ ...f, monto: e.target.value })); setErrorForm('') }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input type="text" className="form-input" value={form.descripcion}
              placeholder={form.tipo === 'salida' ? 'ej: Uber a entrega, pauta Instagram...' : 'ej: Venta Mojito maracuya'}
              onChange={e => { setForm(f => ({ ...f, descripcion: e.target.value })); setErrorForm('') }} />
          </div>

          {errorForm && <div style={{ color: 'var(--pink)', fontSize: 13, marginBottom: 10 }}>{errorForm}</div>}

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
    </div>
  )
}
