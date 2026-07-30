# Webcam virtuale per Zoom (video o foto al posto della webcam reale)

Piccolo tool per Windows: quando in una videochiamata Zoom avvii la webcam,
al posto dell'immagine reale viene mostrato un **video registrato in loop**
oppure una **foto fissa**, a scelta.

Funziona creando una "webcam virtuale": un dispositivo video che Windows
tratta come una webcam qualunque, e che Zoom puo' selezionare dalle sue
impostazioni esattamente come farebbe con la webcam fisica del PC.

## Installazione (una tantum)

1. **Installa OBS Studio** (serve solo per il driver della webcam virtuale,
   non serve aprirlo ne' usarlo): https://obsproject.com/it/download
   Durante l'installazione lascia tutte le opzioni di default.

2. **Installa Python** (versione 3.9 o superiore) se non e' gia' presente:
   https://www.python.org/downloads/ — durante l'installazione spunta
   "Add python.exe to PATH".

3. Copia questa cartella (`zoom-virtual-webcam`) in un percorso stabile del
   PC, ad es. `C:\IpsofarmaWebcam\`.

4. Apri un terminale (PowerShell o Prompt dei comandi) in quella cartella e
   installa le dipendenze:
   ```
   pip install -r requirements.txt
   ```

## Uso

### Con un video registrato (in loop continuo)
```
python virtual_webcam.py "C:\percorso\del\tuo\video.mp4"
```

### Con una foto fissa
```
python virtual_webcam.py "C:\percorso\della\tua\foto.jpg"
```

In alternativa, per comodita', modifica il percorso del file dentro
`avvia-video.bat` o `avvia-foto.bat` e poi avvia lo script con un doppio
click: si apre una finestra nera che va lasciata aperta per tutta la durata
della chiamata.

### Poi, in Zoom
Impostazioni -> Video -> nel menu a tendina della telecamera seleziona
**"OBS Virtual Camera"**. Da quel momento Zoom mostrera' il video o la foto
al posto della webcam reale, in tutte le riunioni.

Per tornare alla webcam vera basta riselezionarla dallo stesso menu in Zoom
e chiudere (o premere Ctrl+C nel) terminale dello script.

## Parametri opzionali
```
python virtual_webcam.py video.mp4 --width 1280 --height 720 --fps 30
```
- `--width` / `--height`: risoluzione trasmessa (default 1280x720)
- `--fps`: fotogrammi al secondo (default 30)

## Note
- Il video/foto deve avere un aspect ratio simile a quello scelto per
  evitare che venga deformato (viene comunque ridimensionato automaticamente).
- Lo script deve restare in esecuzione per tutta la chiamata: se lo chiudi,
  Zoom perde il segnale della webcam virtuale.
- Usa questa funzione in modo responsabile e nel rispetto delle policy della
  tua azienda/organizzazione riguardo alla partecipazione alle riunioni.
