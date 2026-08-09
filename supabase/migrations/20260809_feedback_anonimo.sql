-- ─────────────────────────────────────────────────────────────────────────────
-- FEEDBACK ANONIMO — la unica excepcion al blindaje del rol `anon`.
-- Fecha: 2026-08-09
--
-- QUE ES
-- Una pagina estatica publica (Paginas web/app pedidos/deploy/opinar/) escribe
-- aca. Es el primer y unico consumidor anonimo legitimo de la base.
--
-- POR QUE NO ROMPE EL INVARIANTE
-- `anon` no gana acceso a la base: gana una ranura. La tabla es un BUZON, no
-- una ventana:
--   · solo INSERT, nunca SELECT/UPDATE/DELETE — quien escribe no puede leer,
--     ni lo suyo ni lo ajeno;
--   · el INSERT esta acotado por GRANT a nivel de COLUMNA, asi que `anon` no
--     puede tocar `revisado`, `creado_en`, `id` ni `ip_bucket`;
--   · no hay FK ni referencia a `clientes`, `ventas` ni `comandas`: desde una
--     fila no se llega a ningun otro dato;
--   · largos con CHECK, para que nadie use la tabla como disco gratis;
--   · limite de envios por IP y por dia, en un trigger.
-- Si algun dia se agrega un segundo escritor anonimo, esta comparacion hay que
-- rehacerla. No es una puerta que quede abierta "para lo que venga".
--
-- ⚠ TRAMPA: `20260717_blindaje_rls.sql` borra TODAS las politicas de `public` y
-- deja solo `authenticated`. Es idempotente y esta bien que lo sea, pero si la
-- vuelves a correr **mata el formulario en silencio** (empieza a devolver 401 y
-- nadie se entera, porque nadie mira una pagina que ya funcionaba).
-- Regla: despues de correr el blindaje, corre SIEMPRE esta migracion de nuevo.
-- Las dos son idempotentes, el orden blindaje → feedback deja todo correcto.
--
-- ⚠ La consulta de verificacion de CLAUDE.md ("debe devolver 0 filas") ahora
-- devuelve 1: `buzon_anon_insert` sobre `public.feedback`. Esa fila es la
-- esperada. Cualquier OTRA es un hueco. Ya esta anotado en CLAUDE.md.
--
-- Es idempotente: se puede correr de nuevo sin romper nada ni perder datos.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. La tabla ─────────────────────────────────────────────────────────────

create table if not exists public.feedback (
  id          uuid        primary key default gen_random_uuid(),
  creado_en   timestamptz not null default now(),

  -- 3 = bien, 2 = asi nomas, 1 = mal. Es lo unico obligatorio: dos toques y
  -- listo. Todo lo demas es opcional a proposito — cada campo requerido que
  -- agregues aca se paga en respuestas que no llegan.
  puntaje     smallint    not null,

  -- Sobre que opina. Lista fija de ASPECTOS, no de productos: la carta cambia,
  -- estos cinco no. Poner los tragos aca crearia una cuarta copia de la carta
  -- escrita a mano (ver la deuda principal en ESTADO.md).
  aspecto     text,

  -- Texto libre, sin lista. Cero acoplamiento con `recetas`.
  trago       text,

  comentario  text,

  -- De donde vino: 'qr', 'carta', 'wsp'... Sirve para saber que canal trae
  -- respuestas antes de imprimir mas stickers.
  origen      text,

  -- Lado del staff. `anon` no puede escribirlo (no esta en el GRANT).
  revisado    boolean     not null default false,

  -- Solo para el limite por dia. No es la IP: ver `feedback_guard()`.
  ip_bucket   text,

  constraint feedback_puntaje_rango     check (puntaje between 1 and 3),
  constraint feedback_aspecto_valido    check (aspecto is null or aspecto in ('trago','envio','pedido','precio','otro')),
  constraint feedback_trago_largo       check (trago is null or char_length(trago) <= 60),
  constraint feedback_comentario_largo  check (comentario is null or char_length(comentario) <= 600),
  constraint feedback_origen_largo      check (origen is null or char_length(origen) <= 20)
);

create index if not exists feedback_creado_en_idx on public.feedback (creado_en desc);
create index if not exists feedback_pendientes_idx on public.feedback (creado_en desc) where not revisado;
create index if not exists feedback_ip_bucket_idx  on public.feedback (ip_bucket) where ip_bucket is not null;


-- ─── 2. Configuracion privada (sal del hash + limite) ────────────────────────
-- Tabla aparte porque `anon` no debe verla ni de casualidad. La lee unicamente
-- el trigger, que corre como definer.

create table if not exists public.feedback_config (
  id          int  primary key default 1,
  salt        text not null default (gen_random_uuid()::text || gen_random_uuid()::text),
  max_por_dia int  not null default 5,
  constraint feedback_config_fila_unica check (id = 1)
);

