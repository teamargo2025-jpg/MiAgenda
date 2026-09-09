-- MiAgenda — esquema de la fase 0.
--
-- Tres tablas: las notas, las suscripciones push de cada dispositivo, y una
-- bitácora de disparos. La bitácora existe para responder una pregunta concreta
-- del documento: "¿pg_cron gratuito dispara con precisión suficiente?". Sin
-- guardar el momento programado junto al real, esa respuesta sería a ojo.

create extension if not exists pgcrypto;

-- Lo que capturo. `recordar_en` es opcional: hay notas que son solo ideas.
create table if not exists public.notas (
  id            uuid primary key default gen_random_uuid(),
  texto         text not null check (length(trim(texto)) > 0),
  recordar_en   timestamptz,
  notificada_en timestamptz,
  hecha         boolean not null default false,
  creada_en     timestamptz not null default now()
);

-- Índice parcial: al cron solo le interesan las notas que aún deben avisar.
-- Al filtrar en el propio índice, la consulta de cada minuto no recorre la
-- tabla entera según vaya creciendo.
create index if not exists notas_pendientes_idx
  on public.notas (recordar_en)
  where recordar_en is not null and notificada_en is null and hecha = false;

-- Un registro por dispositivo suscrito (el celular, la computadora).
-- `endpoint` es único: el navegador lo reemite igual al resuscribir, así que
-- sirve para no duplicar el mismo aparato.
create table if not exists public.suscripciones (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  datos       jsonb not null,
  etiqueta    text,
  creada_en   timestamptz not null default now(),
  ultimo_ok   timestamptz,
  ultimo_erro text
);

-- Bitácora de disparos. `programado_en` vs `enviado_en` da el retraso real.
create table if not exists public.envios (
  id            uuid primary key default gen_random_uuid(),
  nota_id       uuid references public.notas (id) on delete set null,
  programado_en timestamptz,
  disparado_en  timestamptz not null default now(),
  enviado_en    timestamptz,
  destinos      integer not null default 0,
  ok            boolean,
  detalle       text
);

create index if not exists envios_disparado_idx on public.envios (disparado_en desc);

-- Vista de conveniencia para medir el retraso sin escribir la resta a mano.
create or replace view public.retrasos as
  select
    id,
    nota_id,
    programado_en,
    enviado_en,
    extract(epoch from (enviado_en - programado_en)) as retraso_segundos,
    ok,
    detalle
  from public.envios
  where programado_en is not null and enviado_en is not null
  order by disparado_en desc;

-- --- Acceso ---
--
-- La app es de un solo usuario y no tiene cuentas (decisión del documento), así
-- que el front entra con la clave `anon`. Esa clave viaja al navegador, o sea
-- que cualquiera que dé con la URL podría leer y escribir estas tablas.
--
-- Para la fase 0 se acepta: no hay datos reales dentro y el objetivo es medir
-- el push. ANTES DE EMPEZAR A USARLA DE VERDAD (fin de fase 1) hay que cerrar
-- esto — la vía más barata es un único usuario de Supabase Auth con enlace
-- mágico, y cambiar `to anon` por `to authenticated` aquí abajo.

alter table public.notas         enable row level security;
alter table public.suscripciones enable row level security;
alter table public.envios        enable row level security;

drop policy if exists notas_abierto on public.notas;
create policy notas_abierto on public.notas
  for all to anon using (true) with check (true);

-- El front necesita darse de alta y refrescar sus propios datos (el navegador
-- puede rotar las claves de una suscripción sin cambiar el endpoint), así que
-- necesita INSERT y UPDATE — es lo que exige el upsert por endpoint.
-- No se le da SELECT: leer los endpoints de todos los dispositivos es trabajo
-- de la Edge Function, que usa la clave de servicio y se salta RLS.
drop policy if exists suscripciones_alta on public.suscripciones;
create policy suscripciones_alta on public.suscripciones
  for insert to anon with check (true);

drop policy if exists suscripciones_refresco on public.suscripciones;
create policy suscripciones_refresco on public.suscripciones
  for update to anon using (true) with check (true);

drop policy if exists envios_lectura on public.envios;
create policy envios_lectura on public.envios
  for select to anon using (true);
