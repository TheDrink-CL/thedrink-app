import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP, enriquecerVentasConDelivery } from '../lib/calculos'
import { evaluarSaludNegocio } from '../lib/saludNegocio'

export default function SaludNegocio() {
  const [estado, setEstado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const results = await Promise.all([
        supabase.from('horas_trabajadas').select('fecha, hora_inicio, hora_fin, persona_id, rol_id'),
        supabase.from('ventas').select('fecha, litros, precio_venta, delivery, orden_id'),
        supabase.from('ordenes').select('id, fecha, delivery, delivery_cobrado'),
        supabase.from('personas').select('id, tarifa_hora'),
        supabase.from('roles').select('id, tarifa_hora'),
        supabase.from('config').select('clave, valor').eq('clave', 'crecimiento_min_pct_mes').maybeSingle(),
      ])
      const errores = results.map((r, i) => r.error ? { idx: i, msg: r.error.message } : null).filter(Boolean)
      if (errores.length > 0) {
        const tablas = ['horas_trabajadas', 'ventas', 'ordenes', 'personas', 'roles', 'config']
        throw new Error(errores.map(e => `${tablas[e.idx]}: ${e.msg}`).join(' · '))
      }
      const [
        { data: bloques },
        { data: ventas },
        { data: ordenes },
        { data: personas },
        { data: roles },
        { data: cfg },
      ] = results
      const tarifaDePersona = {}
      ;(personas || []).forEach(p => { tarifaDePersona[p.id] = p.tarifa_hora })
      const tarifaDeRol = {}
      ;(roles || []).forEach(r => { tarifaDeRol[r.id] = r.tarifa_hora })
      const umbral = cfg ? parseFloat(cfg.valor) || 0.05 : 0.05
      // El costo de delivery vive en `ordenes`, no en las filas de `ventas`
      // (que traen delivery: 0) — hay que enriquecerlas antes de evaluar.
      const ventasEnr = enriquecerVentasConDelivery(ventas || [], ordenes || [])
      const resultado = evaluarSaludNegocio({
        bloques: bloques || [],
        ventas: ventasEnr,
        tarifaDePersona, tarifaDeRol,
        umbralCrecimientoMes: umbral,
      })
      setEstado(resultado)
    } catch (e) {
      console.error('SaludNegocio - error:', e)
      setErrorCarga(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: 14 }}>
        Evaluando salud del negocio...
      </div>
    )
  }
  if (errorCarga) {
    return (
      <div className="card" style={{ borderColor: 'rgba(196,0,90,0.4)' }}>
        <div className="card-title" style={{ color: 'var(--pink)' }}>💼 Salud del negocio — error al cargar</div>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
          {errorCarga}
        </div>
      </div>
    )
  }
  if (!estado || estado.datosInsuficientes) {
    return (
      <div className="card" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border)' }}>
        <div className="card-title" style={{ color: 'var(--muted)' }}>💼 Salud del negocio</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          {estado?.mensaje || 'Aún no hay datos suficientes. Registra horas regularmente para evaluar la salud del negocio.'}
        </div>
      </div>
    )
  }

  const { veredicto, color, mensaje, mesActual, crecimientoSemana, crecimientoMes, mesesParaCubrir, umbralCrecimientoMes } = estado

  const bgPorVeredicto = {
    autosostenible: 'rgba(34,197,94,0.10)',
    autosostenible_en_riesgo: 'rgba(245,158,11,0.10)',
    optimista: 'rgba(0,180,180,0.10)',
    estancado: 'rgba(196,0,90,0.10)',
    retrocede: 'rgba(196,0,90,0.12)',
  }
  const bordePorVeredicto = {
    autosostenible: 'rgba(34,197,94,0.4)',
    autosostenible_en_riesgo: 'rgba(245,158,11,0.4)',
    optimista: 'rgba(0,180,180,0.4)',
    estancado: 'rgba(196,0,90,0.4)',
    retrocede: 'rgba(196,0,90,0.45)',
  }

  const iconoPorVeredicto = {
    autosostenible: '✓',
    autosostenible_en_riesgo: '⚠️',
    optimista: '🚀',
    estancado: '⚠️',
    retrocede: '📉',
  }

  // Componente de pill de crecimiento
  const Crecimiento = ({ valor, label }) => {
    if (valor == null) {
      return (
        <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 10px' }}>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>{label}</div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--muted)' }}>—</div>
        </div>
      )
    }
    const pct = Math.round(valor * 100)
    const col = pct > 0 ? 'var(--green)' : pct < -2 ? 'var(--pink)' : 'var(--muted)'
    const flecha = pct > 2 ? '↑' : pct < -2 ? '↓' : '→'
    return (
      <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 10px' }}>
        <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>{label}</div>
        <div style={{ fontSize:13, fontWeight:700, color:col }}>
          {flecha} {pct > 0 ? '+' : ''}{pct}%
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{
      background: bgPorVeredicto[veredicto] || 'rgba(255,255,255,0.03)',
      border: '1px solid ' + (bordePorVeredicto[veredicto] || 'var(--border)'),
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div className="card-title" style={{ color, margin:0 }}>
          💼 Salud del negocio
        </div>
        <div style={{ fontSize: 24, lineHeight: 1 }}>{iconoPorVeredicto[veredicto] || '·'}</div>
      </div>

      {/* Ingreso/h vs Tarifa */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
        <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'9px 10px' }}>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3 }}>
            Ingreso/h (30d)
          </div>
          <div style={{ fontSize:16, fontWeight:800, color }}>
            {formatCLP(mesActual.ingresoPorHora)}
          </div>
        </div>
        <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'9px 10px' }}>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3 }}>
            Tu costo oport./h
          </div>
          <div style={{ fontSize:16, fontWeight:800, color:'#AFA9EC' }}>
            {formatCLP(mesActual.costoOportPorHora)}
          </div>
        </div>
      </div>

      {/* Tendencias semana y mes */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
        <Crecimiento valor={crecimientoSemana} label="↻ vs sem. anterior" />
        <Crecimiento valor={crecimientoMes} label="↻ vs mes anterior" />
      </div>

      {/* Mensaje contextual */}
      <div style={{
        padding:'10px 12px', background:'rgba(0,0,0,0.18)', borderRadius:8,
        fontSize:12, color:'var(--text)', lineHeight:1.7,
      }}>
        {mensaje}
      </div>

      {/* Footer con umbral configurable */}
      <div style={{ fontSize:10, color:'var(--muted)', marginTop:8, textAlign:'right', fontStyle:'italic' }}>
        Umbral crecimiento "saludable": {Math.round(umbralCrecimientoMes * 100)}%/mes
        {mesesParaCubrir != null && ` · proyección autosostenible: ~${Math.ceil(mesesParaCubrir)} meses`}
      </div>
    </div>
  )
}
