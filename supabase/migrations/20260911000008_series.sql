-- Las series que de verdad se hicieron.
--
-- No hay tabla de "sesiones". Una sesión es, simplemente, las series hechas un
-- día: agrupar por fecha da lo mismo sin tener que abrirla, cerrarla, ni
-- decidir qué pasa cuando te olvidas de cerrarla y vuelves al día siguiente.
-- Ese estado extra solo se paga en fallos.
--
-- El ejercicio se guarda por su NOMBRE y no por una referencia a la rutina.
-- Así, reordenar la rutina, cambiarle las series o reescribirla entera no rompe
-- el historial de lo que ya levantaste — que es justo lo que hace valioso el
-- historial. El precio es que renombrar un ejercicio parte su historia en dos;
-- se acepta, porque renombrar es raro y reescribir la rutina es constante.

create table if not exists public.series_hechas (
  id            uuid primary key default gen_random_uuid(),
  ejercicio     text not null check (length(trim(ejercicio)) > 0),
  repeticiones  smallint not null check (repeticiones > 0),
  -- El peso puede faltar: dominadas, fondos, plancha. Cero no serviría para
  -- decirlo, porque cero es un peso válido en una barra sin discos.
  peso          numeric(6, 2) check (peso is null or peso >= 0),
  hecha_en      timestamptz not null default now()
);

-- Las dos consultas son "lo de hoy" y "las últimas de este ejercicio". Ambas
-- van por fecha descendente.
create index if not exists series_hechas_fecha_idx
  on public.series_hechas (hecha_en desc);

alter table public.series_hechas enable row level security;

drop policy if exists series_hechas_dueno on public.series_hechas;
create policy series_hechas_dueno on public.series_hechas
  for all to authenticated using (true) with check (true);
