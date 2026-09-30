' Avvia maestro-agent.ps1 senza mostrare nessuna finestra. Usato
' dall'attivita' pianificata creata da installa.bat.
Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\IpsofarmaMaestroAgent\maestro-agent.ps1""", 0, False
