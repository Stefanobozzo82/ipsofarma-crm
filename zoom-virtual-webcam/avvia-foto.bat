@echo off
REM Doppio click per avviare la webcam virtuale con una FOTO fissa.
REM
REM Se vuoi scegliere la foto ogni volta da una finestra, lascia questa
REM riga vuota (com'e' di default): si aprira' automaticamente la finestra
REM di selezione file.
REM Se invece vuoi che parta sempre con la STESSA foto senza doverla
REM scegliere ogni volta, scrivi qui sotto il percorso completo tra
REM virgolette, es: set FOTO=C:\IpsofarmaWebcam\mia-foto.jpg
set FOTO=

cd /d "%~dp0"
if exist "%FOTO%" (
    python virtual_webcam.py "%FOTO%"
) else (
    python virtual_webcam.py
)
pause
