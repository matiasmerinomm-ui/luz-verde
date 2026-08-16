/**
 * Verificacion de la logica de la app sin necesidad de red ni de un telefono.
 *
 *     node verificar.js
 *
 * Extrae las funciones puras de www/index.html y las corre contra una respuesta
 * simulada de TomTom armada segun el esquema real de su Routing API. Chequea
 * lo que se rompe en silencio: unidades mal convertidas, campos opcionales que
 * no vienen, indices de tramos fuera de rango, fechas sin offset horario.
 */

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/www/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];

// Traer solo las funciones puras, sin tocar DOM ni Leaflet.
function grab(name) {
  const re = new RegExp(`(?:^|\\n)(function ${name}\\([\\s\\S]*?\\n\\})`, 'm');
  const m = js.match(re);
  if (!m) throw new Error('no se encontro la funcion ' + name);
  return m[1];
}
const src = ['fmtDur', 'fmtDist', 'fmtClock', 'isoLocal', 'parseRoute']
  .map(grab).join('\n');
eval(src + '\nglobalThis._f = {fmtDur, fmtDist, fmtClock, isoLocal, parseRoute};');
const F = globalThis._f;

/* Haversine, para los tests que necesitan distancias reales. */
function distanciaReal(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const x = Math.sin(dLa / 2) ** 2
          + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

let pasaron = 0, fallaron = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok    ' + nombre); pasaron++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallaron++; }
}

/* ------------------------------------------------------------------ */
/* Respuesta simulada, con los campos tal como los documenta TomTom.   */
/* ------------------------------------------------------------------ */
const puntos = Array.from({ length: 40 }, (_, i) => ({
  latitude: -34.60 + i * 0.0012,
  longitude: -58.42 - i * 0.0009,
}));

const RESPUESTA = {
  routes: [{
    summary: {
      lengthInMeters: 12450,
      travelTimeInSeconds: 1580,
      trafficDelayInSeconds: 420,
      trafficLengthInMeters: 3100,
      departureTime: '2026-08-15T18:30:00-03:00',
      arrivalTime: '2026-08-15T18:56:20-03:00',
      noTrafficTravelTimeInSeconds: 1160,
      historicTrafficTravelTimeInSeconds: 1400,
      liveTrafficIncidentsTravelTimeInSeconds: 1580,
    },
    legs: [{ points: puntos }],
    sections: [
      { startPointIndex: 5, endPointIndex: 12, sectionType: 'TRAFFIC',
        simpleCategory: 'JAM', effectiveSpeedInKmh: 11, delayInSeconds: 300,
        magnitudeOfDelay: 3 },
      { startPointIndex: 20, endPointIndex: 24, sectionType: 'TRAFFIC',
        simpleCategory: 'JAM', effectiveSpeedInKmh: 26, delayInSeconds: 120,
        magnitudeOfDelay: 1 },
      { startPointIndex: 0, endPointIndex: 39, sectionType: 'TRAVEL_MODE',
        travelMode: 'car' },
    ],
    guidance: {
      instructions: [
        { message: 'Tomá Av. Rivadavia hacia el oeste', routeOffsetInMeters: 0,
          maneuver: 'DEPART', street: 'Av. Rivadavia',
          point: { latitude: -34.60, longitude: -58.42 } },
        { message: 'Girá a la derecha en Medrano', routeOffsetInMeters: 1800,
          maneuver: 'TURN_RIGHT', street: 'Medrano',
          point: { latitude: -34.598, longitude: -58.415 } },
        { routeOffsetInMeters: 2400, maneuver: 'STRAIGHT' },  // sin mensaje: se descarta
        { message: 'Llegaste a destino', routeOffsetInMeters: 12450,
          maneuver: 'ARRIVE', point: { latitude: -34.56, longitude: -58.39 } },
      ],
    },
  }],
};

/* ------------------------------------------------------------------ */
console.log('\nFormato de duracion y distancia');

test('minutos por debajo de la hora', () => {
  assert.deepStrictEqual(F.fmtDur(1580), { n: '26', u: 'min' });
  assert.deepStrictEqual(F.fmtDur(59), { n: '1', u: 'min' });
});

test('pasa a horas y minutos', () => {
  assert.deepStrictEqual(F.fmtDur(3600), { n: '1 h 00', u: 'min' });
  assert.deepStrictEqual(F.fmtDur(5400), { n: '1 h 30', u: 'min' });
  assert.deepStrictEqual(F.fmtDur(9000), { n: '2 h 30', u: 'min' });
});

test('distancias en metros y kilometros', () => {
  assert.strictEqual(F.fmtDist(340), '340 m');
  assert.strictEqual(F.fmtDist(999), '999 m');
  assert.strictEqual(F.fmtDist(1000), '1.0 km');
  assert.strictEqual(F.fmtDist(12450), '12.5 km');
  assert.strictEqual(F.fmtDist(143000), '143 km');
});

test('reloj con minutos de dos digitos', () => {
  assert.strictEqual(F.fmtClock(new Date(2026, 7, 15, 18, 5)), '18:05');
  assert.strictEqual(F.fmtClock(new Date(2026, 7, 15, 9, 30)), '9:30');
});

/* ------------------------------------------------------------------ */
console.log('\nFecha para salida programada');

test('lleva offset horario, que TomTom exige', () => {
  const s = F.isoLocal(new Date(2026, 7, 15, 18, 30, 0));
  assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    'formato inesperado: ' + s);
});

test('cero a la izquierda en mes y dia', () => {
  const s = F.isoLocal(new Date(2026, 0, 5, 7, 3, 9));
  assert.ok(s.startsWith('2026-01-05T07:03:09'), s);
});

/* ------------------------------------------------------------------ */
console.log('\nParseo de la respuesta de TomTom');

const r = F.parseRoute(RESPUESTA.routes[0]);

test('tiempos y distancia', () => {
  assert.strictEqual(r.seconds, 1580);
  assert.strictEqual(r.meters, 12450);
  assert.strictEqual(r.delay, 420);
  assert.strictEqual(r.jamMeters, 3100);
});

test('tiempo tipico y sin transito para comparar', () => {
  assert.strictEqual(r.typical, 1400);
  assert.strictEqual(r.free, 1160);
  // 1580 vs 1400 tipico -> hoy esta 3 min peor que lo normal
  assert.strictEqual(Math.round((r.seconds - r.typical) / 60), 3);
});

test('geometria completa y en [lat, lon]', () => {
  assert.strictEqual(r.points.length, 40);
  assert.strictEqual(r.points[0][0], -34.60);
  assert.strictEqual(r.points[0][1], -58.42);
  r.points.forEach(([la, lo]) => {
    assert.ok(la >= -90 && la <= 90, 'latitud fuera de rango: ' + la);
    assert.ok(lo >= -180 && lo <= 180, 'longitud fuera de rango: ' + lo);
  });
});

test('solo se quedan los tramos de transito', () => {
  assert.strictEqual(r.sections.length, 2);
  assert.ok(r.sections.every(s => s.sectionType === 'TRAFFIC'));
});

test('los indices de tramo caen dentro de la geometria', () => {
  r.sections.forEach(s => {
    assert.ok(s.startPointIndex >= 0);
    assert.ok(s.endPointIndex < r.points.length,
      `endPointIndex ${s.endPointIndex} >= ${r.points.length} puntos`);
    const seg = r.points.slice(s.startPointIndex, s.endPointIndex + 1);
    assert.ok(seg.length >= 2, 'tramo degenerado, no se puede dibujar');
  });
});

test('instrucciones sin mensaje se descartan', () => {
  assert.strictEqual(r.steps.length, 3);
  assert.ok(r.steps.every(s => typeof s.mensaje === 'string' && s.mensaje.length));
});

test('los pasos traen lo que necesita la guia por voz', () => {
  // Sin maniobra no hay icono; sin offset no se puede saber a que distancia
  // anunciar. Con solo el texto, la navegacion no se puede construir.
  for (const s of r.steps) {
    assert.ok(typeof s.offset === 'number', 'falta offset en: ' + s.mensaje);
    assert.ok(typeof s.maniobra === 'string' && s.maniobra, 'falta maniobra');
  }
  assert.strictEqual(r.steps[0].maniobra, 'DEPART');
  assert.strictEqual(r.steps[1].offset, 1800);
  assert.deepStrictEqual(r.steps[1].punto, [-34.598, -58.415]);
  assert.strictEqual(r.steps[1].calle, 'Medrano');
});

