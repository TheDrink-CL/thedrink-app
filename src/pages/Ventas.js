import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

function ConfirmModal({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24
    }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 24, maxWidth: 320, width: '100%'
      }}>
        <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 20, lineHeight: 1.5 }}>{mensaje}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary btn-sm" style={{ flex: 1, background: 'var(--pink)' }} onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function Ventas() {
  const [recetas, setRecetas] = useState([])
  const [form, setForm] = useState({ fecha: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })(), receta_nombre: '', litros: 1, precio_venta: '', delivery: '', nota: '', origen: '' })
  const [ventas, setVentas] = useState([])
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmar, setConfirmar] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: r }, { data: v }] = await Promise.all([
      supabase.from('recetas').select('nombre').order('nombre'),
      supabase.from('ventas').select('*').order('fecha', { ascending: false }).limit(30)
    ])
    setRecetas((r || []).filter(x => x.nombre !== 'ENVASE'))
    setVentas(v || [])
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const getPrecioSugerido = (nombre) => {
    const n = nombre.toLowerCase()
    if (n.includes('colada')) return 9000
    if (n.includes('daikiri')) return 8000
    return 9000
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.receta_nombre || !form.precio_venta) return
    setLoading(true)
    const { error } = await supabase.from('ventas').insert({
      fecha: form.fecha,
      receta_nombre: form.receta_nombre,
      litros: parseFloat(form.litros),
      precio_venta: parseFloat(form.precio_venta),
      delivery: parseFloat(form.delivery) || 0,
      nota: form.nota || null,
      origen: form.origen || null
    })
    if (!error) {
      showToast('Venta registrada ✓')
      setForm(f => ({ ...f, receta_nombre: '', litros: 1, precio_venta: '', delivery: '', nota: '', origen: '' }))
      load()
    }
    setLoading(false)
  }

  const handleEliminar = async (id) => {
    await supabase.from('ventas').delete().eq('id', id)
    showToast('Venta eliminada')
    setConfirmar(null)
    load()
  }

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {confirmar && (
        <ConfirmModal
          mensaje={`¿Eliminar venta de ${confirmar.receta_nombre} (${formatCLP(confirmar.litros * confirmar.precio_venta)})?`}
          onConfirm={() => handleEliminar(confirmar.id)}
          onCancel={() => setConfirmar(null)}
        />
      )}
      <div className="page-title">Registrar venta</div>
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" value={form.fecha}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Receta</label>
            <select className="form-select" value={form.receta_nombre}
              onChange={e => {
                const r = e.target.value
                setForm(f => ({ ...f, receta_nombre: r, precio_venta: r ? getPrecioSugerido(r) : '' }))
              }}>
              <option value="">Seleccionar receta...</option>
              {recetas.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Litros</label>
              <input type="number" step="0.5" min="0.5" className="form-input" value={form.litros}
                onChange={e => setForm(f => ({ ...f, litros: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Precio/L ($)</label>
              <input type="number" className="form-input" value={form.precio_venta}
                onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))} />
            </div>
          </div>
          {form.precio_venta && form.litros && (
            <div style={{ marginBottom: 12, textAlign: 'center' }}>
              <div style={{ color: 'var(--green)', fontSize: 15, fontWeight: 700 }}>
                Bruto: {formatCLP(parseFloat(form.litros) * parseFloat(form.precio_venta))}
              </div>
              {parseFloat(form.delivery) > 0 && (
                <div style={{ color: 'var(--cyan)', fontSize: 13, marginTop: 2 }}>
                  Neto: {formatCLP(parseFloat(form.litros) * parseFloat(form.precio_venta) - parseFloat(form.delivery))}
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>(-{formatCLP(parseFloat(form.delivery))} Uber)</span>
                </div>
              )}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Costo Uber envío ($) — opcional</label>
            <input type="number" className="form-input" value={form.delivery} placeholder="ej: 2500"
              onChange={e => setForm(f => ({ ...f, delivery: e.target.value }))} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Se resta del ingreso neto de esta venta</div>
          </div>
          <div className="form-group">
            <label className="form-label">¿Cómo llegó el cliente? — opcional</label>
            <div className="chip-row">
              {['Instagram', 'Referido', 'Cliente habitual', 'Evento', 'Otro'].map(op => (
                <button key={op} type="button"
                  className={`chip ${form.origen === op ? 'selected' : ''}`}
                  onClick={() => setForm(f => ({ ...f, origen: f.origen === op ? '' : op }))}>
                  {op}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nota — opcional</label>
            <input type="text" className="form-input" value={form.nota}
              placeholder="ej: descuento 10%, devolución envase..."
              onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Registrar venta'}
          </button>
        </div>
      </form>
      <div className="section-divider">Historial reciente</div>
      <div className="card">
        {ventas.length === 0 && <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Sin ventas</div>}
        {ventas.map(v => (
          <div className="list-item" key={v.id} style={{ gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="list-item-name">{v.receta_nombre}</div>
              <div className="list-item-sub">{v.fecha} · {v.litros}L · ${v.precio_venta.toLocaleString('es-CL')}/L</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                {v.origen && (
                  <span style={{ fontSize: 11, background: v.origen === 'Instagram' ? 'rgba(196,0,90,0.15)' : 'rgba(0,180,180,0.1)', color: v.origen === 'Instagram' ? 'var(--pink)' : 'var(--cyan)', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
                    {v.origen === 'Instagram' ? '📱' : v.origen === 'Referido' ? '🤝' : v.origen === 'Cliente habitual' ? '⭐' : v.origen === 'Evento' ? '🎉' : '•'} {v.origen}
                  </span>
                )}
                {v.nota && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{v.nota}</span>}
              </div>
            </div>
            <div className="list-item-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{formatCLP(v.litros * v.precio_venta)}</div>
                {v.delivery > 0 && <div className="list-item-muted" style={{ color: 'var(--pink)' }}>-{formatCLP(v.delivery)} Uber envío</div>}
              </div>
              <button onClick={() => setConfirmar(v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, flexShrink: 0 }}>
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
