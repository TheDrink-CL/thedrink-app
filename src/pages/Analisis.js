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

function SemaforoPub({ ventas, gastosPub, margenBruto }) {
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

  // 4. % del margen bruto gastado en publicidad (más relevante que % sobre ventas)
  const totalVentas = ventas.reduce((s, v) => s + v.litros * v.precio_venta, 0)
  const totalPub = gastosPub.reduce((s, m) => s + m.monto, 0)
  const margenPesos = margenBruto != null ? totalVentas * margenBruto : null
  // pctPubSobreMargen: cuánto del margen se va en publicidad
  const pctPubSobreMargen = margenPesos != null && margenPesos > 0 ? totalPub / margenPesos : null
  // también mantenemos % sobre ventas para mostrarlo en el tip
  const pctPubSobreVentas = totalVentas > 0 ? totalPub / totalVentas : null

  // 5. Día de la semana actual
  const diaSemana = hoy.getDay() // 0=Dom, 5=Vie, 6=Sáb

  // ── Lógica de recomendación ──────────────────────────────────────────────
  const factores = []
  let puntaje = 0 // negativo = abstenerse, positivo = pautar

  // Factor: % del margen bruto gastado en publicidad
  if (pctPubSobreMargen !== null) {
    const pct = Math.round(pctPubSobreMargen * 100)
    if (pctPubSobreMargen > 0.25) {
      factores.push({ icon: '📊', texto: `Llevas ${pct}% de tu margen en publicidad — estás por encima del 25%. Antes de pautar más, espera que el margen crezca`, peso: -2, tipo: 'negativo' })
      puntaje -= 2
    } else if (pctPubSobreMargen > 0.15) {
      factores.push({ icon: '📊', texto: `Llevas ${pct}% de tu margen en publicidad — zona de vigilancia (15–25%). Monitorea si las ventas responden al gasto`, peso: -1, tipo: 'negativo' })
      puntaje -= 1
    } else {
      factores.push({ icon: '📊', texto: `Llevas ${pct}% de tu margen en publicidad — saludable (bajo 15%). Tienes espacio para pautar`, peso: 1, tipo: 'positivo' })
      puntaje += 1
    }
  }

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
        {pctPubSobreMargen !== null && (
          <span> · Publicidad: <span style={{ color: pctPubSobreMargen > 0.25 ? 'var(--pink)' : pctPubSobreMargen > 0.15 ? '#f59e0b' : 'var(--green)', fontWeight: 700 }}>{Math.round(pctPubSobreMargen * 100)}% del margen</span>{pctPubSobreVentas !== null && <span> · {Math.round(pctPubSobreVentas * 100)}% de ventas brutas</span>} (meta: bajo 15% del margen)</span>
        )}
      </div>
    </div>
  )
}

// ─── Bloque: Origen de ventas + CAC estimado ────────────────────────────────

const ORIGEN_ICONS = { Instagram: '📱', Referido: '🤝', 'Cliente habitual': '⭐', Evento: '🎉', Otro: '•' }

