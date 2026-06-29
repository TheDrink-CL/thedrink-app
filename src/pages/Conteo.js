import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCLP } from '../lib/calculos'

// ─────────────────────────────────────────────────────────────────────────────
// Conteo de inventario — "el stock es dinero"
//
// Idea: cada cierto tiempo Ro cuenta fisicamente cada insumo. La app compara
// ese conteo real contra el stock teorico (lo que ella cree que hay) y valoriza
// la diferencia con el costo_ppp de cada insumo. El resultado es cuanto VALOR de
// inventario se movio.
//
// IMPORTANTE: esto NO toca la tabla `caja`. La plata salio de caja al comprar.
// Re-contar mueve el valor del ACTIVO inventario, no el efectivo. Un faltante es
// una perdida de valor (merma/robo/error), no una salida de caja nueva.
// ─────────────────────────────────────────────────────────────────────────────

const fmtNum = (n) => {
  if (n == null || isNaN(n)) return '—'
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}

export default function Conteo() {
  const [tab, setTab] = useState('contar') // 'contar' | 'historial'
  const [insumos, setInsumos] = useState([])
  const [conteo, setConteo] = useState({})      // { nombre: valorReal(string) }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [ultimoInforme, setUltimoInforme] = useState(null) // resultado recien guardado

  const [historial, setHistorial] = useState([])   // cabeceras
  const [lineasHist, setLineasHist] = useState([])  // todas las lineas, para tendencias
  const [loadingHist, setLoadingHist] = useState(false)

  useEffect(() => { loadInsumos() }, [])
  useEffect(() => { if (tab === 'historial') loadHistorial() }, [tab])

  async function loadInsumos() {
    setLoading(true)
    const { data } = await supabase
      .from('insumos')
      .select('nombre, unidad, stock_actual, costo_ppp')
      .order('nombre')
    setInsumos(data || [])
    setLoading(false)
  }

  async function loadHistorial() {
    setLoadingHist(true)
    const [{ data: cab }, { data: lin }] = await Promise.all([
      supabase.from('conteos_inventario').select('*').order('fecha', { ascending: false }).limit(60),
      supabase.from('conteo_lineas').select('*').order('created_at', { ascending: false }).limit(2000),
    ])
    setHistorial(cab || [])
    setLineasHist(lin || [])
    setLoadingHist(false)
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  const costoDe = (ins) => parseFloat(ins.costo_ppp) || 0
  const teoricoDe = (ins) => parseFloat(ins.stock_actual) || 0

  // Linea en vivo mientras Ro tipea, para el preview
  const lineaPreview = (ins) => {
    const raw = conteo[ins.nombre]
    if (raw === undefined || raw === '') return null // sin contar todavia
    const real = parseFloat(raw)
    if (isNaN(real)) return null
    const teorico = teoricoDe(ins)
    const costo = costoDe(ins)
    const diff = real - teorico
    return { real, teorico, diff, costo, diffValor: diff * costo }
  }

  // Resumen en vivo de lo que se ingreso hasta ahora
  const previewLineas = insumos
    .map(ins => ({ ins, p: lineaPreview(ins) }))
    .filter(x => x.p !== null)
  const previewAjuste = previewLineas.reduce((s, x) => s + x.p.diffValor, 0)
  const previewContados = previewLineas.length

  async function handleGuardar() {
    if (previewContados === 0) { showToast('Conta al menos un insumo'); return }
    setSaving(true)

    // Construir lineas solo de los insumos efectivamente contados
    const lineas = previewLineas.map(({ ins, p }) => ({
      insumo_nombre: ins.nombre,
      unidad: ins.unidad || null,
      stock_teorico: p.teorico,
      stock_real: p.real,
      diff_unidades: p.diff,
      costo_unitario: p.costo,
      diff_valor: p.diffValor,
    }))

    const valorTeorico = lineas.reduce((s, l) => s + l.stock_teorico * l.costo_unitario, 0)
    const valorReal = lineas.reduce((s, l) => s + l.stock_real * l.costo_unitario, 0)
    const ajuste = valorReal - valorTeorico
    const conDiff = lineas.filter(l => Math.abs(l.diff_unidades) > 1e-9).length

    // 1. Cabecera
    const { data: cab, error: e1 } = await supabase
      .from('conteos_inventario')
      .insert({
        valor_teorico: valorTeorico,
        valor_real: valorReal,
        ajuste_valor: ajuste,
        lineas_con_diff: conDiff,
      })
      .select()
      .single()

    if (e1 || !cab) { setSaving(false); showToast('Error guardando: ' + (e1?.message || '')); return }

    // 2. Lineas
    const { error: e2 } = await supabase
      .from('conteo_lineas')
      .insert(lineas.map(l => ({ ...l, conteo_id: cab.id })))
    if (e2) { setSaving(false); showToast('Error guardando detalle: ' + e2.message); return }

    // 3. Actualizar stock_actual al valor real contado
    await Promise.all(
      previewLineas.map(({ ins, p }) =>
        supabase.from('insumos').update({ stock_actual: p.real }).eq('nombre', ins.nombre)
      )
    )

    // Informe para mostrar
    const culpables = [...lineas]
      .filter(l => Math.abs(l.diff_valor) > 0)
      .sort((a, b) => Math.abs(b.diff_valor) - Math.abs(a.diff_valor))
      .slice(0, 5)

    setUltimoInforme({ ajuste, valorTeorico, valorReal, conDiff, total: lineas.length, culpables, fecha: cab.fecha })
    setConteo({})
    setSaving(false)
    showToast('Conteo guardado')
    loadInsumos()
  }

  // ── Tendencias por insumo: promedio del diff_valor en los conteos historicos ──
  const tendenciaPorInsumo = (() => {
    const acc = {}
    lineasHist.forEach(l => {
      const k = l.insumo_nombre
      if (!acc[k]) acc[k] = { nombre: k, n: 0, sumaValor: 0, sumaUnid: 0, unidad: l.unidad }
      acc[k].n += 1
      acc[k].sumaValor += parseFloat(l.diff_valor) || 0
      acc[k].sumaUnid += parseFloat(l.diff_unidades) || 0
    })
    return Object.values(acc)
      .map(a => ({ ...a, promValor: a.sumaValor / a.n, promUnid: a.sumaUnid / a.n }))
      .filter(a => a.n >= 1)
      .sort((a, b) => a.promValor - b.promValor) // mas negativos primero (los que mas faltan)
  })()

  const sobrantes = tendenciaPorInsumo.filter(a => a.promValor > 0).sort((a, b) => b.promValor - a.promValor)
  const faltantes = tendenciaPorInsumo.filter(a => a.promValor < 0)

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}
      <div className="page-title">Conteo de inventario</div>

      <div className="toggle-row" style={{ marginBottom: 14 }}>
        <button className={`toggle-btn ${tab === 'contar' ? 'active-entrada' : ''}`}
          onClick={() => setTab('contar')}>Contar</button>
        <button className={`toggle-btn ${tab === 'historial' ? 'active-entrada' : ''}`}
          onClick={() => setTab('historial')}>Historial</button>
      </div>

      {tab === 'contar' && (
        <>
          {/* Informe del ultimo conteo recien guardado */}
          {ultimoInforme && (
            <div className="card" style={{ marginBottom: 14, borderColor: ultimoInforme.ajuste < 0 ? 'var(--pink)' : 'var(--green)' }}>
              <div className="card-title">Informe del conteo ({ultimoInforme.fecha})</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Ajuste de valor:</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: ultimoInforme.ajuste < 0 ? 'var(--pink)' : 'var(--green)' }}>
                  {ultimoInforme.ajuste >= 0 ? '+' : '-'}{formatCLP(Math.abs(ultimoInforme.ajuste))}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>
                {ultimoInforme.ajuste < 0
                  ? 'Tenias menos stock del que la app creia. Es valor que se perdio (merma, robo o error de carga). No afecta tu caja: la plata ya salio al comprar.'
                  : ultimoInforme.ajuste > 0
                    ? 'Tenias mas stock del que la app creia. Probablemente cargaste de menos alguna compra. Sube el valor del activo inventario, pero no es plata nueva en caja.'
                    : 'Cuadro perfecto: el stock real coincide con el teorico.'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)' }}>
                {ultimoInforme.conDiff} de {ultimoInforme.total} insumos con diferencia.
              </div>
              {ultimoInforme.culpables.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Mayores diferencias:</div>
                  {ultimoInforme.culpables.map(c => (
                    <div className="list-item" key={c.insumo_nombre} style={{ padding: '6px 0' }}>
                      <div className="list-item-name" style={{ fontSize: 13 }}>
                        {c.insumo_nombre}
                        <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>
                          {c.diff_unidades >= 0 ? '+' : ''}{fmtNum(c.diff_unidades)} {c.unidad || ''}
                        </span>
                      </div>
                      <div className="list-item-value" style={{ fontSize: 13, color: c.diff_valor < 0 ? 'var(--pink)' : 'var(--green)' }}>
                        {c.diff_valor >= 0 ? '+' : '-'}{formatCLP(Math.abs(c.diff_valor))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
            Conta fisicamente lo que hay y anotalo. Deja vacio lo que no cuentes hoy.
            La app compara contra el stock teorico y valoriza la diferencia con el costo promedio.
          </div>

          <div className="card" style={{ marginBottom: 90 }}>
            {insumos.length === 0 && (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No hay insumos cargados</div>
            )}
            {insumos.map(ins => {
              const p = lineaPreview(ins)
              return (
                <div className="list-item" key={ins.nombre} style={{ gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-item-name" style={{ fontSize: 14 }}>{ins.nombre}</div>
                    <div className="list-item-sub">
                      Teorico: {fmtNum(teoricoDe(ins))} {ins.unidad || ''}
                      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>· ${fmtNum(costoDe(ins))}/{ins.unidad || 'u'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {p && (
                      <div style={{ textAlign: 'right', minWidth: 64 }}>
                        <div style={{ fontSize: 11, color: p.diff < 0 ? 'var(--pink)' : p.diff > 0 ? 'var(--green)' : 'var(--muted)' }}>
                          {p.diff >= 0 ? '+' : ''}{fmtNum(p.diff)}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: p.diffValor < 0 ? 'var(--pink)' : p.diffValor > 0 ? 'var(--green)' : 'var(--muted)' }}>
                          {p.diffValor >= 0 ? '+' : '-'}{formatCLP(Math.abs(p.diffValor))}
                        </div>
                      </div>
                    )}
                    <input type="number" step="any" className="form-input"
                      style={{ width: 84, textAlign: 'right' }}
                      placeholder={fmtNum(teoricoDe(ins))}
                      value={conteo[ins.nombre] ?? ''}
                      onChange={e => setConteo(c => ({ ...c, [ins.nombre]: e.target.value }))} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Barra fija de resumen + guardar */}
          <div style={{
            position: 'fixed', bottom: 64, left: 0, right: 0, zIndex: 80,
            background: 'var(--card)', borderTop: '1px solid var(--border)',
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
            maxWidth: 640, margin: '0 auto',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {previewContados} contado{previewContados === 1 ? '' : 's'} · ajuste estimado
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: previewAjuste < 0 ? 'var(--pink)' : previewAjuste > 0 ? 'var(--green)' : 'var(--text)' }}>
                {previewContados === 0 ? '—' : `${previewAjuste >= 0 ? '+' : '-'}${formatCLP(Math.abs(previewAjuste))}`}
              </div>
            </div>
            <button className="btn btn-primary" style={{ flexShrink: 0, width: 'auto', padding: '10px 20px' }}
              disabled={saving || previewContados === 0} onClick={handleGuardar}>
              {saving ? 'Guardando...' : 'Guardar conteo'}
            </button>
          </div>
        </>
      )}

      {tab === 'historial' && (
        <>
          {loadingHist ? <div className="loading">Cargando...</div> : (
            <>
              {historial.length === 0 && (
                <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                  Todavia no hay conteos. Hace el primero en la pestaña "Contar".
                </div>
              )}

              {tendenciaPorInsumo.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
                    Promedio de la diferencia de cada insumo en todos tus conteos.
                    Junta varios conteos para que esto sea confiable.
                  </div>

                  {faltantes.length > 0 && (
                    <div className="card" style={{ marginBottom: 12 }}>
                      <div className="card-title" style={{ color: 'var(--pink)' }}>Siempre falta (merma / posible sub-dimension)</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
                        Al contar suele haber menos de lo esperado. Revisa merma real, robo, o si la receta consume mas de lo cargado.
                      </div>
                      {faltantes.map(a => (
                        <div className="list-item" key={a.nombre}>
                          <div className="list-item-name" style={{ fontSize: 14 }}>
                            {a.nombre}
                            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                              ({a.n} conteo{a.n === 1 ? '' : 's'})
                            </span>
                          </div>
                          <div className="list-item-value" style={{ color: 'var(--pink)', fontSize: 14 }}>
                            {formatCLP(a.promValor)}/conteo
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {sobrantes.length > 0 && (
                    <div className="card" style={{ marginBottom: 12 }}>
                      <div className="card-title" style={{ color: 'var(--green)' }}>Siempre sobra (posible sobre-dimension)</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
                        Al contar suele haber mas de lo esperado. Tenes plata dormida en stock que no rota, o cargas de menos las compras.
                      </div>
                      {sobrantes.map(a => (
                        <div className="list-item" key={a.nombre}>
                          <div className="list-item-name" style={{ fontSize: 14 }}>
                            {a.nombre}
                            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                              ({a.n} conteo{a.n === 1 ? '' : 's'})
                            </span>
                          </div>
                          <div className="list-item-value" style={{ color: 'var(--green)', fontSize: 14 }}>
                            +{formatCLP(a.promValor)}/conteo
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {historial.length > 0 && (
                <>
                  <div className="section-divider">Conteos</div>
                  <div className="card">
                    {historial.map(c => (
                      <div className="list-item" key={c.id} style={{ gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="list-item-name">{c.fecha}</div>
                          <div className="list-item-sub">
                            {c.lineas_con_diff} con diferencia
                            {c.nota && <span style={{ color: 'var(--muted)' }}> · {c.nota}</span>}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: c.ajuste_valor < 0 ? 'var(--pink)' : c.ajuste_valor > 0 ? 'var(--green)' : 'var(--muted)' }}>
                          {c.ajuste_valor >= 0 ? '+' : '-'}{formatCLP(Math.abs(c.ajuste_valor))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
