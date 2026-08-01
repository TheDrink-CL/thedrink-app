import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

const TIPOS = ['pagar', 'cobrar']
const TIPO_LABEL = { pagar: '💸 Por pagar', cobrar: '💰 Por cobrar' }
const TIPO_COLOR = {
  pagar: { bg: 'rgba(239,68,68,0.10)', color: 'var(--pink)', border: 'rgba(239,68,68,0.25)' },
  cobrar: { bg: 'rgba(16,185,129,0.10)', color: 'var(--green)', border: 'rgba(16,185,129,0.25)' },
}

function DeudaModal({ deuda, onSave, onCancel }) {
  const [descripcion, setDescripcion] = useState(deuda?.descripcion || '')
  const [tipo, setTipo] = useState(deuda?.tipo || 'pagar')
  const [montoTotal, setMontoTotal] = useState(deuda?.monto_total || '')
  const [contraparte, setContraparte] = useState(deuda?.contraparte || '')
  const [fechaVence, setFechaVence] = useState(deuda?.fecha_vence || '')
  const [nota, setNota] = useState(deuda?.nota || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!descripcion.trim() || !montoTotal) return
    setSaving(true); setError('')
    const payload = {
      descripcion, tipo,
      monto_total: parseFloat(montoTotal),
      contraparte: contraparte || null,
      fecha_vence: fechaVence || null,
      nota: nota || null,
    }
    const { error: err } = deuda?.id
      ? await supabase.from('deudas').update(payload).eq('id', deuda.id)
      : await supabase.from('deudas').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:420, width:'100%' }}>
        <div style={{ fontWeight:700, fontSize:16, color:'var(--text)', marginBottom:18 }}>
          {deuda?.id ? 'Editar cuenta' : 'Nueva cuenta'}
        </div>

        <div className="form-group">
          <label className="form-label">Tipo</label>
          <div className="chip-row">
            {TIPOS.map(t => (
              <button key={t} type="button" className={`chip ${tipo === t ? 'selected' : ''}`}
                onClick={() => setTipo(t)}>{TIPO_LABEL[t]}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Descripción</label>
          <input type="text" className="form-input" value={descripcion}
            placeholder={tipo === 'pagar' ? 'ej: Cuota licuadora, Claude Pro...' : 'ej: Claude Pro mes de Ro...'}
            onChange={e => setDescripcion(e.target.value)} autoFocus />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Monto total ($)</label>
            <input type="number" className="form-input" value={montoTotal} placeholder="ej: 150000"
              onChange={e => setMontoTotal(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{tipo === 'pagar' ? 'A quién' : 'De quién'}</label>
            <input type="text" className="form-input" value={contraparte} placeholder="ej: Banco, Rodrigo..."
              onChange={e => setContraparte(e.target.value)} />
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Fecha vencimiento</label>
            <input type="date" className="form-input" value={fechaVence}
              onChange={e => setFechaVence(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Nota</label>
            <input type="text" className="form-input" value={nota} placeholder="opcional"
              onChange={e => setNota(e.target.value)} />
          </div>
        </div>

        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}
        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave}
            disabled={saving || !descripcion.trim() || !montoTotal}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AbonoModal({ deuda, saldoPendiente, onSave, onCancel }) {
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  })
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!monto || parseFloat(monto) <= 0) return
    setSaving(true); setError('')
    const { error: errInsert } = await supabase.from('abonos').insert({
      deuda_id: deuda.id,
      monto: parseFloat(monto),
      fecha,
      nota: nota || null,
    })
    if (errInsert) { setSaving(false); setError(errInsert.message); return }
    // Si saldo queda en 0, marcar deuda como pagada
    const nuevoSaldo = saldoPendiente - parseFloat(monto)
    if (nuevoSaldo <= 0) {
      const { error: errUpdate } = await supabase.from('deudas').update({ pagada: true }).eq('id', deuda.id)
      if (errUpdate) { setSaving(false); setError(errUpdate.message); return }
    }
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:360, width:'100%' }}>
        <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', marginBottom:4 }}>Registrar abono</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
          {deuda.descripcion} · Saldo pendiente: {formatCLP(saldoPendiente)}
        </div>
        <div className="form-group">
          <label className="form-label">Monto del abono ($)</label>
          <input type="number" className="form-input" value={monto} placeholder={`Máx: ${formatCLP(saldoPendiente)}`}
            onChange={e => setMonto(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha</label>
          <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Nota</label>
          <input type="text" className="form-input" value={nota} placeholder="opcional" onChange={e => setNota(e.target.value)} />
        </div>
        {monto && (
          <div style={{ background:'rgba(0,180,180,0.07)', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:13 }}>
            Saldo restante: <strong style={{ color: (saldoPendiente - parseFloat(monto)) <= 0 ? 'var(--green)' : 'var(--cyan)' }}>
              {formatCLP(Math.max(0, saldoPendiente - parseFloat(monto)))}
            </strong>
            {(saldoPendiente - parseFloat(monto)) <= 0 && <span style={{ color:'var(--green)', marginLeft:6 }}>✓ Liquidado</span>}
          </div>
        )}
        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving || !monto}>
            {saving ? 'Guardando...' : 'Registrar abono'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeudaCard({ deuda, abonos, onEdit, onAbono, onDelete, onTogglePagada }) {
  const [expandido, setExpandido] = useState(false)
  const totalAbonado = abonos.reduce((s, a) => s + (a.monto || 0), 0)
  const saldoPendiente = Math.max(0, (deuda.monto_total || 0) - totalAbonado)
  const progreso = deuda.monto_total > 0 ? Math.min(100, (totalAbonado / deuda.monto_total) * 100) : 0
  const tc = TIPO_COLOR[deuda.tipo] || TIPO_COLOR.pagar
  // Parsear fecha_vence como fecha LOCAL (no UTC) para que no aparezca vencida
  // la noche anterior en husos horarios detrás de UTC (ej. Chile).
  const parseLocal = (str) => {
    const [y, m, d] = str.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const hoyLocal = new Date()
  hoyLocal.setHours(0, 0, 0, 0)
  const vencida = deuda.fecha_vence && !deuda.pagada && parseLocal(deuda.fecha_vence) < hoyLocal

  return (
    <div style={{
      background: deuda.pagada ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
      borderRadius:12, border:`1px solid ${deuda.pagada ? 'var(--border)' : tc.border}`,
      padding:16, marginBottom:12,
      opacity: deuda.pagada ? 0.6 : 1
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
            <span style={{ fontWeight:700, fontSize:15, color:'var(--text)',
              textDecoration: deuda.pagada ? 'line-through' : 'none' }}>{deuda.descripcion}</span>
            {vencida && <span style={{ fontSize:10, background:'rgba(239,68,68,0.2)', color:'var(--pink)', borderRadius:6, padding:'1px 6px', fontWeight:700 }}>VENCIDA</span>}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
            <span style={{ fontSize:11, background:tc.bg, color:tc.color, borderRadius:8, padding:'2px 8px', fontWeight:600 }}>
              {TIPO_LABEL[deuda.tipo]}
            </span>
            {deuda.contraparte && <span style={{ fontSize:11, color:'var(--muted)' }}>{deuda.contraparte}</span>}
            {deuda.fecha_vence && <span style={{ fontSize:11, color: vencida ? 'var(--pink)' : 'var(--muted)' }}>vence {deuda.fecha_vence}</span>}
          </div>
          {/* Barra de progreso */}
          <div style={{ marginBottom:6 }}>
            <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${progreso}%`, background: progreso >= 100 ? 'var(--green)' : tc.color, borderRadius:2, transition:'width 0.3s' }}/>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:12 }}>
              <span style={{ color:'var(--muted)' }}>Abonado: {formatCLP(totalAbonado)}</span>
              <span style={{ color: saldoPendiente === 0 ? 'var(--green)' : 'var(--text)', fontWeight:700 }}>
                {saldoPendiente === 0 ? '✓ Liquidado' : `Pendiente: ${formatCLP(saldoPendiente)}`}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={() => onEdit(deuda)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--cyan)', padding:4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button onClick={() => onDelete(deuda)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Acciones */}
      <div style={{ display:'flex', gap:8, marginTop:8 }}>
        {!deuda.pagada && saldoPendiente > 0 && (
          <button className="btn btn-primary btn-sm" onClick={() => onAbono(deuda, saldoPendiente)}
            style={{ fontSize:12 }}>
            + Abono
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => setExpandido(e => !e)}
          style={{ fontSize:12 }}>
          {expandido ? 'Ocultar abonos' : `Ver abonos (${abonos.length})`}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => onTogglePagada(deuda)}
          style={{ fontSize:12, marginLeft:'auto' }}>
          {deuda.pagada ? 'Reabrir' : 'Marcar pagada'}
        </button>
      </div>

      {/* Historial de abonos */}
      {expandido && (
        <div style={{ marginTop:10, borderTop:'1px solid var(--border)', paddingTop:10 }}>
          {abonos.length === 0 ? (
            <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'8px 0' }}>Sin abonos registrados</div>
          ) : (
            abonos.map(a => (
              <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:13 }}>
                <div>
                  <span style={{ color:'var(--text)' }}>{a.fecha}</span>
                  {a.nota && <span style={{ color:'var(--muted)', marginLeft:8 }}>{a.nota}</span>}
                </div>
                <span style={{ color:'var(--green)', fontWeight:600 }}>{formatCLP(a.monto)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function Cuentas() {
  const [deudas, setDeudas] = useState([])
  const [abonos, setAbonos] = useState([])
  const [modal, setModal] = useState(null)
  const [abonoModal, setAbonoModal] = useState(null) // { deuda, saldoPendiente }
  const [confirmar, setConfirmar] = useState(null)
  const [filtro, setFiltro] = useState('activas') // 'activas' | 'pagadas' | 'todos'
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: d }, { data: a }] = await Promise.all([
      supabase.from('deudas').select('*').order('created_at', { ascending: false }),
      supabase.from('abonos').select('*').order('fecha'),
    ])
    setDeudas(d || [])
    setAbonos(a || [])
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const getAbonos = (deudaId) => abonos.filter(a => a.deuda_id === deudaId)

  const handleDelete = async (deuda) => {
    const { error: errAbonos } = await supabase.from('abonos').delete().eq('deuda_id', deuda.id)
    if (errAbonos) { showToast(`No se pudo eliminar: ${errAbonos.message}`); return }
    const { error: errDeuda } = await supabase.from('deudas').delete().eq('id', deuda.id)
    if (errDeuda) { showToast(`No se pudo eliminar: ${errDeuda.message}`); return }
    setConfirmar(null)
    showToast('Cuenta eliminada')
    load()
  }

  const handleTogglePagada = async (deuda) => {
    const { error } = await supabase.from('deudas').update({ pagada: !deuda.pagada }).eq('id', deuda.id)
    if (error) { showToast(`No se pudo actualizar: ${error.message}`); return }
    load()
  }

  const deudasFiltradas = deudas.filter(d => {
    if (filtro === 'activas') return !d.pagada
    if (filtro === 'pagadas') return d.pagada
    return true
  })

  // Resumen financiero
  const activas = deudas.filter(d => !d.pagada)
  const totalPorPagar = activas.filter(d => d.tipo === 'pagar').reduce((s, d) => {
    const ab = getAbonos(d.id).reduce((x, a) => x + a.monto, 0)
    return s + Math.max(0, d.monto_total - ab)
  }, 0)
  const totalPorCobrar = activas.filter(d => d.tipo === 'cobrar').reduce((s, d) => {
    const ab = getAbonos(d.id).reduce((x, a) => x + a.monto, 0)
    return s + Math.max(0, d.monto_total - ab)
  }, 0)

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {modal && (
        <DeudaModal
          deuda={modal === 'nueva' ? null : modal}
          onSave={() => { setModal(null); showToast(modal === 'nueva' ? 'Cuenta creada ✓' : 'Cuenta actualizada ✓'); load() }}
          onCancel={() => setModal(null)}
        />
      )}

      {abonoModal && (
        <AbonoModal
          deuda={abonoModal.deuda}
          saldoPendiente={abonoModal.saldoPendiente}
          onSave={() => { setAbonoModal(null); showToast('Abono registrado ✓'); load() }}
          onCancel={() => setAbonoModal(null)}
        />
      )}

      {confirmar && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:320, width:'100%' }}>
            <div style={{ fontSize:15, color:'var(--text)', marginBottom:20, lineHeight:1.5 }}>
              ¿Eliminar "{confirmar.descripcion}"?
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" style={{ flex:1, background:'var(--pink)' }} onClick={() => handleDelete(confirmar)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div className="page-title" style={{ margin:0 }}>Cuentas</div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('nueva')}>+ Nueva</button>
      </div>

      {/* Resumen */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'12px 14px' }}>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Por pagar</div>
          <div style={{ fontSize:20, fontWeight:700, color:'var(--pink)' }}>{formatCLP(totalPorPagar)}</div>
        </div>
        <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, padding:'12px 14px' }}>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Por cobrar</div>
          <div style={{ fontSize:20, fontWeight:700, color:'var(--green)' }}>{formatCLP(totalPorCobrar)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="toggle-row" style={{ marginBottom:16 }}>
        {[['activas','Activas'], ['pagadas','Pagadas'], ['todos','Todas']].map(([val, label]) => (
          <button key={val} className={`toggle-btn ${filtro === val ? 'active-entrada' : ''}`}
            onClick={() => setFiltro(val)}>{label}</button>
        ))}
      </div>

      {/* Lista */}
      {deudasFiltradas.length === 0 ? (
        <div style={{ color:'var(--muted)', textAlign:'center', padding:40, fontSize:14 }}>
          {deudas.length === 0 ? 'Sin cuentas registradas.' : 'Sin cuentas en este filtro.'}
        </div>
      ) : (
        deudasFiltradas.map(d => (
          <DeudaCard
            key={d.id}
            deuda={d}
            abonos={getAbonos(d.id)}
            onEdit={setModal}
            onAbono={(deuda, saldo) => setAbonoModal({ deuda, saldoPendiente: saldo })}
            onDelete={setConfirmar}
            onTogglePagada={handleTogglePagada}
          />
        ))
      )}
    </div>
  )
}
