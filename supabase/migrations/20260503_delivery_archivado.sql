-- Migración: campo archivado en ordenes para delivery
-- Fecha: 2026-05-03

alter table public.ordenes
  add column if not exists delivery_archivado boolean default false;

comment on column public.ordenes.delivery_archivado is
  'Si true, el pedido no aparece en el panel activo de delivery. Solo visible en historial.';

-- Archivar TODOS los drops con estado_delivery que ya existen (son datos de prueba/pasados)
update public.ordenes
  set delivery_archivado = true
  where estado_delivery is not null;

create index if not exists idx_ordenes_delivery_archivado
  on public.ordenes (delivery_archivado)
  where delivery_archivado = true;
