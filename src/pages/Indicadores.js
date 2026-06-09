import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP, formatPct } from '../lib/calculos'
import { calcularMetricasDashboard, CANAL_META, labelSemana } from '../lib/dashboardMetrics'

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
    { label: 'Recompra acumulada', meta: '35%', sem: s.recompra, fmt: v => formatPct(v) },
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
          <div className="kpi-label">Recompra</div>
          <div className="kpi-value" style={{ fontSize: 22, color: SEMAFORO_COLOR[m.semaforos.recompra.estado] }}>{formatPct(m.tasaRecompra)}</div>
          <div className="kpi-sub">{m.clientesUnicos} clientes únicos · meta 35%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Precio por litro</div>
          <div className="kpi-value" style={{ fontSize: 22, color: 'var(--text-strong)' }}>{formatCLP(m.precioPorLitro)}</div>
          <div className="kpi-sub">promedio acumulado</div>
        </div>
      </div>

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