test('si TomTom no manda maniobra, no queda sin icono', () => {
  const sinManiobra = {
    summary: { lengthInMeters: 500, travelTimeInSeconds: 60 },
    legs: [{ points: puntos.slice(0, 5) }],
    guidance: { instructions: [{ message: 'Seguí derecho', routeOffsetInMeters: 0 }] },
  };
  assert.strictEqual(F.parseRoute(sinManiobra).steps[0].maniobra, 'STRAIGHT');
});

test('los offsets de los pasos vienen ordenados', () => {
  for (let i = 1; i < r.steps.length; i++) {
    assert.ok(r.steps[i].offset >= r.steps[i - 1].offset,
      'pasos desordenados: la guia anunciaria maniobras salteadas');
  }
});

test('hora de llegada parseada', () => {
  assert.ok(r.arrival instanceof Date);
  assert.ok(!isNaN(r.arrival.getTime()));
});

/* ------------------------------------------------------------------ */
console.log('\nRespuestas incompletas (el caso que rompe en produccion)');

test('sin campos opcionales no explota', () => {
  const minima = {
    summary: { lengthInMeters: 5000, travelTimeInSeconds: 600 },
    legs: [{ points: puntos.slice(0, 10) }],
  };
  const x = F.parseRoute(minima);
  assert.strictEqual(x.delay, 0);
  assert.strictEqual(x.jamMeters, 0);
  assert.strictEqual(x.typical, null);
  assert.strictEqual(x.free, null);
  assert.strictEqual(x.arrival, null);
  assert.deepStrictEqual(x.sections, []);
  assert.deepStrictEqual(x.steps, []);
  assert.strictEqual(x.points.length, 10);
});

test('varios tramos de recorrido se concatenan', () => {
  const dosLegs = {
    summary: { lengthInMeters: 9000, travelTimeInSeconds: 900 },
    legs: [{ points: puntos.slice(0, 10) }, { points: puntos.slice(10, 25) }],
  };
  assert.strictEqual(F.parseRoute(dosLegs).points.length, 25);
});

test('sin demora informada se muestra calle libre', () => {
  const libre = {
    summary: { lengthInMeters: 5000, travelTimeInSeconds: 600,
               trafficDelayInSeconds: 0, noTrafficTravelTimeInSeconds: 600 },
    legs: [{ points: puntos.slice(0, 8) }],
  };
  const x = F.parseRoute(libre);
  assert.strictEqual(Math.round(x.delay / 60), 0);
});

/* ------------------------------------------------------------------ */
console.log('\nCoherencia de la app');

