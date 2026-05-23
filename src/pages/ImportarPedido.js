import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─── Utilidades de similitud de texto ────────────────────────────────────────
function normalizarTexto(str = '') {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim()
}

function similitud(a, b) {
  const na = normalizarTexto(a)
  const nb = normalizarTexto(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  // Bigrams
  const bigramas = s => {
    const r = new Set()
    for (let i = 0; i < s.length - 1; i++) r.add(s[i] + s[i + 1])
    return r
  }
  const ba = bigramas(na)
  const bb = bigramas(nb)
  let inter = 0
  for (const b of bb) if (ba.has(b)) inter++
  return (2 * inter) / (ba.size + bb.size)
}

function limpiarTelefono(tel = '') {
  const digits = tel.replace(/\D/g, '')
  if (digits.startsWith('569')) return digits.slice(2)
  if (digits.startsWith('9') && digits.length === 9) return digits
  if (digits.length === 8) return '9' + digits
  return digits
}

// ─── Parser principal ─────────────────────────────────────────────────────────
function parsearChat(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)

  const items = []
  let direccion = ''
  let telefono = ''

  // Patrones
  const regexItem = /^[-•*]\s*(.+)$/
  const regexCantItem = /^(\d+)[xX×\s]+(.+)$/
  const regexNumItem = /^(\d+)\s+(.+)$/ // "2 mojitos"
  const regexTel = /(?:cel(?:ular)?|tel(?:[eé]fono)?|whatsapp|número|numero|fono)[:\s]*([+\d\s().-]{7,})/i
  const regexTelSolo = /\b((?:\+?56\s?)?9\s?\d{4}\s?\d{4})\b/
  const regexDir = /(?:dirección|direccion|dir\.|calle|av\.|avenida|pasaje|psj\.|villa|población|poblacion|po?b\.|depto?\.?|casa)[:\s]*(.+)/i

  for (const linea of lineas) {
    // Teléfono
    const mTel = linea.match(regexTel) || linea.match(regexTelSolo)
    if (mTel && !telefono) {
      telefono = limpiarTelefono(mTel[1] || mTel[0])
      continue
    }

    // Dirección
    const mDir = linea.match(regexDir)
    if (mDir && !direccion) {
      direccion = mDir[1].trim()
      continue
    }

    // Ítems con guión/bullet
    const mItem = linea.match(regexItem)
    if (mItem) {
      const contenido = mItem[1].trim()
      // Puede tener cantidad al inicio: "2 mojitos" o "2x mojitos"
      const mCant = contenido.match(regexCantItem) || contenido.match(regexNumItem)
      if (mCant) {
        items.push({ cantidad: parseInt(mCant[1]), nombre: mCant[2].trim(), nota: '' })
      } else {
        items.push({ cantidad: 1, nombre: contenido, nota: '' })
      }
      continue
    }

    // "uno tradicional y uno maracuya" → subdivide el ítem anterior
    if (items.length > 0) {
      const lower = linea.toLowerCase()
      // Detecta subdivisiones "uno X y uno Y"
      const partes = lower.split(/\s+y\s+/)
      if (partes.length > 1 && partes.every(p => /^(uno|una|\d+)/.test(p.trim()))) {
        // Reemplaza el último ítem por las subdivisiones
        const ultimo = items[items.length - 1]
        const expansiones = partes.map(p => {
          const m = p.trim().match(/^(uno|una|\d+)\s+(.+)$/)
          if (m) return { cantidad: 1, nombre: m[2].trim(), nota: '' }
          return null
        }).filter(Boolean)
        if (expansiones.length > 0 && expansiones.length === ultimo.cantidad) {
          items.splice(items.length - 1, 1, ...expansiones)
          continue
        }
        // Si no coincide cantidad, agrega como notas del último
        if (ultimo) {
          ultimo.nota = linea
          continue
        }
      }
      // Si la línea parece una aclaración del ítem anterior
      if (lower.startsWith('uno ') || lower.startsWith('una ') || lower.match(/^\d+ /)) {
        const ultimo = items[items.length - 1]
        if (ultimo.nota) ultimo.nota += ', ' + linea
        else ultimo.nota = linea
        continue
      }
    }

    // Ítem sin guión pero con "número cantidad" al inicio
    const mNum = linea.match(regexNumItem)
    if (mNum && parseInt(mNum[1]) <= 20 && !linea.includes(':')) {
      items.push({ cantidad: parseInt(mNum[1]), nombre: mNum[2].trim(), nota: '' })
    }
  }

  return { items, direccion, telefono }
}

