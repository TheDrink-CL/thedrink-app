# CLAUDE.md — reglas del proyecto (leer antes de trabajar)

App interna de The Drink: React (create-react-app) desplegada en Vercel, datos en
Supabase. Corre 100% en el navegador; el único backend propio es la función
serverless `api/insights.js`.

---

## 🔒 SEGURIDAD — regla no negociable: RLS en TODA tabla

**Toda tabla de `public` DEBE tener Row Level Security activo y una política que
solo permita el rol `authenticated`. El rol `anon` no puede tocar nada.**

Por qué: la app usa la key *publishable* de Supabase, que es pública y viaja en
el bundle del navegador. Cualquiera la extrae. Lo único que protege los datos es
RLS. Una tabla sin RLS (o con una política `using(true)` para `anon`/`public`)
queda **totalmente abierta a internet**: cualquiera lee y escribe ventas, caja,
finanzas y teléfonos de clientes pegándole directo a la REST API.

### ⚠️ Trampa principal: las tablas NUEVAS nacen desprotegidas

Cada vez que crees una tabla (en una migración o en el dashboard), Supabase la
deja **sin la política correcta**. Si no la blindas, abriste un hueco. Por eso:

**Después de crear CUALQUIER tabla nueva, agrega esto a la misma migración:**

```sql
alter table public.NUEVA_TABLA enable row level security;

create policy staff_authenticated_all on public.NUEVA_TABLA
  for all to authenticated using (true) with check (true);
```

O, más simple y a prueba de olvidos: **vuelve a correr la migración de blindaje**
`supabase/migrations/20260717_blindaje_rls.sql`. Es dinámica: recorre todas las
tablas de `public` y las cierra. Correrla de nuevo es seguro (idempotente).

### Verificar que no quedó nada abierto

Correr en el SQL Editor. **Debe devolver exactamente 1 fila** — la excepción
documentada abajo (`feedback` / `buzon_anon_insert` / INSERT). Cualquier otra
fila es un hueco:

```sql
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and (roles @> '{anon}' or roles @> '{public}');
```

Y esta debe mostrar `rowsecurity = true` en TODAS las tablas:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```

### Prueba del atacante (simula acceso anónimo)

```bash
curl "https://wcuxjxaquiypzinxakxu.supabase.co/rest/v1/CUALQUIER_TABLA?select=*&limit=1" \
  -H "apikey: sb_publishable_UzDdk9WWxGhA8IysMVNz_w_FIz_k1wI"
```

Debe devolver `[]` o error de permiso. Si devuelve filas, esa tabla está abierta.

---

## Otras reglas de seguridad

- **`service_role` key: NUNCA en el frontend ni en el repo.** Solo vive como env
  var en Vercel (`SUPABASE_SERVICE_ROLE_KEY`), usada por `api/insights.js`, que
  corre en el servidor. Bypassa RLS a propósito; por eso jamás debe llegar al
  navegador.
- **La key `publishable` sí puede estar en el código.** Es pública por diseño;
  con RLS cerrado, sola no sirve para nada. No hace falta rotarla.
- **No introducir accesos anónimos.** La carta pública (`Páginas web/Carta`) y
  el LAB son HTML estático y no tocan Supabase. Si algo "necesita" **leer** sin
  login, es un error de diseño. Sin excepciones: no hay ni un solo SELECT
  anónimo en toda la base.
- **Registro público de usuarios: debe seguir DESACTIVADO** en Supabase Auth. Si
  se reabre, cualquiera se registra como `authenticated` y saltea todo el
  blindaje.

## La única excepción anónima: `public.feedback`

Migración: `supabase/migrations/20260809_feedback_anonimo.sql`.
Escritor: `Páginas web/app pedidos/deploy/opinar/` → `opinar.ncity.live`.

`anon` no tiene acceso a la base; tiene **una ranura**. La tabla es un buzón,
no una ventana: solo `INSERT`, jamás `SELECT` (quien escribe no puede leer ni lo
suyo), `GRANT` acotado **a nivel de columna** (`revisado`, `creado_en`, `id` e
`ip_bucket` quedan fuera del alcance del cliente), sin FK a `clientes`,
`ventas` ni `comandas`, largos con `CHECK` y tope de 5 envíos por IP y por día
en un trigger.

⚠ **Correr el blindaje mata el formulario en silencio.**
`20260717_blindaje_rls.sql` borra todas las políticas de `public` y deja solo
`authenticated`; la página empieza a devolver 401 y nadie se entera, porque
nadie mira una página que ya funcionaba. **Después del blindaje, correr siempre
la migración de feedback de nuevo.** Las dos son idempotentes y el orden
blindaje → feedback deja todo correcto.

Si aparece un segundo escritor anónimo, esta excepción hay que rediscutirla
entera. No es una puerta que quede abierta "para lo que venga".

## Modelo de auth

- Login real vía Supabase Auth con **cuenta compartida** (`contacto.thedrink@
  gmail.com`). La clave la escribe el staff; no va en el código.
- El gate está en `src/App.js` (`AuthLock`): sin sesión válida no se renderiza
  nada, en todas las rutas.
- Cuenta compartida = sin trazabilidad por persona. Si algún día se quiere saber
  quién hizo cada acción, se migra a cuenta-por-persona: mismos policies
  (`to authenticated`), solo más usuarios. No cambia el blindaje.
- El PIN viejo (`PinLock`, `DeliveryLogin`) quedó obsoleto: era client-side y no
  protegía la base. No reactivarlo como si fuera seguridad real.

## Integración con el LAB (lab.ncity.live)

El LAB es un constructor de tragos que el cliente usa desde la web y manda el
pedido por WhatsApp con un código por trago (`RON-MOJ-MAR-1L+CZ`). Esta app lo
decodifica en `ImportarPedido` y materializa los prototipos como recetas.

- `src/lib/labCodigos.js` — decodificador puro, sin base de datos.
- `src/lib/labPrototipos.js` — crea la receta del prototipo bajo demanda.

**La gramática del código vive en dos lugares**: acá y en el HTML del LAB
(`Páginas web/app pedidos/deploy/v1/index.html`). Si cambias una, cambia la
otra en el mismo movimiento o los pedidos se rechazan en silencio.

## Referencias

- `BLINDAJE-pasos.md` — runbook de despliegue del blindaje (orden seguro).
- `supabase/migrations/20260717_blindaje_rls.sql` — cierre de RLS, reutilizable.
- `Páginas web/app pedidos/ESTADO.md` — estado completo del LAB: qué está
  hecho, qué falta, deudas conocidas y trampas aprendidas. **Empezar por ahí**
  si el trabajo toca el LAB o la integración.
