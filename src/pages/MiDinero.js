import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'
import { calcularFinanzasMensuales, sueldoPromedio, calcularRunway } from '../lib/finanzasMes'
import { descargarCSV, BotonExportar } from '../lib/exportar'

const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
function labelMes(mes) {
  // mes es "YYYY-MM"
  const [y, m] = mes.split('-').map(Number)
  return `${MESES_ES[m - 1]} ${y}`
}
function mesActualISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function mesAnteriorISO(mes) {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

// ─── Modal: editar gasto + colchón del mes ──────────────────────────────────
function HistorialModal({ mes, registro, onSave, onCancel }) {
  const [gasto, setGasto] = useState(String(registro?.gasto ?? ''))
  const [colchon, setColchon] = useState(String(registro?.colchon ?? ''))
  const [sueldoReal, setSueldoReal] = useState(String(registro?.sueldo_real ?? ''))
  const [nota, setNota] = useState(registro?.nota || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    const payload = {
      mes,
      gasto: parseFloat(gasto) || 0,
      colchon: parseFloat(colchon) || 0,
      sueldo_real: sueldoReal === '' ? null : (parseFloat(sueldoReal) || 0),
      nota: nota.trim() || null,
    }
    const { error: err } = await supabase
      .from('historial_personal')
      .upsert(payload, { onConflict: 'mes' })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:300, padding:24, overflowY:'auto' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:380, width:'100%', marginTop:28 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>
          {labelMes(mes)}
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>
          Datos personales del mes — gasto, colchón disponible y sueldo realmente retirado.
        </div>

        <div className="form-group">
          <label className="form-label">Gasto personal del mes (CLP)</label>
          <input type="number" className="form-input" value={gasto}
            placeholder="ej: 800000" autoFocus
            onChange={e => setGasto(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Colchón al cierre del mes (CLP)</label>
          <input type="number" className="form-input" value={colchon}
            placeholder="ej: 2000000"
            onChange={e => setColchon(e.target.value)} />
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, lineHeight:1.5 }}>
            Plata disponible fuera de The Drink (cuenta personal, ahorros).
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Sueldo realmente sacado (opcional)</label>
          <input type="number" className="form-input" value={sueldoReal}
            placeholder="déjalo vacío para usar el calculado"
            onChange={e => setSueldoReal(e.target.value)} />
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, lineHeight:1.5 }}>
            Si lo dejas vacío, el sistema asume el sueldo calculado (45% del margen op).
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Nota — opcional</label>
          <input type="text" className="form-input" value={nota}
            placeholder="contexto del mes..."
            onChange={e => setNota(e.target.value)} />
        </div>

        {error && <div style={{ color:'var(--pink)', fontSize:13, marginBottom:10 }}>{error}</div>}

        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: editar split sueldo/reposición ──────────────────────────────────
function SplitModal({ splitSueldo, onSave, onCancel }) {
  const [valor, setValor] = useState(String(Math.round(splitSueldo * 100)))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const pct = Math.max(0, Math.min(100, parseFloat(valor) || 0)) / 100
    const reposicion = 1 - pct
    const upd = [
      { clave: 'split_sueldo_pct', valor: pct },
      { clave: 'split_reposicion_pct', valor: reposicion },
    ]
    for (const u of upd) {
      const { data: existe } = await supabase.from('config').select('clave').eq('clave', u.clave).maybeSingle()
      if (existe) await supabase.from('config').update({ valor: u.valor }).eq('clave', u.clave)
      else await supabase.from('config').insert(u)
    }
    setSaving(false)
    onSave()
  }

  const sueldoPct = Math.max(0, Math.min(100, parseFloat(valor) || 0))
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:24 }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:22, maxWidth:340, width:'100%' }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text-strong)', marginBottom:4 }}>
          Reparto del margen operativo
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18, lineHeight:1.6 }}>
          Define qué porcentaje del margen operativo va a tu sueldo. El resto va a reposición de inventario y reinversión.
        </div>

        <div className="form-group">
          <label className="form-label">Tu sueldo (% del margen op)</label>
          <input type="number" className="form-input" value={valor} min="0" max="100"
            onChange={e => setValor(e.target.value)} autoFocus />
        </div>

        <div style={{
          padding:'10px 14px', background:'rgba(0,180,180,0.06)', border:'1px solid var(--border)',
          borderRadius:10, fontSize:13, color:'var(--text)', marginBottom:18,
        }}>
          Sueldo: <strong style={{ color:'var(--green)' }}>{sueldoPct}%</strong> ·
          Reposición: <strong style={{ color:'var(--cyan)' }}>{100 - sueldoPct}%</strong>
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vista: TABLERO mes a mes ────────────────────────────────────────────────
function TableroMensual({ filas, splitSueldo, onEditMes, onEditSplit, historialMap }) {
  const mesActual = mesActualISO()

  // Totales últimos 6 meses (excluyendo el actual incompleto)
  const ultimos6 = filas.filter(f => f.mes !== mesActual).slice(0, 6)
  const totales = ultimos6.reduce((acc, f) => ({
    ingresos: acc.ingresos + f.ingresos,
    cogs: acc.cogs + f.cogs,
    margenBruto: acc.margenBruto + f.margenBruto,
    margenOperativo: acc.margenOperativo + f.margenOperativo,
    sueldo: acc.sueldo + f.sueldo,
    reposicion: acc.reposicion + f.reposicion,
  }), { ingresos: 0, cogs: 0, margenBruto: 0, margenOperativo: 0, sueldo: 0, reposicion: 0 })

  return (
    <>
      {/* Card de configuración split */}
      <div className="card" style={{
        background: 'rgba(123,47,190,0.08)', border: '1px solid rgba(123,47,190,0.3)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize:11, color:'#AFA9EC', textTransform:'uppercase', letterSpacing:1, fontWeight:700, marginBottom:3 }}>
            Regla de reparto
          </div>
          <div style={{ fontSize:14, color:'var(--text-strong)', fontWeight:700 }}>
            <span style={{ color:'var(--green)' }}>{Math.round(splitSueldo*100)}%</span> sueldo ·
            <span style={{ color:'var(--cyan)' }}> {Math.round((1-splitSueldo)*100)}%</span> reposición
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
            Sobre el margen operativo del mes
          </div>
        </div>
        <button onClick={onEditSplit}
          style={{ background:'none', border:'1px solid rgba(123,47,190,0.5)', borderRadius:8, color:'#AFA9EC', cursor:'pointer', fontSize:11, padding:'5px 10px' }}>
          ⚙️ Editar
        </button>
      </div>

      {/* Lista de meses */}
      {filas.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:36, color:'var(--muted)' }}>
          Aún no hay datos suficientes para armar el tablero mensual.
        </div>
      ) : (
        filas.map(f => {
          const esActual = f.mes === mesActual
          const reg = historialMap[f.mes]
          const sueldoReal = reg?.sueldo_real
          const sueldoEfectivo = sueldoReal != null ? sueldoReal : f.sueldo
          return (
            <div key={f.mes} className="card" style={{
              padding:'14px 16px',
              borderLeft: f.esNegativo ? '3px solid var(--pink)' : (esActual ? '3px solid var(--cyan)' : '3px solid transparent'),
              opacity: esActual ? 1 : 1,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'var(--text-strong)', textTransform:'uppercase', letterSpacing:1 }}>
                    {labelMes(f.mes)}
                    {esActual && <span style={{ fontSize:10, color:'var(--cyan)', marginLeft:6, fontWeight:600 }}>EN CURSO</span>}
                  </div>
                  {f.esNegativo && (
                    <div style={{ fontSize:11, color:'var(--pink)', marginTop:2 }}>
                      ⚠️ Mes con pérdida operativa
                    </div>
                  )}
                </div>
                <button onClick={() => onEditMes(f.mes)}
                  style={{ background:'none', border:'1px solid var(--border)', borderRadius:7, color:'var(--muted)', cursor:'pointer', fontSize:11, padding:'3px 9px' }}>
                  {reg ? '✏️ Editar' : '+ Datos'}
                </button>
              </div>

              {/* Fila de números */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <Stat label="Ingresos" valor={f.ingresos} color="var(--cyan)" />
                <Stat label="COGS" valor={f.cogs} color="var(--text)" negativo />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <Stat label={`Margen bruto · ${(f.pctBruto*100).toFixed(1)}%`} valor={f.margenBruto} color="var(--green)" />
                <Stat label={`Margen op · ${(f.pctOperativo*100).toFixed(1)}%`}
                  valor={f.margenOperativo} color={f.esNegativo ? 'var(--pink)' : 'var(--green)'} />
              </div>

              {/* Sueldo y reposición */}
              <div style={{
                display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:6,
                padding:'10px 0 0', borderTop:'1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ background:'rgba(34,197,94,0.10)', borderRadius:10, padding:'10px 12px', border:'1px solid rgba(34,197,94,0.25)' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3 }}>
                    Tu sueldo
                  </div>
                  <div style={{ fontSize:16, fontWeight:800, color:'var(--green)' }}>
                    {formatCLP(sueldoEfectivo)}
                  </div>
                  {sueldoReal != null && Math.abs(sueldoReal - f.sueldo) > 1 && (
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                      calculado: {formatCLP(f.sueldo)}
                    </div>
                  )}
                </div>
                <div style={{ background:'rgba(0,180,180,0.08)', borderRadius:10, padding:'10px 12px', border:'1px solid rgba(0,180,180,0.25)' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3 }}>
                    Reposición
                  </div>
                  <div style={{ fontSize:16, fontWeight:800, color:'var(--cyan)' }}>
                    {formatCLP(f.reposicion)}
                  </div>
                </div>
              </div>

              {reg?.nota && (
                <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic', marginTop:8 }}>
                  💬 {reg.nota}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Totales últimos 6 meses */}
      {ultimos6.length > 0 && (
        <div className="card" style={{ background:'rgba(0,180,180,0.06)', border:'1px solid rgba(0,180,180,0.3)' }}>
          <div className="card-title">Totales últimos {ultimos6.length} meses (sin mes en curso)</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <Stat label="Ingresos" valor={totales.ingresos} color="var(--cyan)" />
            <Stat label="Margen op" valor={totales.margenOperativo} color="var(--green)" />
            <Stat label="Sueldo acumulado" valor={totales.sueldo} color="var(--green)" />
            <Stat label="Reposición acumulada" valor={totales.reposicion} color="var(--cyan)" />
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, valor, color, negativo }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 10px' }}>
      <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:700, color }}>{negativo ? '−' : ''}{formatCLP(valor)}</div>
    </div>
  )
}

// ─── Vista: RUNWAY personal ──────────────────────────────────────────────────
function Runway({ filas, historial, historialMap, onEditMes }) {
  const mesActual = mesActualISO()
  // Último registro de historial para tomar el colchón actual
  const histOrdenados = [...historial].sort((a, b) => b.mes.localeCompare(a.mes))
  const ultimoReg = histOrdenados[0]
  const colchonActual = ultimoReg?.colchon || 0
  const gastoActual = ultimoReg?.gasto || 0

  // Sueldo promedio últimos 3 meses (excluyendo el actual)
  const sueldoProm = sueldoPromedio(filas, 3)
  const runway = calcularRunway(sueldoProm, gastoActual, colchonActual)

  // Datos para serie de gasto vs sueldo
  const serie = filas
    .filter(f => f.mes !== mesActual)
    .slice(0, 12)
    .reverse()
    .map(f => {
      const reg = historialMap[f.mes]
      const sueldoEfectivo = reg?.sueldo_real != null ? reg.sueldo_real : f.sueldo
      const gastoMes = reg?.gasto || 0
      return { mes: f.mes, sueldo: sueldoEfectivo, gasto: gastoMes }
    })
  const maxSerie = Math.max(1, ...serie.map(s => Math.max(s.sueldo, s.gasto)))

  return (
    <>
      {/* Card actual: colchón + gasto */}
      <div className="card">
        <div className="card-title">Tu situación ahora</div>
        {!ultimoReg ? (
          <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7 }}>
            Aún no registras tu gasto y colchón. Anda a la pestaña "Tablero" y registra los datos del mes en curso (botón "+ Datos") para activar el runway.
          </div>
        ) : (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <Stat label={`Gasto · ${labelMes(ultimoReg.mes)}`} valor={gastoActual} color="var(--pink)" />
              <Stat label="Colchón disponible" valor={colchonActual} color="var(--cyan)" />
            </div>
            <button onClick={() => onEditMes(ultimoReg.mes)}
              style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', fontSize:11, padding:'5px 10px' }}>
              ✏️ Actualizar
            </button>
          </>
        )}
      </div>

      {/* Resultado del runway */}
      {ultimoReg && (
        <div className="card" style={{
          background: runway.autosostenible ? 'rgba(34,197,94,0.10)' : 'rgba(196,0,90,0.08)',
          border: `1px solid ${runway.autosostenible ? 'rgba(34,197,94,0.4)' : 'rgba(196,0,90,0.4)'}`,
        }}>
          <div className="card-title" style={{ color: runway.autosostenible ? 'var(--green)' : 'var(--pink)' }}>
            {runway.autosostenible ? '✅ Eres autosostenible' : '⏳ Necesitas colchón'}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
            <Stat label="Sueldo prom. 3 meses" valor={sueldoProm} color="var(--green)" />
            <Stat label="Gasto mensual" valor={gastoActual} color="var(--text)" />
          </div>

          {runway.autosostenible ? (
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7 }}>
              Tu sueldo de The Drink ({formatCLP(sueldoProm)}) <strong style={{ color:'var(--green)' }}>cubre</strong> tu gasto mensual de {formatCLP(gastoActual)}.
              {runway.superavit > 0 && (
                <span> Te sobran <strong style={{ color:'var(--green)' }}>{formatCLP(runway.superavit)}</strong>/mes para reinvertir.</span>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, marginBottom:10 }}>
                Te faltan <strong style={{ color:'var(--pink)' }}>{formatCLP(runway.deficit)}</strong>/mes para cubrir tu gasto.
                {' '}Con tu colchón de {formatCLP(colchonActual)}, tienes <strong style={{ color: runway.mesesAire < 3 ? 'var(--pink)' : (runway.mesesAire < 6 ? '#f59e0b' : 'var(--green)') }}>
                {runway.mesesAire === Infinity ? '∞' : runway.mesesAire.toFixed(1)} meses</strong> de aire.
              </div>

              {/* Barra visual de meses */}
              {runway.mesesAire !== Infinity && (
                <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:6, height:10, overflow:'hidden' }}>
                  <div style={{
                    height:'100%',
                    width: Math.min(100, (runway.mesesAire / 12) * 100) + '%',
                    background: runway.mesesAire < 3 ? 'var(--pink)' : (runway.mesesAire < 6 ? '#f59e0b' : 'var(--green)'),
                    borderRadius:6,
                  }} />
                </div>
              )}
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4, textAlign:'right' }}>
                referencia: 12 meses
              </div>
            </div>
          )}

          <div style={{
            marginTop:14, padding:'10px 12px', background:'rgba(255,255,255,0.03)',
            borderRadius:8, fontSize:11, color:'var(--muted)', lineHeight:1.7,
          }}>
            💡 Para que The Drink solucione tu sustento sin tocar el colchón, tu sueldo promedio debe llegar a {formatCLP(gastoActual)}/mes. Eso requiere un margen operativo mensual de aproximadamente {formatCLP(gastoActual / 0.45)} (con regla 45% sueldo).
          </div>
        </div>
      )}

      {/* Serie histórica: sueldo vs gasto */}
      {serie.length > 0 && (
        <div className="card">
          <div className="card-title">Evolución sueldo vs gasto (últimos {serie.length} meses)</div>
          {serie.map(s => {
            const cubre = s.gasto > 0 && s.sueldo >= s.gasto
            return (
              <div key={s.mes} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                  <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>{labelMes(s.mes)}</span>
                  <span style={{ fontSize:11, color: cubre ? 'var(--green)' : 'var(--muted)' }}>
                    {cubre ? '✓ cubre' : (s.gasto > 0 ? `falta ${formatCLP(s.gasto - s.sueldo)}` : 'sin gasto reg.')}
                  </span>
                </div>
                {/* Dos barras superpuestas */}
                <div style={{ position:'relative', background:'rgba(255,255,255,0.04)', borderRadius:4, height:14, overflow:'hidden' }}>
                  {s.gasto > 0 && (
                    <div style={{
                      position:'absolute', top:0, bottom:0, left:0,
                      width: (s.gasto / maxSerie * 100) + '%',
                      background:'rgba(196,0,90,0.4)', borderRadius:4,
                    }} title={`Gasto: ${formatCLP(s.gasto)}`} />
                  )}
                  <div style={{
                    position:'absolute', top:0, bottom:0, left:0,
                    width: (s.sueldo / maxSerie * 100) + '%',
                    background:'var(--green)', borderRadius:4,
                  }} title={`Sueldo: ${formatCLP(s.sueldo)}`} />
                </div>
              </div>
            )
          })}
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:8, display:'flex', gap:14, justifyContent:'center' }}>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'var(--green)', borderRadius:2, marginRight:4 }} />Sueldo</span>
            <span><span style={{ display:'inline-block', width:10, height:10, background:'rgba(196,0,90,0.4)', borderRadius:2, marginRight:4 }} />Gasto</span>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Página principal ───────────────────────────────────────────────────────
