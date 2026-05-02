import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP, calcularCostoReceta } from '../lib/calculos'

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

// ─── Bloque: Horas activas ───────────────────────────────────────────────────

function HorasActivas({ ordenes }) {
  const conHora = ordenes.filter(o => o.hora)
  if (conHora.length === 0) return (
    <div className="card">
      <div className="card-title">⏰ Horas activas</div>
      <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
        Aún no hay pedidos con hora registrada — la hora se guarda automáticamente en los nuevos pedidos
      </div>
    </div>
  )

  // Agrupar por franja horaria (bloques de 2 horas)
  const franjas = {}
  conHora.forEach(o => {
    const h = parseInt(o.hora.split(':')[0], 10)
    const inicio = Math.floor(h / 2) * 2
    const key = `${String(inicio).padStart(2,'0')}:00`
    if (!franjas[key]) franjas[key] = { pedidos: 0, label: `${String(inicio).padStart(2,'0')}:00–${String(inicio+2).padStart(2,'0')}:00` }
    franjas[key].pedidos++
  })

  const ordenadas = Object.entries(franjas).sort((a, b) => a[0].localeCompare(b[0]))
  const maxPedidos = Math.max(...ordenadas.map(([, d]) => d.pedidos), 1)
  const mejorFranja = ordenadas.reduce((best, cur) => cur[1].pedidos > best[1].pedidos ? cur : best, ordenadas[0])

  // Franja de menor actividad (para sugerir descanso)
  // Solo consideramos franjas "de día" (10:00–00:00)
  const franjasActivas = ordenadas.filter(([k]) => parseInt(k) >= 10)
  const peorFranja = franjasActivas.length > 1
    ? franjasActivas.reduce((worst, cur) => cur[1].pedidos < worst[1].pedidos ? cur : worst, franjasActivas[0])
    : null

  return (
    <div className="card">
      <div className="card-title">⏰ Horas activas</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        Basado en {conHora.length} pedido{conHora.length !== 1 ? 's' : ''} con hora registrada
      </div>

      {ordenadas.map(([key, d]) => {
        const pct = d.pedidos / maxPedidos
        const esMejor = key === mejorFranja[0]
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 52, fontSize: 11, fontWeight: 700, color: esMejor ? 'var(--cyan)' : 'var(--muted)', flexShrink: 0 }}>
              {d.label.split('–')[0]}
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: esMejor ? 'linear-gradient(90deg, var(--cyan), #00e5e5)' : 'rgba(0,180,180,0.35)',
                width: `${pct * 100}%`, transition: 'width 0.4s'
              }} />
            </div>
            <div style={{ width: 24, fontSize: 12, textAlign: 'right', color: esMejor ? 'var(--cyan)' : 'var(--text)', fontWeight: esMejor ? 700 : 400, flexShrink: 0 }}>
              {d.pedidos}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,180,180,0.05)', borderRadius: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
        🔥 Pico: <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{mejorFranja[1].label}</span> · {mejorFranja[1].pedidos} pedido{mejorFranja[1].pedidos !== 1 ? 's' : ''}
        {peorFranja && peorFranja[0] !== mejorFranja[0] && (
          <span> · 😴 Descanso sugerido: <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{peorFranja[1].label}</span></span>
        )}
      </div>
    </div>
  )
}

// ─── Bloque: Proyección de demanda y compras sugeridas ───────────────────────

// ─── Bloque: Proyección de demanda y compras sugeridas ───────────────────────

