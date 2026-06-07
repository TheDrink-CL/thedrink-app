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

function ProveedorModal({ proveedor, onSave, onCancel }) {
  const [nombre, setNombre] = useState(proveedor?.nombre || '')
  const [contacto, setContacto] = useState(proveedor?.contacto || '')
  const [rating, setRating] = useState(proveedor?.rating || 0)
  const [nota, setNota] = useState(proveedor?.nota || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre: nombre.trim(),
      contacto: contacto.trim() || null,
      rating: rating > 0 ? rating : null,
      nota: nota.trim() || null,
    }
    const { error: err } = proveedor?.id
      ? await supabase.from('proveedores').update(payload).eq('id', proveedor.id)
      : await supabase.from('proveedores').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:400, width:'100%' }}>
        <div style={{ fontWeight:700, fontSize:16, color:'var(--text)', marginBottom:18 }}>
          {proveedor?.id ? 'Editar proveedor' : 'Nuevo proveedor'}
        </div>
        <div className="form-group">
          <label className="form-label">Nombre</label>
          <input type="text" className="form-input" value={nombre}
            placeholder="ej: Vega Central, Lider, Jumbo..." autoFocus
            onChange={e => setNombre(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Contacto — opcional</label>
          <input type="text" className="form-input" value={contacto}
            placeholder="WhatsApp, IG, teléfono..."
            onChange={e => setContacto(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Calificación</label>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button" onClick={() => setRating(r => r === n ? 0 : n)}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:24, padding:2,
                  color: n <= rating ? '#f59e0b' : 'rgba(255,255,255,0.15)' }}>
                ★
              </button>
            ))}
            {rating > 0 && (
              <button type="button" onClick={() => setRating(0)}
                style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:11, marginLeft:6 }}>
                limpiar
              </button>
            )}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Nota — opcional</label>
          <textarea className="form-input" value={nota}
            placeholder="ej: rápido pero caro, abre 8-22..."
            rows={2} style={{ resize:'vertical' }}
            onChange={e => setNota(e.target.value)} />
        </div>
        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving || !nombre.trim()}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditCompraModal({ compra, insumos, proveedores, onSave, onCancel }) {
  const [fecha, setFecha] = useState(compra.fecha)
  const [insumoNombre, setInsumoNombre] = useState(compra.insumo_nombre)
  const [unidad, setUnidad] = useState(compra.unidad)
  const [cantidad, setCantidad] = useState(compra.cantidad)
  const [precioTotal, setPrecioTotal] = useState(compra.precio_total)
  const [proveedorId, setProveedorId] = useState(compra.proveedor_id || '')
  const [nota, setNota] = useState(compra.nota || '')
  const [saving, setSaving] = useState(false)

  const handleSelectInsumo = (nombre) => {
    const ins = insumos.find(i => i.nombre === nombre)
    setInsumoNombre(nombre)
    setUnidad(ins?.unidad || 'ml')
  }

  const costoPorUnidad = cantidad && precioTotal
    ? (parseFloat(precioTotal) / parseFloat(cantidad)).toFixed(2) : null

  const handleSave = async () => {
    if (!insumoNombre || !cantidad || !precioTotal) return
    setSaving(true)
    await supabase.from('compras').update({
      fecha, insumo_nombre: insumoNombre, unidad,
      cantidad: parseFloat(cantidad),
      precio_total: parseFloat(precioTotal),
      proveedor_id: proveedorId || null,
      nota: nota || null
    }).eq('id', compra.id)
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:400, width:'100%' }}>
        <div style={{ fontWeight:700, fontSize:16, color:'var(--text)', marginBottom:18 }}>Editar compra</div>
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Insumo</label>
          <select className="form-select" value={insumoNombre} onChange={e => handleSelectInsumo(e.target.value)}>
            <option value="">Seleccionar...</option>
            {insumos.map(i => <option key={i.nombre} value={i.nombre}>{i.nombre}</option>)}
          </select>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Cantidad ({unidad})</label>
            <input type="number" step="any" className="form-input" value={cantidad} onChange={e => setCantidad(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Precio total ($)</label>
            <input type="number" className="form-input" value={precioTotal} onChange={e => setPrecioTotal(e.target.value)} />
          </div>
        </div>
        {costoPorUnidad && (
          <div style={{ color:'var(--cyan)', fontSize:13, marginBottom:12, textAlign:'center' }}>
            ${costoPorUnidad} por {unidad}
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Proveedor</label>
          <select className="form-select" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Nota</label>
          <input type="text" className="form-input" value={nota} placeholder="opcional" onChange={e => setNota(e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary btn-sm" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditStockModal({ insumo, onSave, onCancel }) {
  const [stockActual, setStockActual] = useState(insumo.stock_actual ?? '')
  const [stockMinimo, setStockMinimo] = useState(insumo.stock_minimo ?? '')
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24
    }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 320, width: '100%' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-strong)', marginBottom: 16 }}>{insumo.nombre}</div>
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
            El dashboard te avisará cuando baje de este nivel
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

// ─── Histórico PPP por insumo ──────────────────────────────────────
// Calcula la curva del costo unitario en el tiempo desde la tabla compras
function HistoricoPPP({ compras, insumos }) {
  const [insumoSel, setInsumoSel] = useState(null)

  // Solo insumos con al menos 2 compras (para tener línea)
  // Los frascos sí entran al histórico de PPP porque queremos ver cómo evoluciona
  // el costo de cada formato.
  const insumosConHistorial = insumos
    .filter(i => i.nombre !== 'ENVASE')
    .map(i => {
      const cmps = compras
        .filter(c => c.insumo_nombre === i.nombre && c.tipo !== 'activo_fijo' && c.cantidad > 0)
        .map(c => ({
          fecha: c.fecha,
          costo_unitario: c.precio_total / c.cantidad,
          cantidad: c.cantidad,
          precio_total: c.precio_total,
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))

      // Variación entre primera y última compra
      const variacion = cmps.length >= 2
        ? (cmps[cmps.length - 1].costo_unitario - cmps[0].costo_unitario) / cmps[0].costo_unitario
        : 0

      // Variación entre las dos últimas (para alertar subidas recientes)
      const variacionReciente = cmps.length >= 2
        ? (cmps[cmps.length - 1].costo_unitario - cmps[cmps.length - 2].costo_unitario) / cmps[cmps.length - 2].costo_unitario
        : 0

      return {
        nombre: i.nombre,
        unidad: i.unidad,
        compras: cmps,
        ppp_actual: i.costo_ppp,
        variacion,
        variacionReciente,
      }
    })
    .filter(x => x.compras.length > 0)
    .sort((a, b) => Math.abs(b.variacionReciente) - Math.abs(a.variacionReciente))

  if (insumosConHistorial.length === 0) {
    return (
      <div className="card" style={{ textAlign:'center', padding:32 }}>
        <div style={{ color:'var(--muted)', fontSize:14, marginBottom:6 }}>Sin histórico aún</div>
        <div style={{ color:'var(--muted)', fontSize:12 }}>Registra compras para ver cómo varían los precios.</div>
      </div>
    )
  }

  // Detalle de un insumo seleccionado
  if (insumoSel) {
    const ins = insumosConHistorial.find(x => x.nombre === insumoSel)
    if (!ins) { setInsumoSel(null); return null }
    const min = Math.min(...ins.compras.map(c => c.costo_unitario))
    const max = Math.max(...ins.compras.map(c => c.costo_unitario))
    const range = max - min || 1

    return (
      <div>
        <button className="btn btn-secondary btn-sm" onClick={() => setInsumoSel(null)} style={{ marginBottom:12 }}>
          ← Volver
        </button>

        <div className="card">
          <div style={{ fontFamily:'Orbitron', fontSize:15, color:'var(--cyan)', marginBottom:4 }}>{ins.nombre}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>
            {ins.compras.length} compras · variación total {(ins.variacion * 100).toFixed(1)}%
          </div>

          {/* Mini-curva visual */}
          <div style={{ height:80, position:'relative', background:'rgba(255,255,255,0.02)', borderRadius:8, padding:10, marginBottom:14 }}>
            <svg viewBox={`0 0 ${ins.compras.length * 40} 60`} preserveAspectRatio="none"
              style={{ width:'100%', height:'100%' }}>
              <polyline
                fill="none"
                stroke="var(--cyan)"
                strokeWidth="2"
                points={ins.compras.map((c, i) => {
                  const x = i * 40 + 20
                  const y = 60 - ((c.costo_unitario - min) / range) * 50 - 5
                  return `${x},${y}`
                }).join(' ')}
              />
              {ins.compras.map((c, i) => {
                const x = i * 40 + 20
                const y = 60 - ((c.costo_unitario - min) / range) * 50 - 5
                return <circle key={i} cx={x} cy={y} r="3" fill="var(--cyan)" />
              })}
            </svg>
          </div>

          {/* Lista detallada */}
          {ins.compras.slice().reverse().map((c, i, arr) => {
            const prev = i < arr.length - 1 ? arr[i + 1] : null
            const delta = prev ? (c.costo_unitario - prev.costo_unitario) / prev.costo_unitario : 0
            const color = delta > 0.10 ? 'var(--pink)' : delta < -0.05 ? 'var(--green)' : 'var(--muted)'
            return (
              <div className="list-item" key={i}>
                <div>
                  <div className="list-item-name" style={{ fontSize:14 }}>{c.fecha}</div>
                  <div className="list-item-sub">
                    {c.cantidad} {ins.unidad} · {formatCLP(c.precio_total)}
                  </div>
                </div>
                <div className="list-item-right">
                  <div className="list-item-value">${c.costo_unitario.toFixed(2)}/{ins.unidad}</div>
                  {prev && (
                    <div style={{ fontSize:11, color, fontWeight:600 }}>
                      {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Listado general
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
        Cómo cambió el costo de cada insumo. Toca uno para ver el detalle. Los rojos subieron en la última compra.
      </div>
      <div className="card">
        {insumosConHistorial.map(ins => {
          const colorReciente = ins.variacionReciente > 0.10 ? 'var(--pink)'
            : ins.variacionReciente > 0 ? '#f59e0b'
            : ins.variacionReciente < -0.05 ? 'var(--green)'
            : 'var(--muted)'
          return (
            <div className="list-item" key={ins.nombre}
              onClick={() => setInsumoSel(ins.nombre)}
              style={{ cursor:'pointer' }}>
              <div>
                <div className="list-item-name">{ins.nombre}</div>
                <div className="list-item-sub">
                  {ins.compras.length} compras · actual ${parseFloat(ins.ppp_actual || 0).toFixed(2)}/{ins.unidad}
                </div>
              </div>
              <div className="list-item-right">
                {ins.compras.length >= 2 ? (
                  <>
                    <div style={{ fontSize:13, fontWeight:700, color: colorReciente }}>
                      {ins.variacionReciente >= 0 ? '+' : ''}{(ins.variacionReciente * 100).toFixed(1)}%
                    </div>
                    <div className="list-item-muted">última compra</div>
                  </>
                ) : (
                  <div className="list-item-muted">solo 1 compra</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Compras() {
  const [insumos, setInsumos] = useState([])
  const [compras, setCompras] = useState([])
  const [proveedores, setProveedores] = useState([])
  const fechaHoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
  const [form, setForm] = useState({ fecha: '', insumo_nombre: '', unidad: 'ml', cantidad: '', precio_total: '', proveedor_id: '', nota: '' })
  const [limonEnKg, setLimonEnKg] = useState(false) // toggle para ingresar limón/naranja en kg bruto
  const LIMON_ML_POR_KG = 120 // rendimiento: ~120ml jugo exprimido por kg de limón sutil bruto
  const NARANJA_ML_POR_KG = 400 // rendimiento: ~400ml jugo exprimido por kg de naranja bruta
  const esLimon = form.insumo_nombre === 'Jugo limón'
  const esNaranja = form.insumo_nombre === 'Jugo naranja'
  const esCitrico = esLimon || esNaranja
  const citricoMlPorKg = esNaranja ? NARANJA_ML_POR_KG : LIMON_ML_POR_KG
  const limonMlCalculado = limonEnKg && form.cantidad ? Math.round(parseFloat(form.cantidad) * citricoMlPorKg) : null
  const [esActivo, setEsActivo] = useState(false)
  const [activoForm, setActivoForm] = useState({ fecha: '', descripcion: '', precio: '', nota: '' })
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('registrar')
  const [confirmar, setConfirmar] = useState(null)
  const [editandoStock, setEditandoStock] = useState(null)
  const [editandoCompra, setEditandoCompra] = useState(null)
  const [editandoProveedor, setEditandoProveedor] = useState(null) // null | 'nuevo' | proveedor
  const [confirmarProveedor, setConfirmarProveedor] = useState(null)
  const [fabricandoGoma, setFabricandoGoma] = useState(false)
  const [mlGoma, setMlGoma] = useState('')

  // ── Frascos: detecta si el insumo seleccionado es un frasco ────────────────
  // y permite mostrar un banner aclaratorio sobre el formato.
  const esFrasco = form.insumo_nombre?.startsWith('Frascos ')
  const formatoFrasco = esFrasco ? form.insumo_nombre.replace('Frascos ', '') : null

  useEffect(() => {
    const hoy = fechaHoy()
    setForm(f => ({ ...f, fecha: hoy }))
    setActivoForm(f => ({ ...f, fecha: hoy }))
    loadData()
  }, [])

  async function loadData() {
    const [{ data: ins }, { data: cmp }, { data: prov }] = await Promise.all([
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('compras').select('*').order('fecha', { ascending: false }),
      supabase.from('proveedores').select('*').order('nombre'),
    ])
    setInsumos(ins || [])
    setCompras(cmp || [])
    setProveedores(prov || [])
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleSelectInsumo = (nombre) => {
    const ins = insumos.find(i => i.nombre === nombre)
    setForm(f => ({ ...f, insumo_nombre: nombre, unidad: ins?.unidad || 'ml', cantidad: '', precio_total: '' }))
    if (nombre !== 'Jugo limón' && nombre !== 'Jugo naranja') setLimonEnKg(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.insumo_nombre || !form.cantidad || !form.precio_total) return
    setLoading(true)

    // Para limón/naranja ingresado en kg: guardamos la cantidad convertida a ml
    const cantidadFinal = esCitrico && limonEnKg && limonMlCalculado
      ? limonMlCalculado
      : parseFloat(form.cantidad)
    const unidadFinal = esCitrico ? 'ml' : form.unidad
    const notaFinal = esCitrico && limonEnKg && form.cantidad
      ? `${parseFloat(form.cantidad).toFixed(2)}kg bruto → ${limonMlCalculado}ml exprimido${form.nota ? ' · ' + form.nota : ''}`
      : form.nota || null

    const { error } = await supabase.from('compras').insert({
      fecha: form.fecha,
      insumo_nombre: form.insumo_nombre,
      unidad: unidadFinal,
      cantidad: cantidadFinal,
      precio_total: parseFloat(form.precio_total),
      proveedor_id: form.proveedor_id || null,
      nota: notaFinal,
      es_inversion: false,
      tipo: 'insumo',
    })
    if (!error) {
      const toastMsg = esCitrico && limonEnKg
        ? `Compra registrada · ${limonMlCalculado}ml ${esNaranja ? 'naranja' : 'limón'} · PPP actualizado`
        : 'Compra registrada · PPP actualizado'
      showToast(toastMsg)
      setForm(f => ({ ...f, insumo_nombre: '', cantidad: '', precio_total: '', proveedor_id: '', nota: '' }))
      setLimonEnKg(false)
      loadData()
    }
    setLoading(false)
  }

  const handleDeleteProveedor = async (prov) => {
    await supabase.from('proveedores').delete().eq('id', prov.id)
    setConfirmarProveedor(null)
    showToast('Proveedor eliminado')
    loadData()
  }

  const handleSubmitActivo = async (e) => {
    e.preventDefault()
    if (!activoForm.descripcion || !activoForm.precio) return
    setLoading(true)
    const { error } = await supabase.from('compras').insert({
      fecha: activoForm.fecha,
      insumo_nombre: activoForm.descripcion,
      unidad: 'unidad',
      cantidad: 1,
      precio_total: parseFloat(activoForm.precio),
      nota: activoForm.nota || null,
      es_inversion: false,
      tipo: 'activo_fijo',
    })
    if (!error) {
      showToast('Activo fijo registrado ✓')
      setActivoForm(f => ({ ...f, descripcion: '', precio: '', nota: '' }))
      loadData()
    }
    setLoading(false)
  }

  const handleEliminar = async (id) => {
    await supabase.from('compras').delete().eq('id', id)
    showToast('Compra eliminada · PPP recalculado')
    setConfirmar(null)
    loadData()
  }

  const handleSaveStock = async (nombre, stockActual, stockMinimo) => {
    await supabase.from('insumos').update({ stock_actual: stockActual, stock_minimo: stockMinimo }).eq('nombre', nombre)
    setEditandoStock(null)
    showToast('Stock actualizado')
    loadData()
  }

  // Proporción: 1000g azúcar → 1500ml goma
  const GOMA_POR_KG = 1500 // ml de goma por 1000g de azúcar
  const azucarParaGoma = mlGoma ? Math.round((parseFloat(mlGoma) / GOMA_POR_KG) * 1000) : 0

  const handleFabricarGoma = async () => {
    if (!mlGoma || parseFloat(mlGoma) <= 0) return
    const azucar = insumos.find(i => i.nombre === 'Azúcar')
    const goma = insumos.find(i => i.nombre === 'Goma')
    if (!azucar || !goma) { showToast('No se encontró Azúcar o Goma en insumos'); return }
    setLoading(true)
    await Promise.all([
      supabase.from('insumos').update({ stock_actual: Math.max(0, (azucar.stock_actual || 0) - azucarParaGoma) }).eq('nombre', 'Azúcar'),
      supabase.from('insumos').update({ stock_actual: (goma.stock_actual || 0) + parseFloat(mlGoma) }).eq('nombre', 'Goma'),
    ])
    showToast(`Goma fabricada ✓ · -${azucarParaGoma}g azúcar · +${mlGoma}ml goma`)
    setFabricandoGoma(false)
    setMlGoma('')
    loadData()
    setLoading(false)
  }

  const costoPorUnidad = form.cantidad && form.precio_total
    ? esCitrico && limonEnKg && limonMlCalculado
      ? (parseFloat(form.precio_total) / limonMlCalculado).toFixed(2)
      : (parseFloat(form.precio_total) / parseFloat(form.cantidad)).toFixed(2)
    : null

  const getEstadoStock = (ins) => {
    if (ins.stock_actual == null) return 'sin_datos'
    if (ins.stock_minimo != null && ins.stock_actual <= ins.stock_minimo) return 'critico'
    if (ins.stock_minimo != null && ins.stock_actual <= ins.stock_minimo * 1.5) return 'bajo'
    return 'ok'
  }
  const estadoColor = { ok: 'var(--green)', bajo: '#f59e0b', critico: 'var(--pink)', sin_datos: 'var(--muted)' }
  const estadoLabel = { ok: 'OK', bajo: 'Bajo', critico: 'Crítico', sin_datos: '—' }

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {confirmar && (
        <ConfirmModal
          mensaje={`¿Eliminar compra de ${confirmar.insumo_nombre} (${formatCLP(confirmar.precio_total)})?`}
          onConfirm={() => handleEliminar(confirmar.id)}
          onCancel={() => setConfirmar(null)}
        />
      )}
      {editandoStock && (
        <EditStockModal
          insumo={editandoStock}
          onSave={handleSaveStock}
          onCancel={() => setEditandoStock(null)}
        />
      )}
      {editandoCompra && (
        <EditCompraModal
          compra={editandoCompra}
          insumos={insumos}
          proveedores={proveedores}
          onSave={() => { setEditandoCompra(null); showToast('Compra actualizada ✓'); loadData() }}
          onCancel={() => setEditandoCompra(null)}
        />
      )}
      {editandoProveedor && (
        <ProveedorModal
          proveedor={editandoProveedor === 'nuevo' ? null : editandoProveedor}
          onSave={() => {
            const fueNuevo = editandoProveedor === 'nuevo'
            setEditandoProveedor(null)
            showToast(fueNuevo ? 'Proveedor creado ✓' : 'Proveedor actualizado ✓')
            loadData()
          }}
          onCancel={() => setEditandoProveedor(null)}
        />
      )}
      {confirmarProveedor && (
        <ConfirmModal
          mensaje={`¿Eliminar proveedor "${confirmarProveedor.nombre}"? Las compras asociadas no se borran.`}
          onConfirm={() => handleDeleteProveedor(confirmarProveedor)}
          onCancel={() => setConfirmarProveedor(null)}
        />
      )}
      <div className="page-title">Compras</div>

      <div className="toggle-row">
        <button className={`toggle-btn ${tab === 'registrar' ? 'active-entrada' : ''}`} onClick={() => setTab('registrar')}>Registrar</button>
        <button className={`toggle-btn ${tab === 'ppp' ? 'active-entrada' : ''}`} onClick={() => setTab('ppp')}>PPP</button>
        <button className={`toggle-btn ${tab === 'historico' ? 'active-entrada' : ''}`} onClick={() => setTab('historico')}>Histórico</button>
        <button className={`toggle-btn ${tab === 'proveedores' ? 'active-entrada' : ''}`} onClick={() => setTab('proveedores')}>Proveedores</button>
        <button className={`toggle-btn ${tab === 'stock' ? 'active-entrada' : ''}`} onClick={() => setTab('stock')}>Stock</button>
      </div>

      {tab === 'registrar' && (
        <div>
          {/* Selector tipo */}
          <div className="toggle-row" style={{ marginBottom: 12 }}>
            <button className={`toggle-btn ${!esActivo ? 'active-entrada' : ''}`} onClick={() => setEsActivo(false)}>🧪 Insumo</button>
            <button className={`toggle-btn ${esActivo ? 'active-entrada' : ''}`} onClick={() => setEsActivo(true)}>🔧 Activo fijo</button>
          </div>

          {/* Formulario insumo */}
          {!esActivo && (
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
                {/* Banner Frascos: aclara formato y permite cambio rápido */}
                {esFrasco && (
                  <div style={{ background: 'rgba(0,180,180,0.06)', border: '1px solid rgba(0,180,180,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600, marginBottom: 8 }}>
                      🫙 Formato del frasco
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button"
                        onClick={() => handleSelectInsumo('Frascos 1lt')}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: formatoFrasco === '1lt' ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                          color: formatoFrasco === '1lt' ? '#000' : 'var(--muted)' }}>
                        1 litro
                      </button>
                      <button type="button"
                        onClick={() => handleSelectInsumo('Frascos 475ml')}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: formatoFrasco === '475ml' ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                          color: formatoFrasco === '475ml' ? '#000' : 'var(--muted)' }}>
                        475 ml
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                      Cada formato lleva su propio PPP y stock. Las recetas eligen qué frasco usan.
                    </div>
                  </div>
                )}

                {/* Toggle kg/ml para Jugo limón y Jugo naranja */}
                {esCitrico && (
                  <div style={{ background: 'rgba(0,180,180,0.06)', border: '1px solid rgba(0,180,180,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600, marginBottom: 8 }}>
                      {esNaranja ? '🍊 Naranja' : '🍋 Limón'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: limonEnKg ? 8 : 0 }}>
                      <button type="button"
                        onClick={() => setLimonEnKg(false)}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: !limonEnKg ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                          color: !limonEnKg ? '#000' : 'var(--muted)' }}>
                        ml exprimido
                      </button>
                      <button type="button"
                        onClick={() => setLimonEnKg(true)}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          background: limonEnKg ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                          color: limonEnKg ? '#000' : 'var(--muted)' }}>
                        kg bruto (malla)
                      </button>
                    </div>
                    {limonEnKg && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                        Factor: ~{citricoMlPorKg}ml exprimido por kg · La app guarda en ml automáticamente.
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">
                      {esCitrico && limonEnKg ? 'Cantidad (kg bruto)' : `Cantidad (${form.unidad})`}
                    </label>
                    <input type="number" step="any" className="form-input" value={form.cantidad}
                      placeholder={esCitrico && limonEnKg ? 'ej: 10' : 'ej: 1000'}
                      onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Precio total ($)</label>
                    <input type="number" className="form-input" value={form.precio_total}
                      placeholder="ej: 4990"
                      onChange={e => setForm(f => ({ ...f, precio_total: e.target.value }))} />
                  </div>
                </div>

                {/* Conversión kg→ml en tiempo real */}
                {esCitrico && limonEnKg && limonMlCalculado && (
                  <div style={{ background: 'rgba(0,180,180,0.08)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)' }}>{parseFloat(form.cantidad).toFixed(2)} kg → </span>
                    <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>~{limonMlCalculado} ml exprimido</span>
                  </div>
                )}

                {costoPorUnidad && (
                  <div style={{ color: 'var(--cyan)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                    ${costoPorUnidad} por {esCitrico && limonEnKg ? 'ml (ya convertido)' : form.unidad}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Proveedor — opcional</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <select className="form-select" value={form.proveedor_id} style={{ flex:1 }}
                      onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}>
                      <option value="">Sin proveedor</option>
                      {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                    <button type="button" onClick={() => setEditandoProveedor('nuevo')}
                      style={{ background:'rgba(0,180,180,0.08)', border:'1px solid rgba(0,180,180,0.3)', borderRadius:8, color:'var(--cyan)', padding:'0 14px', cursor:'pointer', fontSize:18, fontWeight:700 }}
                      title="Nuevo proveedor">+</button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Nota — opcional</label>
                  <input type="text" className="form-input" value={form.nota}
                    placeholder="ej: oferta, comentario..."
                    onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Guardando...' : 'Registrar compra'}
                </button>
              </div>
            </form>
          )}

          {/* Formulario activo fijo */}
          {esActivo && (
            <form onSubmit={handleSubmitActivo}>
              <div className="card" style={{ border: '1px solid rgba(0,180,180,0.25)' }}>
                <div style={{ fontSize: 12, color: 'var(--cyan)', marginBottom: 12, lineHeight: 1.5 }}>
                  Los activos fijos (equipos, utensilios, mobiliario) se registran aparte de los insumos y no afectan el margen operativo.
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input type="date" className="form-input" value={activoForm.fecha}
                    onChange={e => setActivoForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <input type="text" className="form-input" value={activoForm.descripcion}
                    placeholder="ej: Licuadora Oster, Frascos × 50..."
                    onChange={e => setActivoForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Precio ($)</label>
                  <input type="number" className="form-input" value={activoForm.precio}
                    placeholder="ej: 45990"
                    onChange={e => setActivoForm(f => ({ ...f, precio: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nota — opcional</label>
                  <input type="text" className="form-input" value={activoForm.nota}
                    placeholder="ej: Ripley, garantía 1 año..."
                    onChange={e => setActivoForm(f => ({ ...f, nota: e.target.value }))} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Guardando...' : 'Registrar activo fijo'}
                </button>
              </div>
            </form>
          )}

          {/* Historial unificado */}
          <div className="section-divider">Historial ({compras.length})</div>
          <div className="card">
            {compras.map(c => {
              const esAF = c.tipo === 'activo_fijo'
              const esCT = c.tipo === 'capital_trabajo' || c.es_inversion
              return (
                <div className="list-item" key={c.id} style={{ gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="list-item-name">{c.insumo_nombre}</div>
                      {esAF && <span style={{ fontSize: 10, background: 'rgba(0,180,180,0.15)', color: 'var(--cyan)', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>ACTIVO</span>}
                      {esCT && !esAF && <span style={{ fontSize: 10, background: 'rgba(196,0,90,0.12)', color: 'var(--pink)', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>INV</span>}
                    </div>
                    <div className="list-item-sub">{c.fecha}{!esAF ? ` · ${c.cantidad} ${c.unidad}` : ''}</div>
                    {c.nota && <div className="list-item-sub" style={{ color: 'var(--muted)' }}>{c.nota}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="list-item-right">
                      <div className="list-item-value">{formatCLP(c.precio_total)}</div>
                      {!esAF && c.cantidad > 0 && <div className="list-item-muted">${(c.precio_total / c.cantidad).toFixed(2)}/{c.unidad}</div>}
                    </div>
                    {!esAF && (
                      <button onClick={() => setEditandoCompra(c)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cyan)', padding: 4 }}
                        title="Editar">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    )}
                    <button onClick={() => setConfirmar(c)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
                      title="Eliminar">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'ppp' && (
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

      {tab === 'historico' && (
        <HistoricoPPP compras={compras} insumos={insumos} />
      )}

      {tab === 'proveedores' && (
        <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, flex:1 }}>
              Registra a quién le compras. Útil para acordarte de contactos y comparar precios.
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setEditandoProveedor('nuevo')}
              style={{ marginLeft:10 }}>+ Nuevo</button>
          </div>

          {proveedores.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:32 }}>
              <div style={{ color:'var(--muted)', fontSize:14, marginBottom:6 }}>Sin proveedores registrados</div>
              <div style={{ color:'var(--muted)', fontSize:12 }}>Toca "Nuevo" para agregar el primero.</div>
            </div>
          ) : (
            <div className="card">
              {proveedores.map(p => {
                const comprasProv = compras.filter(c => c.proveedor_id === p.id)
                const totalGastado = comprasProv.reduce((s, c) => s + (c.precio_total || 0), 0)
                return (
                  <div className="list-item" key={p.id}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <div className="list-item-name">{p.nombre}</div>
                        {p.rating > 0 && (
                          <div style={{ fontSize:11, color:'#f59e0b' }}>
                            {'★'.repeat(p.rating)}<span style={{ color:'rgba(255,255,255,0.15)' }}>{'★'.repeat(5 - p.rating)}</span>
                          </div>
                        )}
                      </div>
                      <div className="list-item-sub">
                        {p.contacto || '—'} · {comprasProv.length} compra{comprasProv.length !== 1 ? 's' : ''}
                      </div>
                      {p.nota && <div className="list-item-sub" style={{ color:'var(--muted)', fontStyle:'italic' }}>{p.nota}</div>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {totalGastado > 0 && (
                        <div className="list-item-right">
                          <div className="list-item-value" style={{ fontSize:13 }}>{formatCLP(totalGastado)}</div>
                          <div className="list-item-muted">acumulado</div>
                        </div>
                      )}
                      <button onClick={() => setEditandoProveedor(p)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--cyan)', padding:4 }}
                        title="Editar">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button onClick={() => setConfirmarProveedor(p)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}
                        title="Eliminar">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'stock' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
            Toca un insumo para actualizar su stock o configurar la alerta mínima.
            Las compras suman automáticamente al stock.
          </div>

          {/* Banner corrección limón */}
          {insumos.find(i => i.nombre === 'Jugo limón') && (() => {
            const limon = insumos.find(i => i.nombre === 'Jugo limón')
            return (
              <div style={{ background: 'rgba(196,0,90,0.07)', border: '1px solid rgba(196,0,90,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--pink)', marginBottom: 4 }}>🍋 Jugo limón — verificar stock</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
                  Stock actual: <strong style={{ color: 'var(--text)' }}>{limon.stock_actual != null ? `${limon.stock_actual} ml` : 'sin datos'}</strong>
                  {' '}· Las compras en kg se convierten a ml automáticamente (120ml/kg).
                </div>
                <button
                  onClick={() => setEditandoStock(limon)}
                  style={{ background: 'rgba(196,0,90,0.15)', border: '1px solid rgba(196,0,90,0.35)', borderRadius: 8, padding: '5px 14px', color: 'var(--pink)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Corregir stock
                </button>
              </div>
            )
          })()}

          {/* Botón fabricar goma */}
          <button
            onClick={() => setFabricandoGoma(true)}
            style={{ width: '100%', background: 'rgba(0,180,180,0.08)', border: '1px solid rgba(0,180,180,0.3)', borderRadius: 10, padding: '10px 0', color: 'var(--cyan)', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            🧪 Fabricar goma
          </button>

          {/* Modal fabricar goma */}
          {fabricandoGoma && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 320, width: '100%' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-strong)', marginBottom: 4 }}>🧪 Fabricar goma</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                  Proporción: 1000g azúcar → 1500ml goma
                </div>
                <div className="form-group">
                  <label className="form-label">¿Cuántos ml de goma vas a fabricar?</label>
                  <input type="number" className="form-input" value={mlGoma}
                    placeholder="ej: 1500"
                    onChange={e => setMlGoma(e.target.value)} />
                </div>
                {azucarParaGoma > 0 && (
                  <div style={{ background: 'rgba(0,180,180,0.06)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13 }}>
                    <div style={{ color: 'var(--pink)' }}>Se rebajarán <strong>{azucarParaGoma}g</strong> de azúcar</div>
                    <div style={{ color: 'var(--green)', marginTop: 4 }}>Se sumarán <strong>{mlGoma}ml</strong> de goma</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => { setFabricandoGoma(false); setMlGoma('') }}>Cancelar</button>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={loading || !mlGoma} onClick={handleFabricarGoma}>
                    {loading ? 'Guardando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="card">
            {insumos.map(ins => {
              const estado = getEstadoStock(ins)
              return (
                <div className="list-item" key={ins.nombre}
                  onClick={() => setEditandoStock(ins)}
                  style={{ cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div className="list-item-name">{ins.nombre}</div>
                    <div className="list-item-sub">
                      {ins.stock_actual != null ? `${ins.stock_actual} ${ins.unidad}` : `Sin datos · ${ins.unidad}`}
                      {ins.stock_minimo != null && ` · Mín: ${ins.stock_minimo}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: estadoColor[estado], textTransform: 'uppercase' }}>
                      {estadoLabel[estado]}
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: estadoColor[estado] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
