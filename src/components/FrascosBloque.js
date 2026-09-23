import React from 'react'
import { FRASCOS_POR_CANJE } from '../lib/frascos'

// Bloque «Frascos» del formulario de pedido (nuevo y editar).
// Muestra el saldo del cliente antes de este pedido, los contadores de hoy y
// el botón de canje. No guarda nada: el formulario lo hace al confirmar.
//
// props:
//   estado: 'sin_cliente' | 'cargando' | 'sin_migracion' | 'ok'
//   saldo: objeto de lib/frascos (disponible, vencido, vence…)
//   aceptados, rechazados, setAceptados, setRechazados
//   canjesEnPedido: nº de ítems marcados como canje
//   onCanjear: agrega el ítem de canje
//   hayPagado: el pedido tiene al menos un trago pagado
function Stepper({ valor, onChange, label }) {
  const btn = {
    background: 'none', border: 'none', color: 'var(--text)', fontSize: 18,
    width: 34, height: 30, cursor: 'pointer', lineHeight: 1,
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8 }}>
        <button type="button" style={btn} aria-label={`${label}: uno menos`}
          onClick={() => onChange(Math.max(0, valor - 1))}>−</button>
        <span style={{ minWidth: 30, textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)' }}>{valor}</span>
        <button type="button" style={btn} aria-label={`${label}: uno más`}
          onClick={() => onChange(valor + 1)}>+</button>
      </div>
    </div>
  )
}

export default function FrascosBloque({ estado, saldo, aceptados, rechazados, setAceptados, setRechazados, canjesEnPedido, onCanjear, hayPagado }) {
  const caja = {
    background: 'rgba(143,255,240,0.04)', border: '1px solid rgba(143,255,240,0.18)',
    borderRadius: 10, padding: 12, marginTop: 12, display: 'grid', gap: 10,
  }
  const titulo = { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }

  if (estado === 'sin_cliente') {
    return (
      <div style={caja}>
        <div style={titulo}>🫙 Frascos</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Elige el cliente desde la lista de sugerencias para ver su saldo y registrar frascos.</div>
      </div>
    )
  }
  if (estado === 'sin_migracion') {
    return (
      <div style={caja}>
        <div style={titulo}>🫙 Frascos</div>
        <div style={{ fontSize: 12, color: '#f59e0b' }}>Falta correr la migración 20260923_frascos_retornables.sql en Supabase.</div>
      </div>
    )
  }

  const disponible = saldo?.disponible || 0
  const total = disponible + aceptados - FRASCOS_POR_CANJE * canjesEnPedido
  const alcanza = disponible + aceptados >= FRASCOS_POR_CANJE
  const puedeCanjear = alcanza && canjesEnPedido === 0 && hayPagado
  const puntos = Math.min(FRASCOS_POR_CANJE, Math.max(0, disponible + aceptados))

  return (
    <div style={caja}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={titulo}>🫙 Frascos</div>
        <div style={{ fontSize: 13, color: '#8ffff0', fontVariantNumeric: 'tabular-nums' }}>
          {estado === 'cargando' ? 'cargando…' : (
            <>saldo {disponible}{aceptados || canjesEnPedido ? ` → ${total}` : ''}</>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5 }} aria-hidden="true">
        {Array.from({ length: FRASCOS_POR_CANJE }).map((_, i) => (
          <span key={i} style={{
            width: 16, height: 22, borderRadius: '3px 3px 5px 5px',
            border: '1.5px solid #8ffff0',
            background: i < puntos ? 'rgba(143,255,240,0.55)' : 'transparent',
          }} />
        ))}
      </div>

      {saldo?.vencido && (
        <div style={{ fontSize: 12, color: '#f59e0b' }}>
          Tenía {saldo.saldo} frascos, pero vencieron el {saldo.vence} (6 meses sin devolver). No cuentan para canjear.
        </div>
      )}

      <Stepper label="Aceptados hoy" valor={aceptados} onChange={setAceptados} />
      <Stepper label="Rechazados (no suman)" valor={rechazados} onChange={setRechazados} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {canjesEnPedido > 0
            ? '✓ Canje agregado a los productos'
            : alcanza
              ? (hayPagado ? 'Le alcanza para un Mojito' : 'Para canjear necesita 1 trago pagado')
              : `Faltan ${FRASCOS_POR_CANJE - (disponible + aceptados)} para el canje`}
        </span>
        <button type="button" onClick={onCanjear} disabled={!puedeCanjear}
          style={{
            fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '7px 12px',
            cursor: puedeCanjear ? 'pointer' : 'default',
            border: `1px solid ${puedeCanjear ? '#ff4fd8' : 'var(--border)'}`,
            color: puedeCanjear ? '#ff4fd8' : 'var(--muted)',
            background: puedeCanjear ? 'rgba(255,79,216,0.08)' : 'none',
          }}>
          Canjear Mojito (−{FRASCOS_POR_CANJE})
        </button>
      </div>
    </div>
  )
}
