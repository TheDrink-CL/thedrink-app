import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

const DESCUENTO_ENVASE = 1000

const fechaHoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const horaAhora = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const itemVacio = () => ({ receta_nombre: '', litros: 1, precio_venta: '', devuelve_envase: false })

const ORIGENES = ['Instagram', 'Referido', 'Cliente habitual', 'Evento', 'Otro']
const MEDIOS_PAGO = [
  { id: 'transferencia', label: '🏦 Transferencia' },
  { id: 'debito',        label: '💳 Débito' },
  { id: 'credito',       label: '💳 Crédito' },
  { id: 'efectivo',      label: '💵 Efectivo' },
]

function ConfirmModal({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:320, width:'100%' }}>
        <div style={{ fontSize:15, color:'var(--text)', marginBottom:20, lineHeight:1.5 }}>{mensaje}</div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary btn-sm" style={{ flex:1, background:'var(--pink)' }} onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

function EditOrdenModal({ orden, recetas, onSave, onCancel }) {
  const [fecha, setFecha] = useState(orden.fecha)
  const [hora, setHora] = useState(orden.hora || '')
  const [cliente, setCliente] = useState(orden.cliente_nombre || '')
  const [origenVal, setOrigenVal] = useState(orden.origen || '')
  const [medioPago, setMedioPago] = useState(orden.medio_pago || 'transferencia')
  const [delivery, setDelivery] = useState(orden.delivery || '')
  const [nota, setNota] = useState(orden.nota || '')
  const [items, setItems] = useState(
    (orden.ventas || []).map(v => ({
      id: v.id,
      receta_nombre: v.receta_nombre,
      litros: v.litros,
      precio_venta: v.precio_venta,
      devuelve_envase: v.nota === 'envase devuelto'
    }))
  )
  const [saving, setSaving] = useState(false)

  const updateItem = (i, campo, valor) => {
    setItems(prev => prev.map((it, idx) => idx !== i ? it : { ...it, [campo]: valor }))
  }
  const quitarItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const agregarItem = () => setItems(prev => [...prev, itemVacio()])

  const handleSave = async () => {
    const itemsValidos = items.filter(it => it.receta_nombre && it.precio_venta)
    if (itemsValidos.length === 0) return
    setSaving(true)

    // Actualizar orden
    await supabase.from('ordenes').update({
      fecha,
      hora: hora || null,
      cliente_nombre: cliente || null,
      origen: origenVal || null,
      medio_pago: medioPago,
      nota: nota || null,
      delivery: parseFloat(delivery) || 0,
    }).eq('id', orden.id)

    // Borrar ventas antiguas e insertar nuevas
    await supabase.from('ventas').delete().eq('orden_id', orden.id)
    await supabase.from('ventas').insert(itemsValidos.map(it => ({
      fecha,
      receta_nombre: it.receta_nombre,
      litros: parseFloat(it.litros) || 1,
      precio_venta: parseFloat(it.precio_venta) || 0,
      delivery: 0,
      origen: origenVal || null,
      nota: it.devuelve_envase ? 'envase devuelto' : null,
      orden_id: orden.id,
    })))

    setSaving(false)
    onSave()
  }

  const total = items.reduce((s, it) => s + (parseFloat(it.precio_venta)||0) * (parseFloat(it.litros)||1), 0)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:200, padding:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:480, width:'100%', marginTop:20 }}>
        <div style={{ fontSize:17, fontWeight:700, color:'var(--text)', marginBottom:18 }}>Editar pedido</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hora</label>
            <input type="time" className="form-input" value={hora} onChange={e => setHora(e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Cliente</label>
          <input type="text" className="form-input" value={cliente} placeholder="opcional" onChange={e => setCliente(e.target.value)} />
        </div>

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Origen</label>
          <div className="chip-row">
            {ORIGENES.map(op => (
              <button key={op} type="button" className={`chip ${origenVal === op ? 'selected' : ''}`}
                onClick={() => setOrigenVal(o => o === op ? '' : op)}>{op}</button>
            ))}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Medio de pago</label>
          <div className="chip-row">
            {MEDIOS_PAGO.map(m => (
              <button key={m.id} type="button" className={`chip ${medioPago === m.id ? 'selected' : ''}`}
                onClick={() => setMedioPago(m.id)}>{m.label}</button>
            ))}
          </div>
        </div>

        <div style={{ fontSize:12, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:10 }}>Productos</div>
        {items.map((it, i) => (
          <div key={i} style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:12, marginBottom:8, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>Ítem {i+1}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => quitarItem(i)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18, lineHeight:1, padding:0 }}>×</button>
              )}
            </div>
            <select className="form-select" value={it.receta_nombre} style={{ marginBottom:8 }}
              onChange={e => updateItem(i, 'receta_nombre', e.target.value)}>
              <option value="">Seleccionar receta...</option>
              {recetas.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
            </select>
            <div style={{ display:'flex', gap:8 }}>
              <input type="number" className="form-input" value={it.precio_venta} placeholder="Precio ($)" style={{ flex:1 }}
                onChange={e => updateItem(i, 'precio_venta', e.target.value)} />
              <input type="number" className="form-input" value={it.litros} placeholder="Litros" style={{ width:70 }}
                onChange={e => updateItem(i, 'litros', e.target.value)} />
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', marginTop:6 }}>
              <input type="checkbox" checked={it.devuelve_envase}
                onChange={e => updateItem(i, 'devuelve_envase', e.target.checked)}
                style={{ width:15, height:15, accentColor:'var(--cyan)' }} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>Devuelve envase</span>
            </label>
          </div>
        ))}
        <button type="button" onClick={agregarItem}
          style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px dashed var(--border)', borderRadius:10, padding:'8px 0', color:'var(--muted)', cursor:'pointer', fontSize:13, marginBottom:12 }}>
          + Agregar producto
        </button>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div className="form-group">
            <label className="form-label">Costo Uber</label>
            <input type="number" className="form-input" value={delivery} placeholder="ej: 2500" onChange={e => setDelivery(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Nota</label>
            <input type="text" className="form-input" value={nota} placeholder="opcional" onChange={e => setNota(e.target.value)} />
          </div>
        </div>

        {total > 0 && (
          <div style={{ textAlign:'right', marginBottom:14, fontSize:15, fontWeight:700, color:'var(--green)' }}>
            Total: {formatCLP(total)}
          </div>
        )}

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Ventas() {
  const [recetas, setRecetas] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [editando, setEditando] = useState(null)

  // Formulario de orden nueva
  const [fecha, setFecha] = useState(fechaHoy())
  const [hora, setHora] = useState(horaAhora())
  const [cliente, setCliente] = useState('')
  const [origen, setOrigen] = useState('')
  const [medioPago, setMedioPago] = useState('transferencia')
  const [delivery, setDelivery] = useState('')
  const [nota, setNota] = useState('')
  const [items, setItems] = useState([itemVacio()])

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: r }, { data: o }, { data: vts }] = await Promise.all([
      supabase.from('recetas').select('nombre').order('nombre'),
      supabase.from('ordenes').select('*').order('fecha', { ascending: false }),
      supabase.from('ventas').select('*'),
    ])
    // Agrupar ventas por orden_id manualmente para evitar el límite de relaciones anidadas
    const ventasPorOrden = {}
    ;(vts || []).forEach(v => {
      if (!ventasPorOrden[v.orden_id]) ventasPorOrden[v.orden_id] = []
      ventasPorOrden[v.orden_id].push(v)
    })
    const ordenesConVentas = (o || []).map(ord => ({
      ...ord,
      ventas: ventasPorOrden[ord.id] || []
    }))
    setRecetas((r || []).filter(x => x.nombre !== 'ENVASE'))
    setOrdenes(ordenesConVentas)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  const getPrecioSugerido = (nombre) => {
    const n = nombre.toLowerCase()
    if (n.includes('colada')) return 9000
    if (n.includes('daikiri')) return 8000
    return 9000
  }

  const updateItem = (i, campo, valor) => {
    setItems(prev => prev.map((it, idx) => {
      if (idx !== i) return it
      const updated = { ...it, [campo]: valor }
      if (campo === 'receta_nombre' && valor) updated.precio_venta = getPrecioSugerido(valor)
      return updated
    }))
  }

  const agregarItem = () => setItems(prev => [...prev, itemVacio()])
  const quitarItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const totalBruto = items.reduce((s, it) => {
    const base = parseFloat(it.precio_venta) || 0
    const desc = it.devuelve_envase ? DESCUENTO_ENVASE : 0
    return s + (base - desc) * (parseFloat(it.litros) || 1)
  }, 0)

  const totalNeto = totalBruto - (parseFloat(delivery) || 0)
  const envasesDevueltos = items.filter(it => it.devuelve_envase).length

  const handleSubmit = async (e) => {
    e.preventDefault()
    console.log('submit fired, items:', items)
    const itemsValidos = items.filter(it => it.receta_nombre && it.precio_venta)
    console.log('itemsValidos:', itemsValidos)
    if (itemsValidos.length === 0) {
      showToast('Agrega al menos un producto con receta y precio')
      return
    }
    setLoading(true)

    const { data: orden, error: errOrden } = await supabase.from('ordenes').insert({
      fecha,
      hora: hora || null,
      cliente_nombre: cliente || null,
      origen: origen || null,
      medio_pago: medioPago,
      nota: nota || null,
      delivery: parseFloat(delivery) || 0,
    }).select().single()

    console.log('orden result:', orden, 'error:', errOrden)

    if (errOrden || !orden) {
      showToast('Error al guardar: ' + (errOrden?.message || 'sin datos'))
      setLoading(false)
      return
    }

    const ventasInsert = itemsValidos.map(it => ({
      fecha,
      receta_nombre: it.receta_nombre,
      litros: parseFloat(it.litros) || 1,
      precio_venta: (parseFloat(it.precio_venta) || 0) - (it.devuelve_envase ? DESCUENTO_ENVASE : 0),
      delivery: 0,
      origen: origen || null,
      nota: it.devuelve_envase ? 'envase devuelto' : null,
      orden_id: orden.id,
    }))
    console.log('ventasInsert:', ventasInsert)
    const { error: errVentas } = await supabase.from('ventas').insert(ventasInsert)
    console.log('ventas error:', errVentas)
    if (errVentas) {
      showToast('Error en ventas: ' + errVentas.message)
      setLoading(false)
      return
    }

    if (envasesDevueltos > 0) {
      const { data: ins } = await supabase.from('insumos').select('stock_actual').eq('nombre', 'Frascos de vidrio').single()
      await supabase.from('insumos').update({ stock_actual: (ins?.stock_actual || 0) + envasesDevueltos }).eq('nombre', 'Frascos de vidrio')
    }

    showToast('Pedido registrado ✓')
    setFecha(fechaHoy())
    setHora(horaAhora())
    setCliente('')
    setOrigen('')
    setMedioPago('transferencia')
    setDelivery('')
    setNota('')
    setItems([itemVacio()])
    load()
    setLoading(false)
  }

  const handleEliminarOrden = async (orden) => {
    await supabase.from('ventas').delete().eq('orden_id', orden.id)
    await supabase.from('ordenes').delete().eq('id', orden.id)
    showToast('Pedido eliminado')
    setConfirmar(null)
    load()
  }

  const origenColor = (o) => {
    if (o === 'Instagram') return { bg: 'rgba(196,0,90,0.15)', color: 'var(--pink)' }
    return { bg: 'rgba(0,180,180,0.1)', color: 'var(--cyan)' }
  }
  const origenIcon = (o) => ({ Instagram:'📱', Referido:'🤝', 'Cliente habitual':'⭐', Evento:'🎉' }[o] || '•')

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {confirmar && (
        <ConfirmModal
          mensaje={`¿Eliminar pedido de ${confirmar.cliente_nombre || 'cliente anónimo'}?`}
          onConfirm={() => handleEliminarOrden(confirmar)}
          onCancel={() => setConfirmar(null)}
        />
      )}

      {editando && (
        <EditOrdenModal
          orden={editando}
          recetas={recetas}
          onSave={() => { setEditando(null); showToast('Pedido actualizado ✓'); load() }}
          onCancel={() => setEditando(null)}
        />
      )}

      <div className="page-title">Registrar pedido</div>
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hora</label>
              <input type="time" className="form-input" value={hora} onChange={e => setHora(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Cliente — opcional</label>
            <input type="text" className="form-input" value={cliente} placeholder="ej: Juan Pérez"
              onChange={e => setCliente(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">¿Cómo llegó el cliente?</label>
            <div className="chip-row">
              {ORIGENES.map(op => (
                <button key={op} type="button" className={`chip ${origen === op ? 'selected' : ''}`}
                  onClick={() => setOrigen(o => o === op ? '' : op)}>{op}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Medio de pago</label>
            <div className="chip-row">
              {MEDIOS_PAGO.map(m => (
                <button key={m.id} type="button" className={`chip ${medioPago === m.id ? 'selected' : ''}`}
                  onClick={() => setMedioPago(m.id)}>{m.label}</button>
              ))}
            </div>
          </div>

          <div style={{ borderTop:'1px solid var(--border)', paddingTop:14, marginTop:4 }}>
            <div style={{ fontSize:12, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:10 }}>Productos</div>
            {items.map((it, i) => (
              <div key={i} style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:12, marginBottom:10, border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>Ítem {i+1}</div>
                  {items.length > 1 && (
                    <button type="button" onClick={() => quitarItem(i)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18, lineHeight:1, padding:0 }}>×</button>
                  )}
                </div>
                <select className="form-select" value={it.receta_nombre} style={{ marginBottom:8 }}
                  onChange={e => updateItem(i, 'receta_nombre', e.target.value)}>
                  <option value="">Seleccionar receta...</option>
                  {recetas.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
                </select>
                <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                  <input type="number" className="form-input" value={it.precio_venta} placeholder="Precio ($)" style={{ flex:1 }}
                    onChange={e => updateItem(i, 'precio_venta', e.target.value)} />
                  <input type="number" className="form-input" value={it.litros} placeholder="Litros" style={{ width:80 }}
                    step="0.5" min="0.5"
                    onChange={e => updateItem(i, 'litros', e.target.value)} />
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                    <input type="checkbox" checked={it.devuelve_envase}
                      onChange={e => updateItem(i, 'devuelve_envase', e.target.checked)}
                      style={{ width:16, height:16, accentColor:'var(--cyan)' }} />
                    <span style={{ fontSize:12, color: it.devuelve_envase ? 'var(--cyan)' : 'var(--muted)' }}>
                      Devuelve envase {it.devuelve_envase && <span style={{ color:'var(--green)' }}>-{formatCLP(DESCUENTO_ENVASE)}</span>}
                    </span>
                  </label>
                </div>
                {it.receta_nombre && it.precio_venta && (
                  <div style={{ marginTop:6, fontSize:13, color:'var(--green)', fontWeight:700, textAlign:'right' }}>
                    {formatCLP((parseFloat(it.precio_venta) - (it.devuelve_envase ? DESCUENTO_ENVASE : 0)) * (parseFloat(it.litros)||1))}
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={agregarItem}
              style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px dashed var(--border)', borderRadius:10, padding:'10px 0', color:'var(--muted)', cursor:'pointer', fontSize:13 }}>
              + Agregar producto
            </button>
          </div>

          {totalBruto > 0 && (
            <div style={{ borderTop:'1px solid var(--border)', marginTop:14, paddingTop:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontSize:13, color:'var(--muted)' }}>Total pedido</span>
                <span style={{ fontSize:18, fontWeight:700, color:'var(--green)' }}>{formatCLP(totalBruto)}</span>
              </div>
              {envasesDevueltos > 0 && (
                <div style={{ fontSize:12, color:'var(--cyan)', textAlign:'right', marginBottom:4 }}>
                  +{envasesDevueltos} frasco{envasesDevueltos > 1 ? 's' : ''} vuelve al stock
                </div>
              )}
              {parseFloat(delivery) > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ color:'var(--muted)' }}>Neto (sin Uber)</span>
                  <span style={{ color:'var(--cyan)', fontWeight:600 }}>{formatCLP(totalNeto)}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}>
            <div className="form-group">
              <label className="form-label">Costo Uber — opcional</label>
              <input type="number" className="form-input" value={delivery} placeholder="ej: 2500"
                onChange={e => setDelivery(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Nota — opcional</label>
              <input type="text" className="form-input" value={nota} placeholder="ej: pago en 2 partes"
                onChange={e => setNota(e.target.value)} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Confirmar pedido'}
          </button>
        </div>
      </form>

      <div className="section-divider">Historial de pedidos ({ordenes.length})</div>
      <div className="card">
        {ordenes.length === 0 && <div style={{ color:'var(--muted)', textAlign:'center', padding:20 }}>Sin pedidos</div>}
        {ordenes.map(o => {
          const totalOrden = (o.ventas || []).reduce((s, v) => s + (v.litros||1) * (v.precio_venta||0), 0)
          const nItems = (o.ventas || []).length
          const oc = origenColor(o.origen)
          return (
            <div className="list-item" key={o.id} style={{ gap:8, alignItems:'flex-start' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="list-item-name">{o.cliente_nombre || 'Cliente anónimo'}</div>
                <div className="list-item-sub">{o.fecha}{o.hora ? ` · ${o.hora}` : ''} · {nItems} producto{nItems !== 1 ? 's' : ''}</div>
                <div style={{ display:'flex', gap:6, marginTop:3, flexWrap:'wrap' }}>
                  {o.origen && (
                    <span style={{ fontSize:11, background:oc.bg, color:oc.color, borderRadius:10, padding:'1px 7px', fontWeight:600 }}>
                      {origenIcon(o.origen)} {o.origen}
                    </span>
                  )}
                  {o.medio_pago && (
                    <span style={{ fontSize:11, background:'rgba(255,255,255,0.06)', color:'var(--muted)', borderRadius:10, padding:'1px 7px' }}>
                      {MEDIOS_PAGO.find(m => m.id === o.medio_pago)?.label || o.medio_pago}
                    </span>
                  )}
                  {(o.ventas || []).map((v, i) => (
                    <span key={i} style={{ fontSize:11, color:'var(--muted)' }}>{v.receta_nombre}</span>
                  ))}
                </div>
                {o.nota && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{o.nota}</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{formatCLP(totalOrden)}</div>
                  {o.delivery > 0 && <div style={{ fontSize:11, color:'var(--pink)' }}>-{formatCLP(o.delivery)} Uber</div>}
                </div>
                {/* Editar */}
                <button onClick={() => setEditando(o)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--cyan)', padding:4 }}
                  title="Editar pedido">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                {/* Eliminar */}
                <button onClick={() => setConfirmar(o)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}
                  title="Eliminar pedido">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
