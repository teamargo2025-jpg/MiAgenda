-- La rutina de cada día de la semana.
--
-- Siete filas como mucho, una por día, con el día como clave primaria. No hay
-- fecha: la rutina del lunes es la del lunes, todos los lunes. Cuando haga
-- falta llevar historial de lo que se hizo cada día concreto, eso será otra
-- tabla — un registro de sesiones — y esta seguirá siendo la plantilla.
--
-- El texto es libre y multilínea, igual que una nota: se aprovecha que ya
-- sabemos pintar listas y checklists, en vez de inventar un modelo de
-- ejercicios con series y repeticiones antes de saber cómo se va a usar.

create table if not exists public.rutinas (
  -- 0 = domingo, como getDay() de JavaScript. Coincidir con lo que devuelve el
  -- navegador evita una conversión en cada lectura, y las conversiones de días
  -- de la semana son un clásico de los errores por uno.
  dia            smallint primary key check (dia between 0 and 6),
  texto          text not null default '',
  actualizada_en timestamptz not null default now()
);

alter table public.rutinas enable row level security;

drop policy if exists rutinas_dueno on public.rutinas;
create policy rutinas_dueno on public.rutinas
  for all to authenticated using (true) with check (true);
