import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { linkWhatsApp, normalizarTelefono } from '../lib/whatsapp'
import Reactivar from './Reactivar'

// ─────────────────────────────────────────────────────────────────────────────
// CAMPAÑAS — mensajes de WhatsApp preparados con IA desde el PC (tablas
// `campanas` y `campana_mensajes`, migración 20260920_campanas.sql).
// Cada mensaje viene escrito para esa persona a partir de su ficha y sus
// órdenes, con el "por qué" al lado. La app no manda nada sola: el botón abre
// WhatsApp con el texto puesto y marca el mensaje como enviado; vos decidís.
// Respeta el veto de Reactivar: un cliente `no_contactar` / `excluido` sale
// sin botón, aunque la campaña lo traiga.
// Reactivar (la lista automática de clientes de 1 compra, con sus toques,
// fríos y vetos) vive acá adentro como segunda vista: mismo objetivo, un solo
// lugar en el menú.
// ─────────────────────────────────────────────────────────────────────────────

const FILTROS = [
  ['pendiente', 'Por enviar'],
  ['enviado', 'Enviados'],
  ['omitido', 'Omitidos'],
  ['todos', 'Todos'],
]

const PRIO_ORDEN = { alta: 0, media: 1, baja: 2 }

function fechaCorta(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function Mensaje({ m, vetado, onEstado, onCopiar }) {
  const link = linkWhatsApp(m.telefono, m.texto)
  const enviado = m.estado === 'enviado'
  const omitido = m.estado === 'omitido'

  // Abrir WhatsApp no es mandar: el mensaje se marca con «✓ lo mandé» aparte,
  // si no las cifras de enviados se inflan con los que se abrieron y no salieron.
  const abrir = () => { window.open(link, '_blank') }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: omitido ? 0.55 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{m.nombre}</span>
          {m.prioridad === 'alta' && (
            <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>
              prioridad
            </span>
          )}
          {enviado && (
            <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.12)', color: 'var(--green)', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>
              enviado {fechaCorta(m.enviado_en)}
            </span>
          )}
          {vetado && (
            <span style={{ fontSize: 10, background: 'rgba(196,0,90,0.12)', color: 'var(--pink)', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>
              🚫 vetado en Reactivar
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
          {m.zona ? `${m.zona} · ` : ''}{m.telefono || 'sin teléfono'}
        </span>
      </div>

      {m.por_que && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{m.por_que}</div>
      )}

      <div style={{
        marginTop: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '9px 11px',
      }}>
        {m.texto}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {!vetado && link && !omitido && (
          <button onClick={abrir} style={{
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)',
            borderRadius: 9, color: 'var(--green)', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, padding: '7px 12px',
          }}>
            💬 {enviado ? 'Abrir de nuevo' : 'WhatsApp'}
          </button>
        )}
        {!link && !vetado && (
          <span style={{ fontSize: 11, color: 'var(--muted)', padding: '7px 4px' }}>agrega tel. en Clientes</span>
        )}
        <button onClick={() => onCopiar(m.texto)} style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
          color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '7px 10px',
        }}>
          copiar
        </button>
        {!vetado && !enviado && !omitido && (
          <button onClick={() => onEstado(m, 'enviado')} style={{
            background: 'none', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 9,
            color: 'var(--green)', cursor: 'pointer', fontSize: 12, padding: '7px 10px',
          }}>
            ✓ lo mandé
          </button>
        )}
        {!enviado && !omitido && (
          <button onClick={() => onEstado(m, 'omitido')} title="No escribirle en esta campaña" style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
            color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '7px 10px',
          }}>
            omitir
          </button>
        )}
        {(enviado || omitido) && (
          <button onClick={() => onEstado(m, 'pendiente')} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
            color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '7px 10px',
          }}>
            deshacer
          </button>
        )}
      </div>
    </div>
  )
}

