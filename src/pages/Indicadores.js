import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP, formatPct } from '../lib/calculos'
import { calcularMetricasDashboard, resumenParaIA, CANAL_META, labelSemana } from '../lib/dashboardMetrics'

const SEMAFORO_COLOR = {
  verde: 'var(--green)',
  ambar: '#f59e0b',
  rojo: 'var(--pink)',
  gris: 'var(--muted)',
}
const SEMAFORO_DOT = { verde: '🟢', ambar: '🟡', rojo: '🔴', gris: '⚪' }

function Dot({ estado }) {
  return <span style={{ fontSize: 11, marginRight: 6 }}>{SEMAFORO_DOT[estado] || '⚪'}</span>
}

// ── Gráfico apilado: ingreso semanal por canal + gasto pauta ────────────────
function GraficoCanales({ m }) {
  const keys = m.semanasOrdenadas.slice(-8)
  if (keys.length === 0) return null
  const maxTotal = Math.max(...keys.map(k => m.semanas[k].total), 1)
  const canales = ['habitual', 'pauta', 'otros', 'sinOrigen']
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Ingreso semanal por canal</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, marginBottom: 4 }}>
        {keys.map(k => {
          const w = m.semanas[k]
          const esActual = k === m.semanaActualKey
          return (
            <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', opacity: esActual ? 0.6 : 1 }}>
              {canales.map(c => w[c] > 0 && (
                <div key={c} title={`${CANAL_META[c].label}: ${formatCLP(w[c])}`} style={{
                  height: `${(w[c] / maxTotal) * 100}%`,
                  background: CANAL_META[c].color,
                  borderRadius: 2, marginTop: 1, minHeight: 2,
                }} />
              ))}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {keys.map(k => (
          <div key={k} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--muted)' }}>{labelSemana(k)}</div>
            <div style={{ fontSize: 9, color: m.semanas[k].gastoPauta > 0 ? 'var(--pink)' : 'var(--muted)', fontWeight: 600 }}>
              {m.semanas[k].gastoPauta > 0 ? formatCLP(m.semanas[k].gastoPauta) : '—'}
            </div>
            <div style={{ fontSize: 9, color: m.semanas[k].roas != null ? (m.semanas[k].roas >= 3 ? 'var(--green)' : '#f59e0b') : 'var(--muted)' }}>
              {m.semanas[k].roas != null ? m.semanas[k].roas.toFixed(1) + 'x' : ''}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
        {canales.map(c => (
          <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: CANAL_META[c].color, display: 'inline-block' }} />
            {CANAL_META[c].label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>bajo cada barra: gasto pauta · ROAS</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        La semana en curso se muestra atenuada (incompleta). Pregunta clave: ¿la curva la mueve la pauta o la demanda orgánica?
      </div>
    </div>
  )
}

// ── Línea de ingreso semanal total (barras finas) ───────────────────────────
function IngresoSemanal({ m }) {
  const keys = m.semanasOrdenadas.slice(-10)
  if (keys.length === 0) return null
  const max = Math.max(...keys.map(k => m.semanas[k].total), 1)
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Ingreso semanal total</div>
      {keys.slice().reverse().map(k => {
        const w = m.semanas[k]
        const esActual = k === m.semanaActualKey
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 48, fontSize: 11, color: 'var(--muted)' }}>{labelSemana(k)}{esActual ? '*' : ''}</div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: 'var(--cyan)', width: `${(w.total / max) * 100}%`, opacity: esActual ? 0.5 : 1 }} />
            </div>
            <div style={{ width: 76, fontSize: 12, fontWeight: 600, color: 'var(--text-strong)', textAlign: 'right' }}>{formatCLP(w.total)}</div>
          </div>
        )
      })}
      <div style={{ fontSize: 10, color: 'var(--muted)' }}>* semana en curso</div>
    </div>
  )
}

// ── Barras por día de la semana ─────────────────────────────────────────────
function PorDiaSemana({ m }) {
  const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const max = Math.max(...m.porDia, 1)
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Ingreso por día de la semana</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
        {m.porDia.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{
              height: `${(v / max) * 100}%`, minHeight: v > 0 ? 3 : 0,
              background: i >= 4 ? 'var(--purple)' : 'rgba(0,180,180,0.5)', borderRadius: 3,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {dias.map((d, i) => (
          <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: i >= 4 ? 'var(--text-strong)' : 'var(--muted)', fontWeight: i >= 4 ? 700 : 400 }}>{d}</div>
        ))}
      </div>
    </div>
  )
}

