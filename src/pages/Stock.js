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
  const [consumoDiario, setConsumoDiario] = useState({})
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null)
  const [toast, setToast] = useState('')
  const [diasProyeccion, setDiasProyeccion] = useState(14)
  const [tabStock, setTabStock] = useState('estado') // 'estado' | 'comprar'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: ins }, { data: vts }, { data: recIng }, { data: cfg }] = await Promise.all([
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('ventas').select('fecha, receta_nombre, litros').order('fecha', { ascending: false }).limit(200),
      supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad'),
      supabase.from('config').select('clave, valor'),
    ])
    setInsumos(ins || [])

    // Calcular consumo diario promedio por insumo (últimos 14 días)
    const hoy = new Date()
    const hace14 = new Date(hoy); hace14.setDate(hoy.getDate() - 14)
    const vtsPeriodo = (vts || []).filter(v => {
      const [y, m, d] = (v.fecha || '').split('-').map(Number)
      return new Date(y, m - 1, d) >= hace14
    })

    // Agrupar ventas por receta en el período
    const litrosPorReceta = {}
    vtsPeriodo.forEach(v => {
      litrosPorReceta[v.receta_nombre] = (litrosPorReceta[v.receta_nombre] || 0) + v.litros
    })

    // Calcular consumo total de insumos en el período
    const consumoTotal = {}
    // Merma desde config: los días de cobertura que muestra esta pantalla tienen
    // que salir de la misma merma con la que se costea y se descuenta bodega.
    const cfgMap = Object.fromEntries((cfg || []).map(c => [c.clave, c.valor]))
    const MERMA = parseFloat(cfgMap.merma_pct) || 0.08
    ;(recIng || []).forEach(ing => {
      if (!litrosPorReceta[ing.receta_nombre]) return
      const litros = litrosPorReceta[ing.receta_nombre]
      const usado = ing.cantidad * litros * (1 + MERMA)
      consumoTotal[ing.insumo_nombre] = (consumoTotal[ing.insumo_nombre] || 0) + usado
    })

    // Convertir a consumo diario (÷ 14 días)
    const cd = {}
    Object.entries(consumoTotal).forEach(([nombre, total]) => {
      cd[nombre] = total / 14
    })
    setConsumoDiario(cd)
    setLoading(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleSave = async (nombre, stockActual, stockMinimo) => {
    const { error } = await supabase.from('insumos').update({
      stock_actual: stockActual,
      stock_minimo: stockMinimo
    }).eq('nombre', nombre)
    setEditando(null)
    if (error) {
      showToast('Error al actualizar stock: ' + error.message)
      return
    }
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

      <div className="toggle-row" style={{ marginBottom: 12 }}>
        <button className={`toggle-btn ${tabStock === 'estado' ? 'active-entrada' : ''}`} onClick={() => setTabStock('estado')}>Estado</button>
        <button className={`toggle-btn ${tabStock === 'comprar' ? 'active-entrada' : ''}`} onClick={() => setTabStock('comprar')}>¿Qué comprar?</button>
      </div>

      {tabStock === 'comprar' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
            Basado en consumo real de los últimos 14 días. Ajusta el horizonte según cuántos días quieres cubrir.
          </div>
          {/* Selector de días */}
          <div className="toggle-row" style={{ marginBottom: 14 }}>
            {[7, 14, 21, 30].map(d => (
              <button key={d} className={`toggle-btn ${diasProyeccion === d ? 'active-entrada' : ''}`}
                onClick={() => setDiasProyeccion(d)}>{d}d</button>
            ))}
          </div>

          {/* Lista de insumos que necesitan compra */}
          {(() => {
            const necesitan = insumos
              .map(ins => {
                const cd = consumoDiario[ins.nombre] || 0
                if (cd <= 0) return null
                const stockActual = ins.stock_actual || 0
                const necesidadTotal = cd * diasProyeccion
                const falta = Math.max(0, necesidadTotal - stockActual)
                const diasRestantes = cd > 0 ? Math.floor(stockActual / cd) : null
                return { ins, cd, stockActual, necesidadTotal, falta, diasRestantes }
              })
              .filter(Boolean)
              .sort((a, b) => {
                // Primero los que tienen stock crítico (días restantes < proyección)
                const aUrgente = (a.diasRestantes !== null && a.diasRestantes < diasProyeccion) ? 0 : 1
                const bUrgente = (b.diasRestantes !== null && b.diasRestantes < diasProyeccion) ? 0 : 1
                if (aUrgente !== bUrgente) return aUrgente - bUrgente
                return (a.diasRestantes || 999) - (b.diasRestantes || 999)
              })

            if (necesitan.length === 0) {
              return (
                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ fontSize: 14, color: 'var(--muted)' }}>Sin datos de consumo aún</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Registra ventas para calcular proyecciones.</div>
                </div>
              )
            }

            return (
              <div className="card">
                {necesitan.map(({ ins, cd, stockActual, necesidadTotal, falta, diasRestantes }) => {
                  const necesitaCompra = falta > 0
                  const urgente = diasRestantes !== null && diasRestantes <= 3
                  const colorBorde = urgente ? 'rgba(196,0,90,0.3)' : necesitaCompra ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.2)'
                  const colorTexto = urgente ? 'var(--pink)' : necesitaCompra ? '#f59e0b' : 'var(--green)'

                  return (
                    <div key={ins.nombre} style={{
                      padding: '10px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: necesitaCompra ? colorTexto : 'var(--text)', marginBottom: 2 }}>
                            {ins.nombre}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                            Stock: {Math.round(stockActual)} {ins.unidad}
                            {' '}· Consumo: ~{cd.toFixed(1)} {ins.unidad}/día
                            {diasRestantes !== null && (
                              <span style={{ color: urgente ? 'var(--pink)' : diasRestantes <= 7 ? '#f59e0b' : 'var(--muted)', fontWeight: 700, marginLeft: 4 }}>
                                · ~{diasRestantes}d
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          {necesitaCompra ? (
                            <>
                              <div style={{ fontSize: 15, fontWeight: 800, color: colorTexto }}>
                                +{Math.ceil(falta)} {ins.unidad}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>comprar</div>
                            </>
                          ) : (
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>✓ OK</div>
                          )}
                        </div>
                      </div>
                      {necesitaCompra && (
                        <div style={{ marginTop: 6, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: Math.min(100, (stockActual / necesidadTotal) * 100) + '%',
                            background: colorTexto,
                            transition: 'width 0.4s'
                          }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {tabStock === 'estado' && (criticos.length > 0 || bajos.length > 0) && (
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

      {tabStock === 'estado' && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
        Toca cualquier insumo para actualizar el stock o configurar el nivel de alerta.
        El stock se actualiza automáticamente al registrar una compra.
      </div>}

      {tabStock === 'estado' && <div className="card">
        {insumos.map(ins => {
          const estado = getEstado(ins)
          const cdIns = consumoDiario[ins.nombre] || null
          const diasRestantes = cdIns > 0 && ins.stock_actual != null
            ? Math.floor(ins.stock_actual / cdIns)
            : null
          const alertaDias = diasRestantes !== null && diasRestantes <= 3
          const advDias = diasRestantes !== null && diasRestantes > 3 && diasRestantes <= 7

          return (
            <div key={ins.nombre}
              onClick={() => setEditando(ins)}
              style={{
                cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}>
              <div style={{ flex: 1 }}>
                <div className="list-item-name">{ins.nombre}</div>
                <div className="list-item-sub">
                  {ins.stock_actual != null
                    ? `${Math.round(ins.stock_actual)} ${ins.unidad}`
                    : `Sin datos · ${ins.unidad}`}
                  {ins.stock_minimo != null && ` · Mín: ${ins.stock_minimo} ${ins.unidad}`}
                  {diasRestantes !== null && (
                    <span style={{
                      marginLeft: 6, fontWeight: 700,
                      color: alertaDias ? 'var(--pink)' : advDias ? '#f59e0b' : 'var(--muted)'
                    }}>
                      · ~{diasRestantes}d
                    </span>
                  )}
                </div>
                {/* Barra de stock visual */}
                {ins.stock_actual != null && ins.stock_minimo != null && ins.stock_minimo > 0 && (
                  <div style={{ marginTop: 5, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: Math.min(100, (ins.stock_actual / (ins.stock_minimo * 3)) * 100) + '%',
                      background: estadoColor[estado],
                      transition: 'width 0.4s'
                    }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: alertaDias ? 'var(--pink)' : estadoColor[estado],
                  textTransform: 'uppercase', letterSpacing: 0.5
                }}>
                  {alertaDias ? '¡Comprar!' : estadoLabel[estado]}
                </div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: alertaDias ? 'var(--pink)' : estadoColor[estado] }} />
              </div>
            </div>
          )
        })}
      </div>}

      {tabStock === 'estado' && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6, padding: '0 4px' }}>
        Los días (~Xd) son una estimación basada en el consumo real de los últimos 14 días.
      </div>}
    </div>
  )
}
