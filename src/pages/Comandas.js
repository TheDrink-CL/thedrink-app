import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─── Cronómetro por comanda ───────────────────────────────────────────────────
function useTiempoTranscurrido(createdAt) {
  const [segundos, setSegundos] = useState(0)

  useEffect(() => {
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
      setSegundos(Math.max(0, diff))
    }
    calc()
    const t = setInterval(calc, 1000)
    return () => clearInterval(t)
  }, [createdAt])

  const mm = Math.floor(segundos / 60)
  const ss = segundos % 60
  return {
    texto: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    minutos: mm
  }
}

// ─── Colores por urgencia ─────────────────────────────────────────────────────
function colorUrgencia(minutos) {
  if (minutos < 5)  return { bg: 'rgba(72,199,142,0.12)',  border: 'rgba(72,199,142,0.5)',  texto: '#48c78e', label: '●' }
  if (minutos < 10) return { bg: 'rgba(255,200,50,0.12)',  border: 'rgba(255,200,50,0.5)',  texto: '#ffc832', label: '●' }
  return              { bg: 'rgba(255,80,130,0.15)',        border: 'rgba(255,80,130,0.6)',  texto: '#ff5082', label: '●' }
}

// ─── Tarjeta de comanda ───────────────────────────────────────────────────────
function TarjetaComanda({ comanda, onListo }) {
  const { texto: timerTexto, minutos } = useTiempoTranscurrido(comanda.created_at)
  const urgencia = colorUrgencia(minutos)
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
            {timerTexto}
          </div>
          <div style={{ fontSize: 'clamp(9px, 1vw, 12px)', color: urgencia.texto, opacity: 0.7, marginTop: 2 }}>
            {urgencia.label} {minutos < 5 ? 'OK' : minutos < 10 ? 'APURAR' : '¡URGENTE!'}
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
        onClick={() => onListo(comanda.id)}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: `1px solid ${urgencia.border}`,
          color: urgencia.texto,
          fontWeight: 800,
          fontSize: 'clamp(12px, 1.5vw, 16px)',
          padding: '10px 0',
          borderRadius: 12,
          cursor: 'pointer',
          letterSpacing: '0.05em',
          width: '100%',
          marginTop: 4
        }}>
        ✓ LISTO
      </button>
    </div>
  )
}

// ─── Página principal Comandas ────────────────────────────────────────────────
export default function Comandas() {
  const [comandas, setComandas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)
  const audioRef = useRef(null)

  const cargarComandas = async () => {
    const { data } = await supabase
      .from('comandas')
      .select('*')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: true })
    setComandas(data || [])
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
    setComandas(prev => prev.filter(c => c.id !== id))
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
          {comandas.map(c => (
            <TarjetaComanda key={c.id} comanda={c} onListo={marcarListo} />
          ))}
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
