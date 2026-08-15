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
  addEventListener(){}, body: nuevoEl('body'),
  hidden: false,
};
/**
 * Capacitor de mentira, que se porta como el real.
 *
 * La clave está en `registerPlugin`: Capacitor NUNCA falla al registrar un
 * plugin, aunque no esté instalado. Devuelve un proxy que revienta recién
 * cuando le llamás un método. Por eso una app puede cargar perfecto en el
 * navegador y morir dentro del APK.
 */
function capacitorFalso(instalados) {
  return {
    isNativePlatform: () => true,
    Plugins: {},
    registerPlugin(nombre) {
      if (instalados.includes(nombre)) {
        return { addListener: () => ({ remove(){} }),
                 getLaunchUrl: () => Promise.resolve({ url: null }),
                 exitApp(){}, get: () => Promise.resolve({ data:'', url:'' }),
                 getCurrentPosition: () => Promise.resolve({ coords:{latitude:0,longitude:0} }),
                 watchPosition: () => Promise.resolve('w1'), clearWatch(){},
                 requestPermissions: () => Promise.resolve({ location:'granted' }) };
      }
      // Plugin no instalado: exactamente lo que hace Capacitor de verdad.
      return new Proxy({}, { get() {
        return () => { throw new Error('plugin no implementado'); };
      } });
    },
  };
}

const escenario = process.argv[3] || 'web';
const ENTORNOS = {
  web:      undefined,
  // El caso que rompió la app: dentro del APK, pero sin @capacitor/app.
  apkPelado: capacitorFalso(['Geolocation']),
  apkCompleto: capacitorFalso(['Geolocation', 'App', 'CapacitorHttp']),
};
global.window = { addEventListener(){}, Capacitor: ENTORNOS[escenario] };
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

const bloques = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let n = 0;
for (const b of bloques) {
  n++;
  try { (0, eval)(b); }
  catch (e) { console.log(`\n❌ BLOQUE ${n} FALLA AL CARGAR:\n   ${e.constructor.name}: ${e.message}`);
              if (e.stack) console.log('   ' + e.stack.split('\n')[1] || ''); process.exit(1); }
}
if (faltantes.size) console.log('⚠ ids inexistentes:', [...faltantes].join(', '));
console.log(`✅ [${escenario}] los ${n} bloques cargaron sin errores`);
