import React, { useCallback, useEffect, useState } from 'react'
import {
  FRASCOS_POR_CANJE, cargarSaldo, movimientosDeCliente,
  registrarMovimientoSuelto, borrarMovimientoSuelto,
} from '../lib/frascos'

// Frascos en la ficha del cliente: saldo, historial, devolución sin pedido
// (la dejó en el punto de retiro) y ajuste manual del saldo.
//
// El ajuste no mueve stock. Sirve, por ejemplo, para la regla antigua que se
// le respeta a Isidora ($1.000 menos por 1 frasco por pedido): se registra la
// devolución del frasco en el pedido y un ajuste −1 con esa nota, y el
// descuento se hace bajando el precio del trago.
const TIPO_LABEL = { devolucion: 'Devolución', canje: 'Canje', ajuste: 'Ajuste' }
const CANAL_LABEL = { puerta: 'puerta', punto_retiro: 'punto de retiro', otro: 'otro' }

function Stepper({ valor, onChange, min = 0 }) {
  const btn = { background: 'none', border: 'none', color: 'var(--text)', fontSize: 17, width: 30, height: 28, cursor: 'pointer' }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8 }}>
      <button type="button" style={btn} aria-label="uno menos" onClick={() => onChange(Math.max(min, valor - 1))}>−</button>
      <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
      <button type="button" style={btn} aria-label="uno más" onClick={() => onChange(valor + 1)}>+</button>
    </div>
  )
}

export default function FrascosFicha({ clienteId, onToast }) {
  const [estado, setEstado] = useState('cargando') // cargando | ok | sin_migracion
  const [saldo, setSaldo] = useState(null)
  const [movs, setMovs] = useState([])
  const [modo, setModo] = useState(null) // null | 'devolucion' | 'ajuste'
  const [aceptados, setAceptados] = useState(0)
  const [rechazados, setRechazados] = useState(0)
  const [ajuste, setAjuste] = useState(0)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const r = await cargarSaldo(clienteId)
    if (r.sinMigracion) { setEstado('sin_migracion'); return }
    setSaldo(r.saldo)
    setMovs(await movimientosDeCliente(clienteId))
    setEstado('ok')
  }, [clienteId])
  useEffect(() => { cargar() }, [cargar])

  const titulo = { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }
  const caja = { background: 'rgba(143,255,240,0.04)', border: '1px solid rgba(143,255,240,0.18)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }

  if (estado === 'sin_migracion') {
    return (
      <div style={caja}>
        <div style={titulo}>🫙 Frascos</div>
        <div style={{ fontSize: 12, color: '#f59e0b' }}>Falta correr la migración 20260923_frascos_retornables.sql.</div>
      </div>
    )
  }
  if (estado === 'cargando' || !saldo) {
    return <div style={caja}><div style={titulo}>🫙 Frascos</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>cargando…</div></div>
  }

  const cerrar = () => { setModo(null); setAceptados(0); setRechazados(0); setAjuste(0); setNota('') }

  const guardar = async () => {
    if (modo === 'devolucion' && aceptados === 0 && rechazados === 0) return
    if (modo === 'ajuste' && (ajuste === 0 || !nota.trim())) { onToast?.('El ajuste necesita cantidad y nota'); return }
    setGuardando(true)
    const r = modo === 'devolucion'
      ? await registrarMovimientoSuelto({ clienteId, tipo: 'devolucion', aceptados, rechazados, canal: 'punto_retiro', nota })
      : await registrarMovimientoSuelto({ clienteId, tipo: 'ajuste', aceptados: ajuste, nota })
    setGuardando(false)
    if (!r.ok) { onToast?.('No se guardó: ' + (r.error?.message || 'error')); return }
    onToast?.(r.avisoStock ? 'Guardado · OJO con el stock: ' + r.avisoStock : 'Frascos guardados ✓')
    cerrar()
    cargar()
  }

  const borrar = async (m) => {
    const r = await borrarMovimientoSuelto(m)
    if (!r.ok) { onToast?.('No se borró: ' + (r.error?.message || 'error')); return }
    onToast?.('Movimiento borrado')
    cargar()
  }

  const faltan = Math.max(0, FRASCOS_POR_CANJE - saldo.disponible)
  const btnLink = { background: 'none', border: '1px solid var(--border)', color: 'var(--cyan)', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }

  return (
    <div style={caja}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={titulo}>🫙 Frascos</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#8ffff0', fontVariantNumeric: 'tabular-nums' }}>{saldo.saldo}</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
        {saldo.vencido
          ? `Vencido el ${saldo.vence} (6 meses sin devolver)`
          : saldo.saldo === 0 && movs.length === 0
            ? 'Sin frascos devueltos todavía'
            : `${faltan === 0 ? 'Le alcanza para un Mojito' : `Faltan ${faltan} para el canje`}${saldo.vence ? ` · vence ${saldo.vence}` : ''}`}
        {saldo.devueltos > 0 && ` · devolvió ${saldo.devueltos}, ${saldo.canjes} canje${saldo.canjes === 1 ? '' : 's'}${saldo.rechazados ? `, ${saldo.rechazados} rechazados` : ''}`}
      </div>

      {!modo && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btnLink} onClick={() => setModo('devolucion')}>+ Devolución sin pedido</button>
          <button type="button" style={{ ...btnLink, color: 'var(--muted)' }} onClick={() => setModo('ajuste')}>Ajuste</button>
        </div>
      )}

      {modo && (
        <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
          {modo === 'devolucion' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>Aceptados</span><Stepper valor={aceptados} onChange={setAceptados} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>Rechazados</span><Stepper valor={rechazados} onChange={setRechazados} />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>Suma al saldo</span>
              <Stepper valor={ajuste} onChange={setAjuste} min={-99} />
            </div>
          )}
          <input type="text" className="form-input" value={nota} onChange={e => setNota(e.target.value)}
            placeholder={modo === 'ajuste' ? 'Motivo (obligatorio), ej: regla antigua $1.000' : 'Nota (opcional)'} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={cerrar}>Cancelar</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {movs.length > 0 && (
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {movs.slice(0, 8).map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
              <span>
                {m.fecha} · {TIPO_LABEL[m.tipo] || m.tipo}
                {m.canal ? ` · ${CANAL_LABEL[m.canal] || m.canal}` : ''}
                {m.rechazados ? ` · ${m.rechazados} rech.` : ''}
                {m.nota ? ` · ${m.nota}` : ''}
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                <b style={{ color: m.aceptados >= 0 ? '#8ffff0' : '#ff4fd8', fontVariantNumeric: 'tabular-nums' }}>
                  {m.aceptados > 0 ? `+${m.aceptados}` : m.aceptados}
                </b>
                {!m.orden_id && (
                  <button type="button" onClick={() => borrar(m)} aria-label="Borrar movimiento"
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                )}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.8 }}>Los movimientos de un pedido se cambian editando el pedido.</div>
        </div>
      )}
    </div>
  )
}
