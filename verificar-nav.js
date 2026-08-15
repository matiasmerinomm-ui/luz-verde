/**
 * Tests del motor de navegación.
 *
 *     node verificar-nav.js
 *
 * La geometría es la parte que falla en silencio: si la proyección sobre la
 * ruta está corrida, la distancia restante miente, las maniobras se anuncian
 * tarde y las cámaras avisan cuando ya pasaste. Nada de eso tira un error.
 */

const assert = require('assert');
const fs = require('fs');

// El motor va embebido en index.html (ver el comentario del bloque). Se extrae
// el bloque marcado y se evalúa: así se testea exactamente el código que corre
// en el teléfono, no una copia que puede quedar desincronizada.
const html = fs.readFileSync(__dirname + '/www/index.html', 'utf8');
const bloque = html.match(/<script>\s*\/\* === MOTOR DE NAVEGACION[\s\S]*?<\/script>/);
if (!bloque) throw new Error('no se encontró el bloque del motor en index.html');

const N = new Function(
  bloque[0].replace(/<\/?script>/g, '') + `
  ; return { distancia, rumbo, distanciaASegmento, ubicarEnRuta, acumulados,
             recorrido, iconoManiobra, pasoActual, umbralesAviso, distanciaHablada,
             fraseManiobra, camarasSobreRuta, buscarCamaras, evaluarDesvio,
             zoomPorVelocidad, fmtDistanciaCorta, ICONO_MANIOBRA };`
)();

let ok = 0, mal = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok    ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); mal++; }
}
function casi(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);
}

/* Ruta de prueba: cuatro cuadras al este y tres al norte, en Buenos Aires. */
const A = [-34.6037, -58.3816];
const RUTA = [
  [-34.6037, -58.3816],
  [-34.6037, -58.3770],
  [-34.6010, -58.3770],
  [-34.5980, -58.3770],
  [-34.5980, -58.3720],
];
const ACC = N.acumulados(RUTA);

/* -------------------------------------------------------------------------- */
console.log('\nDistancias y rumbos');

test('distancia contra valor conocido', () => {
  // Obelisco -> Rosario, ~278 km
  casi(N.distancia([-34.6037, -58.3816], [-32.9442, -60.6505]), 278000, 6000);
});

test('distancia de un punto a si mismo es cero', () => {
  assert.strictEqual(N.distancia(A, A), 0);
});

test('un grado de latitud son ~111 km', () => {
  casi(N.distancia([-34, -58], [-35, -58]), 111000, 700);
});

test('rumbos cardinales', () => {
  casi(N.rumbo([-34.60, -58.38], [-34.59, -58.38]), 0, 1, 'norte');
  casi(N.rumbo([-34.60, -58.38], [-34.60, -58.37]), 90, 1, 'este');
  casi(N.rumbo([-34.60, -58.38], [-34.61, -58.38]), 180, 1, 'sur');
  casi(N.rumbo([-34.60, -58.38], [-34.60, -58.39]), 270, 1, 'oeste');
});

/* -------------------------------------------------------------------------- */
console.log('\nProyección sobre la ruta');

test('un punto sobre el segmento da distancia ~0', () => {
  const medio = [-34.6037, -58.3793];
  const r = N.distanciaASegmento(medio, RUTA[0], RUTA[1]);
  assert.ok(r.metros < 2, 'deberia estar sobre la linea, dio ' + r.metros);
  assert.ok(r.t > 0.4 && r.t < 0.6, 't fuera de lugar: ' + r.t);
});

test('un punto al costado da la distancia perpendicular', () => {
  // ~111 m al sur del primer segmento (que corre de oeste a este)
  const r = N.distanciaASegmento([-34.6047, -58.3793], RUTA[0], RUTA[1]);
  casi(r.metros, 111, 12);
});

test('mas alla del extremo se mide al extremo, no a la recta', () => {
  const r = N.distanciaASegmento([-34.6037, -58.3700], RUTA[0], RUTA[1]);
  assert.strictEqual(r.t, 1);
  casi(r.metros, N.distancia([-34.6037, -58.3700], RUTA[1]), 1);
});

