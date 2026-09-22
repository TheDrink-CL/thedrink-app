-- Migracion: el PPP de un insumo derivado (Goma) no lo pisa nadie
-- Fecha: 2026-09-22
--
-- MOTIVO
-- 20260921 deriva Goma.costo_ppp = Azucar.costo_ppp / 1.5 con un trigger que
-- corre cuando cambia el PPP del azucar. Pero Goma SI tiene compras propias
-- viejas (ids 3 y 32: 2300 ml a $2000 c/u). Editar o borrar una de ellas
-- dispara on_compra_recalcula_ppp, que recalcula Goma con esas compras
-- (0,87 $/ml en vez de 0,54): +60% de costo en cada trago con goma, hasta la
-- proxima compra de azucar.
--
-- COMO
-- Un trigger BEFORE UPDATE en insumos: si la fila es destino de un "rinde"
-- (algun insumo tiene rinde_insumo = este nombre), su costo_ppp se fuerza al
-- derivado, venga de donde venga el update. No depende de como este escrito
-- on_compra_recalcula_ppp (que no vive en este repo).
--
-- No hay recursion: insumos_rinde_ppp() actualiza Goma con el valor derivado,
-- este trigger lo deja igual; la fila de Goma no rinde nada, asi que
-- insumos_rinde_ppp sale en su primer if.
--
-- Idempotente.

create or replace function public.insumos_ppp_derivado()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ppp numeric;
begin
  select s.costo_ppp / s.rinde_factor
    into v_ppp
    from public.insumos s
   where s.rinde_insumo = new.nombre
   limit 1;
  if found and v_ppp is not null then
    new.costo_ppp := v_ppp;
  end if;
  return new;
end
$$;

drop trigger if exists insumos_ppp_derivado_trg on public.insumos;
create trigger insumos_ppp_derivado_trg
  before update of costo_ppp on public.insumos
  for each row execute function public.insumos_ppp_derivado();

-- Reponer el derivado por si ya se piso (dispara el trigger de arriba).
update public.insumos g
   set costo_ppp = s.costo_ppp / s.rinde_factor
  from public.insumos s
 where s.rinde_insumo = g.nombre;

-- Verificacion:
--   select nombre, costo_ppp, rinde_insumo, rinde_factor
--     from insumos where nombre in ('Azúcar', 'Goma');
--   -- Goma.costo_ppp debe ser Azúcar.costo_ppp / 1.5
--
-- Prueba de humo (no deja rastro):
--   begin;
--     update insumos set costo_ppp = 999 where nombre = 'Goma';
--     select costo_ppp from insumos where nombre = 'Goma';  -- sigue el derivado, no 999
--   rollback;
--
-- Rollback:
--   drop trigger if exists insumos_ppp_derivado_trg on public.insumos;
--   drop function if exists public.insumos_ppp_derivado();
