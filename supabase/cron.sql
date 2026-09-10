-- Programa el cron que dispara los recordatorios.
--
-- Sustituir <REF> por el "Project ref" (Settings → General) y <ANON_KEY> por
-- la clave anon (Settings → API).
--
-- Sobre la autorización: se usa la clave ANON, no la service_role. La función
-- solo exige que quien la llame traiga un JWT válido, y la anon lo es; sus
-- permisos reales vienen de su propia variable SUPABASE_SERVICE_ROLE_KEY, no
-- de quien la invoca. Además la anon ya es pública — viaja dentro del
-- JavaScript de la web — así que escribirla aquí no expone nada nuevo.
--
-- El primer intento usaba la service_role guardada en Vault. La consulta a
-- vault.decrypted_secrets devolvía vacío desde el contexto del job, la
-- cabecera quedaba como "Bearer " y cada llamada respondía 401. Se ve en
-- net._http_response, no en cron.job_run_details: ahí el job figura como
-- "succeeded" porque lo único que hace es encolar la petición.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'miagenda-recordatorios',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<REF>.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);

-- --- Comprobaciones ---
--
-- El job existe y está activo:
--   select jobid, jobname, schedule, active from cron.job;
--
-- El cron corre (esto solo dice que encoló la petición):
--   select status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
--
-- El resultado REAL de la llamada HTTP — aquí se ven los 401, 404, timeouts:
--   select id, status_code, error_msg, timed_out, created
--     from net._http_response order by created desc limit 10;
--
-- El retraso real de los avisos:
--   select * from public.retrasos limit 20;
--
-- Apagarlo mientras se depura:
--   select cron.unschedule('miagenda-recordatorios');
