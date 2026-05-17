import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import { descargarCSV, BotonExportar } from '../lib/exportar'

// Parsea "HH:MM" a minutos desde medianoche
function hhmmToMin(s) {
  if (!s) return 0
  const [h, m] = s.split(':').map(Number)
  return h * 60 + (m || 0)
}
function horasEntre(inicio, fin) {
  const mi = hhmmToMin(inicio), mf = hhmmToMin(fin)
  return mf > mi ? (mf - mi) / 60 : 0
}
function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function inicioSemanaISO() {
  const d = new Date()
  const dia = d.getDay() // 0=Dom
  const lunesOffset = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + lunesOffset)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function inicioMesISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}
function parseFecha(f) {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const DIAS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function labelFecha(f) {
  const d = parseFecha(f)
  return `${DIAS_ES[d.getDay()]} ${d.getDate()} ${MESES_ES[d.getMonth()]}`
}

// ─── Modal nuevo/editar bloque ──────────────────────────────────────────────
function BloqueModal({ bloque, onSave, onCancel }) {
  const [fecha, setFecha] = useState(bloque?.fecha || hoyISO())
  const [horaInicio, setHoraInicio] = useState(bloque?.hora_inicio || '')
  const [horaFin, setHoraFin] = useState(bloque?.hora_fin || '')
  const [descripcion, setDescripcion] = useState(bloque?.descripcion || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!horaInicio || !horaFin) { setError('Necesitas hora de inicio y fin'); return }
    if (horasEntre(horaInicio, horaFin) <= 0) { setError('La hora fin debe ser después del inicio'); return }
    setSaving(true); setError('')
    const payload = {
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      descripcion: descripcion.trim() || null,
    }
    const { error: err } = bloque?.id
      ? await supabase.from('horas_trabajadas').update(payload).eq('id', bloque.id)
      : await supabase.from('horas_trabajadas').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  const horas = horaInicio && horaFin ? horasEntre(horaInicio, horaFin) : 0

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:380, width:'100%', marginTop:28 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)', marginBottom:18 }}>
          {bloque?.id ? 'Editar bloque' : 'Registrar bloque de trabajo'}
        </div>

        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Inicio</label>
            <input type="time" className="form-input" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Fin</label>
            <input type="time" className="form-input" value={horaFin} onChange={e => setHoraFin(e.target.value)} />
          </div>
        </div>

        {horas > 0 && (
          <div style={{ fontSize:12, color:'var(--cyan)', textAlign:'center', marginBottom:14 }}>
            = {horas.toFixed(1)} horas
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Qué hiciste — opcional</label>
          <input type="text" className="form-input" value={descripcion}
            placeholder="ej: operación, delivery, compras..."
            onChange={e => setDescripcion(e.target.value)} />
        </div>

        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}

        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving || !horaInicio || !horaFin}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal config tarifa $/h ────────────────────────────────────────────────
function TarifaModal({ tarifaActual, onSave, onCancel }) {
  const [tarifa, setTarifa] = useState(String(tarifaActual || 0))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const valor = parseFloat(tarifa) || 0
    const { data: existe } = await supabase.from('config').select('clave').eq('clave', 'costo_hora_operador').maybeSingle()
    if (existe) {
      await supabase.from('config').update({ valor }).eq('clave', 'costo_hora_operador')
    } else {
      await supabase.from('config').insert({ clave: 'costo_hora_operador', valor })
    }
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:340, width:'100%' }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>
          Tarifa de tu hora
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18, lineHeight:1.6 }}>
          Cuánto vale tu hora en el mercado. Define el costo de oportunidad de trabajar en The Drink y se descuenta del margen neto.
        </div>

        <div className="form-group">
          <label className="form-label">Pesos por hora (CLP)</label>
          <input type="number" className="form-input" value={tarifa}
            placeholder="ej: 8000"
            onChange={e => setTarifa(e.target.value)} autoFocus />
        </div>

        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ───────────────────────────────────────────────────────
