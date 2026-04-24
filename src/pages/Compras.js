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

export default function Compras() {
  const [insumos, setInsumos] = useState([])
  const [compras, setCompras] = useState([])
  const [form, setForm] = useState({ fecha: new Date().toISOString().split('T')[0], insumo_nombre: '', unidad: 'ml', cantidad: '', precio_total: '', nota: '' })
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('registrar')
  const [confirmar, setConfirmar] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: ins }, { data: cmp }] = await Promise.all([
        supabase.from('insumos').select('*').order('nombre'),
        supabase.from('compras').select('*').order('fecha', { ascending: false }).limit(20)
      ])
      setInsumos(ins || [])
      setCompras(cmp || [])
    }
    load()
  }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleSelectInsumo = (nombre) => {
    const ins = insumos.find(i => i.nombre === nombre)
    setForm(f => ({ ...f, insumo_nombre: nombre, unidad: ins?.unidad || 'ml' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.insumo_nombre || !form.cantidad || !form.precio_total) return
    setLoading(true)
    const { error } = await supabase.from('compras').insert({
      fecha: form.fecha,
      insumo_nombre: form.insumo_nombre,
      unidad: form.unidad,
      cantidad: parseFloat(form.cantidad),
      precio_total: parseFloat(form.precio_total),
      nota: form.nota || null
    })
    if (!error) {
      showToast('Compra registrada · PPP actualizado')
      setForm(f => ({ ...f, insumo_nombre: '', cantidad: '', precio_total: '', nota: '' }))
      const [{ data: ins }, { data: cmp }] = await Promise.all([
        supabase.from('insumos').select('*').order('nombre'),
        supabase.from('compras').select('*').order('fecha', { ascending: false }).limit(20)
      ])
      setInsumos(ins || [])
      setCompras(cmp || [])
    }
    setLoading(false)
  }

  const handleEliminar = async (id, insumo) => {
    await supabase.from('compras').delete().eq('id', id)
    showToast('Compra eliminada · PPP recalculado')
    setConfirmar(null)
    const [{ data: ins }, { data: cmp }] = await Promise.all([
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('compras').select('*').order('fecha', { ascending: false }).limit(20)
    ])
    setInsumos(ins || [])
    setCompras(cmp || [])
  }

  const costoPorUnidad = form.cantidad && form.precio_total
    ? (parseFloat(form.precio_total) / parseFloat(form.cantidad)).toFixed(2)
    : null

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {confirmar && (
        <ConfirmModal
          mensaje={`¿Eliminar compra de ${confirmar.insumo_nombre} (${formatCLP(confirmar.precio_total)})?`}
          onConfirm={() => handleEliminar(confirmar.id, confirmar.insumo_nombre)}
          onCancel={() => setConfirmar(null)}
        />
      )}
      <div className="page-title">Compras</div>

      <div className="toggle-row">
        <button className={`toggle-btn ${tab === 'registrar' ? 'active-entrada' : ''}`} onClick={() => setTab('registrar')}>Registrar</button>
        <button className={`toggle-btn ${tab === 'insumos' ? 'active-entrada' : ''}`} onClick={() => setTab('insumos')}>PPP actual</button>
      </div>

      {tab === 'registrar' && (
        <form onSubmit={handleSubmit}>
          <div className="card">
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input type="date" className="form-input" value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Insumo</label>
              <select className="form-select" value={form.insumo_nombre}
                onChange={e => handleSelectInsumo(e.target.value)}>
                <option value="">Seleccionar insumo...</option>
                {insumos.map(i => <option key={i.nombre} value={i.nombre}>{i.nombre}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Cantidad ({form.unidad})</label>
                <input type="number" step="any" className="form-input" value={form.cantidad}
                  placeholder="ej: 1000"
                  onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Precio total ($)</label>
                <input type="number" className="form-input" value={form.precio_total}
                  placeholder="ej: 4990"
                  onChange={e => setForm(f => ({ ...f, precio_total: e.target.value }))} />
              </div>
            </div>
            {costoPorUnidad && (
              <div style={{ color: 'var(--cyan)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                ${costoPorUnidad} por {form.unidad}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Nota — opcional</label>
              <input type="text" className="form-input" value={form.nota}
                placeholder="ej: Unimarc, oferta..."
                onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Registrar compra'}
            </button>
          </div>

          <div className="section-divider">Últimas compras</div>
          <div className="card">
            {compras.map(c => (
              <div className="list-item" key={c.id} style={{ gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="list-item-name">{c.insumo_nombre}</div>
                  <div className="list-item-sub">{c.fecha} · {c.cantidad} {c.unidad}</div>
                  {c.nota && <div className="list-item-sub" style={{ color: 'var(--muted)' }}>{c.nota}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="list-item-right">
                    <div className="list-item-value">{formatCLP(c.precio_total)}</div>
                    <div className="list-item-muted">${(c.precio_total / c.cantidad).toFixed(2)}/{c.unidad}</div>
                  </div>
                  <button onClick={() => setConfirmar(c)}
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
        </form>
      )}

      {tab === 'insumos' && (
        <div className="card">
          <div className="card-title">Costo PPP por insumo</div>
          {insumos.map(i => (
            <div className="list-item" key={i.nombre}>
              <div>
                <div className="list-item-name">{i.nombre}</div>
                <div className="list-item-sub">{i.unidad}</div>
              </div>
              <div className="list-item-right">
                <div className="list-item-value">${parseFloat(i.costo_ppp || 0).toFixed(2)}</div>
                <div className="list-item-muted">por {i.unidad}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
