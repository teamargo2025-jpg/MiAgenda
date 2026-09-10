-- Formato de una nota: texto suelto, lista, o lista con casillas.
--
-- El estado de cada casilla NO va en una tabla aparte. Se guarda dentro del
-- propio texto con marcas `[ ]` y `[x]` al principio de cada línea, como en
-- Markdown. Tres razones:
--
--   1. La nota sigue siendo legible y editable como texto plano. Cambiar de
--      formato no destruye nada ni obliga a migrar filas.
--   2. Marcar una casilla es una escritura a la misma fila que ya existía, no
--      un alta en otra tabla con su propio ciclo de vida.
--   3. Una tabla de ítems obligaría a decidir qué pasa al borrar la nota, al
--      reordenar, al pegar diez líneas de golpe. Todo eso es gratis si las
--      líneas son texto.
--
-- El coste es que no se puede consultar "cuántas casillas me faltan" desde SQL
-- sin parsear. Para un solo usuario y notas de unas pocas líneas, no compensa
-- la tabla.

alter table public.notas
  add column if not exists formato text not null default 'texto';

alter table public.notas
  drop constraint if exists notas_formato_valido;

alter table public.notas
  add constraint notas_formato_valido
  check (formato in ('texto', 'lista', 'checklist'));
