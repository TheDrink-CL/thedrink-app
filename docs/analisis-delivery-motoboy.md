# Análisis Delivery — ¿Conviene contratar motoboy?

> The Drink · Santiago de Chile · Mayo 2026
> Datos: 55 órdenes reconstruidas (28 mar - 3 may 2026)
> Volumen actual: ~22 órdenes/sem (en aceleración) · Distancia promedio: 6 km · Rango: 3-15 km
> Operación actual: el founder entrega personalmente en EV propio; 1 delivery vía Uber registrado

---

## TL;DR

A tu volumen actual (Mayo 2026) **no conviene un motoboy fijo bajo contrato**. Pero estás creciendo rápido (+350% en órdenes la última semana vs anterior), tu negocio está concentrado fin-de-semana noche (83% de ventas son V/S/D), y **estás absorbiendo todo el delivery sin cobrarlo** — porque lo haces tú mismo y no te lo cargas a la operación.

La pregunta correcta a tu volumen actual no es "¿motoboy fijo o no?" — es **"¿cuándo y cómo empezar a cobrar delivery, qué casos delegar, qué umbrales gatillan motoboy fijo?"**. La respuesta corta es:

1. **Implementa cobro de delivery YA** — escalonado por tramo y con mínimo de pedido.
2. **Sigue tú con el EV** mientras volumen siga bajo 25 órdenes/sem.
3. **Activa freelance/Uber Direct** solo cuando tengas conflicto de horario o pedidos largos (>10 km).
4. **Reevalúa motoboy fijo part-time (Thu-Sun) en 60-90 días** si la tendencia se sostiene.

---

## 1. Lectura correcta de los datos

### Cómo registras hoy en la app

- Campo `ordenes.delivery`: monto **pagado a un tercero** (Uber Eats, motoboy, etc.) que se descuenta del neto de venta.
- Campo `ordenes.delivery_tipo`: `uber` / `motoboy` / `retiro` / `otro` (ahora también `propio`).
- **Cuando el delivery lo haces tú, NO lo registras** porque no hay pago a un tercero.

### Implicación para el análisis

| Tipo de orden | Cómo aparece en datos | Costo real para ti |
|---|---|---|
| Retiro en local | `delivery=0`, `delivery_tipo=null` o `retiro` | 0 |
| Delivery por tu EV | `delivery=0`, sin marca | **Tu tiempo + energía + desgaste** (oculto) |
| Uber Eats | `delivery=3.250` (caso real 03-may), `delivery_tipo=uber` | El monto registrado |
| Motoboy externo | `delivery=X`, `delivery_tipo=motoboy` | El monto registrado |

De las 55 órdenes reconstruidas, **solo 1 tiene delivery registrado** (Uber 3.250 CLP del 03-may). Las otras 54 están dentro de uno de estos buckets:

- **Retiro real en local** (probable, dada Comuna Santiago)
- **Tú entregando en EV sin trackear** (probable, según tu propia confirmación)

**Sin saber el ratio retiro:propio, el análisis de tarifas óptimas tiene un margen de error grande.** Por eso ahora se agregó:

1. `delivery_tipo = 'propio'` en la app — para que marques cuando lo haces tú
2. `distancia_km` en `ordenes` — para que captures distancia real de cada delivery

Con 4-6 semanas de tracking activo, podremos calibrar el modelo con tu mix real.

---

## 2. Costo real del delivery actual (EV propio)

### Costo variable del vehículo

| Ítem | CLP/km | Notas |
|---|---|---|
| Energía eléctrica | 26,4 | 0,16 kWh/km × 165 CLP/kWh (tarifa residencial Santiago) |
| Desgaste neumáticos | 6,0 | 300.000 CLP cada 50.000 km |
| Depreciación marginal | 15,0 | Conservador, asumiendo que el auto ya existe |
| **Total variable EV** | **47,4** | Muy bajo vs bencinero (~120 CLP/km) |

No incluyo seguro ni permiso de circulación: son fijos que pagas igual.

### Costo del tiempo (lo realmente caro)

- Tiempo prom. puerta a puerta: **40 min** (ida + entrega + vuelta)
- Valor de oportunidad founder: **8.000 CLP/hr** (conservador)
- **Costo de tu tiempo por delivery: ~5.333 CLP**

