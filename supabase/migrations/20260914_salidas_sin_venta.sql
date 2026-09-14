-- Migracion: Salidas sin venta (producto que salio y nadie pago)
-- Fecha: 2026-09-14
-- Motivo: consumo interno, pruebas para contenido/publicidad, pruebas de
-- desarrollo de recetas, canjes con influencers y roturas no tenian donde
-- registrarse. Se salian de bodega "a mano" (UPDATE directo en Stock, sin
-- rastro) o directamente no se registraban, y aparecian recien en el conteo
-- como faltante sin explicar, mezcladas con la merma real.
--
-- Registrarlas como venta a $0 rompe todo lo que lee `ventas` (margen bruto,
-- ticket promedio, ranking de recetas, CAC, clientes). Registrarlas en `caja`
-- cuenta la plata dos veces: el dinero salio cuando se compro el insumo.
--
-- DECISION CONTABLE: una salida NO toca `ventas`, `ordenes` ni `caja`.
--   - Descuenta bodega con el mismo motor que una venta (lib/inventario.js).
--   - Se valoriza a COSTO (PPP del momento, con merma y envase, misma formula
--     que el COGS), nunca a precio de venta: regalar un trago cuesta los
--     insumos, no la venta que "se dejo de hacer".
--   - En el P&L cae ENTRE margen bruto y margen operativo, desglosada por
--     motivo. El margen bruto queda limpio (solo lo vendido); el operativo
--     absorbe el costo real.
--   - Con esto, la diferencia del conteo pasa a ser SOLO lo que no se sabe
--     explicar (merma real, robo, error de carga).
--
-- Idempotente: se puede correr de nuevo sin problema.

create table if not exists public.salidas_stock (
  id                bigint generated always as identity primary key,
  fecha             date        not null default current_date,
  -- por que salio
  motivo            text        not null
                    check (motivo in ('consumo_interno', 'marketing', 'desarrollo', 'canje', 'merma')),
  -- QUE salio: o un trago armado (receta + litros, como una venta)...
  receta_nombre     text,
  litros            numeric,
  -- ...o un insumo suelto ("200 ml de gin probando proporciones").
  insumo_nombre     text,
  cantidad          numeric,
  unidad            text,
  -- true = la prueba se hizo en la coctelera, no se gasto frasco
  sin_envase        boolean     not null default false,
  -- quien lo recibio (canje: la influencer; marketing: el reel)
  destinatario      text,
  nota              text,
  -- SNAPSHOT del costo al momento de registrar (CLP). No se recalcula si el
  -- PPP cambia despues, igual que conteo_lineas.costo_unitario.
  costo_valorizado  numeric     not null default 0,
  created_at        timestamptz not null default now(),
  -- exactamente una de las dos formas
  constraint salidas_stock_receta_o_insumo check (
    (receta_nombre is not null and litros > 0 and insumo_nombre is null and cantidad is null)
    or
    (insumo_nombre is not null and cantidad > 0 and receta_nombre is null and litros is null)
  )
);

comment on table public.salidas_stock is
  'Producto que salio de bodega sin venta: consumo interno, marketing, desarrollo, canjes, merma. Descuenta stock, NO toca ventas ni caja. costo_valorizado es snapshot a PPP.';
comment on column public.salidas_stock.motivo is
  'consumo_interno | marketing | desarrollo | canje | merma. Define en que linea del P&L cae el costo.';
comment on column public.salidas_stock.costo_valorizado is
  'Costo en CLP al momento de registrar: receta -> costo por litro (con merma y envase) x litros; insumo -> cantidad x costo_ppp.';
comment on column public.salidas_stock.sin_envase is
  'true = no se uso frasco (prueba en coctelera). No se descuenta ni se cuesta el envase.';

create index if not exists idx_salidas_stock_fecha
  on public.salidas_stock (fecha desc);
create index if not exists idx_salidas_stock_motivo
  on public.salidas_stock (motivo);

-- Blindaje RLS (CLAUDE.md): tabla nueva = solo staff logueado, nada para anon.
alter table public.salidas_stock enable row level security;

drop policy if exists staff_authenticated_all on public.salidas_stock;
create policy staff_authenticated_all on public.salidas_stock
  for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificacion (SQL Editor): debe devolver una fila con rowsecurity = true.
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename = 'salidas_stock';
--
-- Rollback manual:
--   drop table if exists public.salidas_stock;
-- ─────────────────────────────────────────────────────────────────────────────
