// ─────────────────────────────────────────────────────────────────────────────
// Utilitario de EXPORTACIÓN a CSV
// Centraliza la lógica de:
//  - escapado correcto de campos (comillas, comas, saltos de línea)
//  - separador ; (no ,) porque Excel español/chileno interpreta así por defecto
//    y los CLP llevan punto/coma como separador decimal
//  - BOM UTF-8 para que Excel abra los emojis y tildes correctamente
//  - descarga vía blob (no requiere backend)
// ─────────────────────────────────────────────────────────────────────────────

// Escapa un valor para CSV con separador `;`.
function escaparCampo(val) {
  if (val == null) return ''
  const s = String(val)
  // Si contiene ; " o salto de línea, hay que rodear de comillas y duplicar comillas internas.
  if (/[";\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Genera el contenido CSV.
 * @param {Array<string>} headers
 * @param {Array<Array>}  rows
 */
function generarCSV(headers, rows) {
  const sep = ';'
  const linHeaders = headers.map(escaparCampo).join(sep)
  const linRows = rows.map(r => r.map(escaparCampo).join(sep))
  // BOM UTF-8 al inicio para que Excel detecte la codificación
  return '﻿' + [linHeaders, ...linRows].join('\r\n')
}

/**
 * Dispara la descarga de un CSV en el navegador.
 * @param {string} nombre  nombre del archivo (sin extensión)
 * @param {Array<string>} headers  fila de encabezados
 * @param {Array<Array>}  rows  filas de datos (cada fila es un array de valores)
 */
export function descargarCSV(nombre, headers, rows) {
  const csv = generarCSV(headers, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const hoy = new Date()
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  link.href = url
  link.download = `${nombre}_${fecha}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ─── Componente botón estándar ──────────────────────────────────────────────
import React from 'react'
export function BotonExportar({ onClick, label = 'Exportar CSV', size = 'sm' }) {
  const padding = size === 'sm' ? '5px 10px' : '8px 14px'
  const fontSize = size === 'sm' ? 11 : 13
  return (
    <button onClick={onClick}
      style={{
        background: 'rgba(0,180,180,0.08)',
        border: '1px solid var(--cyan-dim)',
        borderRadius: 8, color: 'var(--cyan)',
        cursor: 'pointer', fontSize, padding,
        fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      {label}
    </button>
  )
}
