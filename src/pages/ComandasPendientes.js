import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { haceCuanto } from '../lib/comandasCierre'
import { construirEsVip } from '../lib/clientesVip'

const formatCLP = n => '$' + Math.round(n).toLocaleString('es-CL')

// ─── Cronómetro ───────────────────────────────────────────────────────────────
function useTiempo(createdAt) {
  const [seg, setSeg] = useState(0)
  useEffect(() => {
    const calc = () => setSeg(Math.max(0, Math.floor((Date.now() - new Date(createdAt)) / 1000)))
    calc(); const t = setInterval(calc, 1000); return () => clearInterval(t)
  }, [createdAt])
  const mm = Math.floor(seg/60), ss = seg%60
  return { texto: `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`, minutos: mm }
}

// ─── Tarjeta de comanda ───────────────────────────────────────────────────────
function TarjetaComanda({ comanda, onConvertir, onArchivar, esVIP }) {
  const { texto, minutos } = useTiempo(comanda.created_at)
  const esListo = comanda.estado === 'listo'
  const color = esListo ? '#00b4b4' : minutos < 5 ? '#48c78e' : minutos < 10 ? '#ffc832' : '#ff5082'
  const items = comanda.items || []
  const nListos = items.filter(it => it.listo).length

  return (
    <div style={{
      background: esListo ? 'rgba(0,180,180,0.06)' : 'var(--card)',
      border: `1.5px solid ${color}44`,
      borderRadius:14, padding:16, marginBottom:10
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          {esListo && <span style={{ fontSize:10, fontWeight:800, color:'#00b4b4', letterSpacing:1, display:'block', marginBottom:3 }}>ELABORADO</span>}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--text-strong)' }}>
              {comanda.cliente_nombre || 'Sin nombre'}
            </div>
            {esVIP && (
              <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>⭐ VIP</span>
            )}
          </div>
          {comanda.cliente_direccion && (
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
              {comanda.cliente_direccion}
            </div>
          )}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'monospace', fontSize:20, fontWeight:900, color, lineHeight:1 }}>{texto}</div>
          {/* Avance del bartender: lo va marcando línea a línea desde el panel /tv */}
          {!esListo && nListos > 0 && (
            <div style={{ fontSize:10, fontWeight:700, color:'#48c78e', marginTop:4 }}>{nListos}/{items.length} preparados</div>
          )}
        </div>
      </div>

      <div style={{ marginBottom:12 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3, opacity: it.listo ? 0.6 : 1 }}>
            <span style={{ fontSize:14, fontWeight:800, color: it.listo ? '#48c78e' : color, minWidth:28 }}>{it.cantidad}x</span>
            <span style={{ fontSize:14, color:'var(--text-strong)', fontWeight:600, textDecoration: it.listo ? 'line-through' : 'none' }}>
              {it.receta_nombre || it.nombre}
            </span>
            {it.listo && <span style={{ fontSize:12, fontWeight:800, color:'#48c78e' }}>✓</span>}
            {it.precio_venta && (
              <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>
                {formatCLP(it.precio_venta * it.cantidad)}
              </span>
            )}
          </div>
        ))}
        {comanda.nota && <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic', marginTop:6 }}>"{comanda.nota}"</div>}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        {comanda.venta_orden_id ? (
          <div style={{
            flex:1, textAlign:'center', background:'rgba(0,180,180,0.12)', color:'#00b4b4', fontWeight:800, fontSize:13,
            border:'1px solid rgba(0,180,180,0.3)', borderRadius:10, padding:'10px'
          }}>
            ✓ Venta registrada
          </div>
        ) : (
          <button onClick={() => onConvertir(comanda)} style={{
            flex:1, background:'var(--cyan)', color:'#000', fontWeight:800, fontSize:13,
            border:'none', borderRadius:10, padding:'10px', cursor:'pointer'
          }}>
            Registrar venta
          </button>
        )}
        <button onClick={() => onArchivar(comanda.id)} style={{
          background:'rgba(255,255,255,0.05)', color:'var(--muted)', fontWeight:600, fontSize:12,
          border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', cursor:'pointer'
        }}>
          Archivar
        </button>
      </div>
    </div>
  )
}

// ─── Confirmación para archivar sin venta ─────────────────────────────────────
// Una comanda archivada sin venta es un pedido que nunca descontó stock ni sumó
// a caja. Puede ser correcto (se canceló), pero tiene que ser una decisión.
function ConfirmarSinVenta({ comandas, onRegistrar, onArchivar, onCancelar }) {
  const una = comandas.length === 1 ? comandas[0] : null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:20 }}
      onClick={onCancelar}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:20, maxWidth:400, width:'100%' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight:800, fontSize:16, color:'var(--text-strong)', marginBottom:8 }}>
          {una ? `La comanda de ${una.cliente_nombre || 'sin nombre'} no tiene venta` : `${comandas.length} comandas no tienen venta`}
        </div>
        <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, marginBottom:6 }}>
          {comandas.map(c => (
            <div key={c.id}>#{c.id} · {c.cliente_nombre || 'sin nombre'} · {haceCuanto(c.created_at)} · {(c.items || []).map(it => it.receta_nombre || it.nombre).join(', ')}</div>
          ))}
        </div>
        <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom:16 }}>
          Si se entregó, registra la venta: si no, el pedido no descuenta stock ni suma a caja.
          Archívala sin venta solo si se canceló o si la venta ya está cargada.
        </div>
        {una && (
          <button className="btn btn-primary" style={{ width:'100%', marginBottom:8 }} onClick={() => onRegistrar(una)}>
            Registrar venta
          </button>
        )}
        <button className="btn btn-secondary" style={{ width:'100%', marginBottom:8 }} onClick={onArchivar}>
          Archivar sin venta
        </button>
        <button className="btn btn-secondary btn-sm" style={{ width:'100%' }} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
