import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularCostoReceta, formatCLP, formatPct, esOrigenIGAds, leerMerma } from '../lib/calculos'
import { calcularRentabilidad } from '../lib/rentabilidad'
import { resumenMotivos } from '../lib/salidas'
import { resumenClientes, montoVenta } from '../lib/metricas'
import { enriquecerVentasConDelivery, calcularSaldoCaja } from '../lib/calculos'
import CaminoAlBar from '../pages/CaminoAlBar'
import { todas } from '../lib/todas'

// Parsea "YYYY-MM-DD" sin desfase de zona horaria (new Date(str) parsea UTC)
function parseFecha(f) {
  if (!f) return null
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}
// Formatea una fecha local a "YYYY-MM-DD" (evita el desfase de toISOString,
// que usa UTC: en Chile desde ~21:00 ya cae en el día/mes siguiente en UTC)
function toISOLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Camino al Bar colapsado por defecto y al final del Dashboard (pedido del
// usuario, jun 2026): es una proyección de largo plazo, no info operativa
// diaria. Bonus: sus datos solo se cargan al expandir.
function CaminoColapsable() {
  const [abierto, setAbierto] = React.useState(false)
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setAbierto(a => !a)}
        style={{
          width: '100%', background: 'rgba(123,47,190,0.06)',
          border: '1px solid rgba(123,47,190,0.25)', borderRadius: 12,
          color: '#AFA9EC', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          padding: '12px 14px', textAlign: 'left',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
        <span>🍸 El camino al bar</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>
          {abierto ? 'ocultar ▲' : 'ver proyección ▼'}
        </span>
      </button>
      {abierto && <div style={{ marginTop: 12 }}><CaminoAlBar /></div>}
    </div>
  )
}

function RecetasComparativo({ topVolumen, topGanancia, todasVentas, costoPorReceta }) {
  const [tab, setTab] = useState('volumen')
  if (!topVolumen || topVolumen.length === 0) return null

  var items = tab === 'volumen' ? topVolumen : topGanancia
  var maxVal = tab === 'volumen'
    ? Math.max.apply(null, (topVolumen || []).map(function(e) { return e[1].litros }).concat([1]))
    : Math.max.apply(null, (topGanancia || []).map(function(e) { return e[1].ganancia }).concat([1]))

  var topVol = topVolumen && topVolumen[0] ? topVolumen[0][0] : null
  var topGan = topGanancia && topGanancia[0] ? topGanancia[0][0] : null
  var hayDivergencia = topVol && topGan && topVol !== topGan

  return (
    <div className="card">
      <div className="card-title">Recetas</div>

      {hayDivergencia && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#f59e0b', lineHeight: 1.6 }}>
          <strong>{topGan}</strong> deja mas ganancia que <strong>{topVol}</strong>, aunque se vende menos litros.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[{ key: 'volumen', label: 'Por litros' }, { key: 'ganancia', label: 'Por ganancia' }].map(function(t) {
          return (
            <button key={t.key} onClick={function() { setTab(t.key) }} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tab === t.key ? 'var(--cyan)' : 'rgba(255,255,255,0.06)', color: tab === t.key ? '#000' : 'var(--muted)' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {(items || []).map(function(entry, i) {
        var nombre = entry[0]
        var d = entry[1]
        var val = tab === 'volumen' ? d.litros : d.ganancia
        var pct = maxVal > 0 ? val / maxVal : 0
        var mc = d.margen >= 0.65 ? 'var(--green)' : d.margen >= 0.50 ? 'var(--cyan)' : 'var(--pink)'
        var bg = i === 0 ? (tab === 'volumen' ? 'linear-gradient(90deg,var(--cyan),#00e5e5)' : 'linear-gradient(90deg,var(--green),#4ade80)') : 'rgba(255,255,255,0.15)'
        return (
          <div key={nombre} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i === 0 ? 'var(--cyan)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: i === 0 ? '#000' : 'var(--muted)', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{nombre}</span>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: tab === 'volumen' ? 'var(--text)' : 'var(--green)' }}>
                  {tab === 'volumen' ? (d.litros + 'L') : formatCLP(d.ganancia)}
                </div>
                {d.margen > 0 && <div style={{ fontSize: 11, color: mc }}>{formatPct(d.margen)}</div>}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, width: (pct * 100) + '%', background: bg, transition: 'width 0.4s' }} />
            </div>
          </div>
        )
      })}

      {/* El ranking completo de recetas vive en Análisis (se quitó de aquí
          para no duplicar vistas — jun 2026) */}
    </div>
  )
}

// ─── Tooltip cyberpunk reutilizable ─────────────────────────────────────────
// Usa position:fixed + getBoundingClientRect para que la burbuja nunca se
// salga de la pantalla en móvil (se ajusta a los bordes del viewport).
function InfoTip({ texto }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = React.useRef(null)

  const toggle = () => {
    if (abierto) { setAbierto(false); return }
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const margen = 12
    const maxAncho = 260
    const ancho = Math.min(maxAncho, window.innerWidth - margen * 2)
    // Centrar sobre el botón, pero clamp a los bordes del viewport
    let left = rect.left + rect.width / 2 - ancho / 2
    left = Math.max(margen, Math.min(left, window.innerWidth - ancho - margen))
    setPos({ left, top: rect.top, ancho })
    setAbierto(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
          border: '1px solid var(--cyan-dim)', background: 'rgba(0,180,180,0.1)',
          color: 'var(--cyan)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, padding: 0,
        }}
        aria-label="Más información"
      >i</button>
      {abierto && pos && (
        <span style={{
          position: 'fixed', left: pos.left, top: pos.top, zIndex: 300,
          transform: 'translateY(-100%) translateY(-8px)',
          width: pos.ancho, background: 'var(--bg2)', border: '1px solid var(--cyan-dim)',
          borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--text)',
          lineHeight: 1.6, boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
          textTransform: 'none', letterSpacing: 0, fontWeight: 400,
        }}>
          {texto}
        </span>
      )}
    </>
  )
}

// ─── Sección RENTABILIDAD: tres márgenes con label explicativo ──────────────
function Rentabilidad({ r, comp }) {
  if (!r) return null
  const filas = [
    {
      label: 'Margen bruto',
      pct: r.margenBruto,
      pesos: r.gananciaBruta,
      color: 'var(--green)',
      delta: comp ? comp.bruto : null,
      desc: 'Lo que queda después del costo de los insumos (COGS): receta, merma y envase. Es la rentabilidad pura del producto.',
    },
    {
      label: 'Margen operativo',
      pct: r.margenOperativo,
      pesos: r.gananciaOperativa,
      color: 'var(--cyan)',
      delta: comp ? comp.operativo : null,
      desc: 'Margen bruto menos publicidad, transporte/delivery, otros gastos variables y el producto que salió sin venta (marketing, canjes, pruebas, consumo interno), a costo. Es lo que deja la operación del día a día.',
      sub: r.productoSinVenta > 0
        ? `incluye ${formatCLP(r.productoSinVenta)} de producto sin venta · ${resumenMotivos(r.salidasPorMotivo, formatCLP)}`
        : null,
    },
    {
      label: 'Margen neto',
      pct: r.margenNeto,
      pesos: r.gananciaNeta,
      color: r.tieneCostoOportunidad ? 'var(--purple)' : 'var(--muted)',
      delta: comp ? comp.neto : null,
      desc: r.tieneCostoOportunidad
        ? 'Margen operativo menos el costo de oportunidad de tu tiempo como operador. Es la ganancia real considerando tus horas.'
        : 'Margen operativo menos el costo de oportunidad de tu tiempo. Aún no registras horas trabajadas — cuando lo hagas, este número se ajusta.',
    },
  ]
  return (
    <div className="card">
      <div className="card-title">Rentabilidad</div>
      {filas.map((f, i) => (
        <div key={f.label} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingBottom: 10, marginBottom: 10,
          borderBottom: i < filas.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{f.label}</span>
              <InfoTip texto={f.desc} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {formatCLP(f.pesos)} {f.pesos >= 0 ? 'de ganancia' : 'de pérdida'}
            </div>
            {f.sub && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                {f.sub}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: f.color }}>
              {formatPct(f.pct)}
            </div>
            {f.delta != null && Math.abs(f.delta) >= 0.005 && (
              <div style={{ fontSize: 10, color: f.delta >= 0 ? 'var(--green)' : 'var(--pink)', marginTop: 1 }}>
                {f.delta >= 0 ? '↑' : '↓'} {(Math.abs(f.delta) * 100).toFixed(1)}pp vs 30d previos
              </div>
            )}
          </div>
        </div>
      ))}
      <div style={{
        padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
        borderRadius: 8, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7,
      }}>
        💡 El <strong style={{ color: 'var(--green)' }}>bruto</strong> mide tu producto,
        el <strong style={{ color: 'var(--cyan)' }}>operativo</strong> mide tu operación,
        el <strong style={{ color: 'var(--purple)' }}>neto</strong> mide tu negocio completo.
      </div>
    </div>
  )
}

