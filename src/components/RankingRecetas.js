// ─────────────────────────────────────────────────────────────────────────────
// Componente RankingRecetas
// Lista COMPLETA de recetas con: litros vendidos, velocidad (u/semana),
// ganancia, margen %, días en carta y badge "Nueva" si <30 días.
// Permite ordenar por cualquier columna.
//
// Usado desde el Dashboard (RecetasComparativo) y desde Análisis (AnalisisRecetas)
// mediante un botón "Ver todas" que lo expande inline.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react'
import { formatCLP, formatPct } from '../lib/calculos'

// Parsea "YYYY-MM-DD" sin desfase de zona horaria
function parseFecha(f) {
  if (!f) return null
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const UMBRAL_NUEVA_DIAS = 30

/**
 * @param {Object} p
 * @param {Array} p.ventas             filas con receta_nombre, fecha, litros, precio_venta
 * @param {Object} p.costoPorReceta    { nombreReceta: costoUnitario } — opcional, para margen
 */
export default function RankingRecetas({ ventas = [], costoPorReceta = {} }) {
  const [orden, setOrden] = useState('litros') // litros | velocidad | ganancia | margen | dias
  const [direccion, setDireccion] = useState('desc')

  const hoy = new Date()

  // Agregar datos por receta
  const stats = {}
  ventas.forEach(v => {
    if (!v.receta_nombre) return
    if (!stats[v.receta_nombre]) {
      stats[v.receta_nombre] = {
        nombre: v.receta_nombre,
        litros: 0,
        ingreso: 0,
        primeraFecha: v.fecha,
        ultimaFecha: v.fecha,
        nVentas: 0,
      }
    }
    const r = stats[v.receta_nombre]
    const cantidad = parseFloat(v.litros) || 1
    r.litros += cantidad
    r.ingreso += cantidad * (parseFloat(v.precio_venta) || 0)
    r.nVentas += 1
    if (v.fecha && v.fecha < r.primeraFecha) r.primeraFecha = v.fecha
    if (v.fecha && v.fecha > r.ultimaFecha) r.ultimaFecha = v.fecha
  })

  // Enriquecer con velocidad, ganancia, margen, días en carta
  const recetas = Object.values(stats).map(r => {
    const primera = parseFecha(r.primeraFecha)
    const dias = primera ? Math.max(1, Math.round((hoy - primera) / (1000 * 60 * 60 * 24)) + 1) : 1
    const semanas = dias / 7
    const velocidad = r.litros / Math.max(0.1, semanas) // u/semana
    const costoUnit = costoPorReceta[r.nombre] || 0
    const costoTotal = costoUnit * r.litros
    const ganancia = r.ingreso - costoTotal
    const margen = r.ingreso > 0 ? ganancia / r.ingreso : 0
    const esNueva = dias <= UMBRAL_NUEVA_DIAS
    return {
      ...r,
      dias,
      velocidad,
      costoUnit,
      ganancia,
      margen,
      esNueva,
    }
  })

  // Ordenar
  const ordenadas = recetas.slice().sort((a, b) => {
    const mult = direccion === 'desc' ? -1 : 1
    if (orden === 'nombre') return mult * a.nombre.localeCompare(b.nombre)
    if (orden === 'dias') return mult * (a.dias - b.dias)
    if (orden === 'velocidad') return mult * (a.velocidad - b.velocidad)
    if (orden === 'ganancia') return mult * (a.ganancia - b.ganancia)
    if (orden === 'margen') return mult * (a.margen - b.margen)
    return mult * (a.litros - b.litros) // default: litros
  })

  const cambiarOrden = (campo) => {
    if (orden === campo) {
      setDireccion(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setOrden(campo)
      setDireccion('desc')
    }
  }

  if (recetas.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 13 }}>
        Sin recetas con ventas en este período.
      </div>
    )
  }

  const TH = ({ campo, label, alignRight }) => (
    <button
      onClick={() => cambiarOrden(campo)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 10, color: orden === campo ? 'var(--cyan)' : 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700,
        padding: '4px 2px',
        textAlign: alignRight ? 'right' : 'left',
        width: '100%',
      }}>
      {label}{orden === campo && (direccion === 'desc' ? ' ↓' : ' ↑')}
    </button>
  )

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.6 }}>
        Toca una columna para ordenar. Las recetas con menos de {UMBRAL_NUEVA_DIAS} días en carta llevan el badge 🆕 — no compares sus volúmenes absolutos con las antiguas.
      </div>

      {/* Header de columnas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '24px 1.6fr 0.9fr 0.9fr 1fr 0.7fr',
        gap: 6, alignItems: 'center',
        paddingBottom: 6,
        borderBottom: '1px solid var(--border)',
        marginBottom: 6,
      }}>
        <span />
        <TH campo="nombre" label="Receta" />
        <TH campo="litros" label="Litros" alignRight />
        <TH campo="velocidad" label="u/sem" alignRight />
        <TH campo="ganancia" label="Ganancia" alignRight />
        <TH campo="margen" label="Margen" alignRight />
      </div>

      {/* Filas */}
      {ordenadas.map((r, i) => {
        const colorMargen = r.margen >= 0.65 ? 'var(--green)'
                          : r.margen >= 0.50 ? 'var(--cyan)'
                          : 'var(--pink)'
        return (
          <div key={r.nombre} style={{
            display: 'grid',
            gridTemplateColumns: '24px 1.6fr 0.9fr 0.9fr 1fr 0.7fr',
            gap: 6, alignItems: 'center',
            padding: '8px 0',
            borderBottom: i < ordenadas.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            fontSize: 12,
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              background: i === 0 ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: i === 0 ? '#000' : 'var(--muted)',
              flexShrink: 0,
            }}>{i + 1}</span>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.nombre}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 4, alignItems: 'center', marginTop: 1 }}>
                {r.esNueva && (
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 6,
                    background: 'rgba(127,119,221,0.15)', color: '#AFA9EC',
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3,
                  }}>🆕 Nueva</span>
                )}
                <span>{r.dias}d en carta</span>
              </div>
            </div>

            <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>
              {r.litros % 1 === 0 ? r.litros : r.litros.toFixed(1)}L
            </div>
            <div style={{ textAlign: 'right', color: 'var(--cyan)', fontWeight: 600 }}>
              {r.velocidad.toFixed(1)}
            </div>
            <div style={{ textAlign: 'right', color: r.ganancia >= 0 ? 'var(--green)' : 'var(--pink)', fontWeight: 700 }}>
              {formatCLP(r.ganancia)}
            </div>
            <div style={{ textAlign: 'right', color: colorMargen, fontWeight: 700 }}>
              {formatPct(r.margen)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
