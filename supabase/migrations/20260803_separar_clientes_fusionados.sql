-- Separar clientes que quedaron fusionados en una sola ficha
--
-- Causa: al guardar un pedido, la app buscaba la ficha del maestro SOLO por
-- nombre. Si llegaba una persona nueva con un nombre ya existente, sus pedidos
-- se colgaban de la ficha vieja y las dos quedaban como un solo cliente.
-- El código ya está corregido (Ventas.js resuelve por ficha elegida → teléfono
-- → nombre con teléfono compatible); esto arregla los datos que ya se guardaron.
--
-- Casos detectados (un cliente_id con teléfonos distintos entre sus órdenes):
--   · Catalina   d9123673 → ...99932670 (Rosa Eguiguren) vs ...62619592 (Yungay)
--   · José Luis  33e61059 → ...62670704 (Abdón Cifuentes) vs ...64677961
--
-- No crea tablas, así que no toca el blindaje de RLS.

begin;

-- ── Catalina (Yungay 2910) — pedidos 189, 225, 238 ──────────────────────────
with nueva as (
  insert into public.clientes (nombre, telefono, direccion, origen)
  values ('Catalina (Yungay)', '+56962619592', 'Yungay 2910, Santiago', 'IG Pauta')
  returning id
)
update public.ordenes o
   set cliente_id = nueva.id
  from nueva
 where o.id in (189, 225, 238);

-- ── José Luis (segundo teléfono) — pedido 215 ───────────────────────────────
with nuevo as (
  insert into public.clientes (nombre, telefono, origen)
  values ('José Luis (+56 9 6467 7961)', '+56 9 6467 7961', 'IG Pauta')
  returning id
)
update public.ordenes o
   set cliente_id = nuevo.id
  from nuevo
 where o.id = 215;

commit;

-- Verificación: debe devolver 0 filas (ninguna ficha con teléfonos en conflicto)
--
-- select o.cliente_id, c.nombre,
--        count(distinct right(regexp_replace(o.cliente_telefono, '\D', '', 'g'), 8)) as tels
--   from public.ordenes o
--   join public.clientes c on c.id = o.cliente_id
--  where coalesce(o.cliente_telefono, '') <> ''
--  group by o.cliente_id, c.nombre
-- having count(distinct right(regexp_replace(o.cliente_telefono, '\D', '', 'g'), 8)) > 1;
