import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { descargarCSV, BotonExportar } from '../lib/exportar'

// ─── Tags de aprendizaje: deben coincidir con el CHECK de la migración ──────
const TAGS = [
  { key: 'precio',     label: 'Precio',     icon: '💰', color: 'var(--green)',  bg: 'rgba(34,197,94,0.12)' },
  { key: 'cliente',    label: 'Cliente',    icon: '👤', color: 'var(--cyan)',   bg: 'rgba(0,180,180,0.12)' },
  { key: 'operacion',  label: 'Operación',  icon: '⚙️', color: '#f59e0b',       bg: 'rgba(245,158,11,0.12)' },
  { key: 'marketing',  label: 'Marketing',  icon: '📣', color: 'var(--pink)',   bg: 'rgba(196,0,90,0.12)' },
  { key: 'calidad',    label: 'Calidad',    icon: '✨', color: 'var(--purple)', bg: 'rgba(123,47,190,0.15)' },
]
const tagInfo = (k) => TAGS.find(t => t.key === k) || null

const MAX_CHARS = 280

// Parsea "YYYY-MM-DD" sin desfase de zona horaria
function parseFecha(f) {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function labelFecha(f) {
  const d = parseFecha(f)
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

// ─── Modal de captura ────────────────────────────────────────────────────────
function CapturaModal({ onSave, onCancel }) {
  const [texto, setTexto] = useState('')
  const [tag, setTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const restantes = MAX_CHARS - texto.length

  const handleSave = async () => {
    const limpio = texto.trim()
    if (!limpio) { setError('Escribe algo primero'); return }
    if (limpio.length > MAX_CHARS) { setError('Máximo 280 caracteres'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('aprendizajes').insert({
      texto: limpio,
      tag: tag || null,
      // fecha la pone el default de la BD (current_date)
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: 24, overflowY: 'auto' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, maxWidth: 420, width: '100%', marginTop: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>
          Nuevo aprendizaje
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
          Una observación operativa que quieras recordar. Se guarda con la fecha de hoy.
        </div>

        <div className="form-group">
          <textarea
            className="form-input" value={texto} autoFocus rows={4}
            maxLength={MAX_CHARS}
            placeholder="ej: Los jueves antes de quincena venden el doble. Conviene tener stock extra de Mango Picante."
            style={{ resize: 'vertical' }}
            onChange={e => setTexto(e.target.value)}
          />
          <div style={{
            fontSize: 11, textAlign: 'right', marginTop: 4,
            color: restantes < 30 ? (restantes < 0 ? 'var(--pink)' : '#f59e0b') : 'var(--muted)',
          }}>
            {restantes} caracteres
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Categoría — opcional</label>
          <div className="chip-row" style={{ marginBottom: 0 }}>
            {TAGS.map(t => (
              <button key={t.key} type="button"
                className={`chip ${tag === t.key ? 'selected' : ''}`}
                onClick={() => setTag(tg => tg === t.key ? '' : t.key)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div style={{ color: 'var(--pink)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }}
            onClick={handleSave} disabled={saving || !texto.trim()}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function Aprendizajes() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [capturando, setCapturando] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [toast, setToast] = useState('')
  const [confirmar, setConfirmar] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('aprendizajes')
      .select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (!error) setItems(data || [])
    setLoading(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleDelete = async (id) => {
    await supabase.from('aprendizajes').delete().eq('id', id)
    setConfirmar(null)
    showToast('Aprendizaje eliminado')
    load()
  }

  const filtrados = filtro === 'todos'
    ? items
    : items.filter(i => i.tag === filtro)

  // Conteo por tag para los chips de filtro
  const conteo = {}
  items.forEach(i => { if (i.tag) conteo[i.tag] = (conteo[i.tag] || 0) + 1 })

  // Agrupar por fecha para la línea de tiempo
  const porFecha = {}
  filtrados.forEach(i => {
    if (!porFecha[i.fecha]) porFecha[i.fecha] = []
    porFecha[i.fecha].push(i)
  })
  const fechasOrdenadas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a))

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {capturando && (
        <CapturaModal
          onSave={() => { setCapturando(false); showToast('Aprendizaje guardado ✓'); load() }}
          onCancel={() => setCapturando(false)}
        />
      )}

      {confirmar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 320, width: '100%' }}>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 20, lineHeight: 1.5 }}>
              ¿Eliminar este aprendizaje? No se puede deshacer.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" style={{ flex: 1, background: 'var(--pink)' }} onClick={() => handleDelete(confirmar)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-title">Aprendizajes</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6, marginTop: -12 }}>
        El conocimiento del negocio que vas acumulando. Todo lo que aprendes operando, en un solo lugar.
      </div>

      {/* Boton exportar */}
      {items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <BotonExportar onClick={() => {
            const headers = ['Fecha','Categoría','Texto']
            const rows = items.map(i => [i.fecha, i.tag || '', i.texto])
            descargarCSV('thedrink_aprendizajes', headers, rows)
          }} />
        </div>
      )}

      {/* Filtros por tag */}
      <div className="chip-row">
        <button className={`chip ${filtro === 'todos' ? 'selected' : ''}`}
          onClick={() => setFiltro('todos')}>
          Todos ({items.length})
        </button>
        {TAGS.map(t => (
          <button key={t.key}
            className={`chip ${filtro === t.key ? 'selected' : ''}`}
            onClick={() => setFiltro(f => f === t.key ? 'todos' : t.key)}>
            {t.icon} {t.label}{conteo[t.key] ? ` (${conteo[t.key]})` : ''}
          </button>
        ))}
      </div>

      {/* Línea de tiempo */}
      {filtrados.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--muted)' }}>
          {items.length === 0
            ? 'Aún no anotas aprendizajes. Toca el botón + para empezar.'
            : 'Sin aprendizajes en esta categoría.'}
        </div>
      ) : (
        fechasOrdenadas.map(fecha => (
          <div key={fecha} style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 11, color: 'var(--cyan)', textTransform: 'uppercase',
              letterSpacing: 1.2, fontWeight: 700, marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0 }} />
              {labelFecha(fecha)}
            </div>
            {porFecha[fecha].map(item => {
              const ti = tagInfo(item.tag)
              return (
                <div key={item.id} className="card" style={{
                  marginBottom: 8, padding: '12px 14px',
                  borderLeft: `3px solid ${ti ? ti.color : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, flex: 1 }}>
                      {item.texto}
                    </div>
                    <button onClick={() => setConfirmar(item.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>
                      ×
                    </button>
                  </div>
                  {ti && (
                    <span style={{
                      display: 'inline-block', marginTop: 8, fontSize: 10,
                      background: ti.bg, color: ti.color, borderRadius: 8,
                      padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                      {ti.icon} {ti.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))
      )}

      {/* Botón flotante + */}
      <button
        onClick={() => setCapturando(true)}
        aria-label="Nuevo aprendizaje"
        style={{
          position: 'fixed', right: 18, bottom: 78, zIndex: 90,
          width: 54, height: 54, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, var(--pink), var(--purple))',
          color: '#fff', fontSize: 28, fontWeight: 300, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(180,0,90,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, paddingBottom: 3,
        }}>
        +
      </button>
    </div>
  )
}
