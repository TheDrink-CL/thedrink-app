import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ventanaCountdownMin } from '../lib/comandasTiming'

// ─── Cronómetro consciente de hora objetivo ─────────────────────────────────
// Si NO hay hora_objetivo → cuenta desde created_at (igual que antes).
// Si HAY hora_objetivo:
//   - Antes de hora_objetivo - 30min → estado 'futuro' (sin urgencia)
//   - Desde hora_objetivo - 30min → countdown desde ese punto
function useTiempoTranscurrido(createdAt, horaObjetivo, ventanaMin = 30) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const ahora = Date.now()
  const objMs = horaObjetivo ? new Date(horaObjetivo).getTime() : null
  const inicioCountdown = objMs != null ? objMs - ventanaMin * 60 * 1000 : null

  if (objMs != null && ahora < inicioCountdown) {
    const faltanSeg = Math.max(0, Math.floor((inicioCountdown - ahora) / 1000))
    const horas = Math.floor(faltanSeg / 3600)
    const mins = Math.floor((faltanSeg % 3600) / 60)
    return {
      estado: 'futuro',
      texto: horas > 0 ? `${horas}h ${mins}m` : `${mins} min`,
      minutos: 0,
      horaObjetivoMs: objMs,
      tick,
    }
  }

  const referencia = objMs != null ? inicioCountdown : new Date(createdAt).getTime()
  const segundos = Math.max(0, Math.floor((ahora - referencia) / 1000))
  const mm = Math.floor(segundos / 60)
  const ss = segundos % 60
  return {
    estado: 'activa',
    texto: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    minutos: mm,
    horaObjetivoMs: objMs,
    tick,
  }
}

function formatHoraObjetivo(ms) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// ─── Colores por urgencia ─────────────────────────────────────────────────────
function colorUrgencia(minutos) {
  if (minutos < 5)  return { bg: 'rgba(72,199,142,0.12)',  border: 'rgba(72,199,142,0.5)',  texto: '#48c78e', label: '●' }
  if (minutos < 10) return { bg: 'rgba(255,200,50,0.12)',  border: 'rgba(255,200,50,0.5)',  texto: '#ffc832', label: '●' }
  return              { bg: 'rgba(255,80,130,0.15)',        border: 'rgba(255,80,130,0.6)',  texto: '#ff5082', label: '●' }
}

