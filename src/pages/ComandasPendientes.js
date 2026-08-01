import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { descontarStock } from '../lib/inventario'
import { construirEsVip } from '../lib/clientesVip'

const fechaHoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const horaAhora = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
const formatCLP = n => '$' + Math.round(n).toLocaleString('es-CL')

const MEDIOS_PAGO = [
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'debito',        label: 'Debito' },
  { id: 'credito',       label: 'Credito' },
  { id: 'efectivo',      label: 'Efectivo' },
]
const TIPOS_DELIVERY = [
  { id: 'uber',    label: 'Uber Eats' },
  { id: 'motoboy', label: 'Motoboy' },
  { id: 'propio',  label: 'Propio (EV)' },
  { id: 'retiro',  label: 'Retiro' },
  { id: 'otro',    label: 'Otro' },
]

// ─── Modal para convertir comanda en venta ───────────────────────────────────
function ModalVenta({ comanda, recetas, onGuardar, onCerrar }) {
  const [fecha, setFecha] = useState(fechaHoy())
  const [hora, setHora]   = useState(horaAhora())
  const [medioPago, setMedioPago] = useState('transferencia')
  const [delivery, setDelivery]   = useState('')
  const [deliveryCobrado, setDeliveryCobrado] = useState('')
  const [deliveryTipo, setDeliveryTipo] = useState(comanda.cliente_direccion ? 'propio' : '')
  const [distanciaKm, setDistanciaKm] = useState('')
  const [nota, setNota] = useState(comanda.nota || '')
  const [origen, setOrigen] = useState('Cliente habitual')
  const [guardando, setGuardando] = useState(false)

  const iniciarItems = () => (comanda.items || []).map((it, i) => {
    const receta = recetas.find(r => r.nombre === it.receta_nombre)
    return {
      key: i,
      receta_nombre: it.receta_nombre || '',
      litros: it.cantidad || 1,
      precio_venta: receta?.precio_venta || it.precio_venta || '',
      nota: it.nota || ''
    }
  })
  const [items, setItems] = useState(iniciarItems)

  const updateItem = (key, field, val) => setItems(prev => prev.map(it => {
    if (it.key !== key) return it
    const up = { ...it, [field]: val }
    if (field === 'receta_nombre') {
      const r = recetas.find(r => r.nombre === val)
      if (r) up.precio_venta = r.precio_venta
    }
    return up
  }))

  const total = items.reduce((s, it) => {
    const base = parseFloat(it.precio_venta) || 0
    return s + base * (parseFloat(it.litros) || 1)
  }, 0)
  const totalNeto = total - (parseFloat(delivery) || 0) + (parseFloat(deliveryCobrado) || 0)

  const handleGuardar = async () => {
    const validos = items.filter(it => it.receta_nombre && it.precio_venta)
    if (!validos.length) { alert('Agrega al menos un item con receta y precio'); return }
    setGuardando(true)
    try {
      const { data: orden, error: errOrden } = await supabase.from('ordenes').insert({
        fecha, hora: hora || null,
        cliente_nombre: comanda.cliente_nombre || null,
        cliente_id: comanda.cliente_id || null,
        cliente_telefono: comanda.cliente_telefono || null,
        cliente_direccion: comanda.cliente_direccion || null,
        origen, medio_pago: medioPago,
        nota: nota || null,
        delivery: parseFloat(delivery) || 0,
        delivery_cobrado: parseFloat(deliveryCobrado) || 0,
        delivery_tipo: deliveryTipo || null,
        distancia_km: distanciaKm ? parseFloat(distanciaKm) : null,
        estado_delivery: comanda.cliente_direccion ? 'pendiente' : null,
      }).select().single()

      if (errOrden || !orden) throw new Error(errOrden?.message || 'Error orden')

      await supabase.from('ventas').insert(validos.map(it => ({
        fecha,
        receta_nombre: it.receta_nombre,
        litros: parseFloat(it.litros) || 1,
        precio_venta: parseFloat(it.precio_venta) || 0,
        delivery: 0,
        origen: origen || null,
        nota: it.nota || null,
        orden_id: orden.id,
      })))

      // Descontar inventario por los ingredientes consumidos en esta venta.
      const resStock = await descontarStock(validos)
      if (resStock && !resStock.ok) {
        alert('Venta registrada, pero no se pudo descontar stock de: ' + resStock.fallidos.join(', '))
      }

      // Vincular la comanda con la venta creada. NO archivamos automáticamente:
      // si la comanda estaba "pendiente" sigue ahí (la TV la sigue mostrando con
      // cronómetro hasta que el cocinero toque ✓ LISTO). Si estaba "listo" o ya
      // tenía venta vinculada, sí la archivamos.
      const update = { venta_orden_id: orden.id }
      if (comanda.estado === 'listo' || comanda.venta_orden_id) {
        update.estado = 'archivado'
      }
      const { error: errUpdate } = await supabase.from('comandas').update(update).eq('id', comanda.id)
      if (errUpdate) throw new Error(errUpdate.message || 'Error al vincular la venta con la comanda')
      onGuardar()
    } catch(e) {
      alert('Error: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const inp = { width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:14 }
  const lbl = { fontSize:11, color:'var(--muted)', fontWeight:600, marginBottom:4, display:'block', textTransform:'uppercase', letterSpacing:'0.05em' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:'20px 16px', overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:480, width:'100%', marginTop:10 }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)' }}>Registrar venta</div>
            {comanda.cliente_nombre && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{comanda.cliente_nombre}</div>}
          </div>
          <button onClick={onCerrar} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:22 }}>x</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <div><span style={lbl}>Fecha</span><input type="date" style={inp} value={fecha} onChange={e=>setFecha(e.target.value)} /></div>
          <div><span style={lbl}>Hora</span><input type="time" style={inp} value={hora} onChange={e=>setHora(e.target.value)} /></div>
        </div>

        <span style={lbl}>Items</span>
        {items.map(it => (
          <div key={it.key} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
            <select style={{ ...inp, flex:2 }} value={it.receta_nombre} onChange={e=>updateItem(it.key,'receta_nombre',e.target.value)}>
              <option value="">Receta...</option>
              {recetas.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
            </select>
            <input type="number" style={{ ...inp, width:52, textAlign:'center', flexShrink:0 }} value={it.litros}
              onChange={e=>updateItem(it.key,'litros',e.target.value)} placeholder="L" />
            <input type="number" style={{ ...inp, flex:1 }} value={it.precio_venta}
              onChange={e=>updateItem(it.key,'precio_venta',e.target.value)} placeholder="$" />
          </div>
        ))}

        <div style={{ marginBottom:14, marginTop:4 }}>
          <span style={lbl}>Medio de pago</span>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {MEDIOS_PAGO.map(m => (
              <button key={m.id} onClick={()=>setMedioPago(m.id)} style={{
                padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                background: medioPago===m.id ? 'var(--cyan)' : 'rgba(255,255,255,0.07)',
                color: medioPago===m.id ? '#000' : 'var(--muted)'
              }}>{m.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <div>
            <span style={lbl}>Costo delivery</span>
            <input type="number" style={inp} value={delivery} onChange={e=>setDelivery(e.target.value)} placeholder="0" />
          </div>
          <div>
            <span style={lbl}>Tipo</span>
            <select style={inp} value={deliveryTipo} onChange={e=>setDeliveryTipo(e.target.value)}>
              <option value="">Ninguno</option>
              {TIPOS_DELIVERY.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Cobrado al cliente por delivery</span>
          <input type="number" style={inp} value={deliveryCobrado} onChange={e=>setDeliveryCobrado(e.target.value)} placeholder="0" />
        </div>

        <div style={{ marginBottom:14 }}>
          <span style={lbl}>Origen</span>
          <select style={inp} value={origen} onChange={e=>setOrigen(e.target.value)}>
            {['IG Organico','IG Pauta','Referido','Cliente habitual','Evento','Otro'].map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div style={{ marginBottom:18 }}>
          <span style={lbl}>Nota</span>
          <input style={inp} value={nota} onChange={e=>setNota(e.target.value)} placeholder="Opcional..." />
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 0', borderTop:'1px solid var(--border)', marginBottom:16 }}>
          <span style={{ fontSize:14, color:'var(--muted)' }}>Total neto</span>
          <span style={{ fontSize:22, fontWeight:900, color:'var(--green)' }}>{formatCLP(totalNeto)}</span>
        </div>

        <button onClick={handleGuardar} disabled={guardando} style={{
          width:'100%', background:'var(--cyan)', color:'#000', fontWeight:800, fontSize:15,
          border:'none', borderRadius:10, padding:'13px', cursor:'pointer'
        }}>
          {guardando ? 'Guardando...' : 'Confirmar venta'}
        </button>
      </div>
    </div>
  )
}

// ─── Cronómetro ───────────────────────────────────────────────────────────────
function useTiempo(createdAt) {
  const [seg, setSeg] = useState(0)
  useEffect(() => {
    const calc = () => setSeg(Math.max(0, Math.floor((Date.now() - new Date(createdAt)) / 1000)))
    calc(); const t = setInterval(calc, 1000); return () => clearInterval(t)
  }, [createdAt])
  const mm = Math.floor(seg/60), ss = seg%60
  return { texto: `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`, minutos: mm }
}

// ─── Tarjeta de comanda ───────────────────────────────────────────────────────
function TarjetaComanda({ comanda, onConvertir, onArchivar, esVIP }) {
  const { texto, minutos } = useTiempo(comanda.created_at)
  const esListo = comanda.estado === 'listo'
  const color = esListo ? '#00b4b4' : minutos < 5 ? '#48c78e' : minutos < 10 ? '#ffc832' : '#ff5082'
  const items = comanda.items || []

  return (
    <div style={{
      background: esListo ? 'rgba(0,180,180,0.06)' : 'var(--card)',
      border: `1.5px solid ${color}44`,
      borderRadius:14, padding:16, marginBottom:10
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          {esListo && <span style={{ fontSize:10, fontWeight:800, color:'#00b4b4', letterSpacing:1, display:'block', marginBottom:3 }}>ELABORADO</span>}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--text-strong)' }}>
              {comanda.cliente_nombre || 'Sin nombre'}
            </div>
            {esVIP && (
              <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>⭐ VIP</span>
            )}
          </div>
          {comanda.cliente_direccion && (
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
              {comanda.cliente_direccion}
            </div>
          )}
        </div>
        <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:900, color, lineHeight:1 }}>{texto}</div>
      </div>

      <div style={{ marginBottom:12 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3 }}>
            <span style={{ fontSize:14, fontWeight:800, color, minWidth:28 }}>{it.cantidad}x</span>
            <span style={{ fontSize:14, color:'var(--text-strong)', fontWeight:600 }}>
              {it.receta_nombre || it.nombre}
            </span>
            {it.precio_venta && (
              <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>
                {formatCLP(it.precio_venta * it.cantidad)}
              </span>
            )}
          </div>
        ))}
        {comanda.nota && <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic', marginTop:6 }}>"{comanda.nota}"</div>}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        {comanda.venta_orden_id ? (
          <div style={{
            flex:1, textAlign:'center', background:'rgba(0,180,180,0.12)', color:'#00b4b4', fontWeight:800, fontSize:13,
            border:'1px solid rgba(0,180,180,0.3)', borderRadius:10, padding:'10px'
          }}>
            ✓ Venta registrada
          </div>
        ) : (
          <button onClick={() => onConvertir(comanda)} style={{
            flex:1, background:'var(--cyan)', color:'#000', fontWeight:800, fontSize:13,
            border:'none', borderRadius:10, padding:'10px', cursor:'pointer'
          }}>
            Registrar venta
          </button>
        )}
        <button onClick={() => onArchivar(comanda.id)} style={{
          background:'rgba(255,255,255,0.05)', color:'var(--muted)', fontWeight:600, fontSize:12,
          border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', cursor:'pointer'
        }}>
          Archivar
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ComandasPendientes() {
  const [comandas, setComandas] = useState([])
  const [recetas, setRecetas] = useState([])
  const [esVip, setEsVip] = useState(() => () => false)
  const [cargando, setCargando] = useState(true)
  const [activa, setActiva] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  const cargar = async () => {
    const [{ data: cmd }, { data: rec }, { data: cls }, { data: ords }] = await Promise.all([
      supabase.from('comandas').select('*')
        .in('estado', ['pendiente', 'listo'])
        .order('created_at', { ascending: true }),
      supabase.from('recetas').select('nombre, precio_venta').order('nombre'),
      supabase.from('clientes').select('id, nombre, tag'),
      supabase.from('ordenes').select('cliente_id, cliente_nombre'),
    ])
    setComandas(cmd || [])
    setRecetas((rec || []).filter(r => r.nombre !== 'ENVASE'))
    setEsVip(() => construirEsVip(cls || [], ords || []))
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    const canal = supabase.channel('comandas-app')
      .on('postgres_changes', { event:'*', schema:'public', table:'comandas' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [])

  const handleArchivar = async (id) => {
    await supabase.from('comandas').update({ estado: 'archivado' }).eq('id', id)
    setComandas(prev => prev.filter(c => c.id !== id))
    showToast('Comanda archivada')
  }

  const handleArchivarTodas = async () => {
    const ids = comandas.filter(c => c.estado === 'listo').map(c => c.id)
    if (!ids.length) { showToast('No hay comandas elaboradas para archivar'); return }
    await supabase.from('comandas').update({ estado: 'archivado' }).in('id', ids)
    setComandas(prev => prev.filter(c => !ids.includes(c.id)))
    showToast(`${ids.length} comanda${ids.length > 1 ? 's' : ''} archivada${ids.length > 1 ? 's' : ''}`)
  }

  const handleVentaGuardada = () => {
    setActiva(null)
    cargar()
    showToast('Venta registrada correctamente')
  }

  const pendientes = comandas.filter(c => c.estado === 'pendiente')
  const listos = comandas.filter(c => c.estado === 'listo')

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {activa && (
        <ModalVenta
          comanda={activa}
          recetas={recetas}
          onGuardar={handleVentaGuardada}
          onCerrar={() => setActiva(null)}
        />
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div className="page-title" style={{ marginBottom:16 }}>Comandas</div>
        {listos.length > 0 && (
          <button onClick={handleArchivarTodas} style={{
            fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:8, cursor:'pointer',
            background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)',
            color:'var(--muted)'
          }}>
            Archivar elaboradas ({listos.length})
          </button>
        )}
      </div>

      {cargando && <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Cargando...</div>}

      {!cargando && comandas.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 20px' }}>
          <div style={{ fontSize:40, marginBottom:12, opacity:0.2 }}>🍹</div>
          <div style={{ fontSize:16, color:'var(--muted)' }}>Sin comandas activas</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:6, opacity:0.6 }}>
            Los pedidos importados desde WhatsApp aparecen aqui.
          </div>
        </div>
      )}

      {/* Pendientes primero */}
      {pendientes.map(c => (
        <TarjetaComanda key={c.id} comanda={c} onConvertir={setActiva} onArchivar={handleArchivar} esVIP={esVip(c)} />
      ))}

      {/* Separador si hay ambos estados */}
      {pendientes.length > 0 && listos.length > 0 && (
        <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:1, textTransform:'uppercase', margin:'16px 0 10px', opacity:0.5 }}>
          Elaborados — pendiente de registrar
        </div>
      )}

      {/* Elaborados */}
      {listos.map(c => (
        <TarjetaComanda key={c.id} comanda={c} onConvertir={setActiva} onArchivar={handleArchivar} esVIP={esVip(c)} />
      ))}
    </div>
  )
}
