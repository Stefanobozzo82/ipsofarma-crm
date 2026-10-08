; Script per Inno Setup (https://jrsoftware.org/isinfo.php)
; Genera un installer "Setup.exe" per la Webcam Virtuale Ipsofarma.
;
; Come si usa:
; 1. Esegui prima build_exe.bat per creare dist\virtual_webcam.exe
; 2. Installa Inno Setup (gratuito): https://jrsoftware.org/isdl.php
; 3. Apri questo file con Inno Setup Compiler e premi "Compile" (F9)
; 4. Il file Output\IpsofarmaWebcamVirtuale-Setup.exe e' l'installer pronto
;    da distribuire e da eseguire su qualunque PC Windows.

#define MyAppName "Webcam Virtuale Ipsofarma"
#define MyAppVersion "1.0"
#define MyAppExeName "virtual_webcam.exe"

[Setup]
AppId={{6F1B9C2E-6E3B-4B7B-9E63-9C7C2F0F6A11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\IpsofarmaWebcamVirtuale
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=IpsofarmaWebcamVirtuale-Setup
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Files]
Source: "dist\virtual_webcam.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Leggimi"; Filename: "{app}\README.md"
Name: "{group}\Disinstalla {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crea un'icona sul Desktop"; GroupDescription: "Icone aggiuntive:"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Avvia subito {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Messages]
FinishedLabel=Installazione completata.%n%nIMPORTANTE: prima di usare il programma installa anche OBS Studio (serve solo il suo driver di webcam virtuale, non va aperto): https://obsproject.com/it/download
