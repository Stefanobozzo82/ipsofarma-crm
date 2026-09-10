<#
IPSOFARMA CRM — Agente di scansione locale
============================================
Gira in background sul PC collegato allo scanner. Sta in ascolto SOLO su
questo stesso computer (http://localhost, mai raggiungibile da fuori) e,
quando il gestionale (pulsante "🖨 Scansiona da PC" — app/scan-import.js)
lo richiede, avvia lo scanner tramite Windows (WIA, incluso in ogni
Windows senza installare driver o programmi aggiuntivi), acquisisce
un'immagine e la restituisce al browser. Il file scansionato NON viene
mai salvato in modo permanente: solo un file temporaneo per il tempo
strettamente necessario a leggerlo, cancellato subito dopo averlo
restituito al gestionale.

A differenza dell'agente di stampa (print-agent.ps1), qui non serve
NESSUNA configurazione — niente token, niente credenziali: questo script
fa solo da ponte verso lo scanner, tutto il resto (login, lettura AI,
salvataggio) lo fa già il browser con la sessione dell'utente collegato.
Per questo può essere distribuito così com'è, identico per ogni cliente,
senza modificare nulla — pensato per un gestionale venduto a più aziende,
non per una singola installazione su misura.

---- INSTALLAZIONE (una tantum) ----
1. Copia questo file in una cartella stabile del PC, es.
   C:\IpsofarmaScanAgent\scan-agent.ps1
2. Sblocca il file PRIMA di avviarlo: essendo scaricato da internet,
   Windows lo marca come potenzialmente pericoloso (succede a QUALUNQUE
   script scaricato, non è un problema di questo file) e altrimenti
   rifiuta di eseguirlo o mostra un avviso SmartScreen. Tasto destro sul
   file -> Proprietà -> in basso, spunta la casella "Sblocca" -> OK. Se
   nonostante lo sblocco compare comunque una schermata blu SmartScreen,
   clicca "Ulteriori informazioni" e poi "Esegui comunque".
3. Avvia l'agente: tasto destro sul file -> "Esegui con PowerShell". Deve
   apparire una finestra nera con scritto "Agente di scansione
   avviato...". Se invece la finestra si apre e si richiude subito (o
   mostra un errore tipo "script disabilitato" / "non è possibile
   caricare perché l'esecuzione di script è disabilitata"), avviala così
   invece: apri PowerShell, poi incolla (adattando il percorso se
   diverso):
     powershell -ExecutionPolicy Bypass -File "C:\IpsofarmaScanAgent\scan-agent.ps1"
   Lasciala aperta, vai sul gestionale (es. "DDT fornitore" -> Importa) e
   premi "🖨 Scansiona da PC": deve aprirsi la finestra di scansione di
   Windows.
4. Se il gestionale continua a dire "Programma di scansione non trovato"
   anche con la finestra nera aperta e senza errori: (a) apri sullo
   STESSO PC, nello stesso browser, l'indirizzo
   http://localhost:18245/ping — deve mostrare la scritta "ok"; se non
   si apre, l'agente non è davvero in ascolto (torna al punto 3); (b) se
   invece "ok" si vede ma il gestionale non lo trova lo stesso, controlla
   che non sia comparso un avviso del Firewall di Windows ("Windows
   Firewall ha bloccato alcune funzionalità di questa app") e clicca
   "Consenti l'accesso"; (c) assicurati di avere questa versione
   aggiornata del file — le versioni dell'agente precedenti a questa
   nota non rispondevano ancora al controllo "Private Network Access"
   che i browser più recenti richiedono per contattare un programma
   locale da una pagina HTTPS come il gestionale.
5. Per farlo partire sempre, senza dover riaprire la finestra a mano, usa
   l'Utilità di pianificazione di Windows ("Task Scheduler") — stessa
   identica procedura descritta in print-agent.ps1 nella stessa cartella,
   sostituendo il nome dell'attività (es. "Ipsofarma Scan Agent") e il
   percorso del file (-File "C:\IpsofarmaScanAgent\scan-agent.ps1").
   Per evitare che compaia anche solo per un istante l'icona di
   PowerShell nella barra delle applicazioni, usa run-scan-agent-hidden.vbs
   allo stesso modo di run-hidden.vbs.

---- SICUREZZA ----
Il server risponde SOLO a richieste che arrivano dal dominio del
gestionale (controllo dell'header Origin — qualunque altro sito web
aperto nello stesso browser non può richiamare lo scanner a tua insaputa)
ed è raggiungibile SOLO da questo stesso PC (mai dalla rete locale o da
internet: HttpListener qui è agganciato esplicitamente a "localhost", non
a "+" o a un indirizzo di rete).
#>

# ============ CONFIGURAZIONE ============
# Porta locale su cui il gestionale cerca l'agente (deve combaciare con
# AGENT_PORT in app/scan-import.js) e unico dominio da cui accettare
# richieste — qualunque altra origine viene rifiutata.
$PORT            = 18245
$ALLOWED_ORIGIN  = "https://stefanobozzo82.github.io"
# GUID del formato immagine WIA da richiedere allo scanner: PNG, senza
# perdita — a differenza del JPEG non introduce artefatti che
# peggiorerebbero la lettura AI del testo.
$WIA_FORMAT_PNG  = "{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}"
# ==========================================

function Write-Log($msg) { Write-Host "$(Get-Date -Format 'HH:mm:ss') - $msg" }

function Send-Response($response, [int]$statusCode, [byte[]]$bytes, [string]$contentType, [string]$origin) {
    $response.StatusCode = $statusCode
    $response.ContentType = $contentType
    if ($origin -eq $ALLOWED_ORIGIN) {
        $response.Headers.Add("Access-Control-Allow-Origin", $ALLOWED_ORIGIN)
        # Richiesto da Chrome/Edge (Private Network Access) sulle risposte
        # verso una pagina HTTPS che contatta un indirizzo locale come
        # questo — senza questo header il browser scarta la risposta e il
        # gestionale vede l'agente come "non trovato" anche se qui è
        # acceso e ha risposto correttamente. Vedi anche la gestione di
        # OPTIONS più sotto, dove serve allo stesso scopo sul preflight.
        $response.Headers.Add("Access-Control-Allow-Private-Network", "true")
    }
    if ($bytes -and $bytes.Length -gt 0) { $response.OutputStream.Write($bytes, 0, $bytes.Length) }
    $response.OutputStream.Close()
}
function Send-Text($response, [int]$statusCode, [string]$text, [string]$origin) {
    Send-Response $response $statusCode ([System.Text.Encoding]::UTF8.GetBytes($text)) "text/plain; charset=utf-8" $origin
}

# Acquisisce un'immagine dallo scanner tramite la finestra di scansione
# nativa di Windows (WIA.CommonDialog) — mostra lei stessa l'anteprima e
# il pulsante "Scansiona": l'utente vede cosa sta acquisendo e può
# regolare risoluzione/sorgente prima di confermare, invece di uno
# scatto "alla cieca". DeviceType=1 (Scanner, esclude webcam/fotocamere
# eventualmente presenti), Intent=1 (Testo — orienta lo scanner verso
# impostazioni adatte a documenti, non foto), Bias=65536
# (MaximizeQuality, non MinimizeSize: qui la qualità per l'OCR conta più
# della dimensione del file). Ritorna $null se l'utente annulla.
function Invoke-Scan {
    $dialog = New-Object -ComObject WIA.CommonDialog
    return $dialog.ShowAcquireImage(1, 1, 65536, $WIA_FORMAT_PNG, $false, $true, $false)
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$PORT/")
try {
    $listener.Start()
} catch {
    Write-Log "Impossibile avviare l'agente sulla porta $PORT — un'altra copia è già in esecuzione? ($($_.Exception.Message))"
    exit 1
}
Write-Log "Agente di scansione avviato. In ascolto su http://localhost:$PORT (solo da questo PC)."

while ($listener.IsListening) {
    $context = $null
    try { $context = $listener.GetContext() } catch { continue }
    $request = $context.Request
    $response = $context.Response
    $origin = $request.Headers["Origin"]
    $path = $request.Url.AbsolutePath

    try {
        if ($request.HttpMethod -eq "OPTIONS") {
            # "Preflight" che il browser manda PRIMA della vera richiesta
            # quando una pagina HTTPS (il gestionale) contatta un
            # indirizzo locale come questo (Private Network Access, in
            # Chrome/Edge). Se non risponde con questi header esatti, il
            # browser blocca la richiesta vera senza nemmeno avvisare
            # l'agente: il gestionale dice "programma non trovato" anche
            # se qui è acceso e funzionante — non è un errore da correggere
            # sul PC del cliente, va gestito qui una volta per tutte.
            if ($origin -eq $ALLOWED_ORIGIN) {
                $response.Headers.Add("Access-Control-Allow-Origin", $ALLOWED_ORIGIN)
                $response.Headers.Add("Access-Control-Allow-Private-Network", "true")
                $response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
                $response.Headers.Add("Access-Control-Allow-Headers", "*")
                $response.StatusCode = 204
            } else {
                $response.StatusCode = 403
            }
            $response.OutputStream.Close()
            continue
        }
        if ($path -eq "/ping") {
            # Controllo rapido di "c'è l'agente?" dal gestionale, prima di
            # avviare una vera scansione — vedi app/scan-import.js.
            Send-Text $response 200 "ok" $origin
        }
        elseif ($path -eq "/scan") {
            if ($origin -ne $ALLOWED_ORIGIN) {
                Write-Log "Richiesta di scansione rifiutata da un'origine non autorizzata: '$origin'"
                Send-Text $response 403 "Origine non autorizzata." $origin
            } else {
                Write-Log "Avvio scansione..."
                try {
                    $imageFile = Invoke-Scan
                } catch {
                    Write-Log "Errore durante la scansione: $($_.Exception.Message)"
                    Send-Text $response 500 "Errore durante la scansione: $($_.Exception.Message) — controlla che lo scanner sia acceso e collegato." $origin
                    $imageFile = $null
                    continue
                }
                if ($null -eq $imageFile) {
                    Write-Log "Scansione annullata dall'utente."
                    Send-Text $response 499 "Scansione annullata." $origin
                } else {
                    # File temporaneo SOLO per il tempo di leggerlo in memoria:
                    # WIA sa salvare solo su disco, non restituire i byte
                    # direttamente — cancellato subito dopo, prima ancora di
                    # rispondere al browser. Nessuna copia resta sul PC.
                    $tempPath = Join-Path $env:TEMP ("ipsofarma-scan-" + [guid]::NewGuid().ToString() + ".png")
                    try {
                        $imageFile.SaveFile($tempPath)
                        $bytes = [System.IO.File]::ReadAllBytes($tempPath)
                        Send-Response $response 200 $bytes "image/png" $origin
                        Write-Log "Scansione completata ($($bytes.Length) byte), inviata al gestionale."
                    } finally {
                        Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        }
        else {
            Send-Text $response 404 "Non trovato." $origin
        }
    } catch {
        Write-Log "Errore imprevisto: $($_.Exception.Message)"
        try { Send-Text $response 500 "Errore interno dell'agente." $origin } catch {}
    }
}
