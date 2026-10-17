@echo off
REM Da eseguire UNA VOLTA sul PC Windows per creare virtual_webcam.exe
REM (un eseguibile singolo che non richiede Python installato per essere usato).
REM Il file finale sara' in: dist\virtual_webcam.exe

cd /d "%~dp0"

echo Installo le dipendenze...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo Creo l'eseguibile...
pyinstaller --onefile --console --name virtual_webcam virtual_webcam.py

echo.
echo Fatto! Trovi l'eseguibile in: %~dp0dist\virtual_webcam.exe
pause
