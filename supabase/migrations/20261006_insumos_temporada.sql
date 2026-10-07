-- ─── Insumos de temporada ────────────────────────────────────────────────────
-- 2026-10-06. Pipeño y helado de piña solo se usan en septiembre (terremotos):
-- el resto del año ensucian Stock, Conteo, Salidas y las alertas (el pipeño
-- aparecía "crítico" con −842 ml). No se borran: vuelven el próximo año.
--
-- `activo = false` los esconde de Stock (quedan en «Fuera de temporada», desde
-- donde se reactivan), Conteo, Salidas y alertas, y saca del selector de
-- Ventas las recetas que los usan. Registrar una compra de uno lo reactiva.
--
-- La app tolera que la columna no exista (trata todo como activo), así que el
-- orden deploy/migración da igual. Idempotente.
--
-- RLS: no cambia nada, `insumos` ya está cerrada a `authenticated`.

alter table public.insumos
  add column if not exists activo boolean not null default true;

comment on column public.insumos.activo is
  'false = fuera de temporada: oculto en Stock/Conteo/Salidas/alertas y sus recetas fuera del selector de Ventas. Se reactiva desde Stock o al registrar una compra.';

-- Los dos de septiembre. Revisar en Stock → «Fuera de temporada» que hayan
-- quedado los correctos.
update public.insumos
   set activo = false
 where nombre ilike 'pipe%o'
    or nombre ilike 'helado%pi%a%';

-- Verificación: deben salir solo los de temporada.
-- select nombre, stock_actual, activo from public.insumos where activo = false;
