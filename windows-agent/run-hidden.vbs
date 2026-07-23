' Avvia print-agent.ps1 completamente in background, senza mostrare mai
' nessuna finestra o icona nella barra delle applicazioni (nemmeno per un istante).
' Va usato al posto di powershell.exe direttamente nell'azione dell'Utilità di
' pianificazione di Windows (Task Scheduler) — vedi print-agent.ps1 per i dettagli.

Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\IpsofarmaPrintAgent\print-agent.ps1""", 0, False
