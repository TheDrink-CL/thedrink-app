import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ESTADOS = ['idea', 'en_curso', 'hecho']
const ESTADO_LABEL = { idea: '💡 Idea', en_curso: '🔨 En curso', hecho: '✅ Hecho' }
const ESTADO_COLOR = {
  idea: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  en_curso: { bg: 'rgba(0,180,180,0.10)', color: 'var(--cyan)', border: 'rgba(0,180,180,0.3)' },
  hecho: { bg: 'rgba(16,185,129,0.10)', color: 'var(--green)', border: 'rgba(16,185,129,0.3)' },
}
const PRIORIDADES = ['alta', 'media', 'baja']
const PRIO_COLOR = { alta: 'var(--pink)', media: '#f59e0b', baja: 'var(--muted)' }
const PRIO_LABEL = { alta: '🔴 Alta', media: '🟡 Media', baja: '⚪ Baja' }

function ProyectoModal({ proyecto, onSave, onCancel }) {
  const [titulo, setTitulo] = useState(proyecto?.titulo || '')
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion || '')
  const [estado, setEstado] = useState(proyecto?.estado || 'idea')
  const [prioridad, setPrioridad] = useState(proyecto?.prioridad || 'media')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!titulo.trim()) return
    setSaving(true)
    if (proyecto?.id) {
      await supabase.from('proyectos').update({ titulo, descripcion, estado, prioridad }).eq('id', proyecto.id)
    } else {
      await supabase.from('proyectos').insert({ titulo, descripcion, estado, prioridad })
    }
    setSaving(false)
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:420, width:'100%' }}>
        <div style={{ fontWeight:700, fontSize:16, color:'var(--text)', marginBottom:18 }}>
          {proyecto?.id ? 'Editar proyecto' : 'Nuevo proyecto'}
        </div>
        <div className="form-group">
          <label className="form-label">Título</label>
          <input type="text" className="form-input" value={titulo} placeholder="ej: Catálogo online"
            onChange={e => setTitulo(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Descripción — opcional</label>
          <textarea className="form-input" value={descripcion} placeholder="Detalles, contexto, ideas..."
            rows={3} style={{ resize:'vertical' }}
            onChange={e => setDescripcion(e.target.value)} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div className="form-group">
            <label className="form-label">Estado</label>
            <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS.map(s => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Prioridad</label>
            <select className="form-select" value={prioridad} onChange={e => setPrioridad(e.target.value)}>
              {PRIORIDADES.map(p => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving || !titulo.trim()}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TareaItem({ tarea, onToggle, onDelete }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <input type="checkbox" checked={tarea.completada} onChange={() => onToggle(tarea)}
        style={{ width:15, height:15, accentColor:'var(--cyan)', flexShrink:0, cursor:'pointer' }} />
      <span style={{
        flex:1, fontSize:13, color: tarea.completada ? 'var(--muted)' : 'var(--text)',
        textDecoration: tarea.completada ? 'line-through' : 'none'
      }}>{tarea.titulo}</span>
      <button onClick={() => onDelete(tarea.id)}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:'2px 4px', fontSize:16, lineHeight:1 }}>×</button>
    </div>
  )
}

function ProyectoCard({ proyecto, onEdit, onDelete, onRefresh }) {
  const [tareas, setTareas] = useState([])
  const [nuevaTarea, setNuevaTarea] = useState('')
  const [expandido, setExpandido] = useState(false)
  const ec = ESTADO_COLOR[proyecto.estado] || ESTADO_COLOR.idea

  useEffect(() => {
    if (expandido) loadTareas()
  }, [expandido])

  async function loadTareas() {
    const { data } = await supabase.from('tareas_proyecto')
      .select('*').eq('proyecto_id', proyecto.id).order('created_at')
    setTareas(data || [])
  }

  const handleAddTarea = async () => {
    if (!nuevaTarea.trim()) return
    await supabase.from('tareas_proyecto').insert({ proyecto_id: proyecto.id, titulo: nuevaTarea.trim() })
    setNuevaTarea('')
    loadTareas()
  }

  const handleToggle = async (t) => {
    await supabase.from('tareas_proyecto').update({ completada: !t.completada }).eq('id', t.id)
    loadTareas()
  }

  const handleDeleteTarea = async (id) => {
    await supabase.from('tareas_proyecto').delete().eq('id', id)
    loadTareas()
  }

  const completadas = tareas.filter(t => t.completada).length

  return (
    <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:12, border:`1px solid ${ec.border}`, padding:16, marginBottom:12 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', marginBottom:4 }}>{proyecto.titulo}</div>
          {proyecto.descripcion && (
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6, lineHeight:1.5 }}>{proyecto.descripcion}</div>
          )}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, background:ec.bg, color:ec.color, borderRadius:8, padding:'2px 8px', fontWeight:600 }}>
              {ESTADO_LABEL[proyecto.estado]}
            </span>
            <span style={{ fontSize:11, color:PRIO_COLOR[proyecto.prioridad], fontWeight:600 }}>
              {PRIO_LABEL[proyecto.prioridad]}
            </span>
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={() => onEdit(proyecto)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--cyan)', padding:4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button onClick={() => onDelete(proyecto)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Toggle tareas */}
      <button onClick={() => setExpandido(e => !e)}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:12, marginTop:10, padding:0, display:'flex', alignItems:'center', gap:4 }}>
        <span style={{ fontSize:10 }}>{expandido ? '▼' : '▶'}</span>
        Tareas {tareas.length > 0 && `(${completadas}/${tareas.length})`}
      </button>

      {expandido && (
        <div style={{ marginTop:10 }}>
          {tareas.map(t => (
            <TareaItem key={t.id} tarea={t} onToggle={handleToggle} onDelete={handleDeleteTarea} />
          ))}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <input type="text" className="form-input" value={nuevaTarea}
              placeholder="Nueva tarea..." style={{ flex:1, fontSize:13 }}
              onChange={e => setNuevaTarea(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTarea()} />
            <button className="btn btn-primary btn-sm" onClick={handleAddTarea} disabled={!nuevaTarea.trim()}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Proyectos() {
  const [proyectos, setProyectos] = useState([])
  const [modal, setModal] = useState(null) // null | 'nuevo' | proyecto
  const [confirmar, setConfirmar] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [toast, setToast] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('proyectos').select('*').order('created_at', { ascending: false })
    setProyectos(data || [])
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleDelete = async (proyecto) => {
    await supabase.from('tareas_proyecto').delete().eq('proyecto_id', proyecto.id)
    await supabase.from('proyectos').delete().eq('id', proyecto.id)
    setConfirmar(null)
    showToast('Proyecto eliminado')
    load()
  }

  const filtrados = filtroEstado === 'todos'
    ? proyectos
    : proyectos.filter(p => p.estado === filtroEstado)

  const conteo = ESTADOS.reduce((acc, s) => ({ ...acc, [s]: proyectos.filter(p => p.estado === s).length }), {})

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {modal && (
        <ProyectoModal
          proyecto={modal === 'nuevo' ? null : modal}
          onSave={() => { setModal(null); showToast(modal === 'nuevo' ? 'Proyecto creado ✓' : 'Proyecto actualizado ✓'); load() }}
          onCancel={() => setModal(null)}
        />
      )}

      {confirmar && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:24, maxWidth:320, width:'100%' }}>
            <div style={{ fontSize:15, color:'var(--text)', marginBottom:20, lineHeight:1.5 }}>
              ¿Eliminar "{confirmar.titulo}"? Se borrarán también sus tareas.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" style={{ flex:1, background:'var(--pink)' }} onClick={() => handleDelete(confirmar)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div className="page-title" style={{ margin:0 }}>Proyectos</div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('nuevo')}>+ Nuevo</button>
      </div>

      {/* Resumen */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginBottom:16 }}>
        {ESTADOS.map(s => {
          const ec = ESTADO_COLOR[s]
          return (
            <div key={s} onClick={() => setFiltroEstado(f => f === s ? 'todos' : s)}
              style={{ background: filtroEstado === s ? ec.bg : 'rgba(255,255,255,0.03)', border:`1px solid ${filtroEstado === s ? ec.border : 'var(--border)'}`, borderRadius:10, padding:'10px 12px', cursor:'pointer', textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, color: filtroEstado === s ? ec.color : 'var(--text)' }}>{conteo[s] || 0}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{ESTADO_LABEL[s]}</div>
            </div>
          )
        })}
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div style={{ color:'var(--muted)', textAlign:'center', padding:40, fontSize:14 }}>
          {proyectos.length === 0 ? 'Sin proyectos aún. ¡Agrega tu primera idea!' : 'Sin proyectos en este estado.'}
        </div>
      ) : (
        filtrados.map(p => (
          <ProyectoCard
            key={p.id}
            proyecto={p}
            onEdit={setModal}
            onDelete={setConfirmar}
            onRefresh={load}
          />
        ))
      )}
    </div>
  )
}
