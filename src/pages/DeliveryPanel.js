import React, { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

// ─── Timer de espera ─────────────────────────────────────────────────────────
function useTiempoEspera(fecha, hora) {
  const [minutos, setMinutos] = useState(0)

  useEffect(() => {
    if (!fecha) return
    const calcular = () => {
      const base = hora ? `${fecha}T${hora}:00` : `${fecha}T00:00:00`
      const creado = new Date(base)
      const ahora = new Date()
      const diff = Math.floor((ahora - creado) / 60000) // minutos
      setMinutos(Math.max(0, diff))
    }
    calcular()
    const id = setInterval(calcular, 60000)
    return () => clearInterval(id)
  }, [fecha, hora])

  return minutos
}

function TimerEspera({ fecha, hora, estado }) {
  const minutos = useTiempoEspera(fecha, hora)
  if (estado === 'entregado') return null

  const horas = Math.floor(minutos / 60)
  const mins = minutos % 60
  const texto = horas > 0 ? `${horas}h ${mins}m` : `${mins}m`

  // Color según urgencia
  const color = minutos < 30 ? 'var(--green)'
    : minutos < 60 ? '#F59E0B'
    : 'var(--pink)'

  const bgColor = minutos < 30 ? 'rgba(34,197,94,0.1)'
    : minutos < 60 ? 'rgba(245,158,11,0.1)'
    : 'rgba(196,0,90,0.12)'

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: bgColor,
      border: `1px solid ${color}44`,
      borderRadius: 20,
      padding: '3px 10px',
      fontSize: 12,
      color,
      fontWeight: 700,
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      {texto} esperando
    </div>
  )
}

const ESTADOS = [
  { id: 'pendiente',  label: 'Pendiente',  emoji: '🕐', color: 'var(--pink)' },
  { id: 'en_camino',  label: 'En camino',  emoji: '🏍️', color: '#F59E0B' },
  { id: 'entregado',  label: 'Entregado',  emoji: '✅', color: 'var(--green)' },
]

const estadoConfig = Object.fromEntries(ESTADOS.map(e => [e.id, e]))

function abrirMaps(direccion) {
  const encoded = encodeURIComponent(direccion)
  // Detectar si es iOS para Waze/Apple Maps o Android para Google Maps
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua)) {
    // iOS: ofrecer Apple Maps primero (link universal que también acepta Waze)
    window.open(`maps://maps.apple.com/?q=${encoded}`, '_blank')
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank')
  }
}

function abrirWaze(direccion) {
  const encoded = encodeURIComponent(direccion)
  window.open(`https://waze.com/ul?q=${encoded}&navigate=yes`, '_blank')
}

function llamarCliente(telefono) {
  window.open(`tel:${telefono}`, '_self')
}

