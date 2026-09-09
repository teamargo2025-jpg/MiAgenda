-- Programa el cron que dispara los recordatorios.
--
-- NO se corre tal cual: hay que sustituir los dos marcadores de abajo. Y ojo,
-- este archivo va al repositorio, así que la clave NO se escribe aquí — se
-- guarda en Vault y el job la lee de ahí.
--
-- Sustituir:
--   <REF>         → el "Project ref" de Supabase (Settings → General)
--   <SERVICE_KEY> → la service_role key (Settings → API). Se usa una sola vez,
--                   en el insert a Vault; después queda cifrada.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guardar la clave de servicio cifrada, para que el job no la lleve en claro.
select vault.create_secret('<SERVICE_KEY>', 'clave_servicio', 'service_role key para el cron de MiAgenda');

-- Un tick por minuto. Es la granularidad más fina de pg_cron, y basta: un
-- recordatorio con hasta un minuto de holgura es aceptable para esta app.
select cron.schedule(
  'miagenda-recordatorios',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<REF>.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'clave_servicio')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);

-- --- Comprobaciones útiles ---
--
-- Ver que el job existe:
--   select jobid, jobname, schedule, active from cron.job;
--
-- Ver las últimas corridas del cron (si fallan, aquí sale por qué):
--   select status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
--
-- Ver el retraso real de los avisos — esta es LA medición de la fase 0:
--   select * from public.retrasos limit 20;
--
-- Apagarlo mientras se depura:
--   select cron.unschedule('miagenda-recordatorios');
