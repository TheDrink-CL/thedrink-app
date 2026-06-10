import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

// ─────────────────────────────────────────────────────────────────────────────
// REACTIVAR — gestión de clientes de 1 compra (la palanca barata del Panel).
// Flujo: pendiente → contactado (toque 1) → contactado_2 (toque 2) → frío.
// 'excluido' saca al cliente de esta lista Y de las estadísticas del Panel.
// Política de delivery vigente: GRATIS con 2+ tragos (no se cobra, se usa
// como gancho de venta). Los mensajes la reflejan.
// ─────────────────────────────────────────────────────────────────────────────

const VENTANA_ORO_MIN = 14
const VENTANA_ORO_MAX = 35

function normalizarTelefono(t) {
  if (!t) return null
  let d = String(t).replace(/\D/g, '')
  if (d.startsWith('569') && d.length === 11) return d
  if (d.startsWith('9') && d.length === 9) return '56' + d
  if (d.startsWith('56') && d.length >= 11) return d
  return d.length >= 9 ? d : null
}

function mensajeToque1(nombre, receta) {
  const queTal = receta ? `¿Qué tal estuvo el ${receta}?` : '¿Qué tal estuvieron los tragos?'
  return `¡Hola ${nombre}! Soy Ro de The Drink 🍸 ${queTal} Te escribo porque este finde ando con reparto por tu zona — y acuérdate que con 2 tragos el delivery va gratis 🛵 ¿Te dejo algo el viernes?`
}

function mensajeToque2(nombre) {
  return `¡Hola ${nombre}! Ro de The Drink de nuevo 🍸 Tenemos novedades en la carta y sigue el delivery gratis desde 2 tragos. Si quieres armar el finde, avísame nomás 🙌`
}

