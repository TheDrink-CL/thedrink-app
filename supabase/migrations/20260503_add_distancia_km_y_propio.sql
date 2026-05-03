-- Migración: agregar distancia_km a ordenes + soportar delivery_tipo = 'propio'
-- Fecha: 2026-05-03
-- Motivo: permitir trackear distancia real de cada delivery para análisis
--         financiero del modelo de tercerización; y registrar deliveries
--         hechos por el dueño/operación interna sin distorsionar costos.

-- 1. Agregar columna distancia_km (numeric, nullable)
alter table public.ordenes
  add column if not exists distancia_km numeric(5,2);

comment on column public.ordenes.distancia_km is
  'Distancia en kilómetros desde el punto de despacho hasta el cliente. Solo aplica si delivery_tipo está seteado.';

-- 2. (Opcional) índice si filtras por distancia en reportes futuros
create index if not exists idx_ordenes_distancia_km
  on public.ordenes (distancia_km)
  where distancia_km is not null;

-- 3. Actualizar el CHECK constraint de delivery_tipo para incluir 'propio'
--    (la tabla tenía un constraint que solo permitía uber/motoboy/retiro/otro)
alter table public.ordenes
  drop constraint if exists ordenes_delivery_tipo_check;

alter table public.ordenes
  add constraint ordenes_delivery_tipo_check
  check (
    delivery_tipo is null
    or delivery_tipo = any (array['uber','motoboy','propio','retiro','otro']::text[])
  );

-- Rollback (manual si fuera necesario):
-- alter table public.ordenes drop column distancia_km;
-- drop index if exists idx_ordenes_distancia_km;
