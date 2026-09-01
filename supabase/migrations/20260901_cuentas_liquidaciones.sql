-- Cuentas: liquidaciones agrupadas
--
-- Una liquidación con una contraparte (ej. Camilo) genera VARIOS abonos a la
-- vez: los cruces de por-cobrar contra por-pagar y el reparto del pago sobre
-- las deudas pendientes. `grupo_id` los amarra para poder mostrarlos como un
-- solo movimiento y deshacerlos completos si el monto se registró mal.
--
-- Idempotente: se puede correr de nuevo sin problema.

alter table public.abonos add column if not exists grupo_id text;

create index if not exists abonos_grupo_id_idx on public.abonos (grupo_id);

comment on column public.abonos.grupo_id is
  'Agrupa los abonos creados por una misma liquidación. NULL = abono suelto.';

-- Blindaje RLS (CLAUDE.md): estas tablas solo las toca el staff logueado.
alter table public.deudas enable row level security;
alter table public.abonos enable row level security;

drop policy if exists staff_authenticated_all on public.deudas;
create policy staff_authenticated_all on public.deudas
  for all to authenticated using (true) with check (true);

drop policy if exists staff_authenticated_all on public.abonos;
create policy staff_authenticated_all on public.abonos
  for all to authenticated using (true) with check (true);
