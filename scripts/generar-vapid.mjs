// Genera el par de claves VAPID que identifica a este servidor ante los
// servicios de push de los navegadores (Google, Mozilla…).
//
// Se corre UNA sola vez. Si se regeneran, todas las suscripciones guardadas
// dejan de servir y hay que volver a suscribir cada dispositivo a mano.
//
//   node scripts/generar-vapid.mjs
//
// El formato de salida es el que espera `importVapidKeys` de @negrel/webpush:
// un objeto { publicKey, privateKey } con las dos claves en JWK.
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });

// WebCrypto rechaza un JWK con key_ops incoherentes con el uso que se le pide,
// así que se emiten solo los campos de la curva y se deja que importKey asigne
// las operaciones.
const jwks = {
  publicKey: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y, ext: true },
  privateKey: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y, d: priv.d, ext: true },
};

// La clave que recibe el navegador es el punto sin comprimir de la curva:
// 0x04 seguido de las coordenadas X e Y, en base64url.
const b64url = (s) => Buffer.from(s, 'base64url');
const applicationServerKey = Buffer.concat([
  Buffer.from([0x04]),
  b64url(pub.x),
  b64url(pub.y),
]).toString('base64url');

console.log('--- PÚBLICA — va en .env.local del front (no es secreta) ---');
console.log(`VITE_VAPID_PUBLIC_KEY=${applicationServerKey}`);
console.log();
console.log('--- PRIVADA — secreto de la Edge Function, NUNCA al front ni a git ---');
console.log(`VAPID_JWKS=${JSON.stringify(jwks)}`);
