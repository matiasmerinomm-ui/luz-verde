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
  assert.ok(/speechSynthesis\.cancel/.test(f), 'queda hablando');
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
  assert.ok(/sort\(/.test(f), 'las rioplatenses deberian ir primero');
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
    'si no hay ni paquetes ni voces de Android, el usuario tiene que enterarse');
  assert.ok(/Texto a voz/.test(f), 'y saber dónde instalar voces del sistema');
});

test('las voces propias y las de Android conviven en una sola lista', () => {
  const f = js.match(/function pintarSelectorVoz\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/optgroup label="Voces de Luz Verde"/.test(f), 'faltan los paquetes propios');
  assert.ok(/optgroup label="Voces de Android"/.test(f), 'faltan las del sistema');
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
