# Ricompilare IpsofarmaScanAgent.exe

Il file distribuito (`windows-agent/dist/IpsofarmaScanAgent.exe`) è generato
dal progetto `windows-agent/ScanAgentApp/`. Serve ricompilarlo solo se si
cambia il codice (es. `$ALLOWED_ORIGIN`/porta, o una correzione) — per
installarlo su un PC cliente basta il file `.exe` già pronto, non serve
nessun passaggio di questa pagina.

Richiede il [.NET SDK 8](https://dotnet.microsoft.com/download/dotnet/8.0)
(si può compilare anche da Linux/Mac: il risultato è comunque un `.exe`
per Windows, grazie a `-r win-x64`).

```
cd windows-agent/ScanAgentApp
dotnet publish -c Release
cp bin/Release/net8.0/win-x64/publish/IpsofarmaScanAgent.exe ../dist/
```

Un solo file risultante, autosufficiente (include il runtime .NET —
niente da installare a parte sul PC del cliente).
