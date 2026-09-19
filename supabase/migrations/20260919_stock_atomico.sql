-- Migracion: stock atomico, y UN solo dueño por cada movimiento de bodega
-- Fecha: 2026-09-19
--
-- MOTIVO (conteo del 19-sep: teorico $1.229.022 vs real $95.020)
-- La base tenia triggers creados desde el dashboard que nunca estuvieron en el
-- repo, y el cliente hacia lo mismo por su lado sin saberlo:
--
--   trigger_stock_compra  (compras, insert)  stock += cantidad
--     El cliente (ajustarStockPorCompra, 29-jun) tambien sumaba. Cada compra
--     entraba DOS veces a bodega. Se ve limpio en los insumos nuevos: Tequila,
--     Triple Sec, Pipeño, Helado de piña y Azucar quedaron EXACTO en
--     2 x compras - ventas. Es la causa principal del inventario inflado.
--
--   trigger_stock_venta   (ventas, insert)   -1 "Frascos de vidrio" (insumo que
--     ya no existe: no hace nada), -2 Bombillas y -1 Stickers por litro.
--     Nunca los devuelve al borrar/editar un pedido, y a las recetas que ya los
--     listan (Mojito Arandano) se los cobra dos veces. Por eso Bombillas esta
--     en negativo.
--
--   trigger_bolsa_orden   (ordenes, insert)  -1 Bolsas plasticas por pedido.
--     Funciona, pero no devuelve la bolsa si se borra el pedido.
--
--   on_compra_recalcula_ppp (compras, insert/update/delete) recalcula
--     costo_ppp. Correcto y completo. NO SE TOCA.
--
-- Ademas, mover stock desde el cliente era "leer -> sumar en JS -> escribir":
-- dos dispositivos (caja y TV) guardando a la vez se pisaban, y el descuento
-- se cortaba en 0 mientras el reintegro devolvia el monto completo (cada
-- editar/borrar un pedido con un insumo en 0 creaba stock fantasma).
--
-- QUIEN MUEVE QUE, desde esta migracion:
--   - Ventas, comandas->venta, salidas sin venta: SOLO el cliente
--     (src/lib/inventario.js), via el RPC ajustar_stock. El cliente ya maneja
--     merma configurable, aplica_merma, envase devuelto, frasco por formato y
--     ahora la regla global de sticker + 2 bombillas por unidad. El trigger de
--     ventas se va.
--   - Compras: SOLO la base (compras_stock_trg: insert suma, delete resta,
--     update ajusta la diferencia y el cambio de insumo). El cliente deja de
--     sumar.
--   - Bolsas: sigue en la base, ahora tambien devuelve al borrar el pedido.
--   - Conteo y edicion manual en Stock: pisan el valor, a proposito.
--
-- ORDEN SEGURO: correr esta migracion ANTES de hacer push del codigo. El
-- cliente nuevo ya no suma stock por compras. Para ventas/salidas da igual:
-- el cliente detecta si ajustar_stock no existe y usa el camino viejo.
--
-- Idempotente: se puede correr de nuevo sin problema.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. RPC ajustar_stock ────────────────────────────────────────────────────
-- movs = {"Ron Bacardí": -162, "Frascos 1lt": -1, "Goma": 90}
-- Un solo UPDATE: la suma la hace la base, no el navegador. No se corta en 0:
-- un stock negativo es informacion ("se vendio mas de lo que la app sabia que
-- habia" = falta registrar una compra o el conteo estaba mal), no un error
-- que esconder. Devuelve (nombre, stock_actual) de cada insumo que SI existia:
-- el cliente compara con lo que mando y detecta nombres que no calzan.
-- security invoker: corre como el usuario logueado, RLS sigue mandando.
create or replace function public.ajustar_stock(movs jsonb)
returns table (nombre text, stock_actual numeric)
language sql
security invoker
set search_path = public
as $$
  update public.insumos i
     set stock_actual = coalesce(i.stock_actual, 0) + m.delta
    from (
      select key as nombre, value::numeric as delta
      from jsonb_each_text(movs)
    ) m
   where i.nombre = m.nombre
  returning i.nombre::text, i.stock_actual::numeric;
$$;

comment on function public.ajustar_stock(jsonb) is
  'Aplica deltas de stock en un solo update atomico. {"insumo": delta, ...}. Negativo = descuenta. No se corta en 0 a proposito.';

-- Blindaje (CLAUDE.md): nada para anon. Solo staff logueado.
revoke all on function public.ajustar_stock(jsonb) from public, anon;
grant execute on function public.ajustar_stock(jsonb) to authenticated;

-- ─── 2. Compras: la base es el unico dueño del stock ─────────────────────────
create or replace function public.compras_stock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old numeric := 0;
  v_new numeric := 0;
begin
  -- Los activos fijos no son inventario.
  if tg_op in ('UPDATE', 'DELETE') and old.tipo is distinct from 'activo_fijo' then
    v_old := coalesce(old.cantidad, 0);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.tipo is distinct from 'activo_fijo' then
    v_new := coalesce(new.cantidad, 0);
  end if;

  -- Revertir lo viejo, aplicar lo nuevo (cubre el cambio de insumo al editar).
  if v_old <> 0 then
    update public.insumos
       set stock_actual = coalesce(stock_actual, 0) - v_old
     where nombre = old.insumo_nombre;
  end if;
  if v_new <> 0 then
    update public.insumos
       set stock_actual = coalesce(stock_actual, 0) + v_new
     where nombre = new.insumo_nombre;
  end if;
  return null;
end
$$;

-- El trigger historico solo sumaba en insert; el cliente hacia el resto y
-- ademas volvia a sumar en insert.
drop trigger if exists trigger_stock_compra on public.compras;
drop function if exists public.actualizar_stock_compra();

drop trigger if exists compras_stock_trg on public.compras;
create trigger compras_stock_trg
  after insert or update or delete on public.compras
  for each row execute function public.compras_stock();

-- El PPP sigue en manos de on_compra_recalcula_ppp -> trigger_recalcular_ppp()
-- (insert/update/delete; promedio ponderado de todas las compras del insumo).
-- Se deja EXACTAMENTE como esta; queda copiado aca solo para que el repo lo
-- conozca. Cuerpo verbatim del dump del 19-sep.
create or replace function public.trigger_recalcular_ppp()
returns trigger
language plpgsql
as $function$ DECLARE nombres text[]; BEGIN IF TG_OP = 'INSERT' THEN nombres := ARRAY[NEW.insumo_nombre]; ELSIF TG_OP = 'DELETE' THEN nombres := ARRAY[OLD.insumo_nombre]; ELSE nombres := ARRAY[NEW.insumo_nombre, OLD.insumo_nombre]; END IF; UPDATE insumos i SET costo_ppp = COALESCE((SELECT SUM(c.precio_total)/NULLIF(SUM(c.cantidad),0) FROM compras c WHERE c.insumo_nombre = i.nombre AND c.tipo <> 'activo_fijo' AND c.cantidad > 0), 0) WHERE i.nombre = ANY(nombres); RETURN NULL; END; $function$;

drop trigger if exists on_compra_recalcula_ppp on public.compras;
create trigger on_compra_recalcula_ppp
  after insert or delete or update on public.compras
  for each row execute function public.trigger_recalcular_ppp();

-- ─── 3. Ventas: el stock lo mueve SOLO el cliente ────────────────────────────
-- Sticker + 2 bombillas por unidad pasan a src/lib/inventario.js
-- (EMPAQUE_POR_UNIDAD), donde si se devuelven al editar/borrar y no se doblan
-- con las recetas que ya los listan.
drop trigger if exists trigger_stock_venta on public.ventas;
drop function if exists public.descontar_stock_venta();

-- ─── 4. Bolsas: una por pedido, y vuelve si el pedido se borra ───────────────
create or replace function public.descontar_bolsa_orden()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.insumos
     set stock_actual = coalesce(stock_actual, 0) + (case when tg_op = 'DELETE' then 1 else -1 end)
   where nombre = 'Bolsas plásticas';
  return null;
end
$$;

drop trigger if exists trigger_bolsa_orden on public.ordenes;
create trigger trigger_bolsa_orden
  after insert or delete on public.ordenes
  for each row execute function public.descontar_bolsa_orden();

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificacion (SQL Editor):
--
-- a) Triggers que deben quedar (y ninguno mas que toque stock):
--      compras: compras_stock_trg, on_compra_recalcula_ppp
--      ordenes: trigger_bolsa_orden
--      ventas:  (ninguno)
--   select c.relname, t.tgname, p.proname
--     from pg_trigger t join pg_class c on c.oid = t.tgrelid
--     join pg_proc p on p.oid = t.tgfoid
--    where c.relname in ('compras', 'ventas', 'ordenes') and not t.tgisinternal
--    order by 1, 2;
--
-- b) Prueba de humo (en una transaccion, no deja rastro):
--   begin;
--     select stock_actual from insumos where nombre = 'Azúcar';
--     insert into compras (fecha, insumo_nombre, unidad, cantidad, precio_total, tipo, es_inversion)
--       values (current_date, 'Azúcar', 'g', 1000, 800, 'insumo', false);
--     select stock_actual from insumos where nombre = 'Azúcar';   -- sube EXACTO 1000
--     select * from ajustar_stock('{"Azúcar": -1000}');            -- vuelve al inicio
--   rollback;
--
-- c) anon no puede llamar al RPC (debe dar error de permiso):
--   set role anon; select * from ajustar_stock('{"Azúcar": 1}'); reset role;
--
-- Rollback manual (vuelve al estado del 19-sep, con el doble conteo):
--   drop trigger if exists compras_stock_trg on public.compras;
--   drop function if exists public.compras_stock();
--   drop function if exists public.ajustar_stock(jsonb);
--   create function public.actualizar_stock_compra() returns trigger language plpgsql as $$
--     begin update insumos set stock_actual = coalesce(stock_actual,0) + new.cantidad
--           where nombre = new.insumo_nombre; return new; end $$;
--   create trigger trigger_stock_compra after insert on public.compras
--     for each row execute function public.actualizar_stock_compra();
--   (y reponer descontar_stock_venta / trigger_stock_venta desde el dump)
-- ─────────────────────────────────────────────────────────────────────────────
