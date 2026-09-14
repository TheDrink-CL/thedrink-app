import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import { ajustarStockPorSalida, mensajeStock } from '../lib/inventario'
import {
  MOTIVOS_SALIDA, labelMotivo, costoSalida, agruparSalidasPorMotivo,
  resumenMotivos, describirSalida,
} from '../lib/salidas'

// ─────────────────────────────────────────────────────────────────────────────
// Salidas sin venta — "salió producto y nadie pagó"
//
// Consumo interno, pruebas para contenido, desarrollo de recetas, canjes con
// influencers, roturas. Antes no tenían dónde vivir: se sacaban a mano en
// Stock (sin rastro) o no se registraban, y aparecían recién en el conteo
// como faltante sin explicar.
//
// Una salida descuenta bodega con el mismo motor que una venta, se valoriza a
// COSTO (snapshot, ver lib/salidas.js) y cae en el P&L entre margen bruto y
// margen operativo. NO toca `ventas`, `ordenes` ni `caja`: la plata salió
// cuando se compró el insumo.
// ─────────────────────────────────────────────────────────────────────────────

const fechaHoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const mesLabel = (yyyymm) => {
  const [y, m] = yyyymm.split('-').map(Number)
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Placeholder del campo "para quién / para qué" según el motivo, para que el
// registro cuente la historia sin tener que pensar qué anotar.
const PLACEHOLDER_DESTINO = {
  marketing: 'ej: reel del mojito, fotos carta nueva',
  canje: 'ej: @nombre_influencer',
  desarrollo: 'ej: probando menos jarabe',
  consumo_interno: 'ej: junta del sábado',
  merma: 'ej: se quebró el frasco al envasar',
}

function ConfirmModal({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
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

export default function Salidas() {
  const [tab, setTab] = useState('registrar') // 'registrar' | 'historial'
  const [recetas, setRecetas] = useState([])
  const [insumos, setInsumos] = useState([])
  const [recetaIngredientes, setRecetaIngredientes] = useState([])
  const [config, setConfig] = useState({ merma_pct: 0.08, costo_envase: 794.6 })
  const [salidas, setSalidas] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmar, setConfirmar] = useState(null)

  // Formulario
  const [fecha, setFecha] = useState(fechaHoy())
  const [motivo, setMotivo] = useState('marketing')
  const [tipo, setTipo] = useState('receta') // 'receta' | 'insumo'
  const [recetaNombre, setRecetaNombre] = useState('')
  const [litros, setLitros] = useState('1')
  const [sinEnvase, setSinEnvase] = useState(false)
  const [insumoNombre, setInsumoNombre] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [destinatario, setDestinatario] = useState('')
  const [nota, setNota] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: rec }, { data: ins }, { data: recIng }, { data: cfg }, { data: sal }] = await Promise.all([
      supabase.from('recetas').select('nombre, envase_formato, es_prototipo').order('nombre'),
      supabase.from('insumos').select('nombre, unidad, stock_actual, costo_ppp, aplica_merma').order('nombre'),
      supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad'),
      supabase.from('config').select('clave, valor'),
      supabase.from('salidas_stock').select('*')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(300),
    ])
    // La carta primero; los prototipos del LAB al final (casi nunca salen sin venta).
    setRecetas((rec || []).slice().sort((a, b) => (a.es_prototipo ? 1 : 0) - (b.es_prototipo ? 1 : 0) || a.nombre.localeCompare(b.nombre)))
    setInsumos(ins || [])
    setRecetaIngredientes(recIng || [])
    const cfgMap = Object.fromEntries((cfg || []).map(c => [c.clave, c.valor]))
    setConfig({
      merma_pct: parseFloat(cfgMap.merma_pct) || 0.08,
      costo_envase: parseFloat(cfgMap.costo_envase) || 794.6,
    })
    setSalidas(sal || [])
    setLoading(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3200) }

  // ── Lo que se está por registrar, valorizado en vivo ─────────────────────
  const insumoSel = insumos.find(i => i.nombre === insumoNombre)
  const salidaForm = tipo === 'receta'
    ? { receta_nombre: recetaNombre, litros: parseFloat(litros) || 0, sin_envase: sinEnvase }
    : { insumo_nombre: insumoNombre, cantidad: parseFloat(cantidad) || 0 }
  const valido = tipo === 'receta'
    ? !!recetaNombre && (parseFloat(litros) || 0) > 0
    : !!insumoNombre && (parseFloat(cantidad) || 0) > 0
  const costoPreview = valido
    ? costoSalida(salidaForm, {
        recetaIngredientes, insumos, recetas,
        merma: config.merma_pct, costoEnvaseLegacy: config.costo_envase,
      })
    : 0

  async function handleGuardar() {
    if (!valido || saving) return
    setSaving(true)
    const fila = {
      fecha,
      motivo,
      receta_nombre: tipo === 'receta' ? recetaNombre : null,
      litros: tipo === 'receta' ? (parseFloat(litros) || 0) : null,
      insumo_nombre: tipo === 'insumo' ? insumoNombre : null,
      cantidad: tipo === 'insumo' ? (parseFloat(cantidad) || 0) : null,
      unidad: tipo === 'insumo' ? (insumoSel?.unidad || null) : null,
      sin_envase: tipo === 'receta' ? sinEnvase : false,
      destinatario: destinatario.trim() || null,
      nota: nota.trim() || null,
      costo_valorizado: Math.round(costoPreview),
    }
    const { error } = await supabase.from('salidas_stock').insert(fila)
    if (error) {
      setSaving(false)
      showToast('No se pudo registrar: ' + error.message)
      return
    }
    // La salida ya quedó escrita; si el stock no se ajusta, avisamos pero no
    // bloqueamos (mismo criterio que una venta).
    const resStock = await ajustarStockPorSalida(fila, -1)
    const aviso = mensajeStock(resStock)
    showToast(aviso
      ? 'Salida registrada · OJO con el stock: ' + aviso
      : `Salida registrada ✓ · ${formatCLP(costoPreview)} a costo`)
    // Se conserva fecha y motivo: lo normal es cargar varias del mismo día.
    setRecetaNombre('')
    setLitros('1')
    setSinEnvase(false)
    setInsumoNombre('')
    setCantidad('')
    setDestinatario('')
    setNota('')
    setSaving(false)
    load()
  }

  async function handleEliminar(s) {
    setConfirmar(null)
    // Reintegrar bodega ANTES de borrar la fila, para no perder qué se descontó.
    const resStock = await ajustarStockPorSalida(s, +1)
    const { error } = await supabase.from('salidas_stock').delete().eq('id', s.id)
    if (error) {
      // El stock ya volvió a subir: lo bajamos de nuevo para no inflar bodega.
      await ajustarStockPorSalida(s, -1)
      showToast('No se pudo eliminar: ' + error.message)
      return
    }
    const aviso = mensajeStock(resStock)
    showToast(aviso ? 'Salida eliminada · OJO con el stock: ' + aviso : 'Salida eliminada · stock reintegrado')
    load()
  }

  // ── Resúmenes para el historial ──────────────────────────────────────────
  const mesActual = fechaHoy().slice(0, 7)
  const resumenMes = agruparSalidasPorMotivo(salidas.filter(s => (s.fecha || '').slice(0, 7) === mesActual))
  const resumenTotal = agruparSalidasPorMotivo(salidas)
  const porMes = {}
  salidas.forEach(s => {
    const m = (s.fecha || '').slice(0, 7)
    if (!porMes[m]) porMes[m] = []
    porMes[m].push(s)
  })
  const mesesOrdenados = Object.keys(porMes).sort((a, b) => b.localeCompare(a))

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {confirmar && (
        <ConfirmModal
          mensaje={`¿Eliminar la salida "${describirSalida(confirmar)}" del ${confirmar.fecha}? El stock vuelve a bodega.`}
          onConfirm={() => handleEliminar(confirmar)}
          onCancel={() => setConfirmar(null)}
        />
      )}

      <div className="page-title">Salidas sin venta</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6 }}>
        Producto que salió de bodega y nadie pagó. Descuenta stock y se cuenta a costo
        en el margen operativo — no es una venta ni una salida de caja.
      </div>

      <div className="toggle-row" style={{ marginBottom: 14 }}>
        <button className={`toggle-btn ${tab === 'registrar' ? 'active-entrada' : ''}`}
          onClick={() => setTab('registrar')}>Registrar</button>
        <button className={`toggle-btn ${tab === 'historial' ? 'active-entrada' : ''}`}
          onClick={() => setTab('historial')}>Historial</button>
      </div>

      {tab === 'registrar' && (
        <div className="card">
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">¿Por qué salió?</label>
            <div className="chip-row" style={{ marginBottom: 6 }}>
              {MOTIVOS_SALIDA.map(m => (
                <button key={m.id} type="button" className={`chip ${motivo === m.id ? 'selected' : ''}`}
                  onClick={() => setMotivo(m.id)}>{m.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {MOTIVOS_SALIDA.find(m => m.id === motivo)?.desc}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">¿Qué salió?</label>
            <div className="toggle-row" style={{ marginBottom: 10 }}>
              <button type="button" className={`toggle-btn ${tipo === 'receta' ? 'active-entrada' : ''}`}
                onClick={() => setTipo('receta')}>Un trago (receta)</button>
              <button type="button" className={`toggle-btn ${tipo === 'insumo' ? 'active-entrada' : ''}`}
                onClick={() => setTipo('insumo')}>Insumo suelto</button>
            </div>

            {tipo === 'receta' ? (
              <>
                <select className="form-select" value={recetaNombre} style={{ marginBottom: 8 }}
                  onChange={e => setRecetaNombre(e.target.value)}>
                  <option value="">Seleccionar receta...</option>
                  {recetas.map(r => (
                    <option key={r.nombre} value={r.nombre}>{r.nombre}{r.es_prototipo ? ' (LAB)' : ''}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" className="form-input" value={litros} placeholder="Litros"
                    style={{ width: 90 }} step="0.05" min="0.05"
                    onChange={e => setLitros(e.target.value)} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>litros</span>
                  <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={sinEnvase} onChange={e => setSinEnvase(e.target.checked)} />
                    Sin envase
                  </label>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                  Se descuenta igual que una venta (con merma). "Sin envase" = se hizo en la coctelera, el frasco no se toca.
                </div>
              </>
            ) : (
              <>
                <select className="form-select" value={insumoNombre} style={{ marginBottom: 8 }}
                  onChange={e => setInsumoNombre(e.target.value)}>
                  <option value="">Seleccionar insumo...</option>
                  {insumos.map(i => (
                    <option key={i.nombre} value={i.nombre}>{i.nombre} ({i.unidad || 'u'})</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" className="form-input" value={cantidad}
                    placeholder={`Cantidad${insumoSel ? ' en ' + (insumoSel.unidad || 'u') : ''}`}
                    style={{ width: 140 }} step="any" min="0"
                    onChange={e => setCantidad(e.target.value)} />
                  {insumoSel && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      en bodega: {Math.round(insumoSel.stock_actual || 0)} {insumoSel.unidad || ''}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                  Se descuenta la cantidad tal cual, sin merma: lo que anotas es lo que salió.
                </div>
              </>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Para quién / para qué — opcional</label>
            <input type="text" className="form-input" value={destinatario}
              placeholder={PLACEHOLDER_DESTINO[motivo]}
              onChange={e => setDestinatario(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Nota — opcional</label>
            <input type="text" className="form-input" value={nota} placeholder="Lo que quieras recordar"
              onChange={e => setNota(e.target.value)} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Costo de esta salida</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: valido ? 'var(--pink)' : 'var(--muted)' }}>
                {valido ? formatCLP(costoPreview) : '—'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
              A costo promedio (PPP) de hoy, no a precio de venta. Queda congelado aunque el PPP cambie después.
            </div>
          </div>

          <button className="btn btn-primary" disabled={!valido || saving} onClick={handleGuardar}>
            {saving ? 'Guardando...' : 'Registrar salida'}
          </button>
        </div>
      )}

      {tab === 'historial' && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <div className="kpi-card">
              <div className="kpi-label">Este mes</div>
              <div className="kpi-value pink">{formatCLP(resumenMes.total)}</div>
              <div className="kpi-sub">{resumenMotivos(resumenMes.porMotivo, formatCLP) || 'sin salidas'}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total registrado</div>
              <div className="kpi-value">{formatCLP(resumenTotal.total)}</div>
              <div className="kpi-sub">{salidas.length} salida{salidas.length === 1 ? '' : 's'}</div>
            </div>
          </div>

          {salidas.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
              Todavía no hay salidas. Registra la primera en la pestaña "Registrar".
            </div>
          )}

          {mesesOrdenados.map(m => {
            const delMes = porMes[m]
            const totalMes = delMes.reduce((s, x) => s + (parseFloat(x.costo_valorizado) || 0), 0)
            return (
              <div key={m}>
                <div className="section-divider">{mesLabel(m)} · {formatCLP(totalMes)}</div>
                <div className="card">
                  {delMes.map(s => (
                    <div className="list-item" key={s.id} style={{ gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="list-item-name" style={{ fontSize: 14 }}>
                          {describirSalida(s)}
                        </div>
                        <div className="list-item-sub">
                          {s.fecha.slice(8, 10)}/{s.fecha.slice(5, 7)}
                          {' · '}<span style={{ color: 'var(--cyan)' }}>{labelMotivo(s.motivo)}</span>
                          {s.destinatario && <span> · {s.destinatario}</span>}
                          {s.nota && <span style={{ color: 'var(--muted)' }}> · {s.nota}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <div className="list-item-value" style={{ fontSize: 14, color: 'var(--pink)' }}>
                          {formatCLP(s.costo_valorizado)}
                        </div>
                        <button type="button" onClick={() => setConfirmar(s)} title="Eliminar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
