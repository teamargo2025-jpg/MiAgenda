// Los números del apartado financiero.
//
// Todo el cálculo vive aquí, separado de la pantalla, porque es lo único de la
// app donde equivocarse no se nota: una lista mal ordenada salta a la vista, un
// promedio mal calculado se cree.
//
// Sin IA: son sumas, porcentajes y una regla de tres. La gracia no está en el
// cálculo sino en elegir qué cuatro números merecen mirarse.

// El dinero se maneja en céntimos enteros para sumar. Sumar decimales en coma
// flotante da 0.1 + 0.2 = 0.30000000000000004, y ese error crece con cada
// apunte hasta aparecer en un total que no cuadra con lo anotado.
const aCentimos = (monto) => Math.round(Number(monto) * 100);
const aSoles = (centimos) => centimos / 100;

export function limitesDelMes(referencia = new Date()) {
  const desde = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  const hasta = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1);
  return { desde, hasta };
}

export function mesAnteriorA(referencia = new Date()) {
  return new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);
}

export function delMes(movimientos, referencia = new Date()) {
  const { desde, hasta } = limitesDelMes(referencia);
  return movimientos.filter((m) => {
    const cuando = new Date(m.ocurrido_en);
    return cuando >= desde && cuando < hasta;
  });
}

export function resumen(movimientos) {
  let ingresos = 0;
  let gastos = 0;

  for (const m of movimientos) {
    const centimos = aCentimos(m.monto);
    if (m.tipo === 'ingreso') ingresos += centimos;
    else gastos += centimos;
  }

  return {
    ingresos: aSoles(ingresos),
    gastos: aSoles(gastos),
    balance: aSoles(ingresos - gastos),
    // Qué proporción de lo que entró se ha ido. Es el número que dice si el mes
    // va bien, mejor que el balance a secas: 200 de balance significa cosas muy
    // distintas si ingresaste 300 o 3000.
    proporcionGastada: ingresos > 0 ? gastos / ingresos : null,
  };
}

// Reparto del gasto por categoría, de mayor a menor. Lo que no lleva etiqueta
// se agrupa bajo null y se muestra aparte: esconderlo daría una distribución
// que no suma el total y haría desconfiar de todo lo demás.
export function distribucion(movimientos) {
  const soloGastos = movimientos.filter((m) => m.tipo !== 'ingreso');
  const total = soloGastos.reduce((suma, m) => suma + aCentimos(m.monto), 0);
  if (total === 0) return [];

  const porCategoria = new Map();
  for (const m of soloGastos) {
    const clave = m.categoria || null;
    porCategoria.set(clave, (porCategoria.get(clave) ?? 0) + aCentimos(m.monto));
  }

  return [...porCategoria.entries()]
    .map(([categoria, centimos]) => ({
      categoria,
      monto: aSoles(centimos),
      parte: centimos / total,
    }))
    .sort((a, b) => b.monto - a.monto);
}

// Media de gasto por día y proyección a fin de mes.
//
// La media se calcula sobre los días TRANSCURRIDOS, no sobre los 30 del mes: el
// día 3 llevas gastado lo de tres días, y dividir entre 30 daría una media
// tranquilizadora y falsa.
export function ritmo(movimientos, referencia = new Date()) {
  const { desde, hasta } = limitesDelMes(referencia);
  const gastado = movimientos
    .filter((m) => m.tipo !== 'ingreso')
    .reduce((suma, m) => suma + aCentimos(m.monto), 0);

  const diasDelMes = Math.round((hasta - desde) / 86400000);
  const transcurridos = Math.min(
    diasDelMes,
    Math.max(1, Math.floor((referencia - desde) / 86400000) + 1),
  );

  const mediaDiaria = gastado / transcurridos;

  return {
    mediaDiaria: aSoles(Math.round(mediaDiaria)),
    proyeccion: aSoles(Math.round(mediaDiaria * diasDelMes)),
    transcurridos,
    diasDelMes,
    // La proyección solo orienta cuando hay días suficientes detrás. Con dos
    // días de datos, multiplicar por treinta es adivinar con aire de dato.
    fiable: transcurridos >= 7,
  };
}

// Cuánto ha cambiado respecto al mes pasado. Devuelve null cuando no hay con
// qué comparar, en vez de un 0 % que parecería "igual que siempre".
export function variacion(actual, anterior) {
  if (!anterior) return null;
  return (actual - anterior) / anterior;
}
