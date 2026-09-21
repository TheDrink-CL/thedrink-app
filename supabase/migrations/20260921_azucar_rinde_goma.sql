-- Migracion: Azucar rinde Goma — se compra azucar, la bodega lleva goma
-- Fecha: 2026-09-21
--
-- MOTIVO
-- Las recetas usan Goma (ml); lo que se compra es Azucar (g). Hasta hoy la
-- conversion era un boton manual en Compras ("Fabricar goma": 1000 g de
-- azucar -> 1500 ml de goma) que habia que acordarse de apretar; si no, el
-- azucar se acumulaba en un insumo que ninguna receta usa y la goma quedaba
-- en negativo. Pedido de Rodrigo (21-sep): que la compra de azucar entre a
-- bodega como goma de inmediato y que el azucar no se lleve aparte.
--
-- COMO
-- Dos columnas nuevas en `insumos`: `rinde_insumo` (en que insumo se
-- convierte lo comprado) y `rinde_factor` (cuantas unidades del destino
-- rinde una unidad del comprado). Azucar: rinde_insumo = 'Goma',
-- rinde_factor = 1.5 (1 g de azucar -> 1,5 ml de goma).
--
--   - Stock: el trigger de compras (compras_stock_trg, migracion 20260919)
--     manda el movimiento al insumo destino, multiplicado por el factor.
--     Insert suma, delete resta, update ajusta: igual que antes, pero en
--     Goma. Azucar queda en 0 para siempre; el cliente lo esconde de Stock,
--     Conteo, Salidas y recetas (solo existe en Compras).
--   - Costo: la goma no tiene compras propias, asi que su PPP se deriva:
--     Goma.costo_ppp = Azucar.costo_ppp / 1.5 (agua y trabajo no se cuentan,
--     igual que hasta hoy). Lo mantiene el trigger insumos_rinde_ppp_trg cada
--     vez que cambia el PPP del azucar (que a su vez recalcula
--     on_compra_recalcula_ppp con cada compra).
--   - Ventas y salidas que nombren Azucar directo: el cliente
--     (src/lib/inventario.js, aplicarMovimientosStock) las enruta a Goma con
--     el mismo factor, para que no quede stock escondido en un insumo que
--     nadie mira.
--
-- El mecanismo es generico (cualquier insumo puede "rendir" otro) pero hoy
-- solo lo usa Azucar -> Goma. Regla: el insumo destino (Goma) NO debe tener
-- compras propias, o on_compra_recalcula_ppp le pisaria el PPP derivado. Por
-- eso el cliente no ofrece Goma en el formulario de compras.
--
-- ORDEN SEGURO: correr esta migracion ANTES de hacer push del codigo. El
-- cliente nuevo pide `rinde_insumo`/`rinde_factor`; sin las columnas, Conteo
-- y Salidas no cargan insumos, y las compras de azucar se quedan en Azucar
-- sin boton para convertirlas (el traspaso del punto 4 las recoge cuando se
-- corra la migracion).
--
-- Idempotente: se puede correr de nuevo sin problema (el traspaso de stock
-- solo mueve lo que haya en Azucar, que despues de la primera corrida es 0).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Columnas: que rinde cada insumo ──────────────────────────────────────
alter table public.insumos
  add column if not exists rinde_insumo text,
  add column if not exists rinde_factor numeric;

comment on column public.insumos.rinde_insumo is
  'Si esta puesto, el insumo se compra pero no se stockea: cada compra entra a bodega como este otro insumo (Azucar -> Goma).';
comment on column public.insumos.rinde_factor is
  'Unidades del insumo destino que rinde una unidad del comprado (1 g de azucar -> 1,5 ml de goma).';

-- Las dos van juntas o ninguna; el factor es positivo; nadie rinde a si mismo.
alter table public.insumos drop constraint if exists insumos_rinde_chk;
alter table public.insumos add constraint insumos_rinde_chk check (
  (rinde_insumo is null and rinde_factor is null)
  or (rinde_insumo is not null and rinde_insumo <> nombre and rinde_factor > 0)
);

