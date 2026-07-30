@echo off
REM Doppio click per avviare la webcam virtuale con una FOTO fissa.
REM Modifica il percorso qui sotto con la foto che vuoi mostrare.
set FOTO=C:\IpsofarmaWebcam\mia-foto.jpg

cd /d "%~dp0"
python virtual_webcam.py "%FOTO%"
pause
