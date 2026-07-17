import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { descontarStock, reintegrarStock } from '../lib/inventario'
import { formatCLP } from '../lib/calculos'
import { descargarCSV, BotonExportar } from '../lib/exportar'

// ─── Modal ticket de pedido ──────────────────────────────────────────────────
function TicketModal({ orden, onCerrar }) {
  const total = (orden.ventas || []).reduce((s, v) => s + (v.litros||1) * (v.precio_venta||0), 0)
  const neto = total - (orden.delivery || 0) + (orden.delivery_cobrado || 0)

  const medioPagoLabel = {
    transferencia: '🏦 Transferencia', debito: '💳 Débito',
    credito: '💳 Crédito', efectivo: '💵 Efectivo'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 300, padding: 24
    }}>
      <div style={{
        background: '#0e0e12', border: '1px solid rgba(0,180,180,0.3)',
        borderRadius: 18, padding: 28, maxWidth: 340, width: '100%',
        boxShadow: '0 0 60px rgba(0,180,180,0.08)'
      }}>
        {/* Cabecera */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 22, fontWeight: 900, color: 'var(--cyan)', letterSpacing: 2, marginBottom: 4 }}>
            THE DRINK
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
            {orden.fecha}{orden.hora ? ` · ${orden.hora}` : ''}
          </div>
          {orden.cliente_nombre && (
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', marginTop: 6 }}>
              {orden.cliente_nombre}
            </div>
          )}
        </div>

        {/* Divisor */}
        <div style={{ borderTop: '1px dashed rgba(255,255,255,0.12)', marginBottom: 16 }} />

        {/* Items */}
        {(orden.ventas || []).map((v, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{v.receta_nombre}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.litros}L × {formatCLP(v.precio_venta)}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
              {formatCLP(v.litros * v.precio_venta)}
            </div>
          </div>
        ))}

        {/* Divisor */}
        <div style={{ borderTop: '1px dashed rgba(255,255,255,0.12)', marginTop: 12, marginBottom: 12 }} />

        {/* Totales */}
        {(orden.delivery > 0 || orden.delivery_cobrado > 0) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'var(--muted)' }}>
            <span>Subtotal</span>
            <span>{formatCLP(total)}</span>
          </div>
        )}
        {orden.delivery > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'var(--muted)' }}>
            <span>
              {orden.delivery_tipo === 'motoboy' ? 'Motoboy' :
               orden.delivery_tipo === 'otro' ? 'Entrega' :
               'Uber Eats'}
            </span>
            <span style={{ color: 'var(--pink)' }}>-{formatCLP(orden.delivery)}</span>
          </div>
        )}
        {orden.delivery_cobrado > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'var(--muted)' }}>
            <span>Delivery cobrado</span>
            <span style={{ color: 'var(--green)' }}>+{formatCLP(orden.delivery_cobrado)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>TOTAL</span>
          <span style={{ fontWeight: 900, fontSize: 22, color: 'var(--green)' }}>
            {formatCLP((orden.delivery > 0 || orden.delivery_cobrado > 0) ? neto : total)}
          </span>
        </div>

        {/* Medio de pago */}
        {orden.medio_pago && (
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
            {medioPagoLabel[orden.medio_pago] || orden.medio_pago}
          </div>
        )}

        {/* Delivery propio o info de distancia */}
        {(orden.delivery_tipo === 'propio' || orden.distancia_km) && (
          <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
            {orden.delivery_tipo === 'propio' ? '⚡ Entrega propia (EV)' :
             orden.delivery_tipo === 'retiro' ? '🚶 Retiro' : ''}
            {orden.distancia_km ? ` · ${orden.distancia_km} km` : ''}
          </div>
        )}

        {orden.nota && (
          <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            {orden.nota}
          </div>
        )}

        {/* Divisor */}
        <div style={{ borderTop: '1px dashed rgba(255,255,255,0.12)', marginTop: 16, marginBottom: 16 }} />

        <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>
          🍹 GRACIAS POR TU PEDIDO
        </div>

        <button onClick={onCerrar}
          style={{
            marginTop: 20, width: '100%', background: 'rgba(0,180,180,0.12)',
            border: '1px solid rgba(0,180,180,0.3)', borderRadius: 10,
            color: 'var(--cyan)', padding: '10px 0', cursor: 'pointer',
            fontSize: 13, fontWeight: 600
          }}>
          Cerrar
        </button>
      </div>
    </div>
  )
}


const fechaHoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const horaAhora = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const itemVacio = () => ({ receta_nombre: '', litros: 1, precio_venta: '' })

const ORIGENES = ['IG Orgánico', 'IG Pauta', 'Referido', 'Cliente habitual', 'Evento', 'Otro']
const MEDIOS_PAGO = [
  { id: 'transferencia', label: '🏦 Transferencia' },
  { id: 'debito',        label: '💳 Débito' },
  { id: 'credito',       label: '💳 Crédito' },
  { id: 'efectivo',      label: '💵 Efectivo' },
]
const TIPOS_DELIVERY = [
  { id: 'uber',    label: '🛵 Uber Eats' },
  { id: 'motoboy', label: '🏍️ Motoboy' },
  { id: 'propio',  label: '⚡ Propio (EV)' },
  { id: 'retiro',  label: '🚶 Retiro' },
  { id: 'otro',    label: '· Otro' },
]

// ─── Concurso NEON (descuento 15% por código de único uso) ──────────────────
const NEON_DESCUENTO = 0.15        // 15%
const NEON_VALIDEZ_DIAS = 7        // código válido 7 días desde su fecha

// Misma fórmula que validador.html: checksum determinístico sobre NEON+DDMM.
function neonChecksumEsperado(dd, mm) {
  const seed = 'NEON' + dd + mm
  let sum = 0
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i) * (i + 1)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return chars[sum % 32] + chars[(sum * 7) % 32] + chars[(sum * 13 + 5) % 32]
}