### Costo total por delivery promedio (6 km, ida y vuelta = 12 km)

```
Costo móvil:    569 CLP
Costo tiempo: 5.333 CLP
─────────────────────
TOTAL:        5.902 CLP
```

### Costo oculto mensual a volumen actual (22 órdenes/sem ≈ 95/mes)

Asumiendo **70% de las órdenes son delivery propio** (placeholder hasta tener tracking):

| Concepto | Estimado |
|---|---|
| Pedidos/mes | ~95 |
| Deliveries propios estimados | ~67 |
| Horas tuyas en delivery | **~45 hrs/mes** |
| Costo energía + desgaste EV | ~38.000 CLP |
| Costo tu tiempo | ~360.000 CLP |
| **Costo oculto total** | **~400.000 CLP/mes** |

Este número solo se hará firme cuando empieces a marcar `delivery_tipo='propio'` y `distancia_km` consistentemente.

---

## 3. Crecimiento — el dato que cambia la conversación

| Semana | Órdenes | Ingreso | Ticket prom |
|---|---|---|---|
| 23-29 mar | 3 | 25.000 | 8.333 |
| 30 mar - 5 abr | 4 | 36.000 | 9.000 |
| 6-12 abr | 7 | 78.000 | 11.143 |
| 13-19 abr | 14 | 122.000 | 8.714 |
| 20-26 abr | 5 | 78.725 | 15.745 |
| **27 abr - 3 may** | **22** | **381.100** | **17.323** |

- **Crecimiento última semana vs anterior:** +350% en órdenes, +384% en ingreso
- **Ticket promedio creciendo:** de 8.333 a 17.323 (×2 en 6 semanas)
- **El último período tiene findefin largo (1° de mayo)**, pero la tendencia previa ya era ascendente

**Implicación:** la decisión de motoboy fijo debe planearse pensando en el volumen de los próximos 90 días, no en el actual.

---

## 4. Patrones operacionales

### Concentración fin de semana — 83% Thu-Sun

| Día | Líneas de venta |
|---|---|
| Wednesday | 3 |
| Thursday | 11 |
| Friday | 26 |
| Saturday | 28 |
| Sunday | 15 |
| Mon/Tue | 0 |

**Implicación dura:** un motoboy fijo full-time es absurdo (4 días inactivos). Si llega el momento de fijo, debe ser **part-time Thu-Sun**.

### Negocio nocturno — 56% pedidos entre 20h-5am

Tu horario de operación coincide con el horario en que motoboys nocturnos cobran +20-30% y apps tipo Uber Direct tienen surge. Pero **tu EV es muy eficiente de noche**: sin tráfico, los deliveries bajan de 40 min a 25-30 min, y tu costo por delivery cae a ~3.700 CLP.

**Implicación:** mientras seas tú, te conviene la noche. Cuando terceres, las opciones más baratas se vuelven 20-30% más caras.

### Distribución por volumen físico

| Litros | Cantidad órdenes | Ticket prom |
|---|---|---|
| 1L | 35 (64%) | 8.531 |
| 2L | 13 (24%) | 15.671 |
| 3L | 5 (9%) | 26.600 |
| 3L+ | 2 (4%) | 42.750 |

**Insight:** los pedidos de 1L (64% del total) tienen ticket bajo. Cobrar 4.500 de delivery en una orden de 8.500 es **53% del ticket** — imposible. Necesitas mínimo de pedido para delivery.

---

## 5. Comparativa por distancia

Costo de cada opción vs hacerlo tú mismo (EV + tu tiempo, en horario nocturno con 30 min/delivery):

| Distancia | App despacho | Motoboy freelance | Tú en EV (noche) | Quién gana |
|---|---|---|---|---|
| 3 km | 3.500 | 3.500 | 4.142 | **App o motoboy** |
| 5 km | 4.700 | 3.500 | 4.331 | **Motoboy** |
| 6 km ⭐ | 5.300 | 4.100 | 4.426 | **Motoboy** |
| 8 km | 6.500 | 5.300 | 4.616 | **Tú en EV** ⚠️ |
| 10 km | 7.700 | 6.500 | **4.805** | **Tú en EV** |
| 15 km | 10.700 | 9.500 | **5.279** | **Tú en EV** |

