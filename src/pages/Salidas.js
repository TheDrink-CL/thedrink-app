import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import { ajustarStockPorSalidas, mensajeStock } from '../lib/inventario'
import {
  MOTIVOS_SALIDA, labelMotivo, costoSalida, agruparSalidasPorMotivo,
  agruparEnSalidas, resumenMotivos, describirSalida,
} from '../lib/salidas'

// ─────────────────────────────────────────────────────────────────────────────
// Salidas sin venta — "salió producto y nadie pagó"
//
// Consumo interno, pruebas para contenido, desarrollo de recetas, canjes con
// influencers, roturas. Antes no tenían dónde vivir: se sacaban a mano en
// Stock (sin rastro) o no se registraban, y aparecían recién en el conteo
// como faltante sin explicar.
//
// Una salida puede tener varios productos (un canje de 5 litros de tres
// tragos distintos). Cada producto es una fila en `salidas_stock` con su
// propio costo; `grupo_id` las amarra para mostrarlas y borrarlas juntas.
// Descuenta bodega con el mismo motor que una venta, se valoriza a COSTO
// (snapshot, ver lib/salidas.js) y cae en el P&L entre margen bruto y margen
// operativo. NO toca `ventas`, `ordenes` ni `caja`: la plata salió cuando se
// compró el insumo.
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