test('segmento degenerado no divide por cero', () => {
  const r = N.distanciaASegmento([-34.60, -58.38], A, A);
  assert.ok(Number.isFinite(r.metros));
  assert.strictEqual(r.t, 0);
});

test('ubicar encuentra el tramo correcto', () => {
  const sobreTercerTramo = [-34.5995, -58.3771];
  const u = N.ubicarEnRuta(sobreTercerTramo, RUTA);
  assert.strictEqual(u.idx, 2);
  assert.ok(u.metros < 15, 'demasiado lejos: ' + u.metros);
});

test('la ventana evita saltar a un tramo que se cruza', () => {
  // Vuelta manzana: el punto de llegada es fisicamente el mismo que el de
  // salida. Buscando desde cero, el vehiculo que esta terminando el viaje
  // "aparece" en el arranque y la distancia restante salta de 0 al total.
  const vueltaManzana = [
    [-34.6000, -58.3800], [-34.6000, -58.3750],
    [-34.5980, -58.3750], [-34.5980, -58.3800],
    [-34.6000, -58.3800],
  ];
  const enLaEsquina = [-34.6000, -58.3800];

  const sinAcotar = N.ubicarEnRuta(enLaEsquina, vueltaManzana, 0, 99);
  const acotado = N.ubicarEnRuta(enLaEsquina, vueltaManzana, 3, 1);

  assert.strictEqual(sinAcotar.idx, 0, 'sin acotar cae en el tramo de salida');
  assert.strictEqual(acotado.idx, 3, 'acotado se queda en el tramo de llegada');

  // Y esa confusion es la que arruina la distancia restante:
  const acc = N.acumulados(vueltaManzana);
  const total = acc[acc.length - 1];
  const mal = total - N.recorrido(sinAcotar, acc, vueltaManzana);
  const bien = total - N.recorrido(acotado, acc, vueltaManzana);
  assert.ok(bien < 5, 'acotado deberia dar ~0 de restante, dio ' + bien);
  assert.ok(mal > total * 0.9, 'sin acotar deberia dar el viaje entero');
});

/* -------------------------------------------------------------------------- */
console.log('\nAvance sobre la ruta');

test('los acumulados crecen y arrancan en cero', () => {
  assert.strictEqual(ACC[0], 0);
  for (let i = 1; i < ACC.length; i++) assert.ok(ACC[i] > ACC[i - 1]);
  // 421 + 300 + 334 + 458 metros, calculado tramo por tramo
  casi(ACC[ACC.length - 1], 1513, 40, 'largo total');
});

test('recorrido al inicio es cero y al final es el total', () => {
  const ini = N.ubicarEnRuta(RUTA[0], RUTA);
  casi(N.recorrido(ini, ACC, RUTA), 0, 5);

  const fin = N.ubicarEnRuta(RUTA[RUTA.length - 1], RUTA, 3);
  casi(N.recorrido(fin, ACC, RUTA), ACC[ACC.length - 1], 5);
});

test('la distancia restante nunca es negativa ni crece al avanzar', () => {
  const total = ACC[ACC.length - 1];
  let anterior = Infinity;
  for (let i = 0; i < RUTA.length; i++) {
    const u = N.ubicarEnRuta(RUTA[i], RUTA, Math.max(0, i - 1));
    const restante = total - N.recorrido(u, ACC, RUTA);
    assert.ok(restante >= -5, 'restante negativo: ' + restante);
    assert.ok(restante <= anterior + 5, 'la distancia restante aumento');
    anterior = restante;
  }
});

/* -------------------------------------------------------------------------- */
console.log('\nInstrucciones');

const PASOS = [
  { offset: 0, mensaje: 'Salí hacia el este', maniobra: 'DEPART' },
  { offset: 420, mensaje: 'Girá a la izquierda en Av. Corrientes', maniobra: 'TURN_LEFT' },
  { offset: 1100, mensaje: 'Girá a la derecha en Callao', maniobra: 'TURN_RIGHT' },
  { offset: 1800, mensaje: 'Llegaste a destino', maniobra: 'ARRIVE' },
];

