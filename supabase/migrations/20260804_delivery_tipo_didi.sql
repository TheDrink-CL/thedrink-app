-- Migración: permitir delivery_tipo = 'didi' en ordenes
-- Fecha: 2026-08-04
-- Motivo: DiDi solo se puede pagar con la tarjeta bancaria personal del dueño,
--         mientras que Uber Eats se cobra de la misma cuenta del negocio donde
--         entran los pagos. Hasta ahora los pedidos DiDi se registraban como
--         'uber', lo que hacía imposible calcular cuánta plata personal hay
--         que reembolsar: el KPI de Caja sumaba ambos e inflaba el monto.
--         Separarlos permite que el KPI "Por pagarte — delivery (mes)" cuente
--         solo lo adelantado de verdad (ver TIPOS_DELIVERY_ADELANTADO en
--         src/lib/calculos.js).
--
-- IMPORTANTE: correr esta migración ANTES de desplegar el frontend que ofrece
-- DiDi en el selector. Si el frontend sale primero, elegir DiDi falla con
-- violación del CHECK constraint al guardar el pedido.

alter table public.ordenes
  drop constraint if exists ordenes_delivery_tipo_check;

alter table public.ordenes
  add constraint ordenes_delivery_tipo_check
  check (
    delivery_tipo is null
    or delivery_tipo = any (array['uber','didi','motoboy','propio','retiro','otro']::text[])
  );

-- Nota: los pedidos DiDi de este mes que quedaron guardados como 'uber' hay que
-- reetiquetarlos para que el KPI del mes salga correcto. Se puede desde la app
-- (editar el pedido y cambiar el tipo), o acá si sabés cuáles son:
--
--   update public.ordenes set delivery_tipo = 'didi' where id in (...);
--
-- Los meses ya conciliados con el banco NO se tocan.

-- Rollback (manual si fuera necesario):
-- alter table public.ordenes drop constraint if exists ordenes_delivery_tipo_check;
-- alter table public.ordenes add constraint ordenes_delivery_tipo_check
--   check (delivery_tipo is null
--     or delivery_tipo = any (array['uber','motoboy','propio','retiro','otro']::text[]));