insert into public.feedback_config (id) values (1) on conflict (id) do nothing;


-- ─── 3. El guardia ───────────────────────────────────────────────────────────

create or replace function public.feedback_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip    text;
  v_salt  text;
  v_max   int;
  v_usado int;
begin
  select salt, max_por_dia into v_salt, v_max
    from public.feedback_config where id = 1;

  -- PostgREST expone las cabeceras de la request en este setting. El primer
  -- valor de x-forwarded-for es el cliente; el resto son proxies.
  v_ip := btrim(split_part(
    coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''),
    ',', 1));
  if v_ip = '' then v_ip := 'sin-ip'; end if;

  -- Hash con sal secreta + FECHA. Sirve para contar, no para identificar:
  -- cambia todos los dias, asi que dos visitas en dias distintos no se pueden
  -- cruzar ni sabiendo la sal. Es deliberado — el canal se vende como anonimo
  -- y tiene que serlo tambien puertas adentro.
  new.ip_bucket := left(encode(sha256((v_salt || v_ip || current_date::text)::bytea), 'hex'), 16);

  select count(*) into v_usado
    from public.feedback
   where ip_bucket = new.ip_bucket
     and creado_en > now() - interval '24 hours';

  if v_usado >= v_max then
    raise exception 'limite diario de envios alcanzado' using errcode = '54000';
  end if;

  -- Lo que no toca el formulario se fija aca. No se confia en el cliente ni
  -- aunque el GRANT ya se lo impida: dos cerrojos, no uno.
  new.revisado  := false;
  new.creado_en := now();

  -- Autolimpieza sin cron: a los 2 dias el bucket deja de existir y la fila
  -- queda anonima del todo, incluso para el limite.
  update public.feedback
     set ip_bucket = null
   where ip_bucket is not null
     and creado_en < now() - interval '2 days';

  return new;
end $$;

drop trigger if exists feedback_guard_trg on public.feedback;
create trigger feedback_guard_trg
  before insert on public.feedback
  for each row execute function public.feedback_guard();


-- ─── 4. Permisos: cerrar todo, despues abrir la ranura ───────────────────────

alter table public.feedback        enable row level security;
alter table public.feedback_config enable row level security;

revoke all on public.feedback        from anon, public;
revoke all on public.feedback_config from anon, public;

grant usage on schema public to anon;

-- El corazon del asunto: INSERT y solo sobre estas cinco columnas.
grant insert (puntaje, aspecto, trago, comentario, origen)
  on public.feedback to anon;

drop policy if exists staff_authenticated_all on public.feedback;
create policy staff_authenticated_all on public.feedback
  for all to authenticated using (true) with check (true);

drop policy if exists staff_authenticated_all on public.feedback_config;
create policy staff_authenticated_all on public.feedback_config
  for all to authenticated using (true) with check (true);

-- Sin `using`, porque no existe lectura. Solo `with check`.
drop policy if exists buzon_anon_insert on public.feedback;
create policy buzon_anon_insert on public.feedback
  for insert to anon
  with check (puntaje between 1 and 3);


-- ─── Verificacion ────────────────────────────────────────────────────────────
-- 1) La unica politica anon de toda la base debe ser esta:
--
--   select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname = 'public' and (roles @> '{anon}' or roles @> '{public}');
--   -- esperado: 1 fila -> feedback / buzon_anon_insert / INSERT / {anon}
--
-- 2) Prueba del atacante — LEER debe fallar (espera [] o error de permiso):
--
--   curl "https://wcuxjxaquiypzinxakxu.supabase.co/rest/v1/feedback?select=*" \
--     -H "apikey: sb_publishable_UzDdk9WWxGhA8IysMVNz_w_FIz_k1wI"
--
-- 3) Prueba del atacante — ESCRIBIR de mas debe fallar (columna sin GRANT):
--
--   curl -X POST "https://wcuxjxaquiypzinxakxu.supabase.co/rest/v1/feedback" \
--     -H "apikey: sb_publishable_UzDdk9WWxGhA8IysMVNz_w_FIz_k1wI" \
--     -H "Authorization: Bearer sb_publishable_UzDdk9WWxGhA8IysMVNz_w_FIz_k1wI" \
--     -H "Content-Type: application/json" -H "Prefer: return=minimal" \
--     -d '{"puntaje":3,"revisado":true}'
--   -- esperado: 401/403 por `revisado`
--
-- 4) Un envio legitimo debe devolver 201 sin cuerpo:
--
--   ...mismo curl con -d '{"puntaje":1,"aspecto":"envio","comentario":"prueba"}'
--
-- 5) Leer lo que llego (como staff, desde el SQL Editor):
--
--   select creado_en, puntaje, aspecto, trago, comentario, origen
--   from public.feedback where not revisado order by creado_en desc;