test('la instruccion vigente avanza con el recorrido', () => {
  assert.strictEqual(N.pasoActual(PASOS, 0), 1);
  assert.strictEqual(N.pasoActual(PASOS, 300), 1);
  assert.strictEqual(N.pasoActual(PASOS, 500), 2);
  assert.strictEqual(N.pasoActual(PASOS, 1200), 3);
  assert.strictEqual(N.pasoActual(PASOS, 5000), 3, 'pasado el final se queda en la ultima');
});

test('cada maniobra tiene icono y ninguna queda sin mapear', () => {
  for (const m of Object.keys(N.ICONO_MANIOBRA)) {
    assert.ok(N.iconoManiobra(m).length > 0, 'sin icono: ' + m);
  }
  assert.strictEqual(N.iconoManiobra('MANIOBRA_INVENTADA'), '▲', 'falta el fallback');
});

/* -------------------------------------------------------------------------- */
console.log('\nLocución');

test('los umbrales se adaptan a la velocidad', () => {
  const ciudad = N.umbralesAviso(30);
  const avenida = N.umbralesAviso(60);
  const autopista = N.umbralesAviso(110);
  assert.ok(autopista[0] > avenida[0] && avenida[0] > ciudad[0],
    'a mas velocidad hay que avisar antes');
  for (const u of [ciudad, avenida, autopista]) {
    assert.strictEqual(u.length, 3);
    assert.ok(u[0] > u[1] && u[1] > u[2], 'los umbrales tienen que ir de mayor a menor');
  }
});

test('a 100 km/h el primer aviso da tiempo de reaccionar', () => {
  const primerAviso = N.umbralesAviso(100)[0];
  const segundos = primerAviso / (100 / 3.6);
  assert.ok(segundos >= 30, `solo ${segundos.toFixed(0)} s de anticipacion`);
});

test('la distancia hablada suena a persona', () => {
  assert.strictEqual(N.distanciaHablada(20), null, 'muy cerca: se dice "ahora"');
  assert.strictEqual(N.distanciaHablada(87), '90 metros');
  assert.strictEqual(N.distanciaHablada(340), '350 metros');
  assert.strictEqual(N.distanciaHablada(1240), '1,2 kilómetros');
  assert.strictEqual(N.distanciaHablada(14300), '14 kilómetros');
});

test('la frase se arma bien y en minuscula tras la coma', () => {
  const f = N.fraseManiobra(PASOS[1], 350);
  assert.strictEqual(f, 'En 350 metros, girá a la izquierda en Av. Corrientes');
  assert.strictEqual(N.fraseManiobra(PASOS[1], 15), 'Girá a la izquierda en Av. Corrientes');
});

test('sin mensaje no genera una frase vacia', () => {
  assert.ok(N.fraseManiobra({ mensaje: '' }, 10).length > 0);
});

/* -------------------------------------------------------------------------- */
console.log('\nDesvío');

test('sobre la ruta no marca desvio', () => {
  const e = {};
  assert.strictEqual(N.evaluarDesvio(e, 20, 1000), false);
  assert.strictEqual(e.desdeMs, null);
});

test('un rebote breve del GPS no dispara recalculo', () => {
  const e = {};
  assert.strictEqual(N.evaluarDesvio(e, 90, 1000), false, 'arranca el reloj');
  assert.strictEqual(N.evaluarDesvio(e, 90, 4000), false, 'solo 3 s, todavia no');
  assert.strictEqual(N.evaluarDesvio(e, 20, 5000), false, 'volvio a la ruta');
  assert.strictEqual(e.desdeMs, null, 'el reloj tiene que reiniciarse');
});

test('un desvio sostenido si dispara recalculo', () => {
  const e = {};
  N.evaluarDesvio(e, 120, 1000);
  assert.strictEqual(N.evaluarDesvio(e, 120, 9500), true);
});

/* -------------------------------------------------------------------------- */
console.log('\nCámaras de velocidad');

test('descarta las que no estan sobre el trayecto', () => {
  const camaras = [
    { lat: -34.6037, lon: -58.3793, limite: 60 },   // sobre el primer tramo
    { lat: -34.6120, lon: -58.3793, limite: 60 },   // ~900 m al sur: otra avenida
  ];
  const sobre = N.camarasSobreRuta(camaras, RUTA, ACC);
  assert.strictEqual(sobre.length, 1, 'deberia quedar solo la que esta sobre la ruta');
  assert.strictEqual(sobre[0].limite, 60);
});

