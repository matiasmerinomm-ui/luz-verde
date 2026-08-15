# Voces propias de Luz Verde

Son **42 audios por paquete**, y hay **3 paquetes**. Podés armar uno solo
y dejar los otros vacíos: la app muestra únicamente los que encuentre.

La app encadena dos audios para armar cada indicación:

    d-300  +  m-izq   →   "En 300 metros, girá a la izquierda"

## Cómo se arma

1. Elegí una voz distinta para cada paquete, en un sitio de síntesis de voz.
2. Generá las 42 frases **con la misma voz dentro de cada paquete**.
3. Guardalas como **mp3**, con el nombre exacto de la primera columna.
4. Poné los archivos en la carpeta del paquete:

       www/voz/voz1/      www/voz/voz2/      www/voz/voz3/

5. Borrá el archivo `PONER-LOS-MP3-ACA.txt` de esa carpeta y subí todo.

La app detecta sola qué paquetes existen y los ofrece en Ajustes junto a las
voces de Android. Si falta un audio suelto, esa frase la dice Android: nunca
te quedás sin aviso.

> **Los nombres de calles no se dicen.** El vocabulario grabado es finito y las
> calles no. Van en pantalla, como hacían los GPS de tablero.

## Los paquetes

- **`voz1/`** — Voz 1. Sugerencia: voz femenina, tono neutro y claro.
- **`voz2/`** — Voz 2. Sugerencia: voz masculina, para alternar.
- **`voz3/`** — Voz 3. Sugerencia: la que más te guste; puede ser rioplatense marcada.

## Las 42 frases

| Archivo | Texto exacto a generar |
|---|---|
| `d-30.mp3` | En 30 metros |
| `d-50.mp3` | En 50 metros |
| `d-100.mp3` | En 100 metros |
| `d-150.mp3` | En 150 metros |
| `d-200.mp3` | En 200 metros |
| `d-300.mp3` | En 300 metros |
| `d-400.mp3` | En 400 metros |
| `d-500.mp3` | En 500 metros |
| `d-700.mp3` | En 700 metros |
| `d-900.mp3` | En 900 metros |
| `d-1000.mp3` | En 1 kilómetro |
| `d-1500.mp3` | En 1 kilómetro y medio |
| `d-2000.mp3` | En 2 kilómetros |
| `d-3000.mp3` | En 3 kilómetros |
| `d-5000.mp3` | En 5 kilómetros |
| `d-8000.mp3` | En 8 kilómetros |
| `d-12000.mp3` | En 12 kilómetros |
| `d-20000.mp3` | En 20 kilómetros |
| `m-izq.mp3` | girá a la izquierda |
| `m-der.mp3` | girá a la derecha |
| `m-izq-fuerte.mp3` | giro cerrado a la izquierda |
| `m-der-fuerte.mp3` | giro cerrado a la derecha |
| `m-izq-suave.mp3` | doblá suave a la izquierda |
| `m-der-suave.mp3` | doblá suave a la derecha |
| `m-izq-manten.mp3` | mantenete a la izquierda |
| `m-der-manten.mp3` | mantenete a la derecha |
| `m-derecho.mp3` | seguí derecho |
| `m-u.mp3` | hacé un giro en U |
| `m-salida.mp3` | tomá la salida |
| `m-salida-izq.mp3` | tomá la salida por la izquierda |
| `m-salida-der.mp3` | tomá la salida por la derecha |
| `m-rot-1.mp3` | en la rotonda, tomá la primera salida |
| `m-rot-2.mp3` | en la rotonda, tomá la segunda salida |
| `m-rot-3.mp3` | en la rotonda, tomá la tercera salida |
| `m-balsa.mp3` | tomá la balsa |
| `m-llegada.mp3` | llegaste a destino |
| `a-ahora.mp3` | Ahora |
| `a-inicio.mp3` | Iniciando viaje |
| `a-recalc.mp3` | Recalculando |
| `a-camara.mp3` | Atención, cámara de velocidad adelante |
| `a-exceso.mp3` | Estás por encima del límite de velocidad |
| `a-prueba.mp3` | En 300 metros, girá a la izquierda |

## Consejos

- Una sola voz por paquete: si mezclás, se nota el corte al encadenar.
- Sin música ni efectos: se escuchan con ruido de motor de fondo.
- Recortá el silencio del principio y del final. El silencio sobrante se suma
  al encadenar y la frase queda lenta.
- Las de maniobra van en minúscula porque siempre siguen a una distancia.
- `a-prueba` es la que suena en Ajustes al tocar *Escuchar una prueba*.
