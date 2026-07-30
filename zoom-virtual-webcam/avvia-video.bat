@echo off
REM Doppio click per avviare la webcam virtuale con un VIDEO in loop.
REM Modifica il percorso qui sotto con il file video che vuoi trasmettere.
set VIDEO=C:\IpsofarmaWebcam\mio-video.mp4

cd /d "%~dp0"
python virtual_webcam.py "%VIDEO%"
pause
