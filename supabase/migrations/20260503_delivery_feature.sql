-- Migración: feature de Delivery
-- Fecha: 2026-05-03
-- Agrega dirección, teléfono del cliente y estado de delivery a la tabla ordenes.
-- También configura el rol de delivery en Supabase Auth.

-- 1. Agregar columna cliente_direccion (text, nullable)
alter table public.ordenes
  add column if not exists cliente_direccion text;

comment on column public.ordenes.cliente_direccion is
  'Dirección de entrega del pedido. Requerida cuando delivery_tipo es motoboy, propio u otro.';

-- 2. Agregar columna cliente_telefono (text, nullable)
alter table public.ordenes
  add column if not exists cliente_telefono text;

comment on column public.ordenes.cliente_telefono is
  'Teléfono de contacto del cliente para coordinar el delivery.';

-- 3. Agregar columna estado_delivery con valores pendiente / en_camino / entregado
alter table public.ordenes
  add column if not exists estado_delivery text default 'pendiente';

alter table public.ordenes
  add constraint ordenes_estado_delivery_check
  check (
    estado_delivery is null
    or estado_delivery = any (array['pendiente','en_camino','entregado']::text[])
  );

comment on column public.ordenes.estado_delivery is
  'Estado del delivery: pendiente (no ha salido), en_camino (en ruta), entregado (completado).';

-- 4. Índice para que el panel de delivery filtre rápido por estado
create index if not exists idx_ordenes_estado_delivery
  on public.ordenes (estado_delivery)
  where estado_delivery is not null;

-- Rollback (manual si fuera necesario):
-- alter table public.ordenes drop column if exists cliente_direccion;
-- alter table public.ordenes drop column if exists cliente_telefono;
-- alter table public.ordenes drop column if exists estado_delivery;
-- drop index if exists idx_ordenes_estado_delivery;
