import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import { calcularRentabilidad } from '../lib/rentabilidad'
import { calcularRitmo, proyectarCapital } from '../lib/proyecciones'

// Parsea "YYYY-MM-DD" sin desfase de zona horaria
function parseFecha(f) {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ─── Barra de progreso individual ───────────────────────────────────────────
function BarraObjetivo({ icono, label, actual, objetivo, formato, color, nota, sobreUmbral }) {
  const pct = objetivo > 0 ? Math.min(1, actual / objetivo) : 0
  const pctTexto = Math.round(pct * 100)
  const fmt = formato || (n => String(Math.round(n)))

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 15 }}>{icono}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
          </span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color }}>
          {pctTexto}%
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 7, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{
          height: '100%', borderRadius: 4, width: (pct * 100) + '%',
          background: `linear-gradient(90deg, ${color}, ${color})`,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
        <span>
          {sobreUmbral != null ? (
            <span style={{ color: sobreUmbral ? 'var(--green)' : '#f59e0b', fontWeight: 700 }}>
              {fmt(actual)}
            </span>
          ) : (
            <><span style={{ color: 'var(--text)', fontWeight: 700 }}>{fmt(actual)}</span> de {fmt(objetivo)}</>
          )}
        </span>
        {nota && <span style={{ fontStyle: 'italic' }}>{nota}</span>}
      </div>
    </div>
  )
}

