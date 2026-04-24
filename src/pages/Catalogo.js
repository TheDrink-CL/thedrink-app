import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularCostoReceta, formatCLP, formatPct } from '../lib/calculos'

export default function Catalogo() {
  const [recetas, setRecetas] = useState([])
  const [insumos, setInsumos] = useState([])
  const [ingredientes, setIngredientes] = useState([])
  const [seleccionada, setSeleccionada] = useState(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState({ merma_pct: 0.08, costo_envase: 794.6 })

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: i }, { data: ing }, { data: cfg }] = await Promise.all([
        supabase.from('recetas').select('*').order('nombre'),
        supabase.from('insumos').select('*'),
        supabase.from('receta_ingredientes').select('*'),
        supabase.from('config').select('*')
      ])
      setRecetas(r || [])
      setInsumos(i || [])
      setIngredientes(ing || [])
      const c = {}
      cfg?.forEach(x => { c[x.clave] = x.valor })
      setConfig({ merma_pct: c.merma_pct || 0.08, costo_envase: c.costo_envase || 794.6 })
      setLoading(false)
    }
    load()
  }, [])

  const getIngredientes = (nombre) => ingredientes.filter(i => i.receta_nombre === nombre)

  const getCosto = (nombre) => {
    const ings = getIngredientes(nombre)
    // excluir ENVASE del costo de insumos
    const ingsReceta = ings.filter(i => i.receta_nombre !== 'ENVASE')
    return calcularCostoReceta(ingsReceta, insumos, config.merma_pct, config.costo_envase)
  }

  const PRECIOS_REFERENCIA = {
    colada: 9000, daikiri: 8000, default: 9000
  }
  const getPrecio = (nombre) => {
    const n = nombre.toLowerCase()
    if (n.includes('colada')) return 9000
    if (n.includes('daikiri')) return 8000
    return 9000
  }

  if (loading) return <div className="loading">Cargando recetas...</div>

  // filtrar ENVASE de la lista de recetas
  const recetasFiltradas = recetas.filter(r => r.nombre !== 'ENVASE')

  return (
    <div className="page">
      <div className="page-title">Catálogo</div>

      {!seleccionada ? (
        <div className="card">
          {recetasFiltradas.map(r => {
            const costo = getCosto(r.nombre)
            const precio = getPrecio(r.nombre)
            const margen = precio - costo
            const margenPct = precio > 0 ? margen / precio : 0
            return (
              <div className="list-item" key={r.nombre}
                onClick={() => setSeleccionada(r.nombre)}
                style={{ cursor: 'pointer' }}>
                <div>
                  <div className="list-item-name">{r.nombre}</div>
                  <div className="list-item-sub">Costo: {formatCLP(costo)}</div>
                </div>
                <div className="list-item-right">
                  <div className="list-item-value" style={{ color: margenPct > 0.6 ? '#00ff88' : 'var(--cyan)' }}>
                    {formatPct(margenPct)}
                  </div>
                  <div className="list-item-muted">{formatCLP(margen)} margen</div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div>
          <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }}
            onClick={() => setSeleccionada(null)}>
            ← Volver
          </button>
          <div className="card">
            <div style={{ fontFamily: 'Orbitron', fontSize: 18, color: 'var(--cyan)', marginBottom: 16 }}>
              {seleccionada}
            </div>
            {(() => {
              const ings = getIngredientes(seleccionada).filter(i => i.receta_nombre !== 'ENVASE')
              const costo = getCosto(seleccionada)
              const precio = getPrecio(seleccionada)
              const margen = precio - costo
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div className="kpi-label">Costo/L</div>
                      <div style={{ color: 'var(--pink)', fontWeight: 700, fontSize: 16 }}>{formatCLP(costo)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div className="kpi-label">Precio ref.</div>
                      <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: 16 }}>{formatCLP(precio)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div className="kpi-label">Margen</div>
                      <div style={{ color: '#00ff88', fontWeight: 700, fontSize: 16 }}>{formatPct(margen / precio)}</div>
                    </div>
                  </div>
                  <div className="section-divider">Ingredientes por litro</div>
                  {ings.map(ing => {
                    const insumo = insumos.find(i => i.nombre.toLowerCase() === ing.insumo_nombre.toLowerCase())
                    const costoIng = (insumo?.costo_ppp || 0) * ing.cantidad
                    return (
                      <div className="list-item" key={ing.id}>
                        <div>
                          <div className="list-item-name" style={{ fontSize: 14 }}>{ing.insumo_nombre}</div>
                          <div className="list-item-sub">{ing.cantidad} {ing.unidad}</div>
                        </div>
                        <div className="list-item-right">
                          <div style={{ color: 'var(--muted)', fontSize: 13 }}>{formatCLP(costoIng)}</div>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 6 }}>
                    <div className="list-item">
                      <div className="list-item-name">Merma (8%)</div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>{formatCLP(ings.reduce((s, ing) => {
                        const ins = insumos.find(i => i.nombre.toLowerCase() === ing.insumo_nombre.toLowerCase())
                        return s + (ins?.costo_ppp || 0) * ing.cantidad
                      }, 0) * config.merma_pct)}</div>
                    </div>
                    <div className="list-item">
                      <div className="list-item-name">Envase + etiqueta</div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>{formatCLP(config.costo_envase)}</div>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