function OrigenVentas({ ventas, gastosPub }) {
  const ventasConOrigen = ventas.filter(v => v.origen)
  if (ventasConOrigen.length === 0) return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Origen de clientes</div>
      <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
        Aún no hay datos — selecciona el origen al registrar una venta
      </div>
    </div>
  )

  // Agrupar por origen
  const porOrigen = {}
  ventasConOrigen.forEach(v => {
    const o = v.origen
    if (!porOrigen[o]) porOrigen[o] = { ventas: 0, ingreso: 0 }
    porOrigen[o].ventas += 1
    porOrigen[o].ingreso += v.litros * v.precio_venta
  })

  const totalIngreso = Object.values(porOrigen).reduce((s, d) => s + d.ingreso, 0)
  const totalPub = gastosPub.reduce((s, m) => s + m.monto, 0)

  // CAC estimado: gasto pub / ventas atribuidas a Instagram
  const ventasIG = porOrigen['Instagram']?.ventas || 0
  const ingresoIG = porOrigen['Instagram']?.ingreso || 0
  const cac = ventasIG > 0 && totalPub > 0 ? totalPub / ventasIG : null
  const roiIG = totalPub > 0 && ingresoIG > 0 ? ingresoIG / totalPub : null

  const ordenados = Object.entries(porOrigen).sort((a, b) => b[1].ingreso - a[1].ingreso)
  const maxIngreso = ordenados[0]?.[1].ingreso || 1

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Origen de clientes</div>

      {ordenados.map(([origen, d]) => {
        const pct = Math.round(d.ingreso / totalIngreso * 100)
        return (
          <div key={origen} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                {ORIGEN_ICONS[origen] || '•'} {origen}
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>×{d.ventas} ventas</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 700 }}>{pct}% · {formatCLP(d.ingreso)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: origen === 'Instagram' ? 'linear-gradient(90deg, var(--pink), var(--purple))' : 'rgba(0,180,180,0.5)',
                width: (d.ingreso / maxIngreso * 100) + '%'
              }} />
            </div>
          </div>
        )
      })}

      {/* CAC e ingreso por Instagram */}
      {(cac !== null || roiIG !== null) && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(196,0,90,0.06)', borderRadius: 8, fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: 'var(--pink)', marginBottom: 4 }}>📱 ROI Instagram Ads</div>
          {cac !== null && <div style={{ color: 'var(--muted)' }}>CAC estimado: <span style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{formatCLP(cac)}</span> por pedido</div>}
          {roiIG !== null && <div style={{ color: 'var(--muted)' }}>Ingreso IG / gasto ads: <span style={{ color: roiIG >= 3 ? 'var(--green)' : roiIG >= 1.5 ? '#f59e0b' : 'var(--pink)', fontWeight: 700 }}>{roiIG.toFixed(1)}x</span></div>}
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
            {roiIG >= 3 && 'Excelente — Instagram está generando buen retorno.'}
            {roiIG >= 1.5 && roiIG < 3 && 'Retorno razonable — sigue monitoreando.'}
            {roiIG > 0 && roiIG < 1.5 && 'Las ventas de IG no cubren aún el gasto en ads. Optimiza el targeting o el creativo.'}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function Analisis() {
  const [ventas, setVentas] = useState([])
  const [gastosPub, setGastosPub] = useState([])
  const [margenBruto, setMargenBruto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('todo') // 'todo' | '90d' | '30d'

  useEffect(() => {
    async function load() {
      const [{ data: vts }, { data: cja }, { data: cmp }] = await Promise.all([
        supabase.from('ventas').select('fecha, litros, precio_venta, origen').order('fecha', { ascending: false }),
        supabase.from('caja').select('fecha, monto, categoria, tipo').eq('tipo', 'salida'),
        supabase.from('compras').select('precio_total, es_inversion'),
      ])
      setVentas(vts || [])
      setGastosPub((cja || []).filter(m => m.categoria === 'Publicidad'))
      // Margen bruto: ventas - compras operativas (excluye inversión inicial)
      const totalVtsBruto = (vts || []).reduce((s, v) => s + v.litros * v.precio_venta, 0)
      const totalCmpOp = (cmp || []).filter(c => !c.es_inversion).reduce((s, c) => s + c.precio_total, 0)
      setMargenBruto(totalVtsBruto > 0 ? (totalVtsBruto - totalCmpOp) / totalVtsBruto : null)
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
      <SemaforoPub ventas={ventas} gastosPub={gastosPub} margenBruto={margenBruto} />

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
          <OrigenVentas ventas={ventasFiltradas} gastosPub={gastosPub} />
          <VentasPorDia ventas={ventasFiltradas} />
          <TendenciaSemanal ventas={ventasFiltradas} />
        </>
      )}
    </div>
  )
}