export default function Horas() {
  const [bloques, setBloques] = useState([])
  const [ingresoTotal, setIngresoTotal] = useState(0)
  const [tarifa, setTarifa] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)         // null | 'nuevo' | bloque
  const [editarTarifa, setEditarTarifa] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: hrs }, { data: vts }, { data: cfg }] = await Promise.all([
      supabase.from('horas_trabajadas').select('*').order('fecha', { ascending: false }).order('hora_inicio', { ascending: false }),
      supabase.from('ventas').select('litros, precio_venta, delivery'),
      supabase.from('config').select('*').eq('clave', 'costo_hora_operador').maybeSingle(),
    ])
    setBloques(hrs || [])
    setIngresoTotal((vts || []).reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0))
    setTarifa(cfg ? parseFloat(cfg.valor) || 0 : 0)
    setLoading(false)
  }

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleEliminar = async (id) => {
    await supabase.from('horas_trabajadas').delete().eq('id', id)
    setConfirmar(null)
    showToast('Bloque eliminado')
    load()
  }

  // Totales
  const totalHoras = bloques.reduce((s, b) => s + horasEntre(b.hora_inicio, b.hora_fin), 0)
  const inicioSem = inicioSemanaISO()
  const inicioMes = inicioMesISO()
  const horasSemana = bloques.filter(b => b.fecha >= inicioSem).reduce((s, b) => s + horasEntre(b.hora_inicio, b.hora_fin), 0)
  const horasMes = bloques.filter(b => b.fecha >= inicioMes).reduce((s, b) => s + horasEntre(b.hora_inicio, b.hora_fin), 0)

  const costoOportunidad = totalHoras * tarifa
  const ingresoPorHora = totalHoras > 0 ? ingresoTotal / totalHoras : 0

  // Sincronizar config.horas_trabajadas_total para que el Dashboard lo use
  // sin tener que recargar esta tabla. Se actualiza cuando el total cambia.
  useEffect(() => {
    if (loading) return
    ;(async () => {
      const { data: existe } = await supabase.from('config').select('clave').eq('clave', 'horas_trabajadas_total').maybeSingle()
      const valor = totalHoras
      if (existe) {
        await supabase.from('config').update({ valor }).eq('clave', 'horas_trabajadas_total')
      } else {
        await supabase.from('config').insert({ clave: 'horas_trabajadas_total', valor })
      }
    })()
  }, [totalHoras, loading])

  // Agrupar por fecha para la lista
  const porFecha = {}
  bloques.forEach(b => {
    if (!porFecha[b.fecha]) porFecha[b.fecha] = []
    porFecha[b.fecha].push(b)
  })
  const fechasOrdenadas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a))

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {modal && (
        <BloqueModal
          bloque={modal === 'nuevo' ? null : modal}
          onSave={() => { setModal(null); showToast(modal === 'nuevo' ? 'Bloque registrado ✓' : 'Bloque actualizado ✓'); load() }}
          onCancel={() => setModal(null)}
        />
      )}
      {editarTarifa && (
        <TarifaModal
          tarifaActual={tarifa}
          onSave={() => { setEditarTarifa(false); showToast('Tarifa actualizada ✓'); load() }}
          onCancel={() => setEditarTarifa(false)}
        />
      )}
      {confirmar && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:24 }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:320, width:'100%' }}>
            <div style={{ fontSize:14, color:'var(--text)', marginBottom:20, lineHeight:1.5 }}>
              ¿Eliminar este bloque de trabajo?
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" style={{ flex:1, background:'var(--pink)' }} onClick={() => handleEliminar(confirmar)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div className="page-title" style={{ marginBottom:0 }}>Horas</div>
        <div style={{ display:'flex', gap:8 }}>
          {bloques.length > 0 && (
            <BotonExportar onClick={() => {
              const headers = ['Fecha','Hora inicio','Hora fin','Horas','Descripción']
              const rows = bloques.map(b => [b.fecha, b.hora_inicio, b.hora_fin, horasEntre(b.hora_inicio, b.hora_fin).toFixed(2), b.descripcion || ''])
              descargarCSV('thedrink_horas', headers, rows)
            }} />
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setModal('nuevo')}>+ Bloque</button>
        </div>
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
        Tus horas de trabajo en The Drink. Definen el costo de oportunidad de tu tiempo.
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Esta semana</div>
          <div className="kpi-value cyan">{horasSemana.toFixed(1)}h</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Este mes</div>
          <div className="kpi-value">{horasMes.toFixed(1)}h</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total acumulado</div>
          <div className="kpi-value">{totalHoras.toFixed(1)}h</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Ingreso por hora</div>
          <div className="kpi-value green">{formatCLP(ingresoPorHora)}</div>
          <div className="kpi-sub">/h trabajada</div>
        </div>
      </div>

      {/* Card tarifa $/h */}
      <div className="card" style={{
        background:'rgba(123,47,190,0.08)', border:'1px solid rgba(123,47,190,0.3)',
        display:'flex', justifyContent:'space-between', alignItems:'center',
      }}>
        <div>
          <div style={{ fontSize:11, color:'#AFA9EC', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:3 }}>
            Tarifa de tu hora
          </div>
          <div style={{ fontSize:20, fontWeight:900, color:'#AFA9EC' }}>
            {tarifa > 0 ? formatCLP(tarifa) + '/h' : 'No configurada'}
          </div>
          {tarifa > 0 && (
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
              Costo oportunidad acumulado: {formatCLP(costoOportunidad)}
            </div>
          )}
        </div>
        <button onClick={() => setEditarTarifa(true)}
          style={{ background:'none', border:'1px solid rgba(123,47,190,0.5)', borderRadius:8, color:'#AFA9EC', cursor:'pointer', fontSize:11, padding:'5px 10px' }}>
          {tarifa > 0 ? 'Editar' : 'Configurar'}
        </button>
      </div>

      {tarifa > 0 && ingresoPorHora > 0 && (
        <div style={{
          padding:'10px 14px', background:'rgba(255,255,255,0.03)', borderRadius:10,
          fontSize:12, color:'var(--muted)', lineHeight:1.7, marginBottom:14,
        }}>
          💡 Tu hora en The Drink genera <strong style={{ color: ingresoPorHora >= tarifa ? 'var(--green)' : 'var(--pink)' }}>
          {formatCLP(ingresoPorHora)}</strong> de ingreso bruto, vs tu tarifa de {formatCLP(tarifa)}.
          {ingresoPorHora >= tarifa
            ? ' El negocio paga tu tiempo ✓'
            : ' Por ahora estás trabajando bajo tu tarifa de mercado.'}
        </div>
      )}

      {/* Lista de bloques agrupados por fecha */}
      {bloques.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:36, color:'var(--muted)' }}>
          Sin bloques aún. Toca "+ Bloque" para registrar tu primer rato de trabajo.
        </div>
      ) : (
        fechasOrdenadas.map(f => {
          const items = porFecha[f]
          const horasDia = items.reduce((s, b) => s + horasEntre(b.hora_inicio, b.hora_fin), 0)
          return (
            <div key={f} style={{ marginBottom:16 }}>
              <div style={{
                display:'flex', justifyContent:'space-between',
                fontSize:11, color:'var(--cyan)', textTransform:'uppercase',
                letterSpacing:1.2, fontWeight:700, marginBottom:8,
                alignItems:'center',
              }}>
                <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--cyan)' }} />
                  {labelFecha(f)}
                </span>
                <span style={{ color:'var(--muted)', fontSize:11 }}>{horasDia.toFixed(1)}h</span>
              </div>
              {items.map(b => {
                const h = horasEntre(b.hora_inicio, b.hora_fin)
                return (
                  <div key={b.id} className="card" style={{ marginBottom:6, padding:'10px 14px', borderLeft:'3px solid var(--cyan)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:13, color:'var(--text-strong)', fontWeight:700 }}>
                          {b.hora_inicio.slice(0,5)} – {b.hora_fin.slice(0,5)}
                          <span style={{ color:'var(--cyan)', fontWeight:600, marginLeft:8 }}>{h.toFixed(1)}h</span>
                        </div>
                        {b.descripcion && (
                          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{b.descripcion}</div>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => setModal(b)}
                          style={{ background:'none', border:'none', color:'var(--cyan)', cursor:'pointer', padding:4, fontSize:13 }}
                          title="Editar">✏️</button>
                        <button onClick={() => setConfirmar(b.id)}
                          style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:4, fontSize:16 }}
                          title="Eliminar">×</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}
