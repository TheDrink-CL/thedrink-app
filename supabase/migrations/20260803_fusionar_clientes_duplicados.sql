-- Limpieza del maestro de clientes: fusionar duplicados y borrar fichas de prueba
--
-- Es el caso inverso al de 20260803_separar_clientes_fusionados.sql. Ahí dos
-- personas distintas compartían una ficha; acá una persona quedó con dos.
-- Criterio para afirmar que es la misma persona: mismo teléfono (últimos 8
-- dígitos) en sus pedidos.
--
-- La dirección de cada pedido vive en `ordenes.cliente_direccion`, así que
-- fusionar NO pierde el histórico de a dónde se despachó. La dirección de la
-- ficha es solo el valor por defecto del próximo pedido: se deja la más
-- reciente.
--
-- Ojo: `comandas.cliente_id` no tiene foreign key a `clientes`, así que borrar
-- una ficha no falla ni avisa — hay que repuntar las comandas a mano antes.
--
-- No crea tablas, así que no toca el blindaje de RLS.

begin;

-- ── Sara + Sara Huenupil ────────────────────────────────────────────────────
-- Mismo teléfono (+56920055608) Y misma dirección (Froilan Roa 1214).
-- Sobrevive "Sara Huenupil" por ser el nombre completo.
-- Se le pasa el origen "Instagram" de la ficha que se borra: es el canal real
-- por el que llegó (su primer pedido, el 32). "Cliente habitual" no es un
-- canal de adquisición. Si prefieres dejarlo como estaba, borra esta línea.
update public.clientes
   set origen = 'Instagram'
 where id = '646922c0-d103-4a29-8a07-108c6b5ee171';

update public.ordenes
   set cliente_id = '646922c0-d103-4a29-8a07-108c6b5ee171'
 where cliente_id = 'ce655274-545e-4b90-85b7-03dd12e6ee96';

update public.comandas
   set cliente_id = '646922c0-d103-4a29-8a07-108c6b5ee171'
 where cliente_id = 'ce655274-545e-4b90-85b7-03dd12e6ee96';

delete from public.clientes
 where id = 'ce655274-545e-4b90-85b7-03dd12e6ee96';

-- ── Valeria Ruiz × 2 ────────────────────────────────────────────────────────
-- Mismo teléfono (+56972394196), direcciones distintas: pidió a Portugal 520
-- (mayo) y a Curicó 88 (junio). Misma persona, distinto destino de despacho.
-- Sobrevive la ficha más antigua, que conserva el origen real "Instagram".
-- Se le actualiza la dirección a la más reciente (Curicó 88, orden 170) para
-- que sea la que pre-rellena el próximo pedido.
update public.clientes
   set direccion = 'Curicó 88, Santiago',
       distancia_km = 5.0
 where id = '153a1e0b-5529-4d4a-babd-fc5591b904f7';

update public.ordenes
   set cliente_id = '153a1e0b-5529-4d4a-babd-fc5591b904f7'
 where cliente_id = 'd29d8a88-ff60-4a06-a577-a91cdd7517bf';

update public.comandas
   set cliente_id = '153a1e0b-5529-4d4a-babd-fc5591b904f7'
 where cliente_id = 'd29d8a88-ff60-4a06-a577-a91cdd7517bf';

delete from public.clientes
 where id = 'd29d8a88-ff60-4a06-a577-a91cdd7517bf';

-- ── NO fusionar: Allison + Alinne ───────────────────────────────────────────
-- Comparten teléfono (...56600265) y dirección (Mencia de los nidos 1111),
-- pero son dos personas que viven juntas y piden desde el mismo WhatsApp.
-- Quedan como dos fichas a propósito. Ver la nota de la verificación al final.

-- ── Fichas de prueba ────────────────────────────────────────────────────────
-- "prueba" y "Prueba", creadas el 03-ago probando la pantalla de Importar.
-- Esa pantalla crea una comanda junto con la ficha, así que hay que borrar la
-- comanda primero o queda apuntando a un cliente que ya no existe (no hay
-- foreign key: no falla, simplemente queda huérfana).
delete from public.comandas
 where cliente_id in ('018f81ad-65b8-4765-9e3a-f9bcc1c7e516',
                      '9e03c40e-3559-4927-b18b-09dc983749b1');

-- El `not exists` es un seguro: si alguna de las dos resultara tener un pedido
-- de verdad, no se borra nada y te enteras porque sigue en la lista.
delete from public.clientes c
 where c.id in ('018f81ad-65b8-4765-9e3a-f9bcc1c7e516',
                '9e03c40e-3559-4927-b18b-09dc983749b1')
   and not exists (select 1 from public.ordenes o where o.cliente_id = c.id);

commit;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Teléfonos repartidos entre varias fichas. Debe devolver EXACTAMENTE 1 fila:
-- Allison | Alinne, que es el caso que se decidió no fusionar. Cualquier otra
-- fila es un duplicado nuevo que hay que revisar.
--
-- select right(regexp_replace(o.cliente_telefono, '\D', '', 'g'), 8) as tel,
--        count(distinct o.cliente_id) as fichas,
--        string_agg(distinct c.nombre, ' | ') as nombres
--   from public.ordenes o
--   join public.clientes c on c.id = o.cliente_id
--  where length(regexp_replace(coalesce(o.cliente_telefono, ''), '\D', '', 'g')) >= 8
--  group by 1
-- having count(distinct o.cliente_id) > 1;

-- Que las fichas de prueba ya no estén (debe devolver 0 filas):
--
-- select id, nombre from public.clientes where nombre ilike 'prueba';
