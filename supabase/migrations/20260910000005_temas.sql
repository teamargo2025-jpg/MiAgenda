-- Temas: los "temas" donde caen las notas.
--
-- Una columna en `notas`, no una tabla de temas con su clave foránea.
--
-- Una tabla obligaría a crear el tema antes de usarlo, a decidir qué pasa al
-- renombrarlo, y a limpiar los que se quedan vacíos. Todo eso es trabajo de
-- administración para algo que aquí no lo necesita: el tema se escribe dentro
-- de la nota con almohadilla, existe mientras alguna nota lo use, y deja de
-- existir cuando ninguna lo usa. La lista de temas se deduce consultando, no se
-- mantiene.
--
-- Lo que se pierde: no se puede renombrar un tema en todas sus notas de una vez
-- ni darle un color. Si algún día hace falta, se añade la tabla entonces —
-- con datos reales delante para saber qué columnas necesita.

alter table public.notas
  add column if not exists tema text;

-- La consulta habitual es "las notas de este tema", y la lista de temas sale de
-- un `select distinct tema`. El índice parcial sirve a las dos y se salta las
-- notas sin clasificar, que son mayoría al principio.
create index if not exists notas_tema_idx
  on public.notas (tema)
  where tema is not null;