-- ─── 2. Compras: el stock va al insumo que rinde ─────────────────────────────
-- Mismo contrato que en 20260919 (insert suma, delete resta, update ajusta y
-- cubre el cambio de insumo). Lo unico nuevo: el destino del movimiento es
-- el insumo comprado o, si "rinde" otro, ese otro con la cantidad convertida.
create or replace function public.compras_stock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old        numeric := 0;
  v_old_nombre text;
  v_new        numeric := 0;
  v_new_nombre text;
begin
  -- Los activos fijos no son inventario. El left join contra (select 1)
  -- garantiza una fila aunque el insumo no exista en la tabla: en ese caso
  -- cae al nombre comprado con factor 1, como siempre.
  if tg_op in ('UPDATE', 'DELETE') and old.tipo is distinct from 'activo_fijo' then
    select coalesce(i.rinde_insumo, old.insumo_nombre),
           coalesce(old.cantidad, 0) * coalesce(i.rinde_factor, 1)
      into v_old_nombre, v_old
      from (select 1) x
      left join public.insumos i on i.nombre = old.insumo_nombre;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.tipo is distinct from 'activo_fijo' then
    select coalesce(i.rinde_insumo, new.insumo_nombre),
           coalesce(new.cantidad, 0) * coalesce(i.rinde_factor, 1)
      into v_new_nombre, v_new
      from (select 1) x
      left join public.insumos i on i.nombre = new.insumo_nombre;
  end if;

  -- Revertir lo viejo, aplicar lo nuevo.
  if v_old <> 0 then
    update public.insumos
       set stock_actual = coalesce(stock_actual, 0) - v_old
     where nombre = v_old_nombre;
  end if;
  if v_new <> 0 then
    update public.insumos
       set stock_actual = coalesce(stock_actual, 0) + v_new
     where nombre = v_new_nombre;
  end if;
  return null;
end
$$;

drop trigger if exists compras_stock_trg on public.compras;
create trigger compras_stock_trg
  after insert or update or delete on public.compras
  for each row execute function public.compras_stock();

-- ─── 3. Costo: el PPP del destino se deriva del comprado ─────────────────────
-- Corre cuando cambia el PPP de un insumo que rinde otro (o cuando se
-- configura el enlace). Actualizar Goma vuelve a disparar este trigger sobre
-- la fila de Goma, que no rinde nada: sale en el primer if, sin recursion.
create or replace function public.insumos_rinde_ppp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.rinde_insumo is null then
    return null;
  end if;
  update public.insumos
     set costo_ppp = coalesce(new.costo_ppp, 0) / new.rinde_factor
   where nombre = new.rinde_insumo
     and costo_ppp is distinct from coalesce(new.costo_ppp, 0) / new.rinde_factor;
  return null;
end
$$;

drop trigger if exists insumos_rinde_ppp_trg on public.insumos;
create trigger insumos_rinde_ppp_trg
  after insert or update of costo_ppp, rinde_insumo, rinde_factor on public.insumos
  for each row execute function public.insumos_rinde_ppp();

-- ─── 4. Datos: Azucar rinde Goma, y lo que hay en Azucar pasa a Goma ────────
do $$
declare
  v_unidad text;
  v_az     numeric;
  v_goma   numeric;