// «Registrar venta» abre Ventas con el pedido cargado (App → desdeComanda): un
// solo formulario, con frascos, NEON y envío. La venta cierra la comanda.
export default function ComandasPendientes({ onRegistrarVenta }) {
  const [comandas, setComandas] = useState([])
  const [esVip, setEsVip] = useState(() => () => false)
  const [cargando, setCargando] = useState(true)
  const [sinVenta, setSinVenta] = useState(null) // comandas a confirmar antes de archivar
  const [toast, setToast] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  const cargar = async () => {
    const [{ data: cmd }, { data: cls }, { data: ords }] = await Promise.all([
      supabase.from('comandas').select('*')
        .in('estado', ['pendiente', 'listo'])
        .order('created_at', { ascending: true }),
      supabase.from('clientes').select('id, nombre, tag'),
      supabase.from('ordenes').select('cliente_id, cliente_nombre'),
    ])
    setComandas(cmd || [])
    setEsVip(() => construirEsVip(cls || [], ords || []))
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    const canal = supabase.channel('comandas-app')
      .on('postgres_changes', { event:'*', schema:'public', table:'comandas' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [])

  const archivar = async (ids) => {
    if (!ids.length) return
    const { error } = await supabase.from('comandas').update({ estado: 'archivado' }).in('id', ids)
    if (error) { showToast('No se pudo archivar: ' + error.message); return }
    setComandas(prev => prev.filter(c => !ids.includes(c.id)))
    showToast(`${ids.length} comanda${ids.length > 1 ? 's' : ''} archivada${ids.length > 1 ? 's' : ''}`)
  }

  // Con venta se archiva directo; sin venta, se pregunta.
  const handleArchivar = (id) => {
    const c = comandas.find(x => x.id === id)
    if (c && !c.venta_orden_id) { setSinVenta([c]); return }
    archivar([id])
  }

  const handleArchivarTodas = () => {
    const listas = comandas.filter(c => c.estado === 'listo')
    if (!listas.length) { showToast('No hay comandas elaboradas para archivar'); return }
    archivar(listas.filter(c => c.venta_orden_id).map(c => c.id))
    const faltan = listas.filter(c => !c.venta_orden_id)
    if (faltan.length) setSinVenta(faltan)
  }

  const pendientes = comandas.filter(c => c.estado === 'pendiente')
  const listos = comandas.filter(c => c.estado === 'listo')

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      {sinVenta && (
        <ConfirmarSinVenta
          comandas={sinVenta}
          onRegistrar={(c) => { setSinVenta(null); if (onRegistrarVenta) onRegistrarVenta(c) }}
          onArchivar={() => { const ids = sinVenta.map(c => c.id); setSinVenta(null); archivar(ids) }}
          onCancelar={() => setSinVenta(null)}
        />
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div className="page-title" style={{ marginBottom:16 }}>Comandas</div>
        {listos.length > 0 && (
          <button onClick={handleArchivarTodas} style={{
            fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:8, cursor:'pointer',
            background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)',
            color:'var(--muted)'
          }}>
            Archivar elaboradas ({listos.length})
          </button>
        )}
      </div>

      {cargando && <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Cargando...</div>}

      {!cargando && comandas.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 20px' }}>
          <div style={{ fontSize:40, marginBottom:12, opacity:0.2 }}>🍹</div>
          <div style={{ fontSize:16, color:'var(--muted)' }}>Sin comandas activas</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:6, opacity:0.6 }}>
            Los pedidos importados desde WhatsApp aparecen aqui.
          </div>
        </div>
      )}

      {/* Pendientes primero */}
      {pendientes.map(c => (
        <TarjetaComanda key={c.id} comanda={c} onConvertir={onRegistrarVenta} onArchivar={handleArchivar} esVIP={esVip(c)} />
      ))}

      {/* Separador si hay ambos estados */}
      {pendientes.length > 0 && listos.length > 0 && (
        <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:1, textTransform:'uppercase', margin:'16px 0 10px', opacity:0.5 }}>
          Elaborados — pendiente de registrar
        </div>
      )}

      {/* Elaborados */}
      {listos.map(c => (
        <TarjetaComanda key={c.id} comanda={c} onConvertir={onRegistrarVenta} onArchivar={handleArchivar} esVIP={esVip(c)} />
      ))}
    </div>
  )
}
