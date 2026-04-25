import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

// ─── Helpers ────────────────────────────────────────────────────────────────

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Parsea fecha "YYYY-MM-DD" sin desfase de zona horaria
function parseFecha(fechaStr) {
  const [y, m, d] = fechaStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function semanaDelMes(fecha) {
  return Math.ceil(fecha.getDate() / 7)
}

function labelSemana(yyyymm, sem) {
  const [y, m] = yyyymm.split('-')
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `Sem ${sem} · ${meses[parseInt(m,10)-1]} ${y}`
}

// ─── Bloque: Ventas por día de la semana ────────────────────────────────────

function VentasPorDia({ ventas }) {
  // Acumula ingreso y frecuencia por día (0=Dom … 6=Sáb)
  const porDia = Array(7).fill(null).map(() => ({ ingreso: 0, ventas: 0 }))
  ventas.forEach(v => {
    const dia = parseFecha(v.fecha).getDay()
    porDia[dia].ingreso += v.litros * v.precio_venta
    porDia[dia].ventas += 1
  })

  const maxIngreso = Math.max(...porDia.map(d => d.ingreso), 1)

  // Ordenar Lun→Dom para mejor lectura
  const orden = [1, 2, 3, 4, 5, 6, 0]

  return (
    <div className="card">
      <div className="card-title">Ventas por día de la semana</div>
      {ventas.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 12 }}>Sin datos</div>
      )}
      {ventas.length > 0 && orden.map(idx => {
        const d = porDia[idx]
        const pct = maxIngreso > 0 ? d.ingreso / maxIngreso : 0
        const esMejor = d.ingreso === maxIngreso && d.ingreso > 0
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {/* Etiqueta día */}
            <div style={{
              width: 32, fontSize: 12, fontWeight: 700,
              color: esMejor ? 'var(--cyan)' : 'var(--muted)',
              textAlign: 'right', flexShrink: 0
            }}>
              {DIAS[idx]}
            </div>
            {/* Barra */}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: esMejor
                  ? 'linear-gradient(90deg, var(--cyan), #00e5e5)'
                  : 'rgba(0,180,180,0.4)',
                width: (pct * 100) + '%',
                transition: 'width 0.4s ease'
              }} />
            </div>
            {/* Monto */}
            <div style={{
              width: 72, fontSize: 12, textAlign: 'right', flexShrink: 0,
              color: esMejor ? 'var(--cyan)' : 'var(--text)',
              fontWeight: esMejor ? 700 : 400
            }}>
              {d.ingreso > 0 ? formatCLP(d.ingreso) : '—'}
            </div>
            {/* Nº ventas */}
            <div style={{ width: 24, fontSize: 11, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
              {d.ventas > 0 ? `×${d.ventas}` : ''}
            </div>
          </div>
        )
      })}
      {ventas.length > 0 && (() => {
        const mejorIdx = porDia.reduce((best, d, i) => d.ingreso > porDia[best].ingreso ? i : best, 0)
        const peorIdx = porDia.reduce((worst, d, i) => (d.ingreso > 0 && d.ingreso < porDia[worst].ingreso) || porDia[worst].ingreso === 0 ? i : worst, porDia.findIndex(d => d.ingreso > 0))
        return (
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,180,180,0.05)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            🏆 Mejor día: <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{DIAS[mejorIdx]}</span>
            {' · '}
            {peorIdx >= 0 && <>Más flojo: <span style={{ color: 'var(--muted)' }}>{DIAS[peorIdx]}</span></>}
          </div>
        )
      })()}
    </div>
  )
}

// ─── Bloque: Tendencia semanal (últimas 8 semanas) ──────────────────────────

