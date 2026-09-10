-- De "gastos" a "movimientos": entra el dinero que sale y el que llega.
--
-- La tabla se renombra porque una llamada `gastos` que guarda ingresos es una
-- mentira que confunde cada vez que se lee una consulta. El coste de renombrar
-- ahora es una migración; el de no hacerlo se paga cada vez que alguien vuelva
-- al código.
--
-- Categorías por etiqueta, igual que los temas de las notas: se escriben dentro
-- de la descripción ("almuerzo #comida") y se separan al guardar. Sin lista de
-- categorías que mantener y sin elegir una antes de apuntar — que es lo que
-- hace que un registro de gastos se abandone a la semana.
--
-- Escrito para correr esté o no aplicada la migración anterior de `gastos`.

create table if not exists public.movimientos (
  id          uuid primary key default gen_random_uuid(),
  -- 'gasto' o 'ingreso'. No se usan montos negativos para distinguirlos: un
  -- signo se pierde de vista en cuanto hay una suma de por medio, y obligaría a
  -- recordar la convención en cada consulta.
  tipo        text not null default 'gasto' check (tipo in ('gasto', 'ingreso')),
  -- numeric y no float: el error de redondeo de la coma flotante aparece justo
  -- al sumar, que es lo único que esta tabla hace.
  monto       numeric(12, 2) not null check (monto > 0),
  descripcion text not null check (length(trim(descripcion)) > 0),
  categoria   text,
  ocurrido_en timestamptz not null default now(),
  creada_en   timestamptz not null default now()
);

-- Traer lo que hubiera en la tabla anterior y retirarla.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'gastos'
  ) then
    insert into public.movimientos (id, tipo, monto, descripcion, ocurrido_en, creada_en)
      select id, 'gasto', monto, descripcion, gastado_en, creada_en
      from public.gastos
    on conflict (id) do nothing;

    drop table public.gastos;
  end if;
end
$$;

-- Las consultas son siempre "lo de este mes" o "lo de este mes por categoría".
create index if not exists movimientos_fecha_idx
  on public.movimientos (ocurrido_en desc);

create index if not exists movimientos_categoria_idx
  on public.movimientos (categoria)
  where categoria is not null;

alter table public.movimientos enable row level security;

drop policy if exists movimientos_dueno on public.movimientos;
create policy movimientos_dueno on public.movimientos
  for all to authenticated using (true) with check (true);