// ─── Buscar cliente con deduplicación ────────────────────────────────────────
async function buscarCliente(telefono, nombreChat) {
  const { data: todos } = await supabase.from('clientes').select('*')
  if (!todos?.length) return { tipo: 'nuevo', sugerencia: null, todos: [] }

  // 1. Match exacto por teléfono
  if (telefono) {
    const telNorm = limpiarTelefono(telefono)
    const match = todos.find(c => limpiarTelefono(c.telefono || '') === telNorm)
    if (match) return { tipo: 'exacto', cliente: match, todos }
  }

  // 2. Similitud por nombre
  if (nombreChat) {
    const conScore = todos.map(c => ({
      ...c,
      score: similitud(c.nombre, nombreChat)
    })).filter(c => c.score > 0.5)
      .sort((a, b) => b.score - a.score)

    if (conScore.length > 0) {
      return { tipo: 'probable', sugerencia: conScore[0], alternativas: conScore.slice(1, 3), todos }
    }
  }

  return { tipo: 'nuevo', sugerencia: null, todos }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ImportarPedido() {
  const [paso, setPaso] = useState('pegar') // pegar | revision | guardando | listo
  const [textoChat, setTextoChat] = useState('')
  const [nombreChat, setNombreChat] = useState('') // nombre del contacto en WhatsApp
  const [parsed, setParsed] = useState(null)
  const [clienteInfo, setClienteInfo] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [editCliente, setEditCliente] = useState({ nombre: '', telefono: '', direccion: '', id: null })
  const [clienteOp, setClienteOp] = useState('vinculado') // vinculado | nuevo | ninguno
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (paso === 'pegar' && textareaRef.current) textareaRef.current.focus()
  }, [paso])

  const handleParsear = async () => {
    if (!textoChat.trim()) return
    const resultado = parsearChat(textoChat)
    setParsed(resultado)
    setEditItems(resultado.items.map((it, i) => ({ ...it, key: i })))

    // Buscar cliente
    const info = await buscarCliente(resultado.telefono, nombreChat)
    setClienteInfo(info)

    if (info.tipo === 'exacto') {
      setClienteOp('vinculado')
      setEditCliente({
        nombre: info.cliente.nombre || '',
        telefono: info.cliente.telefono || '',
        direccion: resultado.direccion || info.cliente.direccion || '',
        id: info.cliente.id
      })
    } else if (info.tipo === 'probable') {
      setClienteOp('vinculado')
      setEditCliente({
        nombre: info.sugerencia.nombre || nombreChat || '',
        telefono: resultado.telefono || info.sugerencia.telefono || '',
        direccion: resultado.direccion || info.sugerencia.direccion || '',
        id: info.sugerencia.id
      })
    } else {
      setClienteOp('nuevo')
      setEditCliente({
        nombre: nombreChat || '',
        telefono: resultado.telefono || '',
        direccion: resultado.direccion || '',
        id: null
      })
    }

    setPaso('revision')
  }

  const agregarItem = () => {
    setEditItems(prev => [...prev, { key: Date.now(), cantidad: 1, nombre: '', nota: '' }])
  }

  const eliminarItem = (key) => {
    setEditItems(prev => prev.filter(it => it.key !== key))
  }

  const updateItem = (key, field, value) => {
    setEditItems(prev => prev.map(it => it.key === key ? { ...it, [field]: value } : it))
  }

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      let clienteId = null

      // Resolver cliente
      if (clienteOp === 'vinculado' && editCliente.id) {
        clienteId = editCliente.id
        // Actualizar dirección si cambió
        if (editCliente.direccion) {
          await supabase.from('clientes').update({
            direccion: editCliente.direccion,
            telefono: editCliente.telefono || undefined
          }).eq('id', clienteId)
        }
      } else if (clienteOp === 'nuevo' && editCliente.nombre) {
        const { data: nc } = await supabase.from('clientes').insert({
          nombre: editCliente.nombre,
          telefono: editCliente.telefono || null,
          direccion: editCliente.direccion || null,
          origen: 'WhatsApp'
        }).select().single()
        if (nc) clienteId = nc.id
      }

      const itemsLimpios = editItems
        .filter(it => it.nombre.trim())
        .map(it => ({ cantidad: it.cantidad, nombre: it.nombre.trim(), nota: it.nota || '' }))

      await supabase.from('comandas').insert({
        cliente_id: clienteId,
        cliente_nombre: editCliente.nombre || null,
        cliente_telefono: editCliente.telefono || null,
        cliente_direccion: editCliente.direccion || null,
        items: itemsLimpios,
        nota: nota || null,
        estado: 'pendiente',
        origen_texto: textoChat
      })

      setExito(true)
      setPaso('listo')
    } catch (e) {
      alert('Error guardando: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleNuevo = () => {
    setTextoChat('')
    setNombreChat('')
    setParsed(null)
    setClienteInfo(null)
    setEditItems([])
    setEditCliente({ nombre: '', telefono: '', direccion: '', id: null })
    setNota('')
    setExito(false)
    setPaso('pegar')
  }

  // ── Estilos comunes ──
  const card = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: 16, marginBottom: 14
  }
  const label = { fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const input = {
    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 14
  }
  const btnPrimary = {
    background: 'var(--cyan)', color: '#000', fontWeight: 800, fontSize: 15,
    border: 'none', borderRadius: 10, padding: '12px 24px', cursor: 'pointer', width: '100%'
  }
  const btnSecondary = {
    background: 'rgba(255,255,255,0.07)', color: 'var(--text)', fontWeight: 600, fontSize: 13,
    border: '1px solid var(--border)', borderRadius: 10, padding: '9px 16px', cursor: 'pointer'
  }

  // ── PASO: LISTO ──
  if (paso === 'listo') {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cyan)', marginBottom: 8 }}>¡Comanda ingresada!</div>
        <div style={{ color: 'var(--muted)', marginBottom: 32 }}>
          Ya aparece en el panel de comandas.
        </div>
        <button onClick={handleNuevo} style={btnPrimary}>
          Importar otro pedido
        </button>
        <button
          onClick={() => window.open('/comandas', '_blank')}
          style={{ ...btnSecondary, marginTop: 10, width: '100%', display: 'block' }}>
          Ver panel comandas →
        </button>
      </div>
    )
  }

  // ── PASO: REVISIÓN ──
  if (paso === 'revision') {
    return (
      <div style={{ padding: '16px 16px 100px', maxWidth: 540, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setPaso('pegar')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 22 }}>←</button>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>Revisar pedido</div>
        </div>

        {/* ── CLIENTE ── */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)' }}>
              👤 Cliente
            </div>
            {/* Badge de estado del match */}
            {clienteInfo?.tipo === 'exacto' && (
              <span style={{ fontSize: 10, background: 'rgba(72,199,142,0.15)', color: '#48c78e', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>✓ Match exacto (tel)</span>
            )}
            {clienteInfo?.tipo === 'probable' && (
              <span style={{ fontSize: 10, background: 'rgba(255,200,50,0.15)', color: '#ffc832', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>~ Coincidencia probable</span>
            )}
            {clienteInfo?.tipo === 'nuevo' && clienteOp === 'nuevo' && (
              <span style={{ fontSize: 10, background: 'rgba(255,80,130,0.15)', color: '#ff5082', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>+ Cliente nuevo</span>
            )}
          </div>

          {/* Selector de operación */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[
              { op: 'vinculado', label: clienteInfo?.tipo === 'nuevo' ? 'Buscar existente' : 'Vincular existente' },
              { op: 'nuevo', label: 'Crear nuevo' },
              { op: 'ninguno', label: 'Sin cliente' },
            ].map(({ op, label: lb }) => (
              <button key={op} onClick={() => {
                setClienteOp(op)
                if (op === 'nuevo') setEditCliente(c => ({ ...c, id: null }))
                if (op === 'vinculado' && clienteInfo?.tipo === 'exacto') setEditCliente(c => ({ ...c, id: clienteInfo.cliente.id }))
              }} style={{
                fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                border: 'none',
                background: clienteOp === op ? 'var(--cyan)' : 'rgba(255,255,255,0.07)',
                color: clienteOp === op ? '#000' : 'var(--muted)'
              }}>{lb}</button>
            ))}
          </div>

          {clienteOp !== 'ninguno' && (
            <>
              {/* Si es probable, mostrar sugerencias */}
              {clienteInfo?.tipo === 'probable' && clienteOp === 'vinculado' && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ ...label }}>¿Es este cliente?</span>
                  {[clienteInfo.sugerencia, ...(clienteInfo.alternativas || [])].map(c => (
                    <button key={c.id} onClick={() => setEditCliente({ nombre: c.nombre, telefono: c.telefono || '', direccion: parsed.direccion || c.direccion || '', id: c.id })}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', background: editCliente.id === c.id ? 'rgba(0,180,180,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${editCliente.id === c.id ? 'rgba(0,180,180,0.4)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '8px 12px', marginBottom: 6, cursor: 'pointer', textAlign: 'left'
                      }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{c.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.telefono} · {c.direccion}</div>
                      </div>
                      {editCliente.id === c.id && <span style={{ color: 'var(--cyan)', fontSize: 16 }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Si es "buscar existente" en caso nuevo */}
              {clienteInfo?.tipo === 'nuevo' && clienteOp === 'vinculado' && (
                <BuscadorCliente
                  todos={clienteInfo.todos}
                  onSelect={c => setEditCliente({ nombre: c.nombre, telefono: c.telefono || '', direccion: parsed.direccion || c.direccion || '', id: c.id })}
                  seleccionado={editCliente.id}
                />
              )}

              <span style={label}>Nombre</span>
              <input style={{ ...input, marginBottom: 8 }} value={editCliente.nombre}
                onChange={e => setEditCliente(c => ({ ...c, nombre: e.target.value }))} placeholder="Nombre del cliente" />
              <span style={label}>Teléfono</span>
              <input style={{ ...input, marginBottom: 8 }} value={editCliente.telefono}
                onChange={e => setEditCliente(c => ({ ...c, telefono: e.target.value }))} placeholder="9XXXXXXXX" />
              <span style={label}>Dirección</span>
              <input style={input} value={editCliente.direccion}
                onChange={e => setEditCliente(c => ({ ...c, direccion: e.target.value }))} placeholder="Calle y número" />
            </>
          )}
        </div>

        {/* ── ÍTEMS ── */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', marginBottom: 12 }}>🍹 Pedido</div>
          {editItems.map((it) => (
            <div key={it.key} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'flex-start' }}>
              <input
                type="number" min="1" max="99"
                value={it.cantidad}
                onChange={e => updateItem(it.key, 'cantidad', parseInt(e.target.value) || 1)}
                style={{ ...input, width: 52, textAlign: 'center', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <input
                  value={it.nombre}
                  onChange={e => updateItem(it.key, 'nombre', e.target.value)}
                  style={{ ...input, marginBottom: 4 }} placeholder="Nombre del producto" />
                <input
                  value={it.nota}
                  onChange={e => updateItem(it.key, 'nota', e.target.value)}
                  style={{ ...input, fontSize: 12, opacity: 0.7 }} placeholder="Nota (opcional)" />
              </div>
              <button onClick={() => eliminarItem(it.key)} style={{
                background: 'none', border: 'none', color: 'var(--muted)',
                cursor: 'pointer', fontSize: 18, padding: '4px', flexShrink: 0
              }}>×</button>
            </div>
          ))}
          <button onClick={agregarItem} style={{ ...btnSecondary, fontSize: 12, marginTop: 4 }}>+ Agregar ítem</button>
        </div>

        {/* ── NOTA ── */}
        <div style={card}>
          <span style={label}>Nota interna (opcional)</span>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            style={{ ...input, minHeight: 64, resize: 'vertical' }}
            placeholder="Instrucciones especiales, aclaraciones..." />
        </div>

        <button onClick={handleGuardar} disabled={guardando || editItems.filter(i => i.nombre.trim()).length === 0} style={btnPrimary}>
          {guardando ? 'Guardando...' : '✓ Ingresar comanda'}
        </button>
      </div>
    )
  }

  // ── PASO: PEGAR CHAT ──
  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 540, margin: '0 auto' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>
        📥 Importar desde WhatsApp
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
        Pegá los mensajes del chat y la app extrae el pedido.
      </div>

      <div style={card}>
        <span style={label}>Nombre del contacto en WhatsApp</span>
        <input
          style={{ ...input, marginBottom: 16 }}
          value={nombreChat}
          onChange={e => setNombreChat(e.target.value)}
          placeholder="Ej: José García" />

        <span style={label}>Mensajes del chat</span>
        <textarea
          ref={textareaRef}
          value={textoChat}
          onChange={e => setTextoChat(e.target.value)}
          style={{ ...input, minHeight: 180, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          placeholder={`Pegá el chat aquí. Por ejemplo:\n-2 mojitos\n-uno tradicional y uno maracuya\ncalle falsa 123\ncel 912345678`}
        />
      </div>

      <button
        onClick={handleParsear}
        disabled={!textoChat.trim()}
        style={{ ...btnPrimary, opacity: textoChat.trim() ? 1 : 0.5 }}>
        Analizar pedido →
      </button>
    </div>
  )
}

// ─── Sub-componente: buscador de cliente existente ───────────────────────────
function BuscadorCliente({ todos, onSelect, seleccionado }) {
  const [query, setQuery] = useState('')
  const resultados = query.length >= 2
    ? todos.filter(c =>
        normalizarTexto(c.nombre).includes(normalizarTexto(query)) ||
        (c.telefono || '').includes(query)
      ).slice(0, 5)
    : []

  return (
    <div style={{ marginBottom: 10 }}>
      <input
        style={{
          width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 14, marginBottom: 6
        }}
        placeholder="Buscar cliente por nombre o teléfono..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {resultados.map(c => (
        <button key={c.id} onClick={() => onSelect(c)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: seleccionado === c.id ? 'rgba(0,180,180,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${seleccionado === c.id ? 'rgba(0,180,180,0.4)' : 'var(--border)'}`,
          borderRadius: 8, padding: '8px 12px', marginBottom: 6, cursor: 'pointer', textAlign: 'left'
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{c.nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.telefono} · {c.direccion}</div>
          </div>
          {seleccionado === c.id && <span style={{ color: 'var(--cyan)', fontSize: 16 }}>✓</span>}
        </button>
      ))}
    </div>
  )
}