function TendenciaSemanal({ ventas }) {
  // Agrupa por YYYY-MM + semana del mes
  const porSemana = {}
  ventas.forEach(v => {
    const fecha = parseFecha(v.fecha)
    const yyyymm = v.fecha.slice(0, 7)
    const sem = semanaDelMes(fecha)
    const key = `${yyyymm}-S${sem}`
    if (!porSemana[key]) porSemana[key] = { ingreso: 0, ventas: 0, label: labelSemana(yyyymm, sem) }
    porSemana[key].ingreso += v.litros * v.precio_venta
    porSemana[key].ventas += 1
  })

  const semanas = Object.entries(porSemana)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8) // últimas 8 semanas

  if (semanas.length === 0) return null

  const maxIngreso = Math.max(...semanas.map(([, d]) => d.ingreso), 1)

  return (
    <div className="card">
      <div className="card-title">Tendencia semanal (últimas semanas)</div>
      {semanas.map(([key, d]) => {
        const pct = d.ingreso / maxIngreso
        return (
          <div key={key} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>{formatCLP(d.ingreso)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: 'linear-gradient(90deg, var(--purple), var(--cyan))',
                width: (pct * 100) + '%'
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Bloque: Semáforo de publicidad ─────────────────────────────────────────

function SemaforoPub({ ventas, gastosPub }) {
  const hoy = new Date()

  // 1. Días desde la última pauta
  const ultimaPauta = gastosPub.length > 0
    ? gastosPub.reduce((last, m) => m.fecha > last ? m.fecha : last, gastosPub[0].fecha)
    : null
  const diasSinPub = ultimaPauta
    ? Math.floor((hoy - parseFecha(ultimaPauta)) / (1000 * 60 * 60 * 24))
    : null

  // 2. Gasto en publicidad este mes
  const mesActual = hoy.toISOString().slice(0, 7)
  const gastoPubMes = gastosPub
    .filter(m => m.fecha.slice(0, 7) === mesActual)
    .reduce((s, m) => s + m.monto, 0)

  // 3. Ventas últimos 7 días vs 7 días anteriores (momentum)
  const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7)
  const hace14 = new Date(hoy); hace14.setDate(hoy.getDate() - 14)
  const vts7 = ventas.filter(v => parseFecha(v.fecha) >= hace7).reduce((s, v) => s + v.litros * v.precio_venta, 0)
  const vts7ant = ventas.filter(v => parseFecha(v.fecha) >= hace14 && parseFecha(v.fecha) < hace7).reduce((s, v) => s + v.litros * v.precio_venta, 0)
  const momentum = vts7ant > 0 ? (vts7 - vts7ant) / vts7ant : null

  // 4. Día de la semana actual (mejor no pautar martes/miércoles genéricamente)
  const diaSemana = hoy.getDay() // 0=Dom, 5=Vie, 6=Sáb

  // ── Lógica de recomendación ──────────────────────────────────────────────
  const factores = []
  let puntaje = 0 // -2 a +2, positivo = sí pautar

  // Factor: tiempo sin publicidad
  if (diasSinPub === null) {
    factores.push({ icon: '📅', texto: 'Nunca has pautado — es buen momento para probar', peso: 1, tipo: 'positivo' })
    puntaje += 1
  } else if (diasSinPub >= 14) {
    factores.push({ icon: '📅', texto: `Llevas ${diasSinPub} días sin pautar — la audiencia se enfría`, peso: 1, tipo: 'positivo' })
    puntaje += 1
  } else if (diasSinPub <= 3) {
    factores.push({ icon: '📅', texto: `Pautaste hace solo ${diasSinPub} días — deja que la campaña respire`, peso: -1, tipo: 'negativo' })
    puntaje -= 1
  } else {
    factores.push({ icon: '📅', texto: `Última pauta hace ${diasSinPub} días — tiempo razonable`, peso: 0, tipo: 'neutro' })
  }

  // Factor: gasto del mes
  if (gastoPubMes > 30000) {
    factores.push({ icon: '💸', texto: `Ya llevas ${formatCLP(gastoPubMes)} en ads este mes — cuidado con el presupuesto`, peso: -1, tipo: 'negativo' })
    puntaje -= 1
  } else if (gastoPubMes === 0) {
    factores.push({ icon: '💸', texto: 'Sin gasto en publicidad este mes — margen disponible', peso: 1, tipo: 'positivo' })
    puntaje += 1
  } else {
    factores.push({ icon: '💸', texto: `Gasto del mes: ${formatCLP(gastoPubMes)} — dentro de rango`, peso: 0, tipo: 'neutro' })
  }

  // Factor: momentum de ventas
  if (momentum !== null) {
    if (momentum < -0.3) {
      factores.push({ icon: '📉', texto: `Ventas cayeron ${Math.abs(Math.round(momentum * 100))}% esta semana — el boost puede ayudar`, peso: 1, tipo: 'positivo' })
      puntaje += 1
    } else if (momentum > 0.3) {
      factores.push({ icon: '📈', texto: `Ventas subieron ${Math.round(momentum * 100)}% esta semana — ya hay momentum orgánico`, peso: -1, tipo: 'negativo' })
      puntaje -= 1
    } else {
      factores.push({ icon: '〰️', texto: 'Ventas estables esta semana', peso: 0, tipo: 'neutro' })
    }
  }

  // Factor: día de la semana
  if (diaSemana === 4 || diaSemana === 5) { // Jue o Vie
    factores.push({ icon: '📆', texto: 'Jueves/Viernes — buen momento para activar: el fin de semana viene', peso: 1, tipo: 'positivo' })
    puntaje += 1
  } else if (diaSemana === 1 || diaSemana === 2) { // Lun o Mar
    factores.push({ icon: '📆', texto: 'Lunes/Martes — semana temprana, la gente no suele comprar tragos hoy', peso: -1, tipo: 'negativo' })
    puntaje -= 1
  } else if (diaSemana === 6 || diaSemana === 0) { // Sáb o Dom
    factores.push({ icon: '📆', texto: 'Fin de semana — activa solo si tienes stock y capacidad de entrega hoy', peso: 0, tipo: 'neutro' })
  } else { // Mié
    factores.push({ icon: '📆', texto: 'Miércoles — día neutro, depende de otros factores', peso: 0, tipo: 'neutro' })
  }

  // ── Decisión final ───────────────────────────────────────────────────────
  let decision, color, borde, icono
  if (puntaje >= 2) {
    decision = 'Buena idea pautar hoy'
    color = 'var(--green)'
    borde = 'rgba(34,197,94,0.35)'
    icono = '🟢'
  } else if (puntaje <= -2) {
    decision = 'Mejor abstenerse por ahora'
    color = 'var(--pink)'
    borde = 'rgba(196,0,90,0.35)'
    icono = '🔴'
  } else {
    decision = 'Podría funcionar — evalúa'
    color = '#f59e0b'
    borde = 'rgba(245,158,11,0.35)'
    icono = '🟡'
  }

  const colorFactor = { positivo: 'var(--green)', negativo: 'var(--pink)', neutro: 'var(--muted)' }

  return (
    <div className="card" style={{ border: `1px solid ${borde}` }}>
      <div className="card-title">Semáforo de publicidad</div>

      {/* Decisión */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 0', marginBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{ fontSize: 28 }}>{icono}</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color }}>{decision}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Basado en {factores.length} factores · hoy {DIAS[diaSemana]}
          </div>
        </div>
      </div>

      {/* Factores */}
      {factores.map((f, i) => (
        <div key={i} style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          paddingBottom: 10, marginBottom: 10,
          borderBottom: i < factores.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
        }}>
          <div style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{f.icon}</div>
          <div style={{ fontSize: 13, color: colorFactor[f.tipo], lineHeight: 1.5 }}>{f.texto}</div>
        </div>
      ))}

      {/* Tip contextual */}
      <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
        💡 Tip: las fechas de pago (1–5 y 15–20 de cada mes) suelen ser los mejores momentos para activar campañas de tragos en Santiago.
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function Analisis() {
  const [ventas, setVentas] = useState([])
  const [gastosPub, setGastosPub] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('todo') // 'todo' | '90d' | '30d'

  useEffect(() => {
    async function load() {
      const [{ data: vts }, { data: cja }] = await Promise.all([
        supabase.from('ventas').select('fecha, litros, precio_venta').order('fecha', { ascending: false }),
        supabase.from('caja').select('fecha, monto, categoria, tipo').eq('tipo', 'salida'),
      ])
      setVentas(vts || [])
      setGastosPub((cja || []).filter(m => m.categoria === 'Publicidad'))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Cargando...</div>

  // Filtrar ventas según período
  const hoy = new Date()
  const ventasFiltradas = ventas.filter(v => {
    if (periodo === 'todo') return true
    const dias = periodo === '90d' ? 90 : 30
    const corte = new Date(hoy); corte.setDate(hoy.getDate() - dias)
    return parseFecha(v.fecha) >= corte
  })

  return (
    <div className="page">
      <div className="page-title">Análisis</div>

      {/* Semáforo de publicidad — siempre con datos completos */}
      <SemaforoPub ventas={ventas} gastosPub={gastosPub} />

      {/* Selector de período */}
      <div className="toggle-row" style={{ marginBottom: 16 }}>
        {[
          { key: '30d', label: '30 días' },
          { key: '90d', label: '90 días' },
          { key: 'todo', label: 'Todo' },
        ].map(p => (
          <button key={p.key}
            className={`toggle-btn ${periodo === p.key ? 'active-entrada' : ''}`}
            onClick={() => setPeriodo(p.key)}
            style={{ fontSize: 13 }}>
            {p.label}
          </button>
        ))}
      </div>

      {ventasFiltradas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
          Sin ventas en el período seleccionado
        </div>
      ) : (
        <>
          <VentasPorDia ventas={ventasFiltradas} />
          <TendenciaSemanal ventas={ventasFiltradas} />
        </>
      )}
    </div>
  )
}
