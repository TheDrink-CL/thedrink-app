import React, { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import Ventas from './pages/Ventas'
import Compras from './pages/Compras'
import Caja from './pages/Caja'
import Analisis from './pages/Analisis'
import Proyectos from './pages/Proyectos'
import Cuentas from './pages/Cuentas'
import Catalogo from './pages/Catalogo'
import Stock from './pages/Stock'
import Conteo from './pages/Conteo'
import Clientes from './pages/Clientes'
import Aprendizajes from './pages/Aprendizajes'
import Proyecciones from './pages/Proyecciones'
import Conciliacion from './pages/Conciliacion'
import Horas from './pages/Horas'
import Alertas, { useAlertasCount } from './pages/Alertas'
import Opiniones, { useOpinionesCount } from './pages/Opiniones'
import MiDinero from './pages/MiDinero'
import DeliveryLogin, { isDeliveryUnlocked } from './pages/DeliveryLogin'
import DeliveryPanel from './pages/DeliveryPanel'
import PinLock, { isPinUnlocked } from './pages/PinLock'
import AuthLock from './pages/AuthLock'
import { supabase } from './lib/supabase'
import ImportarPedido from './pages/ImportarPedido'
import Comandas from './pages/Comandas'
import ComandasPendientes from './pages/ComandasPendientes'
import Indicadores from './pages/Indicadores'
import Reactivar from './pages/Reactivar'

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
  { id: 'indicadores', label: 'Panel', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="20" x2="12" y2="10"/>
      <line x1="18" y1="20" x2="18" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="16"/>
    </svg>
  )},
]

const TABS_MAS = [
  { id: 'analisis', label: 'Analisis', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )},
  { id: 'reactivar', label: 'Reactivar', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  )},
  { id: 'clientes', label: 'Clientes', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )},
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
  { id: 'stock', label: 'Stock', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  )},
  { id: 'conteo', label: 'Conteo', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/>
    </svg>
  )},
  { id: 'aprendizajes', label: 'Aprendizajes', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )},
  { id: 'proyecciones', label: 'Proyecciones', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )},
  { id: 'conciliacion', label: 'Conciliacion', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18"/>
      <path d="M7 14l4-4 4 4 5-7"/>
      <circle cx="7" cy="14" r="1.2"/>
      <circle cx="15" cy="14" r="1.2"/>
    </svg>
  )},
  { id: 'horas', label: 'Horas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9"/>
      <polyline points="12 7 12 12 15 14"/>
    </svg>
  )},
  { id: 'alertas', label: 'Alertas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
    </svg>
  )},
  { id: 'opiniones', label: 'Opiniones', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9"/>
      <path d="M8 14.5s1.5 2 4 2 4-2 4-2"/>
      <line x1="9" y1="9.5" x2="9.01" y2="9.5"/>
      <line x1="15" y1="9.5" x2="15.01" y2="9.5"/>
    </svg>
  )},
  { id: 'comandas-pendientes', label: 'Comandas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>
    </svg>
  )},
  { id: 'importar-pedido', label: 'Importar WA', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )},
  { id: 'mi-dinero', label: 'Mi Dinero', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )},
]

const isDeliveryRoute = () => {
  const path = window.location.pathname
  return path === '/delivery' || path.startsWith('/delivery/')
}

const isTVRoute = () => {
  const path = window.location.pathname
  return path === '/tv' || path.startsWith('/tv/')
}

