import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Feedback anónimo que llega desde opinar.ncity.live.
// La tabla `feedback` es la única excepción anónima de la base: `anon` solo
// puede INSERTAR. Leer requiere sesión, así que esta pantalla funciona con el
// cliente de siempre y no necesita nada especial. Ver CLAUDE.md.

const PUNTAJE = {
  3: { label: 'Bien',      glifo: ':)', color: 'var(--green)', bg: 'rgba(34,197,94,0.10)',  borde: 'rgba(34,197,94,0.4)' },
  2: { label: 'Así nomás', glifo: ':|', color: '#f59e0b',      bg: 'rgba(245,158,11,0.10)', borde: 'rgba(245,158,11,0.4)' },
  1: { label: 'Mal',       glifo: ':(', color: 'var(--pink)',  bg: 'rgba(196,0,90,0.10)',   borde: 'rgba(196,0,90,0.4)' },
}

const ASPECTO_LABEL = {
  trago:  'El trago',
  envio:  'El envío',
  pedido: 'Hacer el pedido',
  precio: 'El precio',
  otro:   'Otra cosa',
}

// La tabla puede no existir todavía si no se corrió la migración. Es el error
// más probable la primera vez, y conviene decirlo con nombre y apellido en vez
// de mostrar "error al cargar" a secas.
const tablaNoExiste = (msg) =>
  /does not exist|relation .*feedback/i.test(msg || '')

