@echo off
chcp 65001 >nul
setlocal
rem ============================================================
rem  Installa l'agente di sincronizzazione Maestro Gold -> gestionale.
rem  Doppio clic su questo file, sul PC dove gira Maestro.
rem ============================================================
set "DEST=C:\IpsofarmaMaestroAgent"
set "URL=https://rixvgmzedwdzgavjewbm.supabase.co/functions/v1/maestro-sync"
set "APIKEY=sb_publishable_DFLcrBd6aiyyNGnCq41RQg_XrP0VR47"

echo.
echo  Agente di sincronizzazione Maestro Gold
echo  =======================================
echo.
echo  1) Percorso della cartella dati di Maestro
echo     (quella che contiene VENDITE.DBF, BOLLE.DBF, CLIENTI.DBF...)
set /p "CARTELLA=     Percorso: "
if not exist "%CARTELLA%\BOLLE.DBF" (
  echo.
  echo  In "%CARTELLA%" non trovo BOLLE.DBF: controlla il percorso e riprova.
  pause
  exit /b 1
)
echo.
echo  2) Chiave di sincronizzazione
echo     (nel gestionale: Impostazioni azienda - Collegamento Maestro - Crea chiave)
set /p "CHIAVE=     Chiave: "

if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0maestro-agent.ps1" "%DEST%\" >nul
copy /Y "%~dp0run-hidden.vbs" "%DEST%\" >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c=[ordered]@{cartella=$env:CARTELLA; chiave=$env:CHIAVE.Trim(); url=$env:URL; apikey=$env:APIKEY};" ^
  "$c | ConvertTo-Json | Set-Content -Path '%DEST%\maestro-agent.config.json' -Encoding UTF8"

rem Ogni ora, a partire da adesso, senza finestre (run-hidden.vbs).
schtasks /Create /F /TN "Ipsofarma Maestro Sync" /SC HOURLY /MO 1 /TR "wscript.exe \"%DEST%\run-hidden.vbs\"" >nul
if errorlevel 1 (
  echo  Non sono riuscito a creare l'attivita' pianificata. Riprova con tasto destro - Esegui come amministratore.
  pause
  exit /b 1
)

echo.
echo  Primo invio in corso (puo' richiedere qualche minuto)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\maestro-agent.ps1"
echo.
echo  Fatto. Ultime righe del registro:
powershell -NoProfile -Command "Get-Content '%DEST%\maestro-agent.log' -Tail 20"
echo.
echo  Da ora l'agente parte da solo ogni ora. Registro: %DEST%\maestro-agent.log
pause
