// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/insights
//
// Recibe el JSON de métricas calculado por el cliente (lib/dashboardMetrics.js),
// llama a la API de Claude y devuelve { resumen, alertas[], recomendacion_principal }.
//
// Control de costos: cache de 1 análisis POR DÍA en la tabla `insights` de
// Supabase. Da lo mismo cuántas veces se abra la vista o quién llame al
// endpoint: la primera request del día genera el análisis, el resto lee cache.
//
// Env vars requeridas (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY   (obligatoria, NUNCA en el frontend ni en el repo)
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://wcuxjxaquiypzinxakxu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_UzDdk9WWxGhA8IysMVNz_w_FIz_k1wI'
const MODELO = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `Eres el asesor de negocio de The Drink, marca chilena de cócteles embotellados de 1 litro con delivery en Santiago. Hablas en español chileno, directo y sin relleno. Recibes un JSON con KPIs ya calculados; nunca inventes cifras que no estén en el JSON. Los márgenes, ROAS y metas vienen EN el JSON — no asumas valores de memoria.

Reglas: si el ingreso baja, revisa primero si bajó el gasto en pauta antes de hablar de caída de demanda — distingue "pauta apagada" de "demanda débil". Si habituales y ticket suben mientras el total baja, dilo explícito. Si el ROAS cae 2+ semanas con gasto estable, sugiere cambiar creativo, no recortar. Máximo 3 hallazgos, el más importante primero, máximo 4 frases cada uno. Cierra con UNA acción concreta para esta semana.`

const TOOL_ANALISIS = {
  name: 'entregar_analisis',
  description: 'Entrega el análisis semanal estructurado del negocio',
  input_schema: {
    type: 'object',
    properties: {
      resumen: { type: 'string', description: 'Resumen general de la situación en 2-3 frases' },
      alertas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Máximo 3 hallazgos, el más importante primero, máximo 4 frases cada uno',
      },
      recomendacion_principal: { type: 'string', description: 'UNA acción concreta para esta semana' },
    },
    required: ['resumen', 'alertas', 'recomendacion_principal'],
  },
}

// Fecha de hoy en Chile (la función corre en UTC)
function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

async function supa(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Solo POST' })
    return
  }

  try {
    const fecha = hoyChile()

    // 1) Cache: ¿ya hay análisis de hoy?
    const cacheado = await supa(`insights?fecha=eq.${fecha}&select=respuesta`)
    if (cacheado && cacheado.length > 0) {
      res.status(200).json({ ...cacheado[0].respuesta, cached: true, fecha })
      return
    }

    // 2) Validar payload
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const metricas = body && body.metricas
    if (!metricas || typeof metricas !== 'object') {
      res.status(400).json({ error: 'Falta el campo metricas' })
      return
    }
    const metricasStr = JSON.stringify(metricas)
    if (metricasStr.length > 30000) {
      res.status(400).json({ error: 'Métricas demasiado grandes' })
      return
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' })
      return
    }

    // 3) Llamar a Claude con salida estructurada (tool use forzado)
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        tools: [TOOL_ANALISIS],
        tool_choice: { type: 'tool', name: 'entregar_analisis' },
        messages: [{
          role: 'user',
          content: `KPIs de The Drink al ${fecha}:\n\n${metricasStr}`,
        }],
      }),
    })
    if (!claudeRes.ok) {
      const detalle = await claudeRes.text()
      console.error('Anthropic error:', detalle)
      res.status(502).json({ error: 'Error llamando a la API de Claude' })
      return
    }
    const data = await claudeRes.json()
    const toolUse = (data.content || []).find(b => b.type === 'tool_use')
    if (!toolUse || !toolUse.input) {
      res.status(502).json({ error: 'Respuesta de Claude sin análisis estructurado' })
      return
    }
    const respuesta = {
      resumen: toolUse.input.resumen || '',
      alertas: Array.isArray(toolUse.input.alertas) ? toolUse.input.alertas.slice(0, 3) : [],
      recomendacion_principal: toolUse.input.recomendacion_principal || '',
    }

    // 4) Guardar en cache (si falla el insert por carrera, no es grave)
    try {
      await supa('insights', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ fecha, json_metricas: metricas, respuesta, modelo: MODELO }),
      })
    } catch (e) {
      console.error('No se pudo cachear el insight:', e.message)
    }

    res.status(200).json({ ...respuesta, cached: false, fecha })
  } catch (e) {
    console.error('insights error:', e)
    res.status(500).json({ error: 'Error interno generando el análisis' })
  }
}
