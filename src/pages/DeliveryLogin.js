import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function DeliveryLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      setError('Credenciales incorrectas. Revisá el email y contraseña.')
      setLoading(false)
      return
    }

    const role = data.user?.user_metadata?.role
    if (role !== 'delivery' && role !== 'admin') {
      await supabase.auth.signOut()
      setError('Tu usuario no tiene acceso al panel de delivery.')
      setLoading(false)
      return
    }

    onLogin(data.user)
    setLoading(false)
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
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: 28,
          fontWeight: 900,
          color: 'var(--cyan)',
          letterSpacing: 3,
          marginBottom: 6,
        }}>
          THE DRINK
        </div>
        <div style={{
          fontSize: 12,
          color: 'var(--muted)',
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}>
          Panel de Delivery
        </div>
      </div>

      {/* Card de login */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: 28,
        width: '100%',
        maxWidth: 360,
        boxShadow: '0 0 60px rgba(0,180,180,0.06)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}>
          {/* Ícono moto */}
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(0,180,180,0.12)',
            border: '1px solid rgba(0,180,180,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}>
            🏍️
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              placeholder="tu@email.com"
              autoComplete="email"
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-input"
              value={password}
              placeholder="••••••••"
              autoComplete="current-password"
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(196,0,90,0.12)',
              border: '1px solid rgba(196,0,90,0.3)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              color: 'var(--pink)',
              marginBottom: 16,
              lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.15)', letterSpacing: 1 }}>
        ACCESO RESTRINGIDO
      </div>
    </div>
  )
}