const isImportarRoute = () => {
  const path = window.location.pathname
  return path === '/importar' || path.startsWith('/importar/')
}

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [menuMas, setMenuMas] = useState(false)
  const [desbloqueado, setDesbloqueado] = useState(isPinUnlocked())
  const [deliveryDesbloqueado, setDeliveryDesbloqueado] = useState(isDeliveryUnlocked())
  // Sesion de Supabase Auth. null = todavia verificando; false = sin sesion;
  // true = logueado. Es el candado real: sin sesion, la base (RLS cerrado) no
  // devuelve ni acepta nada.
  const [sesion, setSesion] = useState(null)
  const alertasCount = useAlertasCount()
  const opinionesCount = useOpinionesCount()
  // El badge del boton "Mas" suma todo lo que hay pendiente ahi adentro.
  const pendientesMas = alertasCount + opinionesCount
  const badgeDe = (id) =>
    id === 'alertas' ? alertasCount : id === 'opiniones' ? opinionesCount : 0

  useEffect(() => {
    let vivo = true
    supabase.auth.getSession().then(({ data }) => {
      if (vivo) setSesion(!!data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, ses) => {
      if (vivo) setSesion(!!ses)
    })
    return () => { vivo = false; sub.subscription.unsubscribe() }
  }, [])

  const isEnMas = TABS_MAS.some(t => t.id === tab)

  // ── Candado global: nada se renderiza sin sesion valida ──────────────────
  // Cubre TODAS las rutas (main, delivery, TV, importar) porque todas leen o
  // escriben en la base, que ahora exige rol authenticated.
  if (sesion === null) return null // breve verificacion inicial
  if (!sesion) return <AuthLock onUnlock={() => setSesion(true)} />

  if (isTVRoute()) return <Comandas />
  if (isImportarRoute()) return <ImportarPedido />

  if (isDeliveryRoute()) {
    // Acceso libre al panel delivery (PIN deshabilitado por decisión del usuario).
    // Para reactivar la protección, descomenta el bloque de abajo.
    // if (!deliveryDesbloqueado) {
    //   return <DeliveryLogin onLogin={() => setDeliveryDesbloqueado(true)} />
    // }
    return (
      <DeliveryPanel
        onLogout={() => {
          sessionStorage.removeItem('thedrink_delivery_unlocked')
          setDeliveryDesbloqueado(false)
        }}
      />
    )
  }

  // Acceso libre al sitio principal (PIN deshabilitado por decisión del usuario).
  // Para reactivar la protección, descomenta el bloque de abajo.
  // if (!desbloqueado) {
  //   return <PinLock onUnlock={() => setDesbloqueado(true)} />
  // }

  const handleNavClick = (id) => {
    setTab(id)
    setMenuMas(false)
  }

  return (
    <div>
      {tab === 'dashboard'    && <Dashboard />}
      {tab === 'indicadores'  && <Indicadores />}
      {tab === 'reactivar'    && <Reactivar />}
      {tab === 'ventas'       && <Ventas />}
      {tab === 'compras'      && <Compras />}
      {tab === 'caja'         && <Caja />}
      {tab === 'analisis'     && <Analisis />}
      {tab === 'proyectos'    && <Proyectos />}
      {tab === 'cuentas'      && <Cuentas />}
      {tab === 'catalogo'     && <Catalogo />}
      {tab === 'stock'        && <Stock />}
      {tab === 'conteo'       && <Conteo />}
      {tab === 'clientes'     && <Clientes />}
      {tab === 'aprendizajes' && <Aprendizajes />}
      {tab === 'proyecciones' && <Proyecciones />}
      {tab === 'conciliacion' && <Conciliacion />}
      {tab === 'horas'        && <Horas />}
      {tab === 'alertas'      && <Alertas />}
      {tab === 'opiniones'    && <Opiniones />}
      {tab === 'mi-dinero'    && <MiDinero />}
      {tab === 'importar-pedido' && <ImportarPedido />}
      {tab === 'comandas-pendientes' && <ComandasPendientes />}

      {menuMas && (
        <>
          <div onClick={() => setMenuMas(false)}
            style={{ position:'fixed', inset:0, zIndex:90 }} />
          <div style={{
            position:'fixed', bottom:70, right:12, zIndex:100,
            background:'var(--card)', border:'1px solid var(--border)',
            borderRadius:14, padding:8, minWidth:180,
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
                <span style={{ flex:1, textAlign:'left' }}>{t.label}</span>
                {badgeDe(t.id) > 0 && (
                  <span style={{
                    background: 'var(--pink)', color: '#fff',
                    fontSize: 10, fontWeight: 800, padding: '1px 7px',
                    borderRadius: 10, minWidth: 18, textAlign: 'center',
                  }}>{badgeDe(t.id) > 99 ? '99+' : badgeDe(t.id)}</span>
                )}
              </button>
            ))}

            <div style={{ borderTop:'1px solid var(--border)', margin:'6px 0' }} />

            <button onClick={() => window.open('/delivery', '_blank')}
              style={{
                display:'flex', alignItems:'center', gap:12, width:'100%',
                background:'none', border:'none', borderRadius:10, padding:'10px 14px',
                color:'var(--muted)', cursor:'pointer', fontSize:14, fontWeight:400
              }}>
              <span style={{ fontSize:16 }}>{"🏍️"}</span>
              Panel Delivery
            </button>

            <button onClick={() => window.open('/tv', '_blank')}
              style={{
                display:'flex', alignItems:'center', gap:12, width:'100%',
                background:'none', border:'none', borderRadius:10, padding:'10px 14px',
                color:'var(--muted)', cursor:'pointer', fontSize:14, fontWeight:400
              }}>
              <span style={{ fontSize:16 }}>{"📺"}</span>
              Panel Comandas
            </button>
          </div>
        </>
      )}

      <nav className="bottom-nav">
        {TABS_MAIN.map(t => (
          <button key={t.id} className={"nav-btn " + (tab === t.id ? 'active' : '')}
            onClick={() => { setMenuMas(false); setTab(t.id) }}>
            {t.icon}
            {t.label}
          </button>
        ))}
        <button className={"nav-btn " + (isEnMas ? 'active' : '')}
          onClick={() => setMenuMas(m => !m)}
          style={{ position: 'relative' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1" fill="currentColor"/>
            <circle cx="12" cy="12" r="1" fill="currentColor"/>
            <circle cx="12" cy="19" r="1" fill="currentColor"/>
          </svg>
          {"Mas"}
          {pendientesMas > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 6,
              minWidth: 16, height: 16, padding: '0 4px',
              borderRadius: 8, background: 'var(--pink)',
              color: '#fff', fontSize: 9, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, border: '1.5px solid var(--bg)',
            }}>{pendientesMas > 99 ? '99+' : pendientesMas}</span>
          )}
        </button>
      </nav>
    </div>
  )
}