test('NO hay ninguna API key en el codigo', () => {
  // El repositorio es publico. Una clave commiteada la lee cualquiera y le
  // quema al dueño las 2.500 consultas del dia. Este test es la unica cosa
  // que impide que se cuele por descuido.
  const decl = js.match(/const KEY_EMBEBIDA = '([^']*)'/);
  assert.ok(decl, 'falta la constante KEY_EMBEBIDA');
  assert.strictEqual(decl[1], '',
    'HAY UNA CLAVE COMMITEADA. Vaciá KEY_EMBEBIDA y cargala como secreto ' +
    'TOMTOM_KEY del repositorio, o pasá el repositorio a privado.');

  // Y que no se haya colado ninguna otra por otro lado.
  const sueltas = (js.match(/['"][A-Za-z0-9]{28,}['"]/g) || [])
    .filter(s => !/^['"](https?|data:)/.test(s));
  assert.deepStrictEqual(sueltas, [],
    'cadenas sospechosas de ser una clave: ' + sueltas.join(', '));
});

test('la clave se puede inyectar al compilar', () => {
  // El workflow reemplaza esta linea con sed. Si cambia el formato de la
  // declaracion, la inyeccion falla en silencio y el APK sale sin clave.
  const wf = require('fs').readFileSync(
    __dirname + '/.github/workflows/build-apk.yml', 'utf8');
  const patron = /const KEY_EMBEBIDA = '\[\^'\]\*'/;
  assert.ok(patron.test(wf), 'el workflow no reconoce el formato de la constante');

  // Simulacro del reemplazo, para confirmar que efectivamente engancha.
  const reemplazado = js.replace(
    /const KEY_EMBEBIDA = '[^']*'/, "const KEY_EMBEBIDA = 'CLAVE_INYECTADA'");
  assert.ok(reemplazado.includes("KEY_EMBEBIDA = 'CLAVE_INYECTADA'"),
    'el reemplazo del workflow no engancharia');
});

test('lo guardado en el telefono tiene prioridad sobre lo embebido', () => {
  assert.ok(/localStorage\.getItem\('tt_key'\)\s*\|\|\s*KEY_EMBEBIDA/.test(js),
    'si la embebida pisa a la guardada, cambiar la clave desde la app no sirve');
});

test('se puede cambiar la clave sin recompilar', () => {
  assert.ok(js.includes("localStorage.removeItem('tt_key')"),
    'no hay forma de resetear la clave desde la app');
});

test('los tres endpoints se usan y van por https', () => {
  assert.ok(/const TT = 'https:\/\/api\.tomtom\.com'/.test(js), 'la base no es https');
  assert.ok(!/http:\/\/api\.tomtom\.com/.test(js), 'hay una llamada sin cifrar');
  for (const ep of ['/search/2/search/', '/search/2/reverseGeocode/',
                    '/routing/1/calculateRoute/']) {
    assert.ok(js.includes('${TT}' + ep), 'falta el endpoint ' + ep);
  }
});

test('se pide el transito en vivo y el tipico', () => {
  assert.ok(/traffic: M\.transito \? 'true' : 'false'/.test(js),
    'el tránsito tiene que pedirse según el modo de viaje');
  assert.ok(/computeTravelTimeFor:\s*'all'/.test(js), 'falta computeTravelTimeFor=all');
  assert.ok(/p\.append\('sectionType', 'traffic'\)/.test(js), 'falta sectionType=traffic');
});

test('a pie y en bici no se pide transito vehicular', () => {
  // Pedirlo igual devuelve tiempos calculados para autos, disfrazados de
  // caminata. Es peor que no tener el dato.
  const f = js.match(/const MODOS = \[([\s\S]*?)\];/)[1];
  assert.ok(/id: 'pedestrian',[\s\S]{0,80}transito: false/.test(f), 'a pie con tránsito');
  assert.ok(/id: 'bicycle',[\s\S]{0,80}transito: false/.test(f), 'bici con tránsito');
  assert.ok(/id: 'car',[\s\S]{0,80}transito: true/.test(f), 'auto sin tránsito');
});

test('caminando no se piden camaras ni limites', () => {
  const f = js.match(/function cargarRutaEnNav\([\s\S]*?\n\}/)[0];
  assert.ok(/if \(!modoActual\(\)\.transito\) return;/.test(f),
    'avisar de cámaras de velocidad yendo a pie es ruido, y gasta la consulta');
});

test('los cuatro modos existen y se guardan', () => {
  const ids = [...js.matchAll(/id: '(car|motorcycle|bicycle|pedestrian)'/g)].map(m => m[1]);
  assert.deepStrictEqual(ids, ['car', 'motorcycle', 'bicycle', 'pedestrian']);
  assert.ok(/localStorage\.setItem\('tt_modo'/.test(js), 'el modo no se recuerda');
});

test('hay refresco automatico del ETA', () => {
  assert.ok(/setInterval/.test(js), 'el ETA quedaria congelado');
});

test('el mapa se reencuadra en el orden correcto', () => {
  // Regresion de un bug real: se dibujaba la ruta antes de llenar el panel.
  // Al llenarse, el panel crecia y le comia alto al mapa, pero Leaflet seguia
  // con el tamano viejo cacheado: el encuadre quedaba calculado para un
  // contenedor inexistente y el origen del viaje se salia de la pantalla.
  const fn = js.match(/function refresh\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fn, 'falta la funcion refresh()');
  const cuerpo = fn[1];
  assert.ok(cuerpo.indexOf('render()') < cuerpo.indexOf('draw()'),
    'refresh() tiene que llamar render() antes que draw()');

  const dibujo = js.match(/function draw\(\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.ok(dibujo.includes('invalidateSize'), 'draw() no revalida el tamano');
  assert.ok(dibujo.indexOf('invalidateSize') < dibujo.indexOf('fitBounds'),
    'invalidateSize tiene que ir antes de fitBounds');
});

test('no quedan llamadas sueltas a draw/render fuera de refresh', () => {
  const sueltas = (js.match(/draw\(\);\s*render\(\)|render\(\);\s*draw\(\)/g) || [])
    .filter(x => !x.includes('\n'));
  // render();draw() dentro de refresh() es el unico permitido
  assert.ok(sueltas.length <= 1,
    'hay llamadas encadenadas fuera de refresh(): ' + sueltas.join(' | '));
});

test('la congestion se mide en segundos por km, no con el enum de TomTom', () => {
  // magnitudeOfDelay 0 significa "desconocido", no "leve" — usarlo como escala
  // pinta de amarillo tramos de los que no se sabe nada. Y TomTom no publica a
  // cuantos segundos equivale cada nivel, asi que no es explicable.
  assert.ok(!/const JAM\b/.test(js), 'quedo la escala vieja basada en el enum');
  const esc = js.match(/const ESCALA_DEMORA = \[([\s\S]*?)\];/);
  assert.ok(esc, 'falta ESCALA_DEMORA');

  const umbrales = [...esc[1].matchAll(/hasta:\s*([\d.]+|Infinity)/g)]
    .map(m => (m[1] === 'Infinity' ? Infinity : +m[1]));
  assert.ok(umbrales.length >= 3, 'muy pocos niveles');
  for (let i = 1; i < umbrales.length; i++) {
    assert.ok(umbrales[i] > umbrales[i - 1], 'los umbrales tienen que ir creciendo');
  }
  assert.strictEqual(umbrales[umbrales.length - 1], Infinity,
    'el ultimo nivel tiene que atrapar todo, si no hay demoras sin color');
});

test('un corte de calle no se calcula por segundos', () => {
  const f = js.match(/function clasificarDemora\([\s\S]*?\n\}/)[0];
  assert.ok(/magnitudeOfDelay === 4/.test(f),
    'el 4 es cierre de calle: ahi el calculo por segundos no aplica');
});

test('las demoras insignificantes no se pintan', () => {
  const f = js.match(/function clasificarDemora\([\s\S]*?\n\}/)[0];
  assert.ok(/return null/.test(f),
    'pintar de amarillo una demora de 5 segundos es ruido visual');
  assert.ok(/metros < 40/.test(f),
    'un tramo de 20 m da segundos-por-km enormes por division chica');
});

/* ------------------------------------------------------------------ */
console.log('\nNavegación conectada');

test('la app es un unico archivo autocontenido', () => {
  // Regresion real: el motor de navegacion vivia en nav.js. Abriendo el HTML
  // desde WhatsApp (content://) o con doble clic (file://), esa ruta relativa
  // no resuelve y la navegacion desaparecia sin ningun error visible.
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const relativos = srcs.filter(s => !/^https?:\/\//.test(s));
  assert.deepStrictEqual(relativos, [],
    'hay scripts con ruta relativa: no cargan desde file:// ni content:// -> ' + relativos);
});

test('el motor de navegacion esta embebido y antes del script principal', () => {
  const i = html.indexOf('=== MOTOR DE NAVEGACION');
  assert.ok(i > 0, 'falta el bloque del motor');
  assert.ok(i < html.lastIndexOf('<script>'), 'el motor tiene que definirse antes');
});

test('las etiquetas de script abren y cierran parejo', () => {
  const abren = (html.match(/<script[ >]/g) || []).length;
  const cierran = (html.match(/<\/script>/g) || []).length;
  assert.strictEqual(abren, cierran,
    `${abren} aperturas contra ${cierran} cierres: hay una etiqueta suelta, ` +
    'probablemente dentro de un comentario');
});

test('todos los ids que usa el script existen en el HTML', () => {
  const definidos = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const usados = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  const faltan = [...usados].filter(id => !definidos.has(id));
  assert.deepStrictEqual(faltan, [], 'ids inexistentes: ' + faltan.join(', '));
});

test('el boton Iniciar dispara el viaje', () => {
  assert.ok(html.includes('id="btnIniciar"') || js.includes('btnIniciar'),
    'falta el boton de iniciar');
  assert.ok(/\$\('btnIniciar'\)\.onclick\s*=\s*\(\)\s*=>\s*iniciarViaje\(\)/.test(js),
    'el boton no llama a iniciarViaje');
});

test('navegando, el mapa no se reencuadra solo', () => {
  const dibujo = js.match(/function draw\(\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.ok(dibujo.includes('if (NAV.on) return'),
    'draw() le arrebataria la camara al conductor en cada posicion');
});

test('navegando, no corre el refresco de planificacion', () => {
  const f = js.match(/function scheduleRefresh\(\)\s*\{([\s\S]*?)\n\}/)[1];
  assert.ok(f.includes('NAV.on'),
    'un recalculo de fondo le cambiaria la ruta abajo de los pies');
});

test('salir del viaje libera GPS, voz y pantalla', () => {
  const f = js.match(/function terminarViaje\([\s\S]*?\n\}/)[0];
  assert.ok(/clearWatch/.test(f), 'queda el GPS prendido comiendo bateria');
  assert.ok(/callarVoz\(\)/.test(f), 'queda hablando');
  assert.ok(/mantenerPantalla\(false\)/.test(f), 'queda la pantalla encendida');
});

test('la pantalla se mantiene encendida durante el viaje', () => {
  assert.ok(js.includes("wakeLock.request('screen')"), 'falta el Wake Lock');
  // Android suelta el bloqueo al pasar a segundo plano: hay que recuperarlo.
  assert.ok(/if \(NAV\.on\) \{ mantenerPantalla\(true\)/.test(js),
    'no se recupera el bloqueo al volver a la app');
});

/** Quita comentarios de línea: si no, un comentario que nombra una función
 *  altera el orden aparente de las llamadas y arruina los tests de secuencia. */
function soloCodigo(txt) {
  return txt.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
}

test('el GPS continuo usa el plugin nativo y pide permiso antes', () => {
  const f = soloCodigo(js.match(/async function seguirPosicion\(\)[\s\S]*?\n\}/)[0]);
  assert.ok(/geoNativo\(\)/.test(f) && /watchPosition/.test(f),
    'dentro del APK el seguimiento fallaria sin el plugin nativo');
  assert.ok(f.indexOf('pedirPermisoUbicacion') < f.indexOf('watchPosition'),
    'el permiso tiene que pedirse ANTES de arrancar el seguimiento: si no, ' +
    'watchPosition no falla, simplemente nunca llama de vuelta y la pantalla ' +
    'queda en "Buscando señal" para siempre');
});

test('el plugin se obtiene por el puente nativo, no solo de Capacitor.Plugins', () => {
  // Sin empaquetador, Capacitor.Plugins.Geolocation puede no existir. Si solo
  // se lee de ahi, la app cae a navigator.geolocation, que dentro del WebView
  // deniega sin mostrar el dialogo de Android.
  const f = js.match(/function geoNativo\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/plugin\('Geolocation'\)/.test(f),
    'falta pedirlo por el puente nativo: sin bundler es la unica via');
});

test('ninguna llamada a un plugin puede matar la app', () => {
  // La causa de un fallo real: Capacitor NUNCA falla al registrar un plugin,
  // aunque no este instalado. Devuelve un proxy que revienta al usarlo, y esa
  // excepcion mata el resto del script. Resultado: app entera muerta, sin
  // ninguna pista. Por eso todo pasa por plugin() y llamarPlugin().
  const llamadas = [...js.matchAll(/\.registerPlugin\(/g)];
  assert.strictEqual(llamadas.length, 1,
    `registerPlugin se llama ${llamadas.length} veces; solo plugin() puede hacerlo`);
  // Y esa única llamada tiene que estar dentro de plugin().
  const dentro = js.match(/function plugin\([\s\S]*?\n\}/)[0];
  assert.ok(/\.registerPlugin\(/.test(dentro),
    'la llamada quedó fuera de plugin()');

  for (const f of ['plugin', 'llamarPlugin']) {
    const cuerpo = js.match(new RegExp(`function ${f}\\([\\s\\S]*?\\n\\}`))[0];
    assert.ok(/try/.test(cuerpo) && /catch/.test(cuerpo), f + '() no atrapa errores');
  }
});

test('los plugins que se usan estan declarados como dependencia', () => {
  // Se pueden pedir plugins no instalados sin romper, pero entonces la funcion
  // simplemente no existe. Si la app la necesita, tiene que estar en package.json.
  const pkg = JSON.parse(require('fs').readFileSync(__dirname + '/package.json', 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const usados = [...js.matchAll(/plugin\('(\w+)'\)/g)].map(m => m[1]);

  const nativo = { Geolocation: '@capacitor/geolocation', App: '@capacitor/app' };
  for (const u of new Set(usados)) {
    if (nativo[u]) {
      assert.ok(deps.includes(nativo[u]),
        `se usa el plugin ${u} pero falta ${nativo[u]} en package.json`);
    }
  }
});

test('hay una salida visible cuando falta el permiso', () => {
  assert.ok(/function navSinPermiso\(\)/.test(js),
    'sin esto el usuario ve "Buscando señal" y no sabe que el problema es el permiso');
  const f = js.match(/function navSinPermiso\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/pedirPermisoUbicacion/.test(f), 'el boton tiene que reintentar el permiso');
});

test('el desvio se evalua contra el reloj, no de golpe', () => {
  assert.ok(/evaluarDesvio\(NAV\.desvio, u\.metros, Date\.now\(\)\)/.test(js),
    'sin sostener el desvio en el tiempo, cada rebote del GPS recalcula');
});

test('las camaras se piden una vez por ruta, no por posicion', () => {
  const enBucle = js.match(/function pintarNav\([\s\S]*?\n\}/)[0];
  assert.ok(!enBucle.includes('buscarCamaras'),
    'consultar Overpass en cada posicion es abuso del servicio y va a fallar');
  assert.ok(js.match(/function cargarRutaEnNav\([\s\S]*?\n\}/)[0].includes('buscarCamaras'));
});

/* ------------------------------------------------------------------ */
console.log('\nVoz');

test('se puede elegir entre las voces del telefono', () => {
  const f = js.match(/function cargarVoces\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/filter\(v => \/\^es\/i\.test\(v\.lang\)\)/.test(f),
    'tiene que ofrecer todas las voces en español, no solo una');
  const o = js.match(/function ordenarVoces\(vs\)[\s\S]*?\n\}/)[0];
  assert.ok(/sort\(/.test(o), 'las rioplatenses deberian ir primero');
  assert.ok(/vistas\.has/.test(o), 'Android repite la misma voz por cada motor');
  assert.ok(/localStorage\.getItem\('tt_vozNombre'\)/.test(js),
    'la voz elegida tiene que sobrevivir al cierre de la app');
});

test('las voces se recargan cuando Android las entrega', () => {
  // En Android getVoices() devuelve vacio en el primer llamado. Sin este
  // evento quedaria siempre la voz por defecto y el selector vacio.
  assert.ok(/speechSynthesis\.onvoiceschanged = cargarVoces/.test(js),
    'falta reaccionar a onvoiceschanged');
});

test('la velocidad de la voz es configurable y se guarda', () => {
  assert.ok(/u\.rate = velocidadVoz/.test(js), 'la velocidad esta fija en el codigo');
  assert.ok(/localStorage\.setItem\('tt_vozVel'/.test(js), 'no se guarda la preferencia');
});

test('sin ninguna voz lo dice en vez de fallar callado', () => {
  const f = js.match(/function pintarSelectorVoz\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/No hay voces disponibles/.test(f),
    'si no hay ni paquetes ni voces del sistema, el usuario tiene que enterarse');
  assert.ok(/Texto a voz/.test(f),
    'sin voces, el usuario necesita saber donde conseguirlas');
});

test('las voces se muestran con nombre, no con codigo de pais', () => {
  const f = js.match(/function pintarSelectorVoz\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/nombrarVoces\(ofrecidas\)/.test(f), 'el selector no usa los nombres');
  assert.ok(!/Estados Unidos|Argentina/.test(f),
    'un codigo de pais no le dice nada a nadie; un nombre se recuerda');
});

/* El nombre tiene que coincidir con la voz. Se corre generoVoz y nombrarVoces
   de verdad, contra los nombres tal como los publican los motores reales. */
{
  // Todo el bloque de nombres junto, tal cual esta en la app: las expresiones
  // regulares de nombres de pila viven en el mismo scope que generoVoz.
  const bloque = js.match(
    /const VOZ_FEM[\s\S]*?function nombrarVoces\([\s\S]*?\n\}/)[0];
  const V = new Function(bloque +
    '\nreturn {generoVoz, nombrarVoces, VOZ_FEM, VOZ_MASC, VOZ_NEUTRO};')();
  const { generoVoz: g, nombrarVoces: nombrar, VOZ_FEM, VOZ_MASC, VOZ_NEUTRO } = V;
  const v = (name, uri) => ({ name, voiceURI: uri || name });

  test('el genero se lee del nombre tecnico de Android', () => {
    assert.strictEqual(g(v('es-us-x-sfb#female_1-local')), 'f');
    assert.strictEqual(g(v('es-es-x-eed#male_2-local')), 'm');
  });

  test('"female" no se confunde con "male"', () => {
    // "female" contiene "male": si se chequea al reves, toda mujer es varon.
    assert.strictEqual(g(v('Spanish female voice')), 'f');
  });

  test('el genero se lee del nombre de pila en Windows', () => {
    assert.strictEqual(g(v('Microsoft Sabina - Spanish (Mexico)')), 'f');
    assert.strictEqual(g(v('Microsoft Pablo - Spanish (Spain)')), 'm');
    assert.strictEqual(g(v('Microsoft Helena - Spanish (Spain)')), 'f');
    assert.strictEqual(g(v('Microsoft Raul - Spanish (Mexico)')), 'm');
  });

  test('sin ninguna pista no se adivina', () => {
    assert.strictEqual(g(v('es-AR-Neural')), '?');
  });

  test('a cada voz le toca un nombre de su genero', () => {
    const vs = [v('es-us-x-sfb#female_1-local'), v('Microsoft Pablo'),
                v('es-AR-Neural'), v('Microsoft Sabina')];
    const n = nombrar(vs);
    assert.ok(VOZ_FEM.includes(n[0]), n[0] + ' no es nombre de mujer');
    assert.ok(VOZ_MASC.includes(n[1]), n[1] + ' no es nombre de varon');
    assert.ok(VOZ_NEUTRO.includes(n[2]), n[2] + ' deberia servir para los dos');
    assert.ok(VOZ_FEM.includes(n[3]), n[3] + ' no es nombre de mujer');
  });

  test('no se repite un nombre en la lista', () => {
    const vs = ['female_1', 'female_2', 'female_3', 'male_1', 'male_2', 'x', 'y']
      .map(s => v('es-us-x-abc#' + s + '-local'));
    const n = nombrar(vs);
    assert.strictEqual(new Set(n).size, n.length, 'nombres repetidos: ' + n);
  });

  test('con mas voces que nombres nadie queda sin etiqueta', () => {
    const n = nombrar(Array.from({ length: 30 }, (_, i) => v('voz' + i)));
    assert.ok(n.every(x => typeof x === 'string' && x.length), 'hay un hueco');
    assert.strictEqual(new Set(n).size, 30, 'se repitieron al desbordar');
  });
}

test('el selector de voz no lleva parrafo explicativo', () => {
  // Al lado esta el boton de prueba: escuchar la voz explica mas que un texto.
  const f = js.match(/function pintarSelectorVoz\(\)[\s\S]*?\n\}/)[0];
  // El instructivo solo vale cuando no hay ninguna voz. Con voces cargadas es
  // ruido: se mira la lista, se toca "Escuchar una prueba" y listo.
  const conVoces = f.slice(f.indexOf("sel.disabled = false"));
  assert.ok(conVoces.length > 50, 'no se encontro la rama con voces');
  assert.ok(!/Administracion general|Administración general/.test(conVoces),
    'volvio el instructivo de Android abajo del selector');
});

test('el cartel de "no hay voces" si se muestra', () => {
  // El unico caso donde hace falta texto: no hay nada para elegir y hay que
  // ir a instalar voces. Si quedara oculto, el selector aparece vacio y mudo.
  const f = js.match(/function pintarSelectorVoz\(\)[\s\S]*?\n\}/)[0];
  const corte = f.indexOf('No hay voces disponibles');
  assert.ok(corte > 0, 'no esta el caso sin voces');
  assert.ok(/ayuda\.style\.display = ''/.test(f.slice(corte, corte + 300)),
    'el cartel queda escondido justo cuando hace falta');
});

console.log('\nIconos, tema y peajes');

test('ningun recurso de la app cuelga de una ruta relativa', () => {
  // Dentro del APK y abierto desde WhatsApp con content://, "../assets/x.png"
  // no resuelve y queda el cuadrito roto. Pasó con el icono de los ajustes.
  const malos = [...html.matchAll(/(?:src|href)="(\.\.?\/[^"]*)"/g)].map(m => m[1]);
  assert.deepStrictEqual(malos, [], 'rutas relativas: ' + malos.join(', '));
});

test('el icono de la marca va dibujado en el HTML', () => {
  assert.ok(/<svg class="marcaIcono"/.test(html), 'no está el SVG del icono');
});

test('el modo oscuro cambia toda la paleta, no solo el mapa', () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const b = css.match(/body\.tema-oscuro\{([\s\S]*?)\}/);
  assert.ok(b, 'no existe el bloque body.tema-oscuro');
  for (const v of ['--bg', '--card', '--card2', '--line', '--txt', '--dim',
                   '--flotante', '--tenue', '--suave', '--mapa-fondo']) {
    assert.ok(b[1].includes(v + ':'), 'falta redefinir ' + v);
  }
});

test('no quedan colores escritos a mano donde hay variable', () => {
  // Se miran las reglas, no las declaraciones: en :root y en body.tema-oscuro
  // los colores literales son justamente el punto.
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const reglas = css
    .replace(/:root\{[\s\S]*?\n\}/, '')
    .replace(/body\.tema-oscuro\{[\s\S]*?\n\}/, '');
  for (const c of ['#9ab3a5', '#8aa697', '#e7f6ec', '#c3d8ca', 'rgba(255,255,255,.96)']) {
    assert.ok(!reglas.includes(c), c + ' sigue fijo: en oscuro no va a cambiar');
  }
});

test('el mapa oscuro levanta los negros', () => {
  const f = html.match(/\.tema-oscuro \.leaflet-tile\{\s*filter:([^;]*);/)[1];
  // brightness no alcanza: negro por cualquier factor sigue siendo negro.
  // Hace falta contrast<1, que suma un offset y despega el fondo del negro.
  const c = parseFloat((f.match(/contrast\(([\d.]+)\)/) || [])[1]);
  assert.ok(c > 0 && c < 1, 'sin contrast<1 el fondo sigue casi negro');
  assert.ok(/hue-rotate\(\d+deg\)/.test(f), 'sin hue-rotate no hay azul');
});

test('Overpass tambien pide las cabinas de peaje', () => {
  assert.ok(/"barrier"="toll_booth"/.test(js), 'no se consultan las cabinas');
  assert.ok(/tramosPeaje/.test(js), 'no se guarda el tramo tarifado de TomTom');
});

test('las cabinas se descartan si mientras tanto cambio la ruta', () => {
  const f = js.match(/function asegurarPeajes\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/if \(clave !== S\.peajesClave\) return;/.test(f),
    'una respuesta vieja pintaria peajes de otro trayecto');
});

{
  const fuente = js.match(/(function tiempoHasta[\s\S]*?\n\})/)[1];
  const conVel = v => new Function('NAV', fuente + '\nreturn tiempoHasta;')({ velRef: v });
  const t = conVel(11);            // ~40 km/h

  test('el tiempo parcial usa la velocidad de referencia', () => {
    assert.strictEqual(t(11 * 60), '1 min');
    assert.strictEqual(t(11 * 60 * 8), '8 min');
  });

  test('el tiempo parcial se calla cuando no aporta', () => {
    assert.strictEqual(t(80), null, 'a 80 m no hace falta un tiempo');
    assert.strictEqual(t(0), null);
    assert.strictEqual(t(NaN), null);
  });

  test('con velocidad cero no devuelve infinito', () => {
    // Parado en un semaforo la instantanea es 0. Si el calculo la usara, el
    // cartel diria "Infinity min" justo cuando lo estas mirando.
    assert.strictEqual(conVel(0)(5000), null);
  });

  test('pasa a horas en trayectos largos', () => {
    assert.strictEqual(t(11 * 60 * 95), '1 h 35');
  });
}

test('los tres vehiculos existen y giran sobre el mismo punto', () => {
  const b = js.match(/const VEHICULOS = \[([\s\S]*?)\n\];/)[1];
  const ids = [...b.matchAll(/^  \['(\w+)'/gm)].map(m => m[1]);
  assert.deepStrictEqual(ids, ['flecha', 'auto', 'camioneta']);
  // Mismo viewBox para los tres: con otro, al girar describiria una orbita
  // alrededor del ancla en vez de girar sobre si mismo.
  const cajas = [...b.matchAll(/viewBox="([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(cajas.length, 3);
  assert.ok(cajas.every(c => c === cajas[0]), 'viewBox distintos: ' + cajas);
  assert.ok(/iconAnchor: \[38, 44\]/.test(js), 'el ancla no coincide con el dibujo');
});

test('el vehiculo elegido se ve sin reiniciar el viaje', () => {
  const i = js.indexOf('function pintarVehiculoAjustes');
  const f = js.slice(i, js.indexOf('function pintarEvitarAjustes', i));
  assert.ok(/NAV\.marker\.setIcon\(iconoVehiculo\(\)\)/.test(f),
    'habria que salir a la calle para saber como quedo');
  assert.ok(/localStorage\.setItem\('tt_vehiculo'/.test(f), 'no se recuerda la eleccion');
});

test('la voz no depende de la Web Speech API', () => {
  // Diagnostico corregido: el WebView de Android NO implementa speechSynthesis.
  // No es que devuelva la lista vacia; el objeto no existe. Por eso la app
  // hablaba en la computadora y estaba muda en el telefono.
  assert.ok(/plugin\('TextToSpeech'\)/.test(js), 'falta el motor nativo');
  const f = js.match(/function hablarSistema\(texto\)[\s\S]*?\n\}/)[0];
  const nativo = f.indexOf('ttsNativo');
  const web = f.indexOf('SpeechSynthesisUtterance');
  assert.ok(nativo > 0 && web > 0, 'tienen que estar los dos caminos');
  assert.ok(nativo < web, 'en el telefono manda el motor de Android');
});

test('siempre se puede elegir alguna voz', () => {
  const f = js.match(/function vocesOfrecidas\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/hayWebSpeech\(\) \|\| esNativo\(\) \|\| !ttsRevisado/.test(f),
    'dentro del APK diria "no hay voces" antes de preguntarle a Android');
});

test('cortar la voz sirve para los dos motores', () => {
  const f = js.match(/function callarVoz\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/TTS, 'stop'/.test(f), 'el motor nativo sigue hablando');
  assert.ok(/speechSynthesis\.cancel/.test(f), 'el del navegador sigue hablando');
});

test('el plugin de voz esta declarado como dependencia', () => {
  const pkg = JSON.parse(fs.readFileSync(__dirname + '/package.json', 'utf8'));
  assert.ok(pkg.dependencies['@capacitor-community/text-to-speech'],
    'sin la dependencia, registerPlugin devuelve un proxy que revienta al usarlo');
});

test('nada se usa antes de declararse', () => {
  // Ya rompio la app entera dos veces: un `const` declarado mas abajo del
  // punto donde corre el arranque tira ReferenceError y mata el script.
  const decl = js.indexOf('const VOZ_FEM');
  const uso = js.indexOf('cargarVoces();');
  assert.ok(decl > 0 && uso > 0);
  assert.ok(decl < uso, 'VOZ_FEM se declara despues de que cargarVoces() lo necesito');
});

test('el panel de resultados se puede plegar', () => {
  // Desplegado tapa media pantalla justo cuando queres mirar la ruta.
  assert.ok(/id="grab"/.test(html), 'la manija tiene que ser un boton, no un div');
  assert.ok(/#panel\.min/.test(html), 'falta el estado plegado en el CSS');
  const f = js.match(/function plegarPanel\(min\)[\s\S]*?\n\}/)[0];
  assert.ok(/invalidateSize/.test(f),
    'sin esto el mapa queda encuadrado para el alto viejo');
  assert.ok(/fitBounds/.test(f), 'la ruta tiene que reencuadrarse al ganar espacio');
});

test('la manija distingue un toque de un arrastre', () => {
  const f = js.slice(js.indexOf('function activarManija'),
                     js.indexOf('function refresh()'));
  assert.ok(f.length > 200, 'no se encontro la funcion');
  assert.ok(/Math\.abs\(movido\) < 12/.test(f),
    'sin umbral, cualquier temblor del dedo cuenta como arrastre');
  assert.ok(/pointerdown/.test(f) && /pointerup/.test(f),
    'pointer events y no touch: asi anda igual con mouse y con dedo');
});

test('la manija se conecta al arrancar', () => {
  assert.ok(/function start\(\)\s*\{\s*activarManija\(\);/.test(js),
    'el boton existiria pero no haria nada');
});

test('los peajes de una misma plaza cuentan como uno', () => {
  // OpenStreetMap mapea cada casilla por separado: una plaza de seis carriles
  // son seis nodos. Sin agrupar, un peaje se ve como tres. Paso.
  const agrupar = new Function('distancia',
    js.match(/(function agruparPeajes\([\s\S]*?\n\})/)[1] + '\nreturn agruparPeajes;')
    (F.distancia || distanciaReal);

  // Una plaza: seis casillas a metros una de otra, misma coordenada gruesa.
  const plaza = [[-34.5000, -58.6000], [-34.5001, -58.6001], [-34.5002, -58.6003]];
  // La cabina de la mano contraria, a 40 m: es la MISMA plaza.
  const contraria = [[-34.50035, -58.60005]];
  // Y una plaza de verdad distinta, a varios kilómetros.
  const lejos = [[-34.5400, -58.6400]];
  const arma = (ll, i) => ({ lat: ll[0], lon: ll[1], offset: i * 137 });
  const todas = [...plaza, ...contraria, ...lejos].map(arma);

  const r = agrupar(todas);
  assert.strictEqual(r.length, 2,
    'quedaron ' + r.length + ' peajes donde hay 2 plazas');
});

test('el punteado amarillo del peaje ya no se dibuja', () => {
  assert.ok(!/dashArray: '2 13'/.test(js), 'volvio el rayado sobre la ruta');
  assert.ok(/tramosPeaje/.test(js), 'el dato se sigue guardando por las dudas');
});

test('te ves en el mapa antes de buscar nada', () => {
  const f = js.match(/function pintarMiUbicacion\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/NAV\.on/.test(f), 'navegando, el punto se pisa con el vehiculo');
  assert.ok(/marcadorYo/.test(js) && !/S\.markers\.push\(marcadorYo/.test(js),
    'si entra en S.markers, el proximo draw() lo borra');
  assert.ok(/pintarMiUbicacion\(\);\n    if \(S\.to\) route\(\);/.test(js)
         || /pintarMiUbicacion\(\)/.test(js.slice(js.indexOf('async function locate'),
                                                   js.indexOf('$(\'gpsBtn\')'))),
    'al ubicarse no se pinta');
});

test('tocar el mapa pone el destino', () => {
  const f = js.match(/function conectarToquesDelMapa\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/map\.on\('click'/.test(f), 'falta el toque simple');
  assert.ok(/map\.on\('contextmenu'/.test(f),
    'sin mantener apretado no hay forma de cambiar el destino con una ruta puesta');
  assert.ok(/if \(S\.routes\.length\) return;/.test(f),
    'con ruta dibujada el toque simple sirve para elegir alternativa: chocarian');
  assert.ok((f.match(/if \(NAV\.on\) return;/g) || []).length === 2,
    'manejando, un toque al mapa no puede cambiarte el destino');
});

test('el destino del mapa no espera al nombre de la calle', () => {
  const f = js.match(/async function destinoDesdeMapa[\s\S]*?\n\}/)[0];
  assert.ok(f.indexOf('irA(punto)') < f.indexOf('await reverse'),
    'la ruta tiene que salir ya; el nombre puede llegar despues');
});

test('el manifiesto declara que abrimos ubicaciones compartidas', () => {
  const w = fs.readFileSync(__dirname + '/.github/workflows/build-apk.yml', 'utf8');
  assert.ok(/herramientas\/intent-filters\.py/.test(w),
    'sin este paso la app no aparece en "Abrir con"');
  const py = fs.readFileSync(__dirname + '/herramientas/intent-filters.py', 'utf8');
  for (const h of ['maps.app.goo.gl', 'goo.gl', 'maps.google.com', '"geo"']) {
    assert.ok(py.includes(h), 'falta el formato ' + h);
  }
  // El proyecto android/ se regenera en cada build: el script tiene que poder
  // correr dos veces sin duplicar los filtros.
  assert.ok(/if 'maps\.app\.goo\.gl' in m:/.test(py), 'no es idempotente');
});

test('la voz dice por que no suena', () => {
  // Dos arreglos a ciegas y dos diagnosticos equivocados: llamarPlugin se
  // traga los errores del plugin. Sin este texto seguimos adivinando.
  assert.ok(/let diagVoz = /.test(js), 'falta el diagnostico');
  const f = js.match(/function cargarVocesNativas\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/\.catch\(/.test(f), 'un rechazo del plugin se pierde en silencio');
  assert.ok(!/llamarPlugin\(TTS, 'getSupportedVoices'\)/.test(js),
    'llamarPlugin borra el motivo del error justo donde hace falta');
  const sel = js.match(/function pintarSelectorVoz\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/diagVoz/.test(sel), 'el diagnostico no se ve en ningun lado');
});

test('hablar reintenta con otro idioma antes de rendirse', () => {
  // es-AR no viene instalado en todos los telefonos aunque es-ES si. Con un
  // solo intento, el motor rechaza y la app se queda muda sin decir nada.
  const f = js.match(/function hablarNativo\(texto\)[\s\S]*?\n\}/)[0];
  assert.ok(/'es-ES'/.test(f) && /'es-US'/.test(f), 'faltan idiomas de respaldo');
  assert.ok(/probar\(i \+ 1\)/.test(f), 'no encadena los intentos');
  assert.ok(/intentos\.push\(\{\}\)|, \{\}\)/.test(f),
    'falta el ultimo intento sin idioma, que es el que casi siempre anda');
});

test('se intenta hablar aunque no se puedan enumerar las voces', () => {
  const f = js.match(/function hablarSistema\(texto\)[\s\S]*?\n\}/)[0];
  assert.ok(/ttsNativo \|\| esNativo\(\)/.test(f),
    'que no sepamos listar las voces no significa que no sepa hablar');
});

test('un link pegado con el teclado de Android tambien se lee', () => {
  // Pegar desde la barra de sugerencias no dispara el evento paste: el texto
  // aparece en el campo y no pasa nada. Asi quedaba el link escrito y sin ruta.
  assert.ok(/toInput'\)\.addEventListener\('input'/.test(js),
    'solo se escucha paste, que en Android no siempre llega');
  const f = js.match(/async function atenderTextoDestino[\s\S]*?\n\}/)[0];
  assert.ok(/leyendoEnlace/.test(f), 'sin candado, cada tecla dispara una consulta');
});

test('si el enlace corto falla, se dice por que', () => {
  const f = js.match(/async function expandirEnlaceCorto[\s\S]*?\n\}/)[0];
  assert.ok((f.match(/diagEnlace = /g) || []).length >= 3,
    'hay caminos de falla que no explican nada');
});

test('los recientes aparecen al buscar destino, no antes', () => {
  const f = js.match(/function pintarRecientes\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/!buscandoDestino/.test(f), 'la lista ocupa pantalla sin que la pidas');
  const c = js.match(/function conectarFocoDestino\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/setTimeout/.test(c),
    'sin demora en el blur, el toque nunca llega al reciente elegido');
});

test('los plugins se piden por donde el puente los expone', () => {
  // La causa de fondo de casi todo lo que fallaba adentro del APK.
  // `registerPlugin` viene de @capacitor/core, que necesita un bundler; esta
  // app es un HTML suelto y no lo tiene, asi que esa funcion nunca existio.
  // Pidiendola primero, TODOS los plugins quedaban descartados: la voz muda,
  // el enlace de WhatsApp sin efecto y el boton atras sin salida.
  const f = js.match(/function plugin\(nombre\)[\s\S]*?\n\}/)[0];
  const porPlugins = f.indexOf('C.Plugins');
  const porRegistrar = f.indexOf('C.registerPlugin');
  assert.ok(porPlugins > 0, 'no se usa Capacitor.Plugins, que es lo que inyecta Android');
  assert.ok(porRegistrar > 0, 'se pierde el camino con bundler');
  assert.ok(porPlugins < porRegistrar,
    'registerPlugin primero descarta plugins que si estan instalados');
});

test('el diagnostico distingue no-hay-Capacitor de no-esta-el-plugin', () => {
  const f = js.match(/function cargarVocesNativas\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/window\.Capacitor\s*\n?\s*\?/.test(f) || /window\.Capacitor$/m.test(f),
    'son dos problemas distintos y el mensaje tiene que separarlos');
});

test('el boton atras siempre tiene salida', () => {
  const f = js.slice(js.indexOf('function conectarAtras'), js.indexOf('function start()'));
  assert.ok(/exitApp/.test(f), 'sin exitApp la app queda atrapada');
  assert.ok(/history\.back\(\)/.test(f),
    'si el plugin no contesta hay que soltar el historial igual');
});

test('los recientes cuelgan del buscador, no del panel de abajo', () => {
  const i = html.indexOf('id="recientes"');
  const sug = html.indexOf('id="sug"');
  const panel = html.indexOf('<div id="panel">');
  assert.ok(i > sug && i < panel,
    'los recientes tienen que estar al lado de las sugerencias, arriba');
  assert.ok(/#recientes\{position:absolute/.test(html),
    'sin position:absolute no cuelga del campo, empuja el contenido');
});

test('recientes y sugerencias no se superponen', () => {
  const f = js.match(/function pintarRecientes\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/sug'\)\.classList\.contains\('hidden'\)/.test(f),
    'dos listas colgando del mismo campo se pisan');
});

test('el buscador no promete cosas en el placeholder', () => {
  assert.ok(/placeholder="¿A dónde vas\?"/.test(html), 'el placeholder cambio');
  assert.ok(!/pegar un link de Maps/.test(html), 'sobra la explicacion');
});

{
  const nombreDeEnlace = new Function(
    js.match(/(function nombreDeEnlace\(url\)[\s\S]*?\n\})/)[1]
    + '\nreturn nombreDeEnlace;')();

  test('un link de Maps sin coordenadas se resuelve por el nombre', () => {
    // Los /maps/place/... a veces no traen coordenada: el punto lo resuelve
    // Google del lado suyo. Pero traen el nombre, y con eso se puede buscar.
    assert.strictEqual(
      nombreDeEnlace('https://www.google.com/maps/place/Parrilla+Tentaciones/data=!4m6'),
      'Parrilla Tentaciones');
    assert.strictEqual(
      nombreDeEnlace('https://www.google.com/maps/place/Caf%C3%A9+Tortoni/@-34.6,-58.3'),
      'Café Tortoni');
  });

  test('una coordenada disfrazada de nombre no se busca como texto', () => {
    assert.strictEqual(
      nombreDeEnlace('https://www.google.com/maps/place/-34.6,-58.4/@-34.6,-58.4,17z'), null);
    assert.strictEqual(nombreDeEnlace('https://maps.app.goo.gl/abc123'), null);
    assert.strictEqual(nombreDeEnlace(''), null);
    assert.strictEqual(nombreDeEnlace(null), null);
  });

  test('la coordenada tiene prioridad sobre el nombre', () => {
    const f = js.match(/async function usarUbicacionCompartida[\s\S]*?\n\}/)[0];
    assert.ok(f.indexOf('expandirEnlaceCorto') < f.indexOf('ubicacionPorNombre'),
      'buscar el nombre es el ultimo recurso, no el primero');
  });
}

test('la ubicacion espera a que el GPS se enganche', () => {
  // getCurrentPosition devuelve lo primero que tenga: una posicion de red con
  // cien o doscientos metros de error. Por eso lo ubicaba en otra calle.
  const f = js.slice(js.indexOf('function mejorPosicion'),
                     js.indexOf('async function locate'));
  assert.ok(f.length > 400, 'no se encontro la funcion');
  assert.ok(/watchPosition/.test(f), 'una sola lectura no alcanza');
  assert.ok(/maximumAge: 0/.test(f), 'con cache devuelve una posicion vieja');
  assert.ok(/objetivoM/.test(f), 'sin objetivo de precision no sabe cuando parar');
  assert.ok(/clearWatch/.test(f), 'quedaria el GPS prendido comiendo bateria');
  assert.ok(/setTimeout/.test(f), 'adentro de una casa nunca llegaria a la precision');
});

test('locate ya no acepta una posicion cacheada', () => {
  const f = js.match(/async function locate\(silent\)[\s\S]*?\n\}/)[0];
  assert.ok(!/maximumAge: 30000/.test(f), 'volvio el cache de 30 segundos');
  assert.ok(/mejorPosicion\(\)/.test(f), 'no se pide la lectura buena');
});

test('los recientes vuelven aunque el campo ya tenga el foco', () => {
  // Tocar un campo que ya esta enfocado no dispara focus. Pasaba justo despues
  // de elegir un reciente, que es cuando mas ganas tenes de elegir otro.
  const f = js.match(/function conectarFocoDestino\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/'focus', abrir/.test(f) && /'click', abrir/.test(f),
    'hacen falta los dos eventos');
});

test('no hay bloques de codigo duplicados', () => {
  // Un pegado mal ubicado metio 79 lineas ADENTRO del onclick del boton de voz.
  // Era JavaScript valido, asi que ningun test de carga lo vio: simplemente
  // media app se definia recien al tocar ese boton, y se redefinia en cada
  // toque. La copia de arriba tapaba el sintoma.
  const lineas = js.split('\n').map(l => l.trim())
    .filter(l => l.length > 30 && !l.startsWith('//') && !l.startsWith('*'));
  const veces = new Map();
  for (const l of lineas) veces.set(l, (veces.get(l) || 0) + 1);
  // Solo enganches de eventos: repetir uno significa dos listeners activos.
  // Un `.classList.add('hidden')` repetido, en cambio, es normal y sano.
  const repes = [...veces].filter(([l, n]) => n > 1 &&
    /^(\$\([^)]*\)\.(onclick|onchange|oninput|onsubmit) =|alMantenerPulsado\()/.test(l));
  assert.deepStrictEqual(repes, [],
    'wiring de UI repetido, se registra dos veces: ' +
    repes.map(([l]) => l).join(' | '));
});

test('el onclick del boton de voz hace solo lo suyo', () => {
  const f = js.match(/\$\('btnVoz'\)\.onclick = \(\) => \{[\s\S]*?\n\};/)[0];
  assert.ok(f.split('\n').length < 15,
    'el handler tiene ' + f.split('\n').length + ' lineas: algo se colo adentro');
  assert.ok(!/^function /m.test(f), 'hay funciones declaradas adentro del handler');
});

test('los rotulos de ruta dicen que hacen', () => {
  // "Peajes" no aclara si los busca o los esquiva. "Evitar peajes" si.
  const f = js.match(/const EVITABLES = \[([\s\S]*?)\];/)[1];
  const etiquetas = [...f.matchAll(/'([^']+)'\]/g)].map(m => m[1]);
  assert.ok(etiquetas.every(e => /^(Evitar|No )/.test(e)),
    'toda opcion tiene que decir la accion: ' + etiquetas.join(', '));
});

test('por defecto no se evita nada', () => {
  assert.ok(/function leerEvitar\(\)[\s\S]*?\|\| \[\]/.test(js),
    'la ruta mas rapida es la mas rapida: no hay que restringir de entrada');
});

test('las voces propias y las de Android conviven en una sola lista', () => {
  const f = js.match(/function pintarSelectorVoz\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/optgroup label="Voces de Luz Verde"/.test(f), 'faltan los paquetes propios');
  assert.ok(/optgroup label="Voces del sistema"/.test(f), 'faltan las del sistema');
  // El prefijo evita que un paquete llamado igual que una voz del sistema
  // se confundan al guardarse.
  assert.ok(/value="p:\$\{pq\.id\}"/.test(f) && /value="s:\$\{v\.name\}"/.test(f),
    'los valores tienen que distinguir el origen');
});

test('solo se ofrecen los paquetes que existen de verdad', () => {
  const f = js.match(/async function cargarBancoVoz\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/new Audio\(`\$\{VOZ_DIR\}\$\{pq\.id\}\//.test(f),
    'hay que probar un audio real: el manifiesto declara los tres siempre');
  assert.ok(/setTimeout\(\(\) => res\(null\)/.test(f),
    'sin timeout, una carpeta vacia deja la lista colgada para siempre');
  assert.ok(/if \(paqueteVoz && !paquetes\.some/.test(f),
    'si el paquete guardado ya no esta, hay que volver a la voz de Android');
});

test('si falta un audio suelto, lo dice Android en vez de callarse', () => {
  const f = js.match(/function decirManiobraPropia\([\s\S]*?\n\}/)[0];
  assert.ok(/hablarSistema\(fraseManiobra/.test(f),
    'quedarse sin indicacion manejando es peor que una voz distinta');
  assert.ok(/clipsBanco\.delete/.test(f),
    'conviene no reintentar un archivo que ya fallo');
});

test('la velocidad de habla se oculta con voz grabada', () => {
  // Sobre un mp3 ya grabado el control no hace nada; dejarlo visible es
  // prometer algo que no ocurre.
  assert.ok(/campVel'\)\.style\.display = paqueteVoz \? 'none' : 'block'/.test(js),
    'el control de velocidad no aplica a los audios grabados');
});

test('la prueba de voz se escucha aunque este silenciada', () => {
  const f = js.match(/function probarVoz\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/modoVoz = 'todo'/.test(f) && /modoVoz = antes/.test(f),
    'probar una voz sin escucharla no sirve de nada, y hay que restaurar el modo');
});

/* ------------------------------------------------------------------ */
console.log('\nBotón Atrás');

test('el boton atras no cierra la app de una', () => {
  assert.ok(/function retroceder\(\)/.test(js), 'falta el manejo del boton atras');
  const f = js.match(/function retroceder\(\)[\s\S]*?\n\}/)[0];
  // El orden importa: lo más "adentro" se cierra primero.
  const orden = ['ajustes', 'NAV.on', 'sug', 'S.routes.length'];
  let pos = -1;
  for (const clave of orden) {
    const i = f.indexOf(clave);
    assert.ok(i > pos, 'orden de retroceso incorrecto en: ' + clave);
    pos = i;
  }
  assert.ok(/return false/.test(f), 'sin salida, la app nunca se podria cerrar');
});

test('navegando, atras termina el viaje en vez de salir', () => {
  const f = js.match(/function retroceder\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/if \(NAV\.on\)[\s\S]{0,60}terminarViaje\(\)/.test(f),
    'tocar atras sin querer no puede perderte el viaje entero');
});

test('el navegador tambien intercepta el gesto de volver', () => {
  assert.ok(/history\.pushState/.test(js) && /popstate/.test(js),
    'en GitHub Pages el gesto de volver sacaria de la app');
});

/* ------------------------------------------------------------------ */
console.log('\nAtribución');

test('los creditos de OpenStreetMap siguen presentes', () => {
  // La licencia ODbL obliga a atribuir. Se puede mover fuera del mapa, pero
  // borrarla es incumplir la licencia de los datos.
  assert.ok(/openstreetmap\.org\/copyright/i.test(html),
    'falta el enlace de atribución de OpenStreetMap');
  assert.ok(/OpenStreetMap/.test(html) && /TomTom/.test(html));
});

/* ------------------------------------------------------------------ */
console.log('\nLugares guardados y recientes');

test('todo se guarda en el telefono, no en un servidor', () => {
  for (const linea of [/const guardarLugares\s*=.*localStorage\.setItem\('tt_lugares'/,
                       /const guardarRecientes\s*=.*localStorage\.setItem\('tt_recientes'/,
                       /let lugares\s*=\s*leerJSON\('tt_lugares'/,
                       /let recientes\s*=\s*leerJSON\('tt_recientes'/]) {
    assert.ok(linea.test(js), 'falta o cambió: ' + linea);
  }
  // Y que ir a un lugar guardado no dispare ninguna llamada extra: la dirección
  // de tu casa no tiene por qué salir del teléfono.
  const irA = js.match(/function irA\([\s\S]*?\n\}/)[0];
  assert.ok(!/fetch|XMLHttpRequest/.test(irA), 'irA() no debe llamar a ningún servicio');
});

test('un lugar vacio guarda, uno cargado navega', () => {
  const f = js.match(/el\.onclick = \(\) => \(lugares\[id\][\s\S]{0,90}/)[0];
  assert.ok(/irA\(lugares\[id\]\)/.test(f) && /asignarLugar/.test(f),
    'el mismo boton tiene que servir para guardar y para ir');
});

test('los recientes se registran al rutear, no al tipear', () => {
  // Si se registrara mientras escribis, la lista se llena de direcciones a
  // medio escribir y de lugares que descartaste.
  const f = js.match(/function route\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/registrarReciente\(S\.to\)/.test(f), 'no registra el destino usado');
  const doSug = js.match(/const doSuggest = debounce\([\s\S]*?\n\}, \d+\);/)[0];
  assert.ok(!/registrarReciente/.test(doSug), 'no debe registrarse desde el autocompletado');
});

test('no se registran recientes durante la navegacion', () => {
  // Un recalculo por desvio no es un destino nuevo que el usuario eligio.
  assert.ok(/if \(!NAV\.on\) registrarReciente/.test(js),
    'cada recalculo ensuciaria la lista de recientes');
});

test('los recientes no se duplican y tienen tope', () => {
  const f = js.match(/function registrarReciente\([\s\S]*?\n\}/)[0];
  assert.ok(/filter\(r => r\.label !== destino\.label\)/.test(f), 'permitiria duplicados');
  assert.ok(/slice\(0, MAX_RECIENTES\)/.test(f), 'la lista crece sin limite');
});

test('un JSON corrupto en el telefono no rompe la app', () => {
  // localStorage lo puede tocar cualquiera y una version vieja pudo dejar
  // basura; sin el try/catch la app no arranca mas y no hay forma de saber
  // por que.
  const f = js.match(/function leerJSON\([\s\S]*?\n\}/)[0];
  assert.ok(/try/.test(f) && /catch/.test(f), 'leerJSON tiene que tolerar basura');
});

/* ------------------------------------------------------------------ */
console.log(`\n${pasaron}/${pasaron + fallaron} verificaciones pasaron`);
process.exit(fallaron ? 1 : 0);