// Valida formato + checksum + caducidad. Devuelve { ok, codigo, motivo }.
// NO consulta Supabase (eso lo hace handleSubmit para ver reúso por teléfono).
function validarFormulaNeon(raw) {
  const code = (raw || '').trim().toUpperCase()
  if (!code) return { ok: false, motivo: 'vacio' }
  const m = code.match(/^NEON-?(\d{2})(\d{2})-?([A-Z2-9]{3})$/)
  if (!m) return { ok: false, motivo: 'formato', detalle: 'Formato esperado: NEON-DDMM-XXX' }
  const [, dd, mm, checksum] = m
  if (checksum !== neonChecksumEsperado(dd, mm)) {
    return { ok: false, motivo: 'invalido', detalle: 'Checksum no coincide · posible adivinanza o typo' }
  }
  // Caducidad
  const now = new Date()
  const codeDate = new Date(now.getFullYear(), parseInt(mm) - 1, parseInt(dd))
  if (codeDate > now) codeDate.setFullYear(now.getFullYear() - 1) // del año pasado
  const diffDays = Math.floor((now - codeDate) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { ok: false, motivo: 'futuro', detalle: 'Código del futuro · revisar' }
  if (diffDays > NEON_VALIDEZ_DIAS) {
    return { ok: false, motivo: 'expirado', detalle: `Generado hace ${diffDays} días · válido solo ${NEON_VALIDEZ_DIAS}` }
  }
  // Normaliza a la forma canónica con guiones para guardar consistente
  const canonico = `NEON-${dd}${mm}-${checksum}`
  return { ok: true, codigo: canonico, diffDays }
}

// Normaliza teléfono: deja solo dígitos para que +56 9 1234 / 56912341234 / etc.
// cuenten como el mismo número y la regla 1-teléfono-1-código no se burle con formato.
function normalizarTelefono(tel) {
  return (tel || '').replace(/\D/g, '')
}

function ConfirmModal({ mensaje, onConfirm, onCancel }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:320, width:'100%' }}>
        <div style={{ fontSize:15, color:'var(--text)', marginBottom:20, lineHeight:1.5 }}>{mensaje}</div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary btn-sm" style={{ flex:1, background:'var(--pink)' }} onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

