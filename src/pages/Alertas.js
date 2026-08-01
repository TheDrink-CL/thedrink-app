import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { generarAlertas } from '../lib/alertas'

const SEV_STYLE = {
  alta:  { color: 'var(--pink)',   bg: 'rgba(196,0,90,0.10)',  borde: 'rgba(196,0,90,0.4)',  label: 'Alta' },
  media: { color: '#f59e0b',       bg: 'rgba(245,158,11,0.10)', borde: 'rgba(245,158,11,0.4)', label: 'Media' },
  baja:  { color: 'var(--cyan)',   bg: 'rgba(0,180,180,0.08)',  borde: 'rgba(0,180,180,0.35)', label: 'Baja' },
}
const TIPO_LABEL = {
  cliente_frio:   'Cliente',
  stock_bajo:     'Stock',
  dia_historico:  'Calendario',
  sin_pautar:     'Marketing',
  otro:           'Otro',
}

export default function Alertas() {
  const [alertas, setAlertas] = useState([])
  const [leidas, setLeidas] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [mostrarLeidas, setMostrarLeidas] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [errorCarga, setErrorCarga] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const results = await Promise.all([
        supabase.from('ventas').select('fecha, litros, precio_venta, receta_nombre'),
        supabase.from('ordenes').select('fecha, cliente_nombre'),
        supabase.from('clientes').select('nombre, tag, estado_contacto'),
        supabase.from('insumos').select('nombre, stock_actual, stock_minimo, unidad'),
        supabase.from('caja').select('fecha, monto, categoria, tipo').eq('tipo', 'salida'),
        supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad'),
        supabase.from('config').select('*'),
        supabase.from('alertas_leidas').select('clave'),
      ])
      const errores = results.map((r, i) => r.error ? { idx: i, msg: r.error.message } : null).filter(Boolean)
      if (errores.length > 0) {
        const tablas = ['ventas', 'ordenes', 'clientes', 'insumos', 'caja', 'receta_ingredientes', 'config', 'alertas_leidas']
        throw new Error(errores.map(e => `${tablas[e.idx]}: ${e.msg}`).join(' · '))
      }
      const [
        { data: vts }, { data: ords }, { data: cls },
        { data: ins }, { data: cja }, { data: recIng }, { data: cfg },
        { data: leidasArr },
      ] = results

      const cfgMap = {}
      ;(cfg || []).forEach(c => { cfgMap[c.clave] = c.valor })

      const generadas = generarAlertas({
        ventas: vts || [],
        ordenes: ords || [],
        clientes: cls || [],
        insumos: ins || [],
        gastosPub: (cja || []).filter(m => m.categoria === 'Publicidad'),
        recetaIng: recIng || [],
        config: cfgMap,
      })

      setAlertas(generadas)
      setLeidas(new Set((leidasArr || []).map(l => l.clave)))
    } catch (e) {
      console.error('Alertas - error al cargar:', e)
      setErrorCarga(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const marcarLeida = async (alerta) => {
    await supabase.from('alertas_leidas').upsert({
      clave: alerta.clave,
      tipo: alerta.tipo,
    }, { onConflict: 'clave' })
    setLeidas(prev => new Set([...prev, alerta.clave]))
  }

  const desmarcar = async (clave) => {
    await supabase.from('alertas_leidas').delete().eq('clave', clave)
    setLeidas(prev => {
      const n = new Set(prev)
      n.delete(clave)
      return n
    })
  }

  const marcarTodasLeidas = async () => {
    const noLeidas = alertas.filter(a => !leidas.has(a.clave))
    if (noLeidas.length === 0) return
    await supabase.from('alertas_leidas').upsert(
      noLeidas.map(a => ({ clave: a.clave, tipo: a.tipo })),
      { onConflict: 'clave' }
    )
    setLeidas(prev => new Set([...prev, ...noLeidas.map(a => a.clave)]))
  }

  // Filtrar
  let visibles = alertas
  if (!mostrarLeidas) visibles = visibles.filter(a => !leidas.has(a.clave))
  if (filtroTipo !== 'todos') visibles = visibles.filter(a => a.tipo === filtroTipo)

  // Conteos por tipo (sobre no-leídas para guiar al usuario)
  const noLeidas = alertas.filter(a => !leidas.has(a.clave))
  const conteoPorTipo = {}
  noLeidas.forEach(a => { conteoPorTipo[a.tipo] = (conteoPorTipo[a.tipo] || 0) + 1 })

  if (loading) return <div className="loading">Cargando alertas...</div>
  if (errorCarga) {
    return (
      <div className="page">
        <div className="page-title">Alertas</div>
        <div className="card" style={{ borderColor: 'rgba(196,0,90,0.4)' }}>
          <div className="card-title" style={{ color: 'var(--pink)' }}>Error al cargar</div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
            {errorCarga}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div className="page-title" style={{ marginBottom:0 }}>Alertas</div>
        {noLeidas.length > 0 && (
          <button onClick={marcarTodasLeidas}
            style={{ background:'rgba(0,180,180,0.1)', border:'1px solid var(--cyan-dim)', borderRadius:8, color:'var(--cyan)', cursor:'pointer', fontSize:11, padding:'5px 10px' }}>
            Marcar todas leídas
          </button>
        )}
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
        {noLeidas.length === 0
          ? 'Sin alertas pendientes. Todo bajo control.'
          : `${noLeidas.length} alerta${noLeidas.length !== 1 ? 's' : ''} pendiente${noLeidas.length !== 1 ? 's' : ''}.`}
      </div>

      {/* Filtros por tipo */}
      {alertas.length > 0 && (
        <div className="chip-row">
          <button className={`chip ${filtroTipo === 'todos' ? 'selected' : ''}`}
            onClick={() => setFiltroTipo('todos')}>
            Todas ({noLeidas.length})
          </button>
          {Object.entries(TIPO_LABEL).map(([tipo, label]) => (
            conteoPorTipo[tipo] ? (
              <button key={tipo}
                className={`chip ${filtroTipo === tipo ? 'selected' : ''}`}
                onClick={() => setFiltroTipo(t => t === tipo ? 'todos' : tipo)}>
                {label} ({conteoPorTipo[tipo]})
              </button>
            ) : null
          ))}
        </div>
      )}

      <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, fontSize:12, color:'var(--muted)', cursor:'pointer' }}>
        <input type="checkbox" checked={mostrarLeidas} onChange={e => setMostrarLeidas(e.target.checked)}
          style={{ accentColor:'var(--cyan)', width:14, height:14 }} />
        Mostrar también alertas leídas ({leidas.size})
      </label>

      {/* Lista */}
      {visibles.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:36, color:'var(--muted)' }}>
          {alertas.length === 0
            ? 'No hay alertas activas en este momento.'
            : 'Sin alertas en este filtro.'}
        </div>
      ) : (
        visibles.map(a => {
          const sev = SEV_STYLE[a.severidad] || SEV_STYLE.baja
          const yaLeida = leidas.has(a.clave)
          return (
            <div key={a.clave} className="card" style={{
              borderLeft: `4px solid ${sev.color}`,
              background: yaLeida ? 'rgba(255,255,255,0.02)' : sev.bg,
              opacity: yaLeida ? 0.6 : 1,
              padding: '12px 14px',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                <div style={{ display:'flex', gap:10, flex:1, minWidth:0 }}>
                  <div style={{ fontSize:20, flexShrink:0 }}>{a.icono}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)', marginBottom:3 }}>
                      {a.titulo}
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
                      {a.detalle}
                    </div>
                    <div style={{ display:'flex', gap:6, marginTop:6 }}>
                      <span style={{
                        fontSize:10, fontWeight:700, color:sev.color,
                        background:sev.bg, border:`1px solid ${sev.borde}`,
                        borderRadius:8, padding:'1px 7px',
                        textTransform:'uppercase', letterSpacing:0.5,
                      }}>{sev.label}</span>
                      <span style={{
                        fontSize:10, fontWeight:600, color:'var(--muted)',
                        background:'rgba(255,255,255,0.04)',
                        borderRadius:8, padding:'1px 7px',
                      }}>{TIPO_LABEL[a.tipo] || a.tipo}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => yaLeida ? desmarcar(a.clave) : marcarLeida(a)}
                  style={{
                    background:'none',
                    border:`1px solid ${yaLeida ? 'var(--muted)' : sev.color}`,
                    borderRadius:8,
                    color: yaLeida ? 'var(--muted)' : sev.color,
                    cursor:'pointer', fontSize:11, padding:'4px 9px',
                    flexShrink:0, whiteSpace:'nowrap',
                  }}>
                  {yaLeida ? '↺' : '✓'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// Hook ligero para que el resto de la app sepa cuántas alertas no leídas hay
// (lo usa el badge del menú "Más" en App.js).
export function useAlertasCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancelado = false
    async function calc() {
      try {
        const results = await Promise.all([
          supabase.from('ventas').select('fecha, litros, precio_venta, receta_nombre'),
          supabase.from('ordenes').select('fecha, cliente_nombre'),
          supabase.from('clientes').select('nombre, tag, estado_contacto'),
          supabase.from('insumos').select('nombre, stock_actual, stock_minimo, unidad'),
          supabase.from('caja').select('fecha, monto, categoria, tipo').eq('tipo', 'salida'),
          supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad'),
          supabase.from('config').select('*'),
          supabase.from('alertas_leidas').select('clave'),
        ])
        // Si alguna query falló, no actualizamos el contador (falso negativo
        // peor que dejar el valor anterior).
        if (results.some(r => r.error)) return
        const [
          { data: vts }, { data: ords }, { data: cls },
          { data: ins }, { data: cja }, { data: recIng }, { data: cfg },
          { data: leidasArr },
        ] = results
        const cfgMap = {}
        ;(cfg || []).forEach(c => { cfgMap[c.clave] = c.valor })
        const alertas = generarAlertas({
          ventas: vts || [], ordenes: ords || [], clientes: cls || [],
          insumos: ins || [], gastosPub: (cja || []).filter(m => m.categoria === 'Publicidad'),
          recetaIng: recIng || [], config: cfgMap,
        })
        const leidas = new Set((leidasArr || []).map(l => l.clave))
        if (!cancelado) setCount(alertas.filter(a => !leidas.has(a.clave)).length)
      } catch (e) {
        if (!cancelado) setCount(0)
      }
    }
    calc()
    // Recalcular cada 60 segundos para que el badge se mantenga al día
    const interval = setInterval(calc, 60000)
    return () => { cancelado = true; clearInterval(interval) }
  }, [])
  return count
}
