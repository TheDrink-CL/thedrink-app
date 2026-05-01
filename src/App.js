import React, { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Ventas from './pages/Ventas'
import Compras from './pages/Compras'
import Caja from './pages/Caja'
import Analisis from './pages/Analisis'
import Proyectos from './pages/Proyectos'
import Cuentas from './pages/Cuentas'
import Catalogo from './pages/Catalogo'

const TABS_MAIN = [
  { id: 'dashboard', label: 'Inicio', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )},
  { id: 'ventas', label: 'Venta', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>
  )},
  { id: 'compras', label: 'Compra', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
    </svg>
  )},
  { id: 'caja', label: 'Caja', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  )},
  { id: 'analisis', label: 'Análisis', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )},
]

const TABS_MAS = [
  { id: 'proyectos', label: 'Proyectos', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="13" y2="17"/>
    </svg>
  )},
  { id: 'catalogo', label: 'Recetas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  )},
  { id: 'cuentas', label: 'Cuentas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )},
]

const ALL_TABS = [...TABS_MAIN, ...TABS_MAS]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [menuMas, setMenuMas] = useState(false)

  const isEnMas = TABS_MAS.some(t => t.id === tab)

  const handleNavClick = (id) => {
    setTab(id)
    setMenuMas(false)
  }

  return (
    <div>
      {tab === 'dashboard'  && <Dashboard />}
      {tab === 'ventas'     && <Ventas />}
      {tab === 'compras'    && <Compras />}
      {tab === 'caja'       && <Caja />}
      {tab === 'analisis'   && <Analisis />}
      {tab === 'proyectos'  && <Proyectos />}
      {tab === 'cuentas'    && <Cuentas />}
      {tab === 'catalogo'   && <Catalogo />}

      {/* Menú "Más" desplegable */}
      {menuMas && (
        <>
          <div onClick={() => setMenuMas(false)}
            style={{ position:'fixed', inset:0, zIndex:90 }} />
          <div style={{
            position:'fixed', bottom:70, right:12, zIndex:100,
            background:'var(--card)', border:'1px solid var(--border)',
            borderRadius:14, padding:8, minWidth:170,
            boxShadow:'0 8px 32px rgba(0,0,0,0.5)'
          }}>
            {TABS_MAS.map(t => (
              <button key={t.id} onClick={() => handleNavClick(t.id)}
                style={{
                  display:'flex', alignItems:'center', gap:12,
                  width:'100%', background: tab === t.id ? 'rgba(0,180,180,0.1)' : 'none',
                  border:'none', borderRadius:10, padding:'10px 14px',
                  color: tab === t.id ? 'var(--cyan)' : 'var(--text)',
                  cursor:'pointer', fontSize:14, fontWeight: tab === t.id ? 700 : 400
                }}>
                <span style={{ width:20, height:20, display:'block' }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      <nav className="bottom-nav">
        {TABS_MAIN.map(t => (
          <button key={t.id} className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => { setMenuMas(false); setTab(t.id) }}>
            {t.icon}
            {t.label}
          </button>
        ))}
        {/* Botón "Más" */}
        <button className={`nav-btn ${isEnMas ? 'active' : ''}`}
          onClick={() => setMenuMas(m => !m)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1" fill="currentColor"/>
            <circle cx="12" cy="12" r="1" fill="currentColor"/>
            <circle cx="12" cy="19" r="1" fill="currentColor"/>
          </svg>
          Más
        </button>
      </nav>
    </div>
  )
}