function EditOrdenModal({ orden, recetas, onSave, onCancel }) {
  const [fecha, setFecha] = useState(orden.fecha)
  const [hora, setHora] = useState(orden.hora || '')
  const [cliente, setCliente] = useState(orden.cliente_nombre || '')
  const [origenVal, setOrigenVal] = useState(orden.origen || '')
  const [medioPago, setMedioPago] = useState(orden.medio_pago || 'transferencia')
  const [delivery, setDelivery] = useState(orden.delivery || '')
  const [deliveryCobrado, setDeliveryCobrado] = useState(orden.delivery_cobrado || '')
  const [deliveryTipo, setDeliveryTipo] = useState(orden.delivery_tipo || '')
  const [distanciaKm, setDistanciaKm] = useState(orden.distancia_km ?? '')
  const [nota, setNota] = useState(orden.nota || '')
  const [items, setItems] = useState(
    (orden.ventas || []).map(v => ({
      id: v.id,
      receta_nombre: v.receta_nombre,
      litros: v.litros,
      precio_venta: v.precio_venta,
      devuelve_envase: v.nota === 'envase devuelto'
    }))
  )
  const [saving, setSaving] = useState(false)

  const updateItem = (i, campo, valor) => {
    setItems(prev => prev.map((it, idx) => idx !== i ? it : { ...it, [campo]: valor }))
  }
  const quitarItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const agregarItem = () => setItems(prev => [...prev, itemVacio()])

  const handleSave = async () => {
    const itemsValidos = items.filter(it => it.receta_nombre && it.precio_venta)
    if (itemsValidos.length === 0) return
    setSaving(true)

    // Actualizar orden
    const { error: errOrden } = await supabase.from('ordenes').update({
      fecha,
      hora: hora || null,
      cliente_nombre: cliente || null,
      origen: origenVal || null,
      medio_pago: medioPago,
      nota: nota || null,
      delivery: parseFloat(delivery) || 0,
      delivery_cobrado: parseFloat(deliveryCobrado) || 0,
      delivery_tipo: (parseFloat(delivery) > 0 || deliveryTipo === 'retiro' || deliveryTipo === 'propio') ? (deliveryTipo || null) : null,
      distancia_km: (deliveryTipo && deliveryTipo !== 'retiro' && distanciaKm !== '') ? parseFloat(distanciaKm) : null,
    }).eq('id', orden.id)
    if (errOrden) {
      console.error('Error al actualizar orden:', errOrden)
      showToast('Error al actualizar pedido: ' + errOrden.message)
      setSaving(false)
      return
    }

    // Reintegrar el stock que consumieron las ventas anteriores
    const itemsAnteriores = (orden.ventas || []).map(v => ({
      receta_nombre: v.receta_nombre,
      litros: v.litros,
      devuelve_envase: v.nota === 'envase devuelto',
    }))
    if (itemsAnteriores.length > 0) {
      await reintegrarStock(itemsAnteriores)
    }

    // Borrar ventas antiguas e insertar nuevas
    const { error: errDelete } = await supabase.from('ventas').delete().eq('orden_id', orden.id)
    if (errDelete) {
      console.error('Error al borrar ventas antiguas:', errDelete)
      showToast('Error al actualizar productos: ' + errDelete.message)
      setSaving(false)
      return
    }
    const { error: errInsert } = await supabase.from('ventas').insert(itemsValidos.map(it => ({
      fecha,
      receta_nombre: it.receta_nombre,
      litros: parseFloat(it.litros) || 1,
      precio_venta: parseFloat(it.precio_venta) || 0,
      delivery: 0,
      origen: origenVal || null,
      nota: it.devuelve_envase ? 'envase devuelto' : null,
      orden_id: orden.id,
    })))
    if (errInsert) {
      console.error('Error al insertar ventas nuevas:', errInsert)
      showToast('Error al guardar productos: ' + errInsert.message)
      setSaving(false)
      return
    }

    // Descontar stock por los nuevos ítems
    await descontarStock(itemsValidos)

    setSaving(false)
    onSave()
  }

  const total = items.reduce((s, it) => s + (parseFloat(it.precio_venta)||0) * (parseFloat(it.litros)||1), 0)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:200, padding:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:480, width:'100%', marginTop:20 }}>
        <div style={{ fontSize:17, fontWeight:700, color:'var(--text)', marginBottom:18 }}>Editar pedido</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hora</label>
            <input type="time" className="form-input" value={hora} onChange={e => setHora(e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Cliente</label>
          <input type="text" className="form-input" value={cliente} placeholder="opcional" onChange={e => setCliente(e.target.value)} />
        </div>

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Origen</label>
          <div className="chip-row">
            {ORIGENES.map(op => (
              <button key={op} type="button" className={`chip ${origenVal === op ? 'selected' : ''}`}
                onClick={() => setOrigenVal(o => o === op ? '' : op)}>{op}</button>
            ))}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Medio de pago</label>
          <div className="chip-row">
            {MEDIOS_PAGO.map(m => (
              <button key={m.id} type="button" className={`chip ${medioPago === m.id ? 'selected' : ''}`}
                onClick={() => setMedioPago(m.id)}>{m.label}</button>
            ))}
          </div>
        </div>

        <div style={{ fontSize:12, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:10 }}>Productos</div>
        {items.map((it, i) => (
          <div key={i} style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:12, marginBottom:8, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>Ítem {i+1}</span>
              {items.length > 1 && (
                <button type="button" onClick={() => quitarItem(i)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18, lineHeight:1, padding:0 }}>×</button>
              )}
            </div>
            <select className="form-select" value={it.receta_nombre} style={{ marginBottom:8 }}
              onChange={e => updateItem(i, 'receta_nombre', e.target.value)}>
              <option value="">Seleccionar receta...</option>
              {recetas.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
            </select>
            <div style={{ display:'flex', gap:8 }}>
              <input type="number" className="form-input" value={it.precio_venta} placeholder="Precio ($)" style={{ flex:1 }}
                onChange={e => updateItem(i, 'precio_venta', e.target.value)} />
              <input type="number" className="form-input" value={it.litros} placeholder="Litros" style={{ width:70 }}
                onChange={e => updateItem(i, 'litros', e.target.value)} />
            </div>
          </div>
        ))}
        <button type="button" onClick={agregarItem}
          style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px dashed var(--border)', borderRadius:10, padding:'8px 0', color:'var(--muted)', cursor:'pointer', fontSize:13, marginBottom:12 }}>
          + Agregar producto
        </button>

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Tipo de entrega</label>
          <div className="chip-row">
            {TIPOS_DELIVERY.map(t => (
              <button key={t.id} type="button" className={`chip ${deliveryTipo === t.id ? 'selected' : ''}`}
                onClick={() => {
                  setDeliveryTipo(d => d === t.id ? '' : t.id)
                  if (t.id === 'retiro') setDelivery('')
                }}>{t.label}</button>
            ))}
          </div>
        </div>

        {deliveryTipo && deliveryTipo !== 'retiro' && (
          <div style={{ display:'grid', gridTemplateColumns: deliveryTipo === 'propio' ? '1fr' : '1fr 1fr', gap:12, marginBottom:12 }}>
            {deliveryTipo !== 'propio' && (
              <div className="form-group">
                <label className="form-label">
                  {deliveryTipo === 'uber' ? 'Costo Uber' :
                   deliveryTipo === 'motoboy' ? 'Pago motoboy' :
                   'Costo entrega'}
                </label>
                <input type="number" className="form-input" value={delivery} placeholder="ej: 2500" onChange={e => setDelivery(e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Distancia (km)</label>
              <input type="number" step="0.1" className="form-input" value={distanciaKm} placeholder="ej: 6.5"
                onChange={e => setDistanciaKm(e.target.value)} />
            </div>
          </div>
        )}

        {deliveryTipo && deliveryTipo !== 'retiro' && (
          <div className="form-group" style={{ marginBottom:12 }}>
            <label className="form-label">Cobrado al cliente por delivery</label>
            <input type="number" className="form-input" value={deliveryCobrado} placeholder="ej: 3000"
              onChange={e => setDeliveryCobrado(e.target.value)} />
          </div>
        )}

        <div className="form-group" style={{ marginBottom:16 }}>
          <label className="form-label">Nota</label>
          <input type="text" className="form-input" value={nota} placeholder="opcional" onChange={e => setNota(e.target.value)} />
        </div>

        {total > 0 && (
          <div style={{ textAlign:'right', marginBottom:14, fontSize:15, fontWeight:700, color:'var(--green)' }}>
            Total: {formatCLP(total)}
          </div>
        )}

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Ventas() {
  const [recetas, setRecetas] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [editando, setEditando] = useState(null)
  const [ticket, setTicket] = useState(null)

  // Filtros del historial
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('todo') // 'todo' | '7d' | '30d' | '90d'
  const [filtroReceta, setFiltroReceta] = useState('')
  const [perfilCliente, setPerfilCliente] = useState(null) // nombre del cliente seleccionado para ver perfil

  // Formulario de orden nueva
  const [fecha, setFecha] = useState(fechaHoy())
  const [hora, setHora] = useState(horaAhora())
  const [cliente, setCliente] = useState('')
  const [clienteSugerencias, setClienteSugerencias] = useState([])
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')
  const [origen, setOrigen] = useState('')
  const [medioPago, setMedioPago] = useState('transferencia')
  const [delivery, setDelivery] = useState('')
  const [deliveryCobrado, setDeliveryCobrado] = useState('')
  const [deliveryTipo, setDeliveryTipo] = useState('')
  const [distanciaKm, setDistanciaKm] = useState('')
  const [enviarADelivery, setEnviarADelivery] = useState(false)
  const [nota, setNota] = useState('')
  const [items, setItems] = useState([itemVacio()])

  // Concurso NEON
  const [codigoNeon, setCodigoNeon] = useState('')
  const [neonEstado, setNeonEstado] = useState(null) // { ok, msg } feedback en vivo
  const [neonPrevio, setNeonPrevio] = useState(null) // { codigo, fecha_canje } si el teléfono ya canjeó

  // Feedback en vivo del código NEON mientras se escribe (solo fórmula/caducidad,
  // el chequeo de reúso por teléfono ocurre al guardar).
  useEffect(() => {
    if (!codigoNeon.trim()) { setNeonEstado(null); return }
    const r = validarFormulaNeon(codigoNeon)
    if (r.ok) setNeonEstado({ ok: true, msg: `Código válido · -15% (hace ${r.diffDays} día${r.diffDays === 1 ? '' : 's'})` })
    else if (r.motivo === 'formato') setNeonEstado({ ok: false, msg: 'Formato: NEON-DDMM-XXX' })
    else if (r.motivo === 'expirado') setNeonEstado({ ok: false, msg: r.detalle })
    else if (r.motivo === 'futuro') setNeonEstado({ ok: false, msg: r.detalle })
    else setNeonEstado({ ok: false, msg: 'Código inválido (checksum)' })
  }, [codigoNeon])

  // Aviso proactivo: apenas se carga el teléfono, chequea si ese número ya
  // canjeó un NEON antes. Debounce para no pegarle a la base en cada tecla.
  useEffect(() => {
    const tel = normalizarTelefono(clienteTelefono)
    if (!tel) { setNeonPrevio(null); return }
    let cancelado = false
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('canjes_neon').select('codigo, fecha_canje').eq('telefono', tel).maybeSingle()
      if (cancelado) return
      setNeonPrevio(error ? null : (data || null))
    }, 400)
    return () => { cancelado = true; clearTimeout(t) }
  }, [clienteTelefono])

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: r }, { data: o }, { data: vts }] = await Promise.all([
      supabase.from('recetas').select('nombre, precio_venta').order('nombre'),
      supabase.from('ordenes').select('*').order('fecha', { ascending: false }),
      supabase.from('ventas').select('*').order('fecha', { ascending: false }),
    ])

    // Ventas con orden asociada
    const ventasPorOrden = {}
    ;(vts || []).forEach(v => {
      if (!v.orden_id) return
      if (!ventasPorOrden[v.orden_id]) ventasPorOrden[v.orden_id] = []
      ventasPorOrden[v.orden_id].push(v)
    })
    const ordenesConVentas = (o || []).map(ord => ({
      ...ord,
      ventas: ventasPorOrden[ord.id] || [],
      _tipo: 'orden'
    }))

    // Ventas huérfanas (sin orden_id) — registradas antes del sistema de pedidos
    const huerfanas = (vts || []).filter(v => !v.orden_id)
    // Agrupar huérfanas por fecha + origen para reconstruir "pedidos"
    const gruposHuerfanos = {}
    huerfanas.forEach(v => {
      const key = `${v.fecha}_${v.origen || ''}_${v.id}`
      // Cada venta huérfana es su propio "pedido" (no había agrupación antes)
      gruposHuerfanos[v.id] = {
        id: `huerfana_${v.id}`,
        fecha: v.fecha,
        hora: null,
        cliente_nombre: null,
        origen: v.origen,
        medio_pago: null,
        nota: v.nota,
        delivery: v.delivery || 0,
        ventas: [v],
        _tipo: 'huerfana'
      }
    })

    const todo = [...ordenesConVentas, ...Object.values(gruposHuerfanos)]
      .sort((a, b) => {
        // Ordenar por fecha + hora descendente (más reciente primero)
        const keyA = `${a.fecha}_${a.hora || '00:00'}`
        const keyB = `${b.fecha}_${b.hora || '00:00'}`
        return keyB.localeCompare(keyA)
      })

    setRecetas((r || []).filter(x => x.nombre !== 'ENVASE'))
    setOrdenes(todo)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  // Busca clientes desde la tabla clientes (maestro)
  const [clientesMaestro, setClientesMaestro] = useState([])
  useEffect(() => {
    supabase.from('clientes').select('*').order('nombre').then(({ data }) => setClientesMaestro(data || []))
  }, [])

  const buscarSugerencias = (texto) => {
    if (!texto || texto.length < 2) { setClienteSugerencias([]); return }
    const q = texto.toLowerCase().trim()
    const sugs = clientesMaestro
      .filter(c => c.nombre.toLowerCase().includes(q))
      .slice(0, 5)
      .map(c => ({
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono || '',
        direccion: c.direccion || '',
        distancia: c.distancia_km || '',
      }))
    setClienteSugerencias(sugs)
  }

  const aplicarSugerencia = (sug) => {
    setCliente(sug.nombre)
    setClienteTelefono(sug.telefono)
    setClienteDireccion(sug.direccion)
    if (sug.distancia) setDistanciaKm(String(sug.distancia))
    setClienteSugerencias([])
  }

  const getPrecioSugerido = (nombre) => {
    const r = recetas.find(x => x.nombre === nombre)
    if (r?.precio_venta) return r.precio_venta
    // fallback mientras no haya precio_venta en la receta
    const n = nombre.toLowerCase()
    if (n.includes('daikiri')) return 8000
    return 9000
  }

  const updateItem = (i, campo, valor) => {
    setItems(prev => prev.map((it, idx) => {
      if (idx !== i) return it
      const updated = { ...it, [campo]: valor }
      if (campo === 'receta_nombre' && valor) updated.precio_venta = getPrecioSugerido(valor)
      return updated
    }))
  }

  const agregarItem = () => setItems(prev => [...prev, itemVacio()])
  const quitarItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const totalBruto = items.reduce((s, it) => {
    const base = parseFloat(it.precio_venta) || 0
    return s + base * (parseFloat(it.litros) || 1)
  }, 0)

  const totalNeto = totalBruto - (parseFloat(delivery) || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    console.log('submit fired, items:', items)
    const itemsValidos = items.filter(it => it.receta_nombre && it.precio_venta)
    console.log('itemsValidos:', itemsValidos)
    if (itemsValidos.length === 0) {
      showToast('Agrega al menos un producto con receta y precio')
      return
    }

    // ── Validación del código NEON (antes de tocar la base) ──────────────────
    let neonAplicado = null // { codigo, telefono } si se va a canjear
    if (codigoNeon.trim()) {
      const v = validarFormulaNeon(codigoNeon)
      if (!v.ok) {
        showToast('Código NEON ' + (v.motivo === 'expirado' ? 'expirado' : v.motivo === 'futuro' ? 'con fecha futura' : 'inválido') + ': ' + (v.detalle || 'no se aplicó el descuento'))
        return
      }
      const tel = normalizarTelefono(clienteTelefono)
      if (!tel) {
        showToast('Para canjear un NEON necesitás el teléfono del cliente (1 teléfono = 1 código)')
        return
      }
      // ¿Este teléfono ya canjeó algún NEON antes?
      const { data: previo, error: errPrevio } = await supabase
        .from('canjes_neon').select('codigo, fecha_canje').eq('telefono', tel).maybeSingle()
      if (errPrevio) {
        showToast('No pude verificar el código (error de red): ' + errPrevio.message)
        return
      }
      if (previo) {
        showToast('Ese teléfono ya usó un NEON (' + previo.codigo + '). 1 código por cliente.')
        return
      }
      neonAplicado = { codigo: v.codigo, telefono: tel }
    }

    setLoading(true)

    // Buscar o crear cliente en tabla maestro
    let clienteId = null
    if (cliente.trim()) {
      const nombreKey = cliente.trim().toLowerCase()
      const existente = clientesMaestro.find(c => c.nombre.trim().toLowerCase() === nombreKey)
      if (existente) {
        clienteId = existente.id
        // Actualizar datos si se completaron campos nuevos
        const updates = {}
        if (clienteTelefono && !existente.telefono) updates.telefono = clienteTelefono
        if (clienteDireccion && !existente.direccion) updates.direccion = clienteDireccion
        if (distanciaKm && !existente.distancia_km) updates.distancia_km = parseFloat(distanciaKm)
        if (origen && !existente.origen) updates.origen = origen
        if (Object.keys(updates).length > 0) {
          await supabase.from('clientes').update(updates).eq('id', clienteId)
        }
      } else {
        // Cliente nuevo — crear en maestro
        const { data: nuevoCliente } = await supabase.from('clientes').insert({
          nombre: cliente.trim(),
          telefono: clienteTelefono || null,
          direccion: clienteDireccion || null,
          distancia_km: distanciaKm ? parseFloat(distanciaKm) : null,
          origen: origen || null,
        }).select().single()
        if (nuevoCliente) clienteId = nuevoCliente.id
      }
    }

    const { data: orden, error: errOrden } = await supabase.from('ordenes').insert({
      fecha,
      hora: hora || null,
      cliente_nombre: cliente || null,
      cliente_id: clienteId,
      cliente_telefono: clienteTelefono || null,
      cliente_direccion: enviarADelivery ? (clienteDireccion || null) : null,
      origen: origen || null,
      medio_pago: medioPago,
      nota: nota || null,
      delivery: parseFloat(delivery) || 0,
      delivery_cobrado: parseFloat(deliveryCobrado) || 0,
      delivery_tipo: (parseFloat(delivery) > 0 || deliveryTipo === 'retiro' || deliveryTipo === 'propio') ? (deliveryTipo || null) : null,
      distancia_km: (deliveryTipo && deliveryTipo !== 'retiro' && distanciaKm !== '') ? parseFloat(distanciaKm) : null,
      estado_delivery: enviarADelivery ? 'pendiente' : null,
    }).select().single()

    console.log('orden result:', orden, 'error:', errOrden)

    if (errOrden || !orden) {
      showToast('Error al guardar: ' + (errOrden?.message || 'sin datos'))
      setLoading(false)
      return
    }

    // Registrar el canje NEON ANTES de las ventas. El UNIQUE de la base es el
    // candado real contra reúso (incluso si dos cajas guardan a la vez). Si salta
    // la constraint, revertimos la orden recién creada y abortamos sin cobrar mal.
    if (neonAplicado) {
      const { error: errCanje } = await supabase.from('canjes_neon').insert({
        codigo: neonAplicado.codigo,
        telefono: neonAplicado.telefono,
        cliente_nombre: cliente || null,
        orden_id: orden.id,
      })
      if (errCanje) {
        await supabase.from('ordenes').delete().eq('id', orden.id) // rollback
        const dup = errCanje.code === '23505' || /duplicate|unique/i.test(errCanje.message || '')
        showToast(dup
          ? 'Ese código o teléfono ya fue canjeado. No se aplicó el descuento.'
          : 'No se pudo registrar el código NEON: ' + errCanje.message)
        setLoading(false)
        return
      }
    }

    const factorNeon = neonAplicado ? (1 - NEON_DESCUENTO) : 1
    let descuentoNeonTotal = 0
    const ventasInsert = itemsValidos.map(it => {
      const precioBase = parseFloat(it.precio_venta) || 0
      const precioFinal = Math.round(precioBase * factorNeon)
      if (neonAplicado) descuentoNeonTotal += (precioBase - precioFinal) * (parseFloat(it.litros) || 1)
      const notas = []
      if (neonAplicado) notas.push('NEON -15%')
      return {
        fecha,
        receta_nombre: it.receta_nombre,
        litros: parseFloat(it.litros) || 1,
        precio_venta: precioFinal,
        delivery: 0,
        origen: origen || null,
        nota: notas.length ? notas.join(' · ') : null,
        orden_id: orden.id,
      }
    })
    console.log('ventasInsert:', ventasInsert)
    const { error: errVentas } = await supabase.from('ventas').insert(ventasInsert)
    console.log('ventas error:', errVentas)
    if (errVentas) {
      showToast('Error en ventas: ' + errVentas.message)
      setLoading(false)
      return
    }

    // Guardar el monto descontado en el canje (para reporte del concurso)
    if (neonAplicado && descuentoNeonTotal > 0) {
      await supabase.from('canjes_neon')
        .update({ monto_descuento: Math.round(descuentoNeonTotal) })
        .eq('orden_id', orden.id)
    }

    // Descuento de stock por ingredientes utilizados. La venta ya quedo
    // registrada; si el stock no se ajusta, avisamos pero no bloqueamos.
    const resStock = await descontarStock(itemsValidos)
    if (resStock && !resStock.ok) {
      showToast('Pedido guardado, pero no se ajusto el stock de: ' + resStock.fallidos.join(', '))
    }

    showToast(neonAplicado
      ? `Pedido registrado ✓ · NEON aplicado (-${formatCLP(Math.round(descuentoNeonTotal))})`
      : 'Pedido registrado ✓')
    setFecha(fechaHoy())
    setHora(horaAhora())
    setCliente('')
    setClienteSugerencias([])
    setClienteTelefono('')
    setClienteDireccion('')
    setOrigen('')
    setMedioPago('transferencia')
    setDelivery('')
    setDeliveryCobrado('')
    setDeliveryTipo('')
    setDistanciaKm('')
    setEnviarADelivery(false)
    setNota('')
    setItems([itemVacio()])
    setCodigoNeon('')
    setNeonEstado(null)
    load()
    setLoading(false)
  }

  const handleEliminarOrden = async (orden) => {
    // Reintegrar stock antes de borrar las ventas (para no perder la info de
    // qué se había consumido). Esto revierte ingredientes Y envase.
    const itemsAnteriores = (orden.ventas || []).map(v => ({
      receta_nombre: v.receta_nombre,
      litros: v.litros,
      devuelve_envase: v.nota === 'envase devuelto',
    }))
    if (itemsAnteriores.length > 0) {
      await reintegrarStock(itemsAnteriores)
    }
    await supabase.from('ventas').delete().eq('orden_id', orden.id)
    await supabase.from('ordenes').delete().eq('id', orden.id)
    showToast('Pedido eliminado · stock reintegrado')
    setConfirmar(null)
    load()
  }

  const origenColor = (o) => {
    if (o === 'IG Orgánico' || o === 'Instagram') return { bg: 'rgba(196,0,90,0.15)', color: 'var(--pink)' }
    if (o === 'IG Pauta') return { bg: 'rgba(196,0,90,0.25)', color: '#ff4d9e' }
    if (o === 'Referido') return { bg: 'rgba(16,185,129,0.12)', color: 'var(--green)' }
    if (o === 'Cliente habitual') return { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
    return { bg: 'rgba(0,180,180,0.1)', color: 'var(--cyan)' }
  }
  const origenIcon = (o) => ({
    'IG Orgánico': '📱', 'Instagram': '📱', 'IG Pauta': '🎯',
    'Referido': '🤝', 'Cliente habitual': '⭐', 'Evento': '🎉'
  }[o] || '•')

  // Perfil de cliente: calcula stats de un cliente específico
  const getPerfilClienteData = (nombre) => {
    if (!nombre) return null
    const key = nombre.trim().toLowerCase()
    const ordenesCliente = ordenes.filter(o => (o.cliente_nombre || '').trim().toLowerCase() === key)
    const totalGastado = ordenesCliente.reduce((s, o) => s + (o.ventas || []).reduce((ss, v) => ss + (v.litros||1)*(v.precio_venta||0), 0), 0)
    const recetasFav = {}
    ordenesCliente.forEach(o => (o.ventas||[]).forEach(v => { recetasFav[v.receta_nombre] = (recetasFav[v.receta_nombre]||0)+1 }))
    const favSorted = Object.entries(recetasFav).sort((a,b)=>b[1]-a[1])
    const ultOrd = ordenesCliente[0]
    const origen = ordenesCliente.find(o=>o.origen)?.origen || null
    const telefono = ordenesCliente.find(o=>o.cliente_telefono)?.cliente_telefono || null
    const direccion = ordenesCliente.find(o=>o.cliente_direccion)?.cliente_direccion || null
    return { nombre, pedidos: ordenesCliente.length, totalGastado, favSorted, ultOrd, origen, telefono, direccion }
  }

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {/* Modal perfil cliente */}
      {perfilCliente && (() => {
        const p = getPerfilClienteData(perfilCliente)
        if (!p) return null
        const oc = origenColor(p.origen)
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:24 }}>
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:24, maxWidth:360, width:'100%' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:18, fontWeight:800, color:'var(--text-strong)' }}>{p.nombre}</div>
                  {p.origen && (
                    <span style={{ fontSize:11, background:oc.bg, color:oc.color, borderRadius:10, padding:'2px 8px', fontWeight:600, marginTop:4, display:'inline-block' }}>
                      {origenIcon(p.origen)} {p.origen}
                    </span>
                  )}
                </div>
                <button onClick={() => setPerfilCliente(null)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:22, lineHeight:1, padding:0 }}>×</button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                <div style={{ background:'rgba(0,180,180,0.07)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:22, fontWeight:800, color:'var(--cyan)' }}>{p.pedidos}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>pedido{p.pedidos!==1?'s':''}</div>
                </div>
                <div style={{ background:'rgba(16,185,129,0.07)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:800, color:'var(--green)' }}>{formatCLP(p.totalGastado)}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>gastado total</div>
                </div>
              </div>

              {p.favSorted.length > 0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:6 }}>Receta favorita</div>
                  {p.favSorted.slice(0,2).map(([rec, cnt]) => (
                    <div key={rec} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:13, color:'var(--text)' }}>{rec}</span>
                      <span style={{ fontSize:13, color:'var(--cyan)', fontWeight:700 }}>{cnt}×</span>
                    </div>
                  ))}
                </div>
              )}

              {p.telefono && (
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>📞 {p.telefono}</div>
              )}
              {p.direccion && (
                <div style={{ fontSize:12, color:'var(--cyan)', marginBottom:4 }}>📍 {p.direccion}</div>
              )}
              {p.ultOrd && (
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>
                  Último pedido: <strong style={{ color:'var(--text)' }}>{p.ultOrd.fecha}</strong>
                </div>
              )}

              {p.pedidos >= 3 && (
                <div style={{ marginTop:12, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#f59e0b' }}>
                  ⭐ Cliente VIP — considera ofrecerle beneficios o descuento fidelidad.
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {confirmar && (
        <ConfirmModal
          mensaje={`¿Eliminar pedido de ${confirmar.cliente_nombre || 'cliente anónimo'}?`}
          onConfirm={() => handleEliminarOrden(confirmar)}
          onCancel={() => setConfirmar(null)}
        />
      )}

      {editando && (
        <EditOrdenModal
          orden={editando}
          recetas={recetas}
          onSave={() => { setEditando(null); showToast('Pedido actualizado ✓'); load() }}
          onCancel={() => setEditando(null)}
        />
      )}

      {ticket && (
        <TicketModal orden={ticket} onCerrar={() => setTicket(null)} />
      )}

      {/* Acceso rapido importador WhatsApp */}
      <button
        type="button"
        onClick={() => window.open('/importar', '_blank')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          width: '100%', marginBottom: 14,
          background: 'rgba(37,211,102,0.1)', border: '1.5px solid rgba(37,211,102,0.35)',
          borderRadius: 12, padding: '11px 16px',
          color: '#25d366', fontWeight: 800, fontSize: 14, cursor: 'pointer',
        }}>
        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.558 4.114 1.534 5.836L.054 23.447a.75.75 0 0 0 .918.99l5.82-1.527A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.697 9.697 0 0 1-4.953-1.356l-.355-.211-3.676.964.981-3.582-.232-.368A9.698 9.698 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
        </svg>
        Importar pedido desde WhatsApp
      </button>

      <div className="page-title">Registrar pedido</div>
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hora</label>
              <input type="time" className="form-input" value={hora} onChange={e => setHora(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Cliente — opcional</label>
            <input type="text" className="form-input" value={cliente} placeholder="ej: Juan Pérez"
              onChange={e => { setCliente(e.target.value); buscarSugerencias(e.target.value) }}
              onBlur={() => setTimeout(() => setClienteSugerencias([]), 180)}
              autoComplete="off"
            />
            {clienteSugerencias.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 10, marginTop: 4, overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
              }}>
                {clienteSugerencias.map((sug, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => aplicarSugerencia(sug)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', borderBottom: i < clienteSugerencias.length - 1 ? '1px solid var(--border)' : 'none',
                      padding: '10px 14px', cursor: 'pointer', color: 'var(--text)'
                    }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{sug.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {[sug.direccion, sug.telefono, sug.distancia ? `${sug.distancia} km` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label className="form-label">Teléfono — opcional</label>
              <input type="tel" className="form-input" value={clienteTelefono} placeholder="+56 9 ..."
                style={{ borderColor: neonPrevio ? 'var(--pink, #ff3366)' : undefined }}
                onChange={e => setClienteTelefono(e.target.value)} />
              {neonPrevio && (
                <div style={{
                  marginTop:6, fontSize:12, fontWeight:600, letterSpacing:'0.02em',
                  color:'var(--pink, #ff3366)',
                }}>
                  ⚠ Este teléfono ya usó un NEON ({neonPrevio.codigo})
                  {neonPrevio.fecha_canje ? ' el ' + new Date(neonPrevio.fecha_canje).toLocaleDateString('es-CL') : ''}. No corresponde otro descuento.
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Dirección — opcional</label>
              <input type="text" className="form-input" value={clienteDireccion} placeholder="Calle N°, comuna"
                onChange={e => setClienteDireccion(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">¿Cómo llegó el cliente?</label>
            <div className="chip-row">
              {ORIGENES.map(op => (
                <button key={op} type="button" className={`chip ${origen === op ? 'selected' : ''}`}
                  onClick={() => setOrigen(o => o === op ? '' : op)}>{op}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Medio de pago</label>
            <div className="chip-row">
              {MEDIOS_PAGO.map(m => (
                <button key={m.id} type="button" className={`chip ${medioPago === m.id ? 'selected' : ''}`}
                  onClick={() => setMedioPago(m.id)}>{m.label}</button>
              ))}
            </div>
          </div>

          <div style={{ borderTop:'1px solid var(--border)', paddingTop:14, marginTop:4 }}>
            <div style={{ fontSize:12, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:10 }}>Productos</div>
            {items.map((it, i) => (
              <div key={i} style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:12, marginBottom:10, border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>Ítem {i+1}</div>
                  {items.length > 1 && (
                    <button type="button" onClick={() => quitarItem(i)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18, lineHeight:1, padding:0 }}>×</button>
                  )}
                </div>
                <select className="form-select" value={it.receta_nombre} style={{ marginBottom:8 }}
                  onChange={e => updateItem(i, 'receta_nombre', e.target.value)}>
                  <option value="">Seleccionar receta...</option>
                  {recetas.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
                </select>
                <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                  <input type="number" className="form-input" value={it.precio_venta} placeholder="Precio ($)" style={{ flex:1 }}
                    onChange={e => updateItem(i, 'precio_venta', e.target.value)} />
                  <input type="number" className="form-input" value={it.litros} placeholder="Litros" style={{ width:80 }}
                    step="0.5" min="0.5"
                    onChange={e => updateItem(i, 'litros', e.target.value)} />
                </div>
                {it.receta_nombre && it.precio_venta && (
                  <div style={{ marginTop:6, fontSize:13, color:'var(--green)', fontWeight:700, textAlign:'right' }}>
                    {formatCLP((parseFloat(it.precio_venta) || 0) * (parseFloat(it.litros)||1))}
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={agregarItem}
              style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px dashed var(--border)', borderRadius:10, padding:'10px 0', color:'var(--muted)', cursor:'pointer', fontSize:13 }}>
              + Agregar producto
            </button>
          </div>

          {totalBruto > 0 && (
            <div style={{ borderTop:'1px solid var(--border)', marginTop:14, paddingTop:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontSize:13, color:'var(--muted)' }}>Total pedido</span>
                <span style={{ fontSize:18, fontWeight:700, color:'var(--green)' }}>{formatCLP(totalBruto)}</span>
              </div>
              {parseFloat(delivery) > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ color:'var(--muted)' }}>Neto (sin Uber)</span>
                  <span style={{ color:'var(--cyan)', fontWeight:600 }}>{formatCLP(totalNeto)}</span>
                </div>
              )}
            </div>
          )}

          <div className="form-group" style={{ marginTop:14 }}>
            <label className="form-label">Tipo de entrega — opcional</label>
            <div className="chip-row">
              {TIPOS_DELIVERY.map(t => (
                <button key={t.id} type="button" className={`chip ${deliveryTipo === t.id ? 'selected' : ''}`}
                  onClick={() => {
                    const nuevo = deliveryTipo === t.id ? '' : t.id
                    setDeliveryTipo(nuevo)
                    if (t.id === 'retiro') { setDelivery(''); setDistanciaKm(''); setEnviarADelivery(false) }
                    if (t.id === 'propio') setDelivery('')
                    // Auto-activar toggle si es motoboy o propio
                    if (nuevo === 'motoboy' || nuevo === 'propio') setEnviarADelivery(true)
                    if (nuevo === '' || nuevo === 'retiro' || nuevo === 'uber' || nuevo === 'otro') setEnviarADelivery(false)
                  }}>{t.label}</button>
              ))}
            </div>

            {/* Toggle: enviar al panel de delivery */}
            {(deliveryTipo === 'motoboy' || deliveryTipo === 'propio') && (
              <button
                type="button"
                onClick={() => setEnviarADelivery(v => !v)}
                style={{
                  marginTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  background: enviarADelivery
                    ? 'rgba(0,180,180,0.1)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${enviarADelivery ? 'rgba(0,180,180,0.4)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '11px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {/* Switch visual */}
                <div style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: enviarADelivery ? 'var(--cyan)' : 'rgba(255,255,255,0.15)',
                  position: 'relative',
                  flexShrink: 0,
                  transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 3,
                    left: enviarADelivery ? 19 : 3,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: enviarADelivery ? 'var(--cyan)' : 'var(--muted)',
                  }}>
                    📦 Enviar al panel de delivery
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                    {enviarADelivery
                      ? 'El repartidor verá este pedido'
                      : 'No aparecerá en el panel del repartidor'}
                  </div>
                </div>
              </button>
            )}
          </div>

          {deliveryTipo && deliveryTipo !== 'retiro' && (
            <div style={{ display:'grid', gridTemplateColumns: deliveryTipo === 'propio' ? '1fr' : '1fr 1fr', gap:12 }}>
              {deliveryTipo !== 'propio' && (
                <div className="form-group">
                  <label className="form-label">
                    {deliveryTipo === 'uber' ? 'Costo Uber Eats' :
                     deliveryTipo === 'motoboy' ? 'Pago al motoboy' :
                     'Costo entrega'}
                  </label>
                  <input type="number" className="form-input" value={delivery} placeholder="ej: 2500"
                    onChange={e => setDelivery(e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Distancia (km)</label>
                <input type="number" step="0.1" className="form-input" value={distanciaKm} placeholder="ej: 6.5"
                  onChange={e => setDistanciaKm(e.target.value)} />
              </div>
            </div>
          )}

          {deliveryTipo && deliveryTipo !== 'retiro' && (
            <div className="form-group" style={{ marginTop:12 }}>
              <label className="form-label">Cobrado al cliente por delivery</label>
              <input type="number" className="form-input" value={deliveryCobrado} placeholder="ej: 3000"
                onChange={e => setDeliveryCobrado(e.target.value)} />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Nota — opcional</label>
            <input type="text" className="form-input" value={nota} placeholder="ej: pago en 2 partes"
              onChange={e => setNota(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ color:'#ff44ff', letterSpacing:'0.12em' }}>
              ◆ Código NEON — opcional (15% dto)
            </label>
            <input
              type="text"
              className="form-input"
              value={codigoNeon}
              placeholder="NEON-DDMM-XXX"
              autoComplete="off"
              spellCheck={false}
              onChange={e => setCodigoNeon(e.target.value.toUpperCase())}
              style={{
                textTransform:'uppercase',
                letterSpacing:'0.14em',
                borderColor: neonEstado ? (neonEstado.ok ? 'var(--green, #00ff88)' : 'var(--pink, #ff3366)') : undefined,
              }}
            />
            {neonEstado && (
              <div style={{
                marginTop:6, fontSize:12, fontWeight:600, letterSpacing:'0.04em',
                color: neonEstado.ok ? 'var(--green, #00ff88)' : 'var(--pink, #ff3366)',
              }}>
                {neonEstado.ok ? '✓ ' : '✕ '}{neonEstado.msg}
              </div>
            )}
            {codigoNeon.trim() && !normalizarTelefono(clienteTelefono) && (
              <div style={{ marginTop:4, fontSize:11, color:'var(--muted)' }}>
                Cargá el teléfono del cliente para poder canjear (1 código por teléfono).
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Confirmar pedido'}
          </button>
        </div>
      </form>

      {/* ── Filtros del historial ── */}
      {ordenes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {/* Búsqueda por cliente */}
          <input
            type="text"
            className="form-input"
            value={filtroCliente}
            placeholder="Buscar cliente o receta..."
            onChange={e => setFiltroCliente(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          {/* Filtro período */}
          <div className="toggle-row">
            {[
              { key: 'todo', label: 'Todo' },
              { key: '7d',   label: '7 días' },
              { key: '30d',  label: '30 días' },
              { key: '90d',  label: '90 días' },
            ].map(p => (
              <button key={p.key}
                className={`toggle-btn ${filtroPeriodo === p.key ? 'active-entrada' : ''}`}
                onClick={() => setFiltroPeriodo(p.key)}
                style={{ fontSize: 12 }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(() => {
        // Aplicar filtros
        const hoy = new Date()
        const ordenesFiltradas = ordenes.filter(o => {
          if (filtroPeriodo !== 'todo') {
            const dias = filtroPeriodo === '7d' ? 7 : filtroPeriodo === '30d' ? 30 : 90
            const corte = new Date(hoy); corte.setDate(hoy.getDate() - dias)
            const [y, m, d] = o.fecha.split('-').map(Number)
            if (new Date(y, m-1, d) < corte) return false
          }
          if (filtroCliente.trim()) {
            const q = filtroCliente.toLowerCase()
            const matchCliente = (o.cliente_nombre || '').toLowerCase().includes(q)
            const matchReceta = (o.ventas || []).some(v => v.receta_nombre.toLowerCase().includes(q))
            if (!matchCliente && !matchReceta) return false
          }
          return true
        })

        return (
          <>
            <div className="section-divider" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>
                Historial de pedidos
                {ordenesFiltradas.length !== ordenes.length
                  ? ` (${ordenesFiltradas.length} de ${ordenes.length})`
                  : ` (${ordenes.length})`}
              </span>
              {ordenesFiltradas.length > 0 && (
                <BotonExportar onClick={() => {
                  // Una fila por venta (item) — permite analizar receta a receta en Excel
                  const headers = ['Fecha','Hora','Cliente','Medio pago','Receta','Cantidad','Precio unit.','Total ítem','Origen','Delivery','Tipo entrega','Distancia km','Nota orden']
                  const rows = []
                  ordenesFiltradas.forEach(o => {
                    const items = o.ventas || []
                    if (items.length === 0) {
                      rows.push([o.fecha, o.hora || '', o.cliente_nombre || '', o.medio_pago || '', '', '', '', '', o.origen || '', o.delivery || 0, o.delivery_tipo || '', o.distancia_km ?? '', o.nota || ''])
                    } else {
                      items.forEach(v => {
                        const total = (parseFloat(v.litros)||1) * (parseFloat(v.precio_venta)||0)
                        rows.push([
                          o.fecha, o.hora || '', o.cliente_nombre || '', o.medio_pago || '',
                          v.receta_nombre, v.litros, v.precio_venta, total,
                          o.origen || '', o.delivery || 0, o.delivery_tipo || '',
                          o.distancia_km ?? '', o.nota || '',
                        ])
                      })
                    }
                  })
                  descargarCSV('thedrink_pedidos', headers, rows)
                }} />
              )}
            </div>
            <div className="card">
              {ordenesFiltradas.length === 0 && (
                <div style={{ color:'var(--muted)', textAlign:'center', padding:20 }}>
                  {ordenes.length === 0 ? 'Sin pedidos' : 'No hay pedidos que coincidan con el filtro'}
                </div>
              )}
              {ordenesFiltradas.map(o => {
                const totalOrden = (o.ventas || []).reduce((s, v) => s + (v.litros||1) * (v.precio_venta||0), 0)
                // Suma de unidades (litros) en vez del número de filas, así una
                // venta con litros=2 cuenta como 2 productos.
                const nItems = (o.ventas || []).reduce((s, v) => s + (parseFloat(v.litros) || 1), 0)
                const oc = origenColor(o.origen)
                return (
                  <div className="list-item" key={o.id} style={{ gap:8, alignItems:'flex-start' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className="list-item-name"
                        onClick={o.cliente_nombre ? (e) => { e.stopPropagation(); setPerfilCliente(o.cliente_nombre) } : undefined}
                        style={{ cursor: o.cliente_nombre ? 'pointer' : 'default', color: o.cliente_nombre ? 'var(--cyan)' : 'var(--text)' }}>
                        {o.cliente_nombre || 'Cliente anónimo'}
                      </div>
                      <div className="list-item-sub">{o.fecha}{o.hora ? ` · ${o.hora}` : ''} · {Number.isInteger(nItems) ? nItems : nItems.toFixed(1)} producto{nItems !== 1 ? 's' : ''}</div>
                      <div style={{ display:'flex', gap:6, marginTop:3, flexWrap:'wrap' }}>
                        {o.origen && (
                          <span style={{ fontSize:11, background:oc.bg, color:oc.color, borderRadius:10, padding:'1px 7px', fontWeight:600 }}>
                            {origenIcon(o.origen)} {o.origen}
                          </span>
                        )}
                        {o.medio_pago && (
                          <span style={{ fontSize:11, background:'rgba(255,255,255,0.06)', color:'var(--muted)', borderRadius:10, padding:'1px 7px' }}>
                            {MEDIOS_PAGO.find(m => m.id === o.medio_pago)?.label || o.medio_pago}
                          </span>
                        )}
                        {(o.ventas || []).map((v, i) => (
                          <span key={i} style={{ fontSize:11, color:'var(--muted)' }}>{v.receta_nombre}</span>
                        ))}
                      </div>
                      {o.cliente_direccion && (
                        <div style={{ fontSize:11, color:'var(--cyan)', marginTop:2 }}>📍 {o.cliente_direccion}</div>
                      )}
                      {o.cliente_telefono && (
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>📞 {o.cliente_telefono}</div>
                      )}
                      {o.nota && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{o.nota}</div>}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontWeight:700, fontSize:15 }}>{formatCLP(totalOrden)}</div>
                        {o.delivery > 0 && (
                          <div style={{ fontSize:11, color:'var(--pink)' }}>
                            -{formatCLP(o.delivery)} {o.delivery_tipo === 'motoboy' ? 'Moto' : o.delivery_tipo === 'otro' ? 'Entrega' : 'Uber'}
                          </div>
                        )}
                        {o.delivery_cobrado > 0 && (
                          <div style={{ fontSize:11, color:'var(--green)' }}>
                            +{formatCLP(o.delivery_cobrado)} cobrado
                          </div>
                        )}
                      </div>
                      <button onClick={() => setTicket(o)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}
                        title="Ver ticket">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/>
                          <path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
                          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
                        </svg>
                      </button>
                      {o._tipo !== 'huerfana' && (<>
                        <button onClick={() => setEditando(o)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--cyan)', padding:4 }}
                          title="Editar pedido">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => setConfirmar(o)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}
                          title="Eliminar pedido">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </>)}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      })()}
    </div>
  )
}