export default function Campanas() {
  const [campanas, setCampanas] = useState([])
  const [activa, setActiva] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [vetados, setVetados] = useState({})   // últimos 8 dígitos del teléfono o 'id:<cliente_id>' → true
  const [filtro, setFiltro] = useState('pendiente')
  const [vista, setVista] = useState('campanas') // 'campanas' | 'reactivar'
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { cargarCampanas() }, [])
  useEffect(() => { if (activa) cargarMensajes(activa.id) }, [activa])

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function cargarCampanas() {
    const [{ data, error: e }, { data: clts, error: eV }] = await Promise.all([
      supabase.from('campanas').select('*').order('creada_en', { ascending: false }),
      supabase.from('clientes').select('id, telefono, estado_contacto').in('estado_contacto', ['no_contactar', 'excluido']),
    ])
    if (e) {
      // 42P01 = la tabla no existe: falta correr la migración en el SQL Editor.
      setError(e.code === '42P01'
        ? 'Faltan las tablas de campañas. Correr supabase/migrations/20260920_campanas.sql en el SQL Editor de Supabase.'
        : `No se pudo leer campañas: ${e.message}`)
      setCargando(false)
      return
    }
    if (eV) {
      // Sin la lista de vetados no se muestra nada: mejor no escribirle a nadie
      // que escribirle a alguien que pidió no ser contactado.
      setError(`No se pudo leer la lista de vetados: ${eV.message}`)
      setCargando(false)
      return
    }
    const v = {}
    ;(clts || []).forEach(c => {
      v['id:' + c.id] = true
      const t = normalizarTelefono(c.telefono); if (t) v[t.slice(-8)] = true
    })
    setVetados(v)
    setCampanas(data || [])
    const primeraActiva = (data || []).find(c => c.estado === 'activa') || (data || [])[0] || null
    setActiva(primeraActiva)
    if (!primeraActiva) setCargando(false)
  }

  async function cargarMensajes(campanaId) {
    const { data, error: e } = await supabase.from('campana_mensajes').select('*').eq('campana_id', campanaId)
    if (e) { setError(`No se pudieron leer los mensajes: ${e.message}`); setCargando(false); return }
    const orden = (data || []).slice().sort((a, b) =>
      (PRIO_ORDEN[a.prioridad] ?? 1) - (PRIO_ORDEN[b.prioridad] ?? 1) || a.nombre.localeCompare(b.nombre))
    setMensajes(orden)
    setCargando(false)
  }

  async function cambiarEstado(m, estado) {
    const payload = { estado, enviado_en: estado === 'enviado' ? new Date().toISOString() : null }
    const { error: e } = await supabase.from('campana_mensajes').update(payload).eq('id', m.id)
    if (e) { showToast(`No se pudo guardar: ${e.message}`); return }
    setMensajes(ms => ms.map(x => x.id === m.id ? { ...x, ...payload } : x))
    showToast({ enviado: `Mensaje abierto — ${m.nombre} marcado como enviado`, omitido: `${m.nombre} omitido`, pendiente: `${m.nombre} de vuelta a "por enviar"` }[estado])
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); showToast('Texto copiado') }
    catch (_) { showToast('No se pudo copiar; seleccioná el texto a mano') }
  }

  async function cerrarCampana() {
    if (!activa) return
    const nuevo = activa.estado === 'activa' ? 'cerrada' : 'activa'
    const { error: e } = await supabase.from('campanas').update({ estado: nuevo }).eq('id', activa.id)
    if (e) { showToast(`No se pudo cambiar: ${e.message}`); return }
    setCampanas(cs => cs.map(c => c.id === activa.id ? { ...c, estado: nuevo } : c))
    setActiva(a => ({ ...a, estado: nuevo }))
    showToast(nuevo === 'cerrada' ? 'Campaña cerrada' : 'Campaña reabierta')
  }

  const selectorVista = (
    <div className="toggle-row" style={{ marginBottom: 12 }}>
      <button className={`toggle-btn ${vista === 'campanas' ? 'active-entrada' : ''}`} onClick={() => setVista('campanas')} style={{ fontSize: 12 }}>
        📣 Campañas preparadas
      </button>
      <button className={`toggle-btn ${vista === 'reactivar' ? 'active-entrada' : ''}`} onClick={() => setVista('reactivar')} style={{ fontSize: 12 }}>
        🔁 Reactivar (1 compra)
      </button>
    </div>
  )

  if (vista === 'reactivar') {
    return (
      <div>
        <div className="page" style={{ paddingBottom: 0 }}>{selectorVista}</div>
        <Reactivar />
      </div>
    )
  }

  if (cargando) return <div className="loading">Cargando...</div>

  const esVetado = (m) => {
    if (m.cliente_id && vetados['id:' + m.cliente_id]) return true
    const t = normalizarTelefono(m.telefono); return !!(t && vetados[t.slice(-8)])
  }
  const visibles = mensajes.filter(m => filtro === 'todos' || m.estado === filtro)
  const n = (estado) => mensajes.filter(m => m.estado === estado).length

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      <div className="page-title">Campañas</div>
      {selectorVista}

      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
        Mensajes escritos <b style={{ color: 'var(--text-strong)' }}>para cada persona</b> a partir de su historial. El botón abre WhatsApp con el texto
        puesto y lo marca como enviado; nada sale solo. Los vetados en Reactivar quedan sin botón.
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'rgba(196,0,90,0.35)', color: 'var(--pink)', fontSize: 13 }}>{error}</div>
      )}

      {!error && campanas.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 28, marginBottom: 12, color: 'var(--muted)', fontSize: 13 }}>
          Todavía no hay campañas. Se preparan desde el PC con Claude (publicar.js) y aparecen acá.
        </div>
      )}

      {campanas.length > 1 && (
        <div className="chip-row" style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {campanas.map(c => (
            <button key={c.id} className={`chip ${activa && activa.id === c.id ? 'selected' : ''}`}
              onClick={() => { setActiva(c); setFiltro('pendiente') }} style={{ opacity: c.estado === 'cerrada' ? 0.6 : 1 }}>
              {c.nombre}{c.estado === 'cerrada' ? ' · cerrada' : ''}
            </button>
          ))}
        </div>
      )}

      {activa && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div className="card-title" style={{ marginBottom: 4 }}>{activa.nombre}</div>
              <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{fechaCorta(activa.creada_en)}{activa.estado === 'cerrada' ? ' · cerrada' : ''}</span>
            </div>
            {activa.mensaje_base && (
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{activa.mensaje_base}</div>
            )}
            {activa.nota && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>{activa.nota}</div>
            )}
          </div>

          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <div className="kpi-card">
              <div className="kpi-label">Por enviar</div>
              <div className="kpi-value" style={{ fontSize: 24, color: '#f59e0b' }}>{n('pendiente')}</div>
              <div className="kpi-sub">{mensajes.filter(m => m.estado === 'pendiente' && m.prioridad === 'alta').length} de prioridad alta</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Enviados</div>
              <div className="kpi-value" style={{ fontSize: 24, color: 'var(--green)' }}>{n('enviado')}</div>
              <div className="kpi-sub">{n('omitido')} omitidos · {mensajes.length} en total</div>
            </div>
          </div>

          <div className="toggle-row" style={{ marginBottom: 12 }}>
            {FILTROS.map(([k, label]) => (
              <button key={k} className={`toggle-btn ${filtro === k ? 'active-entrada' : ''}`}
                onClick={() => setFiltro(k)} style={{ fontSize: 12 }}>
                {label}
              </button>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            {visibles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 13 }}>
                {filtro === 'pendiente' ? 'Todo enviado u omitido 🎉' : 'Nada en esta lista.'}
              </div>
            ) : visibles.map(m => (
              <Mensaje key={m.id} m={m} vetado={esVetado(m)} onEstado={cambiarEstado} onCopiar={copiar} />
            ))}
          </div>

          <button onClick={cerrarCampana} style={{ width: '100%', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '9px 0', marginBottom: 12 }}>
            {activa.estado === 'activa' ? 'Cerrar campaña' : 'Reabrir campaña'}
          </button>
        </>
      )}

      <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '4px 0 16px', lineHeight: 1.6 }}>
        Mejor momento: jueves o viernes 18-20h. Un mensaje por persona, con su nombre y su trago; nunca un broadcast.
      </div>
    </div>
  )
}
