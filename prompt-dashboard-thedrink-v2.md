# Prompt v2: Vista Dashboard + Insights con IA para The Drink

> Versión corregida contra el esquema real de Supabase y la arquitectura actual de la app (CRA + Supabase directo desde el cliente, deploy en Vercel, sin backend propio). Copia desde aquí hacia abajo.

---

Quiero agregar a la app una vista **Dashboard** con indicadores clave del negocio y un módulo de **insights con IA** (API de Claude). Tablas reales: `ventas`, `ordenes`, `compras`, `recetas`, `receta_ingredientes`, `caja`, `clientes`, `insumos`.

## Contexto de esquema (NO asumir otra cosa)

- `ventas`: fecha, receta_nombre, litros, precio_venta, **ingreso_total** (ya calculado = litros×precio), **delivery = costo PAGADO a un tercero** (Uber/motoboy), origen, orden_id. OJO: ~34 ventas legacy no tienen orden_id y ~36 no tienen origen.
- `ordenes`: cliente_id (uuid, 100% poblado), cliente_nombre, origen, delivery (costo pagado), delivery_tipo ('propio'/'retiro'/'uber'/'motoboy'), distancia_km, medio_pago, hora.
- `caja`: tipo ('entrada'/'salida'), categoria, monto. El **cobro de delivery al cliente** vive aquí como entrada categoría 'Delivery' (no existe en `ventas`).
- `compras`: tipo ('insumo'/'capital_trabajo'/'activo_fijo'), es_inversion, precio_total.
- `origen` tiene valores legacy: 'Instagram' (viejo) convive con 'IG Pauta'/'IG Orgánico' (nuevos). Para atribución de pauta usar el helper existente `esOrigenIGAds` de `src/lib/calculos.js` (= 'Instagram' + 'IG Pauta'). No filtrar solo por 'IG Pauta'.

## Parte 1 — Cálculo de KPIs (determinista, en el cliente)

**No crear backend para los KPIs.** La app calcula todo client-side; crear `src/lib/dashboardMetrics.js` que **reutilice** `rentabilidad.js`, `finanzasMes.js` y `calcularCostoReceta` de `calculos.js`. Prohibido reimplementar COGS/márgenes: `rentabilidad.js` existe justamente para que las vistas no diverjan.

**KPIs principales:**
- Ingreso total (`sum(ingreso_total)`), litros, n° ventas, por semana (lunes-domingo) y por mes.
- Ticket promedio por orden: agrupar `ingreso_total` por `orden_id`, promediar. Excluir explícitamente las ventas sin `orden_id` y mostrar cuántas quedaron fuera.
- Ingreso por día de la semana; precio promedio por litro.

**Por canal:**
- Tres series semanales: 'Cliente habitual', pauta IG (vía `esOrigenIGAds`), y resto (incluida una serie "Sin origen" para las ventas con origen vacío — no esconderlas).
- Gasto semanal en pauta: `caja` salidas categoría 'Publicidad'.
- ROAS semanal = ingreso pauta IG de la semana / gasto pauta de la semana.
- CAC = gasto pauta del período / clientes nuevos (primera orden del `cliente_id` cae en el período y su origen es de pauta).

**Costos y margen:**
- Costo por receta: usar `calcularCostoReceta` (ya maneja merma, flag `aplica_merma` y envase por formato vía registro ENVASE + `insumos.costo_ppp`). No recalcular PPP desde `compras`.
- Margen bruto teórico por receta ($ y %) y ponderado por litros.
- Ratio compras insumos / ingreso del mes: `compras` con `tipo = 'insumo'`.

**Clientes:** únicos por `ordenes.cliente_id`, % con 2+ órdenes, nuevas vs recurrentes por semana.

**Delivery:** el costo es `ordenes.delivery`; el cobro al cliente son las entradas 'Delivery' de `caja`. **No usar `delivery = 0` como "no se cobró"** — significa "no se pagó a un tercero". El KPI de anillos (≤10 km con <2 lt sin cobro, 10-15 km con <3 lt sin cobro) queda **pendiente hasta que exista `ordenes.delivery_cobrado`** (ver docs/plan-delivery-cobrado.md). Mientras tanto, mostrar: órdenes por tramo de `distancia_km`, litros promedio por tramo y total cobrado por delivery (caja).