const nuevoGrupoId = () =>
  (globalThis.crypto?.randomUUID?.() || `sal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

// Placeholder del campo "para quién / para qué" según el motivo, para que el
// registro cuente la historia sin tener que pensar qué anotar.
const PLACEHOLDER_DESTINO = {
  marketing: 'ej: reel del mojito, fotos carta nueva',
  canje: 'ej: @nombre_influencer',
  desarrollo: 'ej: probando menos jarabe',
  consumo_interno: 'ej: junta del sábado',
  merma: 'ej: se quebró el frasco al envasar',
}

const itemVacio = () => ({
  tipo: 'receta', // 'receta' | 'insumo'
  receta_nombre: '', litros: '1', sin_envase: false,
  insumo_nombre: '', cantidad: '',
})

// Qué se guarda de cada ítem del formulario (sin los campos de la cabecera).
const itemALinea = (it) => it.tipo === 'receta'
  ? { receta_nombre: it.receta_nombre, litros: parseFloat(it.litros) || 0, sin_envase: !!it.sin_envase, insumo_nombre: null, cantidad: null }
  : { receta_nombre: null, litros: null, sin_envase: false, insumo_nombre: it.insumo_nombre, cantidad: parseFloat(it.cantidad) || 0 }

const itemValido = (it) => it.tipo === 'receta'
  ? !!it.receta_nombre && (parseFloat(it.litros) || 0) > 0
  : !!it.insumo_nombre && (parseFloat(it.cantidad) || 0) > 0

// Un ítem "tocado" pero inválido: hay algo escrito, pero no alcanza. No se
// ignora en silencio (sería perder una línea del canje sin darse cuenta).
const itemIncompleto = (it) => !itemValido(it) && (
  it.tipo === 'receta' ? !!it.receta_nombre : (!!it.insumo_nombre || it.cantidad !== '')
)

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
  const [filas, setFilas] = useState([]) // filas crudas de salidas_stock
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmar, setConfirmar] = useState(null) // salida agrupada a eliminar

  // Formulario: cabecera + productos
  const [fecha, setFecha] = useState(fechaHoy())
  const [motivo, setMotivo] = useState('marketing')
  const [destinatario, setDestinatario] = useState('')
  const [nota, setNota] = useState('')
  const [items, setItems] = useState([itemVacio()])

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: rec }, { data: ins }, { data: recIng }, { data: cfg }, { data: sal }] = await Promise.all([
      supabase.from('recetas').select('nombre, envase_formato, es_prototipo').order('nombre'),
      supabase.from('insumos').select('nombre, unidad, stock_actual, costo_ppp, aplica_merma').order('nombre'),
      supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad'),
      supabase.from('config').select('clave, valor'),
      supabase.from('salidas_stock').select('*')
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(500),
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
    setFilas(sal || [])
    setLoading(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3200) }

  // ── Ítems del formulario ─────────────────────────────────────────────────
  const updateItem = (i, campo, valor) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it))
  const agregarItem = () => setItems(prev => [...prev, itemVacio()])
  const quitarItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const ctxCosto = {
    recetaIngredientes, insumos, recetas,
    merma: config.merma_pct, costoEnvaseLegacy: config.costo_envase,
  }
  const costoItem = (it) => itemValido(it) ? costoSalida(itemALinea(it), ctxCosto) : 0
  const itemsValidos = items.filter(itemValido)
  const incompletos = items.map((it, i) => itemIncompleto(it) ? i + 1 : null).filter(Boolean)
  const costoTotal = itemsValidos.reduce((s, it) => s + costoItem(it), 0)
  const puedeGuardar = itemsValidos.length > 0 && incompletos.length === 0 && !saving

  async function handleGuardar() {
    if (!puedeGuardar) return
    setSaving(true)
    const grupoId = nuevoGrupoId()
    const lineas = itemsValidos.map(it => {
      const l = itemALinea(it)
      const insumoSel = l.insumo_nombre ? insumos.find(i => i.nombre === l.insumo_nombre) : null
      return {
        fecha,
        motivo,
        ...l,
        unidad: insumoSel ? (insumoSel.unidad || null) : null,
        destinatario: destinatario.trim() || null,
        nota: nota.trim() || null,
        costo_valorizado: Math.round(costoItem(it)),
        grupo_id: grupoId,
      }
    })
    // La columna `grupo_id` llega con la migración 20260915. Si todavía no se
    // corrió, guardamos igual: se pierde la agrupación, no la salida.
    let { error } = await supabase.from('salidas_stock').insert(lineas)
    if (error && /grupo_id/i.test(error.message || '')) {
      const sinGrupo = lineas.map(({ grupo_id, ...resto }) => resto)
      error = (await supabase.from('salidas_stock').insert(sinGrupo)).error
    }
    if (error) {
      setSaving(false)
      showToast('No se pudo registrar: ' + error.message)
      return
    }
    // La salida ya quedó escrita; si el stock no se ajusta, avisamos pero no
    // bloqueamos (mismo criterio que una venta).
    const resStock = await ajustarStockPorSalidas(lineas, -1)
    const aviso = mensajeStock(resStock)
    const n = lineas.length
    showToast(aviso
      ? 'Salida registrada · OJO con el stock: ' + aviso
      : `Salida registrada ✓ · ${n} producto${n === 1 ? '' : 's'} · ${formatCLP(costoTotal)} a costo`)
    // Se conserva fecha y motivo: lo normal es cargar varias del mismo día.
    setDestinatario('')
    setNota('')
    setItems([itemVacio()])
    setSaving(false)
    load()
  }

  async function handleEliminar(g) {
    setConfirmar(null)
    // Reintegrar bodega ANTES de borrar las filas, para no perder qué se descontó.
    const resStock = await ajustarStockPorSalidas(g.lineas, +1)
    const { error } = await supabase.from('salidas_stock').delete().in('id', g.ids)
    if (error) {
      // El stock ya volvió a subir: lo bajamos de nuevo para no inflar bodega.
      await ajustarStockPorSalidas(g.lineas, -1)
      showToast('No se pudo eliminar: ' + error.message)
      return
    }
    const aviso = mensajeStock(resStock)
    showToast(aviso ? 'Salida eliminada · OJO con el stock: ' + aviso : 'Salida eliminada · stock reintegrado')
    load()
  }

  // ── Resúmenes para el historial (sobre filas: cada línea tiene su costo) ──
  const mesActual = fechaHoy().slice(0, 7)
  const resumenMes = agruparSalidasPorMotivo(filas.filter(s => (s.fecha || '').slice(0, 7) === mesActual))
  const resumenTotal = agruparSalidasPorMotivo(filas)
  const salidas = agruparEnSalidas(filas)
  const porMes = {}
  salidas.forEach(g => {
    const m = (g.fecha || '').slice(0, 7)
    if (!porMes[m]) porMes[m] = []
    porMes[m].push(g)
  })
  const mesesOrdenados = Object.keys(porMes).sort((a, b) => b.localeCompare(a))

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {confirmar && (
        <ConfirmModal
          mensaje={confirmar.lineas.length === 1
            ? `¿Eliminar la salida "${describirSalida(confirmar.lineas[0])}" del ${confirmar.fecha}? El stock vuelve a bodega.`
            : `¿Eliminar la salida del ${confirmar.fecha} completa (${confirmar.lineas.length} productos, ${formatCLP(confirmar.total)})? Todo el stock vuelve a bodega.`}
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
            <label className="form-label">Para quién / para qué — opcional</label>
            <input type="text" className="form-input" value={destinatario}
              placeholder={PLACEHOLDER_DESTINO[motivo]}
              onChange={e => setDestinatario(e.target.value)} />
          </div>

          {/* ── Productos ─────────────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>
              ¿Qué salió?
            </div>
            {items.map((it, i) => {
              const insumoSel = it.tipo === 'insumo' ? insumos.find(x => x.nombre === it.insumo_nombre) : null
              const valido = itemValido(it)
              const incompleto = itemIncompleto(it)
              return (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginBottom: 10,
                  border: `1px solid ${incompleto ? 'rgba(196,0,90,0.4)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Producto {i + 1}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {valido && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pink)' }}>{formatCLP(costoItem(it))}</span>
                      )}
                      {items.length > 1 && (
                        <button type="button" onClick={() => quitarItem(i)} title="Quitar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
                      )}
                    </div>
                  </div>

                  <div className="toggle-row" style={{ marginBottom: 8 }}>
                    <button type="button" className={`toggle-btn ${it.tipo === 'receta' ? 'active-entrada' : ''}`}
                      style={{ padding: 7, fontSize: 13 }}
                      onClick={() => updateItem(i, 'tipo', 'receta')}>Un trago (receta)</button>
                    <button type="button" className={`toggle-btn ${it.tipo === 'insumo' ? 'active-entrada' : ''}`}
                      style={{ padding: 7, fontSize: 13 }}
                      onClick={() => updateItem(i, 'tipo', 'insumo')}>Insumo suelto</button>
                  </div>

                  {it.tipo === 'receta' ? (
                    <>
                      <select className="form-select" value={it.receta_nombre} style={{ marginBottom: 8 }}
                        onChange={e => updateItem(i, 'receta_nombre', e.target.value)}>
                        <option value="">Seleccionar receta...</option>
                        {recetas.map(r => (
                          <option key={r.nombre} value={r.nombre}>{r.nombre}{r.es_prototipo ? ' (LAB)' : ''}</option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="number" className="form-input" value={it.litros} placeholder="Litros"
                          style={{ width: 90 }} step="0.05" min="0.05"
                          onChange={e => updateItem(i, 'litros', e.target.value)} />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>litros</span>
                        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={it.sin_envase} onChange={e => updateItem(i, 'sin_envase', e.target.checked)} />
                          Sin envase
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <select className="form-select" value={it.insumo_nombre} style={{ marginBottom: 8 }}
                        onChange={e => updateItem(i, 'insumo_nombre', e.target.value)}>
                        <option value="">Seleccionar insumo...</option>
                        {insumos.map(x => (
                          <option key={x.nombre} value={x.nombre}>{x.nombre} ({x.unidad || 'u'})</option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="number" className="form-input" value={it.cantidad}
                          placeholder={`Cantidad${insumoSel ? ' en ' + (insumoSel.unidad || 'u') : ''}`}
                          style={{ width: 140 }} step="any" min="0"
                          onChange={e => updateItem(i, 'cantidad', e.target.value)} />
                        {insumoSel && (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            en bodega: {Math.round(insumoSel.stock_actual || 0)} {insumoSel.unidad || ''}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
            <button type="button" onClick={agregarItem}
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 0', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>
              + Agregar producto
            </button>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              Un trago se descuenta igual que una venta (con merma); "sin envase" = se hizo en la coctelera,
              el frasco no se toca. Un insumo suelto se descuenta tal cual, sin merma.
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 14 }}>
            <label className="form-label">Nota — opcional</label>
            <input type="text" className="form-input" value={nota} placeholder="Lo que quieras recordar"
              onChange={e => setNota(e.target.value)} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Costo de esta salida{itemsValidos.length > 1 ? ` · ${itemsValidos.length} productos` : ''}
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: itemsValidos.length ? 'var(--pink)' : 'var(--muted)' }}>
                {itemsValidos.length ? formatCLP(costoTotal) : '—'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
              A costo promedio (PPP) de hoy, no a precio de venta. Queda congelado aunque el PPP cambie después.
            </div>
            {incompletos.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--pink)', marginTop: 6 }}>
                Completa o quita el producto {incompletos.join(', ')} antes de registrar.
              </div>
            )}
          </div>

          <button className="btn btn-primary" disabled={!puedeGuardar} onClick={handleGuardar}>
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
              <div className="kpi-sub">{salidas.length} salida{salidas.length === 1 ? '' : 's'} · {filas.length} producto{filas.length === 1 ? '' : 's'}</div>
            </div>
          </div>

          {salidas.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
              Todavía no hay salidas. Registra la primera en la pestaña "Registrar".
            </div>
          )}

          {mesesOrdenados.map(m => {
            const delMes = porMes[m]
            const totalMes = delMes.reduce((s, g) => s + g.total, 0)
            return (
              <div key={m}>
                <div className="section-divider">{mesLabel(m)} · {formatCLP(totalMes)}</div>
                <div className="card">
                  {delMes.map(g => (
                    <div className="list-item" key={g.key} style={{ gap: 8, alignItems: 'flex-start', display: 'block' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="list-item-name" style={{ fontSize: 13 }}>
                            {g.fecha.slice(8, 10)}/{g.fecha.slice(5, 7)}
                            {' · '}<span style={{ color: 'var(--cyan)' }}>{labelMotivo(g.motivo)}</span>
                            {g.destinatario && <span style={{ fontWeight: 400 }}> · {g.destinatario}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <div className="list-item-value" style={{ fontSize: 14, color: 'var(--pink)' }}>
                            {formatCLP(g.total)}
                          </div>
                          <button type="button" onClick={() => setConfirmar(g)} title="Eliminar salida completa"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
                        </div>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        {g.lineas.map(s => (
                          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
                            <span>{describirSalida(s)}</span>
                            {g.lineas.length > 1 && (
                              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{formatCLP(s.costo_valorizado)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {g.nota && <div className="list-item-sub">{g.nota}</div>}
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
