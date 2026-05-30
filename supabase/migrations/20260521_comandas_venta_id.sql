-- Migración: vincular comanda con su venta/orden
-- Fecha: 2026-05-21
-- Motivo: cuando una comanda se migra a venta, NO se debe archivar (debe seguir
-- visible en la TV hasta que se marque "lista"). Para evitar duplicar la venta
-- en caso de error, guardamos el id de la orden creada.

alter table public.comandas
  add column if not exists venta_orden_id bigint references public.ordenes(id) on delete set null;

comment on column public.comandas.venta_orden_id is
  'Id de la orden creada cuando esta comanda se migró a venta. NULL = aún no se ha registrado venta para esta comanda.';

create index if not exists idx_comandas_venta_orden_id
  on public.comandas (venta_orden_id)
  where venta_orden_id is not null;

-- Rollback:
-- alter table public.comandas drop column if exists venta_orden_id;
