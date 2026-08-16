/**
 * Test de CARGA: ejecuta el JavaScript de la app de verdad.
 *
 *     node verificar-carga.js
 *
 * Por qué existe: `node --check` valida la sintaxis y nada más. Un error de
 * referencia —una función usada antes de existir, un id que no está— compila
 * perfecto y revienta recién al abrir la página. El navegador entonces deja
 * todo muerto sin decir nada: los botones no responden y desde afuera parece
 * que "la app no hace nada".
 *
 * Esto monta un navegador de mentira mínimo y corre los bloques de script. Si
 * alguno tira, falla acá y no en el teléfono.
 */
const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'www/index.html', 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

const nuevoEl = (id) => {
  const el = {
    id, textContent: '', innerHTML: '', value: '', title: '', disabled: false,
    style: {}, dataset: {}, firstElementChild: null, parentElement: null,
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return true; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, click(){},
    querySelectorAll(){ return []; }, querySelector(){ return null; },
    getElement(){ return null; }, focus(){}, blur(){},
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    remove(){}, insertAdjacentHTML(){}, scrollIntoView(){},
  };
  el.parentElement = { classList: el.classList };
  el.firstElementChild = { textContent: '' };
  return el;
};
const cache = new Map();
const porId = id => { if (!cache.has(id)) cache.set(id, nuevoEl(id)); return cache.get(id); };

const faltantes = new Set();
global.document = {
  getElementById(id) { if (!ids.has(id)) faltantes.add(id); return porId(id); },
  createElement: () => nuevoEl('nuevo'),
  // El <meta name="theme-color"> y cualquier otro selector. Un navegador
  // siempre tiene querySelector: si el stub no lo tiene, el test falla por
  // una carencia del stub y no por un problema de la app.
  querySelector: sel => nuevoEl(sel),
  querySelectorAll: () => [],
  addEventListener(){}, body: nuevoEl('body'),
  hidden: false,
};
/**
 * Capacitor de mentira, que se porta como el real.
 *
 * Dos cosas que costó caro aprender y que este simulador tiene que respetar:
 *
 * 1. `registerPlugin` NO existe en una app sin bundler. Viene del paquete
 *    @capacitor/core, que hay que empaquetar. Esta app es un HTML suelto, así
 *    que en el teléfono esa función no está. Lo que Android inyecta es
 *    `Capacitor.Plugins`. Mientras el simulador ofrecía registerPlugin, todos
 *    los tests daban verde con la app incapaz de hablar en el celular.
 *
 * 2. Un plugin no instalado no falla al pedirlo: falla al usarlo. Devuelve un
 *    proxy que revienta en la primera llamada a un método.
 */
function metodosFalsos() {
  return {
    addListener: () => Promise.resolve({ remove() {} }),
    removeAllListeners: () => Promise.resolve(),
    getLaunchUrl: () => Promise.resolve({ url: null }),
    exitApp() {},
    get: () => Promise.resolve({ data: '', url: '' }),
    getCurrentPosition: () => Promise.resolve({ coords: { latitude: 0, longitude: 0 } }),
    watchPosition: () => Promise.resolve('w1'),
    clearWatch() {},
    requestPermissions: () => Promise.resolve({ location: 'granted' }),
    getSupportedVoices: () => Promise.resolve({ voices: [
      { name: 'es-us-x-sfb#female_1-local', lang: 'es-US' },
      { name: 'es-es-x-eed#male_1-local', lang: 'es-ES' },
      { name: 'en-us-x-tpf-local', lang: 'en-US' },
    ] }),
    speak: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  };
}

function capacitorFalso(instalados, conRegisterPlugin = false) {
  const C = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    // Tal cual el puente nativo: solo están los plugins realmente instalados.
    Plugins: Object.fromEntries(instalados.map(n => [n, metodosFalsos()])),
  };
  // Solo si la app se empaquetara con un bundler. Hoy no es el caso, pero el
  // camino sigue en el código y conviene probarlo.
  if (conRegisterPlugin) {
    C.registerPlugin = nombre => instalados.includes(nombre)
      ? metodosFalsos()
      : new Proxy({}, { get() {
          return () => { throw new Error('plugin no implementado'); };
        } });
  }
  return C;
}

