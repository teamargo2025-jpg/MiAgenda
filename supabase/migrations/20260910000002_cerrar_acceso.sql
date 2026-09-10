-- Cerrar el acceso: de la clave anónima a un usuario con sesión.
--
-- Hasta ahora la app entraba con la clave `anon`, que viaja dentro del
-- JavaScript de la web: cualquiera con la URL podía leer y escribir las notas.
-- Se aceptó mientras la base estaba vacía y el objetivo era medir el push.
-- Deja de ser aceptable en cuanto entra contenido real — y desde luego antes
-- de meter gastos.
--
-- No se monta un sistema de cuentas: el documento dice un solo usuario. Se crea
-- ESE usuario a mano desde el panel y las políticas pasan a exigir sesión.

-- --- config fuera del alcance de la API ---
--
-- PostREST solo publica el esquema `public`. Moviendo la tabla, la clave que
-- usa el cron deja de ser accesible desde internet, sin depender de que sus
-- políticas estén bien puestas. El cron la sigue leyendo: corre dentro de la
-- base, no a través de la API.
create schema if not exists privado;
alter table if exists public.config set schema privado;

-- --- Políticas ---
--
-- `authenticated` es el rol que Postgres asigna cuando la petición trae un JWT
-- de sesión válido. Al no haber más que un usuario, no hace falta filtrar por
-- dueño: si hay sesión, es la suya.

drop policy if exists notas_abierto on public.notas;
drop policy if exists suscripciones_alta on public.suscripciones;
drop policy if exists suscripciones_refresco on public.suscripciones;
drop policy if exists envios_lectura on public.envios;

create policy notas_dueno on public.notas
  for all to authenticated using (true) with check (true);

-- Igual que antes: alta y refresco, pero no lectura. Listar los endpoints de
-- todos los dispositivos es trabajo de la Edge Function, que usa la clave de
-- servicio y se salta RLS.
create policy suscripciones_alta on public.suscripciones
  for insert to authenticated with check (true);

create policy suscripciones_refresco on public.suscripciones
  for update to authenticated using (true) with check (true);

create policy envios_lectura on public.envios
  for select to authenticated using (true);

-- --- Comprobación ---
--
-- Sin sesión, esto debe devolver 0 filas desde la API (y las tres tablas
-- deben seguir respondiendo, no dar error: RLS oculta filas, no rechaza):
--   select tablename, policyname, roles
--     from pg_policies where schemaname = 'public' order by tablename;
--
-- La tabla config ya no debe aparecer en el esquema público:
--   select schemaname from pg_tables where tablename = 'config';

-- --- Reprogramar el cron ---
--
-- Su comando apuntaba a public.config. Mover la tabla sin tocar el job dejaría
-- los recordatorios mudos, y en silencio: el job seguiría marcándose como
-- "succeeded" porque lo único que hace es encolar la petición.
select cron.unschedule('miagenda-recordatorios');

select cron.schedule(
  'miagenda-recordatorios',
  '* * * * *',
  $cron$
  select net.http_post(
    url     := 'https://zjzlsenqpvshtgydxlej.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select valor from privado.config where clave = 'anon_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $cron$
);
