# Configurar el backend (fase 0, bloque C)

Pasos que hay que hacer una sola vez, en orden. Cada uno depende del anterior.

## 1. Crear el proyecto en Supabase

En [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
Región: la más cercana. Guarda la contraseña de la base de datos.

Del proyecto hacen falta tres datos (**Settings → API** y **Settings → General**):

| Dato | Dónde | Secreto |
|---|---|---|
| Project URL | Settings → API | no |
| `anon` key | Settings → API | no (viaja al navegador) |
| `service_role` key | Settings → API | **sí** |
| Project ref | Settings → General | no |

## 2. Crear las tablas

SQL Editor → pegar el contenido de `migrations/20260909000001_esquema.sql` → **Run**.

Comprobación: en Table Editor deben aparecer `notas`, `suscripciones` y `envios`.

## 3. Variables del front

Crear `.env.local` en la raíz del proyecto (git lo ignora):

```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_VAPID_PUBLIC_KEY=<la pública de secretos.local.txt>
```

Las mismas tres variables hay que cargarlas en **Vercel → Settings →
Environment Variables**, o el sitio desplegado no las tendrá. Vite las
incrusta en el build, así que después de añadirlas hay que **redesplegar**.

## 4. Desplegar la Edge Function

Con el CLI de Supabase (no hace falta instalarlo, `npx` lo baja):

```
npx supabase login
npx supabase link --project-ref <REF>
npx supabase functions deploy enviar-push --no-verify-jwt
```

`--no-verify-jwt` es necesario porque quien la llama es pg_cron, que manda la
clave de servicio y no un JWT de usuario.

Y cargar sus secretos:

```
npx supabase secrets set VAPID_JWKS='<la línea VAPID_JWKS de secretos.local.txt>'
npx supabase secrets set CORREO_CONTACTO='mailto:tu@correo.com'
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen puestas por Supabase;
no hay que añadirlas.

> El correo de contacto no es decorativo: es lo que exige el estándar VAPID
> para que Google o Mozilla puedan avisarte si tu servidor les está dando
> problemas, antes de bloquearlo.

## 5. Probar sin el cron todavía

En la app: **Suscribir este dispositivo** → **Pedir push al servidor**.

Si llega el aviso, la cadena funciona y solo falta automatizar el disparo.
Si no llega, el problema está aquí y no en el cron — mirar los logs en
Supabase → Edge Functions → `enviar-push` → Logs.

## 6. Programar el cron

SQL Editor → pegar `cron.sql` sustituyendo `<REF>` y `<SERVICE_KEY>` → **Run**.

## 7. La medición de la fase 0

Crear una nota con `recordar_en` dos minutos en el futuro:

```sql
insert into public.notas (texto, recordar_en)
values ('prueba de retraso', now() + interval '2 minutes');
```

Y después de que llegue:

```sql
select * from public.retrasos limit 10;
```

`retraso_segundos` es la respuesta a la pregunta del documento sobre la
precisión de pg_cron. Repetirlo 3–5 veces y anotar el resultado en
`PROYECTO.md`.
