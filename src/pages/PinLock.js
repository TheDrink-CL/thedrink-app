import React, { useState, useEffect } from 'react'

const PIN_CORRECTO = '085279'
const SESSION_KEY = 'thedrink_unlocked'

export function isPinUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

export function lockApp() {
  sessionStorage.removeItem(SESSION_KEY)
}

export default function PinLock({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const handleDigito = (d) => {
    if (pin.length >= 6) return
    const nuevo = pin + d
    setPin(nuevo)
    setError(false)

    if (nuevo.length === 6) {
      setTimeout(() => {
        if (nuevo === PIN_CORRECTO) {
          sessionStorage.setItem(SESSION_KEY, '1')
          onUnlock()
        } else {
          setError(true)
          setShake(true)
          setTimeout(() => { setPin(''); setShake(false) }, 600)
        }
      }, 120)
    }
  }

  const handleBorrar = () => {
    setPin(p => p.slice(0, -1))
    setError(false)
  }

  const TECLADO = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    [null,'0','⌫'],
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      userSelect: 'none',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: 30,
          fontWeight: 900,
          color: 'var(--cyan)',
          letterSpacing: 4,
          marginBottom: 6,
        }}>
          THE DRINK
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--muted)',
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}>
          Ingresá tu PIN
        </div>
      </div>

      {/* Puntos del PIN */}
      <div style={{
        display: 'flex',
        gap: 14,
        marginBottom: 36,
        animation: shake ? 'shake 0.5s ease' : 'none',
      }}>
        {[0,1,2,3,4,5].map(i => (
          <div key={i} style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: `2px solid ${error ? 'var(--pink)' : 'rgba(0,180,180,0.5)'}`,
            background: i < pin.length
              ? (error ? 'var(--pink)' : 'var(--cyan)')
              : 'transparent',
            transition: 'background 0.15s, border-color 0.15s',
          }} />
        ))}
      </div>

      {/* Mensaje error */}
      <div style={{
        height: 20,
        marginBottom: 24,
        fontSize: 13,
        color: 'var(--pink)',
        fontWeight: 600,
        opacity: error ? 1 : 0,
        transition: 'opacity 0.2s',
      }}>
        PIN incorrecto
      </div>

      {/* Teclado numérico */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TECLADO.map((fila, fi) => (
          <div key={fi} style={{ display: 'flex', gap: 12 }}>
            {fila.map((d, di) => (
              <button
                key={di}
                onClick={() => {
                  if (d === null) return
                  if (d === '⌫') handleBorrar()
                  else handleDigito(d)
                }}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  border: d === null ? 'none' : '1px solid var(--border)',
                  background: d === null
                    ? 'transparent'
                    : d === '⌫'
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.06)',
                  color: d === '⌫' ? 'var(--muted)' : 'var(--text)',
                  fontSize: d === '⌫' ? 20 : 24,
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 600,
                  cursor: d === null ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.1s, transform 0.1s',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseDown={e => { if (d !== null) e.currentTarget.style.transform = 'scale(0.93)' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                onTouchStart={e => { if (d !== null) e.currentTarget.style.transform = 'scale(0.93)' }}
                onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                {d}
              </button>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
