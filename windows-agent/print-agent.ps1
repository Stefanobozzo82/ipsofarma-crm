<#
IPSOFARMA CRM — Agente di stampa remota
========================================
Gira in background sul PC dell'ufficio collegato alla stampante. Controlla
periodicamente il file print-queue.json nel repository GitHub del gestionale:
quando trova un documento nuovo (accodato premendo "Stampa in ufficio" dal
gestionale, anche da lontano), lo stampa in automatico sulla stampante
predefinita di Windows, senza aprire finestre o chiedere conferme.

---- INSTALLAZIONE (una tantum) ----
1. Copia questo file in una cartella stabile del PC, es. C:\IpsofarmaPrintAgent\print-agent.ps1
2. Apri il file con un editor di testo (Blocco Note va bene) e compila i valori
   qui sotto in "CONFIGURAZIONE": il tuo Personal Access Token GitHub (lo stesso
   permesso "repo" già usato nel gestionale per il backup va benissimo, oppure
   creane uno nuovo identico su github.com -> Settings -> Developer settings ->
   Personal access tokens).
3. Prova ad avviarlo manualmente per vedere che funzioni: tasto destro sul file
   -> "Esegui con PowerShell". Deve apparire una finestra nera con scritto
   "Agente di stampa avviato...". Lasciala aperta e prova a premere
   "Stampa in ufficio" dal gestionale: dopo al massimo 30 secondi la stampante
   deve stampare da sola.
4. Per farlo partire sempre, senza dover riaprire la finestra a mano, usa
   l'Utilità di pianificazione di Windows ("Task Scheduler"):
   - Apri "Utilità di pianificazione" -> "Crea attività" (non "Crea attività di base").
   - Scheda Generale: nome "Ipsofarma Print Agent". Seleziona
     "Esegui solo se l'utente ha eseguito l'accesso".
   - Scheda Trigger: Nuovo -> "All'accesso".
   - Scheda Azioni: Nuovo -> Programma/script: powershell.exe
     Aggiungi argomenti:
       -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\IpsofarmaPrintAgent\print-agent.ps1"
   - Scheda Impostazioni: spunta "Se l'attività non riesce, riavvia ogni" -> 1 minuto,
     "Tenta di riavviare fino a" -> un numero alto (es. 999).
   - Salva. Da ora in poi parte da solo a ogni accesso, senza finestre visibili,
     e si riavvia da solo se si blocca.
#>

# ============ CONFIGURAZIONE — compila questi tre valori ============
$GITHUB_TOKEN  = "INCOLLA_QUI_IL_TUO_TOKEN_GITHUB"
$GITHUB_REPO   = "Stefanobozzo82/ipsofarma-crm"
$GITHUB_BRANCH = "main"
$POLL_SECONDS  = 30
# ======================================================================

$QUEUE_PATH = "print-queue.json"
$headers = @{ Authorization = "token $GITHUB_TOKEN"; "User-Agent" = "Ipsofarma-Print-Agent" }

function Get-EdgePath {
    $candidates = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    return $null
}

function Get-Queue {
    $url = "https://api.github.com/repos/$GITHUB_REPO/contents/$($QUEUE_PATH)?ref=$GITHUB_BRANCH"
    try {
        $resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        $bytes = [Convert]::FromBase64String(($resp.content -replace "`n", ""))
        $json = [System.Text.Encoding]::UTF8.GetString($bytes)
        $data = $json | ConvertFrom-Json
        if (-not $data.items) { $data | Add-Member -NotePropertyName items -NotePropertyValue @() -Force }
        return @{ sha = $resp.sha; data = $data }
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($status -eq 404) { return @{ sha = $null; data = [PSCustomObject]@{ items = @() } } }
        Write-Host "Errore lettura coda: $($_.Exception.Message)"
        return $null
    }
}

function Save-Queue($data, $sha) {
    $json = $data | ConvertTo-Json -Depth 20
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $b64 = [Convert]::ToBase64String($bytes)
    $body = @{ message = "Print agent: coda aggiornata"; content = $b64; branch = $GITHUB_BRANCH }
    if ($sha) { $body.sha = $sha }
    $url = "https://api.github.com/repos/$GITHUB_REPO/contents/$QUEUE_PATH"
    try {
        Invoke-RestMethod -Uri $url -Headers $headers -Method Put -Body ($body | ConvertTo-Json) -ContentType "application/json" | Out-Null
        return $true
    } catch {
        Write-Host "Errore salvataggio coda (probabile conflitto, riproverò al prossimo giro): $($_.Exception.Message)"
        return $false
    }
}

function Remove-QueueItem($itemId) {
    $q = Get-Queue
    if (-not $q) { return }
    $remaining = @($q.data.items | Where-Object { $_.id -ne $itemId })
    Save-Queue -data ([PSCustomObject]@{ items = $remaining }) -sha $q.sha | Out-Null
}

function Print-Job($item) {
    $edge = Get-EdgePath
    if (-not $edge) {
        Write-Host "Microsoft Edge non trovato: impossibile stampare $($item.title)"
        return $false
    }
    $tmpFile = Join-Path $env:TEMP ("stampa-" + $item.id + ".html")
    Set-Content -Path $tmpFile -Value $item.html -Encoding UTF8
    $uri = "file:///" + ($tmpFile -replace '\\', '/')
    try {
        $proc = Start-Process -FilePath $edge -ArgumentList "--kiosk-printing", $uri -PassThru
        Start-Sleep -Seconds 8
        if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
        return $true
    } catch {
        Write-Host "Errore durante la stampa di $($item.title): $($_.Exception.Message)"
        return $false
    } finally {
        Remove-Item $tmpFile -ErrorAction SilentlyContinue
    }
}

Write-Host "Agente di stampa avviato. Controllo ogni $POLL_SECONDS secondi (repo: $GITHUB_REPO)..."
while ($true) {
    $q = Get-Queue
    if ($q -and $q.data.items) {
        $items = @($q.data.items)
        if ($items.Count -gt 0) {
            Write-Host "$($items.Count) documento/i in coda"
            foreach ($item in $items) {
                Write-Host "Stampo: $($item.title)"
                $ok = Print-Job $item
                if ($ok) { Remove-QueueItem $item.id }
            }
        }
    }
    Start-Sleep -Seconds $POLL_SECONDS
}
