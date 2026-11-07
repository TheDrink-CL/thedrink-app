import React, { useState } from 'react'
import { referenciasPrototipo, construirBuild, buildLegible, nombreLegible, urlResolver } from '../lib/labCodigos'
import { resolverNumeros } from '../lib/labResolver'
import { cargarMoldes, asegurarReceta } from '../lib/labPrototipos'
import { formatCLP } from '../lib/calculos'

// Vender un prototipo del LAB desde Ventas, por su número. El selector de
// recetas solo lista las que ya existen, y un prototipo nace la primera vez que
// se pide. Primero se muestra el trago y recién al agregarlo se crea la receta:
// un número mal escrito no deja recetas sueltas en el catálogo.
export default function BuscarPrototipo({ onAgregar }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [trago, setTrago] = useState(null)
  const [error, setError] = useState(null) // { mensaje, numero }

  const cerrar = () => { setAbierto(false); setTexto(''); setTrago(null); setError(null) }

  const buscar = async () => {
    const numero = referenciasPrototipo(texto).refs[0]?.numero
    setTrago(null)
    if (!numero) { setError({ mensaje: 'Escribe el número del prototipo, por ejemplo 4375.' }); return }
    setError(null)
    setOcupado(true)
    const { tragos, sinConexion } = await resolverNumeros([numero])
    const t = tragos[numero]
    if (!t) {
      setError({
        numero,
        mensaje: sinConexion
          ? 'No pude leer el LAB. Revisa la conexión e intenta de nuevo.'
          : `El #${numero} no existe en la numeración actual. Revisa que esté bien copiado.`,
      })
      setOcupado(false)
      return
    }
    const moldes = await cargarMoldes([t.spec])
    const b = construirBuild(t.spec, moldes)
    if (b.ok) setTrago({ ...t, numero, moldes, build: b.ingredientes })
    else setError({ numero, mensaje: `No se pudo armar la receta: ${b.motivo}.` })
    setOcupado(false)
  }

  const agregar = async () => {
    setOcupado(true)
    const r = await asegurarReceta(trago.spec, trago.precio, trago.moldes)
    setOcupado(false)
    if (!r.ok) { setError({ numero: trago.numero, mensaje: `No se pudo crear la receta: ${r.motivo}.` }); return }
    onAgregar({ receta_nombre: r.receta_nombre, precio_venta: trago.precio })
    cerrar()
  }

  if (!abierto) return (
    <button type="button" onClick={() => setAbierto(true)}
      style={{ width:'100%', background:'rgba(127,119,221,0.08)', border:'1px dashed rgba(127,119,221,0.45)', borderRadius:10, padding:'10px 0', color:'#AFA9EC', cursor:'pointer', fontSize:13, marginTop:8 }}>
      ⬡ Prototipo del LAB
    </button>
  )

  return (
    <div style={{ background:'rgba(127,119,221,0.08)', border:'1px solid rgba(127,119,221,0.35)', borderRadius:10, padding:12, marginTop:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontSize:12, color:'#AFA9EC', fontWeight:700 }}>⬡ Prototipo del LAB</div>
        <button type="button" onClick={cerrar} aria-label="Cerrar"
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18, lineHeight:1, padding:0 }}>×</button>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {/* Enter buscaría enviar la venta entera: este campo vive dentro del form */}
        <input className="form-input" inputMode="numeric" value={texto} placeholder="Número, ej: 4375" style={{ flex:1 }}
          onChange={e => { setTexto(e.target.value); setTrago(null); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!ocupado) buscar() } }} />
        <button type="button" className="btn btn-secondary" onClick={buscar} disabled={ocupado} style={{ width:'auto', padding:'0 16px' }}>
          {ocupado && !trago ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize:12, color:'#ff5082', lineHeight:1.5, marginTop:8 }}>
          {error.mensaje}
          {error.numero && (
            <a href={urlResolver(error.numero)} target="_blank" rel="noopener noreferrer"
              style={{ display:'block', fontWeight:700, color:'var(--cyan)', marginTop:4 }}>
              Ver #{error.numero} en el Resolver →
            </a>
          )}
        </div>
      )}

      {trago && (
        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-strong)' }}>{nombreLegible(trago.spec)}</div>
          <div style={{ fontSize:11, color:'var(--muted)', margin:'2px 0 6px' }}>
            #{trago.numero} · {trago.codigo} · {formatCLP(trago.precio)}
          </div>
          <div style={{ fontSize:12, lineHeight:1.5, color:'rgba(255,255,255,0.75)', marginBottom:10 }}>{buildLegible(trago.build)}</div>
          <button type="button" className="btn btn-primary" onClick={agregar} disabled={ocupado}>
            {ocupado ? 'Agregando…' : 'Agregar al pedido'}
          </button>
        </div>
      )}
    </div>
  )
}