// ─── Rotación de capital de trabajo (antes mal llamado "ROI") ───────────────
function RotacionCapital({ inversion, ingresoTotal, rotacion }) {
  return (
    <div className="kpi-grid">
      <div className="kpi-card" style={{ gridColumn: '1 / -1', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="kpi-label" style={{ marginBottom: 0 }}>Rotación de capital de trabajo</span>
            <InfoTip texto={`Tu capital de trabajo (${formatCLP(inversion)}) ha rotado ${rotacion.toFixed(1)} veces, generando ingresos por ${formatCLP(ingresoTotal)}. No es ROI: mide cuántas veces tu capital "dio la vuelta", no la ganancia neta.`} />
          </div>
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--cyan)' }}>
            {rotacion.toFixed(1)}×
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
          {formatCLP(inversion)} de capital → {formatCLP(ingresoTotal)} en ingresos
        </div>
      </div>
    </div>
  )
}

// ─── PATRIMONIO NETO: pone la caja disponible en contexto ───────────────────
function PatrimonioNeto({ data }) {
  const caja = data.saldoCaja || 0
  const inventario = data.inventarioRotable || 0
  const capitalTrabajo = data.capitalTrabajoStock || 0
  const activosFijos = data.totalActivosFijos || 0
  const patrimonioNeto = caja + inventario + activosFijos
  // "invertido" = lo que Ro puso de su bolsillo (capital de trabajo + equipos)
  const invertido = capitalTrabajo + activosFijos

  const componentes = [
    { label: 'Caja disponible', valor: caja, color: 'var(--green)',
      desc: 'Efectivo líquido disponible hoy.' },
    { label: 'Inventario rotable', valor: inventario, color: 'var(--cyan)',
      desc: 'Valor del stock actual de insumos a costo PPP — se convierte en ventas.' },
    { label: 'Capital de trabajo', valor: capitalTrabajo, color: 'var(--text)',
      desc: 'Envases y capital operativo inicial invertido en el negocio.' },
    { label: 'Activos fijos', valor: activosFijos, color: 'var(--purple)',
      desc: 'Equipos y utensilios — valor que no rota pero es tuyo.' },
  ]

  return (
    <div className="card" style={{ border: '1px solid rgba(34,197,94,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>Patrimonio neto</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>
          {formatCLP(patrimonioNeto)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {componentes.map(c => (
          <div key={c.label} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>{c.label}</span>
              <InfoTip texto={c.desc} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>
              {formatCLP(c.valor)}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '10px 12px', background: 'rgba(34,197,94,0.06)',
        border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8,
        fontSize: 12, color: 'var(--text)', lineHeight: 1.7,
      }}>
        Has invertido <strong style={{ color: 'var(--text-strong)' }}>{formatCLP(invertido)}</strong> y
        construido <strong style={{ color: 'var(--green)' }}>{formatCLP(patrimonioNeto)}</strong> de valor.
        {invertido > 0 && patrimonioNeto > invertido && (
          <span> Eso es <strong style={{ color: 'var(--green)' }}>{formatCLP(patrimonioNeto - invertido)}</strong> de valor creado por encima de lo que pusiste.</span>
        )}
        <span style={{ display: 'block', marginTop: 4, color: 'var(--muted)', fontSize: 11 }}>
          La caja baja no significa pérdida: parte de tu dinero está en stock y equipos, no en efectivo.
        </span>
      </div>
    </div>
  )
}


// ─── Resumen financiero (en Panel) ──────────────────────────────────────────
// Hasta el 6-oct esto era Inicio. Inicio pasó a ser la operación del día
// (pages/Dashboard.js) y lo financiero vive acá, dentro de Panel. Lo que Panel
// ya mostraba (ingreso total, ticket, clientes que vuelven) no se repite.
export default function ResumenFinanciero() {
  const [data, setData] = useState(null)
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)

  useEffect(() => {
    async function load() {
      try {
      const results = await Promise.all([
        supabase.from('config').select('*'),
        todas(supabase.from('ventas').select('*').order('fecha', { ascending: false })),
        todas(supabase.from('caja').select('*')),
        todas(supabase.from('compras').select('precio_total, es_inversion, tipo')),
        // '*' y no columnas sueltas: `activo` (temporada) puede no existir todavía.
        supabase.from('insumos').select('*'),
        todas(supabase.from('ordenes').select('id, fecha, medio_pago, cliente_nombre, cliente_id, delivery, delivery_cobrado')),
        supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad, unidad'),
        supabase.from('insumos').select('nombre, costo_ppp'),
        supabase.from('clientes').select('id, estado_contacto'),
        supabase.from('salidas_stock').select('fecha, motivo, costo_valorizado'),
      ])
      const errores = results.map((r, i) => r.error ? { idx: i, msg: r.error.message } : null).filter(Boolean)
      if (errores.length > 0) {
        const tablas = ['config', 'ventas', 'caja', 'compras', 'insumos', 'ordenes', 'receta_ingredientes', 'insumosConPPP', 'clientes', 'salidas_stock']
        throw new Error(errores.map(e => `${tablas[e.idx]}: ${e.msg}`).join(' · '))
      }
      let [{ data: cfg }, { data: vts }, { data: cja }, { data: cmp }, { data: ins }, { data: ordenes }, { data: recIng }, { data: insumosConPPP }, { data: clientesRows }, { data: salidasRows }] = results
      // Salidas sin venta (marketing, canjes, pruebas, consumo interno): entran
      // al margen operativo a costo. Ver lib/salidas.js.
      const salidas = salidasRows || []

      // Saldo de caja: plata real, sobre TODAS las filas y con la misma función
      // que Caja, MiDinero, CaminoAlBar y Proyecciones. Va antes del filtro de
      // clientes excluidos: ese filtro es para estadísticas, y sacar a alguien
      // de las métricas no borra la plata que entró o salió por sus pedidos.
      const saldoCaja = calcularSaldoCaja({ ventas: vts, ordenes, compras: cmp, caja: cja })

      // Clientes excluidos (fraude, estado_contacto = 'excluido') salen de
      // TODAS las estadísticas — mismo criterio que dashboardMetrics.js
      // (Indicadores), para que las pantallas no diverjan.
      const clientesExcluidos = new Set((clientesRows || []).filter(c => c.estado_contacto === 'excluido').map(c => c.id))
      if (clientesExcluidos.size > 0) {
        const ordenesExcluidas = new Set((ordenes || []).filter(o => clientesExcluidos.has(o.cliente_id)).map(o => o.id))
        ordenes = (ordenes || []).filter(o => !clientesExcluidos.has(o.cliente_id))
        vts = (vts || []).filter(v => !v.orden_id || !ordenesExcluidas.has(v.orden_id))
      }

      // Enriquecer cada venta con el delivery (costo) y delivery_cobrado de su
      // orden. El delivery vive en `ordenes`, no en las filas de `ventas`.
      const vtsEnr = enriquecerVentasConDelivery(vts || [], ordenes || [])

      const config = {}
      cfg?.forEach(c => { config[c.clave] = c.valor })


      const inversion = cmp?.reduce((s, c) =>
        (c.es_inversion || c.tipo === 'capital_trabajo') && c.tipo !== 'activo_fijo'
          ? s + c.precio_total : s, 0) || config.inversion_total || 120480
      const totalActivosFijos = cmp?.reduce((s, c) =>
        c.tipo === 'activo_fijo' ? s + c.precio_total : s, 0) || 0
      const ingresoTotal = vts?.reduce((s, v) => s + montoVenta(v), 0) || 0
      const litrosTotales = vts?.reduce((s, v) => s + v.litros, 0) || 0

      const merma = leerMerma(config.merma_pct)
      const costoEnvase = parseFloat(config.costo_envase) || 794.6
      const costoPorReceta = {}
      const recetasUnicas = [...new Set((recIng || []).map(i => i.receta_nombre))]
      recetasUnicas.forEach(nombre => {
        const ings = (recIng || []).filter(i => i.receta_nombre === nombre && i.insumo_nombre !== 'ENVASE')
        costoPorReceta[nombre] = calcularCostoReceta(ings, insumosConPPP || [], merma, costoEnvase)
      })
      const costoTotalReal = (vts || []).reduce((s, v) => {
        const cu = costoPorReceta[v.receta_nombre] || 0
        return s + cu * v.litros
      }, 0)

      // ── Rentabilidad: tres márgenes desde el módulo central ──────────────
      const gastosCajaSalida = (cja || []).filter(m => m.tipo === 'salida')
      const horasTrabajadas = parseFloat(config.horas_trabajadas_total) || 0
      const costoHora = parseFloat(config.costo_hora_operador) || 0
      const rentabilidad = calcularRentabilidad({
        ventas: vtsEnr,
        recetaIngredientes: recIng || [],
        insumosPPP: insumosConPPP || [],
        gastosCaja: gastosCajaSalida,
        salidas,
        config: { merma_pct: merma, costo_envase: costoEnvase },
        horasTrabajadas,
        costoHora,
      })

      // Rentabilidad 30d vs 30d previos (para mostrar deltas en cada margen)
      const _hoy = new Date()
      const _h30 = new Date(_hoy); _h30.setDate(_hoy.getDate() - 30)
      const _h60 = new Date(_hoy); _h60.setDate(_hoy.getDate() - 60)
      const vts30 = vtsEnr.filter(v => parseFecha(v.fecha) >= _h30)
      const vtsPrev = vtsEnr.filter(v => parseFecha(v.fecha) >= _h60 && parseFecha(v.fecha) < _h30)
      const gastos30 = gastosCajaSalida.filter(m => m.fecha && parseFecha(m.fecha) >= _h30)
      const gastosPrev = gastosCajaSalida.filter(m => m.fecha && parseFecha(m.fecha) >= _h60 && parseFecha(m.fecha) < _h30)
      const salidas30 = salidas.filter(x => x.fecha && parseFecha(x.fecha) >= _h30)
      const salidasPrev = salidas.filter(x => x.fecha && parseFecha(x.fecha) >= _h60 && parseFecha(x.fecha) < _h30)
      const rent30 = calcularRentabilidad({
        ventas: vts30, recetaIngredientes: recIng || [], insumosPPP: insumosConPPP || [],
        gastosCaja: gastos30, salidas: salidas30, config: { merma_pct: merma, costo_envase: costoEnvase },
      })
      const rentPrev = calcularRentabilidad({
        ventas: vtsPrev, recetaIngredientes: recIng || [], insumosPPP: insumosConPPP || [],
        gastosCaja: gastosPrev, salidas: salidasPrev, config: { merma_pct: merma, costo_envase: costoEnvase },
      })
      const comparacionRent = {
        bruto:     rentPrev.ingresos > 0 ? rent30.margenBruto    - rentPrev.margenBruto    : null,
        operativo: rentPrev.ingresos > 0 ? rent30.margenOperativo - rentPrev.margenOperativo : null,
        neto:      rentPrev.ingresos > 0 ? rent30.margenNeto      - rentPrev.margenNeto      : null,
        ingresos30: rent30.ingresos, ingresosPrev: rentPrev.ingresos,
      }

      // ── Inventario rotable: valor del stock actual de insumos a costo PPP ──
      const inventarioRotable = (ins || []).reduce((s, i) => {
        const stock = parseFloat(i.stock_actual) || 0
        const ppp = parseFloat(i.costo_ppp) || 0
        return s + stock * ppp
      }, 0)
      // capital de trabajo (envases / capital operativo) = misma `inversion`
      const capitalTrabajoStock = inversion

      const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30)
      const vtsMes = vts?.filter(v => parseFecha(v.fecha) >= hace30) || []
      const ingresoMes = vtsMes.reduce((s, v) => s + montoVenta(v), 0)

      // Top clientes con la misma definición de cliente que Panel (lib/metricas).
      const clientesRes = resumenClientes(ordenes || [], vts || [])
      const topRecurrentes = clientesRes.lista.filter(c => c.pedidos > 1)
        .sort((a, b) => b.gastado - a.gastado).slice(0, 5)

      // Canal más activo (desde que se registra origen)
      const porOrigen = {}
      ;(vts || []).filter(v => v.origen).forEach(v => {
        porOrigen[v.origen] = (porOrigen[v.origen] || 0) + montoVenta(v)
      })
      const canalTop = Object.entries(porOrigen).sort((a, b) => b[1] - a[1])[0] || null

      // Próximo evento de alta venta
      const hoyDate = new Date()
      const EVENTOS_PROX = [
        { fecha: '2026-05-15', label: 'Quincena mayo', tipo: 'pago' },
        { fecha: '2026-05-21', label: 'Gloria Navales', tipo: 'feriado' },
        { fecha: '2026-05-30', label: 'Fin de mes', tipo: 'pago' },
        { fecha: '2026-06-15', label: 'Quincena junio', tipo: 'pago' },
        { fecha: '2026-06-29', label: 'San Pedro y San Pablo', tipo: 'feriado' },
        { fecha: '2026-07-16', label: 'Virgen del Carmen', tipo: 'feriado' },
        { fecha: '2026-09-18', label: 'Fiestas Patrias', tipo: 'feriado' },
      ]
      const hoyStr = toISOLocal(hoyDate)
      const proximoEvento = EVENTOS_PROX.find(e => e.fecha > hoyStr) || null
      let diasHastaEvento = null
      if (proximoEvento) {
        const [ey, em, ed] = proximoEvento.fecha.split('-').map(Number)
        const evDate = new Date(ey, em - 1, ed)
        diasHastaEvento = Math.ceil((evDate - hoyDate) / (1000 * 60 * 60 * 24))
      }

      const porReceta = {}
      vts?.forEach(v => {
        if (!porReceta[v.receta_nombre]) porReceta[v.receta_nombre] = { litros: 0, ingreso: 0, costo: 0 }
        porReceta[v.receta_nombre].litros += v.litros
        porReceta[v.receta_nombre].ingreso += montoVenta(v)
        porReceta[v.receta_nombre].costo += (costoPorReceta[v.receta_nombre] || 0) * v.litros
      })
      Object.values(porReceta).forEach(r => {
        r.ganancia = r.ingreso - r.costo
        r.margen = r.ingreso > 0 ? r.ganancia / r.ingreso : 0
      })
      const topRecetas = Object.entries(porReceta).sort((a, b) => b[1].litros - a[1].litros).slice(0, 5)
      const topPorGanancia = Object.entries(porReceta).sort((a, b) => b[1].ganancia - a[1].ganancia).slice(0, 5)

      setData({ inversion, ingresoTotal, litrosTotales, costoTotalReal, saldoCaja, ingresoMes, topRecurrentes, totalActivosFijos, canalTop, proximoEvento, diasHastaEvento, rentabilidad, inventarioRotable, capitalTrabajoStock, comparacionRent })
      setVentas({ topRecetas, topPorGanancia, todasVentas: vts || [], costoPorReceta })
      } catch (err) {
        console.error('Dashboard - error al cargar datos:', err)
        setErrorCarga(err.message || String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="loading">Cargando finanzas...</div>
  if (errorCarga) {
    return (
      <div>
        <div className="card" style={{ borderColor: 'rgba(196,0,90,0.4)' }}>
          <div className="card-title" style={{ color: 'var(--pink)' }}>Error al cargar</div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
            {errorCarga}
          </div>
        </div>
      </div>
    )
  }

  // Rotación de capital de trabajo: cuántas veces el capital de trabajo
  // "dio la vuelta" en ingresos. NO es ROI (no descuenta costos): es rotación.
  const rotacionCapital = data.inversion > 0 ? data.ingresoTotal / data.inversion : 0

  return (
    <div>
      <div className="section-divider">Finanzas</div>

      {/* ── RENTABILIDAD: tres márgenes con explicación ──────────────────── */}
      <Rentabilidad r={data.rentabilidad} comp={data.comparacionRent} />

      {/* ── Rotación de capital de trabajo (antes "ROI capital trabajo") ─── */}
      <RotacionCapital
        inversion={data.inversion}
        ingresoTotal={data.ingresoTotal}
        rotacion={rotacionCapital}
      />

      {/* ── PATRIMONIO NETO: la caja en contexto ───────────────────────── */}
      <PatrimonioNeto data={data} />

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Ultimos 30 dias</div>
          <div className="kpi-value cyan">{formatCLP(data.ingresoMes)}</div>
          <div className="kpi-sub">ingresos del mes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Caja disponible</div>
          <div className="kpi-value green">{formatCLP(data.saldoCaja)}</div>
          <div className="kpi-sub">efectivo líquido hoy</div>
        </div>
      </div>

      {/* Canal top + próximo evento */}
      {(data.canalTop || data.proximoEvento) && (
        <div className="kpi-grid">
          {data.canalTop && (
            <div className="kpi-card">
              <div className="kpi-label">Canal top</div>
              <div className="kpi-value" style={{ fontSize: 18 }}>
                {esOrigenIGAds(data.canalTop[0]) ? '🎯' : data.canalTop[0] === 'IG Orgánico' ? '📱' : data.canalTop[0] === 'Referido' ? '🤝' : data.canalTop[0] === 'Cliente habitual' ? '⭐' : '•'} {data.canalTop[0]}
              </div>
              <div className="kpi-sub">{formatCLP(data.canalTop[1])} acumulado</div>
            </div>
          )}
          {data.proximoEvento && (
            <div className="kpi-card" style={{ background: data.proximoEvento.tipo === 'feriado' ? 'rgba(127,119,221,0.08)' : 'rgba(16,185,129,0.08)', borderColor: data.proximoEvento.tipo === 'feriado' ? 'rgba(127,119,221,0.3)' : 'rgba(16,185,129,0.3)' }}>
              <div className="kpi-label">{data.proximoEvento.tipo === 'feriado' ? '🎉 Próximo feriado' : '💵 Próximo pico'}</div>
              <div className="kpi-value" style={{ fontSize: 18, color: data.proximoEvento.tipo === 'feriado' ? '#AFA9EC' : '#10b981' }}>{data.proximoEvento.label}</div>
              <div className="kpi-sub">en {data.diasHastaEvento} días · pautar antes</div>
            </div>
          )}
        </div>
      )}

      {data.topRecurrentes.length > 0 && (
        <div className="card">
          <div className="card-title">Top clientes</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Por gasto acumulado · Toca un nombre en Ventas para ver su perfil completo.</div>
          {data.topRecurrentes.map((c, idx) => (
            <div className="list-item" key={c.clave}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: idx === 0 ? 'var(--cyan)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: idx === 0 ? '#000' : 'var(--muted)', flexShrink: 0 }}>{idx + 1}</span>
                <div>
                  <div className="list-item-name">{c.nombre}</div>
                  <div className="list-item-sub">{c.pedidos} pedidos</div>
                </div>
              </div>
              <div className="list-item-right">
                <div className="list-item-value" style={{ color: idx === 0 ? 'var(--green)' : 'var(--text)' }}>{formatCLP(c.gastado)}</div>
                {c.pedidos >= 3 && <div style={{ fontSize: 10, color: '#f59e0b' }}>⭐ VIP</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <RecetasComparativo topVolumen={ventas.topRecetas} topGanancia={ventas.topPorGanancia} todasVentas={ventas.todasVentas} costoPorReceta={ventas.costoPorReceta} />

      <CaminoColapsable />
    </div>
  )
}