function haceCuanto(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1)   return 'recién'
  if (min < 60)  return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)    return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1)   return 'ayer'
  if (d < 30)    return `hace ${d} días`
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function Opiniones() {
  const [opiniones, setOpiniones] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [faltaTabla, setFaltaTabla] = useState(false)
  const [mostrarRevisadas, setMostrarRevisadas] = useState(false)
  const [filtroAspecto, setFiltroAspecto] = useState('todos')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('id, creado_en, puntaje, aspecto, trago, comentario, origen, revisado')
        .order('creado_en', { ascending: false })
        .limit(300)
      if (error) throw new Error(error.message)
      setOpiniones(data || [])
    } catch (e) {
      console.error('Opiniones - error al cargar:', e)
      if (tablaNoExiste(e.message)) setFaltaTabla(true)
      else setErrorCarga(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const marcarRevisada = async (id, valor) => {
    // Optimista: la lista es corta y el ida y vuelta se nota.
    setOpiniones(prev => prev.map(o => o.id === id ? { ...o, revisado: valor } : o))
    const { error } = await supabase.from('feedback').update({ revisado: valor }).eq('id', id)
    if (error) {
      setOpiniones(prev => prev.map(o => o.id === id ? { ...o, revisado: !valor } : o))
      console.error('Opiniones - no se pudo marcar:', error.message)
    }
  }

  const marcarTodas = async () => {
    const ids = opiniones.filter(o => !o.revisado).map(o => o.id)
    if (ids.length === 0) return
    setOpiniones(prev => prev.map(o => ({ ...o, revisado: true })))
    const { error } = await supabase.from('feedback').update({ revisado: true }).in('id', ids)
    if (error) { console.error(error.message); load() }
  }

  const pendientes = opiniones.filter(o => !o.revisado)

  // Termómetro de los últimos 30 días. No es una métrica de negocio: con pocas
  // respuestas el porcentaje se mueve solo. Está para ver la tendencia, no para
  // tomar decisiones sobre 4 opiniones.
  const desde = Date.now() - 30 * 24 * 3600 * 1000
  const mes = opiniones.filter(o => new Date(o.creado_en).getTime() >= desde)
  const cuenta = { 3: 0, 2: 0, 1: 0 }
  mes.forEach(o => { cuenta[o.puntaje] = (cuenta[o.puntaje] || 0) + 1 })
  const pct = (n) => mes.length ? Math.round((n / mes.length) * 100) : 0

  const conteoAspecto = {}
  pendientes.forEach(o => {
    const k = o.aspecto || 'otro'
    conteoAspecto[k] = (conteoAspecto[k] || 0) + 1
  })

  let visibles = opiniones
  if (!mostrarRevisadas) visibles = visibles.filter(o => !o.revisado)
  if (filtroAspecto !== 'todos') visibles = visibles.filter(o => (o.aspecto || 'otro') === filtroAspecto)

  if (loading) return <div className="loading">Cargando opiniones...</div>

  if (faltaTabla) {
    return (
      <div className="page">
        <div className="page-title">Opiniones</div>
        <div className="card">
          <div className="card-title">Falta correr la migración</div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
            La tabla <code>feedback</code> todavía no existe. Corre{' '}
            <code>supabase/migrations/20260809_feedback_anonimo.sql</code> en el
            SQL Editor y vuelve a entrar.
          </div>
        </div>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="page">
        <div className="page-title">Opiniones</div>
        <div className="card" style={{ borderColor: 'rgba(196,0,90,0.4)' }}>
          <div className="card-title" style={{ color: 'var(--pink)' }}>Error al cargar</div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{errorCarga}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div className="page-title" style={{ marginBottom:0 }}>Opiniones</div>
        {pendientes.length > 0 && (
          <button onClick={marcarTodas}
            style={{ background:'rgba(0,180,180,0.1)', border:'1px solid var(--cyan-dim)', borderRadius:8, color:'var(--cyan)', cursor:'pointer', fontSize:11, padding:'5px 10px' }}>
            Marcar todas leídas
          </button>
        )}
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
        {pendientes.length === 0
          ? 'Nada nuevo por leer.'
          : `${pendientes.length} sin leer.`}
        {' '}Llegan anónimas desde opinar.ncity.live. No hay a quién responderle.
      </div>

      {/* Termómetro del mes */}
      {mes.length > 0 && (
        <div className="card" style={{ padding:'12px 14px', marginBottom:14 }}>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>
            Últimos 30 días · {mes.length} opinión{mes.length !== 1 ? 'es' : ''}
          </div>
          <div style={{ display:'flex', height:8, borderRadius:4, overflow:'hidden', background:'rgba(255,255,255,0.05)' }}>
            {[3, 2, 1].map(p => cuenta[p] > 0 && (
              <div key={p} style={{ width:`${pct(cuenta[p])}%`, background:PUNTAJE[p].color }} />
            ))}
          </div>
          <div style={{ display:'flex', gap:14, marginTop:10, flexWrap:'wrap' }}>
            {[3, 2, 1].map(p => (
              <div key={p} style={{ fontSize:11, color:'var(--muted)' }}>
                <span style={{ color:PUNTAJE[p].color, fontWeight:700 }}>{PUNTAJE[p].label}</span>
                {' '}{pct(cuenta[p])}% <span style={{ opacity:.6 }}>({cuenta[p] || 0})</span>
              </div>
            ))}
          </div>
          {mes.length < 10 && (
            <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:9, lineHeight:1.5, opacity:.8 }}>
              Con menos de 10 respuestas el porcentaje se mueve solo. Mira los
              comentarios, no la barra.
            </div>
          )}
        </div>
      )}

      {/* Filtros por aspecto */}
      {pendientes.length > 0 && (
        <div className="chip-row">
          <button className={`chip ${filtroAspecto === 'todos' ? 'selected' : ''}`}
            onClick={() => setFiltroAspecto('todos')}>
            Todas ({pendientes.length})
          </button>
          {Object.entries(ASPECTO_LABEL).map(([k, label]) => (
            conteoAspecto[k] ? (
              <button key={k}
                className={`chip ${filtroAspecto === k ? 'selected' : ''}`}
                onClick={() => setFiltroAspecto(a => a === k ? 'todos' : k)}>
                {label} ({conteoAspecto[k]})
              </button>
            ) : null
          ))}
        </div>
      )}

      <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, fontSize:12, color:'var(--muted)', cursor:'pointer' }}>
        <input type="checkbox" checked={mostrarRevisadas} onChange={e => setMostrarRevisadas(e.target.checked)}
          style={{ accentColor:'var(--cyan)', width:14, height:14 }} />
        Mostrar también las ya leídas ({opiniones.length - pendientes.length})
      </label>

      {visibles.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:36, color:'var(--muted)', lineHeight:1.7 }}>
          {opiniones.length === 0 ? (
            <>
              Todavía no llega ninguna.<br />
              <span style={{ fontSize:12 }}>
                Si llevas días así, el problema es el canal y no el negocio:
                revisa que el QR esté pegado en la botella.
              </span>
            </>
          ) : 'Nada en este filtro.'}
        </div>
      ) : (
        visibles.map(o => {
          const p = PUNTAJE[o.puntaje] || PUNTAJE[2]
          return (
            <div key={o.id} className="card" style={{
              borderLeft: `4px solid ${p.color}`,
              background: o.revisado ? 'rgba(255,255,255,0.02)' : p.bg,
              opacity: o.revisado ? 0.6 : 1,
              padding: '12px 14px',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                <div style={{ display:'flex', gap:10, flex:1, minWidth:0 }}>
                  <div style={{ fontSize:18, fontWeight:700, color:p.color, flexShrink:0, fontFamily:'monospace' }}>
                    {p.glifo}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'baseline', marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>{p.label}</span>
                      <span style={{ fontSize:10.5, color:'var(--muted)' }}>{haceCuanto(o.creado_en)}</span>
                    </div>

                    {o.comentario ? (
                      <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.65, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                        {o.comentario}
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>
                        Sin comentario — solo marcó la cara.
                      </div>
                    )}

                    <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                      {o.aspecto && (
                        <span style={{ fontSize:10, fontWeight:700, color:p.color, background:p.bg, border:`1px solid ${p.borde}`, borderRadius:8, padding:'1px 7px' }}>
                          {ASPECTO_LABEL[o.aspecto] || o.aspecto}
                        </span>
                      )}
                      {o.trago && (
                        <span style={{ fontSize:10, fontWeight:600, color:'var(--muted)', background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'1px 7px' }}>
                          {o.trago}
                        </span>
                      )}
                      {o.origen && (
                        <span style={{ fontSize:10, fontWeight:600, color:'var(--muted)', background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'1px 7px' }}>
                          vía {o.origen}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => marcarRevisada(o.id, !o.revisado)}
                  style={{
                    background:'none',
                    border:`1px solid ${o.revisado ? 'var(--muted)' : p.color}`,
                    borderRadius:8,
                    color: o.revisado ? 'var(--muted)' : p.color,
                    cursor:'pointer', fontSize:11, padding:'4px 9px',
                    flexShrink:0, whiteSpace:'nowrap',
                  }}>
                  {o.revisado ? '↺' : '✓'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// Badge del menú "Más", mismo patrón que useAlertasCount.
// `head: true` no trae filas: solo el conteo. Es una consulta barata para
// correr cada minuto.
export function useOpinionesCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancelado = false
    async function calc() {
      const { count: n, error } = await supabase
        .from('feedback')
        .select('id', { count: 'exact', head: true })
        .eq('revisado', false)
      // Si falla (tabla aún no creada, red caída), dejamos el valor anterior:
      // un falso cero es peor que un número viejo.
      if (error || cancelado) return
      setCount(n || 0)
    }
    calc()
    const interval = setInterval(calc, 60000)
    return () => { cancelado = true; clearInterval(interval) }
  }, [])
  return count
}
