import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─── Normalización y similitud ───────────────────────────────────────────────
function norm(str = '') {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim()
}

function similitud(a, b) {
  const na = norm(a), nb = norm(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const bigrams = s => { const r = new Set(); for (let i = 0; i < s.length - 1; i++) r.add(s[i]+s[i+1]); return r }
  const ba = bigrams(na), bb = bigrams(nb)
  let inter = 0; for (const b of bb) if (ba.has(b)) inter++
  return (2 * inter) / (ba.size + bb.size)
}

function limpiarTel(tel = '') {
  const d = tel.replace(/\D/g, '')
  if (d.startsWith('569')) return d.slice(2)
  if (d.startsWith('9') && d.length === 9) return d
  if (d.length === 8) return '9' + d
  return d
}

// ─── Match de receta más cercana ─────────────────────────────────────────────
function matchReceta(texto, recetas) {
  if (!recetas.length || !texto) return null
  const scores = recetas.map(r => ({ r, s: similitud(texto, r.nombre) }))
  scores.sort((a, b) => b.s - a.s)
  return scores[0].s > 0.3 ? scores[0].r : null
}

// ─── Parser del chat ──────────────────────────────────────────────────────────
function parsearChat(texto, recetas) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []
  let direccion = '', telefono = ''

  const regexItem   = /^[-•*]\s*(.+)$/
  const regexCantX  = /^(\d+)[xX×]\s*(.+)$/
  const regexNumSp  = /^(\d+)\s+(.+)$/
  const regexTelKw  = /(?:cel(?:ular)?|tel(?:[eé]fono)?|fono|whatsapp|n[uú]mero)[:\s]*([+\d\s().‑-]{7,})/i
  const regexTelRaw = /\b((?:\+?56\s?)?9\s?\d{4}\s?\d{4})\b/
  const regexDir    = /(?:direcci[oó]n|dir\.|calle|av\.|avenida|pasaje|psj\.|villa|poblaci[oó]n|depto?\.?|casa)[:\s]*(.+)/i

  const agregarItem = (cantidad, texto) => {
    const receta = matchReceta(texto, recetas)
    items.push({
      key: Date.now() + Math.random(),
      cantidad,
      textoOriginal: texto,
      receta_nombre: receta ? receta.nombre : '',
      precio_venta: receta ? receta.precio_venta : '',
      nota: ''
    })
  }

  for (const linea of lineas) {
    const mTelKw  = linea.match(regexTelKw)
    const mTelRaw = linea.match(regexTelRaw)
    if ((mTelKw || mTelRaw) && !telefono) {
      telefono = limpiarTel((mTelKw ? mTelKw[1] : mTelRaw[0]))
      continue
    }
    const mDir = linea.match(regexDir)
    if (mDir && !direccion) { direccion = mDir[1].trim(); continue }

    const mItem = linea.match(regexItem)
    if (mItem) {
      const c = mItem[1].trim()
      const mX = c.match(regexCantX) || c.match(regexNumSp)
      if (mX) agregarItem(parseInt(mX[1]), mX[2].trim())
      else     agregarItem(1, c)
      continue
    }

    // Subdivisión "uno X y uno Y" para el ítem anterior
    if (items.length > 0) {
      const lower = linea.toLowerCase()
      const partes = lower.split(/\s+y\s+/)
      if (partes.length > 1 && partes.every(p => /^(uno|una|\d+)/.test(p.trim()))) {
        const ultimo = items[items.length - 1]
        const exp = partes.map(p => {
          const m = p.trim().match(/^(uno|una|\d+)\s+(.+)$/)
          return m ? { cantidad: 1, textoOriginal: m[2].trim() } : null
        }).filter(Boolean)
        if (exp.length > 0 && exp.length === ultimo.cantidad) {
          items.splice(items.length - 1, 1, ...exp.map(e => ({
            key: Date.now() + Math.random(),
            cantidad: e.cantidad,
            textoOriginal: e.textoOriginal,
            receta_nombre: matchReceta(e.textoOriginal, recetas)?.nombre || '',
            precio_venta: matchReceta(e.textoOriginal, recetas)?.precio_venta || '',
            nota: ''
          })))
          continue
        }
        if (ultimo) { ultimo.nota = linea; continue }
      }
      if (/^(uno |una |\d+ )/.test(lower)) {
        const ultimo = items[items.length - 1]
        if (ultimo) { ultimo.nota = (ultimo.nota ? ultimo.nota + ', ' : '') + linea; continue }
      }
    }

    const mNum = linea.match(regexNumSp)
    if (mNum && parseInt(mNum[1]) <= 20 && !linea.includes(':'))
      agregarItem(parseInt(mNum[1]), mNum[2].trim())
  }

  return { items, direccion, telefono }
}

