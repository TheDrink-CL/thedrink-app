-- Migración: umbral de crecimiento para veredicto del negocio
-- Fecha: 2026-05-22
-- Motivo: el widget "Salud del negocio" del Dashboard compara el ingreso/h
-- contra el costo oportunidad ponderado, y considera la TENDENCIA para
-- decidir si es "optimista" (crece) vs "estancado" (no crece). El umbral de
-- crecimiento mensual que separa esos dos casos vive aquí, configurable.

insert into public.config (clave, valor)
select v.clave, v.valor
from (values
  ('crecimiento_min_pct_mes', 0.05)  -- 5% mensual mínimo para considerar "creciendo"
) as v(clave, valor)
where not exists (
  select 1 from public.config c where c.clave = v.clave
);

-- Rollback:
-- delete from public.config where clave = 'crecimiento_min_pct_mes';
