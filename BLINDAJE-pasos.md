# Blindaje de datos — pasos de despliegue

Cierra el acceso anónimo a la base. Hoy cualquiera con la URL del sitio puede
leer y escribir toda la base (ventas, caja, finanzas, teléfonos de clientes)
pegándole directo a Supabase con la key que viaja en el bundle. Esto lo cierra:
a partir del final, **solo alguien logueado con la cuenta del bar** puede tocar
los datos.

Ya dejé listo en el código: la pantalla de login (`AuthLock`), el candado en
`App.js`, `api/insights.js` migrado a service_role, y la migración
`supabase/migrations/20260717_blindaje_rls.sql`. Falta lo que solo puedes hacer
tú, **en este orden** (si cambias el orden te quedas sin acceso a la app hasta
completarlo).

---

## 1. Cuenta compartida en Supabase Auth (ya existe)

Ya tienes el usuario `contacto.thedrink@gmail.com` (provider Email, creado el
03-may). Ese es el que usa el código (`STAFF_EMAIL` en
`src/pages/AuthLock.js`). No hay que crear nada nuevo.

Lo único que debes confirmar:

- **Que sepas la contraseña de esa cuenta.** Es la credencial real que
  escribirá el staff. Si no la recuerdas: Supabase → Authentication → Users →
  esa fila → **Reset password / Send recovery**, o crea una nueva con
  "Update password".
- Que el email esté confirmado (si es de mayo, casi seguro lo está; si el login
  del paso 5 falla con "email not confirmed", confírmalo desde esa misma fila).

## 2. ⚠️ Desactivar el registro público (crítico)

Supabase → **Authentication → Sign In / Providers → Email** (o **Settings**) →
apaga **"Allow new users to sign up"**.

Por qué es imprescindible: la política nueva da acceso total a *cualquier*
usuario autenticado. Si el registro queda abierto, un atacante con la key
pública simplemente crea su propia cuenta (`signUp`) y vuelve a entrar a todo.
Con el registro cerrado, el único usuario que existe es el que creaste tú.

## 3. Setear la service_role key en Vercel

Supabase → **Settings → API** → copia la **service_role** key (la secreta, no la
publishable).

Vercel → proyecto → **Settings → Environment Variables** → agrega:

- `SUPABASE_SERVICE_ROLE_KEY` = (la service_role que copiaste)
- `SUPABASE_URL` = `https://wcuxjxaquiypzinxakxu.supabase.co` (opcional, ya está
  como fallback)

Esta key vive solo en el servidor de Vercel, nunca en el navegador. Es la que
deja que `/api/insights` siga funcionando cuando cerremos RLS.

## 4. Desplegar la app

Sube los cambios (`git push` → deploy en Vercel). En este punto RLS todavía está
abierto, así que **nada se rompe**: la app funciona igual, pero ahora aparece la
pantalla de login y `/api/insights` ya usa la service_role.

## 5. Probar ANTES de cerrar (esto evita el lockout)

- Abre la app → debe pedirte la clave → entra con la cuenta del paso 1 → navega
  Dashboard, Ventas, etc. Todo debe cargar y guardar normal.
- Abre el Dashboard que llama a `/api/insights` → debe traer el análisis (esto
  confirma que la service_role quedó bien seteada).

Si algo de esto falla, **no corras el paso 6 todavía**: revisa la cuenta o la
env var. Mientras no cierres RLS, no hay riesgo de quedarte afuera.

## 6. Cerrar RLS (el blindaje)

Supabase → **SQL Editor** → pega y corre el contenido de
`supabase/migrations/20260717_blindaje_rls.sql`.

Desde este momento el rol anónimo no puede tocar nada.

## 7. Verificar que quedó cerrado

En el **SQL Editor**, las dos consultas del final del archivo de migración:

- La de `pg_policies ... roles @> '{anon}'` debe devolver **0 filas**.
- La de `pg_tables ... rowsecurity` debe mostrar **true** en todas tus tablas.

Prueba real del atacante: abre una ventana de incógnito, entra al sitio **sin
loguearte** y confirma que no carga datos (te manda al login). Opcional: pégale
directo a la REST API con la key publishable y verifica que devuelve vacío:

```
curl 'https://wcuxjxaquiypzinxakxu.supabase.co/rest/v1/ordenes?select=*&limit=1' \
  -H "apikey: sb_publishable_UzDdk9WWxGhA8IysMVNz_w_FIz_k1wI"
```

Antes devolvía filas; ahora debe devolver `[]`.

---

## Si algo se rompe (rollback rápido)

Reabrir temporalmente una tabla mientras diagnosticas (NO dejarlo así):

```sql
create policy tmp_open on public.NOMBRE_TABLA
  for all to anon, authenticated using (true) with check (true);
```

Cuando termines, `drop policy tmp_open on public.NOMBRE_TABLA;` y vuelve a correr
la migración.

---

## Notas

- **La key publishable NO hay que rotarla.** Es pública por diseño; con RLS
  cerrado, sola no sirve para nada. Puede seguir en el código.
- **El PIN viejo (`085279`) queda obsoleto.** Ya no protege la base. Los bundles
  viejos que lo tienen dejan de importar apenas cierres RLS.
- **Cuenta compartida = sin trazabilidad.** No sabrás quién cargó cada venta. Si
  más adelante quieres eso, se migra a una cuenta por persona (mismo esquema,
  solo más usuarios) sin tocar las políticas.
- **Delivery:** el panel `/delivery` ahora también pide login. Si los
  repartidores lo usan, necesitan la clave compartida — o, mejor a futuro, una
  cuenta aparte con acceso limitado solo a las tablas de delivery.
