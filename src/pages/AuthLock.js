import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Login real con Supabase Auth (cuenta compartida del bar).
//
// Por qué esto y no el PIN viejo: la app corre 100% en el navegador. Cualquier
// secreto embebido en el bundle (un PIN, una clave hardcodeada) es público. El
// único candado que sirve es una contraseña que el staff ESCRIBE y que nunca
// viaja en el código. Al loguearse, Supabase emite un token de sesión; a partir
// de ahí las peticiones van como rol `authenticated` y las políticas RLS de la
// base las dejan pasar. Sin ese login, la key publishable sola (rol anon) ya no
// puede leer ni escribir nada.
//
// El email NO es secreto (no protege por sí solo), por eso puede ir fijo aquí.
// La contraseña es la credencial real. Supabase persiste la sesión en el
// dispositivo, así que se escribe una vez por navegador.
// ─────────────────────────────────────────────────────────────────────────────

const STAFF_EMAIL = 'contacto.thedrink@gmail.com'

export default function AuthLock({ onUnlock }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [cargando, setCargando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()
    if (!password || cargando) return
    setCargando(true)
    setError(false)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: STAFF_EMAIL,
      password,
    })
    setCargando(false)
    if (err) {
      setError(true)
      setPassword('')
      return
    }
    onUnlock()
  }

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
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
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
          Ingresá tu clave
        </div>
      </div>

      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false) }}
          autoFocus
          autoComplete="current-password"
          placeholder="Contraseña"
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: 16,
            borderRadius: 12,
            border: `2px solid ${error ? 'var(--pink)' : 'var(--border)'}`,
            background: 'var(--card)',
            color: 'var(--text, #fff)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          disabled={cargando || !password}
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            borderRadius: 12,
            border: 'none',
            cursor: cargando || !password ? 'default' : 'pointer',
            opacity: cargando || !password ? 0.5 : 1,
            background: 'var(--cyan)',
            color: '#05201f',
          }}
        >
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
        {error && (
          <div style={{ color: 'var(--pink)', fontSize: 13, textAlign: 'center', letterSpacing: 1 }}>
            Clave incorrecta
          </div>
        )}
      </form>
    </div>
  )
}
