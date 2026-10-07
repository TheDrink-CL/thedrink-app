// ─── Inicio: la operación del día ────────────────────────────────────────────
//
// Hasta el 6-oct Inicio era un tablero financiero (rentabilidad, patrimonio,
// rotación 48×) que no sirve en el turno. Ahora responde lo que importa con
// el celular en la mano: ¿qué quedó sin cerrar?, ¿cómo va hoy y la semana?,
// ¿qué hay que comprar? Lo financiero se movió a Panel
// (components/ResumenFinanciero.js), con las mismas funciones de lib/metricas.
//
// "Sin cerrar" es lo que, si se deja para después, descuadra el inventario y
// la caja: comandas sin venta y pedidos por app de delivery sin su costo.
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import { fuenteDeCompra, enAlertaDeStock, stockNegativo } from '../lib/inventario'
import { cargarComandasAbiertas, haceCuanto } from '../lib/comandasCierre'
import { ingresoSemana, montoVenta } from '../lib/metricas'

const META_SEMANAL_DEFAULT = 250000
// Una comanda más vieja que esto ya no se está preparando: está sin cerrar.
const HORAS_SIN_CERRAR = 2
// Envíos por app que tienen costo y hay que anotarlo.
const ENVIOS_CON_COSTO = ['uber', 'didi', 'motoboy', 'otro']
const NOMBRE_ENVIO = { uber: 'Uber', didi: 'DiDi', motoboy: 'Motoboy', otro: 'envío' }

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diaMes = (f) => {
  const [, m, d] = f.split('-')
  return `${Number(d)}-${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1]}`
}

// Contexto del día: feriados y zonas de pago (venía de Inicio, se mantiene).
const FERIADOS = {
  '2026-05-21': 'Glorias Navales', '2026-06-29': 'San Pedro y San Pablo', '2026-07-16': 'Virgen del Carmen',
  '2026-09-18': 'Fiestas Patrias', '2026-09-19': 'Glorias del Ejército', '2026-12-25': 'Navidad',
}
function contextoDelDia(hoy) {
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1)
  const dia = hoy.getDate()
  if (FERIADOS[iso(hoy)]) return { msg: `🎉 Hoy es ${FERIADOS[iso(hoy)]}, feriado. ¿Hay stock para un día fuerte?`, color: '#AFA9EC', bg: 'rgba(127,119,221,0.12)' }
  if (FERIADOS[iso(manana)]) return { msg: `🎉 Mañana es ${FERIADOS[iso(manana)]}: buen día para activar Instagram.`, color: '#AFA9EC', bg: 'rgba(127,119,221,0.08)' }
  if (dia >= 28 || dia <= 5) return { msg: `💵 Zona de sueldos (día ${dia}): el inicio de mes vende más. Activa.`, color: '#10b981', bg: 'rgba(16,185,129,0.08)' }
  if (dia >= 13 && dia <= 17) return { msg: `💵 Quincena (día ${dia}): segundo peak del mes.`, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' }
  return null
}