function ProyeccionDemanda({ ventas, recetaIngredientes, insumos }) {
  const [expandido, setExpandido] = useState(false)

  if (!ventas || ventas.length === 0) return null

  const hoy = new Date()
  const hace8sem = new Date(hoy); hace8sem.setDate(hoy.getDate() - 56)
  const vtsPeriodo = ventas.filter(v => parseFecha(v.fecha) >= hace8sem)

  if (vtsPeriodo.length === 0) return null

  const semanas = Math.max(1, Math.ceil((hoy - hace8sem) / (7 * 24 * 60 * 60 * 1000)))

  const porReceta = {}
  vtsPeriodo.forEach(v => {
    if (!porReceta[v.receta_nombre]) porReceta[v.receta_nombre] = 0
    porReceta[v.receta_nombre] += v.litros
  })
  const promedioSemanal = {}
  Object.entries(porReceta).forEach(([r, total]) => { promedioSemanal[r] = total / semanas })

  const insumosNecesarios = {}
  const MERMA = 0.08
  Object.entries(promedioSemanal).forEach(([receta, litros]) => {
    const ings = (recetaIngredientes || []).filter(i => i.receta_nombre === receta && i.insumo_nombre !== 'ENVASE')
    ings.forEach(ing => {
      const usado = ing.cantidad * litros * (1 + MERMA)
      insumosNecesarios[ing.insumo_nombre] = (insumosNecesarios[ing.insumo_nombre] || 0) + usado
    })
  })

  const insumoMap = {}
  ;(insumos || []).forEach(i => { insumoMap[i.nombre] = i })

  const comprasSugeridas = Object.entries(insumosNecesarios)
    .map(([nombre, necesario]) => {
      const ins = insumoMap[nombre]
      const stockActual = ins?.stock_actual ?? 0
      const faltante = Math.max(0, necesario - stockActual)
      const unidad = ins?.unidad || ''
      const costoPPP = ins?.costo_ppp || 0
      return { nombre, necesario, stockActual, faltante, unidad, costoPPP, costoEstimado: faltante * costoPPP }
    })
    .filter(i => i.necesario > 0)
    .sort((a, b) => b.costoEstimado - a.costoEstimado)

  const hayFaltantes = comprasSugeridas.some(i => i.faltante > 0)
  const costoTotalEstimado = comprasSugeridas.reduce((s, i) => s + i.costoEstimado, 0)
  const litrosTotalesProyectados = Object.values(promedioSemanal).reduce((s, v) => s + v, 0)

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>📦 Proyección próxima semana</div>
        <button onClick={() => setExpandido(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cyan)', fontSize: 12 }}>
          {expandido ? 'Ver menos' : 'Ver detalle'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ background: 'rgba(0,180,180,0.07)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Litros proyectados</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--cyan)' }}>{litrosTotalesProyectados.toFixed(1)}L</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>prom. últimas {semanas} sem.</div>
        </div>
        <div style={{ background: hayFaltantes ? 'rgba(196,0,90,0.07)' : 'rgba(34,197,94,0.07)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Compras sugeridas</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: hayFaltantes ? 'var(--pink)' : 'var(--green)' }}>
            {hayFaltantes ? formatCLP(costoTotalEstimado) : '✓ Stock OK'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>estimado</div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 8 }}>
        Producción estimada
      </div>
      {Object.entries(promedioSemanal).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([receta, litros]) => (
        <div key={receta} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
          <span style={{ color: 'var(--text-strong)' }}>{receta}</span>
          <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{litros.toFixed(1)}L</span>
        </div>
      ))}

      {expandido && comprasSugeridas.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 8 }}>
            Lista de compras sugeridas
          </div>
          {comprasSugeridas.map(i => (
            <div key={i.nombre} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: i.faltante > 0 ? 'var(--text-strong)' : 'var(--muted)' }}>
                  {i.nombre}
                  {i.faltante === 0 && <span style={{ fontSize: 11, color: 'var(--green)', marginLeft: 6 }}>✓</span>}
                </span>
                <span style={{ fontSize: 12, color: i.faltante > 0 ? 'var(--pink)' : 'var(--green)', fontWeight: 700 }}>
                  {i.faltante > 0 ? `Comprar ${i.faltante.toFixed(0)} ${i.unidad}` : 'Stock suficiente'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Necesita {i.necesario.toFixed(0)} · Stock {i.stockActual.toFixed(0)} {i.unidad}</span>
                {i.costoEstimado > 0 && <span style={{ color: 'var(--text)' }}>{formatCLP(i.costoEstimado)} est.</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bloque: Evolución del costo de insumos ──────────────────────────────────

function EvolucionCostos({ compras }) {
  const [insumoSel, setInsumoSel] = useState(null)

  const cmpValidas = (compras || []).filter(c =>
    c.fecha && c.insumo_nombre && c.cantidad > 0 && c.precio_total > 0 && !c.es_inversion
  )
  if (cmpValidas.length === 0) return null

  const conteo = {}
  cmpValidas.forEach(c => { conteo[c.insumo_nombre] = (conteo[c.insumo_nombre] || 0) + 1 })
  const insumos = Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([n]) => n)
  if (insumos.length === 0) return null

  const insActivo = insumoSel || insumos[0]

  const porMes = {}
  cmpValidas.filter(c => c.insumo_nombre === insActivo).forEach(c => {
    const mes = c.fecha.slice(0, 7)
    if (!porMes[mes]) porMes[mes] = { totalPeso: 0, totalCosto: 0 }
    porMes[mes].totalPeso += c.cantidad
    porMes[mes].totalCosto += c.precio_total
  })

  const meses = Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0])).map(([mes, d]) => ({
    mes, ppp: d.totalCosto / d.totalPeso,
    label: (() => {
      const [y, m] = mes.split('-')
      const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
      return `${nombres[parseInt(m,10)-1]} ${y.slice(2)}`
    })()
  }))
  if (meses.length === 0) return null

  const maxPPP = Math.max(...meses.map(m => m.ppp), 1)
  const minPPP = Math.min(...meses.map(m => m.ppp))
  const variacion = meses[0].ppp > 0 ? (meses[meses.length-1].ppp - meses[0].ppp) / meses[0].ppp : 0
  const subio = variacion > 0.02
  const bajo = variacion < -0.02

  return (
    <div className="card">
      <div className="card-title">Evolución de costos</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Precio por unidad (PPP mensual)</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {insumos.slice(0, 6).map(ins => (
          <button key={ins} onClick={() => setInsumoSel(ins)}
            style={{
              padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: insActivo === ins ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
              color: insActivo === ins ? '#000' : 'var(--muted)',
            }}>
            {ins}
          </button>
        ))}
      </div>

      {meses.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '8px 12px', borderRadius: 8,
          background: subio ? 'rgba(196,0,90,0.07)' : bajo ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.04)'
        }}>
          <span style={{ fontSize: 20 }}>{subio ? '📈' : bajo ? '📉' : '〰️'}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: subio ? 'var(--pink)' : bajo ? 'var(--green)' : 'var(--text)' }}>
              {subio ? `+${(variacion*100).toFixed(1)}% más caro` : bajo ? `${(variacion*100).toFixed(1)}% más barato` : 'Precio estable'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {meses[0].label} → {meses[meses.length-1].label} · de {formatCLP(meses[0].ppp)} a {formatCLP(meses[meses.length-1].ppp)} por unidad
            </div>
          </div>
        </div>
      )}

      {meses.map(m => {
        const pct = maxPPP > 0 ? m.ppp / maxPPP : 0
        const esMasCaro = m.ppp === maxPPP
        const esMasBarato = m.ppp === minPPP && meses.length > 1
        return (
          <div key={m.mes} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 44, fontSize: 11, color: esMasCaro ? 'var(--pink)' : 'var(--muted)', fontWeight: esMasCaro ? 700 : 400, flexShrink: 0 }}>
              {m.label}
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, width: `${pct*100}%`,
                background: esMasCaro ? 'linear-gradient(90deg,var(--pink),#ff6b9d)' : esMasBarato ? 'linear-gradient(90deg,var(--green),#4ade80)' : 'rgba(0,180,180,0.45)',
                transition: 'width 0.4s'
              }} />
            </div>
            <div style={{ width: 64, fontSize: 12, textAlign: 'right', flexShrink: 0, color: esMasCaro ? 'var(--pink)' : 'var(--text)', fontWeight: esMasCaro ? 700 : 400 }}>
              {formatCLP(m.ppp)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Reporte Mensual + Punto de Equilibrio ──────────────────────────────────

function ReporteMensual({ ventas, ordenes, compras, gastosCaja, recetaIngredientes, insumos, config }) {
  const ahora = new Date()
  const [mesSel, setMesSel] = useState(`${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`)

  // Lista de meses con datos (defensivo contra fecha null)
  const mesesDisponibles = [...new Set([
    ...ventas.filter(v => v.fecha).map(v => v.fecha.slice(0, 7)),
    ...compras.filter(c => c.fecha).map(c => c.fecha.slice(0, 7)),
  ])].sort().reverse()

  if (mesesDisponibles.length === 0) {
    return (
      <div className="card" style={{ textAlign:'center', padding:32 }}>
        <div style={{ color:'var(--muted)', fontSize:14 }}>Sin datos para reportar todavía</div>
      </div>
    )
  }

  // Datos del mes seleccionado (defensivo contra fecha null)
  const ventasMes = ventas.filter(v => v.fecha && v.fecha.startsWith(mesSel))
  const ordenesMes = ordenes.filter(o => o.fecha && o.fecha.startsWith(mesSel))
  const comprasMes = compras.filter(c => c.fecha && c.fecha.startsWith(mesSel) && !c.es_inversion && c.tipo !== 'activo_fijo')
  const gastosMes = gastosCaja.filter(g => g.fecha && g.fecha.startsWith(mesSel))

  // KPIs del mes
  const ingresoMes = ventasMes.reduce((s, v) => s + (v.litros * v.precio_venta), 0)
  const litrosMes = ventasMes.reduce((s, v) => s + v.litros, 0)
  const costoInsumosMes = comprasMes.reduce((s, c) => s + c.precio_total, 0)
  const totalGastosMes = gastosMes.reduce((s, g) => s + g.monto, 0)
  const deliveryMes = ordenesMes.reduce((s, o) => s + (o.delivery || 0), 0)

  // Costo real por receta usando PPP actual
  const merma = config?.merma_pct ?? 0.08
  const costoEnvase = config?.costo_envase ?? 794.6
  const costoPorReceta = {}
  const recetasUnicas = [...new Set(recetaIngredientes.map(i => i.receta_nombre))]
  recetasUnicas.forEach(nombre => {
    const ings = recetaIngredientes.filter(i => i.receta_nombre === nombre && i.insumo_nombre !== 'ENVASE')
    costoPorReceta[nombre] = calcularCostoReceta(ings, insumos, merma, costoEnvase)
  })
  const costoRealMes = ventasMes.reduce((s, v) => s + (costoPorReceta[v.receta_nombre] || 0) * v.litros, 0)
  const margenBrutoMes = ingresoMes > 0 ? (ingresoMes - costoRealMes) / ingresoMes : 0
  const utilidadMes = ingresoMes - costoRealMes - totalGastosMes - deliveryMes

  // Top recetas
  const porReceta = {}
  ventasMes.forEach(v => {
    if (!porReceta[v.receta_nombre]) porReceta[v.receta_nombre] = { litros: 0, ingreso: 0, costo: 0 }
    porReceta[v.receta_nombre].litros += v.litros
    porReceta[v.receta_nombre].ingreso += v.litros * v.precio_venta
    porReceta[v.receta_nombre].costo += (costoPorReceta[v.receta_nombre] || 0) * v.litros
  })
  const topRecetas = Object.entries(porReceta).sort((a, b) => b[1].litros - a[1].litros).slice(0, 5)

  // Medios de pago
  const medioPago = {}
  ordenesMes.forEach(o => {
    const m = o.medio_pago || 'sin_dato'
    if (!medioPago[m]) medioPago[m] = { count: 0, monto: 0 }
    medioPago[m].count++
    const totalOrd = ventasMes.filter(v => v.orden_id === o.id).reduce((s, v) => s + v.litros * v.precio_venta, 0)
    medioPago[m].monto += totalOrd
  })

  // Punto de equilibrio: cuántos litros necesitan vender para cubrir gastos del mes
  // Asumimos margen unitario promedio del mes
  const margenUnitarioPromedio = litrosMes > 0 ? (ingresoMes - costoRealMes) / litrosMes : 0
  const litrosEquilibrio = margenUnitarioPromedio > 0 ? totalGastosMes / margenUnitarioPromedio : 0
  const litrosFaltan = Math.max(0, litrosEquilibrio - litrosMes)

  // Etiqueta del mes
  const nombreMes = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][parseInt(mMes, 10) - 1]
  const labelMesSel = `${nombreMes} ${yMes}`

  const handlePrint = () => {
    window.print()
  }

  return (
    <div>
      {/* Selector de mes + botón imprimir */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }} className="no-print">
        <select className="form-select" value={mesSel} onChange={e => setMesSel(e.target.value)} style={{ flex:1, minWidth:160 }}>
          {mesesDisponibles.map(m => {
            const [y, mm] = m.split('-')
            const lbl = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mm,10)-1] + ' ' + y
            return <option key={m} value={m}>{lbl}</option>
          })}
        </select>
        <button onClick={handlePrint}
          style={{ background:'var(--cyan)', color:'#000', border:'none', borderRadius:8, padding:'0 18px', cursor:'pointer', fontWeight:700, fontSize:13, letterSpacing:0.5 }}>
          🖨 Imprimir / PDF
        </button>
      </div>

      {/* Cabecera del reporte */}
      <div className="card print-friendly">
        <div style={{ textAlign:'center', borderBottom:'1px solid var(--border)', paddingBottom:14, marginBottom:16 }}>
          <div style={{ fontFamily:'Orbitron', fontSize:18, color:'var(--cyan)', letterSpacing:3, fontWeight:900 }}>THE DRINK</div>
          <div style={{ fontSize:12, color:'var(--muted)', letterSpacing:1, marginTop:4 }}>Reporte mensual · {labelMesSel}</div>
        </div>

        {/* KPIs principales */}
        <div className="kpi-grid" style={{ marginBottom:14 }}>
          <div className="kpi-card">
            <div className="kpi-label">Ingreso bruto</div>
            <div className="kpi-value cyan">{formatCLP(ingresoMes)}</div>
            <div className="kpi-sub">{ordenesMes.length} pedidos</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Litros vendidos</div>
            <div className="kpi-value">{litrosMes}L</div>
            <div className="kpi-sub">{topRecetas.length} recetas</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Costo de venta</div>
            <div className="kpi-value pink">{formatCLP(costoRealMes)}</div>
            <div className="kpi-sub">PPP × volumen</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Margen bruto</div>
            <div className="kpi-value green">{(margenBrutoMes * 100).toFixed(1)}%</div>
            <div className="kpi-sub">{formatCLP(ingresoMes - costoRealMes)}</div>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom:14 }}>
          <div className="kpi-card">
            <div className="kpi-label">Gastos del mes</div>
            <div className="kpi-value pink">{formatCLP(totalGastosMes)}</div>
            <div className="kpi-sub">publicidad, otros</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Compras de insumo</div>
            <div className="kpi-value">{formatCLP(costoInsumosMes)}</div>
            <div className="kpi-sub">en este mes</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Costo delivery</div>
            <div className="kpi-value">{formatCLP(deliveryMes)}</div>
            <div className="kpi-sub">uber + motoboy</div>
          </div>
          <div className="kpi-card" style={{ background: utilidadMes >= 0 ? 'rgba(34,197,94,0.07)' : 'rgba(196,0,90,0.07)', borderColor: utilidadMes >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(196,0,90,0.3)' }}>
            <div className="kpi-label">Utilidad neta</div>
            <div className="kpi-value" style={{ color: utilidadMes >= 0 ? 'var(--green)' : 'var(--pink)' }}>{formatCLP(utilidadMes)}</div>
            <div className="kpi-sub">después de todo</div>
          </div>
        </div>

        {/* Punto de equilibrio */}
        <div style={{ background:'rgba(0,180,180,0.05)', border:'1px solid var(--border)', borderRadius:10, padding:14, marginBottom:14 }}>
          <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:8 }}>
            Punto de equilibrio
          </div>
          {totalGastosMes === 0 ? (
            <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6 }}>
              No hay gastos fijos registrados este mes. Cualquier venta es utilidad neta tras descontar el costo de insumos.
            </div>
          ) : margenUnitarioPromedio <= 0 ? (
            <div style={{ fontSize:13, color:'var(--pink)', lineHeight:1.6 }}>
              ⚠ El margen unitario es 0 o negativo. Revisa precios y costos antes de calcular equilibrio.
            </div>
          ) : (
            <>
              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, marginBottom:6 }}>
                Para cubrir {formatCLP(totalGastosMes)} en gastos, necesitas vender ~<strong style={{ color:'var(--cyan)' }}>{litrosEquilibrio.toFixed(1)}L</strong>
                {' '}(margen prom: {formatCLP(margenUnitarioPromedio)}/L).
              </div>
              <div style={{ fontSize:13, color: litrosFaltan === 0 ? 'var(--green)' : 'var(--text)', fontWeight:600 }}>
                {litrosFaltan === 0
                  ? `✓ Mes cubierto. Vendiste ${litrosMes}L (${(litrosMes - litrosEquilibrio).toFixed(1)}L sobre el equilibrio).`
                  : `Faltan ${litrosFaltan.toFixed(1)}L para cubrir gastos del mes (vendiste ${litrosMes}L).`}
              </div>
            </>
          )}
        </div>

        {/* Top recetas */}
        {topRecetas.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div className="section-divider">Top recetas del mes</div>
            {topRecetas.map(([nombre, d]) => {
              const margen = d.ingreso > 0 ? (d.ingreso - d.costo) / d.ingreso : 0
              return (
                <div className="list-item" key={nombre}>
                  <div>
                    <div className="list-item-name">{nombre}</div>
                    <div className="list-item-sub">{d.litros}L · margen {(margen*100).toFixed(0)}%</div>
                  </div>
                  <div className="list-item-right">
                    <div className="list-item-value">{formatCLP(d.ingreso)}</div>
                    <div className="list-item-muted">ganancia {formatCLP(d.ingreso - d.costo)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Medios de pago */}
        {Object.keys(medioPago).length > 0 && (
          <div style={{ marginBottom:8 }}>
            <div className="section-divider">Medios de pago</div>
            {Object.entries(medioPago).sort((a, b) => b[1].monto - a[1].monto).map(([m, d]) => {
              const lbl = m === 'transferencia' ? 'Transferencia' : m === 'debito' ? 'Débito' : m === 'credito' ? 'Crédito' : m === 'efectivo' ? 'Efectivo' : 'Sin dato'
              const pct = ingresoMes > 0 ? (d.monto / ingresoMes) * 100 : 0
              return (
                <div className="list-item" key={m}>
                  <div>
                    <div className="list-item-name" style={{ fontSize:14 }}>{lbl}</div>
                    <div className="list-item-sub">{d.count} pedidos · {pct.toFixed(0)}%</div>
                  </div>
                  <div className="list-item-right">
                    <div className="list-item-value">{formatCLP(d.monto)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:18, paddingTop:14, borderTop:'1px solid var(--border)', fontSize:10, color:'var(--muted)', letterSpacing:1 }}>
          Generado {new Date().toISOString().slice(0, 10)}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function Analisis() {
  const [ventas, setVentas] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [gastosPub, setGastosPub] = useState([])
  const [gastosCaja, setGastosCaja] = useState([])
  const [comprasDetalle, setComprasDetalle] = useState([])
  const [recetaIngredientes, setRecetaIngredientes] = useState([])
  const [insumos, setInsumos] = useState([])
  const [config, setConfig] = useState({ merma_pct: 0.08, costo_envase: 794.6 })
  const [margenBruto, setMargenBruto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('todo')
  const [vista, setVista] = useState('tendencias')

  const [errorCarga, setErrorCarga] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const results = await Promise.all([
          supabase.from('ventas').select('id, fecha, litros, precio_venta, origen, receta_nombre, orden_id').order('fecha', { ascending: false }),
          supabase.from('caja').select('fecha, monto, categoria, tipo').eq('tipo', 'salida'),
          supabase.from('compras').select('fecha, insumo_nombre, cantidad, precio_total, es_inversion, tipo').order('fecha'),
          supabase.from('ordenes').select('id, fecha, hora, medio_pago, delivery, delivery_tipo').order('fecha', { ascending: false }),
          supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad, unidad'),
          supabase.from('insumos').select('nombre, stock_actual, costo_ppp, unidad'),
          supabase.from('config').select('*'),
        ])
        // Detectar si alguna query devolvió error
        const errores = results.map((r, i) => r.error ? { idx: i, msg: r.error.message } : null).filter(Boolean)
        if (errores.length > 0) {
          const tablas = ['ventas','caja','compras','ordenes','receta_ingredientes','insumos','config']
          const detalle = errores.map(e => `${tablas[e.idx]}: ${e.msg}`).join(' · ')
          throw new Error(detalle)
        }
        const [{ data: vts }, { data: cja }, { data: cmp }, { data: ords }, { data: recIng }, { data: ins }, { data: cfg }] = results
        setVentas(vts || [])
        setOrdenes(ords || [])
        setComprasDetalle(cmp || [])
        setRecetaIngredientes(recIng || [])
        setInsumos(ins || [])
        setGastosCaja(cja || [])
        setGastosPub((cja || []).filter(m => m.categoria === 'Publicidad'))
        const cfgMap = {}
        cfg?.forEach(x => { cfgMap[x.clave] = parseFloat(x.valor) || x.valor })
        setConfig({
          merma_pct: cfgMap.merma_pct ?? 0.08,
          costo_envase: cfgMap.costo_envase ?? 794.6,
        })
        const totalVtsBruto = (vts || []).reduce((s, v) => s + v.litros * v.precio_venta, 0)
        const totalCmpOp = (cmp || []).filter(x => !x.es_inversion).reduce((s, x) => s + x.precio_total, 0)
        setMargenBruto(totalVtsBruto > 0 ? (totalVtsBruto - totalCmpOp) / totalVtsBruto : null)
      } catch (err) {
        console.error('Análisis - error al cargar datos:', err)
        setErrorCarga(err.message || String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="loading">Cargando...</div>
  if (errorCarga) {
    return (
      <div className="page">
        <div className="page-title">Análisis</div>
        <div className="card" style={{ borderColor: 'rgba(196,0,90,0.4)' }}>
          <div className="card-title" style={{ color: 'var(--pink)' }}>Error al cargar</div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 10 }}>
            {errorCarga}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
            Si el error menciona una columna o tabla que no existe, verifica en Supabase que el SQL del schema upgrade haya corrido correctamente.
          </div>
        </div>
      </div>
    )
  }

  const hoy = new Date()
  const ventasFiltradas = ventas.filter(v => {
    if (!v.fecha) return false
    if (periodo === 'todo') return true
    const dias = periodo === '90d' ? 90 : 30
    const corte = new Date(hoy); corte.setDate(hoy.getDate() - dias)
    return parseFecha(v.fecha) >= corte
  })

  return (
    <div className="page">
      <div className="page-title no-print">Análisis</div>

      <div className="toggle-row no-print" style={{ marginBottom: 16 }}>
        <button className={`toggle-btn ${vista === 'tendencias' ? 'active-entrada' : ''}`}
          onClick={() => setVista('tendencias')}>📊 Tendencias</button>
        <button className={`toggle-btn ${vista === 'reporte' ? 'active-entrada' : ''}`}
          onClick={() => setVista('reporte')}>📋 Reporte mensual</button>
      </div>

      {vista === 'reporte' ? (
        <ReporteMensual
          ventas={ventas}
          ordenes={ordenes}
          compras={comprasDetalle}
          gastosCaja={gastosCaja}
          recetaIngredientes={recetaIngredientes}
          insumos={insumos}
          config={config}
        />
      ) : (
        <>
          <SemaforoPub ventas={ventas} gastosPub={gastosPub} margenBruto={margenBruto} />

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
              <HorasActivas ordenes={ordenes} />
              <VentasPorDia ventas={ventasFiltradas} />
              <TendenciaSemanal ventas={ventasFiltradas} />
            </>
          )}

          <ProyeccionDemanda ventas={ventas} recetaIngredientes={recetaIngredientes} insumos={insumos} />
          <EvolucionCostos compras={comprasDetalle} />
        </>
      )}
    </div>
  )
}
