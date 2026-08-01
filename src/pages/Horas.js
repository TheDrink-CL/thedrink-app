import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import { descargarCSV, BotonExportar } from '../lib/exportar'

// ─── Helpers ───────────────────────────────────────────────────────────────
function hhmmToMin(s) {
  if (!s) return 0
  const [h, m] = s.split(':').map(Number)
  return h * 60 + (m || 0)
}
function horasEntre(inicio, fin) {
  const mi = hhmmToMin(inicio), mf = hhmmToMin(fin)
  return mf > mi ? (mf - mi) / 60 : 0
}
// ¿El bloque cruza medianoche? (fin menor o igual al inicio, pero ambos válidos)
function cruzaMedianoche(inicio, fin) {
  if (!inicio || !fin) return false
  return hhmmToMin(fin) <= hhmmToMin(inicio)
}
// Total de horas considerando cruce (suma 24h si fin <= inicio)
function horasTotalCruce(inicio, fin) {
  if (!inicio || !fin) return 0
  const mi = hhmmToMin(inicio), mf = hhmmToMin(fin)
  if (mf > mi) return (mf - mi) / 60
  // Cruza medianoche: del inicio hasta 24:00 + de 00:00 hasta fin
  return ((24 * 60 - mi) + mf) / 60
}
// Suma N días a una fecha ISO "YYYY-MM-DD" sin desfases de zona horaria
function sumarDiasISO(fechaISO, n) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}
// Devuelve 1 o 2 payloads para insertar. Si cruza medianoche, parte en dos:
// bloque A: (fecha, inicio → 23:59) y bloque B: (fecha+1, 00:00 → fin)
function construirPayloads(base, fecha, horaInicio, horaFin) {
  if (!cruzaMedianoche(horaInicio, horaFin)) {
    return [{ ...base, fecha, hora_inicio: horaInicio, hora_fin: horaFin }]
  }
  return [
    { ...base, fecha,                       hora_inicio: horaInicio, hora_fin: '23:59' },
    { ...base, fecha: sumarDiasISO(fecha, 1), hora_inicio: '00:00',    hora_fin: horaFin },
  ]
}
function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function inicioSemanaISO() {
  const d = new Date()
  const dia = d.getDay()
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
function diasAtras(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Modal nuevo/editar bloque ──────────────────────────────────────────────
function BloqueModal({ bloque, personas, roles, prefill, onSave, onCancel }) {
  // Prefill viene de atajos rápidos: {persona_id, rol_id, hora_inicio, hora_fin, descripcion}
  const [fecha, setFecha] = useState(bloque?.fecha || prefill?.fecha || hoyISO())
  const [horaInicio, setHoraInicio] = useState(bloque?.hora_inicio || prefill?.hora_inicio || '')
  const [horaFin, setHoraFin] = useState(bloque?.hora_fin || prefill?.hora_fin || '')
  const [personaId, setPersonaId] = useState(bloque?.persona_id ?? prefill?.persona_id ?? (personas[0]?.id ?? ''))
  const [rolId, setRolId] = useState(bloque?.rol_id ?? prefill?.rol_id ?? (roles[0]?.id ?? ''))
  const [descripcion, setDescripcion] = useState(bloque?.descripcion || prefill?.descripcion || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!horaInicio || !horaFin) { setError('Necesitas hora de inicio y fin'); return }
    if (horaInicio === horaFin) { setError('La hora fin debe ser distinta del inicio'); return }
    if (!personaId) { setError('Elige quién trabajó'); return }
    if (!rolId) { setError('Elige el rol'); return }
    setSaving(true); setError('')
    const base = {
      persona_id: personaId,
      rol_id: rolId,
      descripcion: descripcion.trim() || null,
    }
    // Si cruza medianoche, parte en dos bloques (uno por día). Esto mantiene
    // los reportes por día exactos y respeta el CHECK fin > inicio del SQL.
    const payloads = construirPayloads(base, fecha, horaInicio, horaFin)

    // En edit: insertar primero los nuevos (1 o 2) y solo si el insert tuvo
    // éxito, borrar el original. Así nunca se pierde el bloque original si
    // el insert falla.
    // En insert: solo insertar.
    const { error: err } = await supabase.from('horas_trabajadas').insert(payloads)
    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }
    if (bloque?.id) {
      const { error: delErr } = await supabase.from('horas_trabajadas').delete().eq('id', bloque.id)
      if (delErr) {
        setSaving(false)
        setError('Se guardó el nuevo bloque, pero no se pudo borrar el original: puede haber quedado duplicado. ' + delErr.message)
        return
      }
    }
    setSaving(false)
    onSave()
  }

  const horas = horaInicio && horaFin ? horasTotalCruce(horaInicio, horaFin) : 0
  const cruza = cruzaMedianoche(horaInicio, horaFin)
  const rolSeleccionado = roles.find(r => r.id === rolId)
  const personaSeleccionada = personas.find(p => p.id === personaId)
  // Tarifa: persona primero, rol como fallback
  const tarifaUsada = (personaSeleccionada?.tarifa_hora != null && !isNaN(parseFloat(personaSeleccionada.tarifa_hora)))
    ? parseFloat(personaSeleccionada.tarifa_hora)
    : (rolSeleccionado?.tarifa_hora || 0)
  const costoEstimado = horas * tarifaUsada

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:380, width:'100%', marginTop:24 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)', marginBottom:18 }}>
          {bloque?.id ? 'Editar bloque' : 'Registrar bloque'}
        </div>

        <div className="form-group">
          <label className="form-label">Quién trabajó</label>
          <div className="chip-row">
            {personas.map(p => (
              <button key={p.id} type="button"
                className={`chip ${personaId === p.id ? 'selected' : ''}`}
                onClick={() => setPersonaId(p.id)}>{p.nombre}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Rol</label>
          <div className="chip-row">
            {roles.map(r => (
              <button key={r.id} type="button"
                className={`chip ${rolId === r.id ? 'selected' : ''}`}
                onClick={() => setRolId(r.id)}
                style={rolId === r.id && r.color ? { background: r.color + '22', color: r.color, borderColor: r.color } : {}}>
                {r.nombre}
              </button>
            ))}
          </div>
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
          <div style={{ textAlign:'center', marginBottom:14 }}>
            <div style={{ fontSize:12, color:'var(--cyan)' }}>
              = {horas.toFixed(1)} horas
              {tarifaUsada > 0 && ` · costo oportunidad ${formatCLP(costoEstimado)}`}
            </div>
            {cruza && (
              <div style={{ fontSize:11, color:'#f59e0b', marginTop:4, lineHeight:1.5 }}>
                🌙 Cruza medianoche: se guardará como 2 bloques (uno por día) para que los reportes por día queden exactos.
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Qué hicieron — opcional</label>
          <input type="text" className="form-input" value={descripcion}
            placeholder="ej: producción 12 mojitos, viaje Lider..."
            onChange={e => setDescripcion(e.target.value)} />
        </div>

        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}

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

// ─── Modal: editar personas y tarifas por rol ──────────────────────────────
function ConfigModal({ personas, roles, onSave, onCancel }) {
  const [persEdit, setPersEdit] = useState(personas.map(p => ({ ...p })))
  const [rolesEdit, setRolesEdit] = useState(roles.map(r => ({ ...r })))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    // IDs originales que ya no están en persEdit → desactivar (no borrar, mantiene historial)
    const idsActuales = new Set(persEdit.filter(p => p.id).map(p => p.id))
    const aDesactivar = personas.filter(p => !idsActuales.has(p.id))
    // Personas nuevas (sin id) → insertar
    const aInsertar = persEdit.filter(p => !p.id && p.nombre.trim())
    // Personas existentes → actualizar nombre
    const aActualizar = persEdit.filter(p => p.id)

    // Helper: parsea tarifa o devuelve null si está vacía (cae al fallback del rol)
    const parseTarifa = (v) => {
      if (v === '' || v == null) return null
      const n = parseFloat(v)
      return isNaN(n) ? null : n
    }
    await Promise.all([
      ...aActualizar.map(p => supabase.from('personas').update({
        nombre: p.nombre,
        tarifa_hora: parseTarifa(p.tarifa_hora),
      }).eq('id', p.id)),
      ...aDesactivar.map(p => supabase.from('personas').update({ activa: false }).eq('id', p.id)),
      ...(aInsertar.length > 0
        ? [supabase.from('personas').insert(aInsertar.map((p, idx) => ({
            nombre: p.nombre.trim(),
            activa: true,
            orden: personas.length + idx + 1,
            tarifa_hora: parseTarifa(p.tarifa_hora),
          })))]
        : []),
      ...rolesEdit.map(r => supabase.from('roles').update({ tarifa_hora: parseFloat(r.tarifa_hora) || 0 }).eq('id', r.id)),
    ])
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:420, width:'100%', marginTop:24 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>
          Personas y tarifas
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>
          Agrega, edita o quita miembros del equipo. Si dejas la tarifa de una persona vacía, se usa la del rol. Si la pones distinta (ej. ayudante a $4.000/h), eso aplica a TODOS sus bloques.
        </div>

        <div style={{ fontSize:11, color:'var(--cyan)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:8 }}>Personas</div>
        {persEdit.map((p, i) => (
          <div key={p.id || `nueva_${i}`} style={{ marginBottom:10, padding:10, background:'rgba(255,255,255,0.03)', borderRadius:10 }}>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
              <input type="text" className="form-input" value={p.nombre}
                placeholder={!p.id ? 'Nombre de la persona' : ''}
                style={{ flex:1, fontSize:13 }}
                onChange={e => setPersEdit(prev => prev.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))} />
              {persEdit.length > 1 && (
                <button type="button"
                  onClick={() => setPersEdit(prev => prev.filter((_, idx) => idx !== i))}
                  style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:18, padding:'0 6px', lineHeight:1 }}
                  title="Quitar persona">×</button>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'var(--muted)', flex:'0 0 auto' }}>Tarifa $/h:</span>
              <input type="number" className="form-input" value={p.tarifa_hora ?? ''}
                placeholder="usa la del rol si dejas vacío"
                style={{ flex:1, fontSize:12, padding:'6px 8px' }}
                onChange={e => setPersEdit(prev => prev.map((x, idx) => idx === i ? { ...x, tarifa_hora: e.target.value } : x))} />
            </div>
          </div>
        ))}
        <button type="button"
          onClick={() => setPersEdit(prev => [...prev, { nombre: '', id: null }])}
          style={{
            width:'100%', background:'rgba(0,180,180,0.06)', border:'1px dashed var(--cyan-dim)',
            borderRadius:10, padding:'8px 0', color:'var(--cyan)', cursor:'pointer',
            fontSize:13, marginTop:4,
          }}>
          + Agregar persona
        </button>

        <div style={{ fontSize:11, color:'var(--cyan)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginTop:16, marginBottom:4 }}>Tarifa por rol ($/hora) — fallback</div>
        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8, lineHeight:1.5 }}>Se usa solo cuando la persona del bloque no tiene tarifa propia configurada arriba.</div>
        {rolesEdit.map((r, i) => (
          <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <span style={{ fontSize:13, color: r.color || 'var(--text)', flex:1, fontWeight:600 }}>{r.nombre}</span>
            <input type="number" className="form-input" value={r.tarifa_hora}
              style={{ width:110, fontSize:13 }}
              onChange={e => setRolesEdit(prev => prev.map((x, idx) => idx === i ? { ...x, tarifa_hora: e.target.value } : x))} />
          </div>
        ))}

        <div style={{ display:'flex', gap:10, marginTop:18 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: gestionar atajos ────────────────────────────────────────────────
function AtajosModal({ atajos, personas, roles, onSave, onCancel }) {
  const [lista, setLista] = useState(atajos.map(a => ({ ...a, _nuevo: false })))
  const [saving, setSaving] = useState(false)

  const agregar = () => {
    setLista(prev => [...prev, {
      _nuevo: true, _localId: Date.now(),
      nombre: '', persona_id: personas[0]?.id, rol_id: roles[0]?.id,
      hora_inicio: '20:00', hora_fin: '24:00', descripcion: '',
    }])
  }
  const quitar = (idx) => setLista(prev => prev.filter((_, i) => i !== idx))
  const update = (idx, campo, valor) =>
    setLista(prev => prev.map((a, i) => i === idx ? { ...a, [campo]: valor } : a))

  const handleSave = async () => {
    setSaving(true)
    // borrar los que ya no estan
    const idsActuales = new Set(lista.filter(a => a.id).map(a => a.id))
    const aBorrar = atajos.filter(a => !idsActuales.has(a.id)).map(a => a.id)
    if (aBorrar.length > 0) await supabase.from('atajos_horas').delete().in('id', aBorrar)
    // upsert los demas
    for (const a of lista) {
      if (!a.nombre.trim()) continue
      const payload = {
        nombre: a.nombre.trim(),
        persona_id: a.persona_id,
        rol_id: a.rol_id,
        hora_inicio: a.hora_inicio || null,
        hora_fin: a.hora_fin || null,
        descripcion: a.descripcion?.trim() || null,
      }
      if (a.id) {
        await supabase.from('atajos_horas').update(payload).eq('id', a.id)
      } else {
        await supabase.from('atajos_horas').insert(payload)
      }
    }
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:480, width:'100%', marginTop:24 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>
          Atajos rápidos
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18, lineHeight:1.6 }}>
          Botones de 1 toque para tus turnos típicos. Al tocar uno se precarga el formulario con los datos del atajo.
        </div>

        {lista.length === 0 && (
          <div style={{ color:'var(--muted)', textAlign:'center', padding:16, fontSize:13 }}>
            Sin atajos aún. Agrega uno con el botón de abajo.
          </div>
        )}

        {lista.map((a, i) => (
          <div key={a.id || a._localId} style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:12, marginBottom:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>Atajo {i+1}</span>
              <button onClick={() => quitar(i)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16, lineHeight:1, padding:0 }}>×</button>
            </div>
            <input type="text" className="form-input" value={a.nombre} placeholder="Nombre del atajo (ej: Operación tú 20-24)"
              style={{ marginBottom:8, fontSize:13 }}
              onChange={e => update(i, 'nombre', e.target.value)} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
              <select className="form-select" value={a.persona_id || ''} onChange={e => update(i, 'persona_id', e.target.value ? Number(e.target.value) : null)}>
                {personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select className="form-select" value={a.rol_id || ''} onChange={e => update(i, 'rol_id', e.target.value ? Number(e.target.value) : null)}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <input type="time" className="form-input" value={a.hora_inicio || ''} placeholder="Inicio"
                onChange={e => update(i, 'hora_inicio', e.target.value)} />
              <input type="time" className="form-input" value={a.hora_fin || ''} placeholder="Fin"
                onChange={e => update(i, 'hora_fin', e.target.value)} />
            </div>
          </div>
        ))}

        <button onClick={agregar} style={{
          width:'100%', background:'rgba(0,180,180,0.06)', border:'1px dashed var(--cyan-dim)',
          borderRadius:10, padding:'10px 0', color:'var(--cyan)', cursor:'pointer', fontSize:13, marginTop:6, marginBottom:12,
        }}>+ Agregar atajo</button>

        <div style={{ display:'flex', gap:10 }}>
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
  const [personas, setPersonas] = useState([])
  const [roles, setRoles] = useState([])
  const [atajos, setAtajos] = useState([])
  const [ingresoTotal, setIngresoTotal] = useState(0)
  const [fechaInicioCalculo, setFechaInicioCalculo] = useState(null)
  const [ventasData, setVentasData] = useState([])
  const [ordenesData, setOrdenesData] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)           // null | 'nuevo' | bloque
  const [prefillModal, setPrefillModal] = useState(null) // atajo seleccionado
  const [configAbierto, setConfigAbierto] = useState(false)
  const [atajosAbierto, setAtajosAbierto] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: hrs }, { data: pers }, { data: rs }, { data: ats }, { data: vts }, { data: ords }] = await Promise.all([
      supabase.from('horas_trabajadas').select('*').order('fecha', { ascending: false }).order('hora_inicio', { ascending: false }),
      supabase.from('personas').select('*').eq('activa', true).order('orden'),
      supabase.from('roles').select('*').eq('activo', true).order('orden'),
      supabase.from('atajos_horas').select('*').order('orden').order('id'),
      supabase.from('ventas').select('fecha, litros, precio_venta, delivery, orden_id'),
      supabase.from('ordenes').select('id, fecha, hora'),
    ])
    setBloques(hrs || [])
    setPersonas(pers || [])
    setRoles(rs || [])
    setAtajos(ats || [])
    // Para que el "ingreso por hora" no quede inflado: usar solo ingresos
    // desde la fecha del primer bloque registrado. Si no hay bloques, queda 0.
    const fechaMinBloque = (hrs || []).reduce((min, b) => (!min || b.fecha < min) ? b.fecha : min, null)
    const vtsRelevantes = fechaMinBloque
      ? (vts || []).filter(v => v.fecha && v.fecha >= fechaMinBloque)
      : []
    setIngresoTotal(vtsRelevantes.reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0))
    setFechaInicioCalculo(fechaMinBloque)
    setVentasData(vts || [])
    setOrdenesData(ords || [])

    // Sincronizar config.horas_trabajadas_total y costo_hora_operador para
    // que el Dashboard calcule margen neto sin re-hacer toda la lógica.
    // costo_hora_operador = costo oportunidad total / horas totales (promedio ponderado)
    const totalHoras = (hrs || []).reduce((s, b) => s + horasEntre(b.hora_inicio, b.hora_fin), 0)
    const rolMap = {}
    ;(rs || []).forEach(r => { rolMap[r.id] = r.tarifa_hora })
    const costoTotal = (hrs || []).reduce((s, b) => {
      const h = horasEntre(b.hora_inicio, b.hora_fin)
      const tarifa = rolMap[b.rol_id] || 0
      return s + h * tarifa
    }, 0)
    const tarifaPromedio = totalHoras > 0 ? costoTotal / totalHoras : 0

    await Promise.all([
      upsertConfig('horas_trabajadas_total', totalHoras),
      upsertConfig('costo_hora_operador', tarifaPromedio),
    ])

    setLoading(false)
  }

  async function upsertConfig(clave, valor) {
    const { data: existe } = await supabase.from('config').select('clave').eq('clave', clave).maybeSingle()
    if (existe) {
      await supabase.from('config').update({ valor }).eq('clave', clave)
    } else {
      await supabase.from('config').insert({ clave, valor })
    }
  }

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleEliminar = async (id) => {
    await supabase.from('horas_trabajadas').delete().eq('id', id)
    setConfirmar(null)
    showToast('Bloque eliminado')
    load()
  }

  const usarAtajo = (atajo) => {
    setPrefillModal({
      persona_id: atajo.persona_id,
      rol_id: atajo.rol_id,
      hora_inicio: atajo.hora_inicio || '',
      hora_fin: atajo.hora_fin || '',
      descripcion: atajo.descripcion || '',
    })
    setModal('nuevo')
  }

  // Maps para lookup rápido
  const personaPorId = {}; personas.forEach(p => { personaPorId[p.id] = p })
  const rolPorId = {}; roles.forEach(r => { rolPorId[r.id] = r })

  // Cálculos
  const inicioSem = inicioSemanaISO()
  const inicioMes = inicioMesISO()
  const horasBloque = b => horasEntre(b.hora_inicio, b.hora_fin)
  // Tarifa $/h: la propia de la persona si existe; si no, la del rol.
  const tarifaDeBloque = b => {
    const pTar = personaPorId[b.persona_id]?.tarifa_hora
    if (pTar != null && pTar !== '' && !isNaN(parseFloat(pTar))) return parseFloat(pTar)
    return rolPorId[b.rol_id]?.tarifa_hora || 0
  }
  const costoBloque = b => horasBloque(b) * tarifaDeBloque(b)

  const totalHoras = bloques.reduce((s, b) => s + horasBloque(b), 0)
  const horasSemana = bloques.filter(b => b.fecha >= inicioSem).reduce((s, b) => s + horasBloque(b), 0)
  const horasMes = bloques.filter(b => b.fecha >= inicioMes).reduce((s, b) => s + horasBloque(b), 0)
  const costoOportTotal = bloques.reduce((s, b) => s + costoBloque(b), 0)
  const ingresoPorHora = totalHoras > 0 ? ingresoTotal / totalHoras : 0

  // Por persona
  // Construir índice de pedidos por (fecha, hora) para cruzar con bloques.
  // Cada bloque cuenta TODOS los pedidos que cayeron dentro de su ventana (no se divide).
  function pedidosDeBloque(b) {
    if (!b.fecha || !b.hora_inicio || !b.hora_fin) return []
    const ini = hhmmToMin(b.hora_inicio)
    const fin = hhmmToMin(b.hora_fin)
    return ordenesData.filter(o => {
      if (o.fecha !== b.fecha) return false
      if (!o.hora) return false
      const m = hhmmToMin(o.hora)
      return m >= ini && m <= fin
    })
  }
  // Para cada orden traigo su monto total desde las ventas asociadas
  const ventasPorOrden = {}
  ventasData.forEach(v => {
    if (!v.orden_id) return
    if (!ventasPorOrden[v.orden_id]) ventasPorOrden[v.orden_id] = 0
    ventasPorOrden[v.orden_id] += (v.litros || 1) * (v.precio_venta || 0) - (v.delivery || 0)
  })

  const porPersona = personas.map(p => {
    const bs = bloques.filter(b => b.persona_id === p.id)
    const horas = bs.reduce((s, b) => s + horasBloque(b), 0)
    const costo = bs.reduce((s, b) => s + costoBloque(b), 0)
    // Pedidos atribuidos: todos los que cayeron en sus bloques
    const pedidosUnicos = new Set()
    let ingresosTurnos = 0
    bs.forEach(b => {
      const peds = pedidosDeBloque(b)
      peds.forEach(o => {
        if (!pedidosUnicos.has(o.id)) {
          pedidosUnicos.add(o.id)
          ingresosTurnos += ventasPorOrden[o.id] || 0
        }
      })
    })
    const ingresoPorHora = horas > 0 ? ingresosTurnos / horas : 0
    return {
      ...p, horas, costo,
      pedidosTurnos: pedidosUnicos.size,
      ingresosTurnos,
      ingresoPorHora,
    }
  })

  // Por rol (ultimos 30 dias para mostrar mix actual)
  const hace30 = diasAtras(30)
  const porRol = roles.map(r => {
    const bs = bloques.filter(b => b.rol_id === r.id && b.fecha >= hace30)
    const horas = bs.reduce((s, b) => s + horasBloque(b), 0)
    return { ...r, horas }
  }).filter(r => r.horas > 0).sort((a, b) => b.horas - a.horas)
  const totalRol30 = porRol.reduce((s, r) => s + r.horas, 0) || 1

  // ¿Registró algo hoy?
  const horasHoy = bloques.filter(b => b.fecha === hoyISO()).reduce((s, b) => s + horasBloque(b), 0)
  const bloquesAyer = bloques.filter(b => b.fecha === diasAtras(1))

  // Agrupar por fecha para la lista
  const porFecha = {}
  bloques.forEach(b => {
    if (!porFecha[b.fecha]) porFecha[b.fecha] = []
    porFecha[b.fecha].push(b)
  })
  const fechasOrdenadas = Object.keys(porFecha).sort((a, b) => b.localeCompare(a))

  if (loading) return <div className="loading">Cargando...</div>

  // Caso bootstrap: no hay personas o roles
  if (personas.length === 0 || roles.length === 0) {
    return (
      <div className="page">
        <div className="page-title">Horas</div>
        <div className="card" style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>
          Aún no se han cargado las personas y roles del equipo. Si recién corriste la migración, recarga la app.
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {modal && (
        <BloqueModal
          bloque={modal === 'nuevo' ? null : modal}
          personas={personas} roles={roles}
          prefill={prefillModal}
          onSave={() => { setModal(null); setPrefillModal(null); showToast(modal === 'nuevo' ? 'Bloque registrado ✓' : 'Bloque actualizado ✓'); load() }}
          onCancel={() => { setModal(null); setPrefillModal(null) }}
        />
      )}
      {configAbierto && (
        <ConfigModal personas={personas} roles={roles}
          onSave={() => { setConfigAbierto(false); showToast('Guardado ✓'); load() }}
          onCancel={() => setConfigAbierto(false)} />
      )}
      {atajosAbierto && (
        <AtajosModal atajos={atajos} personas={personas} roles={roles}
          onSave={() => { setAtajosAbierto(false); showToast('Atajos guardados ✓'); load() }}
          onCancel={() => setAtajosAbierto(false)} />
      )}
      {confirmar && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:24 }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:320, width:'100%' }}>
            <div style={{ fontSize:14, color:'var(--text)', marginBottom:20, lineHeight:1.5 }}>
              ¿Eliminar este bloque?
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
              const headers = ['Fecha','Persona','Rol','Inicio','Fin','Horas','Tarifa $/h','Costo','Descripción']
              const rows = bloques.map(b => [
                b.fecha,
                personaPorId[b.persona_id]?.nombre || '',
                rolPorId[b.rol_id]?.nombre || '',
                b.hora_inicio, b.hora_fin,
                horasBloque(b).toFixed(2),
                tarifaDeBloque(b),
                Math.round(costoBloque(b)),
                b.descripcion || '',
              ])
              descargarCSV('thedrink_horas', headers, rows)
            }} />
          )}
          <button className="btn btn-primary btn-sm" onClick={() => { setPrefillModal(null); setModal('nuevo') }}>+ Bloque</button>
        </div>
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
        Tiempo dedicado a The Drink — producción, delivery, compras, marketing, aseo. Las pausas no cuentan, se modelan como gaps entre bloques.
      </div>

      {/* Recordatorio hoy */}
      {horasHoy === 0 && bloquesAyer.length > 0 && (
        <div style={{
          background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.3)',
          borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12,
          color:'#f59e0b', lineHeight:1.6,
        }}>
          ⏱️ Hoy aún no registras horas. Ayer registraste {bloquesAyer.reduce((s,b)=>s+horasBloque(b),0).toFixed(1)}h.
        </div>
      )}

      {/* Atajos */}
      {atajos.length > 0 && (
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div className="card-title" style={{ margin:0 }}>Atajos rápidos</div>
            <button onClick={() => setAtajosAbierto(true)}
              style={{ background:'none', border:'1px solid var(--border)', borderRadius:7, color:'var(--muted)', cursor:'pointer', fontSize:11, padding:'3px 9px' }}>
              ⚙️ Editar
            </button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {atajos.map(a => {
              const rol = rolPorId[a.rol_id]
              const persona = personaPorId[a.persona_id]
              const color = rol?.color || 'var(--cyan)'
              return (
                <button key={a.id} onClick={() => usarAtajo(a)}
                  style={{
                    background: color + '15', border: `1px solid ${color}66`,
                    borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                    color: color, fontSize: 12, fontWeight: 600,
                    textAlign: 'left', lineHeight: 1.4, flex: '1 1 auto',
                  }}>
                  <div style={{ fontWeight:700 }}>{a.nombre}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                    {persona?.nombre} · {rol?.nombre}
                    {a.hora_inicio && a.hora_fin && ` · ${a.hora_inicio.slice(0,5)}–${a.hora_fin.slice(0,5)}`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {atajos.length === 0 && (
        <div className="card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
            Crea atajos para tus turnos típicos y registra horas con 1 toque.
          </div>
          <button onClick={() => setAtajosAbierto(true)}
            style={{ background:'rgba(0,180,180,0.1)', border:'1px solid var(--cyan-dim)', borderRadius:8, color:'var(--cyan)', cursor:'pointer', fontSize:11, padding:'5px 10px', flexShrink:0 }}>
            + Crear atajos
          </button>
        </div>
      )}

      {/* KPIs globales */}
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
          <div className="kpi-label">Costo oportunidad</div>
          <div className="kpi-value" style={{ color: 'var(--purple)' }}>{formatCLP(costoOportTotal)}</div>
          <div className="kpi-sub">acumulado</div>
        </div>
      </div>

      {/* Ingreso por hora */}
      {totalHoras > 0 && (
        <div className="card" style={{
          background: ingresoPorHora >= (costoOportTotal/totalHoras) ? 'rgba(34,197,94,0.05)' : 'rgba(196,0,90,0.05)',
          border: `1px solid ${ingresoPorHora >= (costoOportTotal/totalHoras) ? 'rgba(34,197,94,0.3)' : 'rgba(196,0,90,0.3)'}`,
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
            <div className="card-title" style={{ margin:0 }}>Ingreso por hora</div>
            <div style={{ fontSize:18, fontWeight:800, color: ingresoPorHora >= (costoOportTotal/totalHoras) ? 'var(--green)' : 'var(--pink)' }}>
              {formatCLP(ingresoPorHora)}/h
            </div>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.7 }}>
            Tu hora promedio en The Drink genera <strong style={{ color:'var(--text)' }}>{formatCLP(ingresoPorHora)}</strong> de ingreso bruto vs tu tarifa ponderada de <strong style={{ color:'#AFA9EC' }}>{formatCLP(costoOportTotal/totalHoras)}</strong>/h.
            {ingresoPorHora >= (costoOportTotal/totalHoras) ? ' El negocio paga su tiempo ✓' : ' Aún están trabajando bajo tarifa.'}
            {fechaInicioCalculo && (
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:6, fontStyle:'italic' }}>
                ⓘ Cálculo basado en ingresos desde {labelFecha(fechaInicioCalculo)} (primer bloque registrado). Los ingresos anteriores no se incluyen porque no tienen horas asociadas.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desglose por persona */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div className="card-title" style={{ margin:0 }}>Por persona</div>
          <button onClick={() => setConfigAbierto(true)}
            style={{ background:'none', border:'1px solid var(--border)', borderRadius:7, color:'var(--muted)', cursor:'pointer', fontSize:11, padding:'3px 9px' }}>
            ⚙️ Personas y tarifas
          </button>
        </div>
        {porPersona.map(p => {
          const pct = totalHoras > 0 ? p.horas / totalHoras : 0
          return (
            <div key={p.id} style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>{p.nombre}</span>
                <div style={{ textAlign:'right' }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'var(--cyan)' }}>{p.horas.toFixed(1)}h</span>
                  {p.costo > 0 && <span style={{ fontSize:11, color:'var(--muted)', marginLeft:6 }}>· {formatCLP(p.costo)}</span>}
                </div>
              </div>
              <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:4, height:5, overflow:'hidden', marginBottom:6 }}>
                <div style={{ height:'100%', background:'var(--cyan)', width:(pct*100)+'%', borderRadius:4 }} />
              </div>
              {/* Productividad: pedidos en sus turnos + ingreso/h */}
              {p.horas > 0 && (
                <div style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6,
                  background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'7px 10px',
                }}>
                  <div>
                    <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.4 }}>Pedidos</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{p.pedidosTurnos}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.4 }}>Ingreso turno</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--green)' }}>{formatCLP(p.ingresosTurnos)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.4 }}>$/hora</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--cyan)' }}>{formatCLP(p.ingresoPorHora)}</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Desglose por rol últimos 30 días */}
      {porRol.length > 0 && (
        <div className="card">
          <div className="card-title">Por rol (últimos 30 días)</div>
          {porRol.map(r => {
            const pct = r.horas / totalRol30
            return (
              <div key={r.id} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color: r.color || 'var(--text)' }}>{r.nombre}</span>
                  <span style={{ fontSize:12, color:'var(--text)', fontWeight:700 }}>
                    {r.horas.toFixed(1)}h <span style={{ color:'var(--muted)', fontWeight:400 }}>({Math.round(pct*100)}%)</span>
                  </span>
                </div>
                <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:4, height:5, overflow:'hidden' }}>
                  <div style={{ height:'100%', background: r.color || 'var(--cyan)', width:(pct*100)+'%', borderRadius:4 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lista de bloques */}
      {bloques.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:36, color:'var(--muted)' }}>
          Sin bloques aún. Toca "+ Bloque" o usa un atajo para empezar.
        </div>
      ) : (
        fechasOrdenadas.map(f => {
          const items = porFecha[f]
          const horasDia = items.reduce((s, b) => s + horasBloque(b), 0)
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
                const h = horasBloque(b)
                const persona = personaPorId[b.persona_id]
                const rol = rolPorId[b.rol_id]
                const color = rol?.color || 'var(--cyan)'
                return (
                  <div key={b.id} className="card" style={{ marginBottom:6, padding:'10px 14px', borderLeft:`3px solid ${color}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, color:'var(--text-strong)', fontWeight:700, marginBottom:2 }}>
                          {b.hora_inicio.slice(0,5)} – {b.hora_fin.slice(0,5)}
                          <span style={{ color, fontWeight:600, marginLeft:8 }}>{h.toFixed(1)}h</span>
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          {persona?.nombre || '?'} · <span style={{ color }}>{rol?.nombre || '?'}</span>
                          {b.descripcion && ` · ${b.descripcion}`}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button onClick={() => { setPrefillModal(null); setModal(b) }}
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
