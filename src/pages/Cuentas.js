import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import {
  saldoDeuda, agruparPorContraparte, construirPlan, claveContraparte, SIN_CONTRAPARTE,
} from '../lib/cuentas'

const TIPOS = ['pagar', 'cobrar']
const TIPO_LABEL = { pagar: '💸 Por pagar', cobrar: '💰 Por cobrar' }
const TIPO_COLOR = {
  pagar: { bg: 'rgba(239,68,68,0.10)', color: 'var(--pink)', border: 'rgba(239,68,68,0.25)' },
  cobrar: { bg: 'rgba(16,185,129,0.10)', color: 'var(--green)', border: 'rgba(16,185,129,0.25)' },
}

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const nuevoGrupoId = () =>
  (globalThis.crypto?.randomUUID?.() || `liq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

// La columna `grupo_id` llega con la migración 20260901_cuentas_liquidaciones.
// Si todavía no se corrió, guardamos igual: se pierde la agrupación (y con
// ella el "deshacer movimiento"), no el abono.
async function insertarAbonos(filas) {
  let { error } = await supabase.from('abonos').insert(filas)
  if (error && /grupo_id/i.test(error.message || '')) {
    const sinGrupo = filas.map(({ grupo_id, ...resto }) => resto)
    const reintento = await supabase.from('abonos').insert(sinGrupo)
    error = reintento.error
  }
  return error
}

// Tras borrar abonos hay que reabrir las deudas que volvieron a tener saldo.
async function reabrirSiCorresponde(deudaIds) {
  if (!deudaIds.length) return null
  const [{ data: ds }, { data: abs }] = await Promise.all([
    supabase.from('deudas').select('*').in('id', deudaIds),
    supabase.from('abonos').select('*').in('deuda_id', deudaIds),
  ])
  const reabrir = (ds || [])
    .filter(d => d.pagada && saldoDeuda(d, (abs || []).filter(a => a.deuda_id === d.id)) > 0)
    .map(d => d.id)
  if (!reabrir.length) return null
  const { error } = await supabase.from('deudas').update({ pagada: false }).in('id', reabrir)
  return error
}

function DeudaModal({ deuda, contrapartes, onSave, onCancel }) {
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
      contraparte: contraparte.trim() || null,
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
            <input type="text" className="form-input" value={contraparte} placeholder="ej: Camilo, Banco..."
              list="contrapartes-conocidas" onChange={e => setContraparte(e.target.value)} />
            <datalist id="contrapartes-conocidas">
              {(contrapartes || []).map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:-6, marginBottom:14, lineHeight:1.4 }}>
          Escribe el nombre siempre igual: así se juntan todas las cuentas de esa persona y se pueden cruzar.
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
  const [fecha, setFecha] = useState(hoyISO)
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!monto || parseFloat(monto) <= 0) return
    setSaving(true); setError('')
    const errInsert = await insertarAbonos([{
      deuda_id: deuda.id,
      monto: parseFloat(monto),
      fecha,
      nota: nota || null,
      grupo_id: null,
    }])
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

// ─── Liquidar con una contraparte ───────────────────────────────────────────
// El movimiento grande: cruza lo que me deben contra lo que debo y reparte un
// pago sobre lo que queda. Escribe abonos en varias deudas de una sola vez.

function FilaPlan({ aplicacion, color }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:12, padding:'3px 0' }}>
      <span style={{ color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {aplicacion.descripcion}
      </span>
      <span style={{ flexShrink:0 }}>
        <span style={{ color, fontWeight:600 }}>{formatCLP(aplicacion.monto)}</span>
        <span style={{ color:'var(--muted)' }}>
          {aplicacion.quedaEn === 0 ? ' · queda liquidada' : ` · quedan ${formatCLP(aplicacion.quedaEn)}`}
        </span>
      </span>
    </div>
  )
}

function LiquidarModal({ grupo, onSave, onCancel }) {
  const [compensar, setCompensar] = useState(grupo.compensable > 0)
  const [direccion, setDireccion] = useState(grupo.neto >= 0 ? 'pago' : 'cobro')
  const [montoPago, setMontoPago] = useState('')
  const [fecha, setFecha] = useState(hoyISO)
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const plan = useMemo(() => construirPlan({
    porPagar: grupo.porPagar,
    porCobrar: grupo.porCobrar,
    compensar,
    direccion,
    montoPago,
  }), [grupo, compensar, direccion, montoPago])

  const compensado = plan.compensado
  const topePago = direccion === 'cobro'
    ? grupo.totalCobrar - compensado
    : grupo.totalPagar - compensado

  const hayAlgoQueGuardar = compensado > 0 || plan.pago.monto > 0
  const verboPago = direccion === 'cobro' ? 'Me pagan' : 'Pago yo'

  const handleSave = async () => {
    if (!hayAlgoQueGuardar) return
    setSaving(true); setError('')
    const grupoId = nuevoGrupoId()
    const sufijo = nota.trim() ? ` — ${nota.trim()}` : ''
    const filas = []
    for (const a of plan.compPagar) {
      filas.push({ deuda_id: a.id, monto: a.monto, fecha, grupo_id: grupoId,
        nota: `Cruce con ${grupo.nombre}${sufijo}` })
    }
    for (const a of plan.compCobrar) {
      filas.push({ deuda_id: a.id, monto: a.monto, fecha, grupo_id: grupoId,
        nota: `Cruce con ${grupo.nombre}${sufijo}` })
    }
    for (const a of plan.pago.aplicaciones) {
      filas.push({ deuda_id: a.id, monto: a.monto, fecha, grupo_id: grupoId,
        nota: `${direccion === 'cobro' ? 'Cobro a' : 'Pago a'} ${grupo.nombre}${sufijo}` })
    }

    const errInsert = await insertarAbonos(filas)
    if (errInsert) { setSaving(false); setError(errInsert.message); return }

    const liquidadas = [...new Set(plan.liquidadas.map(a => a.id))]
    if (liquidadas.length) {
      const { error: errUpd } = await supabase.from('deudas').update({ pagada: true }).in('id', liquidadas)
      if (errUpd) { setSaving(false); setError(errUpd.message); return }
    }
    setSaving(false)
    onSave(filas.length, liquidadas.length)
  }

  const netoLinea = (neto) => neto === 0
    ? <span style={{ color:'var(--green)', fontWeight:700 }}>a mano</span>
    : <span style={{ color: neto > 0 ? 'var(--pink)' : 'var(--green)', fontWeight:700 }}>
        {neto > 0 ? 'le debo ' : 'me debe '}{formatCLP(Math.abs(neto))}
      </span>

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:16, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:440, width:'100%', margin:'20px 0' }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)' }}>
          Liquidar con {grupo.nombre}
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.45 }}>
          Ajusta las deudas de esta persona. No toca la caja de la app.
        </div>

        {/* Situación actual */}
        <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'10px 12px', marginBottom:16, fontSize:13 }}>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 0' }}>
            <span style={{ color:'var(--muted)' }}>Le debo</span>
            <span style={{ color:'var(--pink)', fontWeight:600 }}>{formatCLP(grupo.totalPagar)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 0' }}>
            <span style={{ color:'var(--muted)' }}>Me debe</span>
            <span style={{ color:'var(--green)', fontWeight:600 }}>{formatCLP(grupo.totalCobrar)}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0 0', marginTop:4, borderTop:'1px solid var(--border)' }}>
            <span style={{ color:'var(--text)' }}>Neto hoy</span>
            {netoLinea(grupo.neto)}
          </div>
        </div>

        {/* Paso 1: cruce */}
        {grupo.compensable > 0 && (
          <div
            onClick={() => setCompensar(c => !c)}
            style={{
              display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer', marginBottom:16,
              background: compensar ? 'rgba(0,180,180,0.08)' : 'rgba(255,255,255,0.03)',
              border:`1px solid ${compensar ? 'var(--cyan-dim)' : 'var(--border)'}`,
              borderRadius:10, padding:'10px 12px',
            }}>
            <div style={{
              width:18, height:18, borderRadius:5, flexShrink:0, marginTop:1,
              border:`1px solid ${compensar ? 'var(--cyan)' : 'rgba(255,255,255,0.25)'}`,
              background: compensar ? 'var(--cyan)' : 'transparent',
              color:'#000', fontSize:13, fontWeight:800, lineHeight:'17px', textAlign:'center',
            }}>{compensar ? '✓' : ''}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
                Cruzar {formatCLP(grupo.compensable)}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.4 }}>
                Lo que {grupo.nombre} me debe se descuenta de lo que yo le debo. No se transfiere plata.
              </div>
            </div>
          </div>
        )}

        {/* Paso 2: pago real */}
        <div className="form-group">
          <label className="form-label">Movimiento de plata</label>
          <div className="toggle-row" style={{ marginBottom:10 }}>
            <button type="button"
              className={`toggle-btn ${direccion === 'pago' ? 'active-salida' : ''}`}
              onClick={() => setDireccion('pago')}>Pago yo</button>
            <button type="button"
              className={`toggle-btn ${direccion === 'cobro' ? 'active-entrada' : ''}`}
              onClick={() => setDireccion('cobro')}>Me pagan</button>
          </div>
          <input type="number" className="form-input" value={montoPago}
            placeholder={topePago > 0 ? `hasta ${formatCLP(topePago)}` : 'no queda saldo de este lado'}
            onChange={e => setMontoPago(e.target.value)} />
          {topePago > 0 && (
            <div className="chip-row" style={{ marginTop:8, marginBottom:0 }}>
              <button type="button" className="chip" onClick={() => setMontoPago(String(topePago))}>
                Todo ({formatCLP(topePago)})
              </button>
              <button type="button" className="chip" onClick={() => setMontoPago(String(Math.round(topePago / 2)))}>
                Mitad
              </button>
              {montoPago !== '' && (
                <button type="button" className="chip" onClick={() => setMontoPago('')}>Sin pago</button>
              )}
            </div>
          )}
        </div>

        {plan.pago.excedente > 0 && (
          <div style={{ fontSize:12, color:'var(--pink)', marginTop:-6, marginBottom:12, lineHeight:1.4 }}>
            {formatCLP(plan.pago.excedente)} de más: sobrepasa lo que queda pendiente de ese lado y no se va a
            registrar. Si de verdad pagaste eso, crea la cuenta que falta.
          </div>
        )}

        {/* Preview */}
        {hayAlgoQueGuardar && (
          <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>
              Cómo queda
            </div>

            {compensado > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:12, color:'var(--cyan)', fontWeight:700, marginBottom:2 }}>
                  Cruce · {formatCLP(compensado)} a cada lado
                </div>
                {plan.compPagar.map(a => <FilaPlan key={`cp-${a.id}`} aplicacion={a} color="var(--cyan)" />)}
                {plan.compCobrar.map(a => <FilaPlan key={`cc-${a.id}`} aplicacion={a} color="var(--cyan)" />)}
              </div>
            )}

            {plan.pago.monto > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:2,
                  color: direccion === 'cobro' ? 'var(--green)' : 'var(--pink)' }}>
                  {verboPago} · {formatCLP(plan.pago.monto)}
                </div>
                {plan.pago.aplicaciones.map(a => (
                  <FilaPlan key={`pg-${a.id}`} aplicacion={a}
                    color={direccion === 'cobro' ? 'var(--green)' : 'var(--pink)'} />
                ))}
              </div>
            )}

            <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--muted)' }}>Neto después</span>
                {netoLinea(plan.despues.neto)}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                Le debo {formatCLP(plan.despues.pagar)} · me debe {formatCLP(plan.despues.cobrar)}
              </div>
            </div>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Nota</label>
            <input type="text" className="form-input" value={nota} placeholder="opcional"
              onChange={e => setNota(e.target.value)} />
          </div>
        </div>

        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave}
            disabled={saving || !hayAlgoQueGuardar}>
            {saving ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Saldo por persona ──────────────────────────────────────────────────────

function PersonaCard({ grupo, onLiquidar, onVerDeudas }) {
  const debo = grupo.neto > 0
  const aMano = grupo.neto === 0
  const color = aMano ? 'var(--cyan)' : debo ? 'var(--pink)' : 'var(--green)'

  return (
    <div style={{
      background:'rgba(255,255,255,0.04)', border:`1px solid ${color}33`,
      borderRadius:12, padding:'14px 16px', marginBottom:10,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15, color:'var(--text-strong)' }}>{grupo.nombre}</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
            le debo {formatCLP(grupo.totalPagar)} · me debe {formatCLP(grupo.totalCobrar)}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>
            {aMano ? 'A mano' : debo ? 'Le debo' : 'Me debe'}
          </div>
          <div style={{ fontSize:20, fontWeight:800, color }}>{formatCLP(Math.abs(grupo.neto))}</div>
        </div>
      </div>

      {grupo.compensable > 0 && (
        <div style={{ fontSize:11, color:'var(--cyan)', marginTop:8 }}>
          ⇄ Hay {formatCLP(grupo.compensable)} cruzables entre las dos puntas
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginTop:10 }}>
        <button className="btn btn-primary btn-sm" style={{ fontSize:12 }} onClick={() => onLiquidar(grupo)}>
          Liquidar
        </button>
        <button className="btn btn-secondary btn-sm" style={{ fontSize:12 }} onClick={() => onVerDeudas(grupo)}>
          Ver sus {grupo.porPagar.length + grupo.porCobrar.length} cuentas
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta de deuda ───────────────────────────────────────────────────────

function DeudaCard({ deuda, abonos, onEdit, onAbono, onDelete, onTogglePagada, onBorrarAbono, onDeshacerGrupo }) {
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
              <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:13 }}>
                <div style={{ minWidth:0 }}>
                  <span style={{ color:'var(--text)' }}>{a.fecha}</span>
                  {a.nota && <span style={{ color:'var(--muted)', marginLeft:8 }}>{a.nota}</span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span style={{ color:'var(--green)', fontWeight:600 }}>{formatCLP(a.monto)}</span>
                  <button
                    onClick={() => (a.grupo_id ? onDeshacerGrupo(a) : onBorrarAbono(a))}
                    title={a.grupo_id ? 'Deshacer el movimiento completo' : 'Borrar este abono'}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:2, fontSize:11 }}>
                    {a.grupo_id ? '↺' : '✕'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function Cuentas() {
  const [deudas, setDeudas] = useState([])
  const [abonos, setAbonos] = useState([])
  const [modal, setModal] = useState(null)
  const [abonoModal, setAbonoModal] = useState(null) // { deuda, saldoPendiente }
  const [liquidar, setLiquidar] = useState(null)     // grupo de contraparte
  const [confirmar, setConfirmar] = useState(null)   // { tipo, ...datos }
  const [filtro, setFiltro] = useState('activas')    // 'activas' | 'pagadas' | 'todos'
  const [persona, setPersona] = useState('todas')    // clave de contraparte
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

  const handleBorrarAbono = async (abono) => {
    const { error } = await supabase.from('abonos').delete().eq('id', abono.id)
    if (error) { showToast(`No se pudo borrar: ${error.message}`); return }
    const errReabrir = await reabrirSiCorresponde([abono.deuda_id])
    if (errReabrir) { showToast(`Abono borrado, pero: ${errReabrir.message}`); load(); return }
    setConfirmar(null)
    showToast('Abono borrado')
    load()
  }

  const handleDeshacerGrupo = async (abono) => {
    const delGrupo = abonos.filter(a => a.grupo_id && a.grupo_id === abono.grupo_id)
    const deudaIds = [...new Set(delGrupo.map(a => a.deuda_id))]
    const { error } = await supabase.from('abonos').delete().eq('grupo_id', abono.grupo_id)
    if (error) { showToast(`No se pudo deshacer: ${error.message}`); return }
    const errReabrir = await reabrirSiCorresponde(deudaIds)
    if (errReabrir) { showToast(`Deshecho, pero: ${errReabrir.message}`); load(); return }
    setConfirmar(null)
    showToast('Movimiento deshecho')
    load()
  }

  // Saldos por persona, sobre las cuentas activas
  const grupos = useMemo(
    () => agruparPorContraparte(deudas, (id) => abonos.filter(a => a.deuda_id === id)),
    [deudas, abonos]
  )

  const contrapartesConocidas = useMemo(() => {
    const set = new Map()
    for (const d of deudas) {
      const nombre = (d.contraparte || '').trim()
      if (nombre) set.set(claveContraparte(nombre), nombre)
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'es'))
  }, [deudas])

  const deudasFiltradas = deudas.filter(d => {
    if (filtro === 'activas' && d.pagada) return false
    if (filtro === 'pagadas' && !d.pagada) return false
    if (persona !== 'todas' && claveContraparte(d.contraparte) !== persona) return false
    return true
  })

  // Resumen financiero
  const totalPorPagar = grupos.reduce((s, g) => s + g.totalPagar, 0)
  const totalPorCobrar = grupos.reduce((s, g) => s + g.totalCobrar, 0)
  const neto = totalPorPagar - totalPorCobrar

  const listaRef = useRef(null)
  const irAPersona = (grupo) => {
    setPersona(grupo.clave)
    setFiltro('activas')
    listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {modal && (
        <DeudaModal
          deuda={modal === 'nueva' ? null : modal}
          contrapartes={contrapartesConocidas}
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

      {liquidar && (
        <LiquidarModal
          grupo={liquidar}
          onSave={(nAbonos, nLiquidadas) => {
            setLiquidar(null)
            showToast(`Liquidación aplicada ✓ ${nAbonos} abono${nAbonos === 1 ? '' : 's'}${nLiquidadas ? `, ${nLiquidadas} cuenta${nLiquidadas === 1 ? '' : 's'} al día` : ''}`)
            load()
          }}
          onCancel={() => setLiquidar(null)}
        />
      )}

      {confirmar && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:320, width:'100%' }}>
            <div style={{ fontSize:15, color:'var(--text)', marginBottom:20, lineHeight:1.5 }}>
              {confirmar.tipo === 'deuda' && `¿Eliminar "${confirmar.deuda.descripcion}"?`}
              {confirmar.tipo === 'abono' && `¿Borrar el abono de ${formatCLP(confirmar.abono.monto)} del ${confirmar.abono.fecha}?`}
              {confirmar.tipo === 'grupo' && `¿Deshacer el movimiento completo? Se borran los ${confirmar.cantidad} abonos que se crearon juntos.`}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" style={{ flex:1, background:'var(--pink)' }}
                onClick={() => {
                  if (confirmar.tipo === 'deuda') handleDelete(confirmar.deuda)
                  else if (confirmar.tipo === 'abono') handleBorrarAbono(confirmar.abono)
                  else handleDeshacerGrupo(confirmar.abono)
                }}>
                {confirmar.tipo === 'grupo' ? 'Deshacer' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div className="page-title" style={{ margin:0 }}>Cuentas</div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('nueva')}>+ Nueva</button>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16, lineHeight:1.45 }}>
        Deudas y cobros para cuadrar el banco. Nada de acá toca la caja de la app.
      </div>

      {/* Resumen */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'12px 14px' }}>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Por pagar</div>
          <div style={{ fontSize:20, fontWeight:700, color:'var(--pink)' }}>{formatCLP(totalPorPagar)}</div>
        </div>
        <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, padding:'12px 14px' }}>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>Por cobrar</div>
          <div style={{ fontSize:20, fontWeight:700, color:'var(--green)' }}>{formatCLP(totalPorCobrar)}</div>
        </div>
      </div>
      <div style={{
        background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)',
        borderRadius:12, padding:'12px 14px', marginBottom:18,
        display:'flex', justifyContent:'space-between', alignItems:'center',
      }}>
        <div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>
            {neto === 0 ? 'Todo a mano' : neto > 0 ? 'Neto por pagar' : 'Neto por cobrar'}
          </div>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
            Lo que hay que mover en el banco si se cruza todo
          </div>
        </div>
        <div style={{ fontSize:24, fontWeight:800, color: neto === 0 ? 'var(--cyan)' : neto > 0 ? 'var(--pink)' : 'var(--green)' }}>
          {formatCLP(Math.abs(neto))}
        </div>
      </div>

      {/* Saldos por persona */}
      {grupos.length > 0 && (
        <>
          <div className="section-divider">Saldos por persona</div>
          {grupos.map(g => (
            <PersonaCard key={g.clave} grupo={g} onLiquidar={setLiquidar} onVerDeudas={irAPersona} />
          ))}
        </>
      )}

      {/* Filtros */}
      <div className="section-divider" ref={listaRef}>Todas las cuentas</div>
      <div className="toggle-row" style={{ marginBottom:10 }}>
        {[['activas','Activas'], ['pagadas','Pagadas'], ['todos','Todas']].map(([val, label]) => (
          <button key={val} className={`toggle-btn ${filtro === val ? 'active-entrada' : ''}`}
            onClick={() => setFiltro(val)}>{label}</button>
        ))}
      </div>
      {contrapartesConocidas.length > 0 && (
        <div className="chip-row">
          <button className={`chip ${persona === 'todas' ? 'selected' : ''}`}
            onClick={() => setPersona('todas')}>Todas</button>
          {contrapartesConocidas.map(nombre => {
            const clave = claveContraparte(nombre)
            return (
              <button key={clave} className={`chip ${persona === clave ? 'selected' : ''}`}
                onClick={() => setPersona(clave)}>{nombre}</button>
            )
          })}
          {deudas.some(d => claveContraparte(d.contraparte) === SIN_CONTRAPARTE) && (
            <button className={`chip ${persona === SIN_CONTRAPARTE ? 'selected' : ''}`}
              onClick={() => setPersona(SIN_CONTRAPARTE)}>Sin contraparte</button>
          )}
        </div>
      )}

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
            onDelete={(deuda) => setConfirmar({ tipo:'deuda', deuda })}
            onTogglePagada={handleTogglePagada}
            onBorrarAbono={(abono) => setConfirmar({ tipo:'abono', abono })}
            onDeshacerGrupo={(abono) => setConfirmar({
              tipo:'grupo', abono,
              cantidad: abonos.filter(a => a.grupo_id === abono.grupo_id).length,
            })}
          />
        ))
      )}
    </div>
  )
}
