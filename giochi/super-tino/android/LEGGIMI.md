# Super Tino per Android

App WebView minima che carica `assets/index.html`, cioè la versione offline del gioco (`../download/super-tino.html`).

Per ricompilare servono Java e l'Android SDK (`platforms;android-34`, `build-tools;34.0.0`):

1. metti l'SDK in `sdk/` accanto a `build.sh`;
2. crea la cartella `proj/` con `AndroidManifest.xml`, `src/` e `res/`;
3. copia il gioco offline in `proj/assets/index.html`;
4. lancia `bash build.sh`.

Lo script crea una chiave di firma se manca e produce `super-tino.apk`.
