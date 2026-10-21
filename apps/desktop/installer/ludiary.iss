; Ludiary installer (ADR 45): per-user, no administrator, %LOCALAPPDATA%\Programs\Ludiary.
; Compile with apps/desktop/scripts/build-installer.mjs (passes AppVersion, SourceDir, OutputDir).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #error SourceDir must point to apps/desktop/dist/app
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

[Setup]
; Fixed GUID: identifies the app for upgrades and uninstall. Do not change.
AppId={{B8F3C1D2-6E0A-4B7C-9D55-1A2C7E4F9A31}
AppName=Ludiary
AppVersion={#AppVersion}
AppPublisher=Ludiary
DefaultDirName={localappdata}\Programs\Ludiary
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=Ludiary-Setup-{#AppVersion}
SetupIconFile={#SourceDir}\..\..\assets\ludiary.ico
UninstallDisplayIcon={app}\Ludiary.exe
UninstallDisplayName=Ludiary
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; The running server is stopped in [Code]; do not rely on the Restart Manager for a hidden background app.
CloseApplications=no
RestartApplications=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

#include "messages.iss"

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\Ludiary.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\version.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\native\*"; DestDir: "{app}\native"; Flags: ignoreversion
Source: "{#SourceDir}\bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "{#SourceDir}\licenses\*"; DestDir: "{app}\licenses"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Ludiary"; Filename: "{app}\Ludiary.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Ludiary"; Filename: "{app}\Ludiary.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Ludiary.exe"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent

[Code]
var
  PurgeData: Boolean;

{ Returns the exit code of Ludiary.exe, or 0 when it is not installed yet. }
function RunLudiary(const Params: String): Integer;
var
  ResultCode: Integer;
  Exe: String;
begin
  Result := 0;
  Exe := ExpandConstant('{app}\Ludiary.exe');
  if FileExists(Exe) then
    if Exec(Exe, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      Result := ResultCode
    else
      Result := -1;
end;

{ Upgrade: stop the background server before replacing its files. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if RunLudiary('--stop') <> 0 then
    Result := ExpandConstant('{cm:StopFailed}');
end;

{ Stopping destroys nothing, so it can happen before Inno's own confirmation; a server that will not stop aborts the uninstall. }
function InitializeUninstall(): Boolean;
begin
  Result := RunLudiary('--stop') = 0;
  if not Result then
    SuppressibleMsgBox(ExpandConstant('{cm:StopFailed}'), mbError, MB_OK, IDOK);
end;

{ Runs after the user confirmed the uninstall: nothing is deleted if they cancel at Inno's own prompt. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    { Silent uninstalls keep the data unless /PURGEDATA=1 is given. }
    PurgeData := ExpandConstant('{param:PURGEDATA|0}') = '1';
    if (not PurgeData) and (not UninstallSilent) then
      PurgeData := MsgBox(ExpandConstant('{cm:AskRemoveData}'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
    { Ludiary.exe still exists at this step: it removes its own credentials. }
    if PurgeData then
      RunLudiary('--purge');
  end
  else if (CurUninstallStep = usPostUninstall) and PurgeData then
    DelTree(ExpandConstant('{localappdata}\Ludiary'), True, True, True);
end;