test('calcula en que metro del viaje cae cada camara', () => {
  const sobre = N.camarasSobreRuta(
    [{ lat: -34.6037, lon: -58.3793 }], RUTA, ACC);
  casi(sobre[0].offset, 210, 60);
  assert.strictEqual(sobre[0].aviso, false, 'tiene que arrancar sin avisar');
});

test('quedan ordenadas por orden de aparicion', () => {
  const sobre = N.camarasSobreRuta([
    { lat: -34.5980, lon: -58.3745 },
    { lat: -34.6037, lon: -58.3793 },
    { lat: -34.6000, lon: -58.3770 },
  ], RUTA, ACC);
  assert.strictEqual(sobre.length, 3);
  for (let i = 1; i < sobre.length; i++) {
    assert.ok(sobre[i].offset >= sobre[i - 1].offset, 'desordenadas');
  }
});

test('sin camaras devuelve lista vacia, no explota', () => {
  assert.deepStrictEqual(N.camarasSobreRuta([], RUTA, ACC), []);
});

test('si Overpass falla, el viaje sigue', async () => {
  const fetchRoto = () => Promise.reject(new Error('sin red'));
  const r = await N.buscarCamaras(RUTA, fetchRoto);
  assert.deepStrictEqual(r, []);
});

test('parsea la respuesta de Overpass', async () => {
  const fetchFalso = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      elements: [
        { type: 'node', lat: -34.6037, lon: -58.3793, tags: { highway: 'speed_camera', maxspeed: '60' } },
        { type: 'node', lat: -34.6010, lon: -58.3770, tags: { enforcement: 'maxspeed' } },
        { type: 'way', id: 1 },                       // sin lat/lon: se descarta
      ],
    }),
  });
  const r = await N.buscarCamaras(RUTA, fetchFalso);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].limite, 60);
  assert.strictEqual(r[1].limite, null, 'sin tag de limite tiene que quedar en null');
});

/* -------------------------------------------------------------------------- */
console.log('\nPresentación');

test('el zoom se aleja al acelerar', () => {
  assert.ok(N.zoomPorVelocidad(110) < N.zoomPorVelocidad(70));
  assert.ok(N.zoomPorVelocidad(70) < N.zoomPorVelocidad(30));
  assert.ok(N.zoomPorVelocidad(0) <= 19);
});

test('distancia corta en pantalla', () => {
  assert.strictEqual(N.fmtDistanciaCorta(234), '230 m');
  assert.strictEqual(N.fmtDistanciaCorta(1500), '1.5 km');
});

/* -------------------------------------------------------------------------- */
console.log('\nViaje simulado de punta a punta');

/**
 * Recorre la ruta con posiciones sintéticas y corre el mismo bucle que la app.
 * Es la prueba que encuentra los errores que ningún test unitario ve: avisos
 * repetidos, maniobras salteadas, cámaras que avisan tarde.
 */
function simularViaje({ ruidoM = 0, velKmh = 54, pasoM = 15 } = {}) {
  const acc = N.acumulados(RUTA);
  const total = acc[acc.length - 1];

  const camaras = N.camarasSobreRuta(
    [{ lat: -34.6037, lon: -58.3793, limite: 60 },
     { lat: -34.5980, lon: -58.3745, limite: 40 }],
    RUTA, acc);

  const log = { avisos: [], camaras: [], restantes: [], pasos: [] };
  const avisados = {};
  let idxTramo = 0;
  let semilla = 42;
  const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;

  for (let m = 0; m <= total; m += pasoM) {
    // Punto a `m` metros del inicio, sobre la polilínea
    let i = 0;
    while (i < acc.length - 2 && acc[i + 1] < m) i++;
    const t = (m - acc[i]) / Math.max(1, acc[i + 1] - acc[i]);
    const pos = [
      RUTA[i][0] + t * (RUTA[i + 1][0] - RUTA[i][0]) + rnd() * ruidoM / 111320,
      RUTA[i][1] + t * (RUTA[i + 1][1] - RUTA[i][1]) + rnd() * ruidoM / 91600,
    ];

    const u = N.ubicarEnRuta(pos, RUTA, idxTramo);
    idxTramo = u.idx;
    const hecho = N.recorrido(u, acc, RUTA);
    const resta = Math.max(0, total - hecho);
    log.restantes.push(resta);

    const idx = N.pasoActual(PASOS, hecho);
    log.pasos.push(idx);
    const d = Math.max(0, PASOS[idx].offset - hecho);

    // mismo criterio de anuncio que la app
    const umbrales = N.umbralesAviso(velKmh);
    avisados[idx] = avisados[idx] || {};
    for (const th of umbrales) {
      if (d <= th && !avisados[idx][th]) {
        umbrales.forEach(x => { if (x >= d) avisados[idx][x] = true; });
        log.avisos.push({ paso: idx, th, d: Math.round(d) });
        break;
      }
    }

    for (const c of camaras) {
      const dc = c.offset - hecho;
      if (dc > 0 && dc < 400 && !c.aviso) {
        c.aviso = true;
        log.camaras.push({ offset: Math.round(c.offset), d: Math.round(dc) });
      }
    }
  }
  return log;
}

