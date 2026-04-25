import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function EditModal({ insumo, onSave, onCancel }) {
  const [stockActual, setStockActual] = useState(insumo.stock_actual ?? '')
  const [stockMinimo, setStockMinimo] = useState(insumo.stock_minimo ?? '')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24
    }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 320, width: '100%' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-strong)', marginBottom: 16 }}>{insumo.nombre}</div>

        <div className="form-group">
          <label className="form-label">Stock actual ({insumo.unidad})</label>
          <input type="number" step="any" className="form-input" value={stockActual}
            placeholder="ej: 3000"
            onChange={e => setStockActual(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Alerta mínimo ({insumo.unidad})</label>
          <input type="number" step="any" className="form-input" value={stockMinimo}
            placeholder="ej: 500"
            onChange={e => setStockMinimo(e.target.value)} />
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Recibirás alerta en el dashboard cuando baje de este nivel
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
            onClick={() => onSave(insumo.nombre, parseFloat(stockActual) || 0, parseFloat(stockMinimo) || 0)}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Stock() {
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase.from('insumos').select('*').order('nombre')
    setInsumos(data || [])
    setLoading(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleSave = async (nombre, stockActual, stockMinimo) => {
    await supabase.from('insumos').update({
      stock_actual: stockActual,
      stock_minimo: stockMinimo
    }).eq('nombre', nombre)
    setEditando(null)
    showToast('Stock actualizado')
    loadData()
  }

  const getEstado = (ins) => {
    const actual = ins.stock_actual ?? null
    const minimo = ins.stock_minimo ?? null
    if (actual === null) return 'sin_datos'
    if (minimo !== null && actual <= minimo) return 'critico'
    if (minimo !== null && actual <= minimo * 1.5) return 'bajo'
    return 'ok'
  }

  const estadoColor = { ok: 'var(--green)', bajo: '#f59e0b', critico: 'var(--pink)', sin_datos: 'var(--muted)' }
  const estadoLabel = { ok: 'OK', bajo: 'Bajo', critico: 'Crítico', sin_datos: '—' }

  if (loading) return <div className="loading">Cargando...</div>

  const criticos = insumos.filter(i => getEstado(i) === 'critico')
  const bajos = insumos.filter(i => getEstado(i) === 'bajo')

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {editando && (
        <EditModal
          insumo={editando}
          onSave={handleSave}
          onCancel={() => setEditando(null)}
        />
      )}

      <div className="page-title">Stock</div>

      {(criticos.length > 0 || bajos.length > 0) && (
        <div className="card" style={{ marginBottom: 12, border: `1px solid ${criticos.length > 0 ? 'rgba(196,0,90,0.4)' : 'rgba(245,158,11,0.4)'}` }}>
          <div className="card-title" style={{ color: criticos.length > 0 ? 'var(--pink)' : '#f59e0b' }}>
            ⚠ Alertas de stock
          </div>
          {criticos.map(i => (
            <div className="list-item" key={i.nombre}>
              <div>
                <div className="list-item-name" style={{ color: 'var(--pink)' }}>{i.nombre}</div>
                <div className="list-item-sub">Stock actual: {i.stock_actual} {i.unidad} · Mínimo: {i.stock_minimo} {i.unidad}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pink)', textTransform: 'uppercase' }}>Crítico</div>
            </div>
          ))}
          {bajos.map(i => (
            <div className="list-item" key={i.nombre}>
              <div>
                <div className="list-item-name" style={{ color: '#f59e0b' }}>{i.nombre}</div>
                <div className="list-item-sub">Stock actual: {i.stock_actual} {i.unidad} · Mínimo: {i.stock_minimo} {i.unidad}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>Bajo</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
        Toca cualquier insumo para actualizar el stock o configurar el nivel de alerta.
        El stock se actualiza automáticamente al registrar una compra.
      </div>

      <div className="card">
        {insumos.map(ins => {
          const estado = getEstado(ins)
          return (
            <div className="list-item" key={ins.nombre}
              onClick={() => setEditando(ins)}
              style={{ cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div className="list-item-name">{ins.nombre}</div>
                <div className="list-item-sub">
                  {ins.stock_actual != null
                    ? `${ins.stock_actual} ${ins.unidad}`
                    : `Sin datos · ${ins.unidad}`}
                  {ins.stock_minimo != null && ` · Mín: ${ins.stock_minimo} ${ins.unidad}`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: estadoColor[estado],
                  textTransform: 'uppercase', letterSpacing: 0.5
                }}>
                  {estadoLabel[estado]}
                </div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: estadoColor[estado] }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