begin
  select unidad, coalesce(stock_actual, 0)
    into v_unidad, v_az
    from public.insumos where nombre = 'Azúcar';
  if not found then
    raise exception 'No existe el insumo "Azúcar" (con tilde): revisar el nombre antes de enlazar';
  end if;
  if not exists (select 1 from public.insumos where nombre = 'Goma') then
    raise exception 'No existe el insumo "Goma": crearlo antes de correr esta migracion';
  end if;
  -- El factor 1.5 asume azucar en gramos. Si esta en otra unidad, mejor
  -- parar aca que dejar un factor mal puesto en silencio.
  if v_unidad is distinct from 'g' then
    raise exception 'Azúcar esta en "%" y no en g: ajustar rinde_factor a mano (1 kg = 1500 ml)', v_unidad;
  end if;

  -- Dispara insumos_rinde_ppp_trg: Goma.costo_ppp = Azucar.costo_ppp / 1.5.
  update public.insumos
     set rinde_insumo = 'Goma', rinde_factor = 1.5
   where nombre = 'Azúcar';

  -- Traspaso unico del stock. Un Azucar negativo no es fisico (se fabrico
  -- goma de azucar que nunca se registro): queda en 0 sin tocar Goma.
  if v_az > 0 then
    update public.insumos
       set stock_actual = coalesce(stock_actual, 0) + v_az * 1.5
     where nombre = 'Goma';
    raise notice 'Azúcar: % g pasaron a Goma como % ml', v_az, v_az * 1.5;
  elsif v_az < 0 then
    raise notice 'Azúcar estaba en negativo (% g): queda en 0, Goma no se toca', v_az;
  end if;
  -- Sin minimo: un insumo que siempre esta en 0 no puede dar alertas.
  update public.insumos
     set stock_actual = 0, stock_minimo = null
   where nombre = 'Azúcar';

  select stock_actual into v_goma from public.insumos where nombre = 'Goma';
  raise notice 'Goma queda en % ml', v_goma;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificacion (SQL Editor):
--
-- a) El enlace y el PPP derivado (Goma.costo_ppp = Azúcar.costo_ppp / 1.5):
--   select nombre, unidad, stock_actual, stock_minimo, costo_ppp, rinde_insumo, rinde_factor
--     from insumos where nombre in ('Azúcar', 'Goma');
--
-- b) Triggers que deben quedar:
--      compras: compras_stock_trg, on_compra_recalcula_ppp
--      insumos: insumos_rinde_ppp_trg
--   select c.relname, t.tgname, p.proname
--     from pg_trigger t join pg_class c on c.oid = t.tgrelid
--     join pg_proc p on p.oid = t.tgfoid
--    where c.relname in ('compras', 'insumos') and not t.tgisinternal
--    order by 1, 2;
--
-- c) Prueba de humo (en una transaccion, no deja rastro):
--   begin;
--     select nombre, stock_actual, costo_ppp from insumos where nombre in ('Azúcar', 'Goma');
--     insert into compras (fecha, insumo_nombre, unidad, cantidad, precio_total, tipo, es_inversion)
--       values (current_date, 'Azúcar', 'g', 1000, 800, 'insumo', false);
--     -- Goma sube EXACTO 1500; Azúcar sigue en 0; Goma.costo_ppp = Azúcar.costo_ppp / 1.5
--     select nombre, stock_actual, costo_ppp from insumos where nombre in ('Azúcar', 'Goma');
--     delete from compras where insumo_nombre = 'Azúcar' and fecha = current_date and precio_total = 800;
--     select nombre, stock_actual from insumos where nombre in ('Azúcar', 'Goma');  -- Goma vuelve
--   rollback;
--
-- Rollback manual (vuelve al estado del 19-sep; el cliente viejo tenia el
-- boton de fabricar goma):
--   drop trigger if exists insumos_rinde_ppp_trg on public.insumos;
--   drop function if exists public.insumos_rinde_ppp();
--   update insumos set rinde_insumo = null, rinde_factor = null where nombre = 'Azúcar';
--   alter table insumos drop constraint if exists insumos_rinde_chk;
--   alter table insumos drop column if exists rinde_insumo, drop column if exists rinde_factor;
--   (y reponer compras_stock() con el cuerpo de 20260919_stock_atomico.sql;
--    el stock que paso a Goma se devuelve a mano si hace falta: ml / 1.5 = g)
-- ─────────────────────────────────────────────────────────────────────────────
