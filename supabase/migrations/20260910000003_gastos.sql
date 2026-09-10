-- Gastos: monto y descripción, nada más.
--
-- Tabla aparte y no una columna en `notas`. Un gasto y una idea no comparten
-- ciclo de vida: el gasto no vence, no se marca como hecho, no se recuerda —
-- se suma. Mezclarlos obligaría a que media tabla tuviera columnas vacías y a
-- que cada consulta empezara filtrando por tipo.
--
-- Sin categorías a propósito: es el peaje que hizo abandonar Trello. Si al usar
-- esto durante unas semanas resulta que hace falta saber en qué se va el
-- dinero, se añaden entonces —y con datos reales delante para saber cuáles.

create table if not exists public.gastos (
  id          uuid primary key default gen_random_uuid(),
  -- numeric y no float: el dinero en coma flotante acumula errores de redondeo
  -- que aparecen justo al sumar, que es lo único que esta tabla hace.
  monto       numeric(12, 2) not null check (monto > 0),
  descripcion text not null check (length(trim(descripcion)) > 0),
  gastado_en  timestamptz not null default now(),
  creada_en   timestamptz not null default now()
);

-- Las consultas siempre son "lo de este mes" o "lo último": ambas por fecha
-- descendente.
create index if not exists gastos_fecha_idx on public.gastos (gastado_en desc);

alter table public.gastos enable row level security;

create policy gastos_dueno on public.gastos
  for all to authenticated using (true) with check (true);