## Parte 2 — UI

Usar las **CSS variables existentes** de `index.css` (--bg, --card, --pink #C4005A, --cyan #00C8C8, --green #22C55E, --purple), no hex nuevos. Misma estructura de tarjetas `kpi-card`/`card` que el resto de la app.

1. Fila de tarjetas KPI con semáforo.
2. Gráfico principal apilado: ingreso semanal por canal + gasto en pauta anotado bajo cada barra.
3. Línea de ingreso semanal total; barras por día de semana; dona por origen.
4. Barras horizontales margen $/litro por receta (verde >$5.500, ámbar $4.800-5.500, rojo <$4.800).
5. Tabla "Dónde poner el ojo":

| Indicador | Piso/meta | Semáforo |
|---|---|---|
| Gasto pauta/semana | $50-60K sin pausas | rojo si <$25K |
| ROAS semanal | ≥3x | rojo si <3x dos semanas seguidas |
| Ingreso habituales/semana | ≥$100K | rojo si <$100K dos semanas seguidas |
| Clientes nuevos/semana | ≥10 | ámbar si <10 |
| Ticket promedio | ≥$17.500 | ámbar si baja |
| Recompra acumulada | meta 35% | ámbar si <30% |
| Compras insumos/ingreso (mes) | ≤50% | rojo si >55% |

## Parte 3 — Insights con API de Claude

**Lo ÚNICO que va en backend:** una Vercel serverless function `api/insights.js`. `ANTHROPIC_API_KEY` solo en variables de entorno de Vercel. Como el PIN de la app es client-side, **proteger el endpoint**: header con token compartido (env var) + cache server-side de 24 h para que recargar la vista no genere llamadas nuevas.

**Flujo:** el cliente calcula el JSON de métricas (Parte 1) → POST al endpoint → Claude (modelo `claude-haiku-4-5-20251001`, `max_tokens` ~600, salida estructurada) → `{ resumen, alertas[], recomendacion_principal }` → tarjeta "Análisis de la semana". Guardar histórico en tabla `insights` (fecha, json_metricas, respuesta).

**System prompt para Claude:**

> Eres el asesor de negocio de The Drink, marca chilena de cócteles embotellados de 1 litro con delivery en Santiago. Hablas en español chileno, directo y sin relleno. Recibes un JSON con KPIs ya calculados; nunca inventes cifras que no estén en el JSON. Los márgenes, ROAS y metas vienen EN el JSON — no asumas valores de memoria.
>
> Reglas: si el ingreso baja, revisa primero si bajó el gasto en pauta antes de hablar de caída de demanda — distingue "pauta apagada" de "demanda débil". Si habituales y ticket suben mientras el total baja, dilo explícito. Si el ROAS cae 2+ semanas con gasto estable, sugiere cambiar creativo, no recortar. Máximo 3 hallazgos, el más importante primero, máximo 4 frases cada uno. Cierra con UNA acción concreta para esta semana.

(Nota: se eliminaron del system prompt los valores hardcodeados de margen 61% y ROAS 3,5x — el margen real lo calcula `rentabilidad.js` y va en el JSON. Hardcodear cifras en el prompt hace que la IA contradiga al dashboard cuando los números cambien.)

## Criterios de aceptación

1. KPIs coinciden con SQL manual; la IA no calcula nada.
2. Las series de canal usan `esOrigenIGAds` y muestran "Sin origen" aparte.
3. Semáforos respetan la tabla de umbrales.
4. La API key no aparece en frontend ni en el repo; el endpoint exige el token.
5. Insight cacheado 24 h; recargar no llama a la API.
6. Ningún cálculo de margen/COGS duplicado: todo pasa por `rentabilidad.js` / `calculos.js`.

## Pendiente previo recomendado (migración de datos)

Antes o junto con el dashboard, normalizar datos:

```sql
-- Rellenar origen vacío en ventas desde su orden
UPDATE ventas v SET origen = o.origen
FROM ordenes o WHERE v.orden_id = o.id AND (v.origen IS NULL OR v.origen = '');
```

El legacy 'Instagram' se puede dejar (el helper lo cubre) o migrar a 'IG Pauta' si confirmas que toda esa época fue pauta.