// ─── Tarjeta de comanda ───────────────────────────────────────────────────────
function TarjetaComanda({ comanda, onListo, comandasConfig = {}, clientesPorNombre = {} }) {
  // Resolver distancia: del cliente vinculado o del cliente_nombre
  const cli = clientesPorNombre[(comanda.cliente_nombre || '').trim().toLowerCase()]
  const distanciaKm = cli ? cli.distancia_km : null
  const ventanaMin = ventanaCountdownMin({
    config: comandasConfig,
    tiempoDeliveryExplicito: comanda.tiempo_delivery_min,
    distanciaKmCliente: distanciaKm,
  })
  const t = useTiempoTranscurrido(comanda.created_at, comanda.hora_objetivo, ventanaMin)
  const esFutura = t.estado === 'futuro'
  const urgencia = esFutura
    ? { bg: 'rgba(127,119,221,0.06)', border: 'rgba(127,119,221,0.35)', texto: '#AFA9EC', label: '⏰' }
    : colorUrgencia(t.minutos)
  const items = Array.isArray(comanda.items) ? comanda.items : []

  return (
    <div style={{
      background: urgencia.bg,
      border: `2px solid ${urgencia.border}`,
      borderRadius: 20,
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      position: 'relative',
      transition: 'border-color 1s ease, background 1s ease',
    }}>

      {/* Header: cliente + timer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {comanda.cliente_nombre ? (
            <div style={{ fontSize: 'clamp(16px, 2.5vw, 26px)', fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 4 }}>
              {comanda.cliente_nombre}
            </div>
          ) : (
            <div style={{ fontSize: 'clamp(14px, 2vw, 20px)', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
              Sin nombre
            </div>
          )}
          {comanda.cliente_direccion && (
            <div style={{ fontSize: 'clamp(11px, 1.5vw, 16px)', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              📍 {comanda.cliente_direccion}
            </div>
          )}
          {comanda.venta_orden_id && (
            <div style={{
              display: 'inline-block', marginTop: 6,
              fontSize: 'clamp(9px, 1vw, 12px)', fontWeight: 700,
              color: '#48c78e', background: 'rgba(72,199,142,0.15)',
              borderRadius: 6, padding: '2px 8px',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              ✓ Registrada
            </div>
          )}
        </div>

        {/* Cronómetro */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 'clamp(28px, 4vw, 52px)',
            fontWeight: 900,
            color: urgencia.texto,
            lineHeight: 1,
            letterSpacing: '0.05em'
          }}>
            {t.texto}
          </div>
          <div style={{ fontSize: 'clamp(9px, 1vw, 12px)', color: urgencia.texto, opacity: 0.7, marginTop: 2 }}>
            {urgencia.label} {esFutura ? `PROGRAMADO ${t.horaObjetivoMs ? formatHoraObjetivo(t.horaObjetivoMs) : ''}` : (t.minutos < 5 ? 'OK' : t.minutos < 10 ? 'APURAR' : '¡URGENTE!')}
          </div>
        </div>
      </div>

      {/* Divisor */}
      <div style={{ borderTop: `1px solid ${urgencia.border}`, opacity: 0.4 }} />

      {/* Ítems */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              fontSize: 'clamp(22px, 3.5vw, 42px)',
              fontWeight: 900,
              color: urgencia.texto,
              lineHeight: 1,
              minWidth: '1.8ch',
              textAlign: 'right',
              flexShrink: 0
            }}>
              {item.cantidad}×
            </span>
            <div>
              <span style={{
                fontSize: 'clamp(18px, 2.8vw, 36px)',
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.2,
                textTransform: 'capitalize'
              }}>
                {item.nombre}
              </span>
              {item.nota && (
                <div style={{ fontSize: 'clamp(11px, 1.4vw, 16px)', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  {item.nota}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Nota de la comanda */}
      {comanda.nota && (
        <>
          <div style={{ borderTop: `1px solid ${urgencia.border}`, opacity: 0.4 }} />
          <div style={{ fontSize: 'clamp(12px, 1.5vw, 16px)', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>
            💬 {comanda.nota}
          </div>
        </>
      )}

      {/* Botón listo — solo visible en modo no-TV (para uso desde la app normal) */}
      <button
        onClick={() => { if (!esFutura) onListo(comanda.id) }}
        disabled={esFutura}
        style={{
          background: esFutura ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${urgencia.border}`,
          color: urgencia.texto,
          fontWeight: 800,
          fontSize: 'clamp(12px, 1.5vw, 16px)',
          padding: '10px 0',
          borderRadius: 12,
          cursor: esFutura ? 'not-allowed' : 'pointer',
          letterSpacing: '0.05em',
          width: '100%',
          marginTop: 4,
          opacity: esFutura ? 0.7 : 1,
        }}>
        {esFutura ? `🔒 Aún no es hora (faltan ${t.texto})` : '✓ LISTO'}
      </button>
    </div>
  )
}

// ─── Página principal Comandas ────────────────────────────────────────────────
export default function Comandas() {
  const [comandas, setComandas] = useState([])
  const [comandasConfig, setComandasConfig] = useState({})
  const [clientesPorNombre, setClientesPorNombre] = useState({})
  const [cargando, setCargando] = useState(true)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)
  const audioRef = useRef(null)

  const cargarComandas = async () => {
    const [{ data }, { data: cfg }, { data: cls }] = await Promise.all([
      supabase.from('comandas').select('*').eq('estado', 'pendiente').order('created_at', { ascending: true }),
      supabase.from('config').select('clave, valor').in('clave', ['comandas_prep_minutos','comandas_delivery_min_por_km','comandas_delivery_buffer_min']),
      supabase.from('clientes').select('nombre, distancia_km'),
    ])
    setComandas(data || [])
    const cfgMap = {}
    ;(cfg || []).forEach(c => {
      if (c.clave === 'comandas_prep_minutos') cfgMap.prep_minutos = parseFloat(c.valor)
      if (c.clave === 'comandas_delivery_min_por_km') cfgMap.delivery_min_por_km = parseFloat(c.valor)
      if (c.clave === 'comandas_delivery_buffer_min') cfgMap.delivery_buffer_min = parseFloat(c.valor)
    })
    setComandasConfig(cfgMap)
    const cMap = {}
    ;(cls || []).forEach(c => {
      if (c.nombre) cMap[c.nombre.trim().toLowerCase()] = c
    })
    setClientesPorNombre(cMap)
    setCargando(false)
    setUltimaActualizacion(new Date())
  }

  useEffect(() => {
    cargarComandas()

    // Realtime
    const canal = supabase
      .channel('comandas-tv')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comandas'
      }, (payload) => {
        cargarComandas()
        // Sonido suave al entrar nueva comanda
        if (payload.eventType === 'INSERT') {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.setValueAtTime(880, ctx.currentTime)
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
            gain.gain.setValueAtTime(0.2, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.4)
          } catch (e) {}
        }
      })
      .subscribe()

    return () => supabase.removeChannel(canal)
  }, [])

  const marcarListo = async (id) => {
    await supabase.from('comandas').update({ estado: 'listo' }).eq('id', id)
    // No filtramos localmente — el realtime lo actualiza solo
  }

  // ─── Layout ───────────────────────────────────────────────────────────────
  const numComandas = comandas.length

  // Columnas adaptativas según cantidad de comandas
  const cols = numComandas === 0 ? 1
             : numComandas === 1 ? 1
             : numComandas <= 4 ? 2
             : 3

  return (
    <div style={{
      minHeight: '100vh',
      background: '#09090f',
      padding: '20px 24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, paddingBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: 'clamp(16px, 2vw, 24px)',
            fontWeight: 900, color: '#00b4b4', letterSpacing: 3
          }}>
            THE DRINK
          </div>
          <div style={{
            fontSize: 'clamp(11px, 1.2vw, 14px)',
            color: 'rgba(255,255,255,0.3)',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            paddingLeft: 14, marginLeft: 2
          }}>
            COMANDAS
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Contador */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: 900, color: numComandas > 0 ? '#fff' : 'rgba(255,255,255,0.2)', lineHeight: 1 }}>
              {numComandas}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>
              {numComandas === 1 ? 'pendiente' : 'pendientes'}
            </div>
          </div>

          {/* Hora */}
          <RelojVivo />
        </div>
      </div>

      {/* Estado vacío */}
      {cargando && (
        <div style={{ textAlign: 'center', paddingTop: 80, color: 'rgba(255,255,255,0.2)', fontSize: 18 }}>
          Cargando...
        </div>
      )}

      {!cargando && numComandas === 0 && (
        <div style={{ textAlign: 'center', paddingTop: '15vh' }}>
          <div style={{ fontSize: 64, marginBottom: 20, opacity: 0.15 }}>🍹</div>
          <div style={{ fontSize: 'clamp(20px, 3vw, 36px)', fontWeight: 800, color: 'rgba(255,255,255,0.15)' }}>
            Sin comandas pendientes
          </div>
          <div style={{ fontSize: 'clamp(12px, 1.5vw, 18px)', color: 'rgba(255,255,255,0.08)', marginTop: 10 }}>
            Esperando pedidos...
          </div>
        </div>
      )}

      {/* Grid de comandas */}
      {numComandas > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 20,
          alignItems: 'start'
        }}>
          {(() => {
            // Separar activas vs futuras según ventana variable (prep + delivery)
            const ahora = Date.now()
            const ventanaDe = (c) => {
              const cli = clientesPorNombre[(c.cliente_nombre || '').trim().toLowerCase()]
              return ventanaCountdownMin({
                config: comandasConfig,
                tiempoDeliveryExplicito: c.tiempo_delivery_min,
                distanciaKmCliente: cli ? cli.distancia_km : null,
              })
            }
            const activas = []
            const futuras = []
            ;(comandas || []).forEach(c => {
              const objMs = c.hora_objetivo ? new Date(c.hora_objetivo).getTime() : null
              const ventanaMs = ventanaDe(c) * 60 * 1000
              if (objMs != null && ahora < (objMs - ventanaMs)) futuras.push(c)
              else activas.push(c)
            })
            activas.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            futuras.sort((a, b) => new Date(a.hora_objetivo) - new Date(b.hora_objetivo))
            return [...activas, ...futuras].map(c => (
              <TarjetaComanda key={c.id} comanda={c} onListo={marcarListo}
                comandasConfig={comandasConfig} clientesPorNombre={clientesPorNombre} />
            ))
          })()}
        </div>
      )}

      {/* Footer */}
      {ultimaActualizacion && (
        <div style={{
          position: 'fixed', bottom: 12, right: 16,
          fontSize: 10, color: 'rgba(255,255,255,0.12)',
          letterSpacing: 1
        }}>
          ● LIVE
        </div>
      )}
    </div>
  )
}

// ─── Reloj en tiempo real ─────────────────────────────────────────────────────
function RelojVivo() {
  const [hora, setHora] = useState('')

  useEffect(() => {
    const update = () => setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      fontFamily: 'monospace',
      fontSize: 'clamp(20px, 2.5vw, 32px)',
      fontWeight: 700,
      color: 'rgba(255,255,255,0.2)',
      letterSpacing: '0.05em'
    }}>
      {hora}
    </div>
  )
}
