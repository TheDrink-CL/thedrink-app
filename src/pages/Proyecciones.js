import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import { calcularRentabilidad } from '../lib/rentabilidad'
import { calcularRitmo, generarEscenarios } from '../lib/proyecciones'

// Parsea "YYYY-MM-DD" sin desfase de zona horaria
function parseFecha(f) {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const ESC_COLOR = {
  optimista:   { color: 'var(--green)',  bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.35)',  icon: '📈' },
  realista:    { color: 'var(--cyan)',   bg: 'rgba(0,180,180,0.10)',  border: 'rgba(0,180,180,0.35)',  icon: '➡️' },
  conservador: { color: '#f59e0b',       bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)', icon: '📉' },
}

// ─── Card de un escenario ───────────────────────────────────────────────────
function EscenarioCard({ escenarioKey, escenario }) {
  const c = ESC_COLOR[escenarioKey]
  const [hito, setHito] = useState(90) // 30 | 60 | 90

  const datosHito = escenario.hitos.find(h => h.dias === hito) || escenario.hitos[0]

  return (
    <div className="card" style={{ border: `1px solid ${c.border}`, background: c.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: c.color, textTransform: 'uppercase', letterSpacing: 1 }}>
            {c.icon} {escenario.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{escenario.desc}</div>
        </div>
      </div>

      {/* Selector de hito */}
      <div style={{ display: 'flex', gap: 5, margin: '12px 0 14px' }}>
        {[30, 60, 90].map(d => (
          <button key={d} onClick={() => setHito(d)}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: hito === d ? c.color : 'rgba(255,255,255,0.06)',
              color: hito === d ? '#000' : 'var(--muted)',
            }}>
            {d} días
          </button>
        ))}
      </div>

      {/* Métricas del hito */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Metrica label="Cash disponible" valor={datosHito.cash} color={c.color} />
        <Metrica label="Inventario" valor={datosHito.inventario} color="var(--text)" />
        <Metrica label="Patrimonio total" valor={datosHito.patrimonio} color="var(--green)" />
        <Metrica label="Ingreso acumulado" valor={datosHito.ingresoAcumulado} color="var(--text)" />
      </div>
    </div>
  )
}

function Metrica({ label, valor, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '9px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color }}>{formatCLP(valor)}</div>
    </div>
  )
}

// ─── Página principal ───────────────────────────────────────────────────────
export default function Proyecciones() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [
        { data: vts }, { data: cmp }, { data: ins },
        { data: recIng }, { data: cajaArr }, { data: cfgReal },
      ] = await Promise.all([
        supabase.from('ventas').select('id, fecha, litros, precio_venta, receta_nombre, delivery'),
        supabase.from('compras').select('precio_total, es_inversion, tipo'),
        supabase.from('insumos').select('nombre, stock_actual, costo_ppp'),
        supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad, unidad'),
        supabase.from('caja').select('monto, tipo, categoria, fecha'),
        supabase.from('config').select('*'),
      ])
      const caja = cajaArr || []
      const cfgMap = {}
      ;(cfgReal || []).forEach(c => { cfgMap[c.clave] = c.valor })
      const merma = parseFloat(cfgMap.merma_pct) || 0.08
      const costoEnvase = parseFloat(cfgMap.costo_envase) || 794.6

      // ── Estado financiero actual ─────────────────────────────────────────
      const inventarioRotable = (ins || []).reduce((s, i) =>
        s + (parseFloat(i.stock_actual) || 0) * (parseFloat(i.costo_ppp) || 0), 0)
      const activosFijos = (cmp || []).reduce((s, c) =>
        c.tipo === 'activo_fijo' ? s + c.precio_total : s, 0)
      const totalVentas = (vts || []).reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0)
      const totalCompras = (cmp || []).reduce((s, c) => s + (c.es_inversion ? 0 : c.precio_total), 0)
      const movExtraEntradas = caja.filter(m => m.tipo === 'entrada' && m.categoria !== 'Venta' && m.categoria !== 'Delivery').reduce((s, m) => s + m.monto, 0)
      const movExtraSalidas = caja.filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos').reduce((s, m) => s + m.monto, 0)
      const cajaActual = totalVentas - totalCompras + movExtraEntradas - movExtraSalidas
      const patrimonioActual = cajaActual + inventarioRotable + activosFijos

      // ── Ritmo histórico real ─────────────────────────────────────────────
      const rent = calcularRentabilidad({
        ventas: vts || [],
        recetaIngredientes: recIng || [],
        insumosPPP: ins || [],
        gastosCaja: caja.filter(m => m.tipo === 'salida'),
        config: { merma_pct: merma, costo_envase: costoEnvase },
      })
      const ritmo = calcularRitmo(vts || [], rent)

      // ── Gasto fijo mensual estimado: gastos de caja que no son insumos,
      //    promediados sobre los meses con datos ─────────────────────────────
      const gastosFijos = caja.filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos')
      const totalGastoFijo = gastosFijos.reduce((s, m) => s + m.monto, 0)
      const mesesConDatos = Math.max(1, ritmo.diasActivos / 30)
      const gastoFijoMensual = totalGastoFijo / mesesConDatos

      const escenarios = generarEscenarios({
        ritmo,
        cajaActual,
        inventarioActual: inventarioRotable,
        patrimonioActual,
        gastoFijoMensual,
      })

      setData({
        escenarios,
        actual: { cajaActual, inventarioRotable, patrimonioActual },
        ritmo,
        gastoFijoMensual,
      })
    } catch (e) {
      console.error('Proyecciones - error:', e)
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading">Cargando...</div>
  if (error) {
    return (
      <div className="page">
        <div className="page-title">Proyecciones</div>
        <div className="card" style={{ borderColor: 'rgba(196,0,90,0.4)' }}>
          <div className="card-title" style={{ color: 'var(--pink)' }}>Error al cargar</div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>{error}</div>
        </div>
      </div>
    )
  }

  const { escenarios, actual, ritmo, gastoFijoMensual } = data
  const sinDatos = ritmo.ingresoMensual === 0

  return (
    <div className="page">
      <div className="page-title">Proyecciones</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6, marginTop: -12 }}>
        Tres escenarios a 90 días, calculados desde tu ritmo histórico real — no estimaciones genéricas.
      </div>

      {sinDatos ? (
        <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--muted)' }}>
          Necesitas más ventas registradas para generar proyecciones confiables.
        </div>
      ) : (
        <>
          {/* Punto de partida */}
          <div className="card">
            <div className="card-title">Punto de partida — hoy</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Metrica label="Caja" valor={actual.cajaActual} color="var(--green)" />
              <Metrica label="Inventario" valor={actual.inventarioRotable} color="var(--cyan)" />
              <Metrica label="Patrimonio" valor={actual.patrimonioActual} color="var(--text-strong)" />
            </div>
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
              Ritmo actual: <strong style={{ color: 'var(--text)' }}>{formatCLP(ritmo.ingresoMensual)}</strong> de ingreso/mes ·
              utilidad operativa <strong style={{ color: 'var(--cyan)' }}>{formatCLP(ritmo.utilidadMensual)}</strong>/mes
              {' '}(margen op. {(ritmo.margenOperativo * 100).toFixed(0)}%)
            </div>
          </div>

          {/* Punto de equilibrio */}
          <div className="card" style={{ border: '1px solid rgba(245,158,11,0.3)' }}>
            <div className="card-title">⚖️ Punto de equilibrio mensual</div>
            {escenarios.puntoEquilibrioMensual != null ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b', marginBottom: 4 }}>
                  {formatCLP(escenarios.puntoEquilibrioMensual)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
                  Lo que necesitas vender al mes para cubrir tu gasto fijo de {formatCLP(gastoFijoMensual)},
                  dado tu margen operativo. {' '}
                  {ritmo.ingresoMensual >= escenarios.puntoEquilibrioMensual
                    ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>Hoy vendes por encima del equilibrio ✓</span>
                    : <span style={{ color: 'var(--pink)', fontWeight: 700 }}>Hoy vendes por debajo del equilibrio.</span>}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                No calculable: el margen operativo es cero o negativo.
              </div>
            )}
          </div>

          {/* Los 3 escenarios */}
          <EscenarioCard escenarioKey="optimista" escenario={escenarios.optimista} />
          <EscenarioCard escenarioKey="realista" escenario={escenarios.realista} />
          <EscenarioCard escenarioKey="conservador" escenario={escenarios.conservador} />

          <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
            💡 El escenario <strong style={{ color: 'var(--green)' }}>optimista</strong> asume 20% de crecimiento mensual compuesto.
            El <strong style={{ color: 'var(--cyan)' }}>realista</strong> mantiene tu ritmo actual.
            El <strong style={{ color: '#f59e0b' }}>conservador</strong> modela una caída del 30% — útil para el invierno chileno.
            Todos parten de tu promedio histórico de {formatCLP(ritmo.ingresoDiario)}/día.
          </div>
        </>
      )}
    </div>
  )
}
