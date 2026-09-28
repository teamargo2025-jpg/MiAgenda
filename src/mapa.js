// El mapa de apartados: cada apartado con sus subapartados alrededor.
//
// Se dibuja en SVG y a mano, sin librería. Para ocho nodos en círculo, traer
// un motor de grafos serían 200 KB para resolver una trigonometría de cuatro
// líneas — y encima habría que pelearse con su manera de colocar las cosas.
//
// No es un grafo interactivo ni pretende serlo: es una foto de en qué andas
// metido, con los nodos como enlaces para entrar.

const RADIO_CENTRO = 34;
const RADIO_HIJO = 26;
const DISTANCIA = 82;

// Alto y ancho del lienzo de cada apartado. El círculo de hijos cabe dentro
// con margen para que el texto de los extremos no se corte.
const ANCHO = 300;
const ALTO = 250;

const svg = (nombre, atributos = {}) => {
  const nodo = document.createElementNS('http://www.w3.org/2000/svg', nombre);
  for (const [clave, valor] of Object.entries(atributos)) nodo.setAttribute(clave, valor);
  return nodo;
};

// Un nombre largo no cabe en un círculo. Se parte en dos líneas y, si aun así
// no entra, se recorta: más vale un nombre reconocible que uno completo e
// ilegible.
function lineasDeNombre(nombre, maximo) {
  if (nombre.length <= maximo) return [nombre];

  const palabras = nombre.split(' ');
  if (palabras.length === 1) return [nombre.slice(0, maximo - 1) + '…'];

  const mitad = Math.ceil(palabras.length / 2);
  const dos = [palabras.slice(0, mitad).join(' '), palabras.slice(mitad).join(' ')];
  return dos.map((l) => (l.length > maximo ? l.slice(0, maximo - 1) + '…' : l));
}

function nodo({ x, y, radio, texto, color, href, esCentro }) {
  const grupo = svg('a', { href });
  grupo.setAttribute('class', esCentro ? 'nodo nodo-centro' : 'nodo');
  grupo.dataset.color = color;

  grupo.append(svg('circle', { cx: x, cy: y, r: radio, class: 'nodo-circulo' }));

  const lineas = lineasDeNombre(texto, esCentro ? 11 : 9);
  const alturaLinea = esCentro ? 13 : 11;
  const inicio = y - ((lineas.length - 1) * alturaLinea) / 2;

  lineas.forEach((linea, i) => {
    const etiqueta = svg('text', {
      x,
      y: inicio + i * alturaLinea,
      class: 'nodo-texto',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    });
    etiqueta.textContent = linea;
    grupo.append(etiqueta);
  });

  return grupo;
}

// Dibuja un apartado con sus hijos repartidos en círculo a su alrededor.
export function dibujarArbol({ apartado, hijos, enlaceDe }) {
  const lienzo = svg('svg', {
    viewBox: `0 0 ${ANCHO} ${ALTO}`,
    class: 'arbol',
    role: 'img',
    'aria-label': hijos.length
      ? `${apartado.nombre}, con ${hijos.length} subapartados`
      : apartado.nombre,
  });

  const cx = ANCHO / 2;
  const cy = ALTO / 2;

  // Se empieza arriba y se reparte el círculo completo. Con un solo hijo queda
  // justo encima, que se lee mejor que a un lado.
  const posiciones = hijos.map((_, i) => {
    const angulo = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(hijos.length, 1);
    return { x: cx + Math.cos(angulo) * DISTANCIA, y: cy + Math.sin(angulo) * DISTANCIA };
  });

  // Las líneas van primero para quedar por debajo de los círculos.
  posiciones.forEach((p) => {
    lienzo.append(svg('line', { x1: cx, y1: cy, x2: p.x, y2: p.y, class: 'rama' }));
  });

  hijos.forEach((hijo, i) => {
    lienzo.append(
      nodo({
        ...posiciones[i],
        radio: RADIO_HIJO,
        texto: hijo.nombre,
        color: hijo.color,
        href: enlaceDe(hijo),
      }),
    );
  });

  lienzo.append(
    nodo({
      x: cx,
      y: cy,
      radio: RADIO_CENTRO,
      texto: apartado.nombre,
      color: apartado.color,
      href: enlaceDe(apartado),
      esCentro: true,
    }),
  );

  return lienzo;
}