export default function Dashboard({ onIr, onRegistrarVenta, onEditarOrden }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [metaSemanal, setMetaSemanal] = useState(() => {
    try { return parseInt(localStorage.getItem('meta_semanal')) || META_SEMANAL_DEFAULT } catch (e) { return META_SEMANAL_DEFAULT }
  })
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [metaInput, setMetaInput] = useState('')

  useEffect(() => {
    let vivo = true
    async function load() {
      const hoy = new Date()
      // Desde lo más antiguo que se necesita: el lunes de la semana pasada, o
      // el día 1 del mes (transferencias), o 14 días atrás (sin cerrar).
      const hace14 = new Date(hoy); hace14.setDate(hoy.getDate() - 14)
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      const lunesAnt = new Date(hoy); lunesAnt.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7) - 7)
      const desde = iso(new Date(Math.min(hace14, inicioMes, lunesAnt)))
      const [abiertas, { data: ordenes, error: e1 }, { data: ventas, error: e2 }, { data: insumos, error: e3 }, { data: cfg }] = await Promise.all([
        cargarComandasAbiertas(),
        supabase.from('ordenes').select('id, fecha, hora, cliente_nombre, medio_pago, delivery, delivery_tipo').gte('fecha', desde),
        supabase.from('ventas').select('fecha, litros, precio_venta, ingreso_total, orden_id').gte('fecha', desde),
        // '*': `activo` (temporada) puede no existir todavía.
        supabase.from('insumos').select('*').order('nombre'),
        supabase.from('config').select('clave, valor').eq('clave', 'limite_transferencias'),
      ])
      if (!vivo) return
      const err = e1 || e2 || e3
      if (err) { setError(err.message); return }

      const ahora = Date.now()
      const comandas = abiertas.filter(c => (ahora - new Date(c.created_at)) / 3600000 >= HORAS_SIN_CERRAR)
      const desde14 = iso(hace14)
      const sinCosto = (ordenes || [])
        .filter(o => o.fecha >= desde14 && ENVIOS_CON_COSTO.includes(o.delivery_tipo) && !(parseFloat(o.delivery) > 0))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

      const hoyISO = iso(hoy)
      const ventasHoy = (ventas || []).filter(v => v.fecha === hoyISO)
      const pedidosHoy = new Set(ventasHoy.map(v => v.orden_id).filter(Boolean)).size
      const mesISO = iso(inicioMes)

      setD({
        comandas, sinCosto,
        hoy: { pedidos: pedidosHoy, monto: ventasHoy.reduce((s, v) => s + montoVenta(v), 0) },
        semana: ingresoSemana(ventas || [], hoy),
        comprar: (insumos || []).filter(enAlertaDeStock).map(i => ({ ...i, fuente: fuenteDeCompra(i, insumos) })),
        negativos: (insumos || []).filter(i => !i.rinde_insumo && stockNegativo(i)).length,
        transferencias: (ordenes || []).filter(o => o.medio_pago === 'transferencia' && o.fecha >= mesISO).length,
        limiteTransferencias: parseInt(cfg?.[0]?.valor) || 50,
        contexto: contextoDelDia(hoy),
      })
    }
    load().catch(e => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [])

  if (error) return (
    <div className="page">
      <div className="page-title">The Drink</div>
      <div className="card" style={{ borderColor: 'rgba(196,0,90,0.4)' }}>
        <div className="card-title" style={{ color: 'var(--pink)' }}>Error al cargar</div>
        <div style={{ fontSize: 13 }}>{error}</div>
      </div>
    </div>
  )
  if (!d) return <div className="loading">Cargando...</div>

  const pendientes = d.comandas.length + d.sinCosto.length
  const sem = d.semana
  const pctMeta = metaSemanal > 0 ? Math.min(1, sem.actual / metaSemanal) : 0
  const colorMeta = pctMeta >= 1 ? 'var(--green)' : pctMeta >= 0.7 ? 'var(--cyan)' : pctMeta >= 0.4 ? '#f59e0b' : 'var(--pink)'
  const pctXfer = d.transferencias / d.limiteTransferencias
  const colorXfer = pctXfer >= 1 ? 'var(--pink)' : pctXfer >= 0.8 ? '#f59e0b' : 'var(--cyan)'

  return (
    <div className="page">
      <div className="page-title">The Drink</div>

      {d.contexto && (
        <div style={{ background: d.contexto.bg, border: `1px solid ${d.contexto.color}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: d.contexto.color, lineHeight: 1.6, fontWeight: 600 }}>
          {d.contexto.msg}
        </div>
      )}

      {/* ── Sin cerrar ─────────────────────────────────────────────────── */}
      <div className="card" style={{ border: `1px solid ${pendientes ? 'rgba(245,158,11,0.45)' : 'rgba(34,197,94,0.3)'}` }}>
        <div className="card-title" style={{ color: pendientes ? '#f59e0b' : 'var(--green)' }}>
          {pendientes ? `Sin cerrar (${pendientes})` : 'Todo cerrado ✓'}
        </div>
        {!pendientes && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>No hay comandas sin venta ni envíos sin costo.</div>
        )}
        {d.comandas.map(c => (
          <div className="list-item" key={'c' + c.id} style={{ gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div className="list-item-name">Comanda de {c.cliente_nombre || 'sin nombre'}</div>
              <div className="list-item-sub">
                {haceCuanto(c.created_at)} · {(c.items || []).map(it => `${it.cantidad || 1}× ${it.receta_nombre || it.nombre}`).join(', ')}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => onRegistrarVenta && onRegistrarVenta(c)}>
              Registrar venta
            </button>
          </div>
        ))}
        {d.sinCosto.map(o => (
          <div className="list-item" key={'o' + o.id} style={{ gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div className="list-item-name">{o.cliente_nombre || 'Pedido'} · {diaMes(o.fecha)}</div>
              <div className="list-item-sub">{NOMBRE_ENVIO[o.delivery_tipo]} sin costo anotado: la caja y el margen no lo ven</div>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={() => onEditarOrden && onEditarOrden(o.id)}>
              Completar
            </button>
          </div>
        ))}
      </div>

      {/* ── Hoy y la semana ────────────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Hoy</div>
          <div className="kpi-value cyan">{formatCLP(d.hoy.monto)}</div>
          <div className="kpi-sub">{d.hoy.pedidos} pedido{d.hoy.pedidos === 1 ? '' : 's'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Esta semana</div>
          <div className="kpi-value">{formatCLP(sem.actual)}</div>
          <div className="kpi-sub">desde el lunes {diaMes(sem.desde)}</div>
        </div>
      </div>

      <div style={{ background: 'rgba(0,180,180,0.05)', border: '1px solid rgba(0,180,180,0.18)', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Meta semana</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: colorMeta }}>{Math.round(pctMeta * 100)}%</div>
            {editandoMeta ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" value={metaInput} onChange={e => setMetaInput(e.target.value)}
                  style={{ width: 90, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '3px 8px', fontSize: 12 }} />
                <button onClick={() => {
                  const v = parseInt(metaInput)
                  if (v > 0) { setMetaSemanal(v); try { localStorage.setItem('meta_semanal', v) } catch (e) {} }
                  setEditandoMeta(false)
                }} style={{ background: 'var(--cyan)', border: 'none', borderRadius: 6, color: '#000', padding: '3px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>OK</button>
              </div>
            ) : (
              <button onClick={() => { setMetaInput(String(metaSemanal)); setEditandoMeta(true) }}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>
                {formatCLP(metaSemanal)}
              </button>
            )}
          </div>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${pctMeta * 100}%`, background: colorMeta, borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          {pctMeta >= 1 ? `Meta superada por ${formatCLP(sem.actual - metaSemanal)}` : `Faltan ${formatCLP(metaSemanal - sem.actual)}`}
          {' · '}a esta altura la semana pasada llevabas {formatCLP(sem.pasadaALaFecha)} (cerró en {formatCLP(sem.pasadaCompleta)})
        </div>
      </div>

      {/* ── Qué comprar ────────────────────────────────────────────────── */}
      {(d.comprar.length > 0 || d.negativos > 0) && (
        <div className="card" style={{ border: '1px solid rgba(196,0,90,0.35)' }}>
          <div className="card-title" style={{ color: 'var(--pink)' }}>Qué comprar</div>
          {d.comprar.map(i => {
            const falta = i.fuente ? Math.ceil((i.stock_minimo - i.stock_actual) / i.fuente.factor) : null
            return (
              <div key={i.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--text-strong)', fontWeight: 600 }}>
                  {i.fuente ? i.fuente.nombre : i.nombre}
                  {i.fuente && <span style={{ fontSize: 11, color: 'var(--cyan)', marginLeft: 6 }}>(para {i.nombre.toLowerCase()})</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--pink)', textAlign: 'right', flexShrink: 0 }}>
                  {i.fuente ? `≥ ${falta} ${i.fuente.unidad}` : `${Math.round(i.stock_actual * 10) / 10} / mín ${i.stock_minimo} ${i.unidad}`}
                </div>
              </div>
            )
          })}
          {d.negativos > 0 && (
            <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => onIr && onIr('stock')}>
              {d.negativos} insumo{d.negativos === 1 ? '' : 's'} en negativo: ver en Stock
            </button>
          )}
        </div>
      )}

      {/* ── Transferencias del mes (límite del banco) ─────────────────── */}
      <div style={{ border: `1px solid ${colorXfer}55`, borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: colorXfer, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Transferencias del mes</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: colorXfer }}>
            {d.transferencias}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>/{d.limiteTransferencias}</span>
          </div>
        </div>
        {pctXfer >= 0.8 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {pctXfer >= 1 ? 'Alcanzaste el límite: no registres más transferencias este mes.' : `Quedan ${d.limiteTransferencias - d.transferencias}.`}
          </div>
        )}
      </div>

      <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => onIr && onIr('indicadores')}>
        Finanzas, clientes y recetas → Panel
      </button>
    </div>
  )
}
