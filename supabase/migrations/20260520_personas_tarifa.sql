-- Migración: tarifa $/h por persona (no solo por rol)
-- Fecha: 2026-05-20
-- Motivo: una sola tarifa por rol no refleja la realidad cuando hay
-- ayudantes que cobran distinto del operador principal. Ahora cada persona
-- puede tener su propia tarifa, y si está null se cae a la tarifa del rol.

alter table public.personas
  add column if not exists tarifa_hora numeric;

comment on column public.personas.tarifa_hora is
  'Tarifa $/h propia de esta persona. Si null, se usa la tarifa del rol del bloque como fallback.';

-- Rollback:
-- alter table public.personas drop column if exists tarifa_hora;