function diasDesde(fechaISO) {
  if (!fechaISO) return null
  const [y, m, d] = fechaISO.split('-').map(Number)
  return Math.round((new Date() - new Date(y, m - 1, d)) / 86400000)
}

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function FilaCliente({ c, onEstado }) {
  const enVentana = c.dias >= VENTANA_ORO_MIN && c.dias <= VENTANA_ORO_MAX
  const esToque2 = c.estado === 'contactado'
  const tel = normalizarTelefono(c.telefono)
  const msg = esToque2 ? mensajeToque2(c.nombre) : mensajeToque1(c.nombre, c.ultimaReceta)
  const diasContacto = c.fecha_contacto ? diasDesde(c.fecha_contacto) : null

  const handleWhatsApp = async () => {
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank')
    await onEstado(c, esToque2 ? 'contactado_2' : 'contactado', true)
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{c.nombre}</span>
            {enVentana && !c.estado && (
              <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>
                🔥 ventana de oro
              </span>
            )}
            {esToque2 && (
              <span style={{ fontSize: 10, background: 'rgba(0,200,200,0.12)', color: 'var(--cyan)', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>
                2do toque{diasContacto != null ? ` · contactado hace ${diasContacto}d` : ''}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            hace {c.dias} días · {c.ultimaReceta || 'sin detalle'} · {formatCLP(c.totalGastado)}
            {!tel && <span style={{ color: 'var(--pink)' }}> · sin teléfono</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {tel ? (
            <button onClick={handleWhatsApp} style={{
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)',
              borderRadius: 9, color: 'var(--green)', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, padding: '7px 12px',
            }}>
              💬 WhatsApp
            </button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--muted)', padding: '7px 4px' }}>agrega tel. en Clientes</span>
          )}
          <button onClick={() => onEstado(c, 'frio')} title="Marcar frío" style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
            color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '7px 9px',
          }}>❄</button>
          <button onClick={() => onEstado(c, 'excluido')} title="Excluir de la lista y de las estadísticas" style={{
            background: 'none', border: '1px solid rgba(196,0,90,0.25)', borderRadius: 9,
            color: 'var(--pink)', cursor: 'pointer', fontSize: 12, padding: '7px 9px',
          }}>✕</button>
        </div>
      </div>
    </div>
  )
}

export default function Reactivar() {
  const [lista, setLista] = useState([])
  const [frios, setFrios] = useState([])
  const [excluidos, setExcluidos] = useState([])
  const [verFrios, setVerFrios] = useState(false)
  const [verExcluidos, setVerExcluidos] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [toast, setToast] = useState('')
  const [confirmarExcluir, setConfirmarExcluir] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: ords }, { data: vts }, { data: clts }] = await Promise.all([
      supabase.from('ordenes').select('id, fecha, cliente_id, cliente_nombre, cliente_telefono'),
      supabase.from('ventas').select('orden_id, receta_nombre, ingreso_total, litros, precio_venta'),
      supabase.from('clientes').select('id, nombre, telefono, estado_contacto, fecha_contacto'),
    ])
    const clientesMap = {}
    ;(clts || []).forEach(c => { clientesMap[c.id] = c })

    const porCliente = {}
    ;(ords || []).forEach(o => {
      if (!o.cliente_id) return
      if (!porCliente[o.cliente_id]) {
        porCliente[o.cliente_id] = { ordenes: [], nombre: o.cliente_nombre, telefono: o.cliente_telefono }
      }
      const pc = porCliente[o.cliente_id]
      pc.ordenes.push(o)
      if (o.cliente_telefono) pc.telefono = o.cliente_telefono
    })

    const ventasPorOrden = {}
    ;(vts || []).forEach(v => {
      if (!v.orden_id) return
      if (!ventasPorOrden[v.orden_id]) ventasPorOrden[v.orden_id] = { recetas: [], total: 0 }
      ventasPorOrden[v.orden_id].recetas.push(v.receta_nombre)
      ventasPorOrden[v.orden_id].total += parseFloat(v.ingreso_total) || (v.litros * v.precio_venta) || 0
    })

    const unaCompra = []
    const friosArr = []
    const excluidosArr = []
    Object.entries(porCliente).forEach(([id, pc]) => {
      const ficha = clientesMap[id] || {}
      const estado = ficha.estado_contacto || null
      const ordenadas = pc.ordenes.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      const ultima = ordenadas[0]
      const vo = ventasPorOrden[ultima.id] || { recetas: [], total: 0 }
      const totalGastado = pc.ordenes.reduce((s, o) => s + ((ventasPorOrden[o.id] || {}).total || 0), 0)
      const item = {
        cliente_id: id,
        nombre: ficha.nombre || pc.nombre || 'Sin nombre',
        telefono: ficha.telefono || pc.telefono,
        nOrdenes: pc.ordenes.length,
        dias: diasDesde(ultima.fecha),
        ultimaReceta: vo.recetas[0] || null,
        totalGastado,
        estado,
        fecha_contacto: ficha.fecha_contacto,
        tieneFicha: !!clientesMap[id],
      }
      if (estado === 'excluido') { excluidosArr.push(item); return }
      if (estado === 'frio') { friosArr.push(item); return }
      if (pc.ordenes.length === 1) unaCompra.push(item)
    })

    // Orden: ventana de oro primero, luego por recencia (más reciente arriba)
    unaCompra.sort((a, b) => {
      const va = a.dias >= VENTANA_ORO_MIN && a.dias <= VENTANA_ORO_MAX ? 0 : 1
      const vb = b.dias >= VENTANA_ORO_MIN && b.dias <= VENTANA_ORO_MAX ? 0 : 1
      return va !== vb ? va - vb : a.dias - b.dias
    })
    setLista(unaCompra)
    setFrios(friosArr)
    setExcluidos(excluidosArr)
    setCargando(false)
  }

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function cambiarEstado(c, estado, directo = false) {
    if (estado === 'excluido' && !directo) {
      setConfirmarExcluir(c)
      return
    }
    setConfirmarExcluir(null)
    const payload = {
      estado_contacto: estado === 'pendiente' ? null : estado,
      fecha_contacto: estado.startsWith('contactado') ? hoyISO() : c.fecha_contacto,
    }
    if (c.tieneFicha) {
      await supabase.from('clientes').update(payload).eq('id', c.cliente_id)
    } else {
      await supabase.from('clientes').insert({ id: c.cliente_id, nombre: c.nombre, telefono: c.telefono || null, ...payload })
    }
    const msgs = {
      contactado: `Mensaje abierto — ${c.nombre} marcado como contactado`,
      contactado_2: `2do toque registrado para ${c.nombre}`,
      frio: `${c.nombre} marcado frío`,
      excluido: `${c.nombre} excluido de las estadísticas`,
      pendiente: `${c.nombre} de vuelta en la lista`,
    }
    showToast(msgs[estado] || 'Estado actualizado')
    load()
  }

  const pendientes = lista.filter(c => !c.estado)
  const contactados = lista.filter(c => c.estado === 'contactado')
  const agotados = lista.filter(c => c.estado === 'contactado_2')

  if (cargando) return <div className="loading">Cargando...</div>

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {confirmarExcluir && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 340, width: '100%' }}>
            <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 8, fontWeight: 700 }}>¿Excluir a {confirmarExcluir.nombre}?</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Sale de esta lista Y de todas las estadísticas del Panel (clientes, recompra, ingresos por canal). Reversible desde la sección Excluidos.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setConfirmarExcluir(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" style={{ flex: 1, background: 'var(--pink)' }} onClick={() => cambiarEstado(confirmarExcluir, 'excluido', true)}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-title">Reactivar</div>

      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
        Clientes que compraron <b style={{ color: 'var(--text-strong)' }}>una sola vez</b>. El botón abre WhatsApp con el mensaje listo
        (gancho: delivery gratis desde 2 tragos) y los marca como contactados. Regla: máximo 2 toques, después quedan fríos.
      </div>

      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card">
          <div className="kpi-label">Por contactar</div>
          <div className="kpi-value" style={{ fontSize: 24, color: '#f59e0b' }}>{pendientes.length}</div>
          <div className="kpi-sub">{pendientes.filter(c => c.dias >= VENTANA_ORO_MIN && c.dias <= VENTANA_ORO_MAX).length} en ventana de oro (14-35 días)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Esperando respuesta</div>
          <div className="kpi-value" style={{ fontSize: 24, color: 'var(--cyan)' }}>{contactados.length + agotados.length}</div>
          <div className="kpi-sub">{agotados.length} con 2 toques hechos</div>
        </div>
      </div>

      {pendientes.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">Por contactar — 1er toque</div>
          {pendientes.map(c => <FilaCliente key={c.cliente_id} c={c} onEstado={cambiarEstado} />)}
        </div>
      )}

      {contactados.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">Contactados — listos para 2do toque (espera ~3 semanas)</div>
          {contactados.map(c => <FilaCliente key={c.cliente_id} c={c} onEstado={cambiarEstado} />)}
        </div>
      )}

      {agotados.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">2 toques hechos — si no responden, márcalos fríos</div>
          {agotados.map(c => <FilaCliente key={c.cliente_id} c={c} onEstado={cambiarEstado} />)}
        </div>
      )}

      {pendientes.length === 0 && contactados.length === 0 && agotados.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 28, marginBottom: 12, color: 'var(--muted)', fontSize: 13 }}>
          Sin clientes de 1 compra pendientes — la lista está al día 🎉
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setVerFrios(v => !v)} style={{ flex: 1, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '9px 0' }}>
          ❄ Fríos ({frios.length}) {verFrios ? '▲' : '▼'}
        </button>
        <button onClick={() => setVerExcluidos(v => !v)} style={{ flex: 1, background: 'none', border: '1px solid rgba(196,0,90,0.2)', borderRadius: 10, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '9px 0' }}>
          ✕ Excluidos ({excluidos.length}) {verExcluidos ? '▲' : '▼'}
        </button>
      </div>

      {verFrios && frios.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">Fríos — solo difusión mensual, no insistir</div>
          {frios.map(c => (
            <div key={c.cliente_id} className="list-item">
              <div>
                <div className="list-item-name" style={{ fontSize: 13 }}>{c.nombre}</div>
                <div className="list-item-sub">hace {c.dias} días · {formatCLP(c.totalGastado)}</div>
              </div>
              <button onClick={() => cambiarEstado(c, 'pendiente', true)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--cyan)', cursor: 'pointer', fontSize: 11, padding: '5px 10px' }}>
                reactivar
              </button>
            </div>
          ))}
        </div>
      )}

      {verExcluidos && excluidos.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title">Excluidos de las estadísticas</div>
          {excluidos.map(c => (
            <div key={c.cliente_id} className="list-item">
              <div>
                <div className="list-item-name" style={{ fontSize: 13 }}>{c.nombre}</div>
                <div className="list-item-sub">{c.nOrdenes} órdenes · {formatCLP(c.totalGastado)} fuera del Panel</div>
              </div>
              <button onClick={() => cambiarEstado(c, 'frio', true)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 11, padding: '5px 10px' }}>
                restaurar
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '4px 0 16px', lineHeight: 1.6 }}>
        Mejor día para contactar: jueves o viernes 18-20h (tu venta se concentra el fin de semana).<br />
        Los excluidos no cuentan en clientes, recompra ni ingreso del Panel.
      </div>
    </div>
  )
}
