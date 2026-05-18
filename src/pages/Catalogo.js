import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularCostoReceta, formatCLP, formatPct } from '../lib/calculos'

// ─── Helpers ────────────────────────────────────────────────────────────────

function margenColor(pct) {
  if (pct >= 0.65) return 'var(--green)'
  if (pct >= 0.50) return 'var(--cyan)'
  return 'var(--pink)'
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

function DetalleReceta({ receta, ingredientes, insumos, config, onEditar, onVolver }) {
  const ings = ingredientes.filter(i => i.insumo_nombre !== 'ENVASE')
  const formato = receta.envase_formato || '1lt'
  const costo = calcularCostoReceta(ings, insumos, config.merma_pct,
    { envase_formato: formato, costoLegacy: config.costo_envase })
  const precio = receta.precio_venta || 9000
  const margen = precio > 0 ? (precio - costo) / precio : 0
  const costoInsumos = ings.reduce((s, ing) => {
    const ins = insumos.find(i => i.nombre.toLowerCase() === ing.insumo_nombre.toLowerCase())
    return s + (ins?.costo_ppp || 0) * ing.cantidad
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
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <button className="btn btn-secondary btn-sm" onClick={onVolver}>← Volver</button>
        <button className="btn btn-primary btn-sm" onClick={onEditar}>✏ Editar</button>
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
            <div style={{ color:'var(--muted)', fontSize:13 }}>{formatCLP(costoInsumos * config.merma_pct)}</div>
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
  const [config, setConfig] = useState({ merma_pct: 0.08, costo_envase: 794.6 })
  const [seleccionada, setSeleccionada] = useState(null)
  const [editando, setEditando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: i }, { data: ing }, { data: cfg }] = await Promise.all([
      supabase.from('recetas').select('*').order('nombre'),
      supabase.from('insumos').select('*'),
      supabase.from('receta_ingredientes').select('*'),
      supabase.from('config').select('*'),
    ])
    setRecetas(r || [])
    setInsumos(i || [])
    setIngredientes(ing || [])
    const c = {}
    cfg?.forEach(x => { c[x.clave] = parseFloat(x.valor) || x.valor })
    setConfig({
      merma_pct: c.merma_pct ?? 0.08,
      costo_envase: c.costo_envase ?? 794.6,
    })
    setLoading(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

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

        <div className="page-title">Catálogo</div>
        <DetalleReceta
          receta={receta}
          ingredientes={ings}
          insumos={insumos}
          config={config}
          onEditar={() => setEditando(true)}
          onVolver={() => setSeleccionada(null)}
        />
      </div>
    )
  }

  // Lista de recetas
  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      <div className="page-title">Catálogo</div>

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
