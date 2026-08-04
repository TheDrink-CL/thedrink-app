import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

const ORIGENES = ['IG Orgánico', 'IG Pauta', 'Referido', 'Cliente habitual', 'Evento', 'Otro']

const origenColor = (o) => {
  if (o === 'IG Orgánico' || o === 'Instagram') return { bg: 'rgba(196,0,90,0.15)', color: 'var(--pink)' }
  if (o === 'IG Pauta') return { bg: 'rgba(196,0,90,0.25)', color: '#ff4d9e' }
  if (o === 'Referido') return { bg: 'rgba(16,185,129,0.12)', color: 'var(--green)' }
  if (o === 'Cliente habitual') return { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
  return { bg: 'rgba(0,180,180,0.1)', color: 'var(--cyan)' }
}
const origenIcon = (o) => ({
  'IG Orgánico': '📱', 'Instagram': '📱', 'IG Pauta': '🎯',
  'Referido': '🤝', 'Cliente habitual': '⭐', 'Evento': '🎉'
}[o] || '•')

// ─── Modal editar/crear cliente ──────────────────────────────────────────────
function ClienteModal({ cliente, onSave, onCancel }) {
  const [nombre, setNombre] = useState(cliente?.nombre || '')
  const [telefono, setTelefono] = useState(cliente?.telefono || '')
  const [direccion, setDireccion] = useState(cliente?.direccion || '')
  const [distanciaKm, setDistanciaKm] = useState(cliente?.distancia_km ?? '')
  const [origen, setOrigen] = useState(cliente?.origen || '')
  const [nota, setNota] = useState(cliente?.nota || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
      direccion: direccion.trim() || null,
      distancia_km: distanciaKm !== '' ? parseFloat(distanciaKm) : null,
      origen: origen || null,
      nota: nota.trim() || null,
    }
    const { error: err } = cliente?.id
      ? await supabase.from('clientes').update(payload).eq('id', cliente.id)
      : await supabase.from('clientes').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: 24, overflowY: 'auto' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', marginTop: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 18 }}>
          {cliente?.id ? 'Editar cliente' : 'Nuevo cliente'}
        </div>

        <div className="form-group">
          <label className="form-label">Nombre *</label>
          <input type="text" className="form-input" value={nombre} autoFocus
            placeholder="ej: Juan Pérez"
            onChange={e => setNombre(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Teléfono / WhatsApp</label>
          <input type="tel" className="form-input" value={telefono}
            placeholder="+56 9 ..."
            onChange={e => setTelefono(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Dirección</label>
          <input type="text" className="form-input" value={direccion}
            placeholder="Calle N°, comuna"
            onChange={e => setDireccion(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Distancia (km)</label>
          <input type="number" step="0.1" className="form-input" value={distanciaKm}
            placeholder="ej: 6.5"
            onChange={e => setDistanciaKm(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">¿Cómo llegó?</label>
          <div className="chip-row">
            {ORIGENES.map(op => (
              <button key={op} type="button" className={`chip ${origen === op ? 'selected' : ''}`}
                onClick={() => setOrigen(o => o === op ? '' : op)}>{op}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Nota interna</label>
          <textarea className="form-input" value={nota} rows={2}
            placeholder="ej: prefiere sin hielo, paga por Mach..."
            style={{ resize: 'vertical' }}
            onChange={e => setNota(e.target.value)} />
        </div>

        {error && <div style={{ color: 'var(--pink)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving || !nombre.trim()}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Tags sugeridos para clientes (la columna `tag` es texto libre, esto es UX)
const TAGS_CLIENTE = ['Cliente VIP', 'Probable invitado bar', 'Influencer potencial', 'Cliente nuevo', 'En riesgo']

// Parsea "YYYY-MM-DD" sin desfase de zona horaria
function parseFechaCli(f) {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ¿Esta orden es de este cliente? El vínculo real es `cliente_id`. El nombre
// solo se usa para órdenes viejas que quedaron sin id: matchear por nombre a
// secas hacía que dos personas distintas con el mismo nombre (dos "Paula", tres
// "Constanza") se mostraran cada una con los pedidos de la otra.
function esPedidoDe(orden, cliente) {
  if (orden.cliente_id) return orden.cliente_id === cliente.id
  return (orden.cliente_nombre || '').trim().toLowerCase() === cliente.nombre.trim().toLowerCase()
}

// ─── Modal perfil completo de cliente ────────────────────────────────────────
function PerfilModal({ cliente, ordenes, onEditar, onCerrar, onTagSaved }) {
  // Pedidos del cliente, ordenados del más reciente al más antiguo
  const pedidos = ordenes
    .filter(o => esPedidoDe(o, cliente))
    .slice()
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

  const gastoDePedido = (o) => (o.ventas || []).reduce((ss, v) => ss + (v.litros || 1) * (v.precio_venta || 0), 0)
  const totalGastado = pedidos.reduce((s, o) => s + gastoDePedido(o), 0)
  const ticketPromedio = pedidos.length > 0 ? totalGastado / pedidos.length : 0

  // ── Días entre compras (promedio) ──────────────────────────────────────────
  const fechasUnicas = [...new Set(pedidos.map(o => o.fecha).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
  let diasEntreCompras = null
  if (fechasUnicas.length >= 2) {
    let totalDias = 0
    for (let i = 1; i < fechasUnicas.length; i++) {
      totalDias += (parseFechaCli(fechasUnicas[i]) - parseFechaCli(fechasUnicas[i - 1])) / (1000 * 60 * 60 * 24)
    }
    diasEntreCompras = Math.round(totalDias / (fechasUnicas.length - 1))
  }

  // ── Bebida favorita ────────────────────────────────────────────────────────
  const recetasFav = {}
  pedidos.forEach(o => (o.ventas || []).forEach(v => {
    recetasFav[v.receta_nombre] = (recetasFav[v.receta_nombre] || 0) + (v.litros || 1)
  }))
  const favSorted = Object.entries(recetasFav).sort((a, b) => b[1] - a[1])

  // ── Hora típica de compra ──────────────────────────────────────────────────
  const horas = pedidos.map(o => o.hora).filter(Boolean).map(h => parseInt(h.slice(0, 2), 10)).filter(h => !isNaN(h))
  let horaTipica = null
  if (horas.length > 0) {
    const avg = Math.round(horas.reduce((s, h) => s + h, 0) / horas.length)
    horaTipica = `${String(avg).padStart(2, '0')}:00 aprox`
  }

  // ── Tag editable ───────────────────────────────────────────────────────────
  const [tag, setTag] = useState(cliente.tag || '')
  const [tagCustom, setTagCustom] = useState('')
  const [savingTag, setSavingTag] = useState(false)
  const [editandoTag, setEditandoTag] = useState(false)

  const guardarTag = async (nuevoTag) => {
    setSavingTag(true)
    await supabase.from('clientes').update({ tag: nuevoTag || null }).eq('id', cliente.id)
    setSavingTag(false)
    setTag(nuevoTag)
    setEditandoTag(false)
    setTagCustom('')
    if (onTagSaved) onTagSaved()
  }

  const oc = origenColor(cliente.origen)
  const esVIP = pedidos.length >= 3
  const ultPedido = pedidos[0]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: 20, overflowY: 'auto' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 22, maxWidth: 400, width: '100%', marginTop: 16, marginBottom: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 4 }}>{cliente.nombre}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {cliente.origen && (
                <span style={{ fontSize: 11, background: oc.bg, color: oc.color, borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>
                  {origenIcon(cliente.origen)} {cliente.origen}
                </span>
              )}
              {esVIP && (
                <span style={{ fontSize: 11, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
                  ⭐ VIP
                </span>
              )}
              {tag && (
                <span style={{ fontSize: 11, background: 'rgba(123,47,190,0.18)', color: '#AFA9EC', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
                  🏷️ {tag}
                </span>
              )}
            </div>
          </div>
          <button onClick={onCerrar}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 24, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>

        {/* KPIs principales */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'rgba(0,180,180,0.07)', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--cyan)' }}>{pedidos.length}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>pedido{pedidos.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.07)', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--green)' }}>{formatCLP(totalGastado)}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>total</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-strong)' }}>{formatCLP(ticketPromedio)}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>ticket prom.</div>
          </div>
        </div>

        {/* Insights de comportamiento */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>🔁 Días entre compras</span>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>
              {diasEntreCompras != null ? `${diasEntreCompras} días` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>🍹 Bebida favorita</span>
            <span style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 700 }}>
              {favSorted.length > 0 ? favSorted[0][0] : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>🕐 Hora típica</span>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>
              {horaTipica || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>📅 Último pedido</span>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>
              {ultPedido ? ultPedido.fecha : '—'}
            </span>
          </div>
        </div>

        {/* Tag editable */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
            🏷️ Etiqueta
          </div>
          {editandoTag ? (
            <div>
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {TAGS_CLIENTE.map(t => (
                  <button key={t} type="button"
                    className={`chip ${tag === t ? 'selected' : ''}`}
                    onClick={() => guardarTag(t)} disabled={savingTag}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" className="form-input" value={tagCustom}
                  placeholder="O escribe una etiqueta..." style={{ flex: 1, fontSize: 13 }}
                  onChange={e => setTagCustom(e.target.value)} />
                <button className="btn btn-primary btn-sm"
                  onClick={() => guardarTag(tagCustom.trim())}
                  disabled={savingTag || !tagCustom.trim()}>OK</button>
              </div>
              <button onClick={() => { setEditandoTag(false); setTagCustom('') }}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, marginTop: 6, padding: 0 }}>
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: tag ? '#AFA9EC' : 'var(--muted)', fontWeight: tag ? 700 : 400 }}>
                {tag || 'Sin etiqueta'}
              </span>
              <button onClick={() => setEditandoTag(true)}
                style={{ background: 'none', border: '1px solid rgba(123,47,190,0.4)', borderRadius: 7, color: '#AFA9EC', cursor: 'pointer', fontSize: 11, padding: '3px 9px' }}>
                {tag ? 'Cambiar' : '+ Asignar'}
              </button>
              {tag && (
                <button onClick={() => guardarTag('')} disabled={savingTag}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                  Quitar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Datos de contacto */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          {cliente.telefono
            ? <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>📞 <a href={`https://wa.me/${cliente.telefono.replace(/\D/g,'')}`} style={{ color: 'var(--green)', textDecoration: 'none' }}>{cliente.telefono}</a></div>
            : <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>📞 Sin teléfono</div>
          }
          {cliente.direccion && <div style={{ fontSize: 13, color: 'var(--cyan)', marginBottom: 4 }}>📍 {cliente.direccion}{cliente.distancia_km ? ` · ${cliente.distancia_km} km` : ''}</div>}
          {cliente.nota && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginTop: 4 }}>💬 {cliente.nota}</div>}
        </div>

        {/* Histórico de pedidos */}
        {pedidos.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
              Histórico de pedidos ({pedidos.length})
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {pedidos.map((o, i) => {
                const gasto = gastoDePedido(o)
                const items = (o.ventas || [])
                return (
                  <div key={o.id || i} style={{
                    padding: '8px 10px', marginBottom: 6,
                    background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>
                        {o.fecha}{o.hora ? ` · ${o.hora}` : ''}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 800 }}>
                        {formatCLP(gasto)}
                      </span>
                    </div>
                    {items.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {items.map(v => `${v.receta_nombre}${v.litros && v.litros !== 1 ? ` (${v.litros}L)` : ''}`).join(' · ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <button className="btn btn-primary" onClick={onEditar} style={{ width: '100%' }}>
          ✏️ Editar datos
        </button>
      </div>
    </div>
  )
}

// ─── Página principal Clientes ───────────────────────────────────────────────
export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState(null)       // null | 'nuevo' | cliente
  const [perfil, setPerfil] = useState(null)           // cliente seleccionado para ver perfil
  const [toast, setToast] = useState('')
  const [orden, setOrden] = useState('gastado')        // 'gastado' | 'pedidos' | 'nombre'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: cls }, { data: ords }, { data: vts }] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('ordenes').select('*').order('fecha', { ascending: false }),
      supabase.from('ventas').select('*'),
    ])
    // Enriquecer ordenes con sus ventas
    const ventasPorOrden = {}
    ;(vts || []).forEach(v => {
      if (!v.orden_id) return
      if (!ventasPorOrden[v.orden_id]) ventasPorOrden[v.orden_id] = []
      ventasPorOrden[v.orden_id].push(v)
    })
    const ordenesEnriq = (ords || []).map(o => ({ ...o, ventas: ventasPorOrden[o.id] || [] }))
    setClientes(cls || [])
    setOrdenes(ordenesEnriq)
    setLoading(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // Stats por cliente
  const statsCliente = (c) => {
    const pedidos = ordenes.filter(o => esPedidoDe(o, c))
    const gastado = pedidos.reduce((s, o) => s + (o.ventas || []).reduce((ss, v) => ss + (v.litros || 1) * (v.precio_venta || 0), 0), 0)
    const ultimo = pedidos[0]?.fecha || null
    return { pedidos: pedidos.length, gastado, ultimo }
  }

  // Filtrar y ordenar
  const clientesFiltrados = clientes
    .map(c => ({ ...c, _stats: statsCliente(c) }))
    .filter(c => {
      if (!busqueda.trim()) return true
      const q = busqueda.toLowerCase()
      // El teléfono se compara solo con dígitos: en la base conviven
      // "+56 9 7955 2465" y "979552465", y buscar el segundo no encontraba al
      // primero.
      const qDigitos = busqueda.replace(/\D/g, '')
      return c.nombre.toLowerCase().includes(q) ||
        (qDigitos.length >= 3 && (c.telefono || '').replace(/\D/g, '').includes(qDigitos)) ||
        (c.direccion || '').toLowerCase().includes(q) ||
        (c.origen || '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (orden === 'gastado') return b._stats.gastado - a._stats.gastado
      if (orden === 'pedidos') return b._stats.pedidos - a._stats.pedidos
      return a.nombre.localeCompare(b.nombre)
    })

  // KPIs globales
  const totalClientes = clientes.length
  const conTelefono = clientes.filter(c => c.telefono).length
  const vips = clientes.filter(c => statsCliente(c).pedidos >= 3).length
  const topGastador = clientesFiltrados[0]

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {editando && (
        <ClienteModal
          cliente={editando === 'nuevo' ? null : editando}
          onSave={() => {
            const fueNuevo = editando === 'nuevo'
            setEditando(null)
            setPerfil(null)
            showToast(fueNuevo ? 'Cliente creado ✓' : 'Cliente actualizado ✓')
            loadData()
          }}
          onCancel={() => setEditando(null)}
        />
      )}

      {perfil && !editando && (
        <PerfilModal
          cliente={perfil}
          ordenes={ordenes}
          onEditar={() => setEditando(perfil)}
          onCerrar={() => setPerfil(null)}
          onTagSaved={() => { showToast('Etiqueta guardada ✓'); loadData() }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="page-title" style={{ marginBottom: 0 }}>Clientes</div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditando('nuevo')}>+ Nuevo</button>
      </div>

      {/* KPIs globales */}
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total clientes</div>
          <div className="kpi-value cyan">{totalClientes}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">VIP (3+ pedidos)</div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>{vips}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Con teléfono</div>
          <div className="kpi-value">{conTelefono}</div>
          <div className="kpi-sub">{totalClientes > 0 ? Math.round(conTelefono/totalClientes*100) : 0}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Top cliente</div>
          <div className="kpi-value" style={{ fontSize: 14, color: 'var(--green)' }}>
            {topGastador ? topGastador.nombre.split(' ')[0] : '—'}
          </div>
          {topGastador && <div className="kpi-sub">{formatCLP(topGastador._stats.gastado)}</div>}
        </div>
      </div>

      {/* Búsqueda */}
      <input
        type="text"
        className="form-input"
        value={busqueda}
        placeholder="Buscar por nombre, teléfono, dirección..."
        onChange={e => setBusqueda(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      {/* Ordenar */}
      <div className="toggle-row" style={{ marginBottom: 12 }}>
        {[
          { k: 'gastado', l: '$ Gastado' },
          { k: 'pedidos', l: 'Pedidos' },
          { k: 'nombre',  l: 'A–Z' },
        ].map(o => (
          <button key={o.k}
            className={`toggle-btn ${orden === o.k ? 'active-entrada' : ''}`}
            onClick={() => setOrden(o.k)}
            style={{ fontSize: 12 }}>
            {o.l}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="card">
        {clientesFiltrados.length === 0 && (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>
            {busqueda ? 'Sin resultados' : 'Sin clientes aún'}
          </div>
        )}
        {clientesFiltrados.map((c, idx) => {
          const { pedidos, gastado, ultimo } = c._stats
          const oc = origenColor(c.origen)
          const esVIP = pedidos >= 3

          return (
            <div key={c.id}
              onClick={() => setPerfil(c)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 0', cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}>
              {/* Ranking número */}
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: idx === 0 && orden === 'gastado' ? 'var(--cyan)' : 'rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                color: idx === 0 && orden === 'gastado' ? '#000' : 'var(--muted)',
                marginTop: 2
              }}>{idx + 1}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{c.nombre}</span>
                  {esVIP && <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>⭐ VIP</span>}
                  {c.origen && (
                    <span style={{ fontSize: 10, background: oc.bg, color: oc.color, borderRadius: 8, padding: '1px 6px', fontWeight: 600 }}>
                      {origenIcon(c.origen)} {c.origen}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                  {pedidos} pedido{pedidos !== 1 ? 's' : ''}
                  {c.telefono && <span> · 📞 {c.telefono}</span>}
                  {c.direccion && <span> · 📍 {c.distancia_km ? `${c.distancia_km}km` : c.direccion.split(',')[1]?.trim() || c.direccion.split(',')[0]}</span>}
                  {ultimo && <span> · último {ultimo}</span>}
                </div>
                {c.nota && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>💬 {c.nota}</div>
                )}
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: gastado > 0 ? 'var(--green)' : 'var(--muted)' }}>
                  {gastado > 0 ? formatCLP(gastado) : '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>total</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
