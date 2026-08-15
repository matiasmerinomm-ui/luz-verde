# Luz Verde

Navegador GPS para Android con tránsito real y guía por voz.

**Nada está simulado.** Los datos salen de la API de TomTom en vivo y las
cámaras de OpenStreetMap.

**La API Key no va en el código.** El repositorio es público, así que la clave
se carga aparte: como secreto para compilar el APK, o pegándola una vez dentro
de la app. Está explicado más abajo.

## Qué hace

**Antes de salir.** Ponés una dirección y te da el tiempo de viaje, la hora de
llegada, cuántos minutos son demora por tránsito, y si hoy está peor o mejor que
lo normal para ese día y esa hora. La ruta se dibuja pintada con la congestión
real tramo por tramo. Con los botones *+30 min* / *+1 h* consultás el tránsito
**predicho** para más tarde: sirve para decidir si conviene salir ya o esperar.

**Durante el viaje.** Tocás *Iniciar viaje* y entrás en navegación:

- Cartel grande con la próxima maniobra y la distancia en cuenta regresiva
- **Guía por voz en español**, con avisos que se adaptan a la velocidad — en
  autopista te avisa a 1,5 km; en ciudad, a 300 m
- El mapa sigue al auto y se aleja al acelerar
- **Alertas de cámaras de velocidad**, con el límite cuando está mapeado
- **Recálculo automático** si te desviás
- Velocidad actual, distancia restante y hora de llegada
- La pantalla no se apaga

---

## Paso 1 — Probala ahora mismo

Abrí `www/index.html` con doble clic.

Te va a pedir la API Key de TomTom: la pegás una vez y queda guardada en ese
navegador. Después escribí dos direcciones —por ejemplo *Obelisco* y
*Aeroparque*— y vas a ver el tiempo con tránsito real, la demora, y la ruta
pintada de rojo donde está congestionado.

Todo eso funciona abriendo el archivo suelto. **Lo que no funciona es el GPS**,
y por lo tanto tampoco la navegación de verdad.

> **Por qué.** Los navegadores solo entregan la ubicación en páginas `https://`.
> Un archivo abierto con doble clic (`file://`) o mandado por WhatsApp
> (`content://`) no lo es, así que Android bloquea el GPS. No es un error de la
> app: es una regla de seguridad y está bien que exista.
>
> Para planificar, escribí el origen a mano y anda todo. **Para la navegación
> con GPS y voz hace falta `https`**: o el APK, o GitHub Pages — las dos cosas
> salen del mismo repositorio, más abajo.

---

## Paso 2 — Sacar el APK sin instalar nada

GitHub compila la app en sus servidores, gratis.

### 2.1 Crear el repositorio

1. Entrá a **https://github.com** y creá una cuenta si no tenés.
2. Botón **+** arriba a la derecha → **New repository**.
3. Nombre: `luz-verde`, en minúscula y con guión. Va a formar parte de la URL.
4. Visibilidad **Public**. La clave no está en el código, así que no se expone
   nada — se carga aparte, en el paso 2.4.
5. **Create repository**.

### 2.2 Subir los archivos

En la página del repo vacío, hacé clic en **uploading an existing file**.

Arrastrá **todo el contenido de esta carpeta**. Importante: que suba también la
carpeta oculta `.github` — es la que contiene las instrucciones de compilación.

