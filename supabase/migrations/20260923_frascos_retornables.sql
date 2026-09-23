-- ─────────────────────────────────────────────────────────────────────────────
-- Frascos retornables («Frascos de vuelta», 23-sep-2026)
--
-- 6 frascos aceptados = 1 Mojito clásico o un 0.0, máximo 1 canje por pedido.
-- Una fila por devolución, canje o ajuste; el saldo del cliente es la suma de
-- `aceptados` (+n devolución, −6 canje, ± ajuste). Los rechazados se guardan
-- para medir qué % llega inservible, pero no suman.
--
-- Quién escribe: solo la app (src/lib/frascos.js). El stock de `Frascos 1lt`
-- lo mueve el cliente vía ajustar_stock (solo en devoluciones), como el resto
-- de los movimientos de venta. No hay trigger acá: no agregar uno.
--
-- `cliente_id` sin cascada a propósito: una fusión de clientes (ver
-- 20260803_fusionar_clientes_duplicados.sql) tiene que repuntar estas filas
-- igual que `ordenes`, y si se olvida, el delete del cliente falla en vez de
-- borrar su saldo en silencio.
-- `orden_id` en cascada: la app devuelve el stock ANTES de borrar el pedido.
--
-- Idempotente: se puede correr de nuevo.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.frascos_movimientos (
  id          bigint generated always as identity primary key,
  cliente_id  uuid   not null references public.clientes(id),
  orden_id    bigint references public.ordenes(id) on delete cascade,
  fecha       date   not null default (now() at time zone 'America/Santiago')::date,
  tipo        text   not null check (tipo in ('devolucion', 'canje', 'ajuste')),
  aceptados   int    not null default 0,
  rechazados  int    not null default 0 check (rechazados >= 0),
  canal       text   check (canal in ('puerta', 'punto_retiro', 'otro')),
  nota        text   check (char_length(nota) <= 300),
  created_at  timestamptz not null default now(),
  constraint frascos_devolucion_positiva check (tipo <> 'devolucion' or aceptados >= 0),
  constraint frascos_canje_seis          check (tipo <> 'canje' or aceptados = -6)
);

create index if not exists frascos_mov_cliente on public.frascos_movimientos (cliente_id);
create index if not exists frascos_mov_orden   on public.frascos_movimientos (orden_id);

-- RLS: solo `authenticated`, como toda tabla (CLAUDE.md).
alter table public.frascos_movimientos enable row level security;
drop policy if exists staff_authenticated_all on public.frascos_movimientos;
create policy staff_authenticated_all on public.frascos_movimientos
  for all to authenticated using (true) with check (true);
revoke all on public.frascos_movimientos from anon;

-- Saldo por cliente. security_invoker = la RLS de la tabla sigue mandando
-- (una vista normal corre como su dueño y se saltaría la RLS).
create or replace view public.frascos_saldo
with (security_invoker = true) as
select cliente_id,
       coalesce(sum(aceptados), 0)                                       as saldo,
       coalesce(sum(aceptados) filter (where tipo = 'devolucion'), 0)    as devueltos,
       coalesce(sum(rechazados), 0)                                      as rechazados,
       count(*) filter (where tipo = 'canje')                            as canjes,
       max(fecha) filter (where tipo = 'devolucion')                     as ultima_devolucion
from public.frascos_movimientos
group by cliente_id;

revoke all on public.frascos_saldo from anon, public;
grant select on public.frascos_saldo to authenticated;

-- ─── Verificación (correr después) ───────────────────────────────────────────
-- 1) Debe seguir devolviendo SOLO la fila de feedback / buzon_anon_insert:
--    select schemaname, tablename, policyname, cmd, roles from pg_policies
--    where schemaname = 'public' and (roles @> '{anon}' or roles @> '{public}');
-- 2) rowsecurity = true:
--    select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' and tablename = 'frascos_movimientos';
-- 3) Prueba del atacante (debe dar [] o error de permiso):
--    curl ".../rest/v1/frascos_saldo?select=*&limit=1" -H "apikey: <publishable>"