// ─── Buscar cliente ───────────────────────────────────────────────────────────
async function buscarCliente(telefono, nombreChat) {
  const { data: todos } = await supabase.from('clientes').select('*')
  if (!todos?.length) return { tipo: 'nuevo', sugerencia: null, todos: [] }
  if (telefono) {
    const tn = limpiarTel(telefono)
    const m = todos.find(c => limpiarTel(c.telefono || '') === tn)
    if (m) return { tipo: 'exacto', cliente: m, todos }
  }
  if (nombreChat) {
    const con = todos.map(c => ({ ...c, score: similitud(c.nombre, nombreChat) }))
      .filter(c => c.score > 0.5).sort((a, b) => b.score - a.score)
    if (con.length) return { tipo: 'probable', sugerencia: con[0], alternativas: con.slice(1, 3), todos }
  }
  return { tipo: 'nuevo', sugerencia: null, todos }
}

// ─── Selector de receta ───────────────────────────────────────────────────────
function SelectorReceta({ value, precio, recetas, onChange, onPrecioChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(value)
  const ref = useRef(null)

  useEffect(() => { setQ(value) }, [value])
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtradas = q.length >= 1
    ? recetas.filter(r => norm(r.nombre).includes(norm(q))).slice(0, 6)
    : recetas.slice(0, 6)

  const seleccionar = (r) => {
    onChange(r.nombre)
    onPrecioChange(r.precio_venta)
    setQ(r.nombre)
    setOpen(false)
  }

  const inp = {
    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 14
  }

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input
        style={inp}
        value={q}
        placeholder="Receta..."
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && filtradas.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 2, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}>
          {filtradas.map(r => (
            <div key={r.nombre} onMouseDown={() => seleccionar(r)} style={{
              padding: '9px 12px', cursor: 'pointer', fontSize: 13,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,180,180,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span>{r.nombre}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                ${(r.precio_venta || 0).toLocaleString('es-CL')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Buscador de cliente existente ────────────────────────────────────────────
function BuscadorCliente({ todos, onSelect, seleccionado }) {
  const [q, setQ] = useState('')
  const resultados = q.length >= 2
    ? todos.filter(c => norm(c.nombre).includes(norm(q)) || (c.telefono||'').includes(q)).slice(0, 5)
    : []
  const inp = { width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:14, marginBottom:6 }
  return (
    <div style={{ marginBottom: 10 }}>
      <input style={inp} placeholder="Buscar por nombre o telefono..." value={q} onChange={e => setQ(e.target.value)} />
      {resultados.map(c => (
        <button key={c.id} onMouseDown={() => onSelect(c)} style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
          background: seleccionado === c.id ? 'rgba(0,180,180,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${seleccionado === c.id ? 'rgba(0,180,180,0.4)' : 'var(--border)'}`,
          borderRadius:8, padding:'8px 12px', marginBottom:6, cursor:'pointer', textAlign:'left'
        }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>{c.nombre}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>{c.telefono} · {c.direccion}</div>
          </div>
          {seleccionado === c.id && <span style={{ color:'var(--cyan)', fontSize:16 }}>✓</span>}
        </button>
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ImportarPedido() {
  const [paso, setPaso] = useState('pegar')
  const [textoChat, setTextoChat] = useState('')
  const [nombreChat, setNombreChat] = useState('')
  const [recetas, setRecetas] = useState([])
  const [parsed, setParsed] = useState(null)
  const [clienteInfo, setClienteInfo] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [editCliente, setEditCliente] = useState({ nombre:'', telefono:'', direccion:'', id:null })
  const [clienteOp, setClienteOp] = useState('vinculado')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    supabase.from('recetas').select('nombre, precio_venta').order('nombre')
      .then(({ data }) => setRecetas((data || []).filter(r => r.nombre !== 'ENVASE')))
  }, [])

  useEffect(() => {
    if (paso === 'pegar' && textareaRef.current) textareaRef.current.focus()
  }, [paso])

  const handleParsear = async () => {
    if (!textoChat.trim()) return
    const resultado = parsearChat(textoChat, recetas)
    setParsed(resultado)
    setEditItems(resultado.items)
    const info = await buscarCliente(resultado.telefono, nombreChat)
    setClienteInfo(info)
    if (info.tipo === 'exacto') {
      setClienteOp('vinculado')
      setEditCliente({ nombre: info.cliente.nombre||'', telefono: info.cliente.telefono||'', direccion: resultado.direccion||info.cliente.direccion||'', id: info.cliente.id })
    } else if (info.tipo === 'probable') {
      setClienteOp('vinculado')
      setEditCliente({ nombre: info.sugerencia.nombre||nombreChat||'', telefono: resultado.telefono||info.sugerencia.telefono||'', direccion: resultado.direccion||info.sugerencia.direccion||'', id: info.sugerencia.id })
    } else {
      setClienteOp('nuevo')
      setEditCliente({ nombre: nombreChat||'', telefono: resultado.telefono||'', direccion: resultado.direccion||'', id: null })
    }
    setPaso('revision')
  }

  const updateItem = (key, field, value) => setEditItems(prev => prev.map(it => it.key === key ? { ...it, [field]: value } : it))
  const eliminarItem = (key) => setEditItems(prev => prev.filter(it => it.key !== key))
  const agregarItem = () => setEditItems(prev => [...prev, { key: Date.now(), cantidad:1, textoOriginal:'', receta_nombre:'', precio_venta:'', nota:'' }])

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      let clienteId = null
      if (clienteOp === 'vinculado' && editCliente.id) {
        clienteId = editCliente.id
        if (editCliente.direccion)
          await supabase.from('clientes').update({ direccion: editCliente.direccion, telefono: editCliente.telefono||undefined }).eq('id', clienteId)
      } else if (clienteOp === 'nuevo' && editCliente.nombre) {
        const { data: nc } = await supabase.from('clientes').insert({ nombre: editCliente.nombre, telefono: editCliente.telefono||null, direccion: editCliente.direccion||null, origen: 'WhatsApp' }).select().single()
        if (nc) clienteId = nc.id
      }
      const itemsLimpios = editItems.filter(it => it.receta_nombre?.trim() || it.textoOriginal?.trim()).map(it => ({
        cantidad: it.cantidad,
        nombre: it.receta_nombre?.trim() || it.textoOriginal?.trim(),
        receta_nombre: it.receta_nombre?.trim() || null,
        precio_venta: parseFloat(it.precio_venta) || null,
        nota: it.nota || ''
      }))
      await supabase.from('comandas').insert({
        cliente_id: clienteId,
        cliente_nombre: editCliente.nombre||null,
        cliente_telefono: editCliente.telefono||null,
        cliente_direccion: editCliente.direccion||null,
        items: itemsLimpios,
        nota: nota||null,
        estado: 'pendiente',
        origen_texto: textoChat
      })
      setPaso('listo')
    } catch (e) {
      alert('Error guardando: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleNuevo = () => {
    setTextoChat(''); setNombreChat(''); setParsed(null); setClienteInfo(null)
    setEditItems([]); setEditCliente({ nombre:'', telefono:'', direccion:'', id:null }); setNota(''); setPaso('pegar')
  }

  const sty = {
    card: { background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:16, marginBottom:14 },
    label: { fontSize:11, color:'var(--muted)', fontWeight:600, marginBottom:4, display:'block', textTransform:'uppercase', letterSpacing:'0.05em' },
    input: { width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:14 },
    btnP: { background:'var(--cyan)', color:'#000', fontWeight:800, fontSize:15, border:'none', borderRadius:10, padding:'12px 24px', cursor:'pointer', width:'100%' },
    btnS: { background:'rgba(255,255,255,0.07)', color:'var(--text)', fontWeight:600, fontSize:13, border:'1px solid var(--border)', borderRadius:10, padding:'9px 16px', cursor:'pointer' },
  }

  // ── LISTO ─────────────────────────────────────────────────────────────────
  if (paso === 'listo') return (
    <div style={{ padding:24, maxWidth:480, margin:'0 auto', textAlign:'center', paddingTop:60 }}>
      <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
      <div style={{ fontSize:22, fontWeight:800, color:'var(--cyan)', marginBottom:8 }}>Comanda ingresada</div>
      <div style={{ color:'var(--muted)', marginBottom:32 }}>Ya aparece en el panel de comandas.</div>
      <button onClick={handleNuevo} style={sty.btnP}>Importar otro pedido</button>
      <button onClick={() => window.open('/comandas','_blank')} style={{ ...sty.btnS, marginTop:10, width:'100%', display:'block' }}>Ver panel comandas →</button>
    </div>
  )

  // ── REVISIÓN ──────────────────────────────────────────────────────────────
  if (paso === 'revision') return (
    <div style={{ padding:'16px 16px 100px', maxWidth:560, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <button onClick={() => setPaso('pegar')} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:22 }}>←</button>
        <div style={{ fontSize:18, fontWeight:800, color:'var(--text-strong)' }}>Revisar pedido</div>
      </div>

      {/* CLIENTE */}
      <div style={sty.card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--cyan)' }}>👤 Cliente</div>
          {clienteInfo?.tipo === 'exacto'   && <span style={{ fontSize:10, background:'rgba(72,199,142,0.15)', color:'#48c78e', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>✓ Match exacto</span>}
          {clienteInfo?.tipo === 'probable' && <span style={{ fontSize:10, background:'rgba(255,200,50,0.15)', color:'#ffc832', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>~ Coincidencia probable</span>}
          {clienteInfo?.tipo === 'nuevo' && clienteOp === 'nuevo' && <span style={{ fontSize:10, background:'rgba(255,80,130,0.15)', color:'#ff5082', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>+ Cliente nuevo</span>}
        </div>
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          {[{op:'vinculado',label: clienteInfo?.tipo==='nuevo'?'Buscar existente':'Vincular existente'},{op:'nuevo',label:'Crear nuevo'},{op:'ninguno',label:'Sin cliente'}].map(({op,label}) => (
            <button key={op} onClick={() => { setClienteOp(op); if(op==='nuevo') setEditCliente(c=>({...c,id:null})); if(op==='vinculado'&&clienteInfo?.tipo==='exacto') setEditCliente(c=>({...c,id:clienteInfo.cliente.id})) }}
              style={{ fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:8, cursor:'pointer', border:'none', background:clienteOp===op?'var(--cyan)':'rgba(255,255,255,0.07)', color:clienteOp===op?'#000':'var(--muted)' }}>
              {label}
            </button>
          ))}
        </div>
        {clienteOp !== 'ninguno' && (<>
          {clienteInfo?.tipo === 'probable' && clienteOp === 'vinculado' && (
            <div style={{ marginBottom:10 }}>
              <span style={sty.label}>Es este cliente?</span>
              {[clienteInfo.sugerencia,...(clienteInfo.alternativas||[])].map(c => (
                <button key={c.id} onClick={() => setEditCliente({ nombre:c.nombre, telefono:c.telefono||'', direccion:parsed.direccion||c.direccion||'', id:c.id })}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', background:editCliente.id===c.id?'rgba(0,180,180,0.1)':'rgba(255,255,255,0.04)', border:`1px solid ${editCliente.id===c.id?'rgba(0,180,180,0.4)':'var(--border)'}`, borderRadius:8, padding:'8px 12px', marginBottom:6, cursor:'pointer', textAlign:'left' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text-strong)' }}>{c.nombre}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{c.telefono} · {c.direccion}</div>
                  </div>
                  {editCliente.id===c.id && <span style={{ color:'var(--cyan)', fontSize:16 }}>✓</span>}
                </button>
              ))}
            </div>
          )}
          {clienteInfo?.tipo === 'nuevo' && clienteOp === 'vinculado' && (
            <BuscadorCliente todos={clienteInfo.todos} onSelect={c => setEditCliente({ nombre:c.nombre, telefono:c.telefono||'', direccion:parsed.direccion||c.direccion||'', id:c.id })} seleccionado={editCliente.id} />
          )}
          <span style={sty.label}>Nombre</span>
          <input style={{ ...sty.input, marginBottom:8 }} value={editCliente.nombre} onChange={e => setEditCliente(c=>({...c,nombre:e.target.value}))} placeholder="Nombre del cliente" />
          <span style={sty.label}>Telefono</span>
          <input style={{ ...sty.input, marginBottom:8 }} value={editCliente.telefono} onChange={e => setEditCliente(c=>({...c,telefono:e.target.value}))} placeholder="9XXXXXXXX" />
          <span style={sty.label}>Direccion</span>
          <input style={sty.input} value={editCliente.direccion} onChange={e => setEditCliente(c=>({...c,direccion:e.target.value}))} placeholder="Calle y numero" />
        </>)}
      </div>

      {/* ITEMS */}
      <div style={sty.card}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--cyan)', marginBottom:12 }}>
          Pedido
          {recetas.length > 0 && <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400, marginLeft:8 }}>· receta autodetectada</span>}
        </div>
        {editItems.map(it => (
          <div key={it.key} style={{ marginBottom:12, padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display:'flex', gap:6, alignItems:'flex-start', marginBottom:6 }}>
              {/* Cantidad */}
              <input type="number" min="1" max="99" value={it.cantidad}
                onChange={e => updateItem(it.key,'cantidad',parseInt(e.target.value)||1)}
                style={{ ...sty.input, width:52, textAlign:'center', flexShrink:0 }} />
              {/* Selector de receta */}
              <SelectorReceta
                value={it.receta_nombre}
                precio={it.precio_venta}
                recetas={recetas}
                onChange={v => updateItem(it.key,'receta_nombre',v)}
                onPrecioChange={v => updateItem(it.key,'precio_venta',v)}
              />
              <button onClick={() => eliminarItem(it.key)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20, padding:'4px', flexShrink:0 }}>×</button>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)', width:52, textAlign:'center', flexShrink:0 }}>$</span>
              <input type="number" value={it.precio_venta}
                onChange={e => updateItem(it.key,'precio_venta',e.target.value)}
                placeholder="Precio"
                style={{ ...sty.input, fontSize:13, flex:1 }} />
              {it.textoOriginal && it.receta_nombre !== it.textoOriginal && (
                <span style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic', flex:1 }}>"{it.textoOriginal}"</span>
              )}
            </div>
            <input value={it.nota} onChange={e => updateItem(it.key,'nota',e.target.value)}
              placeholder="Nota (opcional)" style={{ ...sty.input, marginTop:6, fontSize:12, opacity:0.7 }} />
          </div>
        ))}
        <button onClick={agregarItem} style={{ ...sty.btnS, fontSize:12, marginTop:4 }}>+ Agregar item</button>
      </div>

      {/* NOTA */}
      <div style={sty.card}>
        <span style={sty.label}>Nota interna (opcional)</span>
        <textarea value={nota} onChange={e => setNota(e.target.value)}
          style={{ ...sty.input, minHeight:64, resize:'vertical' }}
          placeholder="Instrucciones especiales..." />
      </div>

      <button onClick={handleGuardar}
        disabled={guardando || editItems.filter(i => i.receta_nombre?.trim()||i.textoOriginal?.trim()).length === 0}
        style={sty.btnP}>
        {guardando ? 'Guardando...' : 'Ingresar comanda'}
      </button>
    </div>
  )

  // ── PEGAR CHAT ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:'16px 16px 100px', maxWidth:540, margin:'0 auto' }}>
      <div style={{ fontSize:20, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>
        Importar desde WhatsApp
      </div>
      <div style={{ fontSize:13, color:'var(--muted)', marginBottom:24 }}>
        Pega los mensajes del chat y la app extrae el pedido.
      </div>
      <div style={sty.card}>
        <span style={sty.label}>Nombre del contacto en WhatsApp</span>
        <input style={{ ...sty.input, marginBottom:16 }} value={nombreChat} onChange={e => setNombreChat(e.target.value)} placeholder="Ej: Jose Garcia" />
        <span style={sty.label}>Mensajes del chat</span>
        <textarea ref={textareaRef} value={textoChat} onChange={e => setTextoChat(e.target.value)}
          style={{ ...sty.input, minHeight:200, resize:'vertical', fontFamily:'monospace', fontSize:13 }}
          placeholder={"-2 mojitos\n-uno tradicional y uno maracuya\ncalle falsa 123\ncel 912345678"} />
      </div>
      <button onClick={handleParsear} disabled={!textoChat.trim()} style={{ ...sty.btnP, opacity:textoChat.trim()?1:0.5 }}>
        Analizar pedido
      </button>
    </div>
  )
}