test('el viaje simulado llega hasta el final', () => {
  const l = simularViaje();
  assert.ok(l.restantes[l.restantes.length - 1] < 30,
    'no llego: quedaron ' + l.restantes[l.restantes.length - 1] + ' m');
});

test('la distancia restante nunca aumenta', () => {
  const l = simularViaje();
  for (let i = 1; i < l.restantes.length; i++) {
    assert.ok(l.restantes[i] <= l.restantes[i - 1] + 1,
      `retrocedio en el paso ${i}: ${l.restantes[i - 1]} -> ${l.restantes[i]}`);
  }
});

test('con ruido de GPS tampoco retrocede ni se pierde', () => {
  const l = simularViaje({ ruidoM: 12 });
  assert.ok(l.restantes[l.restantes.length - 1] < 60);
  let retrocesos = 0;
  for (let i = 1; i < l.restantes.length; i++) {
    if (l.restantes[i] > l.restantes[i - 1] + 12) retrocesos++;
  }
  assert.strictEqual(retrocesos, 0, 'hubo ' + retrocesos + ' saltos hacia atras');
});

test('las maniobras se anuncian en orden y sin repetir', () => {
  const l = simularViaje();
  const porPaso = {};
  for (const a of l.avisos) {
    porPaso[a.paso] = porPaso[a.paso] || new Set();
    assert.ok(!porPaso[a.paso].has(a.th),
      `aviso repetido: paso ${a.paso} umbral ${a.th}`);
    porPaso[a.paso].add(a.th);
  }
  const pasosAvisados = Object.keys(porPaso).map(Number).sort((a, b) => a - b);
  assert.ok(pasosAvisados.length >= 2, 'se anunciaron muy pocas maniobras');
});

test('ninguna maniobra queda sin anunciar', () => {
  const l = simularViaje();
  const anunciados = new Set(l.avisos.map(a => a.paso));
  const vistos = new Set(l.pasos);
  for (const p of vistos) {
    assert.ok(anunciados.has(p), 'la maniobra ' + p + ' nunca se anuncio');
  }
});

test('cada cámara avisa una sola vez y antes de pasarla', () => {
  const l = simularViaje();
  assert.strictEqual(l.camaras.length, 2, 'deberian avisar las dos camaras');
  const offs = l.camaras.map(c => c.offset);
  assert.strictEqual(new Set(offs).size, offs.length, 'aviso duplicado');
  for (const c of l.camaras) {
    assert.ok(c.d > 0, 'aviso despues de pasar la camara');
    assert.ok(c.d <= 400, 'aviso demasiado lejos: ' + c.d);
  }
});

test('el paso vigente nunca retrocede', () => {
  const l = simularViaje({ ruidoM: 8 });
  for (let i = 1; i < l.pasos.length; i++) {
    assert.ok(l.pasos[i] >= l.pasos[i - 1],
      `la instruccion volvio atras: ${l.pasos[i - 1]} -> ${l.pasos[i]}`);
  }
});

/* -------------------------------------------------------------------------- */
setTimeout(() => {
  console.log(`\n${ok}/${ok + mal} verificaciones pasaron`);
  process.exit(mal ? 1 : 0);
}, 100);
