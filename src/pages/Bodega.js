// ─── Bodega ──────────────────────────────────────────────────────────────────
// Todo lo que mueve o mide el inventario, en un solo lugar. Hasta el 6-oct
// estaba repartido entre la pestaña Compra (que además tenía un segundo
// Stock adentro) y tres entradas sueltas del menú «Más» (Stock, Conteo,
// Salidas).
import React, { useState } from 'react'
import Stock from './Stock'
import Compras from './Compras'
import Conteo from './Conteo'
import Salidas from './Salidas'

const SECCIONES = [
  { id: 'stock', label: 'Stock' },
  { id: 'compras', label: 'Compras' },
  { id: 'conteo', label: 'Conteo' },
  { id: 'salidas', label: 'Salidas' },
]

export default function Bodega({ seccion, onSeccion }) {
  const [propia, setPropia] = useState('stock')
  const actual = seccion || propia
  const ir = (id) => { setPropia(id); if (onSeccion) onSeccion(id) }
  return (
    <div>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '14px 16px 0' }}>
        <div className="toggle-row" style={{ marginBottom: 0 }}>
          {SECCIONES.map(s => (
            <button key={s.id} className={`toggle-btn ${actual === s.id ? 'active-entrada' : ''}`} onClick={() => ir(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {actual === 'stock' && <Stock />}
      {actual === 'compras' && <Compras />}
      {actual === 'conteo' && <Conteo />}
      {actual === 'salidas' && <Salidas />}
    </div>
  )
}