> Si el navegador no te deja arrastrar carpetas ocultas, instalá **GitHub
> Desktop** (https://desktop.github.com). Sube todo de una y después te sirve
> para publicar cambios con un botón.

Escribí un mensaje cualquiera y **Commit changes**.

### 2.3 Esperar la compilación

1. Andá a la pestaña **Actions** del repo.
2. Vas a ver *Compilar APK* corriendo. Tarda entre 4 y 7 minutos la primera vez.
3. Cuando termine con un tilde verde, andá a **Releases** (columna derecha de la
   página principal del repo).
4. Ahí está tu **`luz-verde-v1.apk`**.

### 2.4 Cargar tu API Key como secreto

Antes de que compile, el repositorio necesita la clave. Se guarda cifrada y no
aparece nunca en el código ni en los registros de compilación.

1. En el repo: **Settings** → **Secrets and variables** → **Actions**
2. Botón **New repository secret**
3. Name: `TOMTOM_KEY`
4. Secret: tu clave de TomTom
5. **Add secret**

Volvé a **Actions**, entrá a la última ejecución y tocá **Re-run all jobs**.
Esta vez el APK sale con la clave adentro.

### 2.5 Instalarlo en el teléfono

Abrí el link del Release **desde el celular** y tocá el `.apk`. Al ser público,
no hace falta iniciar sesión.

Android te va a advertir que la app viene de una fuente desconocida. Es normal:
pasa con cualquier app que no venga de Play Store. Tocá **Configuración** →
activá **Permitir de esta fuente** → **Instalar**.

Abrila y listo. Ya tiene la clave adentro.

---

## Probar cambios en un minuto, sin compilar

Esta es la ventaja de tener el repo público. En el repo:

**Settings** → **Pages** → en *Branch* elegí `main` y `/ (root)` → **Save**.

Al minuto tenés una URL así:

```
https://TUUSUARIO.github.io/luz-verde/www/
```

Abrila en el celular. Funciona igual que el APK —**GPS, voz y navegación
incluidos**, porque es `https`. La primera vez te pide la API Key: la pegás y
queda guardada en ese teléfono.

Desde el menú del navegador podés hacer *Agregar a pantalla de inicio* y te
queda con ícono propio, casi indistinguible de la app instalada.

Cada cambio que subas está disponible ahí en menos de un minuto, contra los 6
que tarda la compilación del APK. Para iterar, usá esto.

---

## Sobre tu API Key

**No está en el código, y no tiene que estarlo.** El repositorio es público.

De dónde la saca la app, según el caso:

| Dónde | De dónde sale |
|---|---|
| APK | Del secreto `TOMTOM_KEY`, inyectado al compilar |
| GitHub Pages o navegador | Te la pide una vez y la guarda en ese teléfono |

Hay un test —`node verificar.js`— que **falla si se cuela una clave en el
código**. Es lo único que impide que se te escape por descuido en un commit.

**Para cambiarla:** en la app, enlace *Cambiar la API Key* en la pantalla
inicial. Para el APK, editás el secreto en Settings y volvés a compilar.

**Si se te filtra:** panel de TomTom, borrás la clave y creás otra. No hay daño
permanente — el peor caso es que alguien te agote las consultas de un día.

**Si algún día lo pasás a privado**, podés pegar la clave directamente en la
constante `KEY_EMBEBIDA` de `www/index.html` y saltearte el secreto. El test te
va a avisar, así que acordate de sacarlo si volvés a hacerlo público.

---

## Paso 3 — Cuando quieras publicarla en Play Store

Ahí sí conviene Android Studio. El proyecto ya está listo:

```bash
npm install
npx cap add android      # genera la carpeta android/
npx cap open android     # la abre en Android Studio
```

Desde Android Studio: **Build** → **Generate Signed Bundle / APK** → **Android
App Bundle**, que es el formato que pide Google Play.

Vas a necesitar una cuenta de desarrollador de Google Play (pago único de USD
25) y generar una *keystore* de firma. **Guardá esa keystore y su contraseña**:
si las perdés no podés volver a actualizar la app nunca más, hay que publicarla
de cero con otro nombre.

---

## Cómo actualizar la app

Editás `www/index.html`, subís el cambio a GitHub, y el workflow genera un
Release nuevo solo. No hay que tocar nada más.

---

## Qué muestra, exactamente

| Dato | De dónde sale |
|---|---|
| Tiempo de viaje | `travelTimeInSeconds` con `traffic=true` — tránsito en vivo |
| Hora de llegada | `arrivalTime` que calcula TomTom |
| Demora por tránsito | `trafficDelayInSeconds` |
| "Peor que lo normal" | `travelTimeInSeconds` contra `historicTrafficTravelTimeInSeconds` |
| Color de la ruta | `magnitudeOfDelay` de cada tramo, escala 0 a 4 |
| Metros con tránsito lento | `trafficLengthInMeters` |
| Alternativas | `maxAlternatives=2` |
| Salir más tarde | `departAt` — usa el tránsito **predicho** para esa hora |

Ese último es el que más se usa en la práctica: tocás *+30 min* y te dice cuánto
vas a tardar si salís en media hora, no cuánto tardarías ahora.

El ETA se recalcula solo cada minuto, y también cuando volvés a la app después
de tenerla minimizada. Un ETA de hace diez minutos miente.

---

## Estructura

```
luz-verde/
  www/index.html                    la app entera, un único archivo
  assets/icon.png                   ícono
  assets/splash.png                 pantalla de arranque
  package.json                      dependencias de Capacitor
  capacitor.config.json             nombre de la app e identificador
  .github/workflows/build-apk.yml   receta de compilación en la nube
  verificar.js                      tests de API e interfaz
  verificar-nav.js                  tests de navegación y viaje simulado
  .gitignore
```

Para correr los tests:

```bash
node verificar.js       # 40 — API, parseo, interfaz, cableado de navegación
node verificar-nav.js   # 38 — geometría, locución, cámaras, viaje simulado
```

El segundo incluye una **simulación de viaje completo**: recorre la ruta con
posiciones sintéticas, con y sin ruido de GPS, y verifica que la distancia
restante nunca aumente, que ninguna maniobra quede sin anunciar ni se anuncie
dos veces, y que cada cámara avise antes de pasarla y una sola vez.

Es la clase de error que no tira excepción: la app anda, muestra números
plausibles, y te hace pasar de largo.

---

## Problemas frecuentes

**"La API Key no es válida"** — La clave recién creada tarda un minuto en
activarse. Esperá y reintentá. Si sigue, verificá en el panel de TomTom que la
clave tenga habilitados los tres productos: *API de enrutamiento*, *API de
búsqueda* y *API de geocodificación inversa*.

**La compilación falla en Actions** — Abrí el paso que salió en rojo y leé el
final del log. Casi siempre faltó subir algún archivo. Verificá que estén
`package.json`, `capacitor.config.json` y `www/index.html`.

**No aparece la pestaña Releases** — El workflow necesita permiso de escritura.
En el repo: **Settings** → **Actions** → **General** → abajo, en *Workflow
permissions*, elegí **Read and write permissions** → **Save**. Volvé a Actions y
tocá **Re-run jobs**.

**El GPS no funciona en el APK** — Configuración de Android → Apps → Luz Verde →
Permisos → Ubicación → Permitir.

---

## Sobre las cámaras de velocidad

**Vienen de OpenStreetMap, no de TomTom.** TomTom sí tiene una base de cámaras,
pero es un producto licenciado aparte que no está en el plan gratuito.

OSM es una base colaborativa: las cámaras las carga la comunidad. En CABA y el
conurbano la cobertura es razonable; en el interior y en rutas es despareja.
**Es dato real, pero incompleto.**

Por eso la app nunca dice "no hay cámaras". Si no encuentra ninguna, no muestra
nada — que no es lo mismo. Tratá los avisos como una ayuda, no como una
garantía: la ausencia de alerta no significa que no haya control.

Si algún día querés cobertura completa, hay dos caminos: licenciar la base de
TomTom, o agregar reportes de los propios usuarios como hace Waze — que es
gratis pero necesita masa crítica de gente usando la app.

---

## Límites honestos

**Solo navega con la app abierta y la pantalla encendida.** Si minimizás, el
seguimiento se corta. Navegar en segundo plano en Android requiere un *foreground
service* con notificación permanente, que es una pieza nativa que este proyecto
todavía no tiene. Es agregable.

**El mapa va con el norte arriba**, con una flecha que marca hacia dónde apuntás.
Google Maps y Waze rotan el mapa en el sentido de la marcha. Leaflet no rota de
fábrica y hacerlo a mano trae más problemas que beneficios; es lo próximo a
resolver si te resulta incómodo.

**No hay guía de carriles** ("mantenete en los dos carriles de la izquierda").
TomTom la devuelve en un producto aparte.

**No hay reportes de otros conductores** — accidentes, controles, cortes. Eso es
lo que hace fuerte a Waze y no se puede copiar: necesita una comunidad activa.
Se puede construir, pero es un producto en sí mismo.

**El consumo de batería es alto**, como en cualquier navegador: GPS continuo más
pantalla encendida. Para viajes largos, cargador.