function DeliveryCard({ orden, onEstadoChange, onError }) {
  const [cambiando, setCambiando] = useState(false)
  const cfg = estadoConfig[orden.estado_delivery || 'pendiente']

  // Calcular total de envases (litros) en este pedido
  const totalLitros = (orden.ventas || []).reduce((s, v) => s + (parseFloat(v.litros) || 0), 0)
  const totalPrecio = (orden.ventas || []).reduce((s, v) => s + (parseFloat(v.litros) || 1) * (parseFloat(v.precio_venta) || 0), 0)

  // Siguiente estado
  const estadoActual = orden.estado_delivery || 'pendiente'
  const siguienteEstado = estadoActual === 'pendiente' ? 'en_camino'
    : estadoActual === 'en_camino' ? 'entregado'
    : null

  const handleAvanzar = async () => {
    if (!siguienteEstado) return
    setCambiando(true)
    const { error } = await supabase
      .from('ordenes')
      .update({ estado_delivery: siguienteEstado })
      .eq('id', orden.id)
    setCambiando(false)
    if (error) {
      if (onError) onError('No se pudo actualizar el estado (revisa tu conexión). ' + error.message)
      return
    }
    onEstadoChange()
  }

  const tieneDelivery = ['motoboy', 'propio', 'otro', 'uber', 'didi'].includes(orden.delivery_tipo)

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${cfg.color}33`,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Barra de color estado en el lado izquierdo */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        background: cfg.color,
        borderRadius: '16px 0 0 16px',
      }} />

      {/* Header: nombre + estado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
            {orden.cliente_nombre || 'Cliente anónimo'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {orden.fecha}{orden.hora ? ` · ${orden.hora}` : ''}
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: `${cfg.color}18`,
          border: `1px solid ${cfg.color}44`,
          borderRadius: 20,
          padding: '4px 10px',
          fontSize: 12,
          color: cfg.color,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>
          {cfg.emoji} {cfg.label}
        </div>
      </div>

      {/* Timer de espera */}
      <div style={{ marginBottom: 10 }}>
        <TimerEspera fecha={orden.fecha} hora={orden.hora} estado={orden.estado_delivery} />
      </div>

      {/* Dirección */}
      {orden.cliente_direccion && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 12px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>
            📍 Dirección
          </div>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>
            {orden.cliente_direccion}
          </div>

          {/* Botones Maps y Waze */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => abrirMaps(orden.cliente_direccion)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: 'rgba(66,133,244,0.15)',
                border: '1px solid rgba(66,133,244,0.35)',
                borderRadius: 8,
                color: '#4285F4',
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 0',
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
              Maps
            </button>
            <button
              onClick={() => abrirWaze(orden.cliente_direccion)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: 'rgba(0,210,91,0.12)',
                border: '1px solid rgba(0,210,91,0.3)',
                borderRadius: 8,
                color: '#00D25B',
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 0',
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C7.03 2 3 6.03 3 11c0 3.1 1.5 5.84 3.81 7.56L7 21l2.19-1.3C10.34 20.22 11.16 20.5 12 20.5c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 16c-.7 0-1.38-.1-2.03-.28L8.5 18.5l-.97-2.09A7.002 7.002 0 0 1 5 11c0-3.86 3.14-7 7-7s7 3.14 7 7-3.14 7-7 7zm1-11h-2v4l3.25 2 1-1.63-2.25-1.37V7z"/>
              </svg>
              Waze
            </button>
          </div>
        </div>
      )}

      {/* Productos y envases */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 10,
        flexWrap: 'wrap',
      }}>
        {(orden.ventas || []).map((v, i) => (
          <div key={i} style={{
            background: 'rgba(0,180,180,0.08)',
            border: '1px solid rgba(0,180,180,0.2)',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 12,
            color: 'var(--cyan)',
            fontWeight: 600,
          }}>
            {v.litros}L · {v.receta_nombre}
          </div>
        ))}
      </div>

      {/* Info fila: total + distancia */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>
          {formatCLP(totalPrecio)}
        </div>
        {orden.distancia_km && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            📏 {orden.distancia_km} km
          </div>
        )}
        {orden.medio_pago && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {{ transferencia: '🏦', debito: '💳', credito: '💳', efectivo: '💵' }[orden.medio_pago] || ''} {orden.medio_pago}
          </div>
        )}
      </div>

      {/* Nota */}
      {orden.nota && (
        <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 10 }}>
          📝 {orden.nota}
        </div>
      )}

      {/* Botones de acción */}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Llamar */}
        {orden.cliente_telefono && (
          <button
            onClick={() => llamarCliente(orden.cliente_telefono)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0,180,180,0.1)',
              border: '1px solid rgba(0,180,180,0.3)',
              borderRadius: 10,
              color: 'var(--cyan)',
              fontSize: 13,
              fontWeight: 700,
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.81a2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/>
            </svg>
            Llamar
          </button>
        )}

        {/* Avanzar estado */}
        {siguienteEstado && (
          <button
            onClick={handleAvanzar}
            disabled={cambiando}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: siguienteEstado === 'en_camino'
                ? 'rgba(245,158,11,0.15)'
                : 'rgba(34,197,94,0.15)',
              border: `1px solid ${siguienteEstado === 'en_camino' ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.4)'}`,
              borderRadius: 10,
              color: siguienteEstado === 'en_camino' ? '#F59E0B' : 'var(--green)',
              fontSize: 13,
              fontWeight: 700,
              padding: '10px 14px',
              cursor: cambiando ? 'default' : 'pointer',
              opacity: cambiando ? 0.6 : 1,
            }}
          >
            {cambiando ? '...' : (
              siguienteEstado === 'en_camino'
                ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg> Salir a entregar</>
                : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Marcar entregado</>
            )}
          </button>
        )}

        {/* Entregado — estado final */}
        {estadoActual === 'entregado' && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 10,
            color: 'var(--green)',
            fontSize: 13,
            fontWeight: 700,
            padding: '10px 14px',
          }}>
            ✅ Entregado
          </div>
        )}
      </div>
    </div>
  )
}