const escenario = process.argv[3] || 'web';
const ENTORNOS = {
  web:      undefined,
  // El caso que rompió la app: dentro del APK, pero sin @capacitor/app.
  // El APK de verdad: sin registerPlugin, con solo algunos plugins.
  apkPelado: capacitorFalso(['Geolocation']),
  apkCompleto: capacitorFalso(
    ['Geolocation', 'App', 'CapacitorHttp', 'TextToSpeech']),
  // Por si algún día se empaqueta con bundler.
  apkBundler: capacitorFalso(
    ['Geolocation', 'App', 'CapacitorHttp', 'TextToSpeech'], true),
};
/**
 * `window` tiene que tener TODO lo que el navegador pone ahí.
 *
 * La app pregunta cosas como `'speechSynthesis' in window` antes de usar una
 * API. Si el simulador define la API como global pero no la cuelga de window,
 * esa rama nunca se ejecuta y el test da verde con la app rota. Pasó
 * exactamente eso: un error de inicialización quedó sin detectar.
 */
global.window = {
  addEventListener(){}, removeEventListener(){},
  Capacitor: ENTORNOS[escenario],
};
global.navigator = { geolocation: { getCurrentPosition(){}, watchPosition(){ return 1; }, clearWatch(){} }, wakeLock: undefined };
global.localStorage = { _d:{}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } };
global.history = { pushState(){} };
global.fetch = () => Promise.resolve({ ok:false, json:()=>Promise.resolve({}) });
global.Audio = function(){ return { play:()=>Promise.resolve(), load(){}, onended:null, onerror:null }; };
global.speechSynthesis = { getVoices:()=>[], cancel(){}, speak(){}, speaking:false };
global.SpeechSynthesisUtterance = function(){ return {}; };
global.requestAnimationFrame = fn => fn();
global.setInterval = () => 0; global.clearInterval = () => {};

const capa = () => ({ addTo(){ return this; }, on(){ return this; }, setLatLng(){ return this; },
  bindTooltip(){ return this; }, setZIndex(){}, getElement:()=>null, remove(){} });
global.L = {
  map: () => ({ setView(){ return this; }, removeLayer(){}, addLayer(){}, on(){}, fitBounds(){},
    flyTo(){}, panTo(){}, invalidateSize(){}, getCenter:()=>({lat:0,lng:0}) }),
  tileLayer: capa, polyline: capa, marker: capa, circleMarker: capa,
  divIcon: () => ({}), latLngBounds: () => ({ pad(){ return this; } }),
  control: { zoom: () => ({ addTo(){} }) },
};

// Reflejar en window todo lo que el navegador expone ahí.
for (const k of ['navigator', 'localStorage', 'history', 'fetch', 'Audio',
                 'speechSynthesis', 'SpeechSynthesisUtterance', 'document',
                 'requestAnimationFrame', 'setTimeout', 'setInterval', 'L']) {
  global.window[k] = global[k];
}

const bloques = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let n = 0;
for (const b of bloques) {
  n++;
  // Al último bloque se le engancha una sonda. Va adentro del mismo eval a
  // propósito: así ve las variables del módulo, que de afuera son invisibles.
  const codigo = n === bloques.length
    ? b + '\n;globalThis.__sonda = () => ({ diagVoz, ttsNativo, voces: vocesEs.length });'
    : b;
  try { (0, eval)(codigo); }
  catch (e) { console.log(`\n❌ BLOQUE ${n} FALLA AL CARGAR:\n   ${e.constructor.name}: ${e.message}`);
              if (e.stack) console.log('   ' + e.stack.split('\n')[1] || ''); process.exit(1); }
}
if (faltantes.size) console.log('⚠ ids inexistentes:', [...faltantes].join(', '));

/**
 * Cargar sin explotar no alcanza.
 *
 * El error más caro que tuvimos no lanzó ninguna excepción: `plugin()` pedía
 * una función que no existe en el teléfono y devolvía null en silencio, así
 * que la app arrancaba perfecta y muda. Los tres escenarios daban verde.
 *
 * Por eso, además de que cargue, se mira el resultado: en un APK con el plugin
 * de voz instalado, la app TIENE que haber conseguido las voces.
 */
setTimeout(() => {
  const esperado = escenario.startsWith('apk')
                && ENTORNOS[escenario].Plugins.TextToSpeech;
  if (esperado) {
    const d = globalThis.__sonda ? globalThis.__sonda() : null;
    if (!d || !d.ttsNativo) {
      console.log(`\n❌ [${escenario}] la app cargó pero no consiguió la voz.`);
      console.log('   diagnóstico:', d ? d.diagVoz : 'sin sonda');
      console.log('   El plugin está instalado en este escenario: si la app no'
                + ' lo encuentra,\n   en el teléfono va a estar muda igual que'
                + ' antes.');
      process.exit(1);
    }
    if (d.voces < 1) {
      console.log(`\n❌ [${escenario}] no quedó ninguna voz para elegir.`);
      process.exit(1);
    }
    console.log(`   voz: ${d.diagVoz}`);
  }
  console.log(`✅ [${escenario}] los ${n} bloques cargaron sin errores`);
}, 30);
