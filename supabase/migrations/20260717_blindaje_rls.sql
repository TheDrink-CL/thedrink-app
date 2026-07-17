-- ─────────────────────────────────────────────────────────────────────────────
-- BLINDAJE RLS — cierra el acceso anonimo a TODA la base publica.
-- Fecha: 2026-07-17
--
-- PROBLEMA QUE RESUELVE
-- La app corre 100% en el navegador con la key "publishable" (rol anon), que es
-- publica por diseno y viaja en el bundle. Hasta ahora cada tabla tenia
-- politicas using(true) / with check(true): cualquier persona con esa key (o
-- sea, cualquiera que abriera el sitio) podia LEER y ESCRIBIR toda la base —
-- ventas, caja, finanzas, telefonos de clientes, todo — pegandole directo a la
-- API REST de Supabase, sin pasar por la app.
--
-- QUE HACE ESTA MIGRACION
-- Deja RLS activo en todas las tablas de `public`, borra las politicas abiertas
-- y crea una unica politica por tabla que solo permite el rol `authenticated`
-- (staff logueado via Supabase Auth). El rol anon queda sin ningun permiso.
--
-- REQUISITOS ANTES DE CORRERLA (ver runbook BLINDAJE-pasos.md)
--   1. Existe el usuario compartido en Supabase Auth (para poder loguearse).
--   2. La app ya fue desplegada con la pantalla de login (AuthLock).
--   3. api/insights.js ya usa la SERVICE_ROLE key (bypassa RLS; sigue andando).
-- Si corres esto antes de esos pasos, la app queda sin acceso hasta completarlos.
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  -- 1) Activar RLS en cada tabla de public
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;

  -- 2) Borrar TODAS las politicas existentes en public (incluidas las using(true))
  for r in
    select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I;', r.policyname, r.tablename);
  end loop;

  -- 3) Crear una politica por tabla: acceso total SOLO al rol authenticated.
  --    Es un app de un solo inquilino (el bar): cualquier usuario logueado puede
  --    operar. anon => denegado. service_role => bypassa RLS (insights sigue ok).
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      'staff_authenticated_all', r.tablename
    );
  end loop;
end $$;

-- ─── Verificacion (correr aparte para confirmar que no quedo nada abierto) ───
-- Debe devolver 0 filas: ninguna tabla con politica para anon/public.
--
--   select schemaname, tablename, policyname, roles
--   from pg_policies
--   where schemaname = 'public'
--     and (roles @> '{anon}' or roles @> '{public}');
--
-- Y esta debe listar todas tus tablas con rowsecurity = true:
--
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
