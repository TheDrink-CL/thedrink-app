// Ficha de un insumo en Stock: qué lo movió desde el último conteo.
// La cuenta sale de lib/movimientos.js; acá solo se muestra, con lo que
// conviene revisar primero (compras raras, ventas tardías, comandas
// pendientes) arriba de la lista.
import React, { useEffect, useState } from 'react'
import { cargarMovimientos } from '../lib/movimientos'

const num = (n) => {
  const a = Math.abs(n)
  const d = a >= 100 || Number.isInteger(n) ? 0 : 1
  return Number(n.toFixed(d)).toLocaleString('es-CL')
}
const conSigno = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n))
const diaMes = (f) => {
  if (!f) return ''
  const [, m, d] = f.split('-')
  return `${Number(d)}-${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1]}`
}

const TIPO = {
  compra: { label: 'Compra', color: 'var(--green)' },
  venta: { label: 'Venta', color: 'var(--text)' },
  salida: { label: 'Salida', color: '#f59e0b' },
  bolsa: { label: 'Pedido', color: 'var(--text)' },
  devolucion: { label: 'Devolución', color: 'var(--green)' },
}

export default function MovimientosInsumo({ insumo, insumos, onEditar, onFueraDeTemporada, onCerrar }) {
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    cargarMovimientos(insumo, insumos)
      .then(r => { if (vivo) setRes(r) })
      .catch(e => { if (vivo) setError(e.message || 'No se pudieron cargar los movimientos') })
    return () => { vivo = false }
  }, [insumo, insumos])

  const u = insumo.unidad || ''
  // Bajo esto la diferencia es redondeo (merma con decimales), no un hueco.
  const tolerancia = u === 'un' ? 0.5 : 5

  const revisar = res && !res.sinConteo ? res.filas.filter(f => f.avisos.length) : []
  revisar.sort((a, b) => Number(b.fuerte) - Number(a.fuerte))
  const hayDiferencia = res && !res.sinConteo && Math.abs(res.diferencia) > tolerancia

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex',
      alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: 16, overflowY: 'auto',
    }} onClick={onCerrar}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
        padding: 18, maxWidth: 520, width: '100%', marginBottom: 40,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-strong)' }}>{insumo.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Movimientos desde el último conteo</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        {error && <div style={{ color: 'var(--pink)', fontSize: 13, margin: '12px 0' }}>{error}</div>}
        {!res && !error && <div className="loading" style={{ padding: 24 }}>Armando la cuenta...</div>}

        {res?.sinConteo && (
          <div style={{ fontSize: 13, color: 'var(--muted)', margin: '14px 0', lineHeight: 1.6 }}>
            Este insumo nunca se ha contado, así que no hay desde dónde partir la cuenta.
            Cuéntalo en <b>Conteo</b> y desde ahí vas a ver cada compra, venta y salida que lo mueva.
          </div>
        )}

        {res && !res.sinConteo && (
          <>
            {/* La cuenta en una línea: conteo → registros → app */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '14px 0' }}>
              <Cifra titulo={`Conteo ${diaMes(res.inicio.fecha)}`} valor={`${num(res.inicio.cantidad)} ${u}`} />
              <Cifra titulo="Según registros" valor={`${num(res.calculado)} ${u}`} />
              <Cifra titulo="Dice la app" valor={`${num(res.app)} ${u}`} destacado />
            </div>

            {hayDiferencia && (
              <Aviso color="var(--pink)">
                La app tiene <b>{conSigno(res.diferencia)} {u}</b> que ningún registro explica: una edición a mano
                en Stock, una receta cambiada después de vender, o un pedido de antes del conteo que se editó después.
              </Aviso>
            )}

            {(revisar.length > 0 || res.pendientes.length > 0) && (
              <div style={{ margin: '4px 0 14px' }}>
                <div className="card-title" style={{ marginBottom: 6 }}>Para revisar</div>
                {revisar.map((f, i) => (
                  <Aviso key={'r' + i} color={f.fuerte ? 'var(--pink)' : '#f59e0b'}>
                    <b>{TIPO[f.tipo]?.label} {diaMes(f.fecha)}</b> · {f.detalle} ({conSigno(f.delta)} {u})
                    <div>{f.avisos.join(' · ')}</div>
                  </Aviso>
                ))}
                {res.pendientes.map(p => (
                  <Aviso key={'p' + p.id} color="var(--cyan)">
                    <b>Comanda #{p.id} pendiente</b> ({diaMes(p.fecha)}) · {p.detalle}
                    <div>Todavía no descuenta {num(Math.abs(p.delta))} {u}. Si ya se entregó, conviértela en venta; si se cargó a mano, archívala.</div>
                  </Aviso>
                ))}
              </div>
            )}

            <div className="card-title" style={{ marginBottom: 4 }}>Detalle</div>
            <Fila fecha={res.inicio.fecha} tipo="Conteo" detalle="Contado" delta={null} saldo={res.inicio.cantidad} u={u} color="var(--cyan)" />
            {res.filas.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 0' }}>Nada lo ha movido desde el conteo.</div>
            )}
            {res.filas.map((f, i) => (
              <Fila key={i} fecha={f.fecha} tipo={TIPO[f.tipo]?.label} detalle={f.detalle} delta={f.delta}
                saldo={f.saldo} u={u} color={TIPO[f.tipo]?.color} marca={f.avisos.length ? (f.fuerte ? 'var(--pink)' : '#f59e0b') : null} />
            ))}
          </>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Si el número está mal, corrígelo contando en <b>Conteo</b>: queda registro y la cuenta vuelve a partir de ahí.
          Editarlo a mano no deja rastro.
        </div>
        <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={onEditar}>
          Editar stock o alerta mínima
        </button>
        {onFueraDeTemporada && (
          <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8, color: 'var(--muted)' }} onClick={onFueraDeTemporada}>
            Fuera de temporada (esconder hasta que se vuelva a comprar)
          </button>
        )}
      </div>
    </div>
  )
}

function Cifra({ titulo, valor, destacado }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '8px 10px',
      border: destacado ? '1px solid var(--border)' : '1px solid transparent',
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{titulo}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>{valor}</div>
    </div>
  )
}

function Aviso({ color, children }) {
  return (
    <div style={{
      borderLeft: `3px solid ${color}`, background: 'rgba(255,255,255,0.03)', borderRadius: 6,
      padding: '8px 10px', marginBottom: 8, fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
    }}>{children}</div>
  )
}

function Fila({ fecha, tipo, detalle, delta, saldo, u, color, marca }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13,
    }}>
      <div style={{ width: 44, flexShrink: 0, fontSize: 11, color: 'var(--muted)' }}>{diaMes(fecha)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, color }}>{tipo}</span>
        {marca && <span style={{ color: marca, marginLeft: 4 }}>●</span>}
        <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detalle}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {delta != null && <div style={{ fontWeight: 700, color: delta > 0 ? 'var(--green)' : 'var(--text)' }}>{conSigno(delta)}</div>}
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{num(saldo)} {u}</div>
      </div>
    </div>
  )
}
