; Ludiary installer (ADR 45, 90): per-user, no administrator, %LOCALAPPDATA%\Programs\Ludiary.
; Layout: Ludiary.exe (stable launcher, Go) + app-<version>\ (the program) + versions.json (written by the launcher, never here).
; Compile with apps/desktop/scripts/build-installer.mjs (passes AppVersion, AppFolderVersion, SourceDir, OutputDir).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef AppFolderVersion
  #define AppFolderVersion AppVersion
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
; ADR 90 point 18, A3: the stable launcher waits for this mutex to disappear (it means "the installer is still working").
; W4: the name and its visibility to OpenMutex from another process are to be confirmed on a real install (see the ADR).
SetupMutex=Ludiary-Setup

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

#include "messages.iss"

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; Flags: unchecked

[Files]
; The stable launcher: the shortcut and the uninstaller open it. The program itself goes in its own versioned folder.
Source: "{#SourceDir}\Ludiary.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\app-{#AppFolderVersion}\*"; DestDir: "{app}\app-{#AppFolderVersion}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; Installations from before ADR 90 had everything flat next to Ludiary.exe (which was the program itself, now replaced by the launcher).
Type: filesandordirs; Name: "{app}\native"
Type: filesandordirs; Name: "{app}\web"
Type: filesandordirs; Name: "{app}\bin"
Type: filesandordirs; Name: "{app}\licenses"
Type: files; Name: "{app}\version.txt"
; Reinstalling the same version: the folder is complete again only when the marker is written, as the last file.
Type: files; Name: "{app}\app-{#AppFolderVersion}\.complete"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\app-*"
Type: files; Name: "{app}\versions.json"
Type: files; Name: "{app}\versions.json.tmp"

[Icons]
Name: "{autoprograms}\Ludiary"; Filename: "{app}\Ludiary.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Ludiary"; Filename: "{app}\Ludiary.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; The launcher makes the new folder the active one and starts the trial (ADR 90 point 18, M2/M8). nowait: it waits for
; this installer to leave (SetupMutex), so waiting for it here would be a deadlock. By hand it does not open the browser:
; the optional entry below does, if the user leaves it ticked. That entry runs after the Finish click, while Setup may still hold
; its mutex: the launcher it starts waits for the commit and its trial (it holds apply.lock), then opens the new version.
Filename: "{app}\Ludiary.exe"; Parameters: "--commit-update {#AppFolderVersion}"; Flags: nowait runhidden; Check: IsUpdate
Filename: "{app}\Ludiary.exe"; Parameters: "--commit-update {#AppFolderVersion} --no-open"; Flags: nowait runhidden; Check: not IsUpdate
Filename: "{app}\Ludiary.exe"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent; Check: not IsUpdate

[Code]
var
  PurgeData: Boolean;

{ /UPDATE=1: started by the stable launcher after an update was downloaded and verified (ADR 90). }
function IsUpdate(): Boolean;
begin
  Result := ExpandConstant('{param:UPDATE|0}') = '1';
end;

{ The folder app-<version> counts as complete when this marker exists; it is the very last file written (M2). }
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    SaveStringToFile(ExpandConstant('{app}\app-{#AppFolderVersion}\.complete'), '', False);
end;

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
