# -*- coding: utf-8 -*-
"""
Declara en el manifiesto de Android que Luz Verde sabe abrir ubicaciones.

El proyecto android/ no se versiona: lo genera `npx cap add android` en cada
compilación, con un manifiesto limpio. Por eso esto corre después, en el
workflow, y no una sola vez a mano.

Sin estos filtros la app funciona igual, pero Android no la ofrece en el
"Abrir con" al tocar un link de Google Maps que te mandaron por WhatsApp. El
código que interpreta el link ya existe; lo que faltaba era que el sistema
supiera que existimos.
"""
import sys

RUTA = 'android/app/src/main/AndroidManifest.xml'

FILTROS = """
            <!-- geo:-34.6,-58.4 — el formato estándar de Android -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="geo" />
            </intent-filter>
            <!-- Los links que genera Google Maps al compartir. El acortado
                 maps.app.goo.gl es el que más circula por WhatsApp. -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="maps.app.goo.gl" />
                <data android:scheme="https" android:host="goo.gl" android:pathPrefix="/maps" />
                <data android:scheme="https" android:host="maps.google.com" />
                <data android:scheme="https" android:host="www.google.com" android:pathPrefix="/maps" />
                <data android:scheme="https" android:host="google.com" android:pathPrefix="/maps" />
            </intent-filter>
"""


def main():
    try:
        with open(RUTA, encoding='utf-8') as f:
            m = f.read()
    except FileNotFoundError:
        print('ERROR: no existe', RUTA)
        return 1

    if 'maps.app.goo.gl' in m:
        print('Los filtros ya estaban declarados.')
        return 0

    corte = m.find('</activity>')
    if corte < 0:
        print('ERROR: el manifiesto no tiene <activity>; no sé dónde ponerlos.')
        return 1

    m = m[:corte] + FILTROS + m[corte:]
    with open(RUTA, 'w', encoding='utf-8') as f:
        f.write(m)

    print('Filtros agregados. La app ya aparece en "Abrir con" para:')
    print('  geo:  ·  maps.app.goo.gl  ·  goo.gl/maps  ·  google.com/maps')
    return 0


if __name__ == '__main__':
    sys.exit(main())