// ─── Modal de configuración de objetivos ────────────────────────────────────
function ConfigModal({ objetivos, onSave, onCancel }) {
  const [capital, setCapital] = useState(String(objetivos.capital))
  const [clientes, setClientes] = useState(String(objetivos.clientes))
  const [recetas, setRecetas] = useState(String(objetivos.recetas))
  const [margen, setMargen] = useState(String(Math.round(objetivos.margen * 100)))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const updates = [
      { clave: 'bar_objetivo_capital', valor: String(parseInt(capital) || 0) },
      { clave: 'bar_objetivo_clientes', valor: String(parseInt(clientes) || 0) },
      { clave: 'bar_objetivo_recetas', valor: String(parseInt(recetas) || 0) },
      { clave: 'bar_objetivo_margen', valor: String((parseFloat(margen) || 0) / 100) },
    ]
    // upsert por clave; si la fila no existe se inserta
    for (const u of updates) {
      const { data: existe } = await supabase.from('config').select('clave').eq('clave', u.clave).maybeSingle()
      if (existe) {
        await supabase.from('config').update({ valor: u.valor }).eq('clave', u.clave)
      } else {
        await supabase.from('config').insert(u)
      }
    }
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: 24, overflowY: 'auto' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, maxWidth: 380, width: '100%', marginTop: 28 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>
          Objetivos del bar
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
          Ajusta las metas que quieres alcanzar antes de abrir el bar.
        </div>

        <div className="form-group">
          <label className="form-label">Capital acumulado (CLP)</label>
          <input type="number" className="form-input" value={capital}
            onChange={e => setCapital(e.target.value)} placeholder="15000000" />
        </div>
        <div className="form-group">
          <label className="form-label">Clientes base únicos</label>
          <input type="number" className="form-input" value={clientes}
            onChange={e => setClientes(e.target.value)} placeholder="200" />
        </div>
        <div className="form-group">
          <label className="form-label">Recetas validadas</label>
          <input type="number" className="form-input" value={recetas}
            onChange={e => setRecetas(e.target.value)} placeholder="10" />
        </div>
        <div className="form-group">
          <label className="form-label">Margen bruto sostenido (%)</label>
          <input type="number" className="form-input" value={margen}
            onChange={e => setMargen(e.target.value)} placeholder="65" />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sección principal "El Camino" ──────────────────────────────────────────
export default function CaminoAlBar() {
  const [estado, setEstado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [configurando, setConfigurando] = useState(false)
  const [colapsado, setColapsado] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [
        { data: vts }, { data: ords }, { data: cls },
        { data: cmp }, { data: ins }, { data: recIng },
        { data: cajaArr }, { data: cfgReal },
      ] = await Promise.all([
        supabase.from('ventas').select('id, fecha, litros, precio_venta, receta_nombre, orden_id, delivery'),
        supabase.from('ordenes').select('id, cliente_nombre'),
        supabase.from('clientes').select('id, nombre'),
        supabase.from('compras').select('precio_total, es_inversion, tipo'),
        supabase.from('insumos').select('nombre, stock_actual, costo_ppp'),
        supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad, unidad'),
        supabase.from('caja').select('monto, tipo, categoria, fecha'),
        supabase.from('config').select('*'),
      ])
      const caja = cajaArr || []

      // ── Config: objetivos (con defaults si la fila no existe) ────────────
      const cfgMap = {}
      ;(cfgReal || []).forEach(c => { cfgMap[c.clave] = c.valor })

      const objetivos = {
        capital: parseFloat(cfgMap.bar_objetivo_capital) || 15000000,
        clientes: parseInt(cfgMap.bar_objetivo_clientes) || 200,
        recetas: parseInt(cfgMap.bar_objetivo_recetas) || 10,
        margen: parseFloat(cfgMap.bar_objetivo_margen) || 0.65,
        horizonteMeses: parseInt(cfgMap.bar_horizonte_meses) || 18,
      }
      const merma = parseFloat(cfgMap.merma_pct) || 0.08
      const costoEnvase = parseFloat(cfgMap.costo_envase) || 794.6

      // ── a) CAPITAL ACUMULADO ─────────────────────────────────────────────
      // patrimonio neto actual + proyección de utilidades a `horizonteMeses`
      const inversion = (cmp || []).reduce((s, c) =>
        (c.es_inversion || c.tipo === 'capital_trabajo') && c.tipo !== 'activo_fijo'
          ? s + c.precio_total : s, 0)
      const activosFijos = (cmp || []).reduce((s, c) =>
        c.tipo === 'activo_fijo' ? s + c.precio_total : s, 0)
      const inventarioRotable = (ins || []).reduce((s, i) =>
        s + (parseFloat(i.stock_actual) || 0) * (parseFloat(i.costo_ppp) || 0), 0)

      // caja disponible (mismo cálculo que el Dashboard)
      const totalVentas = (vts || []).reduce((s, v) => s + (v.litros * v.precio_venta) - (v.delivery || 0), 0)
      const totalCompras = (cmp || []).reduce((s, c) => s + (c.es_inversion ? 0 : c.precio_total), 0)
      const movExtraEntradas = caja.filter(m => m.tipo === 'entrada' && m.categoria !== 'Venta' && m.categoria !== 'Delivery').reduce((s, m) => s + m.monto, 0)
      const movExtraSalidas = caja.filter(m => m.tipo === 'salida' && m.categoria !== 'Insumos').reduce((s, m) => s + m.monto, 0)
      const cajaDisponible = totalVentas - totalCompras + movExtraEntradas - movExtraSalidas

      const patrimonioNeto = cajaDisponible + inventarioRotable + activosFijos

      // rentabilidad para obtener margen operativo (proyección de utilidades)
      const rent = calcularRentabilidad({
        ventas: vts || [],
        recetaIngredientes: recIng || [],
        insumosPPP: ins || [],
        gastosCaja: caja.filter(m => m.tipo === 'salida'),
        config: { merma_pct: merma, costo_envase: costoEnvase },
      })
      const ritmo = calcularRitmo(vts || [], rent)
      const capitalProyectado = proyectarCapital(patrimonioNeto, ritmo.utilidadMensual, objetivos.horizonteMeses)

      // ── b) CLIENTES BASE ─────────────────────────────────────────────────
      // clientes únicos: registrados en tabla clientes + nombres de órdenes
      const nombresClientes = new Set()
      ;(cls || []).forEach(c => { if (c.nombre) nombresClientes.add(c.nombre.trim().toLowerCase()) })
      ;(ords || []).forEach(o => { if (o.cliente_nombre) nombresClientes.add(o.cliente_nombre.trim().toLowerCase()) })
      const clientesBase = nombresClientes.size

      // ── c) RECETAS VALIDADAS (>= 5 unidades vendidas) ────────────────────
      const unidadesPorReceta = {}
      ;(vts || []).forEach(v => {
        unidadesPorReceta[v.receta_nombre] = (unidadesPorReceta[v.receta_nombre] || 0) + (v.litros || 1)
      })
      const recetasValidadas = Object.values(unidadesPorReceta).filter(u => u >= 5).length

      // ── d) MARGEN PROMEDIO últimos 30 días ───────────────────────────────
      const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
      const ventas30 = (vts || []).filter(v => v.fecha && parseFecha(v.fecha) >= hace30)
      const rent30 = calcularRentabilidad({
        ventas: ventas30,
        recetaIngredientes: recIng || [],
        insumosPPP: ins || [],
        gastosCaja: caja.filter(m => m.tipo === 'salida' && m.fecha && parseFecha(m.fecha) >= hace30),
        config: { merma_pct: merma, costo_envase: costoEnvase },
      })
      const margen30 = rent30.ingresos > 0 ? rent30.margenBruto : 0

      setEstado({
        objetivos,
        capital: { actual: capitalProyectado, patrimonioNeto, utilidadMensual: ritmo.utilidadMensual },
        clientesBase,
        recetasValidadas,
        margen30,
      })
    } catch (e) {
      console.error('CaminoAlBar - error:', e)
      setEstado(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: 20 }}>
        Cargando el camino...
      </div>
    )
  }
  if (!estado) return null

  const { objetivos, capital, clientesBase, recetasValidadas, margen30 } = estado
  const margenOk = margen30 >= objetivos.margen

  // Progreso global (promedio de los 4 indicadores, cap a 100%)
  const progresos = [
    Math.min(1, capital.actual / objetivos.capital),
    Math.min(1, clientesBase / objetivos.clientes),
    Math.min(1, recetasValidadas / objetivos.recetas),
    Math.min(1, margen30 / objetivos.margen),
  ]
  const progresoGlobal = Math.round(progresos.reduce((s, p) => s + p, 0) / progresos.length * 100)

  return (
    <>
      {configurando && (
        <ConfigModal
          objetivos={objetivos}
          onSave={() => { setConfigurando(false); setLoading(true); load() }}
          onCancel={() => setConfigurando(false)}
        />
      )}

      <div className="card" style={{
        border: '1px solid rgba(123,47,190,0.4)',
        background: 'linear-gradient(160deg, rgba(123,47,190,0.10), var(--card))',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: colapsado ? 0 : 14 }}>
          <div
            onClick={() => setColapsado(c => !c)}
            style={{ cursor: 'pointer', flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: '#AFA9EC',
              textTransform: 'uppercase', letterSpacing: 1.5,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 10 }}>{colapsado ? '▶' : '▼'}</span>
              🍸 El camino al bar
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              Progreso global: <span style={{ color: '#AFA9EC', fontWeight: 800 }}>{progresoGlobal}%</span>
            </div>
          </div>
          <button onClick={() => setConfigurando(true)}
            style={{
              background: 'none', border: '1px solid rgba(123,47,190,0.4)',
              borderRadius: 8, color: '#AFA9EC', cursor: 'pointer',
              fontSize: 11, padding: '4px 10px', flexShrink: 0,
            }}>
            ⚙️ Metas
          </button>
        </div>

        {!colapsado && (
          <>
            <BarraObjetivo
              icono="💰" label="Capital acumulado"
              actual={capital.actual} objetivo={objetivos.capital}
              formato={formatCLP} color="var(--green)"
              nota={`proyectado a ${objetivos.horizonteMeses} meses`}
            />
            <BarraObjetivo
              icono="👥" label="Clientes base"
              actual={clientesBase} objetivo={objetivos.clientes}
              color="var(--cyan)"
              nota="clientes únicos"
            />
            <BarraObjetivo
              icono="📋" label="Recetas validadas"
              actual={recetasValidadas} objetivo={objetivos.recetas}
              color="#f59e0b"
              nota="con 5+ ventas"
            />
            <BarraObjetivo
              icono="📊" label="Margen sostenido (30d)"
              actual={margen30} objetivo={objetivos.margen}
              formato={n => (n * 100).toFixed(1) + '%'}
              color={margenOk ? 'var(--green)' : '#f59e0b'}
              sobreUmbral={margenOk}
              nota={margenOk ? `sobre el ${Math.round(objetivos.margen * 100)}%` : `bajo el ${Math.round(objetivos.margen * 100)}%`}
            />

            <div style={{
              marginTop: 6, padding: '9px 12px',
              background: 'rgba(123,47,190,0.08)', borderRadius: 8,
              fontSize: 11, color: 'var(--muted)', lineHeight: 1.7,
            }}>
              {capital.utilidadMensual > 0
                ? <>Al ritmo actual sumas <strong style={{ color: '#AFA9EC' }}>{formatCLP(capital.utilidadMensual)}</strong> de utilidad al mes. Tu patrimonio hoy es <strong style={{ color: 'var(--green)' }}>{formatCLP(capital.patrimonioNeto)}</strong>.</>
                : <>Registra más ventas para que la proyección de capital tome forma.</>}
            </div>
          </>
        )}
      </div>
    </>
  )
}
