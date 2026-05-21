-- Migración: Prioridad 4 — Mi Dinero (tablero mensual + runway personal)
-- Fecha: 2026-05-18
-- Motivo: visibilizar cuánto debe sacar Ro como sueldo cada mes y cuántos
-- meses de aire personal tiene contra su gasto. Mira hacia reinversión.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla `historial_personal`
--    Una fila por mes con: gasto personal real, colchón disponible, sueldo
--    que efectivamente sacó (puede diferir del calculado), y nota opcional.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.historial_personal (
  mes              text primary key,           -- 'YYYY-MM'
  gasto            numeric not null default 0, -- gasto personal del mes (CLP)
  colchon          numeric not null default 0, -- colchón disponible al cierre del mes
  sueldo_real      numeric,                    -- sueldo que efectivamente sacó (opcional)
  nota             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.historial_personal is
  'Datos personales del operador mes a mes: gasto, colchón y sueldo efectivamente retirado. Base para el cálculo de runway.';
comment on column public.historial_personal.mes is
  'Formato YYYY-MM (ej: 2026-05). Sirve como PK natural — un solo registro por mes.';
comment on column public.historial_personal.sueldo_real is
  'Sueldo que se sacó realmente. Si es null, en los reportes se asume el sueldo calculado (45% del margen operativo).';

create index if not exists idx_historial_personal_mes
  on public.historial_personal (mes desc);

alter table public.historial_personal enable row level security;
drop policy if exists "historial_personal_full_access" on public.historial_personal;
create policy "historial_personal_full_access"
  on public.historial_personal for all using (true) with check (true);

-- Trigger para auto-actualizar updated_at en cada update
create or replace function public.touch_historial_personal_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_historial_personal_updated_at on public.historial_personal;
create trigger trg_historial_personal_updated_at
  before update on public.historial_personal
  for each row execute function public.touch_historial_personal_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Claves de configuración para el split sueldo/reposición
--    Editables desde la app. Default 45% / 55%.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.config (clave, valor)
select v.clave, v.valor
from (values
  ('split_sueldo_pct',     0.45),  -- % del margen operativo que va al sueldo
  ('split_reposicion_pct', 0.55)   -- % para reponer inventario / reinvertir
) as v(clave, valor)
where not exists (
  select 1 from public.config c where c.clave = v.clave
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Claves para "Retirable hoy" — separar utilidad devengada de caja realizable
--    El sueldo del 45% es lo que el NEGOCIO genera. Pero la plata puede estar
--    atrapada en inventario, deliveries por cobrar, etc. La "reserva intocable"
--    define cuánto debe quedar SIEMPRE en caja para operar tranquilo. Retirable
--    hoy = caja - reserva. La reserva puede ser calculada automática o manual.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.config (clave, valor)
select v.clave, v.valor
from (values
  -- modo: 1 = automática (N meses de COGS + colchón), 0 = manual
  ('caja_reserva_modo',         1),
  -- monto manual (CLP) — solo se usa si modo = 0
  ('caja_reserva_manual',       0),
  -- cuántos meses de COGS cubre la reserva automática (default 1 mes)
  ('caja_reserva_meses_cogs',   1),
  -- colchón extra sobre la base de COGS (default 10%)
  ('caja_reserva_colchon_pct',  0.10)
) as v(clave, valor)
where not exists (
  select 1 from public.config c where c.clave = v.clave
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback manual:
-- drop trigger if exists trg_historial_personal_updated_at on public.historial_personal;
-- drop function if exists public.touch_historial_personal_updated_at();
-- drop table if exists public.historial_personal;
-- delete from public.config where clave in (
--   'split_sueldo_pct','split_reposicion_pct',
--   'caja_reserva_modo','caja_reserva_manual',
--   'caja_reserva_meses_cogs','caja_reserva_colchon_pct'
-- );
