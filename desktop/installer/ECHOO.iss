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

[Code]
// Migração: se existir a versão antiga (instalador NSIS), remove antes de instalar esta.
// Os dados do usuário ficam no servidor, então nada é perdido.
procedure RemoveOldNsisInstall();
var
  Names: TArrayOfString;
  I, P, Rc: Integer;
  Key, DName, Cmd, Exe: String;
begin
  if not RegGetSubkeyNames(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Uninstall', Names) then
    Exit;
  for I := 0 to GetArrayLength(Names) - 1 do
  begin
    Key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + Names[I];
    if RegQueryStringValue(HKCU, Key, 'DisplayName', DName) and (DName = 'ECHOO') and
       RegQueryStringValue(HKCU, Key, 'UninstallString', Cmd) and (Pos('Uninstall ECHOO.exe', Cmd) > 0) then
    begin
      Exe := Cmd;
      if (Length(Exe) > 0) and (Exe[1] = '"') then
      begin
        Delete(Exe, 1, 1);
        P := Pos('"', Exe);
        if P > 0 then
          Exe := Copy(Exe, 1, P - 1);
      end;
      if FileExists(Exe) then
      begin
        Exec(Exe, '/currentuser /S _?=' + ExtractFileDir(Exe), '', SW_HIDE, ewWaitUntilTerminated, Rc);
        DeleteFile(Exe);
      end;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    RemoveOldNsisInstall();
end;
