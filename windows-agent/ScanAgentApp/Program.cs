// IPSOFARMA CRM — Agente di scansione locale (versione .exe)
// =============================================================
// Stessa funzione identica di scan-agent.ps1 (vedi quel file per la
// versione PowerShell, tenuta per chi preferisce quella strada), ma
// distribuita come UN SOLO file eseguibile Windows autosufficiente
// (nessun runtime .NET da installare a parte — è incluso nell'exe),
// che si registra da solo per l'avvio automatico a ogni accesso a
// Windows: niente più Task Scheduler da configurare a mano, niente più
// file .vbs separato per nascondere la finestra (qui non c'è proprio
// nessuna finestra, OutputType=WinExe).
//
// Richiesta reale, dopo aver già usato la versione PowerShell con
// successo: "vorrei che lo script [...] sia installabile su windows
// come un file eseguibile e che si avvii in automatico".
//
// Resta comunque un semplice ponte verso lo scanner: gira SOLO su
// questo PC (http://localhost, mai raggiungibile da fuori), non salva
// mai il documento scansionato, non richiede nessuna configurazione —
// stesso identico file per ogni cliente del gestionale.

using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

namespace IpsofarmaScanAgent;

internal static class Program
{
    // ============ CONFIGURAZIONE ============
    // Deve combaciare con AGENT_PORT in app/scan-import.js.
    private const int Port = 18245;
    // Domini da cui accettare richieste — qualunque altra origine viene
    // rifiutata. Il gestionale è raggiungibile da DUE indirizzi in
    // parallelo (Cloudflare Workers e GitHub Pages, stesso sito
    // pubblicato in due posti — vedi wrangler.jsonc / capacitor.config.json
    // per il primo) — un insieme, non un singolo dominio, altrimenti
    // l'agente rifiuta chi usa l'altro indirizzo (bug reale: funzionava
    // per chi apriva il gestionale da un indirizzo, "non trovato" per chi
    // lo apriva dall'altro).
    private static readonly HashSet<string> AllowedOrigins = new(StringComparer.Ordinal)
    {
        "https://ipsofarma-crm.stefanobozzo82.workers.dev",
        "https://stefanobozzo82.github.io",
    };
    // GUID del formato immagine WIA da richiedere allo scanner: PNG,
    // senza perdita — a differenza del JPEG non introduce artefatti che
    // peggiorerebbero la lettura AI del testo.
    private const string WiaFormatPng = "{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}";
    private const string AutostartValueName = "IpsofarmaScanAgent";
    // ==========================================