export default function DeliveryPanel({ onLogout }) {
  const [ordenes, setOrdenes] = useState([])       // activos (no archivados)
  const [historial, setHistorial] = useState([])   // archivados
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('pendiente')
  const [verHistorial, setVerHistorial] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  const cargarVentas = async (ids) => {
    if (!ids.length) return {}
    const { data: vts } = await supabase.from('ventas').select('*').in('orden_id', ids)
    const map = {}
    ;(vts || []).forEach(v => {
      if (!map[v.orden_id]) map[v.orden_id] = []
      map[v.orden_id].push(v)
    })
    return map
  }

  const load = useCallback(async () => {
    setLoading(true)

    // Activos: no archivados
    const { data: activos } = await supabase
      .from('ordenes')
      .select('*')
      .not('estado_delivery', 'is', null)
      .eq('delivery_archivado', false)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })

    const ventasActivos = await cargarVentas((activos || []).map(o => o.id))
    setOrdenes((activos || []).map(o => ({ ...o, ventas: ventasActivos[o.id] || [] })))
    setLoading(false)
  }, [])

  const loadHistorial = useCallback(async () => {
    const { data: arch } = await supabase
      .from('ordenes')
      .select('*')
      .not('estado_delivery', 'is', null)
      .eq('delivery_archivado', true)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(50)

    const ventasArch = await cargarVentas((arch || []).map(o => o.id))
    setHistorial((arch || []).map(o => ({ ...o, ventas: ventasArch[o.id] || [] })))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (verHistorial) loadHistorial() }, [verHistorial, loadHistorial])

  // Archivar todos los entregados del día actual (o todos los entregados)
  const handleArchivarDia = async () => {
    const entregados = ordenes.filter(o => o.estado_delivery === 'entregado')
    if (entregados.length === 0) { showToast('No hay entregados para archivar'); return }
    setArchivando(true)
    const { error } = await supabase
      .from('ordenes')
      .update({ delivery_archivado: true })
      .in('id', entregados.map(o => o.id))
    if (error) {
      setArchivando(false)
      showToast('No se pudo archivar (revisa tu conexión). ' + error.message)
      return
    }
    await load()
    showToast(`${entregados.length} pedido${entregados.length > 1 ? 's' : ''} archivado${entregados.length > 1 ? 's' : ''} ✓`)
    setArchivando(false)
  }

  const handleLogout = () => { onLogout() }

  const ordenesFiltradas = ordenes.filter(o => o.estado_delivery === filtroEstado)

  const conteos = {
    pendiente: ordenes.filter(o => o.estado_delivery === 'pendiente').length,
    en_camino: ordenes.filter(o => o.estado_delivery === 'en_camino').length,
    entregado: ordenes.filter(o => o.estado_delivery === 'entregado').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 40 }}>
      {toast && (
        <div className="toast">{toast}</div>
      )}

      {/* Header */}
      <div style={{
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div>
          <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 16, fontWeight: 900, color: 'var(--cyan)', letterSpacing: 2 }}>
            THE DRINK
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
            DELIVERY
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--muted)',
            fontSize: 12,
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        >
          Salir
        </button>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* Filtro por estado */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 4,
        }}>
          {ESTADOS.map(e => (
            <button
              key={e.id}
              onClick={() => setFiltroEstado(e.id)}
              style={{
                flex: 1,
                padding: '9px 4px',
                borderRadius: 8,
                border: 'none',
                background: filtroEstado === e.id ? `${e.color}20` : 'none',
                color: filtroEstado === e.id ? e.color : 'var(--muted)',
                fontSize: 11,
                fontWeight: filtroEstado === e.id ? 700 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <span style={{ fontSize: 16 }}>{e.emoji}</span>
              <span>{e.label}</span>
              {conteos[e.id] > 0 && (
                <span style={{
                  background: filtroEstado === e.id ? e.color : 'rgba(255,255,255,0.1)',
                  color: filtroEstado === e.id ? '#000' : 'var(--muted)',
                  borderRadius: 10,
                  padding: '0px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                }}>
                  {conteos[e.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Fila: refrescar + archivar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => { load(); showToast('Actualizado ✓') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--muted)',
              fontSize: 12, padding: '6px 12px', cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Actualizar
          </button>

          {conteos.entregado > 0 && (
            <button
              onClick={handleArchivarDia}
              disabled={archivando}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(107,114,128,0.12)',
                border: '1px solid rgba(107,114,128,0.3)',
                borderRadius: 8, color: 'var(--muted)',
                fontSize: 12, padding: '6px 12px',
                cursor: archivando ? 'default' : 'pointer',
                opacity: archivando ? 0.6 : 1,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
              {archivando ? 'Archivando...' : `Archivar entregados (${conteos.entregado})`}
            </button>
          )}

          <button
            onClick={() => setVerHistorial(v => !v)}
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 5,
              background: verHistorial ? 'rgba(0,180,180,0.1)' : 'none',
              border: `1px solid ${verHistorial ? 'rgba(0,180,180,0.3)' : 'var(--border)'}`,
              borderRadius: 8,
              color: verHistorial ? 'var(--cyan)' : 'var(--muted)',
              fontSize: 12, padding: '6px 12px', cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/>
            </svg>
            Historial
          </button>
        </div>

        {/* Lista de drops */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40, fontSize: 14 }}>
            Cargando pedidos...
          </div>
        ) : ordenesFiltradas.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'var(--muted)',
            padding: '48px 24px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              {filtroEstado === 'pendiente' ? '🕐' : filtroEstado === 'en_camino' ? '🏍️' : '✅'}
            </div>
            <div style={{ fontSize: 14 }}>
              {filtroEstado === 'pendiente'
                ? 'No hay pedidos pendientes'
                : filtroEstado === 'en_camino'
                ? 'No hay pedidos en camino'
                : 'No hay pedidos entregados aún'}
            </div>
          </div>
        ) : (
          ordenesFiltradas.map(o => (
            <DeliveryCard
              key={o.id}
              orden={o}
              onEstadoChange={() => { load(); showToast('Estado actualizado ✓') }}
              onError={showToast}
            />
          ))
        )}

        {/* ── Historial archivado ── */}
        {verHistorial && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase',
              letterSpacing: 1, fontWeight: 700, marginBottom: 12,
              borderTop: '1px solid var(--border)', paddingTop: 16,
            }}>
              Historial archivado
            </div>
            {historial.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0', fontSize: 13 }}>
                Sin pedidos archivados aún
              </div>
            ) : (
              historial.map(o => {
                const totalPrecio = (o.ventas || []).reduce((s, v) => s + (parseFloat(v.litros)||1) * (parseFloat(v.precio_venta)||0), 0)
                return (
                  <div key={o.id} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    marginBottom: 8,
                    opacity: 0.7,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                          {o.cliente_nombre || 'Cliente anónimo'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {o.fecha}{o.hora ? ` · ${o.hora}` : ''}
                        </div>
                        {o.cliente_direccion && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            📍 {o.cliente_direccion}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {(o.ventas || []).map((v, i) => (
                            <span key={i} style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '2px 7px' }}>
                              {v.litros}L · {v.receta_nombre}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>
                          {formatCLP(totalPrecio)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>✅ Entregado</div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
