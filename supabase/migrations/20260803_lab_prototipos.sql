-- ─── Prototipos del LAB ──────────────────────────────────────────────────────
--
-- El LAB (lab.ncity.live) deja al cliente armar combinaciones que no están en
-- la carta. Al venderse la primera vez, esa combinación se materializa como
-- receta normal para que el descuento de stock, el costeo y los reportes
-- funcionen sin tocar `inventario.js`.
--
-- Se crean BAJO DEMANDA, no las 265 de golpe: solo las que alguien pidió de
-- verdad. Así el catálogo crece con la demanda real y no con el espacio de
-- combinaciones posibles.
--
-- La bandera permite que Catálogo, Ranking y el selector de recetas sigan
-- mostrando solo la carta oficial, y a la vez responder "¿qué prototipo se
-- repite lo suficiente como para ascenderlo a la carta?".
--
-- NOTA RLS: `recetas` ya existe y ya está blindada. Agregar una columna no
-- abre ningún hueco. La regla del CLAUDE.md aplica a tablas NUEVAS.

alter table public.recetas
  add column if not exists es_prototipo boolean not null default false;

-- Código del LAB que originó la receta (ej: RON-MOJ-MAR-1L+CZ).
-- Único: garantiza que dos pedidos del mismo prototipo reutilicen la receta
-- en vez de duplicarla. Null para las recetas de la carta.
alter table public.recetas
  add column if not exists lab_codigo text;

create unique index if not exists recetas_lab_codigo_uniq
  on public.recetas (lab_codigo)
  where lab_codigo is not null;

-- Para filtrar rápido en las vistas que muestran solo la carta oficial.
create index if not exists recetas_es_prototipo_idx
  on public.recetas (es_prototipo)
  where es_prototipo = true;

comment on column public.recetas.es_prototipo is
  'true = combinación armada en el LAB, creada al venderse. Ocultar de catálogo/ranking por defecto.';
comment on column public.recetas.lab_codigo is
  'Código del LAB que originó la receta (RON-MOJ-MAR-1L+CZ). Único cuando no es null.';