export default function MiDinero() {
  const [vista, setVista] = useState('tablero')
  const [filas, setFilas] = useState([])
  const [historial, setHistorial] = useState([])
  const [splitSueldo, setSplitSueldo] = useState(0.45)
  const [loading, setLoading] = useState(true)
  const [editMes, setEditMes] = useState(null)
  const [editSplit, setEditSplit] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [
        { data: vts }, { data: cja }, { data: recIng },
        { data: ins }, { data: cfg }, { data: hist },
      ] = await Promise.all([
        supabase.from('ventas').select('fecha, litros, precio_venta, delivery, receta_nombre'),
        supabase.from('caja').select('fecha, monto, categoria, tipo').eq('tipo', 'salida'),
        supabase.from('receta_ingredientes').select('receta_nombre, insumo_nombre, cantidad'),
        supabase.from('insumos').select('nombre, costo_ppp'),
        supabase.from('config').select('*'),
        supabase.from('historial_personal').select('*'),
      ])

      const cfgMap = {}
      ;(cfg || []).forEach(c => { cfgMap[c.clave] = c.valor })
      const ssueldo = parseFloat(cfgMap.split_sueldo_pct) || 0.45
      setSplitSueldo(ssueldo)

      const f = calcularFinanzasMensuales({
        ventas: vts || [],
        gastosCaja: cja || [],
        recetaIngredientes: recIng || [],
        insumosPPP: ins || [],
        config: {
          merma_pct: parseFloat(cfgMap.merma_pct) || 0.08,
          costo_envase: parseFloat(cfgMap.costo_envase) || 794.6,
          split_sueldo_pct: ssueldo,
          split_reposicion_pct: parseFloat(cfgMap.split_reposicion_pct) || (1 - ssueldo),
        },
      })
      setFilas(f)
      setHistorial(hist || [])
    } catch (e) {
      console.error('MiDinero - error:', e)
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // Index historial por mes para lookup rápido
  const historialMap = {}
  historial.forEach(h => { historialMap[h.mes] = h })

  if (loading) return <div className="loading">Cargando...</div>
  if (error) {
    return (
      <div className="page">
        <div className="page-title">Mi Dinero</div>
        <div className="card" style={{ borderColor:'rgba(196,0,90,0.4)' }}>
          <div className="card-title" style={{ color:'var(--pink)' }}>Error</div>
          <div style={{ fontSize:13, color:'var(--text)' }}>{error}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>
            Si el error menciona historial_personal o split, verifica que la migración P4 se haya corrido en Supabase.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      {editMes && (
        <HistorialModal
          mes={editMes}
          registro={historialMap[editMes]}
          onSave={() => { setEditMes(null); showToast('Guardado ✓'); load() }}
          onCancel={() => setEditMes(null)}
        />
      )}
      {editSplit && (
        <SplitModal splitSueldo={splitSueldo}
          onSave={() => { setEditSplit(false); showToast('Reparto actualizado ✓'); load() }}
          onCancel={() => setEditSplit(false)} />
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div className="page-title" style={{ marginBottom:0 }}>Mi Dinero</div>
        {filas.length > 0 && (
          <BotonExportar onClick={() => {
            const headers = ['Mes','Ingresos','COGS','Margen bruto','Margen op','Sueldo (calc)','Sueldo (real)','Reposicion','Gasto personal','Colchon']
            const rows = filas.map(f => {
              const reg = historialMap[f.mes] || {}
              return [
                f.mes, Math.round(f.ingresos), Math.round(f.cogs),
                Math.round(f.margenBruto), Math.round(f.margenOperativo),
                Math.round(f.sueldo), reg.sueldo_real ?? '',
                Math.round(f.reposicion), reg.gasto ?? '', reg.colchon ?? '',
              ]
            })
            descargarCSV('thedrink_mi_dinero', headers, rows)
          }} />
        )}
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16, lineHeight:1.6 }}>
        Cuánto debes sacarte como sueldo cada mes y cuánto aire personal tienes.
      </div>

      {/* Selector de vista */}
      <div className="toggle-row" style={{ marginBottom:16 }}>
        <button className={`toggle-btn ${vista === 'tablero' ? 'active-entrada' : ''}`}
          onClick={() => setVista('tablero')}>📊 Tablero mensual</button>
        <button className={`toggle-btn ${vista === 'runway' ? 'active-entrada' : ''}`}
          onClick={() => setVista('runway')}>🛣️ Runway</button>
      </div>

      {vista === 'tablero' ? (
        <TableroMensual
          filas={filas}
          splitSueldo={splitSueldo}
          historialMap={historialMap}
          onEditMes={setEditMes}
          onEditSplit={() => setEditSplit(true)}
        />
      ) : (
        <Runway
          filas={filas}
          historial={historial}
          historialMap={historialMap}
          onEditMes={setEditMes}
        />
      )}
    </div>
  )
}
