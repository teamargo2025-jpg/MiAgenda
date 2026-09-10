// Genera los iconos de la PWA sin dependencias externas: escribe los PNG a
// mano (zlib viene en Node). Reproducible — si hay que cambiar el color o la
// forma, se edita aquí y se vuelve a correr con `node scripts/generar-iconos.mjs`.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const PAPEL = [0xf2, 0xef, 0xe6];
const TINTA = [0x14, 0x14, 0x1a];
const ACENTO = [0x16, 0xc4, 0x6a];

const tablaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = tablaCrc[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const trozo = (tipo, datos) => {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
};

const png = (ancho, alto, rgb) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 2;   // color tipo 2 = RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(rgb, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
};

// Rectángulo de esquinas redondeadas, con antialias por submuestreo 3x3.
const cobertura = (x, y, { x0, y0, x1, y1, r }) => {
  let dentro = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const px = x + (sx + 0.5) / 3;
      const py = y + (sy + 0.5) / 3;
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      const cx = Math.min(Math.max(px, x0 + r), x1 - r);
      const cy = Math.min(Math.max(py, y0 + r), y1 - r);
      if (Math.hypot(px - cx, py - cy) <= r) dentro++;
    }
  }
  return dentro / 9;
};

// La zona segura de un icono maskable es el 80% central: lo que quede fuera
// puede ser recortado por el launcher de Android.
const dibujar = (tam, margenRelativo) => {
  const m = tam * margenRelativo;
  // Esquinas rectas (r = 0) y un borde grueso de tinta: el icono tiene que
  // anunciar lo mismo que la app al abrirse.
  const tarjeta = { x0: m, y0: m, x1: tam - m, y1: tam - m, r: 0 };
  const grosorBorde = Math.max(2, tam * 0.035);
  const interior = {
    x0: tarjeta.x0 + grosorBorde,
    y0: tarjeta.y0 + grosorBorde,
    x1: tarjeta.x1 - grosorBorde,
    y1: tarjeta.y1 - grosorBorde,
    r: 0,
  };
  const anchoTarjeta = tarjeta.x1 - tarjeta.x0;
  const grosor = anchoTarjeta * 0.085;
  const hueco = anchoTarjeta * 0.145;
  const izq = tarjeta.x0 + anchoTarjeta * 0.18;
  const primeraY = tarjeta.y0 + anchoTarjeta * 0.26;

  const renglones = [0.64, 0.5, 0.36].map((largo, i) => ({
    x0: izq,
    y0: primeraY + i * (grosor + hueco),
    x1: izq + anchoTarjeta * largo,
    y1: primeraY + i * (grosor + hueco) + grosor,
    r: 0,
  }));

  const rgb = Buffer.alloc(tam * (tam * 3 + 1));
  let p = 0;
  for (let y = 0; y < tam; y++) {
    rgb[p++] = 0; // byte de filtro por línea
    for (let x = 0; x < tam; x++) {
      const enTarjeta = cobertura(x, y, tarjeta);
      const enInterior = cobertura(x, y, interior);
      const enRenglon = Math.max(...renglones.map((r) => cobertura(x, y, r)));

      // Tres capas: papel de fondo, marco de tinta, relleno verde, y los
      // renglones calados en tinta sobre el verde.
      const mezclar = (base, encima, alfa) =>
        base.map((v, c) => Math.round(v + (encima[c] - v) * alfa));

      let color = PAPEL;
      color = mezclar(color, TINTA, enTarjeta);
      color = mezclar(color, ACENTO, enInterior);
      color = mezclar(color, TINTA, enRenglon);

      for (let c = 0; c < 3; c++) rgb[p++] = color[c];
    }
  }
  return png(tam, tam, rgb);
};

mkdirSync('public', { recursive: true });
const salidas = [
  ['public/icono-192.png', 192, 0.08],
  ['public/icono-512.png', 512, 0.08],
  ['public/icono-maskable-512.png', 512, 0.18],
];
for (const [ruta, tam, margen] of salidas) {
  writeFileSync(ruta, dibujar(tam, margen));
  console.log('escrito', ruta);
}
