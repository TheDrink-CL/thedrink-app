-- Salidas sin venta: varios productos por salida
--
-- Un canje suele ser "5 litros, de tres tragos distintos" y una prueba de
-- contenido gasta dos o tres recetas. Registrarlas de a una era lento y las
-- desparramaba en el historial.
--
-- Cada linea sigue siendo una fila (asi el P&L, Conteo y Stock no cambian:
-- siguen sumando filas con su propio costo_valorizado). `grupo_id` amarra las
-- lineas cargadas juntas para mostrarlas como UNA salida y borrarlas
-- completas. Mismo patron que `abonos.grupo_id` (20260901). NULL = salida
-- suelta de una sola linea (las registradas antes de esta migracion).
--
-- Idempotente: se puede correr de nuevo sin problema.

alter table public.salidas_stock add column if not exists grupo_id text;

create index if not exists idx_salidas_stock_grupo on public.salidas_stock (grupo_id);

comment on column public.salidas_stock.grupo_id is
  'Agrupa las lineas registradas en una misma salida (un canje de varios tragos). NULL = linea suelta.';

-- La tabla ya esta blindada (20260914). Agregar una columna no abre nada.
