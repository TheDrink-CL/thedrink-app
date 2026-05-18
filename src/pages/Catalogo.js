import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularCostoReceta, formatCLP, formatPct } from '../lib/calculos'

// ─── Helpers ────────────────────────────────────────────────────────────────

function margenColor(pct) {
  if (pct >= 0.65) return 'var(--green)'
  if (pct >= 0.50) return 'var(--cyan)'
  return 'var(--pink)'
}

// ─── Modal confirmación genérico ─────────────────────────────────────────────

function ConfirmModal({ titulo, mensaje, confirmLabel = 'Eliminar', onConfirm, onCancel, peligro = true }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 220, padding: 24
    }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 340, width: '100%' }}>
        {titulo && <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-strong)', marginBottom: 8 }}>{titulo}</div>}
        <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 18, lineHeight: 1.5 }}>{mensaje}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary btn-sm"
            style={{ flex: 1, background: peligro ? 'var(--pink)' : undefined }}
            onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: crear receta nueva (nombre + formato) ────────────────────────────
// Pide solo lo mínimo para crear el registro. El resto (precio, ingredientes)
// se completa en el EditRecetaModal que se abre inmediatamente después.

function NuevaRecetaModal({ recetasExistentes, onCreate, onCancel }) {
  const [nombre, setNombre] = useState('')
  const [formato, setFormato] = useState('1lt')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const nombreTrim = nombre.trim()
  const nombreDuplicado = nombreTrim &&
    recetasExistentes.some(r => r.nombre.toLowerCase() === nombreTrim.toLowerCase())

  const handleCreate = async () => {
    if (!nombreTrim) { setError('El nombre es obligatorio'); return }
    if (nombreDuplicado) { setError('Ya existe una receta con ese nombre'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('recetas').insert({
      nombre: nombreTrim,
      envase_formato: formato,
      precio_venta: 9000,  // valor por defecto editable después
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreate(nombreTrim)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:400, width:'100%' }}>
        <div style={{ fontFamily:'Orbitron', fontSize:16, color:'var(--cyan)', marginBottom:18 }}>
          Nueva receta
        </div>

        <div className="form-group">
          <label className="form-label">Nombre del trago</label>
          <input type="text" className="form-input" value={nombre} autoFocus
            placeholder="ej: Pisco Sour, Gin Tropical..."
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nombreTrim && !nombreDuplicado) handleCreate() }} />
          {nombreDuplicado && (
            <div style={{ color:'var(--pink)', fontSize:12, marginTop:4 }}>
              Ya existe una receta con ese nombre
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Formato de envase</label>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button"
              onClick={() => setFormato('1lt')}
              style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                background: formato === '1lt' ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                color: formato === '1lt' ? '#000' : 'var(--muted)' }}>
              Frasco 1lt
            </button>
            <button type="button"
              onClick={() => setFormato('475ml')}
              style={{ flex:1, padding:'10px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                background: formato === '475ml' ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                color: formato === '475ml' ? '#000' : 'var(--muted)' }}>
              Frasco 475ml
            </button>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, lineHeight:1.4 }}>
            Lo puedes cambiar más adelante desde la pantalla de edición.
          </div>
        </div>

        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }}
            onClick={handleCreate}
            disabled={saving || !nombreTrim || nombreDuplicado}>
            {saving ? 'Creando...' : 'Crear y editar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal edición de receta ─────────────────────────────────────────────────

function EditRecetaModal({ receta, ingredientes, insumos, config, onSave, onCancel }) {
  const [precio, setPrecio] = useState(receta.precio_venta || 9000)
  const [envaseFormato, setEnvaseFormato] = useState(receta.envase_formato || '1lt')
  const [ings, setIngs] = useState(
    ingredientes
      .filter(i => i.insumo_nombre !== 'ENVASE')
      .map(i => ({ ...i }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateIng = (idx, campo, valor) =>
    setIngs(prev => prev.map((it, i) => i !== idx ? it : { ...it, [campo]: valor }))

  const quitarIng = (idx) => setIngs(prev => prev.filter((_, i) => i !== idx))

  const agregarIng = () =>
    setIngs(prev => [...prev, { receta_nombre: receta.nombre, insumo_nombre: '', cantidad: 0, unidad: 'ml' }])

  const costo = calcularCostoReceta(
    ings.filter(i => i.insumo_nombre),
    insumos,
    config.merma_pct,
    { envase_formato: envaseFormato, costoLegacy: config.costo_envase }
  )
  const margen = precio > 0 ? (precio - costo) / precio : 0

  // Detecta si la lista de ingredientes cambió respecto del original
  const ingredientesCambiaron = () => {
    const originales = ingredientes.filter(i => i.insumo_nombre !== 'ENVASE')
    if (originales.length !== ings.length) return true
    // Comparar ordenado por insumo_nombre para evitar falsos positivos por reordenamiento
    const sortKey = (a, b) => (a.insumo_nombre || '').localeCompare(b.insumo_nombre || '')
    const orig = [...originales].sort(sortKey)
    const nuev = [...ings].sort(sortKey)
    for (let i = 0; i < orig.length; i++) {
      if (orig[i].insumo_nombre !== nuev[i].insumo_nombre) return true
      if (parseFloat(orig[i].cantidad) !== parseFloat(nuev[i].cantidad)) return true
      if ((orig[i].unidad || 'ml') !== (nuev[i].unidad || 'ml')) return true
    }
    return false
  }

  const handleSave = async () => {
    const ingsValidos = ings.filter(i => i.insumo_nombre && parseFloat(i.cantidad) > 0)
    if (ingsValidos.length === 0) { setError('Agrega al menos un ingrediente válido'); return }
    setSaving(true)
    setError('')

    // ── 1. Actualizar precio_venta en receta ───────────────────────────────
    const precioNum = parseFloat(precio) || 9000
    const matchCol = receta.id ? 'id' : 'nombre'
    const matchVal = receta.id || receta.nombre
    const updatePayload = { precio_venta: precioNum, envase_formato: envaseFormato }
    const { data: updated, error: errPrecio } = await supabase
      .from('recetas')
      .update(updatePayload)
      .eq(matchCol, matchVal)
      .select()  // ← devuelve filas afectadas para confirmar el update
    if (errPrecio) {
      setError('Error actualizando receta: ' + errPrecio.message)
      setSaving(false); return
    }
    if (!updated || updated.length === 0) {
      // Caso típico: el update no encontró la receta por ese match.
      // Probamos un fallback por nombre antes de rendirnos.
      const { data: retry, error: errRetry } = await supabase
        .from('recetas')
        .update(updatePayload)
        .eq('nombre', receta.nombre)
        .select()
      if (errRetry || !retry || retry.length === 0) {
        setError('No se pudo actualizar la receta. Verifica que "' + receta.nombre + '" exista en Supabase.')
        setSaving(false); return
      }
    }

    // ── 2. Solo regenerar ingredientes si cambiaron ────────────────────────
    if (ingredientesCambiaron()) {
      const { error: errDel } = await supabase
        .from('receta_ingredientes')
        .delete()
        .eq('receta_nombre', receta.nombre)
      if (errDel) {
        setError('Error eliminando ingredientes: ' + errDel.message)
        setSaving(false); return
      }

      const { error: errIng } = await supabase.from('receta_ingredientes').insert(
        ingsValidos.map(i => ({
          receta_nombre: receta.nombre,
          insumo_nombre: i.insumo_nombre,
          cantidad: parseFloat(i.cantidad) || 0,
          unidad: i.unidad || 'ml',
        }))
      )
      if (errIng) {
        setError('Error guardando ingredientes: ' + errIng.message)
        setSaving(false); return
      }
    }

    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.78)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:200, padding:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:500, width:'100%', marginTop:20 }}>
        <div style={{ fontFamily:'Orbitron', fontSize:16, color:'var(--cyan)', marginBottom:18 }}>{receta.nombre}</div>

        {/* Precio de venta */}
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Precio de venta ($)</label>
          <input type="number" className="form-input" value={precio}
            onChange={e => setPrecio(e.target.value)} />
        </div>

        {/* Formato de envase */}
        <div className="form-group" style={{ marginBottom:16 }}>
          <label className="form-label">Formato de envase</label>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button"
              onClick={() => setEnvaseFormato('1lt')}
              style={{ flex:1, padding:'8px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                background: envaseFormato === '1lt' ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                color: envaseFormato === '1lt' ? '#000' : 'var(--muted)' }}>
              Frasco 1lt
            </button>
            <button type="button"
              onClick={() => setEnvaseFormato('475ml')}
              style={{ flex:1, padding:'8px 0', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                background: envaseFormato === '475ml' ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                color: envaseFormato === '475ml' ? '#000' : 'var(--muted)' }}>
              Frasco 475ml
            </button>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, lineHeight:1.4 }}>
            Define qué frasco usa esta receta. El costo del envase se calcula desde el PPP del insumo correspondiente.
          </div>
        </div>

        {/* Resumen costo/margen en tiempo real */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16, background:'rgba(255,255,255,0.03)', borderRadius:10, padding:12 }}>
          <div style={{ textAlign:'center' }}>
            <div className="kpi-label">Costo/L</div>
            <div style={{ color:'var(--pink)', fontWeight:700, fontSize:15 }}>{formatCLP(costo)}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div className="kpi-label">Margen $</div>
            <div style={{ color:'var(--cyan)', fontWeight:700, fontSize:15 }}>{formatCLP(precio - costo)}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div className="kpi-label">Margen %</div>
            <div style={{ color: margenColor(margen), fontWeight:700, fontSize:15 }}>{formatPct(margen)}</div>
          </div>
        </div>

        {/* Ingredientes */}
        <div style={{ fontSize:12, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:10 }}>
          Ingredientes por litro
        </div>

        {ings.map((ing, idx) => (
          <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 80px 60px 28px', gap:6, marginBottom:6, alignItems:'center' }}>
            <select className="form-select" value={ing.insumo_nombre}
              onChange={e => updateIng(idx, 'insumo_nombre', e.target.value)}>
              <option value="">Insumo...</option>
              {insumos.filter(i => i.nombre !== 'ENVASE' && !i.nombre.startsWith('Frascos ')).map(i => (
                <option key={i.nombre} value={i.nombre}>{i.nombre}</option>
              ))}
            </select>
            <input type="number" className="form-input" value={ing.cantidad} placeholder="cant."
              step="0.001" min="0"
              onChange={e => updateIng(idx, 'cantidad', e.target.value)} />
            <select className="form-select" value={ing.unidad || 'ml'}
              onChange={e => updateIng(idx, 'unidad', e.target.value)}>
              <option value="ml">ml</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="L">L</option>
              <option value="unidad">u</option>
            </select>
            <button type="button" onClick={() => quitarIng(idx)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18, lineHeight:1, padding:0 }}>×</button>
          </div>
        ))}

        <button type="button" onClick={agregarIng}
          style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px dashed var(--border)', borderRadius:10, padding:'8px 0', color:'var(--muted)', cursor:'pointer', fontSize:13, marginBottom:14 }}>
          + Agregar ingrediente
        </button>

        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar receta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vista detalle receta (solo lectura) ─────────────────────────────────────

function DetalleReceta({ receta, ingredientes, insumos, config, onEditar, onVolver, onDuplicar, onEliminar }) {
  const ings = ingredientes.filter(i => i.insumo_nombre !== 'ENVASE')
  const formato = receta.envase_formato || '1lt'
  const costo = calcularCostoReceta(ings, insumos, config.merma_pct,
    { envase_formato: formato, costoLegacy: config.costo_envase })
  const precio = receta.precio_venta || 9000
  const margen = precio > 0 ? (precio - costo) / precio : 0
  // Para mostrar la línea "Merma" en el desglose, solo se cuentan los insumos
  // que sí aplican merma (excluye Red Bull y otros marcados con aplica_merma=false).
  const costoInsumosConMerma = ings.reduce((s, ing) => {
    const ins = insumos.find(i => i.nombre.toLowerCase() === ing.insumo_nombre.toLowerCase())
    if (!ins || ins.aplica_merma === false) return s
    return s + (ins.costo_ppp || 0) * ing.cantidad
  }, 0)
  // Costo del envase resuelto desde el PPP del insumo del formato
  const insumoEnvase = insumos.find(
    i => i.nombre.toLowerCase() === (formato === '475ml' ? 'frascos 475ml' : 'frascos 1lt')
  )
  const costoEnvaseShown = insumoEnvase?.costo_ppp > 0
    ? insumoEnvase.costo_ppp
    : config.costo_envase

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:8, flexWrap:'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={onVolver}>← Volver</button>
        <div style={{ display:'flex', gap:6 }}>
          <button
            onClick={onDuplicar}
            title="Duplicar receta"
            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', padding:'6px 10px', cursor:'pointer', fontSize:12, fontWeight:600 }}>
            ⎘ Duplicar
          </button>
          <button
            onClick={onEliminar}
            title="Eliminar receta"
            style={{ background:'rgba(196,0,90,0.08)', border:'1px solid rgba(196,0,90,0.3)', borderRadius:8, color:'var(--pink)', padding:'6px 10px', cursor:'pointer', fontSize:12, fontWeight:600 }}>
            🗑 Eliminar
          </button>
          <button className="btn btn-primary btn-sm" onClick={onEditar}>✏ Editar</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <div style={{ fontFamily:'Orbitron', fontSize:18, color:'var(--cyan)' }}>{receta.nombre}</div>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', background:'rgba(255,255,255,0.05)', padding:'3px 8px', borderRadius:6, letterSpacing:0.5 }}>
            Frasco {formato}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
          <div style={{ textAlign:'center' }}>
            <div className="kpi-label">Costo/L</div>
            <div style={{ color:'var(--pink)', fontWeight:700, fontSize:16 }}>{formatCLP(costo)}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div className="kpi-label">Precio</div>
            <div style={{ color:'var(--cyan)', fontWeight:700, fontSize:16 }}>{formatCLP(precio)}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div className="kpi-label">Margen</div>
            <div style={{ color: margenColor(margen), fontWeight:700, fontSize:16 }}>{formatPct(margen)}</div>
          </div>
        </div>

        <div className="section-divider">Ingredientes por litro</div>
        {ings.length === 0 && (
          <div style={{ color:'var(--muted)', textAlign:'center', padding:12 }}>Sin ingredientes registrados</div>
        )}
        {ings.map(ing => {
          const ins = insumos.find(i => i.nombre.toLowerCase() === ing.insumo_nombre.toLowerCase())
          const costoIng = (ins?.costo_ppp || 0) * ing.cantidad
          const stockOk = ins?.stock_actual == null || ins.stock_actual > ins?.stock_minimo
          return (
            <div className="list-item" key={ing.id || ing.insumo_nombre}>
              <div>
                <div className="list-item-name" style={{ fontSize:14 }}>
                  {ing.insumo_nombre}
                  {!stockOk && <span style={{ marginLeft:6, fontSize:11, color:'var(--pink)' }}>⚠ stock bajo</span>}
                </div>
                <div className="list-item-sub">{ing.cantidad} {ing.unidad}</div>
              </div>
              <div className="list-item-right">
                <div style={{ color:'var(--muted)', fontSize:13 }}>{formatCLP(costoIng)}</div>
              </div>
            </div>
          )
        })}

        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, marginTop:6 }}>
          <div className="list-item">
            <div className="list-item-name" style={{ fontSize:13 }}>Merma ({Math.round(config.merma_pct * 100)}%)</div>
            <div style={{ color:'var(--muted)', fontSize:13 }}>{formatCLP(costoInsumosConMerma * config.merma_pct)}</div>
          </div>
          <div className="list-item">
            <div className="list-item-name" style={{ fontSize:13 }}>Envase ({formato})</div>
            <div style={{ color:'var(--muted)', fontSize:13 }}>{formatCLP(costoEnvaseShown)}</div>
          </div>
          <div className="list-item" style={{ borderTop:'1px solid var(--border)', marginTop:4, paddingTop:8 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>Ganancia por litro</div>
            <div style={{ fontWeight:700, fontSize:14, color: margenColor(margen) }}>{formatCLP(precio - costo)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function Catalogo() {
  const [recetas, setRecetas] = useState([])
  const [insumos, setInsumos] = useState([])
  const [ingredientes, setIngredientes] = useState([])
  const [ventasRecetas, setVentasRecetas] = useState({}) // { receta_nombre: cantidad de ventas }
  const [config, setConfig] = useState({ merma_pct: 0.08, costo_envase: 794.6 })
  const [seleccionada, setSeleccionada] = useState(null)
  const [editando, setEditando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(null) // receta o null
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: i }, { data: ing }, { data: cfg }, { data: vts }] = await Promise.all([
      supabase.from('recetas').select('*').order('nombre'),
      supabase.from('insumos').select('*'),
      supabase.from('receta_ingredientes').select('*'),
      supabase.from('config').select('*'),
      supabase.from('ventas').select('receta_nombre'),
    ])
    setRecetas(r || [])
    setInsumos(i || [])
    setIngredientes(ing || [])
    // Contar ventas por receta para bloquear eliminación si hay histórico
    const conteo = {}
    ;(vts || []).forEach(v => {
      conteo[v.receta_nombre] = (conteo[v.receta_nombre] || 0) + 1
    })
    setVentasRecetas(conteo)
    const c = {}
    cfg?.forEach(x => { c[x.clave] = parseFloat(x.valor) || x.valor })
    setConfig({
      merma_pct: c.merma_pct ?? 0.08,
      costo_envase: c.costo_envase ?? 794.6,
    })
    setLoading(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  // ── Duplicar receta ──────────────────────────────────────────────────────
  // Crea una nueva receta con el sufijo "(copia)" y clona todos los
  // ingredientes. Si ya existe "(copia)", incrementa: "(copia 2)", etc.
  const duplicarReceta = async (recetaOrigen) => {
    let nuevoNombre = `${recetaOrigen.nombre} (copia)`
    let n = 2
    while (recetas.some(r => r.nombre.toLowerCase() === nuevoNombre.toLowerCase())) {
      nuevoNombre = `${recetaOrigen.nombre} (copia ${n++})`
    }
    const { error: errReceta } = await supabase.from('recetas').insert({
      nombre: nuevoNombre,
      envase_formato: recetaOrigen.envase_formato || '1lt',
      precio_venta: recetaOrigen.precio_venta || 9000,
    })
    if (errReceta) { showToast('Error creando duplicado: ' + errReceta.message); return }

    const ingsOrigen = getIngredientes(recetaOrigen.nombre)
      .filter(i => i.insumo_nombre !== 'ENVASE')
    if (ingsOrigen.length > 0) {
      const { error: errIng } = await supabase.from('receta_ingredientes').insert(
        ingsOrigen.map(i => ({
          receta_nombre: nuevoNombre,
          insumo_nombre: i.insumo_nombre,
          cantidad: i.cantidad,
          unidad: i.unidad || 'ml',
        }))
      )
      if (errIng) { showToast('Receta creada pero falló copiar ingredientes: ' + errIng.message); return }
    }
    await load()
    setSeleccionada(nuevoNombre)
    setEditando(true)
    showToast(`Duplicada como "${nuevoNombre}" ✓`)
  }

  // ── Eliminar receta ──────────────────────────────────────────────────────
  // Solo permite borrar si no hay ventas asociadas (preserva histórico).
  // Borra primero los ingredientes (FK lógica por nombre) y después la receta.
  const eliminarReceta = async (receta) => {
    const numVentas = ventasRecetas[receta.nombre] || 0
    if (numVentas > 0) {
      showToast(`No se puede eliminar: tiene ${numVentas} venta(s) asociada(s)`)
      setConfirmEliminar(null)
      return
    }
    const { error: errIng } = await supabase
      .from('receta_ingredientes').delete().eq('receta_nombre', receta.nombre)
    if (errIng) { showToast('Error borrando ingredientes: ' + errIng.message); return }
    const { error: errRec } = await supabase
      .from('recetas').delete().eq('nombre', receta.nombre)
    if (errRec) { showToast('Error borrando receta: ' + errRec.message); return }
    setConfirmEliminar(null)
    setSeleccionada(null)
    await load()
    showToast(`Receta "${receta.nombre}" eliminada ✓`)
  }

  const getIngredientes = (nombre) => ingredientes.filter(i => i.receta_nombre === nombre)

  const getCosto = (nombre) => {
    const ings = getIngredientes(nombre).filter(i => i.insumo_nombre !== 'ENVASE')
    const receta = recetas.find(r => r.nombre === nombre)
    const formato = receta?.envase_formato || '1lt'
    return calcularCostoReceta(ings, insumos, config.merma_pct,
      { envase_formato: formato, costoLegacy: config.costo_envase })
  }

  const getPrecio = (receta) => receta.precio_venta || 9000

  if (loading) return <div className="loading">Cargando recetas...</div>

  const recetasFiltradas = recetas.filter(r => r.nombre !== 'ENVASE')

  // Vista detalle + edición
  if (seleccionada) {
    const receta = recetasFiltradas.find(r => r.nombre === seleccionada)
    if (!receta) { setSeleccionada(null); return null }
    const ings = getIngredientes(seleccionada).filter(i => i.insumo_nombre !== 'ENVASE')

    const numVentas = ventasRecetas[receta.nombre] || 0

    return (
      <div className="page">
        {toast && <div className="toast">{toast}</div>}

        {editando && (
          <EditRecetaModal
            receta={receta}
            ingredientes={ings}
            insumos={insumos}
            config={config}
            onSave={async () => {
              setEditando(false)
              await load()
              showToast('Receta actualizada ✓')
            }}
            onCancel={() => setEditando(false)}
          />
        )}

        {confirmEliminar && (
          <ConfirmModal
            titulo={`Eliminar "${confirmEliminar.nombre}"`}
            mensaje={numVentas > 0
              ? `Esta receta tiene ${numVentas} venta(s) registrada(s) en el histórico. No se puede eliminar sin perder esos datos.`
              : '¿Eliminar definitivamente esta receta y sus ingredientes? Esta acción no se puede deshacer.'}
            confirmLabel={numVentas > 0 ? 'Entendido' : 'Eliminar'}
            peligro={numVentas === 0}
            onConfirm={numVentas > 0
              ? () => setConfirmEliminar(null)
              : () => eliminarReceta(confirmEliminar)}
            onCancel={() => setConfirmEliminar(null)}
          />
        )}

        <div className="page-title">Catálogo</div>
        <DetalleReceta
          receta={receta}
          ingredientes={ings}
          insumos={insumos}
          config={config}
          onEditar={() => setEditando(true)}
          onVolver={() => setSeleccionada(null)}
          onDuplicar={() => duplicarReceta(receta)}
          onEliminar={() => setConfirmEliminar(receta)}
        />
      </div>
    )
  }

  // Lista de recetas
  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {creando && (
        <NuevaRecetaModal
          recetasExistentes={recetas}
          onCreate={async (nombre) => {
            setCreando(false)
            await load()
            setSeleccionada(nombre)
            setEditando(true)
            showToast(`Receta "${nombre}" creada ✓ — añade los ingredientes`)
          }}
          onCancel={() => setCreando(false)}
        />
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div className="page-title" style={{ margin:0 }}>Catálogo</div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreando(true)}>
          + Nueva receta
        </button>
      </div>

      <div className="card">
        {recetasFiltradas.length === 0 && (
          <div style={{ color:'var(--muted)', textAlign:'center', padding:20 }}>Sin recetas registradas</div>
        )}
        {recetasFiltradas.map(r => {
          const costo = getCosto(r.nombre)
          const precio = getPrecio(r)
          const margen = precio > 0 ? (precio - costo) / precio : 0
          const color = margenColor(margen)
          return (
            <div className="list-item" key={r.nombre}
              onClick={() => setSeleccionada(r.nombre)}
              style={{ cursor:'pointer' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <div className="list-item-name">{r.nombre}</div>
                  <span style={{ fontSize:10, fontWeight:700, color:'var(--muted)', background:'rgba(255,255,255,0.05)', padding:'1px 6px', borderRadius:5, letterSpacing:0.3 }}>
                    {r.envase_formato || '1lt'}
                  </span>
                </div>
                <div className="list-item-sub">
                  Costo: {formatCLP(costo)} · Precio: {formatCLP(precio)}
                </div>
              </div>
              <div className="list-item-right">
                <div style={{ color, fontWeight:700, fontSize:15 }}>{formatPct(margen)}</div>
                <div className="list-item-muted">{formatCLP(precio - costo)} margen</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Resumen márgenes */}
      {recetasFiltradas.length > 0 && (() => {
        const datos = recetasFiltradas.map(r => {
          const costo = getCosto(r.nombre)
          const precio = getPrecio(r)
          return precio > 0 ? (precio - costo) / precio : 0
        })
        const prom = datos.reduce((s, x) => s + x, 0) / datos.length
        const min = Math.min(...datos)
        const max = Math.max(...datos)
        return (
          <div className="kpi-grid" style={{ marginTop:8 }}>
            <div className="kpi-card">
              <div className="kpi-label">Margen promedio</div>
              <div className="kpi-value" style={{ color: margenColor(prom) }}>{formatPct(prom)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Rango márgenes</div>
              <div className="kpi-value" style={{ fontSize:14, color:'var(--muted)' }}>
                {formatPct(min)} – {formatPct(max)}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
