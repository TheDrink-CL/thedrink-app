-- Concurso NEON: descuento 15% por código de único uso.
-- Regla central: 1 teléfono = 1 código. Un mismo teléfono no puede canjear
-- más de un NEON, sin importar el código. Esto lo enforce el UNIQUE de abajo
-- a nivel de motor (no depende del JS del navegador ni de la planilla).
--
-- El código en sí se valida por FÓRMULA en la app (NEON-DDMM-XXX + checksum),
-- igual que el validador.html. Esta tabla NO lista los códigos válidos:
-- solo registra los CANJES que ya ocurrieron, para impedir reúso por teléfono.

create table if not exists public.canjes_neon (
  id           bigint generated always as identity primary key,
  codigo       text not null,                 -- código canjeado, ej: NEON-1306-X4P
  telefono     text not null,                 -- teléfono del cliente (normalizado)
  cliente_nombre text,                         -- referencia humana, opcional
  orden_id     bigint references public.ordenes(id) on delete set null,
  monto_descuento numeric default 0,           -- $ que se descontó (para reporte)
  fecha_canje  timestamptz not null default now()
);

-- 1 teléfono = 1 canje. Si se intenta un segundo canje con el mismo teléfono,
-- el insert falla con violación de unicidad y la app lo rechaza.
create unique index if not exists canjes_neon_telefono_uniq
  on public.canjes_neon (telefono);

-- Evita además que el MISMO código se registre dos veces (por dos teléfonos
-- distintos). Si querés permitir que un código se comparta con un amigo y cada
-- uno canjee una vez, borrá este índice. Por defecto: 1 código = 1 canje.
create unique index if not exists canjes_neon_codigo_uniq
  on public.canjes_neon (codigo);

alter table public.canjes_neon enable row level security;

drop policy if exists "canjes_neon_full_access" on public.canjes_neon;
create policy "canjes_neon_full_access"
  on public.canjes_neon for all
  using (true) with check (true);
