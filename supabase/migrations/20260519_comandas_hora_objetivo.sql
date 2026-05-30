-- Migración: hora objetivo para comandas programadas
-- Fecha: 2026-05-19
-- Motivo: pedidos que entran a una hora pero se entregan más tarde
-- (ej. cliente escribe a las 7pm para encargar a las 10pm). Sin esto,
-- la comanda se pone en rojo ("urgente") cuando en realidad no toca aún.
--
-- Si hora_objetivo es NULL: pedido "para ahora", countdown desde created_at.
-- Si hora_objetivo tiene valor: pedido programado. El countdown arranca
-- recién 30min antes de la hora objetivo. Mientras tanto se ve atenuado.

alter table public.comandas
  add column if not exists hora_objetivo timestamptz;

comment on column public.comandas.hora_objetivo is
  'Hora a la que el cliente quiere recibir el pedido. NULL = para ahora. Si tiene valor, el cronómetro de urgencia arranca 30 min antes.';

-- Índice opcional para listar/ordenar por hora objetivo en la TV
create index if not exists idx_comandas_hora_objetivo
  on public.comandas (hora_objetivo)
  where hora_objetivo is not null;

-- Rollback:
-- alter table public.comandas drop column if exists hora_objetivo;