> ⭐ Distancia promedio reportada
> ⚠️ El cruce sube de 6km a 8km cuando operas de noche (más eficiente que de día)

**Insight crítico:** trabajando de noche tu EV es competitivo hasta 8 km. Solo en pedidos cortos (3-6 km) un freelance te gana.

---

## 6. Tres figuras posibles

### A. Apps de despacho (Uber Direct / Pedidos Ya Envíos / Cabify Express)

**Cuándo:** tramos cortos (3-5 km) o cuando estás ocupado y no puedes salir tú.
**Pros:** cero compromiso, factura electrónica, disponibilidad instantánea.
**Contras:** caro >8 km, sin control sobre repartidor.
**Tarifa Santiago (Mayo 2026):** ~3.500 base + 600/km después de 3 km.

### B. Motoboy freelance con boleta de honorarios ✅ La opción que se debe construir AHORA

**Cuándo:** rango 5-8 km, pedidos del finde noche cuando estás cocinando, fines de semana de alto volumen.
**Pros:** mejor relación costo/control, gasto deducible, relación construida.
**Contras:** disponibilidad no garantizada → necesitas 2 personas, no 1.
**Figura legal Chile:** boleta de honorarios mensual, retención 13,75% (2026), cero leyes sociales.
**Tarifa Santiago:** 3.500-4.500 hasta 5 km, +500-600/km extra. Nocturno +20-30%.

> **Acción:** si los 3.250 CLP del 03-may fueron Uber Eats, prueba con un motoboy real este finde y compara. Buscar en grupos Facebook "Motoboys Santiago" o pedir referencia a otros emprendimientos gastro de tu zona.

### C. Motoboy fijo (full-time) — DESCARTADO a tu volumen

Costo total empleador full-time: ~780.000 CLP/mes. Punto de equilibrio: 195 deliveries/mes pagados. Hoy estás en ~67/mes (estimado). **NO viable.**

### D. Motoboy fijo PART-TIME Thu-Sun — Opción a evaluar en 60-90 días

Esta es la figura más realista a tu negocio. Contrato 4 días/sem (Thu-Sun), 6-8 horas cada uno, durante horario nocturno (19h-3am).

**Costos estimados:**

| Concepto | CLP/mes |
|---|---|
| Sueldo proporcional (4/7 días, ~24 hrs/sem) | 350.000 |
| Leyes sociales (~25%) + provisión vacaciones | 105.000 |
| Bonos noche / movilización | 50.000 |
| **Costo total empleador part-time** | **~505.000** |

**Punto de equilibrio:** si haces 60+ deliveries reales por mes en findes con este motoboy, sale más barato que freelance al mismo volumen. Cuando consolides ≥18 deliveries/sem por 8 semanas seguidas, conversación abierta.

---

## 7. Política de cobro de delivery propuesta

### Tarifa al cliente

| Distancia | Cobro al cliente | % sobre ticket promedio (17.000) |
|---|---|---|
| 0-5 km | 3.500 CLP | 21% |
| 5-8 km | 4.500 CLP | 26% |
| 8-12 km | 6.000 CLP | 35% |
| 12-15 km | 7.500 CLP | 44% |

### Mínimo de pedido para delivery

- **Pedido <12.000 CLP:** retiro forzoso o delivery flat 4.500 CLP (el cliente decide).
- **Pedido 12.000-25.000 CLP:** delivery escalonado por distancia (tabla arriba).
- **Pedido >25.000 CLP:** delivery con descuento (-1.000 CLP) como incentivo a pedidos grandes.

### Por qué esto funciona

- Pedidos chicos (1L, 64% del volumen) → conviertes parte a retiro (margen total mejora) o cobras flat 4.500
- Pedidos medianos → cobras lo justo, te cubre tercerizar
- Pedidos grandes (27% del volumen, ticket 31k+) → pagan delivery sin fricción y los puedes priorizar tú

---

## 8. Plan de acción 90 días

### Semana 1-2: Empezar a registrar y cobrar

