; Instalador do ECHOO (Inno Setup 6). Compile com:  ISCC.exe /DAppVersion=1.4.0 ECHOO.iss
; Antes, gere o app:  npx electron-builder --win dir   (cria dist\win-unpacked)
#define AppName "ECHOO"
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{7A1D9C3E-4B52-4E8F-A6D0-3C9E5F21B874}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=ECHOO
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist-installer
OutputBaseFilename=ECHOO-Setup
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\ECHOO.exe
UninstallDisplayName={#AppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
VersionInfoVersion={#AppVersion}
VersionInfoCompany=ECHOO
VersionInfoProductName={#AppName}
VersionInfoDescription=Instalador do {#AppName}
VersionInfoCopyright=Copyright (C) ECHOO

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"

[Files]
Source: "..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\ECHOO.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\ECHOO.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ECHOO.exe"; Description: "Abrir o ECHOO"; Flags: nowait postinstall skipifsilent
