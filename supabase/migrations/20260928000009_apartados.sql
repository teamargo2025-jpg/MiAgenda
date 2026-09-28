-- Apartados: los temas pasan de etiqueta escrita a entidad con nombre propio.
--
-- En su día se decidió lo contrario a conciencia: el tema se escribía dentro de
-- la nota con almohadilla y existía mientras alguna nota lo usara, sin tabla ni
-- pantalla que mantener. Aquello era lo correcto entonces, y queda escrito el
-- motivo por el que ya no lo es:
--
--   - Un apartado necesita COLOR elegido a mano. Un texto suelto no tiene dónde
--     guardarlo.
--   - Necesita JERARQUÍA: un apartado con subapartados dentro. Dos etiquetas
--     sueltas no expresan que una esté dentro de la otra.
--   - Necesita EXISTIR VACÍO. Con el modelo anterior, un apartado recién creado
--     desaparecía hasta que alguna nota lo usara — justo al revés de como se
--     quiere trabajar ahora: primero creo "Proyectos", luego lo lleno.
--
-- Esas tres cosas son exactamente lo que una tabla da y una etiqueta no.

create table if not exists public.apartados (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null check (length(trim(nombre)) > 0),

  -- Se guarda el NOMBRE del color, no su hexadecimal. Así la app decide qué
  -- valor exacto usar en tema claro y en oscuro, y un color elegido hoy no se
  -- vuelve ilegible mañana cuando cambie la paleta. Guardar "#ff0000" sería
  -- dejar que el usuario se pinte a sí mismo en una esquina.
  color     text not null default 'indigo',

  -- Dos niveles y no más: un apartado, y sus subapartados. Permitir
  -- profundidad libre obliga a decidir cómo se navega, cómo se dibuja y qué
  -- pasa al mover una rama — y nada de eso hace falta para lo que se quiere.
  padre_id  uuid references public.apartados (id) on delete cascade,

  orden     integer not null default 0,
  creado_en timestamptz not null default now()
);

create index if not exists apartados_padre_idx on public.apartados (padre_id);

-- Las notas apuntan al apartado. `on delete set null` y no `cascade`: borrar
-- un apartado no puede llevarse por delante las notas que contenía. Quedan sin
-- clasificar, que es recuperable; borradas, no.
alter table public.notas
  add column if not exists apartado_id uuid references public.apartados (id) on delete set null;

create index if not exists notas_apartado_idx
  on public.notas (apartado_id)
  where apartado_id is not null;

-- --- Traer lo que ya existía ---
--
-- Cada tema escrito con almohadilla se convierte en un apartado de primer
-- nivel, y las notas que lo usaban quedan apuntando a él. Sin esto, todo lo
-- clasificado hasta hoy se quedaría suelto.
do $$
declare
  fila record;
  nuevo uuid;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notas' and column_name = 'tema'
  ) then
    for fila in
      select distinct tema from public.notas
      where tema is not null and length(trim(tema)) > 0
    loop
      insert into public.apartados (nombre)
      values (initcap(fila.tema))
      returning id into nuevo;

      update public.notas
        set apartado_id = nuevo
        where tema = fila.tema and apartado_id is null;
    end loop;

    -- La columna se retira una vez migrada: dejarla poblada y sin usar es la
    -- clase de resto que dentro de tres meses hace dudar de cuál manda.
    alter table public.notas drop column tema;
  end if;
end
$$;

alter table public.apartados enable row level security;

drop policy if exists apartados_dueno on public.apartados;
create policy apartados_dueno on public.apartados
  for all to authenticated using (true) with check (true);