    private static readonly string LogDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "IpsofarmaScanAgent");
    private static readonly string LogPath = Path.Combine(LogDir, "agent.log");

    private static void Main()
    {
        Log("Agente di scansione avviato.");

        // Auto-registrazione per l'avvio automatico: nessun installer a
        // parte, nessuna configurazione manuale di Task Scheduler — la
        // prima volta che questo exe viene avviato (anche solo con un
        // doppio clic) si registra da solo per ripartire ad ogni accesso
        // a Windows. Le volte successive (comprese quelle avviate da
        // Windows stesso all'accesso) non mostrano più l'avviso.
        bool justRegistered = EnsureAutostart();
        if (justRegistered)
        {
            Log("Registrato per l'avvio automatico ad ogni accesso a Windows.");
            ShowWelcomeMessage();
        }

        HttpListener listener = new();
        listener.Prefixes.Add($"http://localhost:{Port}/");
        try
        {
            listener.Start();
        }
        catch (Exception ex)
        {
            Log($"Impossibile avviare l'agente sulla porta {Port} — un'altra copia è già in esecuzione? ({ex.Message})");
            return;
        }
        Log($"In ascolto su http://localhost:{Port} (solo da questo PC).");

        while (listener.IsListening)
        {
            HttpListenerContext context;
            try { context = listener.GetContext(); }
            catch { continue; }
            // Su un thread del pool, non sul ciclo di accettazione: una
            // scansione lenta o bloccata (vedi InvokeScan più sotto) non
            // deve impedire all'agente di rispondere a un /ping nel
            // frattempo — segnalato dall'utente: durante uno scan
            // rimasto "in attesa", anche il pulsante "Verifico il
            // programma di scansione..." nel browser restava fermo,
            // perché QUESTO ciclo — prima single-threaded — era occupato
            // e non accettava nessun'altra richiesta finché quella in
            // corso non finiva.
            ThreadPool.QueueUserWorkItem(_ => HandleRequest(context));
        }
    }

    private static void HandleRequest(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;
        string? origin = request.Headers["Origin"];
        string path = request.Url?.AbsolutePath ?? "";

        try
        {
            if (request.HttpMethod == "OPTIONS")
            {
                // "Preflight" che il browser manda PRIMA della vera
                // richiesta quando una pagina HTTPS (il gestionale)
                // contatta un indirizzo locale come questo (Private
                // Network Access, in Chrome/Edge). Se non risponde con
                // questi header esatti, il browser blocca la richiesta
                // vera senza nemmeno avvisare l'agente.
                if (origin != null && AllowedOrigins.Contains(origin))
                {
                    response.Headers.Add("Access-Control-Allow-Origin", origin);
                    response.Headers.Add("Access-Control-Allow-Private-Network", "true");
                    response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS");
                    response.Headers.Add("Access-Control-Allow-Headers", "*");
                    response.StatusCode = 204;
                }
                else
                {
                    response.StatusCode = 403;
                }
                response.OutputStream.Close();
                return;
            }

            if (path == "/ping")
            {
                // Controllo rapido di "c'è l'agente?" dal gestionale,
                // prima di avviare una vera scansione — vedi
                // app/scan-import.js.
                SendText(response, 200, "ok", origin);
            }
            else if (path == "/scan")
            {
                if (origin == null || !AllowedOrigins.Contains(origin))
                {
                    Log($"Richiesta di scansione rifiutata da un'origine non autorizzata: '{origin}'");
                    SendText(response, 403, "Origine non autorizzata.", origin);
                }
                else
                {
                    Log("Avvio scansione...");
                    byte[]? bytes = InvokeScan(out string? scanError, out bool cancelled);
                    if (scanError != null)
                    {
                        Log($"Errore durante la scansione: {scanError}");
                        SendText(response, 500, $"Errore durante la scansione: {scanError} — controlla che lo scanner sia acceso e collegato.", origin);
                    }
                    else if (cancelled)
                    {
                        Log("Scansione annullata dall'utente.");
                        SendText(response, 499, "Scansione annullata.", origin);
                    }
                    else
                    {
                        SendResponse(response, 200, bytes, "image/png", origin);
                        Log($"Scansione completata ({bytes?.Length ?? 0} byte), inviata al gestionale.");
                    }
                }
            }
            else
            {
                SendText(response, 404, "Non trovato.", origin);
            }
        }
        catch (Exception ex)
        {
            Log($"Errore imprevisto: {ex.Message}");
            try { SendText(response, 500, "Errore interno dell'agente.", origin); } catch { /* risposta già chiusa */ }
        }
    }

    private static void SendResponse(HttpListenerResponse response, int statusCode, byte[]? bytes, string contentType, string? origin)
    {
        response.StatusCode = statusCode;
        response.ContentType = contentType;
        if (origin != null && AllowedOrigins.Contains(origin))
        {
            response.Headers.Add("Access-Control-Allow-Origin", origin);
            // Richiesto da Chrome/Edge (Private Network Access) sulle
            // risposte verso una pagina HTTPS che contatta un indirizzo
            // locale come questo — vedi anche la gestione di OPTIONS qui
            // sopra, dove serve allo stesso scopo sul preflight.
            response.Headers.Add("Access-Control-Allow-Private-Network", "true");
        }
        if (bytes is { Length: > 0 }) response.OutputStream.Write(bytes, 0, bytes.Length);
        response.OutputStream.Close();
    }

    private static void SendText(HttpListenerResponse response, int statusCode, string text, string? origin)
        => SendResponse(response, statusCode, Encoding.UTF8.GetBytes(text), "text/plain; charset=utf-8", origin);

    // Tempo massimo per una scansione: sufficiente per posizionare il
    // foglio, scegliere le opzioni nella finestra dello scanner e
    // scansionare davvero, ma non infinito — vedi il commento su
    // InvokeScan() più sotto sul perché serve un limite qui, a differenza
    // del timeout lato browser (già presente, 5 minuti) che da solo non
    // bastava.
    private static readonly TimeSpan ScanTimeout = TimeSpan.FromMinutes(4);

    // Segnalato dall'utente (log dell'agente): "Exception has been thrown
    // by the target of an invocation." — il messaggio generico che .NET
    // mette sempre su una TargetInvocationException, il contenitore che
    // avvolge OGNI eccezione lanciata da un metodo COM chiamato per
    // reflection (InvokeMember, usato qui sotto): il vero errore (perché
    // lo scanner ha fallito) restava nascosto in InnerException, mai
    // scritto nel log. Usata sia per il messaggio d'errore sia per capire
    // cosa è successo davvero la prossima volta che si presenta.
    private static string UnwrapMessage(Exception ex) => ex is System.Reflection.TargetInvocationException { InnerException: { } inner } ? inner.Message : ex.Message;

    // Acquisisce un'immagine dallo scanner tramite la finestra di
    // scansione nativa di Windows (WIA.CommonDialog, la stessa API usata
    // da scan-agent.ps1) — mostra lei stessa l'anteprima e il pulsante
    // "Scansiona": l'utente vede cosa sta acquisendo e può regolare
    // risoluzione/sorgente prima di confermare. DeviceType=1 (Scanner),
    // Intent=1 (Testo), Bias=65536 (MaximizeQuality). Late binding via
    // reflection (Type.GetTypeFromProgID + InvokeMember), non "dynamic":
    // stesso approccio COM di PowerShell, senza bisogno di riferimenti
    // extra al binder DLR. Su un sistema senza COM/WIA (qualunque cosa
    // che non sia Windows) GetTypeFromProgID restituisce null: fallisce
    // in modo pulito invece di andare in crash, esattamente come già
    // verificato per scan-agent.ps1 collaudato su Linux.
    //
    // Girata su un thread STA dedicato, non su quello (MTA, il default in
    // .NET) che gestisce la richiesta HTTP: WIA.CommonDialog è un
    // controllo con una vera finestra e un suo ciclo messaggi, pensato per
    // girare in un appartamento COM a thread singolo (STA) — la stessa
    // ragione per cui ogni programma Windows Forms/WPF marca il proprio
    // thread [STAThread]. Su un thread MTA il comportamento non è
    // garantito: a volte funziona, a volte resta bloccato in attesa di un
    // messaggio che nessuno pompa, a volte lancia un'eccezione confusa —
    // proprio i sintomi segnalati ("apre la finestra, scelgo scansiona,
    // rimane in attesa" e, nel log, l'eccezione senza un vero motivo).
    // Un timeout sul Join() copre il caso in cui restasse comunque bloccato
    // (driver del tutto in stallo): la richiesta HTTP riceve un errore
    // chiaro invece di restare appesa per sempre, e — dopo la modifica al
    // ciclo principale più sopra — l'agente resta comunque libero di
    // rispondere a un /ping nel frattempo.
    private static byte[]? InvokeScan(out string? error, out bool cancelled)
    {
        string? localError = null;
        bool localCancelled = false;
        byte[]? result = null;
        var thread = new Thread(() =>
        {
            try
            {
                result = InvokeScanCore(out localError, out localCancelled);
            }
            catch (Exception ex)
            {
                localError = UnwrapMessage(ex);
            }
        });
        thread.IsBackground = true; // non deve impedire la chiusura dell'agente se restasse bloccato per sempre
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        if (!thread.Join(ScanTimeout))
        {
            error = $"lo scanner non ha risposto entro {ScanTimeout.TotalMinutes:0} minuti (controlla che non sia rimasta aperta un'altra finestra dello scanner in attesa di un click, es. \"Fine\"/\"Scansiona un'altra pagina?\").";
            cancelled = false;
            return null;
        }
        error = localError;
        cancelled = localCancelled;
        return result;
    }

    private static byte[]? InvokeScanCore(out string? error, out bool cancelled)
    {
        error = null;
        cancelled = false;
        try
        {
            Type? dialogType = Type.GetTypeFromProgID("WIA.CommonDialog");
            if (dialogType == null)
            {
                error = "WIA non disponibile su questo sistema (serve Windows con un driver scanner installato).";
                return null;
            }
            object dialog = Activator.CreateInstance(dialogType)!;
            object? imageFile = dialogType.InvokeMember("ShowAcquireImage", System.Reflection.BindingFlags.InvokeMethod,
                null, dialog, new object[] { 1, 1, 65536, WiaFormatPng, false, true, false });
            if (imageFile == null) { cancelled = true; return null; }

            // File temporaneo SOLO per il tempo di leggerlo in memoria: WIA
            // sa salvare solo su disco, non restituire i byte direttamente
            // — cancellato subito dopo, prima ancora di rispondere al
            // browser. Nessuna copia resta sul PC in nessun momento.
            string tempPath = Path.Combine(Path.GetTempPath(), $"ipsofarma-scan-{Guid.NewGuid()}.png");
            try
            {
                imageFile.GetType().InvokeMember("SaveFile", System.Reflection.BindingFlags.InvokeMethod,
                    null, imageFile, new object[] { tempPath });
                return File.ReadAllBytes(tempPath);
            }
            finally
            {
                try { File.Delete(tempPath); } catch { /* già cancellato o mai creato */ }
            }
        }
        catch (Exception ex)
        {
            error = UnwrapMessage(ex);
            return null;
        }
    }

    // Registra l'agente in HKEY_CURRENT_USER\...\Run: parte da sola ad
    // ogni accesso a Windows, senza bisogno di diritti di amministratore
    // (HKCU, non HKLM) né di Task Scheduler configurato a mano. Scrive
    // solo se il valore non è già quello giusto (percorso dell'exe
    // corrente) — così un aggiornamento del file, spostato nella stessa
    // cartella, non mostra di nuovo l'avviso di benvenuto ad ogni avvio.
    // Ritorna true SOLO se lo ha appena impostato ora (prima volta, o
    // percorso cambiato).
    private static bool EnsureAutostart()
    {
        try
        {
            string? exePath = Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(exePath)) return false;
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Run", writable: true);
            if (key == null) return false;
            string desired = $"\"{exePath}\"";
            string? current = key.GetValue(AutostartValueName) as string;
            if (string.Equals(current, desired, StringComparison.OrdinalIgnoreCase)) return false;
            key.SetValue(AutostartValueName, desired);
            return true;
        }
        catch (Exception ex)
        {
            Log($"Impossibile registrare l'avvio automatico: {ex.Message}");
            return false;
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    // Avviso UNA TANTUM alla primissima registrazione — conferma che è
    // andato tutto a buon fine senza dover controllare un file di log:
    // l'utente non tecnico ha un riscontro immediato di "ha funzionato".
    // Nessuna finestra della console (OutputType=WinExe): senza questo
    // messaggio, avviare l'agente non darebbe alcun segno visibile.
    private static void ShowWelcomeMessage()
    {
        if (!OperatingSystem.IsWindows()) return;
        try
        {
            const uint MB_ICONINFORMATION = 0x40;
            MessageBoxW(IntPtr.Zero,
                "Agente di scansione IPSOFARMA installato e avviato.\n\n" +
                "Da questo momento si avvierà da solo automaticamente ad ogni accesso a Windows: non serve fare altro, puoi anche spegnere e riaccendere il PC.\n\n" +
                "Puoi chiudere questo avviso.",
                "IPSOFARMA — Agente di scansione", MB_ICONINFORMATION);
        }
        catch { /* niente di grave se il messaggio non riesce a comparire */ }
    }

    // Nessuna finestra console (WinExe): l'unico modo per l'utente (o per
    // chi lo assiste da remoto) di vedere cosa è successo è questo file,
    // non l'output a schermo. Troncato oltre ~1 MB: pensato per restare
    // acceso per sempre grazie all'avvio automatico, un log senza limiti
    // finirebbe per crescere indefinitamente.
    private static void Log(string msg)
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            if (File.Exists(LogPath) && new FileInfo(LogPath).Length > 1_000_000) File.Delete(LogPath);
            File.AppendAllText(LogPath, $"{DateTime.Now:HH:mm:ss} - {msg}{Environment.NewLine}");
        }
        catch { /* niente di grave se il log non si riesce a scrivere */ }
    }
}
