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

-- ─────────────────────────────────────────────────────────────────────────────
-- Tiempo de delivery por comanda + parámetros globales
-- El countdown debe arrancar tiempo_prep + tiempo_delivery antes de hora_objetivo,
-- para que cuando termines de preparar puedas salir y llegar a tiempo.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.comandas
  add column if not exists tiempo_delivery_min int;

comment on column public.comandas.tiempo_delivery_min is
  'Minutos de delivery para esta comanda. Si NULL y el cliente tiene distancia_km, se estima desde ahí. Si nada de eso, asume 0 (retiro).';

-- Parámetros globales: tiempo de prep + cálculo de delivery por distancia.
-- Idempotente: solo inserta si las claves no existen.
insert into public.config (clave, valor)
select v.clave, v.valor
from (values
  ('comandas_prep_minutos',         30),   -- prep estándar para una comanda
  ('comandas_delivery_min_por_km',   2),   -- minutos por km de distancia
  ('comandas_delivery_buffer_min',  10)    -- buffer fijo en minutos
) as v(clave, valor)
where not exists (
  select 1 from public.config c where c.clave = v.clave
);

-- Rollback:
-- alter table public.comandas drop column if exists hora_objetivo;
-- alter table public.comandas drop column if exists tiempo_delivery_min;
-- delete from public.config where clave in (
--   'comandas_prep_minutos','comandas_delivery_min_por_km','comandas_delivery_buffer_min'
-- );