// ── Dona de origen del ingreso acumulado ────────────────────────────────────
function DonaOrigen({ m }) {
  const total = Object.values(m.dona).reduce((s, v) => s + v, 0)
  if (total === 0) return null
  const canales = ['habitual', 'pauta', 'otros', 'sinOrigen'].filter(c => m.dona[c] > 0)
  let acc = 0
  const stops = canales.map(c => {
    const desde = acc / total * 360
    acc += m.dona[c]
    const hasta = acc / total * 360
    const color = c === 'habitual' ? '#22C55E' : c === 'pauta' ? '#C4005A' : c === 'otros' ? '#00C8C8' : 'rgba(255,255,255,0.25)'
    return `${color} ${desde}deg ${hasta}deg`
  }).join(', ')
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Origen del ingreso acumulado</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          width: 110, height: 110, borderRadius: '50%', flexShrink: 0,
          background: `conic-gradient(${stops})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)' }} />
        </div>
        <div style={{ flex: 1 }}>
          {canales.map(c => (
            <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: CANAL_META[c].color, display: 'inline-block' }} />
                {CANAL_META[c].label}
              </span>
              <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                {Math.round(m.dona[c] / total * 100)}% · {formatCLP(m.dona[c])}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Margen $/litro por receta ───────────────────────────────────────────────
function MargenRecetas({ m }) {
  const recetas = m.margenPorReceta.filter(r => r.margenLitro != null).slice(0, 10)
  if (recetas.length === 0) return null
  const max = Math.max(...recetas.map(r => r.margenLitro), 1)
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">
        Margen $/litro por receta
        {m.margenPonderado != null && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>
            ponderado: <span style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{formatCLP(m.margenPonderado)}/lt</span>
          </span>
        )}
      </div>
      {recetas.map(r => (
        <div key={r.nombre} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: 'var(--text)' }}>{r.nombre} <span style={{ color: 'var(--muted)', fontSize: 10 }}>×{Math.round(r.litros * 10) / 10} lt</span></span>
            <span style={{ color: SEMAFORO_COLOR[r.semaforo], fontWeight: 700 }}>
              {formatCLP(r.margenLitro)}/lt{r.margenPct != null ? ` · ${formatPct(r.margenPct)}` : ''}
            </span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, background: SEMAFORO_COLOR[r.semaforo], width: `${Math.max(0, r.margenLitro / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        🟢 &gt;$5.500 · 🟡 $4.800-5.500 · 🔴 &lt;$4.800 (margen teórico según recetas y PPP)
      </div>
    </div>
  )
}

// ── Tabla "Dónde poner el ojo" ──────────────────────────────────────────────
function DondePonerElOjo({ m }) {
  const s = m.semaforos
  const filas = [
    { label: 'Gasto pauta/semana', meta: '$50-60K', sem: s.gastoPauta, fmt: v => formatCLP(v) },
    { label: 'ROAS semanal', meta: '≥3x', sem: s.roas, fmt: v => v.toFixed(1) + 'x' },
    { label: 'Ingreso habituales/semana', meta: '≥$100K', sem: s.habituales, fmt: v => formatCLP(v) },
    { label: 'Clientes nuevos/semana', meta: '≥10', sem: s.clientesNuevos, fmt: v => String(v) },
    { label: 'Ticket promedio', meta: '≥$17.500', sem: s.ticket, fmt: v => formatCLP(v) },
    { label: 'Clientes que vuelven', meta: '35%', sem: s.recompra, fmt: v => formatPct(v) },
    { label: 'Insumos/ingreso (mes)', meta: '≤50%', sem: s.ratioInsumos, fmt: v => formatPct(v) },
  ]
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Dónde poner el ojo</div>
      {filas.map(f => (
        <div key={f.label} className="list-item" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text)' }}><Dot estado={f.sem.estado} />{f.label}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 20 }}>meta {f.meta} · {f.sem.detalle}</div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: SEMAFORO_COLOR[f.sem.estado], flexShrink: 0 }}>
            {f.sem.valor != null ? f.fmt(f.sem.valor) : '—'}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        Semáforos semanales evaluados sobre la última semana COMPLETA (lun-dom), no la actual.
      </div>
    </div>
  )
}

// ── Clientes que vuelven vs dependencia de pauta ────────────────────────────
// "Tasa de recompra" en jerga de marketing; renombrada en la UI porque en esta
// app "Compras" son insumos y el término confundía.
function RetencionVsPauta({ m }) {
  const totalDona = Object.values(m.dona).reduce((s, v) => s + v, 0)
  if (totalDona === 0 || m.clientesUnicos === 0) return null
  const pctHab = Math.round(m.dona.habitual / totalDona * 100)
  const pctPauta = Math.round(m.dona.pauta / totalDona * 100)
  const pctRef = Math.round(m.ingresoReferido / totalDona * 100)
  const unaCompra = m.clientesUnicos - m.clientesRecompra
  const colorRet = SEMAFORO_COLOR[m.semaforos.recompra.estado]
  const retPct = m.tasaRecompra * 100

  const mix = [
    { label: 'Habituales', valor: pctHab, meta: '≥40%', cumple: pctHab >= 40, color: 'var(--green)' },
    { label: 'Pauta IG', valor: pctPauta, meta: '≤40%', cumple: pctPauta <= 40, color: 'var(--pink)' },
    { label: 'Referidos', valor: pctRef, meta: '≥15%', cumple: pctRef >= 15, color: 'var(--cyan)' },
  ]

  return (
    <div className="card" style={{ marginBottom: 12, border: '1px solid rgba(34,197,94,0.35)' }}>
      <div className="card-title">🔁 Clientes que vuelven — tu palanca más barata</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: colorRet }}>{formatPct(m.tasaRecompra)}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>de tus {m.clientesUnicos} clientes ha vuelto a comprar · meta 35%</span>
      </div>
      <div style={{ position: 'relative', height: 10, marginBottom: 8 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.min(100, retPct / 50 * 100)}%`, background: colorRet, borderRadius: 4 }} />
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: '70%', width: 2, background: 'var(--text-strong)' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.6 }}>
        {unaCompra} clientes compraron <b style={{ color: 'var(--text-strong)' }}>una sola vez</b> y no han vuelto.
        Adquirir cada uno costó {m.cac != null ? `~${formatCLP(m.cac)}` : 'plata'} en pauta — hacerlos volver cuesta $0.
        La línea blanca marca la meta (35%).
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          De dónde viene el ingreso · hoy vs meta sana
        </div>
        {mix.map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <div style={{ width: 76, fontSize: 12, color: 'var(--text)' }}>{f.label}</div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: f.color, width: `${Math.min(100, f.valor)}%` }} />
            </div>
            <div style={{ width: 96, fontSize: 12, textAlign: 'right' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{f.valor}%</span>
              <span style={{ color: f.cumple ? 'var(--green)' : '#f59e0b', marginLeft: 6 }}>{f.cumple ? '✓' : '→'} {f.meta}</span>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
          Pauta en {pctPauta}% = crecimiento arrendado: se apaga cuando dejas de pagar. Habituales y referidos son el ingreso que se acumula. Metas a 90 días — cuando referidos pase 15%, se sube la vara.
        </div>
      </div>
    </div>
  )
}

// ── Análisis de la semana (insights vía API de Claude, cacheado 1/día) ──────
function AnalisisIA({ m }) {
  const [estado, setEstado] = useState('idle') // idle | cargando | ok | error
  const [insight, setInsight] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelado = false
    async function fetchInsight() {
      setEstado('cargando')
      try {
        const res = await fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metricas: resumenParaIA(m) }),
        })
        if (!res.ok) {
          const e = await res.json().catch(() => ({}))
          throw new Error(e.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        if (!cancelado) { setInsight(data); setEstado('ok') }
      } catch (e) {
        if (!cancelado) {
          setErrorMsg(e.message || String(e))
          setEstado('error')
        }
      }
    }
    fetchInsight()
    return () => { cancelado = true }
  }, [m])

  return (
    <div className="card" style={{ marginBottom: 12, borderColor: 'rgba(123,47,190,0.35)' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        🧠 Análisis de la semana
        {insight?.cached && <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>· generado hoy</span>}
      </div>

      {estado === 'cargando' && (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>Analizando los números...</div>
      )}

      {estado === 'error' && (
        <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>
          No se pudo generar el análisis ({errorMsg}).
          {window.location.hostname === 'localhost' && ' En desarrollo local no hay /api — solo funciona en la app deployada en Vercel.'}
        </div>
      )}

      {estado === 'ok' && insight && (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ color: 'var(--text)', marginBottom: 10 }}>{insight.resumen}</div>
          {(insight.alertas || []).map((a, i) => (
            <div key={i} style={{
              display: 'flex', gap: 8, marginBottom: 8, padding: '8px 10px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            }}>
              <span style={{ flexShrink: 0 }}>{i === 0 ? '⚠️' : '·'}</span>
              <span style={{ color: 'var(--text)' }}>{a}</span>
            </div>
          ))}
          {insight.recomendacion_principal && (
            <div style={{
              marginTop: 10, padding: '10px 12px', borderRadius: 8,
              background: 'rgba(123,47,190,0.10)', border: '1px solid rgba(123,47,190,0.3)',
            }}>
              <span style={{ fontWeight: 700, color: '#AFA9EC' }}>Esta semana: </span>
              <span style={{ color: 'var(--text)' }}>{insight.recomendacion_principal}</span>
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
            Interpretación generada por IA sobre KPIs calculados de forma determinista — las cifras vienen de la app, no de la IA.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function Indicadores() {
  const [m, setM] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [vts, ords, cja, cmp, rec, recIng, ins, cfg] = await Promise.all([
          supabase.from('ventas').select('fecha, receta_nombre, litros, precio_venta, ingreso_total, origen, orden_id'),
          supabase.from('ordenes').select('id, fecha, cliente_id, origen'),
          supabase.from('caja').select('fecha, tipo, categoria, monto'),
          supabase.from('compras').select('fecha, tipo, precio_total, es_inversion'),
          supabase.from('recetas').select('nombre, precio_venta, envase_formato'),
          supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad'),
          supabase.from('insumos').select('nombre, costo_ppp, aplica_merma'),
          supabase.from('config').select('clave, valor'),
        ])
        const cfgMap = {}
        ;(cfg.data || []).forEach(c => { cfgMap[c.clave] = c.valor })
        setM(calcularMetricasDashboard({
          ventas: vts.data || [],
          ordenes: ords.data || [],
          caja: cja.data || [],
          compras: cmp.data || [],
          recetas: rec.data || [],
          recetaIngredientes: recIng.data || [],
          insumos: ins.data || [],
          config: cfgMap,
        }))
      } catch (e) {
        console.error('Indicadores - error al cargar:', e)
        setError(e.message || String(e))
      }
    }
    load()
  }, [])

  if (error) return <div className="page"><div className="page-title">Indicadores</div><div className="card" style={{ color: 'var(--pink)' }}>Error: {error}</div></div>
  if (!m) return <div className="loading">Cargando...</div>

  return (
    <div className="page">
      <div className="page-title">Indicadores</div>

      {/* Fila de KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card">
          <div className="kpi-label">Ingreso total</div>
          <div className="kpi-value" style={{ fontSize: 22, color: 'var(--green)' }}>{formatCLP(m.ingresoTotal)}</div>
          <div className="kpi-sub">{Math.round(m.litrosTotal)} lt · {m.nVentas} ventas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Ticket promedio</div>
          <div className="kpi-value" style={{ fontSize: 22, color: SEMAFORO_COLOR[m.semaforos.ticket.estado] }}>{formatCLP(m.ticketPromedio)}</div>
          <div className="kpi-sub">por orden{m.ventasSinOrden > 0 ? ` · ${m.ventasSinOrden} ventas legacy fuera` : ''}</div>
        </div>
      </div>
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card">
          <div className="kpi-label">ROAS pauta (acum.)</div>
          <div className="kpi-value" style={{ fontSize: 22, color: m.roasGlobal == null ? 'var(--muted)' : m.roasGlobal >= 3 ? 'var(--green)' : '#f59e0b' }}>
            {m.roasGlobal != null ? m.roasGlobal.toFixed(1) + 'x' : '—'}
          </div>
          <div className="kpi-sub">{formatCLP(m.gastoPautaTotal)} invertidos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">CAC pauta</div>
          <div className="kpi-value" style={{ fontSize: 22, color: 'var(--text-strong)' }}>{m.cac != null ? formatCLP(m.cac) : '—'}</div>
          <div className="kpi-sub">{m.clientesNuevosPauta} clientes nuevos vía pauta</div>
        </div>
      </div>
      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card">
          <div className="kpi-label">Clientes que vuelven</div>
          <div className="kpi-value" style={{ fontSize: 22, color: SEMAFORO_COLOR[m.semaforos.recompra.estado] }}>{formatPct(m.tasaRecompra)}</div>
          <div className="kpi-sub">{m.clientesUnicos} clientes únicos · meta 35%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Precio por litro</div>
          <div className="kpi-value" style={{ fontSize: 22, color: 'var(--text-strong)' }}>{formatCLP(m.precioPorLitro)}</div>
          <div className="kpi-sub">promedio acumulado</div>
        </div>
      </div>

      <RetencionVsPauta m={m} />
      {/* <AnalisisIA m={m} /> — desactivada por decisión del usuario (jun 2026):
          el análisis se hace conversando con Claude directamente. Para reactivar:
          descomentar esta línea y cargar ANTHROPIC_API_KEY en Vercel. */}
      <DondePonerElOjo m={m} />
      <GraficoCanales m={m} />
      <IngresoSemanal m={m} />
      <PorDiaSemana m={m} />
      <DonaOrigen m={m} />
      <MargenRecetas m={m} />

      <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '8px 0 16px' }}>
        Todos los indicadores se calculan de forma determinista desde Supabase (lib/dashboardMetrics.js).
      </div>
    </div>
  )
}
