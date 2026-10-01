<#
IPSOFARMA — Agente di sincronizzazione Maestro Gold
==================================================
Gira sul PC dove è installato Maestro Gold, avviato dall'Utilità di
pianificazione ogni ora (vedi installa.bat). Ad ogni avvio:
  1. guarda i file dati di Maestro elencati sotto (documenti, righe,
     anagrafiche) nella cartella indicata in maestro-agent.config.json;
  2. per quelli cambiati dall'ultimo invio (data di modifica o dimensione),
     li legge senza bloccarli — Maestro può restare aperto —, li comprime
     e li invia al gestionale (Edge Function maestro-sync);
  3. termina. Nessuna finestra, nessuna domanda.

Il gestionale riconosce l'azienda dalla chiave di sincronizzazione (creata
in Impostazioni azienda → Collegamento Maestro): senza chiave valida non
accetta nulla. Il registro delle operazioni è in maestro-agent.log, nella
stessa cartella di questo file.
#>

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $here 'maestro-agent.config.json'
$statePath = Join-Path $here 'maestro-agent.state.json'
$logPath = Join-Path $here 'maestro-agent.log'

# Tabelle di Maestro inviate al gestionale (solo queste: niente
# configurazioni, password o altri archivi della cartella).
$TABELLE = @(
  'CLIENTI', 'FORNITOR',
  'VENDITE', 'BOLLE', 'ORDINICL', 'ORDINI', 'ACQUISTI', 'PREVENTI', 'DDTINFATT',
  'ARCART_V', 'ARCART_B', 'ARCART_L', 'ARCART_O', 'ARCART_A', 'ARCART_P'
)

function Write-Log([string]$msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logPath -Value $line -Encoding UTF8
  if ((Test-Path $logPath) -and (Get-Item $logPath).Length -gt 1MB) {
    $keep = Get-Content $logPath -Tail 2000
    Set-Content -Path $logPath -Value $keep -Encoding UTF8
  }
}

# Legge un file anche se Maestro lo tiene aperto (FileShare.ReadWrite) e lo
# restituisce compresso gzip.
function Read-Gzip([string]$path) {
  $in = [System.IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
  try {
    $mem = New-Object System.IO.MemoryStream
    $gz = New-Object System.IO.Compression.GZipStream($mem, [System.IO.Compression.CompressionMode]::Compress, $true)
    $in.CopyTo($gz)
    $gz.Dispose()
    return $mem.ToArray()
  } finally { $in.Dispose() }
}

function Get-Firma([string]$path) {
  if (-not (Test-Path $path)) { return $null }
  $f = Get-Item $path
  return "{0}|{1}" -f $f.LastWriteTimeUtc.Ticks, $f.Length
}

function Send-Tabella($cfg, [string]$tabella, [string]$dbf, [string]$dbt) {
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromMinutes(5)
  $client.DefaultRequestHeaders.Add('x-maestro-key', $cfg.chiave)
  if ($cfg.apikey) { $client.DefaultRequestHeaders.Add('apikey', $cfg.apikey) }
  $form = New-Object System.Net.Http.MultipartFormDataContent
  $form.Add((New-Object System.Net.Http.StringContent($tabella)), 'tabella')
  $form.Add((New-Object System.Net.Http.StringContent((Get-Item $dbf).LastWriteTime.ToString('s'))), 'modificato')
  $form.Add((New-Object System.Net.Http.StringContent("$env:COMPUTERNAME")), 'agente')
  $form.Add((New-Object System.Net.Http.ByteArrayContent(,(Read-Gzip $dbf))), 'dbf', "$tabella.DBF.gz")
  if ($dbt -and (Test-Path $dbt)) {
    $form.Add((New-Object System.Net.Http.ByteArrayContent(,(Read-Gzip $dbt))), 'dbt', "$tabella.DBT.gz")
  }
  try {
    $resp = $client.PostAsync($cfg.url, $form).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) { throw "HTTP $([int]$resp.StatusCode): $body" }
    return $body
  } finally { $client.Dispose() }
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  if (-not (Test-Path $configPath)) { throw "Manca ${configPath}: esegui di nuovo installa.bat." }
  $cfg = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not (Test-Path $cfg.cartella)) { throw "Cartella dati di Maestro non trovata: $($cfg.cartella)" }

  $state = @{}
  if (Test-Path $statePath) {
    (Get-Content $statePath -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $state[$_.Name] = $_.Value }
  }

  $inviati = 0
  foreach ($t in $TABELLE) {
    $dbf = Join-Path $cfg.cartella "$t.DBF"
    $dbt = Join-Path $cfg.cartella "$t.DBT"
    $firma = Get-Firma $dbf
    if (-not $firma) { continue }
    $firmaMemo = Get-Firma $dbt
    $firmaTot = "$firma/$firmaMemo"
    if ($state[$t] -eq $firmaTot) { continue }
    try {
      $esito = Send-Tabella $cfg $t $dbf $dbt
      $state[$t] = $firmaTot
      $inviati++
      Write-Log "$t inviato: $esito"
    } catch {
      Write-Log "ERRORE $t : $($_.Exception.Message)"
    }
  }
  $state | ConvertTo-Json | Set-Content -Path $statePath -Encoding UTF8
  if ($inviati -eq 0) { Write-Log 'Nessun file cambiato.' }
} catch {
  Write-Log "ERRORE: $($_.Exception.Message)"
  exit 1
}