- ✅ Migración SQL: agregada columna `distancia_km` en `ordenes`.
- ✅ Tipo `propio` agregado en formulario de Ventas.
- ✅ Campo distancia visible en form de creación y edición.
- 🟡 **Tú:** marca cada orden con `delivery_tipo` real y `distancia_km` real (estima visualmente al inicio, después puedes usar Google Maps).
- 🟡 **Tú:** define y aplica política de cobro de delivery (tabla sección 7).

### Semana 3-6: Construir red de tercerización

- Crear cuenta business en Uber Direct y Pedidos Ya Envíos.
- Probar 2-3 motoboys freelance distintos. Quedarse con los 2 mejores.
- Acordar tarifa fija con cada uno + boleta de honorarios mensual.

### Semana 7-12: Optimizar y reevaluar

- Con 6 semanas de data trackeada, revisar:
  - ¿Mix real retiro vs propio vs tercero?
  - ¿Distribución real de distancias?
  - ¿% deliveries que aceptan pagar el cobro?
  - ¿Margen real de delivery (cobrado − pagado)?
- **Si:** órdenes/sem ≥18 sostenidas + ≥60% son delivery + tu tiempo se vuelve cuello de botella → **abrir conversación motoboy part-time Thu-Sun**.

---

## 9. Métricas a trackear (build it into the app)

KPIs que sería bueno agregar a `Analisis.js`:

1. **Margen delivery mensual** = Σ(delivery cobrado al cliente) − Σ(delivery pagado a tercero)
2. **% órdenes por delivery_tipo**: retiro / propio / uber / motoboy / otro
3. **Distancia promedio por delivery_tipo**: con `distancia_km` ahora se puede
4. **Costo oculto delivery propio** = pedidos `propio` × (47 CLP × 2 × distancia + 5.333 CLP tiempo)
5. **Tiempo founder en delivery propio** (suma de horas estimadas) — cuando crece, es señal de que hay que tercerizar más

---

## 10. Riesgos y supuestos

| Supuesto del modelo | Si está mal | Cómo lo verifico |
|---|---|---|
| 70% de órdenes son delivery propio | Ratio retiro/propio cambia todo | Trackear `delivery_tipo='propio'` 4 semanas |
| Distancia promedio 6 km | Si es más, costo propio sube | Trackear `distancia_km` 4 semanas |
| Ticket promedio 17k se mantiene | Si baja, cobrar delivery se hace más duro | Revisar mensual |
| Crecimiento se sostiene | Si fue solo findefin largo, vuelves al escenario base | Comparar próximas 4 semanas |
| Apps cobran lo estimado | Tarifas pueden cambiar | Pedir cotización Uber Direct hoy |

---

## 11. Cifras clave de referencia

```
Costo variable EV:           47,4 CLP/km
Costo tiempo founder:     8.000 CLP/hr
Tiempo prom delivery día:    40 min
Tiempo prom delivery noche:  30 min  (sin tráfico)
Costo prom delivery propio: ~5.000 CLP (noche, 6km)
Pedidos/sem actual:           22 (aceleración)
Pedidos/sem hace 6 sem:        3
Break-even motoboy fijo:     195 ped/mes (full-time)
Break-even motoboy part-time: ~80 ped/mes (Thu-Sun)
```

---

## Apéndice: cambios técnicos en la app (3-may-2026)

### Migración SQL
- `supabase/migrations/20260503_add_distancia_km_y_propio.sql`
- Agrega columna `ordenes.distancia_km numeric(5,2)`.
- Crea índice parcial para queries por distancia.

### Cambios en `src/pages/Ventas.js`
- Nuevo `delivery_tipo`: `'propio'` (entrega tuya en EV, sin pago a tercero).
- Nuevo estado `distanciaKm` en formulario nuevo y modal de edición.
- Input de distancia visible cuando `delivery_tipo` está seteado y no es `retiro`.
- Para `propio` solo se pide distancia (no costo).
- Badge en lista de órdenes muestra "⚡ Entrega propia (EV)" + distancia.

### Cambios en `src/pages/Analisis.js`
- Query de `ordenes` ahora incluye `distancia_km` para usarlo en KPIs futuros.

### Pendientes de UI sugeridos
- KPI "Costo oculto delivery propio" en Analisis (usar fórmula de sección 9).
- KPI "Margen delivery" (cobrado − pagado) por mes.
- Filtro en historial de Ventas por `delivery_tipo`.
