package com.ipsofarma.crm;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/*
 * "Stampa" e "⬇ Scarica" (PDF/Excel/XML — vedi app/print.js e
 * downloadFatturaPAXml() in fatture.html) funzionano in un vero browser
 * mobile (verificato con Playwright, vedi le sezioni "Controllo mobile..."
 * in saas/README.md) ma NON in questa app: qui la pagina web vive dentro
 * una WebView incorporata, senza barra degli indirizzi né gestore dei
 * download propri di un browser. Due conseguenze concrete, confermate
 * leggendo il sorgente di Capacitor (BridgeWebChromeClient.java non
 * sovrascrive onCreateWindow, e nessuna classe imposta un
 * WebView.setDownloadListener):
 * - window.open('', '_blank') (usato da "Stampa") non crea una vera
 *   finestra: il pulsante mostrerebbe sempre l'avviso "popup bloccato",
 *   fuorviante qui — non esiste un'impostazione "consenti popup" da
 *   attivare in un'app nativa.
 * - Un <a download> su un URL blob: (usato da PDF/Excel/XML) non ha
 *   NESSUN gestore che lo intercetti: il clic non fa letteralmente nulla,
 *   senza nemmeno un errore visibile.
 *
 * Le due classi sotto (esposte a JS via addJavascriptInterface, con lo
 * stesso identico nome usato lato JS per capire se girare nell'app nativa
 * o in un browser vero — vedi i punti "if (window.AndroidDownload/
 * AndroidPrint)" in app/print.js e fatture.html) sostituiscono quei due
 * meccanismi con l'equivalente nativo Android:
 * - AndroidDownload.saveFile(): salva il file (arriva già come base64,
 *   generato lato JS da jsPDF/SheetJS/la stringa XML) nella cartella
 *   esterna PRIVATA dell'app (getExternalFilesDir — nessun permesso di
 *   storage richiesto su NESSUNA versione Android, a differenza della
 *   cartella Download pubblica) e apre subito un Intent di condivisione/
 *   apertura: l'utente sceglie con quale app aprirlo o salvarlo altrove
 *   (Drive, WhatsApp, Files, un altro gestionale...) — più utile di un
 *   salvataggio silenzioso in una cartella che potrebbe non pensare di
 *   controllare.
 * - AndroidPrint.printHtml(): carica l'HTML già pronto (lo stesso
 *   prodotto da buildStandaloneDoc(), identico a quanto si vedrebbe in un
 *   browser) in una WebView "usa e getta" invisibile, e ne genera un job
 *   di stampa con l'API nativa di Android (PrintManager) — lo stesso
 *   sistema di stampa/"Salva come PDF" di qualunque altra app, incluso il
 *   supporto a stampanti reali via Wi-Fi Direct/Cloud Print del
 *   dispositivo, cosa che un semplice window.print() in una WebView non
 *   incorporata non avrebbe comunque garantito.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new AndroidDownloadBridge(this), "AndroidDownload");
        webView.addJavascriptInterface(new AndroidPrintBridge(this), "AndroidPrint");
    }

    public static class AndroidDownloadBridge {
        private final MainActivity activity;

        AndroidDownloadBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void saveFile(String base64Data, String filename, String mimeType) {
            activity.runOnUiThread(() -> {
                try {
                    File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir != null && !dir.exists()) {
                        dir.mkdirs();
                    }
                    File file = new File(dir, filename);
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                    try (FileOutputStream fos = new FileOutputStream(file)) {
                        fos.write(bytes);
                    }
                    Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, mimeType);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try {
                        activity.startActivity(Intent.createChooser(intent, filename));
                    } catch (ActivityNotFoundException e) {
                        // Nessuna app sa aprire questo tipo di file (es. un .xml
                        // su un telefono senza lettori XML installati): il file
                        // resta comunque salvato, avvisa solo dov'è finito.
                        Toast.makeText(activity, "File salvato: " + filename, Toast.LENGTH_LONG).show();
                    }
                } catch (IOException e) {
                    Toast.makeText(activity, "Errore nel salvataggio del file: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    public static class AndroidPrintBridge {
        private final MainActivity activity;
        // Riferimento forte tenuto in vita finché dura la stampa: il job
        // di PrintManager legge le pagine da questa WebView in modo
        // asincrono (ben oltre il ritorno di printHtml()) — senza questo
        // campo la WebView "usa e getta" rischierebbe la garbage
        // collection a metà stampa.
        private WebView printWebView;

        AndroidPrintBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void printHtml(String html, String jobName) {
            activity.runOnUiThread(() -> {
                printWebView = new WebView(activity);
                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                        if (printManager != null) {
                            String safeJobName = (jobName == null || jobName.trim().isEmpty()) ? "Documento" : jobName;
                            printManager.print(safeJobName, view.createPrintDocumentAdapter(safeJobName), new PrintAttributes.Builder().build());
                        }
                    }
                });
                printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            });
        }
    }
}
