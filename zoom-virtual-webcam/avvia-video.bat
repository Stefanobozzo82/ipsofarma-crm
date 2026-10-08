@echo off
REM Doppio click per avviare la webcam virtuale con un VIDEO in loop.
REM
REM Se vuoi scegliere il video ogni volta da una finestra, lascia questa
REM riga vuota (com'e' di default): si aprira' automaticamente la finestra
REM di selezione file.
REM Se invece vuoi che parta sempre con lo STESSO video senza doverlo
REM scegliere ogni volta, scrivi qui sotto il percorso completo, con o
REM senza virgolette (entrambi vanno bene), es:
REM   set VIDEO=C:\IpsofarmaWebcam\mio-video.mp4
set VIDEO=

REM Toglie eventuali virgolette messe a mano, per evitare doppie virgolette
set VIDEO=%VIDEO:"=%

cd /d "%~dp0"
if exist "%VIDEO%" (
    python virtual_webcam.py "%VIDEO%"
) else (
    python virtual_webcam.py
)
pause
