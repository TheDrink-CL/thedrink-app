-- Migracion: Conteo de inventario (el stock es dinero)
-- Fecha: 2026-06-25
-- Motivo: hoy un ajuste de stock es un UPDATE directo sobre insumos.stock_actual
-- que pisa el valor anterior SIN dejar rastro. Esta migracion agrega un libro
-- de conteos fisicos: cada vez que Ro cuenta el inventario real, se guarda la
-- diferencia contra el stock teorico, valorizada con el costo_ppp de cada insumo.
--
-- DECISION CONTABLE (importante): el ajuste NO toca la tabla `caja`.
-- La plata ya salio de caja cuando se compro el insumo (via tabla `compras`).
-- Re-valorizar el inventario al contar mueve el VALOR DEL ACTIVO INVENTARIO,
-- no el efectivo. Un faltante al contar es una PERDIDA de valor (merma, robo,
-- error de carga), no una salida de caja nueva. Sumarlo a caja seria contar
-- la plata dos veces. Por eso el informe vive aparte de Caja.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Cabecera del conteo: una fila por sesion de conteo fisico.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.conteos_inventario (
  id                bigint generated always as identity primary key,
  fecha             date        not null default current_date,
  -- valor teorico = suma(stock_actual_previo * costo_ppp) al momento de contar
  valor_teorico     numeric     not null default 0,
  -- valor real = suma(conteo_real * costo_ppp)
  valor_real        numeric     not null default 0,
  -- ajuste = valor_real - valor_teorico (negativo = perdiste valor)
  ajuste_valor      numeric     not null default 0,
  -- cuantos insumos tuvieron diferencia distinta de cero
  lineas_con_diff   int         not null default 0,
  nota              text,
  created_at        timestamptz not null default now()
);

comment on table public.conteos_inventario is
  'Cabecera de cada conteo fisico de inventario. ajuste_valor negativo = se perdio valor (merma/robo/error). NO impacta la tabla caja.';
comment on column public.conteos_inventario.ajuste_valor is
  'valor_real - valor_teorico en CLP. Negativo: el inventario valia menos de lo que la app creia (perdida).';

create index if not exists idx_conteos_inventario_fecha
  on public.conteos_inventario (fecha desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lineas del conteo: una fila por insumo contado en esa sesion.
--    Se guarda el costo_ppp aplicado en el momento (snapshot historico), para
--    que el informe no cambie aunque el costo del insumo cambie despues.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.conteo_lineas (
  id                bigint generated always as identity primary key,
  conteo_id         bigint      not null references public.conteos_inventario(id) on delete cascade,
  insumo_nombre     text        not null,
  unidad            text,
  -- lo que la app creia que habia antes de contar
  stock_teorico     numeric     not null default 0,
  -- lo que Ro conto fisicamente
  stock_real        numeric     not null default 0,
  -- stock_real - stock_teorico (en unidades del insumo)
  diff_unidades     numeric     not null default 0,
  -- costo por unidad aplicado al valorizar (snapshot del costo_ppp del insumo)
  costo_unitario    numeric     not null default 0,
  -- diff_unidades * costo_unitario (CLP). Negativo = faltante valorizado.
  diff_valor        numeric     not null default 0,
  created_at        timestamptz not null default now()
);

comment on table public.conteo_lineas is
  'Detalle por insumo de cada conteo. costo_unitario es un snapshot del costo_ppp al momento de contar, para que el historico no se distorsione.';

create index if not exists idx_conteo_lineas_conteo
  on public.conteo_lineas (conteo_id);
create index if not exists idx_conteo_lineas_insumo
  on public.conteo_lineas (insumo_nombre);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS abierto, igual que el resto de las tablas de la app.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conteos_inventario enable row level security;
drop policy if exists "conteos_inventario_full_access" on public.conteos_inventario;
create policy "conteos_inventario_full_access"
  on public.conteos_inventario for all using (true) with check (true);

alter table public.conteo_lineas enable row level security;
drop policy if exists "conteo_lineas_full_access" on public.conteo_lineas;
create policy "conteo_lineas_full_access"
  on public.conteo_lineas for all using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback manual:
-- drop table if exists public.conteo_lineas;
-- drop table if exists public.conteos_inventario;
-- ─────────────────────────────────────────────────────────────────────────────
