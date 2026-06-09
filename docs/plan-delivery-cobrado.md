# Plan: campo `delivery_cobrado` en `ordenes`

> Fase 2 del fix de delivery (jun 2026). La fase 1 ya está aplicada: las entradas
> de caja categoría 'Delivery' ahora SÍ suman al saldo en Caja, Dashboard,
> Mi Dinero, Proyecciones y Camino al Bar.

## Problema

Hoy el cobro de delivery al cliente se registra a mano en `caja` (entrada,
categoría 'Delivery'), desacoplado de la orden. Consecuencias:

- No se puede saber qué órdenes se cobraron y cuáles no (el KPI de anillos del
  dashboard es incalculable: `ordenes.delivery = 0` significa "no pagué a un
  tercero", no "no cobré").
- Depende de disciplina manual: si se olvida el registro en caja, la plata
  desaparece del sistema.
- No se puede cruzar cobro vs costo por orden (margen real del delivery).

## Cambio propuesto

1. **Migración**
   ```sql
   ALTER TABLE ordenes ADD COLUMN delivery_cobrado numeric DEFAULT 0;
   COMMENT ON COLUMN ordenes.delivery_cobrado IS 'Monto cobrado al cliente por delivery. ordenes.delivery es lo pagado a terceros.';
   ```
2. **Formulario de Ventas/Órdenes**: input "Delivery cobrado al cliente" junto al
   actual "Costo Uber/motoboy". Visible cuando `delivery_tipo` ≠ 'retiro'.
3. **Cálculos**: sumar `delivery_cobrado` a los ingresos de saldo/caja
   (reemplaza al flujo manual por caja). Mantener `transporte` (costo) como está
   en `rentabilidad.js`.
4. **Transición**: migrar las 5 entradas históricas de caja 'Delivery'
   (~$14.861) a sus órdenes si se pueden identificar por fecha/cliente; si no,
   dejarlas en caja y descontinuar la categoría 'Delivery' para registros nuevos
   (o mantenerla solo como fallback, pero NUNCA registrar doble: orden O caja,
   no ambas).
5. **Dashboard**: con el campo poblado, activar el KPI de anillos
   (≤10 km / 10-15 km / >15 km, litros vs cobro).

## Riesgo principal

Doble conteo durante la transición: si una orden registra `delivery_cobrado` y
además se anota la entrada en caja, el saldo lo suma dos veces. Definir UNA
fuente y validarlo en el formulario (warning si ya existe entrada de caja
'Delivery' ese día por monto igual).
